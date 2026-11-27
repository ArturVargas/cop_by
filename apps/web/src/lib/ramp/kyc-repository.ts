import type { RampDatabase } from "./repository";
import { RampError } from "./errors";
export type KycBinding = { customerId:string; identityHash:string; walletHash:string; requestHash:string; encryptedWallet:string; providerProfileId:string|null };
export interface KycRepository { reserve(binding:KycBinding):Promise<KycBinding>; get(customer:string):Promise<KycBinding|null>; attach(customer:string,id:string):Promise<void> }
export class D1KycRepository implements KycRepository {
  constructor(private readonly db:RampDatabase) {}
  async get(customer:string):Promise<KycBinding|null> {
    const row=await this.db.prepare("SELECT * FROM ramp_kyc_profiles WHERE customer_id=?1").bind(customer).first();
    return row ? {customerId:String(row.customer_id),identityHash:String(row.identity_hash),walletHash:String(row.wallet_hash),requestHash:String(row.request_hash),encryptedWallet:String(row.encrypted_wallet),providerProfileId:row.provider_profile_id===null?null:String(row.provider_profile_id)} : null;
  }
  async reserve(binding:KycBinding) {
    try {await this.db.prepare(`INSERT INTO ramp_kyc_profiles (customer_id,identity_hash,wallet_hash,request_hash,encrypted_wallet,created_at)
      VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT (customer_id) DO NOTHING`).bind(binding.customerId,binding.identityHash,binding.walletHash,binding.requestHash,binding.encryptedWallet,new Date().toISOString()).run();}
    catch(error){if(error instanceof Error&&/UNIQUE constraint failed/i.test(error.message))throw new RampError("KYC_IDENTITY_IN_USE","La identidad o wallet ya está vinculada a otro perfil.",409);throw error;}
    const stored=await this.get(binding.customerId);if(!stored)throw new Error("Missing KYC reservation");return stored;
  }
  async attach(customer:string,id:string) {
    try {const row=await this.db.prepare(`UPDATE ramp_kyc_profiles SET provider_profile_id=?1 WHERE customer_id=?2
      AND (provider_profile_id IS NULL OR provider_profile_id=?1) RETURNING customer_id`).bind(id,customer).first();
      if(!row)throw new RampError("KYC_PROFILE_CONFLICT","El perfil KYC no coincide con el usuario registrado.",409);
    }catch(error){if(error instanceof Error&&/UNIQUE constraint failed/i.test(error.message))throw new RampError("KYC_PROFILE_CONFLICT","El perfil KYC ya está vinculado a otro usuario.",409);throw error;}
  }
}
