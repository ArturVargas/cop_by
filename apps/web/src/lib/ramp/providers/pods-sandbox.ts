import { getAddress } from "viem";
import { amountToUnits, unitsToAmount } from "../domain";
import { RampError } from "../errors";
import { PodsClient, type PodsClientConfig, invalidPods, podsObject, podsText } from "./pods-client";
export const PBRL_TOKEN="0x9762f60740142cf11c0f32c6e24cd3e86016c0f2";
export type SandboxQuote={id:string;direction:"onramp"|"offramp";wallet:string;amountBrl:string;rawInput:string;expiresAt:string|null};
export type SandboxStatus={quoteId:string;status:string;destinationTxHash?:string;failureCode?:string};
/** Test-only corridor. Never represented as USDC, Stellar Testnet, or a real PIX payout. */
export class PodsSandboxClient {
  readonly client:PodsClient;
  private ready=false;
  constructor(config:PodsClientConfig&{enabled:boolean}) {
    if(!config.enabled||!config.baseUrl||!config.apiKey)throw new RampError("SANDBOX_NOT_CONFIGURED","Configura explícitamente el entorno sandbox, su URL y la API key.",503);
    this.client=new PodsClient(config);
  }
  async preflight():Promise<void> {
    this.ready=false;
    try {await this.client.request("/v2/swap/status/sandbox/confirmed",{body:{}});}
    catch(error){if(error instanceof RampError&&error.code==="PODS_VALIDATION_ERROR"){this.ready=true;return;}throw new RampError("SANDBOX_UNAVAILABLE","La URL/key no expone el sandbox de Pods. Solicita su habilitación o la URL de staging.",503);}
    throw new RampError("SANDBOX_INVALID_PREFLIGHT","Pods aceptó una confirmación sin quoteId; detén las pruebas y revisa el entorno.",502);
  }
  private assertReady(){if(!this.ready)throw new RampError("SANDBOX_NOT_VERIFIED","Comprueba primero la disponibilidad del sandbox.",503);}
  async createKyc(applicant:{cpf:string;email:string;walletAddress:string}){this.assertReady();return this.client.request("/api/v1/kyc/hosted/sessions",{body:applicant});}
  async kycStatus(id:string){this.assertReady();return this.client.request("/api/v1/kyc/status",{parameters:{kycUserId:id}});}
  async simulateKyc(id:string,status:"provider_pending"|"approved"|"rejected"|"rejected_retryable"){this.assertReady();return this.client.request(`/api/v1/kyc/status/sandbox/${status}`,{body:{kycUserId:id}});}
  async resetKyc(id:string){this.assertReady();return this.client.request("/api/v1/kyc/hosted/reset",{body:{kycUserId:id}});}
  async quote(direction:"onramp"|"offramp",source:string,amountBrl:string,pixKey?:string):Promise<SandboxQuote> {
    this.assertReady();let wallet:string;try{wallet=getAddress(source);}catch{throw new RampError("INVALID_ADDRESS","El sandbox pBRL requiere una wallet EVM de prueba.");}
    const cents=amountToUnits(amountBrl,2);if(cents<1n||cents>100000n)throw new RampError("INVALID_SANDBOX_AMOUNT","El sandbox admite de 0.01 a 1000 BRL.");
    if(direction==="offramp"&&(!pixKey?.trim()||pixKey.length>2048))throw new RampError("INVALID_PIX_KEY","Indica una llave PIX de prueba.");
    const rawInput=direction==="onramp"?cents.toString():(cents*10n**16n).toString();
    const parameters={originChain:direction==="onramp"?"fiat":"base-sepolia",destinationChain:direction==="onramp"?"base-sepolia":"fiat",tokenIn:direction==="onramp"?"BRL":PBRL_TOKEN,tokenOut:direction==="onramp"?PBRL_TOKEN:"BRL",amountIn:rawInput,...(direction==="onramp"?{destinationAddress:wallet}:{originAddress:wallet,pixKey:pixKey!.trim()})};
    const body=await this.client.request("/v2/swap/quote",{parameters}),q=podsObject(body.quote),id=podsText(q.quoteId);
    if(q.id!==undefined&&q.id!==id)return invalidPods();
    const result:SandboxQuote={id,direction,wallet,amountBrl:unitsToAmount(cents,2),rawInput,expiresAt:typeof q.deadlineDate==="string"?q.deadlineDate:null};
    this.validatePair(q,result);
    if(result.expiresAt&&(!Number.isFinite(Date.parse(result.expiresAt))||Date.parse(result.expiresAt)<=Date.now()||Date.parse(result.expiresAt)>Date.now()+960000))return invalidPods();
    return result;
  }
  private validatePair(body:Record<string,unknown>,quote:SandboxQuote) {
    const input=podsObject(body.tokenIn),output=podsObject(body.tokenOut),onramp=quote.direction==="onramp";
    if(body.originChain!==(onramp?"fiat":"base-sepolia")||body.destinationChain!==(onramp?"base-sepolia":"fiat")||input.decimals!==(onramp?2:18)||output.decimals!==(onramp?18:2)||String(input.contract).toLowerCase()!==(onramp?"brl":PBRL_TOKEN)||String(output.contract).toLowerCase()!==(onramp?PBRL_TOKEN:"brl")||String(input.amount)!==quote.rawInput)return invalidPods();
    const expected=onramp?(amountToUnits(quote.amountBrl,2)*10n**16n).toString():amountToUnits(quote.amountBrl,2).toString();
    if(String(output.expectedAmountOut??output.amount)!==expected)return invalidPods();
    const address=body[onramp?"destinationAddress":"originAddress"];
    if(address!==undefined&&String(address).toLowerCase()!==quote.wallet.toLowerCase())return invalidPods();
  }
  async status(quote:SandboxQuote):Promise<SandboxStatus> {
    this.assertReady();const body=await this.client.request(`/v2/swap/status/${encodeURIComponent(quote.id)}`);if(body.quoteId!==quote.id)return invalidPods();this.validatePair(body,quote);
    const status=podsText(body.status);if(!["pending","confirmed","processing","fulfilled","refunded","failed","expired"].includes(status))return invalidPods();
    const failure=body.failure?podsObject(body.failure):null;
    if(body.destinationTxHash!==undefined&&(typeof body.destinationTxHash!=="string"||!/^0x[\da-f]{64}$/i.test(body.destinationTxHash)))return invalidPods();
    return {quoteId:quote.id,status,...(typeof body.destinationTxHash==="string"?{destinationTxHash:body.destinationTxHash}:{}),...(typeof failure?.code==="string"&&/^[A-Z0-9_]{1,80}$/.test(failure.code)?{failureCode:failure.code}:{})};
  }
  async confirm(quote:SandboxQuote,kycUserId?:string|null){this.assertReady();return this.client.request("/v2/swap/status/sandbox/confirmed",{body:{quoteId:quote.id,...(kycUserId!==undefined?{kycUserId}:{})}});}
  async fail(quote:SandboxQuote,failureCode:"PROVIDER_REJECTED"|"THIRD_PARTY_PAYOUT"|"KYC_REJECTED"|"AMOUNT_MISMATCH"){this.assertReady();if(quote.direction!=="offramp")throw new RampError("INVALID_SANDBOX_DIRECTION","La simulación de fallo requiere una cotización de salida.");return this.client.request("/v2/swap/status/sandbox/confirmed-to-failed",{body:{quoteId:quote.id,failureCode}});}
}
