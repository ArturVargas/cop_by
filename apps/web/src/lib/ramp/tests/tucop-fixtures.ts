import { Account,MuxedAccount } from "@stellar/stellar-sdk";
import { STELLAR_USDC_TESTNET } from "@/lib/cavos-config";
import { RampCodec } from "../codec";
import { TucopClient } from "../tucop/client";
import { TucopDestinations,parseDestinationInput } from "../tucop/destinations";
import type { DestinationStore,OwnedDestination,TucopDestination } from "../tucop/destination-store";
import { TucopRampProvider } from "../providers/tucop";
import { address,otherAddress,now } from "./fixtures";
import type { TucopQuoteRequest } from "../types";
export const externalDestination="dst_"+"0".repeat(25)+"d",externalQuote="qte_"+"0".repeat(25)+"q",externalPayment="op_"+"0".repeat(25)+"p";
export class MemoryDestinations implements DestinationStore {
 rows=new Map<string,OwnedDestination>();counter=0;
 async get(customer:string,id:string){const v=this.rows.get(id);return v?.customerId===customer?structuredClone(v):null;}
 async put(customer:string,snapshot:TucopDestination){const old=[...this.rows.values()].find(v=>v.customerId===customer&&v.snapshot.externalId===snapshot.externalId);if(old)return structuredClone(old);const v:OwnedDestination={id:`00000000-0000-4000-8000-${String(++this.counter).padStart(12,"0")}`,customerId:customer,version:0,confirmedHash:null,snapshot};this.rows.set(v.id,structuredClone(v));return v;}
 async save(v:OwnedDestination,version:number){if(this.rows.get(v.id)?.version!==version)return false;this.rows.set(v.id,structuredClone(v));return true;}
}
export async function tucopFixture(nowOverride?:number){
 const clock=nowOverride??now;
 const calls:{path:string;method:string;key:string|null;body:Record<string,unknown>|null}[]=[];let paymentAmount="5.00",revision=0,creations=0;const paymentKeys=new Set<string>();
 let destination:Record<string,unknown>={id:externalDestination,ownership:"third_party",rail:"pix",currency:"BRL",status:"verified",active:true,confirmed_at:new Date(clock).toISOString(),holder:{name:"Test Recipient",bank:"Test Bank",document_last4:"4725"},key_masked:"***test"};
 function payment(){return {id:externalPayment,product:"pay",status:"awaiting_funds",currency:"BRL",quote_id:externalQuote,destination_id:externalDestination,destination_amount:{amount:"250.00",asset:"BRL"},source_amount:{amount:"5.00",asset:"USDC"},fees:{tucop:{amount:"0.05",asset:"USDC"},consumer:{amount:"0.025000",asset:"USDC"}},total_amount:{amount:"5.025000",asset:"USDC"},source_chain:"stellar",deposit:{address:otherAddress,memo:"123456789",memoless_address:new MuxedAccount(new Account(otherAddress,"0"),"123456789").accountId(),chain:"stellar:testnet",asset:"USDC",asset_issuer:STELLAR_USDC_TESTNET.issuer,token_contract:null,amount:{amount:paymentAmount,asset:"USDC"}},return_address:address,return_memo:"copby-return",created_at:new Date(clock).toISOString(),updated_at:new Date(clock+revision).toISOString()};}
 let mutatePayment:(value:ReturnType<typeof payment>)=>unknown=v=>v;
 const fetcher:typeof fetch=async(input,init)=>{
  const path=new URL(String(input)).pathname,headers=new Headers(init?.headers),method=init?.method??"GET",key=headers.get("Idempotency-Key"),body=init?.body?JSON.parse(String(init.body)):null;
  if(headers.has("X-TuCOPRamp-Party-Session")||headers.has("X-TuCOPRamp-Version"))throw new Error("Unexpected session/version header");calls.push({path,method,key,body});
  if(path==="/consumer")return Response.json({consumer:{products:["pay"],source_chains:["stellar"],fiat_currencies:["BRL","COP","MXN"]},api_key:{environment:"sandbox"}});
  if(path==="/ramp/parties/me")return Response.json({party:{restricted:false,status:{kyc:"approved",tos:"accepted",endorsements:[{name:"cop",status:"approved"},{name:"pix_offramp",status:"approved"},{name:"spei",status:"approved"}]}}});
  if(path.includes("/ramp/destinations")){if(path.endsWith("/confirm"))destination={...destination,confirmed_at:new Date(clock+1).toISOString()};return Response.json(destination);}
  if(path==="/ramp/quotes")return Response.json({id:externalQuote,product:"pay",destination_id:externalDestination,destination_amount:{amount:"250.00",asset:"BRL"},source_amount:{amount:"5.00",asset:"USDC"},fees:{tucop:{amount:"0.05",asset:"USDC"},consumer:{amount:"0.025000",asset:"USDC"},fx_buffer:{amount:"0.05",asset:"USDC"}},total_amount:{amount:"5.025000",asset:"USDC"},consumer_fee_wallet:"0x4444444444444444444444444444444444444444",expires_at:new Date(clock+120000).toISOString(),settlement_time:{min_minutes:15,max_minutes:45}});
  if(path==="/ramp/payments"&&method==="POST"){if(!paymentKeys.has(key!)){paymentKeys.add(key!);creations++;}return Response.json(payment());}
  if(path.startsWith("/ramp/payments/"))return Response.json(mutatePayment(payment()));
  return Response.json({code:"not_found"},{status:404});
 };
 const codec=new RampCodec(Buffer.alloc(32,7).toString("base64")),store=new MemoryDestinations(),client=new TucopClient({apiKey:"tcr_test_sk_fixture",environment:"sandbox",enabled:true,fetcher,now:()=>clock});
 const destinations=new TucopDestinations(store,client,codec),registered=await destinations.register("alice","register-key",parseDestinationInput({currency:"BRL",key:"test@example.com",ownerName:"Test Recipient",documentNumber:"52998224725"}));
 const request:TucopQuoteRequest={provider:"tucop",network:"testnet",sourceAddress:address,amount:"250",currency:"BRL",destinationId:registered.id,returnMemo:"copby-return"};
 const provider=new TucopRampProvider({client,destinations,loadAccount:async()=>({trustsUsdc:true,balance:"100"})});
 return {calls,client,codec,store,destinations,registered,request,provider,creations:()=>creations,confirm:()=>destinations.confirm("alice",registered.id,destinations.view(registered).holderRevision,"confirm-key"),setAmount:(amount:string)=>{paymentAmount=amount;revision++;},setHolder:(name:string)=>{destination={...destination,holder:{name,bank:"Test Bank",document_last4:"4725"}};},mutatePayment:(mutate:typeof mutatePayment)=>{mutatePayment=mutate;}};
}
