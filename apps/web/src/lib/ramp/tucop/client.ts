import { readBytes } from "../body";
import { RampError } from "../errors";
import type { FiatCurrency } from "../types";
export type TucopConfig={apiKey?:string;environment:"sandbox"|"production";baseUrl?:string;enabled?:boolean;webhookSecret?:string;fetcher?:typeof fetch;now?:()=>number};
export function invalidTucop():never{throw new RampError("TUCOP_INVALID_RESPONSE","TuCOP respondió con datos distintos al contrato esperado.",502);}
export function tucopObject(v:unknown):Record<string,unknown>{if(!v||typeof v!=="object"||Array.isArray(v))return invalidTucop();return v as Record<string,unknown>;}
export function tucopText(v:unknown,max=256):string{if(typeof v!=="string"||!v||v.length>max)return invalidTucop();return v;}
export function tucopId(v:unknown,prefix:string):string{const s=tucopText(v,80);if(!new RegExp(`^${prefix}_[0-9a-hjkmnp-tv-z]{26}$`,"i").test(s))return invalidTucop();return s.toLowerCase();}
export class TucopClient {
  constructor(readonly config:TucopConfig){}
  configured(){return !!this.config.apiKey&&(this.config.environment==="sandbox"?this.config.apiKey.startsWith("tcr_test_"):this.config.apiKey.startsWith("tcr_live_"));}
  async request(path:string,options:{body?:unknown;idempotencyKey?:string;post?:boolean}={}):Promise<Record<string,unknown>>{
    if(!this.configured())throw new RampError("TUCOP_NOT_CONFIGURED","Configura una key TuCOP del entorno seleccionado.",503);
    if(!path.startsWith("/")||path.startsWith("//"))throw new Error("Invalid TuCOP path");
    const base=new URL(this.config.baseUrl??(this.config.environment==="sandbox"?"https://sandbox.api.ramp.tucop.xyz":"https://api.ramp.tucop.xyz"));
    if(base.protocol!=="https:"||base.username||base.password||base.search||base.hash)throw new RampError("TUCOP_INVALID_CONFIG","URL TuCOP no válida.",503);
    const post=options.post===true||options.body!==undefined;
    if(post&&(!options.idempotencyKey||!/^[-A-Za-z0-9_.:]{8,128}$/.test(options.idempotencyKey)))throw new Error("Missing TuCOP idempotency key");
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await (this.config.fetcher??fetch)(new URL(path,base),{method:post?"POST":"GET",headers:{"X-TuCOPRamp-Key":this.config.apiKey!,Accept:"application/json",...(post?{"Content-Type":"application/json","Idempotency-Key":options.idempotencyKey!}:{})},...(options.body!==undefined?{body:JSON.stringify(options.body)}:{}),cache:"no-store",redirect:"error",signal:controller.signal});
      let body:Record<string,unknown>;try{body=tucopObject(JSON.parse(new TextDecoder().decode(await readBytes(response,1048576))));}catch{return invalidTucop();}
      if(!response.ok){const code=typeof body.code==="string"&&/^[a-z0-9_]{1,80}$/.test(body.code)?body.code.toUpperCase():`HTTP_${response.status}`;throw new RampError(`TUCOP_${code}`,"TuCOP no pudo completar la solicitud.",response.status>=500?502:response.status,response.status===429||response.status>=500||body.code==="idempotency_in_progress");}
      return body;
    }catch(error){if(error instanceof RampError)throw error;throw new RampError(controller.signal.aborted?"TUCOP_TIMEOUT":"TUCOP_UNAVAILABLE","No pudimos consultar TuCOP. Consulta la misma operación antes de reintentar.",502,true);}finally{clearTimeout(timer);}
  }
  async account(currency:FiatCurrency="BRL"){
    const [identity,profile]=await Promise.all([this.request("/consumer"),this.request("/ramp/parties/me")]);
    const consumer=tucopObject(identity.consumer),party=tucopObject(profile.party??profile),status=tucopObject(party.status);
    const apiKey=identity.api_key==null?null:tucopObject(identity.api_key);
    const expected=this.config.environment==="sandbox"?["sandbox","test"]:["production","live"];
    if(!apiKey||!expected.includes(String(apiKey.environment)))throw new RampError("TUCOP_ENVIRONMENT_UNVERIFIED","No se pudo verificar el entorno de la key TuCOP.",503);
    const endorsement=currency==="COP"?"cop":currency==="BRL"?"pix_offramp":"spei";
    const endorsed=Array.isArray(status.endorsements)&&status.endorsements.some(v=>v&&typeof v==="object"&&(v as Record<string,unknown>).name===endorsement&&(v as Record<string,unknown>).status==="approved");
    if(status.kyc!=="approved"||status.tos!=="accepted"||party.restricted!==false||!endorsed)throw new RampError("TUCOP_ACCOUNT_NOT_READY","La cuenta empresarial TuCOP requiere verificación, términos y habilitación de la moneda.",409);
    if(Array.isArray(consumer.products)&&!consumer.products.includes("pay"))throw new RampError("TUCOP_PAY_NOT_ENABLED","TuCOP debe habilitar pay para el integrador.",403);
    if(Array.isArray(consumer.source_chains)&&!consumer.source_chains.includes("stellar"))throw new RampError("TUCOP_STELLAR_NOT_ENABLED","TuCOP debe habilitar Stellar para el integrador.",403);
    if(Array.isArray(consumer.fiat_currencies)&&!consumer.fiat_currencies.includes(currency))throw new RampError("TUCOP_CURRENCY_NOT_ENABLED","TuCOP debe habilitar la moneda para el integrador.",403);
    return {environment:this.config.environment,product:"pay" as const,currency,kyc:"approved",tos:"accepted",endorsement,restricted:false};
  }
}
