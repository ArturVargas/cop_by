import { createHash,createHmac,timingSafeEqual } from "node:crypto";
import { RampError } from "../errors";
import type { ProviderEvent } from "../types";
export function verifyTucopWebhook(raw:Uint8Array,headers:Headers,secret:string|undefined,now=Date.now()):ProviderEvent {
  if(!secret?.startsWith("whsec_"))throw new RampError("WEBHOOK_NOT_CONFIGURED","Configura el secreto de webhook TuCOP.",503);
  const id=headers.get("webhook-id")??"",timestamp=headers.get("webhook-timestamp")??"",signatures=headers.get("webhook-signature")??"";
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(id)||!/^\d{1,12}$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300)throw new RampError("INVALID_WEBHOOK","Firma de webhook no válida.",401);
  const key=Buffer.from(secret.slice(6),"base64");if(key.length<16)throw new RampError("WEBHOOK_NOT_CONFIGURED","El secreto TuCOP no es válido.",503);
  const expected=createHmac("sha256",key).update(`${id}.${timestamp}.`).update(raw).digest();
  if(!signatures.split(/\s+/).some(v=>{if(!v.startsWith("v1,"))return false;const actual=Buffer.from(v.slice(3),"base64");return actual.length===expected.length&&timingSafeEqual(actual,expected);}))throw new RampError("INVALID_WEBHOOK","Firma de webhook no válida.",401);
  let envelope:Record<string,unknown>;try{envelope=JSON.parse(new TextDecoder().decode(raw));if(!envelope||typeof envelope!=="object"||Array.isArray(envelope))throw new Error();}catch{throw new RampError("INVALID_WEBHOOK_BODY","Webhook no válido.");}
  if(typeof envelope.id!=="string"||envelope.id.toLowerCase()!==id.toLowerCase())throw new RampError("INVALID_WEBHOOK_BODY","El identificador del webhook no coincide.");
  const data=envelope.data&&typeof envelope.data==="object"?envelope.data as Record<string,unknown>:null;
  const relevant=envelope.api_version==="2026-10-08"&&envelope.type==="operation.updated"&&data?.product==="pay"&&typeof data.operation_id==="string"&&/^op_[0-9a-hjkmnp-tv-z]{26}$/i.test(data.operation_id);
  return {id:id.toLowerCase(),digest:createHash("sha256").update(raw).digest("hex"),relevant,actionId:relevant?String(data!.operation_id).toLowerCase():null};
}
