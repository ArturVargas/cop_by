import { StrKey } from "@stellar/stellar-sdk";
import { getAddress } from "viem";
import type { RampCodec } from "./codec";
import { RampError } from "./errors";
import type { KycBinding, KycRepository } from "./kyc-repository";
import { PodsClient, invalidPods, podsObject, podsText } from "./providers/pods-client";

export type KycApplicant = {cpf:string;email:string;walletAddress:string};
const statuses=new Set(["created","provider_pending","approved","rejected","rejected_retryable","blocked"]);
function uuid(value:unknown):string {const id=podsText(value);if(!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id))return invalidPods();return id;}
export function normalizeKycWallet(value:unknown):string {
  if(typeof value!=="string"||value.length>128)throw new RampError("INVALID_ADDRESS","Wallet KYC no válida.");
  if(StrKey.isValidEd25519PublicKey(value))return value;
  if(/^0x[\da-f]{40}$/i.test(value)){try{return getAddress(value);}catch{throw new RampError("INVALID_ADDRESS","Wallet EVM no válida.");}}
  if(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
    const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";let n=0n;for(const c of value)n=n*58n+BigInt(alphabet.indexOf(c));
    const bytes=(n===0n?0:Math.ceil(n.toString(16).length/2))+(value.match(/^1*/)?.[0].length??0);if(bytes===32)return value;
  }
  throw new RampError("INVALID_ADDRESS","Se requiere una wallet KYC válida.");
}
export function parseKycApplicant(value:unknown):KycApplicant {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new RampError("INVALID_REQUEST","Se requieren datos de solicitante.");
  const b=value as Record<string,unknown>;
  if(Object.keys(b).some(k=>!["cpf","email","walletAddress"].includes(k)))throw new RampError("INVALID_REQUEST","La solicitud contiene campos no admitidos.");
  const cpf=typeof b.cpf==="string"&&/^[\d.\-]{11,14}$/.test(b.cpf)?b.cpf.replace(/[.\-]/g,""):"";
  if(!/^\d{11}$/.test(cpf)||/^(\d)\1+$/.test(cpf))throw new RampError("INVALID_CPF","CPF no válido.");
  for(const length of [9,10]){let sum=0;for(let i=0;i<length;i++)sum+=Number(cpf[i])*(length+1-i);if(((sum*10)%11)%10!==Number(cpf[length]))throw new RampError("INVALID_CPF","CPF no válido.");}
  if(typeof b.email!=="string"||b.email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(b.email))throw new RampError("INVALID_EMAIL","Correo no válido.");
  return {cpf,email:b.email,walletAddress:normalizeKycWallet(b.walletAddress)};
}
function normalizeSession(body:Record<string,unknown>, statusResponse=false) {
  const status=podsText(body.status);if(!statuses.has(status)||(statusResponse&&typeof body.brlaEnabled!=="boolean"))return invalidPods();
  let link:string|null=null,expires:string|null=null;
  if(["created","rejected_retryable"].includes(status)&&body.verificationLink!=null){link=podsText(body.verificationLink,8192);let url:URL;try{url=new URL(link);}catch{return invalidPods();}if(url.protocol!=="https:"||url.username||url.password)return invalidPods();expires=podsText(body.verificationLinkExpiresAt);if(!Number.isFinite(Date.parse(expires)))return invalidPods();}
  const reason=body.reason?podsObject(body.reason):null;
  return {kycUserId:uuid(body.kycUserId),status,brlaEnabled:body.brlaEnabled===true,requiresWebView:link!==null,verificationLink:link,verificationLinkExpiresAt:expires,
    ...(reason?{reason:{code:podsText(reason.code,80),retryable:reason.retryable===true,...(typeof reason.message==="string"?{message:podsText(reason.message,2048)}:{})}}:{})};
}
export function normalizeRampLimits(body:Record<string,unknown>) {
  if(body.provider===null)throw new RampError("NO_RAMP_PROVIDER","No hay un proveedor ramp habilitado para esta wallet.",422);
  const provider=podsText(body.provider,80),offramp=podsObject(body.offramp);
  if(body.currency!=="BRL"||typeof body.blocked!=="boolean"||body.availability==="unavailable")return invalidPods();
  const decimal=(v:unknown)=>{const s=podsText(v,64);if(!/^\d+(?:\.\d{1,18})?$/.test(s))return invalidPods();return s;};
  return {provider,currency:"BRL" as const,blocked:body.blocked,offramp:{remaining:decimal(offramp.remaining),remainingGlobalUsd:decimal(offramp.remainingGlobalUsd)}};
}
export class PodsKycService {
  constructor(private readonly repository:KycRepository,private readonly client:PodsClient,private readonly codec:RampCodec,private readonly config:{enabled:boolean;redirectUrl?:string;allowStellar?:boolean;sandbox?:boolean}) {}
  private enabled(){if(!this.config.enabled)throw new RampError("KYC_NOT_CONFIGURED","Habilita KYC hosted en el servidor y en la cuenta de Pods.",503);}
  private async binding(customer:string):Promise<KycBinding>{this.enabled();const binding=await this.repository.get(customer);if(!binding)throw new RampError("KYC_NOT_FOUND","Perfil KYC no encontrado.",404);return binding;}
  private wallet(binding:KycBinding):string {const {walletAddress}=this.codec.decrypt<{walletAddress:string}>(binding.encryptedWallet,binding.customerId,"pods-kyc-wallet-v1");if(this.codec.fingerprintParts("kyc-wallet",[walletAddress])!==binding.walletHash)throw new Error("KYC wallet integrity mismatch");return walletAddress;}
  private redirect(){const redirectUrl=this.config.redirectUrl;if(!redirectUrl)return {};let url:URL;try{url=new URL(redirectUrl);}catch{throw new RampError("INVALID_KYC_CONFIG","URL de retorno KYC no válida.",503);}if(url.protocol!=="https:"||url.username||url.password||url.hash)throw new RampError("INVALID_KYC_CONFIG","URL de retorno KYC no válida.",503);return {redirectUrl};}
  async session(customer:string,applicant:KycApplicant) {
    this.enabled();if(StrKey.isValidEd25519PublicKey(applicant.walletAddress)&&!this.config.allowStellar)throw new RampError("STELLAR_KYC_UNVERIFIED","Pods debe confirmar el soporte de cuentas Stellar para KYC hosted.",503);
    const expected:KycBinding={customerId:customer,identityHash:this.codec.fingerprintParts("kyc-identity",[applicant.cpf]),walletHash:this.codec.fingerprintParts("kyc-wallet",[applicant.walletAddress]),requestHash:this.codec.fingerprintParts("kyc-request",[applicant.cpf,applicant.email,applicant.walletAddress]),encryptedWallet:this.codec.encrypt({walletAddress:applicant.walletAddress},customer,"pods-kyc-wallet-v1"),providerProfileId:null};
    const binding=await this.repository.reserve(expected);
    if(binding.requestHash!==expected.requestHash)throw new RampError("KYC_REQUEST_CONFLICT","El usuario ya tiene otro solicitante o wallet vinculados.",409);
    const result=normalizeSession(await this.client.request("/api/v1/kyc/hosted/sessions",{body:{...applicant,externalUserId:customer,...this.redirect()}}));
    await this.repository.attach(customer,result.kycUserId);
    // CPF-idempotent sessions can reuse an older profile; verify its wallet before exposing the bearer link.
    await this.status(customer);
    return {...result,sandbox:this.config.sandbox===true};
  }
  async status(customer:string) {
    const binding=await this.binding(customer);if(!binding.providerProfileId)throw new RampError("KYC_SESSION_PENDING","Reintenta crear la sesión con los mismos datos del solicitante.",409,true);
    const body=await this.client.request("/api/v1/kyc/status",{parameters:{kycUserId:binding.providerProfileId}}),result=normalizeSession(body,true);
    if(result.kycUserId!==binding.providerProfileId)return invalidPods();
    const wallet=this.wallet(binding),wallets=[body.walletAddress,...(Array.isArray(body.walletAddresses)?body.walletAddresses:[])];
    if(!wallets.some(value=>{try{return normalizeKycWallet(value)===wallet;}catch{return false;}}))return invalidPods();
    return {...result,sandbox:this.config.sandbox===true};
  }
  async assertApproved(customer:string,id:string,wallet:string) {const binding=await this.binding(customer);if(binding.providerProfileId!==id||this.wallet(binding)!==normalizeKycWallet(wallet))throw new RampError("KYC_NOT_FOUND","Perfil KYC no encontrado para esta wallet.",404);const profile=await this.status(customer);if(profile.status!=="approved"||!profile.brlaEnabled)throw new RampError("KYC_REQUIRED","Se requiere KYC aprobado con PIX habilitado.",422);}
  async reset(customer:string) {const status=await this.status(customer);if(status.status!=="rejected_retryable")throw new RampError("KYC_RESET_NOT_ALLOWED","Este perfil no permite reiniciar la verificación.",409);const result=normalizeSession(await this.client.request("/api/v1/kyc/hosted/reset",{body:{kycUserId:status.kycUserId,...this.redirect()}}));if(result.kycUserId!==status.kycUserId)return invalidPods();return {...result,sandbox:this.config.sandbox===true};}
  async limits(customer:string) {const profile=await this.status(customer);if(profile.status!=="approved"||!profile.brlaEnabled)throw new RampError("KYC_REQUIRED","Se requiere KYC aprobado con PIX habilitado.",422);const binding=await this.binding(customer);return normalizeRampLimits(await this.client.request("/api/v1/limits",{parameters:{currency:"BRL",originAddress:this.wallet(binding)}}));}
}
