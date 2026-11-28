import { StrKey,MuxedAccount } from "@stellar/stellar-sdk";
import { STELLAR_USDC_MAINNET,STELLAR_USDC_TESTNET } from "@/lib/cavos-config";
import { amountToUnits,unitsToAmount } from "../domain";
import { RampError } from "../errors";
import type { ProviderContext,ProviderObservation,QuoteRequest,RampFee,RampProvider,RampQuote,RampState,TucopQuoteRequest } from "../types";
import { TucopClient,invalidTucop,tucopObject,tucopText,tucopId } from "../tucop/client";
import type { TucopDestinations } from "../tucop/destinations";
import { checkStellarAccount,type StellarAccountCheck } from "../tucop/stellar-account";
import { verifyTucopWebhook } from "../tucop/webhook";

type Options={client:TucopClient;destinations:TucopDestinations;loadAccount?:StellarAccountCheck};
function money(value:unknown,asset:string,decimals=7):string{const m=tucopObject(value);if(m.asset!==asset)return invalidTucop();const amount=tucopText(m.amount,48);try{return unitsToAmount(amountToUnits(amount,decimals),decimals);}catch{return invalidTucop();}}
function time(value:unknown):number {const ms=Date.parse(tucopText(value));if(!Number.isFinite(ms))return invalidTucop();return ms;}
const states:Record<string,RampState>={awaiting_funds:"awaiting_funding",processing:"processing",completed:"paid",failed:"failed",refunded:"refunded",canceled:"expired",creating:"needs_attention"};
export class TucopRampProvider implements RampProvider {
  readonly id="tucop" as const;
  constructor(private readonly options?:Options){}
  capability(){const available=!!this.options?.client.config.enabled&&this.options.client.configured();return {id:this.id,available,networks:[this.options?.client.config.environment==="production"?"mainnet" as const:"testnet" as const],...(available?{}:{reason:"TUCOP_PAY_NOT_CONFIGURED"})};}
  private request(request:QuoteRequest):TucopQuoteRequest{if(request.provider!=="tucop")throw new RampError("INVALID_PROVIDER","La solicitud no corresponde a TuCOP.");if(!this.capability().available)throw new RampError("TUCOP_NOT_CONFIGURED","Configura TuCOP pay y su key antes de continuar.",503);if(request.network!==(this.options!.client.config.environment==="production"?"mainnet":"testnet"))throw new RampError("UNSUPPORTED_NETWORK","El entorno TuCOP no coincide con la red Stellar.",422);return request;}
  private fees(body:Record<string,unknown>):RampFee[]{const fees=tucopObject(body.fees);return ["tucop","consumer","fx_buffer"].filter(k=>fees[k]!==undefined).map(kind=>({kind,label:kind==="tucop"?"TuCOP":kind==="consumer"?"COP By":"Margen de cambio",amount:money(fees[kind],"USDC"),currency:"USDC"}));}
  private totals(source:string,fees:RampFee[]){return unitsToAmount(amountToUnits(source,7)+amountToUnits(fees.find(f=>f.kind==="consumer")?.amount??"0",7),7);}
  async createQuote(input:QuoteRequest,context?:ProviderContext):Promise<RampQuote>{
    const request=this.request(input);if(!context)throw new Error("TuCOP quote requires an owned operation context");
    await this.options!.client.account(request.currency);
    const destination=await this.options!.destinations.requireConfirmed(context.customerId,request.destinationId,request.currency);
    const body=await this.options!.client.request("/ramp/quotes",{body:{product:"pay",destination_id:destination.externalId,destination_amount:{amount:request.amount,asset:request.currency}},idempotencyKey:context.idempotencyKey});
    if(body.product!=="pay"||tucopId(body.destination_id,"dst")!==destination.externalId||money(body.destination_amount,request.currency,2)!==request.amount)return invalidTucop();
    const source=money(body.source_amount,"USDC",2),fees=this.fees(body),total=this.totals(source,fees),expiry=time(body.expires_at),now=this.options!.client.config.now?.()??Date.now();
    if(amountToUnits(source,7)<=0n||expiry<=now||expiry>now+180000||money(body.total_amount,"USDC")!==total)return invalidTucop();
    const feeWallet=body.consumer_fee_wallet;
    if(amountToUnits(fees.find(f=>f.kind==="consumer")?.amount??"0",7)>0n&&(typeof feeWallet!=="string"||!/^0x[0-9a-f]{40}$/i.test(feeWallet)&&!StrKey.isValidEd25519PublicKey(feeWallet)))return invalidTucop();
    const settlement=body.settlement_time?tucopObject(body.settlement_time):null;
    if(settlement&&(!Number.isSafeInteger(settlement.min_minutes)||!Number.isSafeInteger(settlement.max_minutes)||Number(settlement.min_minutes)<0||Number(settlement.max_minutes)<Number(settlement.min_minutes)))return invalidTucop();
    return {providerQuoteId:tucopId(body.id,"qte"),providerDestinationId:destination.externalId,expiresAt:new Date(expiry).toISOString(),sourceAmount:source,totalAmount:total,destinationAmount:request.amount,destinationCurrency:request.currency,fees,recipientName:destination.holder?.name,funding:{kind:"unavailable",reason:"TUCOP_ACCEPT_TO_CREATE_PAYMENT"},...(typeof body.consumer_fee_wallet==="string"?{consumerFeeWallet:tucopText(body.consumer_fee_wallet,128)}:{}),...(settlement?{settlementTime:{minMinutes:Number(settlement.min_minutes),maxMinutes:Number(settlement.max_minutes)}}:{})};
  }
  private payment(body:Record<string,unknown>,request:TucopQuoteRequest,quote:RampQuote):RampQuote{
    const id=tucopId(body.id,"op"),status=tucopText(body.status),state=states[status];if(status==="creating")throw new RampError("TUCOP_PAYMENT_CREATING","TuCOP está preparando el mismo pago. Consulta de nuevo.",503,true);
    if(!state||quote.providerPaymentId&&id!==quote.providerPaymentId||body.product!=="pay"||body.source_chain!=="stellar"||body.currency!==request.currency)return invalidTucop();
    const fundable=status==="awaiting_funds";
    if((fundable||body.destination_id!=null)&&tucopId(body.destination_id,"dst")!==quote.providerDestinationId||(fundable||body.quote_id!=null)&&tucopId(body.quote_id,"qte")!==quote.providerQuoteId||(fundable||body.return_address!=null)&&body.return_address!==request.sourceAddress||(fundable||body.return_memo!=null)&&body.return_memo!==request.returnMemo||(fundable||body.destination_amount!=null)&&money(body.destination_amount,request.currency,2)!==quote.destinationAmount)return invalidTucop();
    const created=time(body.created_at),now=this.options!.client.config.now?.()??Date.now();if(created>now+60000||time(body.updated_at)<created)return invalidTucop();
    if(!fundable)return {...quote,providerPaymentId:id,providerActionId:id,paymentState:state,providerStatus:status,expiresAt:new Date(created+28*60000).toISOString(),funding:{kind:"unavailable",reason:"TUCOP_PAYMENT_NOT_FUNDABLE"}};
    const deposit=tucopObject(body.deposit),issuer=(request.network==="mainnet"?STELLAR_USDC_MAINNET:STELLAR_USDC_TESTNET).issuer;
    if(deposit.chain!==(request.network==="mainnet"?"stellar:pubnet":"stellar:testnet")||deposit.asset!=="USDC"||deposit.asset_issuer!==issuer||deposit.token_contract!==null||typeof deposit.address!=="string"||!StrKey.isValidEd25519PublicKey(deposit.address))return invalidTucop();
    const memo=tucopText(deposit.memo,28);if(!/^[\x20-\x7e]{1,28}$/.test(memo)||memo.trim()!==memo)return invalidTucop();
    const alternative=deposit.memoless_address;
    if(alternative!=null){if(typeof alternative!=="string"||!StrKey.isValidMed25519PublicKey(alternative)||!/^\d{1,20}$/.test(memo))return invalidTucop();const muxed=MuxedAccount.fromAddress(alternative,"0");if(muxed.baseAccount().accountId()!==deposit.address||BigInt(muxed.id())!==BigInt(memo))return invalidTucop();}
    const amount=money(deposit.amount,"USDC",2);if(amountToUnits(amount,7)<=0n)return invalidTucop();const fees=this.fees(body);const buffer=quote.fees.find(f=>f.kind==="fx_buffer");if(buffer&&!fees.some(f=>f.kind==="fx_buffer"))fees.push(buffer);
    return {...quote,providerPaymentId:id,providerActionId:id,paymentState:state,providerStatus:status,expiresAt:new Date(created+28*60000).toISOString(),sourceAmount:amount,totalAmount:this.totals(amount,fees),fees,
      funding:{kind:"stellar_payment",network:request.network,sourceAddress:request.sourceAddress,destination:deposit.address,memo,...(typeof alternative==="string"?{memolessDestination:alternative}:{}),amount,assetCode:"USDC",assetIssuer:issuer}};
  }
  async prepareFunding(input:QuoteRequest,quote:RampQuote,context:ProviderContext):Promise<RampQuote>{
    const request=this.request(input);const knownId=quote.providerPaymentId;
    if(!quote.providerPaymentId){await this.options!.client.account(request.currency);await this.options!.destinations.requireConfirmed(context.customerId,request.destinationId,request.currency);const account=await (this.options!.loadAccount??checkStellarAccount)(request.network,request.sourceAddress);if(!account.trustsUsdc)throw new RampError("STELLAR_ACCOUNT_NOT_READY","La cuenta de devolución debe existir y tener trustline USDC.",422);if(!context.recovery&&amountToUnits(account.balance,7)<amountToUnits(quote.totalAmount??quote.sourceAmount,7))throw new RampError("INSUFFICIENT_USDC","El saldo USDC no cubre el pago y la comisión.",422);
      const body=await this.options!.client.request("/ramp/payments",{body:{quote_id:quote.providerQuoteId,source_chain:"stellar",return_address:request.sourceAddress,return_memo:request.returnMemo},idempotencyKey:context.idempotencyKey});
      const id=tucopId(body.id,"op");await context.rememberPayment?.(id);quote={...quote,providerPaymentId:id,providerActionId:id};
    }
    let body=await this.options!.client.request(`/ramp/payments/${encodeURIComponent(quote.providerPaymentId!)}`);
    if(knownId&&body.status==="creating") {
      if(!context.mayRetryCreation)throw new RampError("ACCEPTANCE_REVIEW_REQUIRED","La creación requiere revisión antes de reintentar fuera de la ventana segura.",409);
      const resumed=await this.options!.client.request("/ramp/payments",{body:{quote_id:quote.providerQuoteId,source_chain:"stellar",return_address:request.sourceAddress,return_memo:request.returnMemo},idempotencyKey:context.idempotencyKey});
      if(tucopId(resumed.id,"op")!==knownId)return invalidTucop();
      body=await this.options!.client.request(`/ramp/payments/${encodeURIComponent(knownId)}`);
    }
    return this.payment(body,request,quote);
  }
  async getStatus(input:QuoteRequest,quote:RampQuote):Promise<ProviderObservation>{
    const request=this.request(input);if(!quote.providerPaymentId)throw new RampError("TUCOP_PAYMENT_NOT_CREATED","Acepta la cotización antes de consultar el pago.",409);
    const body=await this.options!.client.request(`/ramp/payments/${encodeURIComponent(quote.providerPaymentId)}`),latest=this.payment(body,request,quote);
    if(latest.providerPaymentId!==quote.providerPaymentId)return invalidTucop();const observedAt=time(body.updated_at),now=this.options!.client.config.now?.()??Date.now();if(observedAt>now+300000)return invalidTucop();
    return {state:latest.paymentState!,providerStatus:latest.providerStatus,observedAt,funding:latest.funding,sourceAmount:latest.sourceAmount,totalAmount:latest.totalAmount,fees:latest.fees,...(typeof body.error_code==="string"&&/^[a-z0-9_]{1,80}$/i.test(body.error_code)?{failureCode:body.error_code}:{})};
  }
  verifyWebhook(raw:Uint8Array,headers:Headers){return verifyTucopWebhook(raw,headers,this.options?.client.config.webhookSecret,this.options?.client.config.now?.()??Date.now());}
}
