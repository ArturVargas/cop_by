import { randomUUID } from "node:crypto";
import type { RampCodec } from "../codec";
import type { RampDatabase } from "../repository";
import type { FiatCurrency } from "../types";
export type TucopDestination={externalId:string;updatedAt?:number;currency:FiatCurrency;status:"pending"|"verified"|"rejected";active:boolean;confirmedAt:string|null;holder:{name:string;bank?:string;documentLast4?:string}|null;keyMasked?:string};
export type OwnedDestination={id:string;customerId:string;version:number;confirmedHash:string|null;snapshot:TucopDestination};
export interface DestinationStore {get(customer:string,id:string):Promise<OwnedDestination|null>;put(customer:string,snapshot:TucopDestination):Promise<OwnedDestination>;save(value:OwnedDestination,expected:number):Promise<boolean>}
export class D1DestinationStore implements DestinationStore {
  constructor(private readonly db:RampDatabase,private readonly codec:RampCodec){}
  private decode(row:Record<string,unknown>):OwnedDestination{const snapshot=this.codec.decrypt<TucopDestination>(String(row.encrypted_data),String(row.customer_id),String(row.id));if(snapshot.externalId!==row.external_id)throw new Error("Destination integrity mismatch");return {id:String(row.id),customerId:String(row.customer_id),version:Number(row.version),confirmedHash:row.confirmed_hash===null?null:String(row.confirmed_hash),snapshot};}
  async get(customer:string,id:string){const row=await this.db.prepare("SELECT * FROM ramp_tucop_destinations WHERE customer_id=?1 AND id=?2").bind(customer,id).first();return row?this.decode(row):null;}
  async put(customer:string,snapshot:TucopDestination){
    const old=await this.db.prepare("SELECT * FROM ramp_tucop_destinations WHERE customer_id=?1 AND external_id=?2").bind(customer,snapshot.externalId).first();
    if(old)return this.decode(old);
    const id=randomUUID();const row=await this.db.prepare(`INSERT INTO ramp_tucop_destinations (id,customer_id,external_id,version,encrypted_data)
      VALUES (?1,?2,?3,0,?4) ON CONFLICT (customer_id,external_id) DO NOTHING RETURNING *`).bind(id,customer,snapshot.externalId,this.codec.encrypt(snapshot,customer,id)).first();
    if(row)return this.decode(row);
    const existing=await this.db.prepare("SELECT * FROM ramp_tucop_destinations WHERE customer_id=?1 AND external_id=?2").bind(customer,snapshot.externalId).first();if(!existing)throw new Error("Missing destination reservation");return this.decode(existing);
  }
  async save(value:OwnedDestination,expected:number){const row=await this.db.prepare("UPDATE ramp_tucop_destinations SET version=?1,encrypted_data=?2,confirmed_hash=?3 WHERE id=?4 AND customer_id=?5 AND version=?6 RETURNING id").bind(value.version,this.codec.encrypt(value.snapshot,value.customerId,value.id),value.confirmedHash,value.id,value.customerId,expected).first();return row!==null;}
}
