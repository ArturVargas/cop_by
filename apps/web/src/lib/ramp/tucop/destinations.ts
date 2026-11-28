import type { RampCodec } from "../codec";
import { RampError } from "../errors";
import type { FiatCurrency } from "../types";
import { TucopClient,invalidTucop,tucopObject,tucopText,tucopId } from "./client";
import type { DestinationStore,OwnedDestination,TucopDestination } from "./destination-store";
export type DestinationInput={currency:"COP";key:string;ownerName?:string}|{currency:"BRL";key:string;ownerName:string;documentNumber:string};
export function parseDestinationInput(body:unknown):DestinationInput {
  if(!body||typeof body!=="object"||Array.isArray(body))throw new RampError("INVALID_DESTINATION","Se requiere un destino.");const b=body as Record<string,unknown>;
  if(Object.keys(b).some(k=>!["currency","key","ownerName","documentNumber"].includes(k))||b.currency!=="COP"&&b.currency!=="BRL")throw new RampError("INVALID_DESTINATION","TuCOP pay admite destinos Bre-B o PIX en esta integración.");
  if(typeof b.key!=="string"||!b.key.trim()||b.key.length>2048||/[\x00-\x1f\x7f]/.test(b.key))throw new RampError("INVALID_DESTINATION_KEY","Llave de destino no válida.");
  if(b.ownerName!==undefined&&(typeof b.ownerName!=="string"||b.ownerName.length>200||!/^\S+\s+\S/.test(b.ownerName.trim())||/[\x00-\x1f\x7f]/.test(b.ownerName)))throw new RampError("INVALID_OWNER_NAME","Indica el nombre completo del titular.");
  if(b.currency==="BRL"){if(typeof b.ownerName!=="string"||typeof b.documentNumber!=="string"||!/^\d{11}(?:\d{3})?$/.test(b.documentNumber))throw new RampError("INVALID_HOLDER_DOCUMENT","PIX requiere nombre y CPF o CNPJ del destinatario.");return {currency:"BRL",key:b.key.trim(),ownerName:b.ownerName.trim(),documentNumber:b.documentNumber};}
  if(b.documentNumber!==undefined)throw new RampError("INVALID_DESTINATION","Bre-B no admite documentNumber en esta solicitud.");return {currency:"COP",key:b.key.trim(),...(typeof b.ownerName==="string"?{ownerName:b.ownerName.trim()}:{})};
}
function normalize(body:Record<string,unknown>):TucopDestination{
  const externalId=tucopId(body.id,"dst"),rail=body.rail,currency=body.currency??(rail==="pix"?"BRL":rail==="spei"?"MXN":"COP");
  if(!["BRL","COP","MXN"].includes(String(currency))||!["pending","verified","rejected"].includes(String(body.status))||body.ownership!=="third_party"||typeof body.active!=="boolean")return invalidTucop();
  const h=body.holder==null?null:tucopObject(body.holder);const holder=h?{name:tucopText(h.name,256),...(typeof h.bank==="string"?{bank:tucopText(h.bank,256)}:{}),...(typeof h.document_last4==="string"?{documentLast4:tucopText(h.document_last4,8)}:{})}:null;
  const updatedAt=body.updated_at===undefined?undefined:Date.parse(tucopText(body.updated_at));if(updatedAt!==undefined&&!Number.isFinite(updatedAt))return invalidTucop();
  return {externalId,updatedAt,currency:currency as FiatCurrency,status:body.status as TucopDestination["status"],active:body.active,confirmedAt:typeof body.confirmed_at==="string"?body.confirmed_at:null,holder,...(typeof body.key_masked==="string"?{keyMasked:tucopText(body.key_masked,256)}:{})};
}
export class TucopDestinations {
  constructor(private readonly store:DestinationStore,private readonly client:TucopClient,private readonly codec:RampCodec){}
  private hash(d:TucopDestination){return this.codec.fingerprintParts("tucop-holder",[d.externalId,d.currency,d.holder?.name??null,d.holder?.bank??null,d.holder?.documentLast4??null]);}
  view(value:OwnedDestination){const d=value.snapshot;return {id:value.id,currency:d.currency,status:d.status,active:d.active,holder:d.holder,keyMasked:d.keyMasked,holderRevision:this.hash(d),confirmed:d.status==="verified"&&d.active&&!!d.confirmedAt&&value.confirmedHash===this.hash(d)};}
  async get(customer:string,id:string){const value=await this.store.get(customer,id);if(!value)throw new RampError("DESTINATION_NOT_FOUND","Destino no encontrado.",404);return value;}
  private enabled(){if(!this.client.config.enabled)throw new RampError("TUCOP_NOT_CONFIGURED","Habilita TuCOP pay antes de crear o confirmar destinos.",503);}
  async register(customer:string,key:string,input:DestinationInput){
    this.enabled();
    await this.client.account(input.currency);
    const body=input.currency==="BRL"?{ownership:"third_party",rail:"pix",pix_key:input.key,owner_name:input.ownerName,document_number:input.documentNumber}:{ownership:"third_party",bre_b_key:input.key,...(input.ownerName?{owner_name:input.ownerName}:{})};
    const snapshot=normalize(await this.client.request("/ramp/destinations",{body,idempotencyKey:this.codec.fingerprintParts("tucop-destination-create",[customer,key])}));
    if(snapshot.currency!==input.currency)return invalidTucop();const own=await this.store.put(customer,snapshot);return this.refresh(customer,own.id);
  }
  async refresh(customer:string,id:string):Promise<OwnedDestination>{
    for(let attempt=0;attempt<3;attempt++){
      const value=await this.get(customer,id),version=value.version;const latest=normalize(await this.client.request(`/ramp/destinations/${encodeURIComponent(value.snapshot.externalId)}`));
      if(latest.externalId!==value.snapshot.externalId||latest.currency!==value.snapshot.currency)return invalidTucop();
      if(latest.updatedAt!==undefined&&value.snapshot.updatedAt!==undefined&&latest.updatedAt<value.snapshot.updatedAt)throw new RampError("DESTINATION_STALE","TuCOP respondió con un destino anterior. Consulta de nuevo.",409,true);
      if(!latest.holder&&value.snapshot.holder)latest.holder=value.snapshot.holder;
      value.snapshot=latest;value.version++;if(await this.store.save(value,version))return value;
    }throw new RampError("DESTINATION_BUSY","El destino está actualizándose. Consulta de nuevo.",409,true);
  }
  async confirm(customer:string,id:string,revision:string,key:string){
    this.enabled();
    const value=await this.refresh(customer,id),version=value.version;
    if(!value.snapshot.active||value.snapshot.status!=="verified"||!value.snapshot.holder)throw new RampError("DESTINATION_NOT_VERIFIED","Espera la verificación del destinatario.",409);
    if(revision!==this.hash(value.snapshot))throw new RampError("HOLDER_CHANGED","Los datos del titular cambiaron. Revísalos antes de confirmar.",409);
    const latest=normalize(await this.client.request(`/ramp/destinations/${encodeURIComponent(value.snapshot.externalId)}/confirm`,{post:true,idempotencyKey:this.codec.fingerprintParts("tucop-destination-confirm",[customer,key])}));
    if(latest.externalId!==value.snapshot.externalId||this.hash(latest)!==revision||!latest.confirmedAt||latest.status!=="verified"||!latest.active)return invalidTucop();
    value.snapshot=latest;value.confirmedHash=revision;value.version++;if(!await this.store.save(value,version))throw new RampError("DESTINATION_BUSY","El titular cambió durante la confirmación. Revísalo de nuevo.",409,true);return value;
  }
  async requireConfirmed(customer:string,id:string,currency:FiatCurrency){const value=await this.refresh(customer,id);if(value.snapshot.currency!==currency||!this.view(value).confirmed)throw new RampError("DESTINATION_NOT_CONFIRMED","Confirma el titular del destino antes de cotizar.",409);return value.snapshot;}
}
