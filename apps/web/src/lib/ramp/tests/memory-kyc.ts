import type { KycBinding, KycRepository } from "../kyc-repository";

export class MemoryKyc implements KycRepository {
  rows=new Map<string,KycBinding>();
  async reserve(binding:KycBinding){const old=this.rows.get(binding.customerId);if(old)return old;for(const row of this.rows.values())if(row.identityHash===binding.identityHash||row.walletHash===binding.walletHash)throw new Error("Identity conflict");this.rows.set(binding.customerId,binding);return binding;}
  async get(customer:string){return this.rows.get(customer)??null;}
  async attach(customer:string,id:string){const row=this.rows.get(customer)!;if(row.providerProfileId&&row.providerProfileId!==id)throw new Error("Profile conflict");for(const r of this.rows.values())if(r.customerId!==customer&&r.providerProfileId===id)throw new Error("Profile conflict");row.providerProfileId=id;}
}
