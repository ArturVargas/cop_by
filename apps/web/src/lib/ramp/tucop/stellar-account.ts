import { STELLAR_USDC_MAINNET,STELLAR_USDC_TESTNET } from "@/lib/cavos-config";
import { readBytes } from "../body";
import { RampError } from "../errors";
import type { RampNetwork } from "../types";
export type StellarAccountCheck=(network:RampNetwork,address:string)=>Promise<{trustsUsdc:boolean;balance:string}>;
export const checkStellarAccount:StellarAccountCheck=async(network,address)=>{
  const issuer=(network==="mainnet"?STELLAR_USDC_MAINNET:STELLAR_USDC_TESTNET).issuer;
  const base=network==="mainnet"?"https://horizon.stellar.org":"https://horizon-testnet.stellar.org";
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try {const response=await fetch(`${base}/accounts/${encodeURIComponent(address)}`,{cache:"no-store",redirect:"error",signal:controller.signal});
    if(response.status===404)return {trustsUsdc:false,balance:"0"};if(!response.ok)throw new Error("Horizon unavailable");
    const body=JSON.parse(new TextDecoder().decode(await readBytes(response,1048576))) as {balances?:{asset_code?:string;asset_issuer?:string;balance?:string;is_authorized?:boolean}[]};
    const asset=body.balances?.find(v=>v.asset_code==="USDC"&&v.asset_issuer===issuer&&v.is_authorized!==false);
    return {trustsUsdc:!!asset,balance:asset?.balance??"0"};
  }catch{throw new RampError("STELLAR_ACCOUNT_UNAVAILABLE","No se pudo comprobar la cuenta Stellar. Consulta de nuevo.",502,true);}finally{clearTimeout(timer);}
};
