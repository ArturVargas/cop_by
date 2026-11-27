import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,"..");
const {buildSync}=createRequire(require.resolve("wrangler/package.json"))("esbuild");
const directory=mkdtempSync(join(tmpdir(),"copby-pods-sandbox-"));symlinkSync(join(root,"node_modules"),join(directory,"node_modules"),"dir");
const probe=process.argv.includes("--probe"),results=[];
const record=(scenario,result)=>{results.push({scenario,...result});console.log(JSON.stringify({scenario,...result}));};
function cpf(){let digits=Array.from({length:9},()=>randomInt(10));if(new Set(digits).size===1)digits[0]=(digits[0]+1)%10;for(const length of [9,10]){const sum=digits.reduce((n,d,i)=>n+d*(length+1-i),0);digits.push(((sum*10)%11)%10);}return digits.join("");}
try {
  buildSync({entryPoints:[join(root,"src/lib/ramp/providers/pods-sandbox.ts")],outfile:join(directory,"sandbox.cjs"),bundle:true,platform:"node",format:"cjs",packages:"external",alias:{"@":join(root,"src")},logLevel:"silent"});
  const {PodsSandboxClient,isSandboxKycLink}=require(join(directory,"sandbox.cjs"));
  const baseUrl=process.env.PODS_SANDBOX_API_BASE_URL??(probe?process.env.PODS_API_BASE_URL??"https://api.pods.finance":undefined);
  const sandbox=new PodsSandboxClient({enabled:probe||process.env.PODS_SANDBOX_ENABLED==="true",apiKey:process.env.PODS_API_KEY,baseUrl});
  await sandbox.preflight();record("sandbox_preflight",{status:"available",host:new URL(baseUrl).hostname});
  if(!probe){
    const wallet="0x"+randomBytes(20).toString("hex");let applicantNumber=0;
    const identity=()=>({cpf:cpf(),email:`copby-sandbox-${Date.now()}-${++applicantNumber}@example.com`,walletAddress:applicantNumber===1?wallet:"0x"+randomBytes(20).toString("hex")});
    const profile=await sandbox.createKyc(identity()),id=String(profile.kycUserId);
    assert.match(id,/^[\da-f-]{36}$/i);assert.equal(profile.status,"created");assert.ok(isSandboxKycLink(profile.verificationLink),"Expected the published reserved .invalid hosted link");
    for(let i=0;i<2;i++)assert.equal((await sandbox.kycStatus(id)).status,"created");
    await sandbox.simulateKyc(id,"provider_pending");assert.equal((await sandbox.kycStatus(id)).status,"provider_pending");
    await sandbox.simulateKyc(id,"approved");const approved=await sandbox.kycStatus(id);assert.equal(approved.status,"approved");assert.equal(approved.brlaEnabled,true);record("hosted_kyc_approved",{status:"passed",kycUserId:id});
    const rejected=await sandbox.createKyc(identity());await sandbox.simulateKyc(String(rejected.kycUserId),"provider_pending");await sandbox.simulateKyc(String(rejected.kycUserId),"rejected");assert.equal((await sandbox.kycStatus(String(rejected.kycUserId))).status,"rejected");record("hosted_kyc_rejected",{status:"passed"});
    const retry=await sandbox.createKyc(identity()),retryId=String(retry.kycUserId);await sandbox.simulateKyc(retryId,"provider_pending");await sandbox.simulateKyc(retryId,"rejected_retryable");assert.equal((await sandbox.kycStatus(retryId)).status,"rejected_retryable");await sandbox.resetKyc(retryId);await sandbox.simulateKyc(retryId,"provider_pending");await sandbox.simulateKyc(retryId,"approved");assert.equal((await sandbox.kycStatus(retryId)).brlaEnabled,true);record("hosted_kyc_retry",{status:"passed"});
    async function settled(quote,expected){for(let attempt=0;attempt<20;attempt++){const state=await sandbox.status(quote);if(["fulfilled","refunded","failed","expired"].includes(state.status)){assert.equal(state.status,expected);return state;}await new Promise(resolve=>setTimeout(resolve,3000));}throw new Error("Sandbox settlement timed out; inspect the existing quote before rerunning");}
    const onramp=await sandbox.quote("onramp",wallet,"1.00");assert.equal((await sandbox.status(onramp)).status,"pending");await sandbox.confirm(onramp,id);const minted=await settled(onramp,"fulfilled");assert.ok(minted.destinationTxHash);record("pbrl_mint",minted);
    await assert.rejects(()=>sandbox.confirm(onramp,id),error=>error?.code==="PODS_PAYMENT_STATE_CONFLICT");record("duplicate_confirmation",{status:"rejected_as_expected"});
    for(const code of ["PROVIDER_REJECTED","THIRD_PARTY_PAYOUT","KYC_REJECTED","AMOUNT_MISMATCH"]){const quote=await sandbox.quote("offramp",wallet,"0.01","sandbox@example.com");await sandbox.fail(quote,code);const failed=await settled(quote,"failed");assert.equal(failed.failureCode,code);record(`payout_failure_${code}`,failed);}
    const offramp=await sandbox.quote("offramp",wallet,"1.00","sandbox@example.com");await sandbox.confirm(offramp);const redeemed=await settled(offramp,"fulfilled");assert.ok(redeemed.destinationTxHash);record("pbrl_redeem",redeemed);
    const mismatch=await sandbox.quote("onramp",wallet,"1.00");await sandbox.confirm(mismatch,null);const refunded=await settled(mismatch,"refunded");assert.equal(refunded.failureCode,"THIRD_PARTY_PAYER");record("payer_mismatch_refund",refunded);
    record("complete",{status:"passed",network:"base-sepolia",realPix:false});
  }
} catch(error) {
  // Never print provider bodies, URLs, KYC bearer links, CPF, email, headers or API keys.
  record("stopped",{status:"not_completed",code:typeof error?.code==="string"?error.code:"TEST_FAILED"});
  process.exitCode=1;
} finally {rmSync(directory,{recursive:true,force:true});}
