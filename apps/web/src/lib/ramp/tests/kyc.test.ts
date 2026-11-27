import assert from "node:assert/strict";
import test from "node:test";
import { PodsKycService, parseKycApplicant } from "../kyc";
import { PodsClient } from "../providers/pods-client";
import { RampCodec } from "../codec";
import { MemoryKyc } from "./memory-kyc";
const applicant={cpf:"529.982.247-25",email:"test@example.com",walletAddress:"0x0000000000000000000000000000000000000001"};

function fixture(){const repo=new MemoryKyc();const calls:string[]=[];const client=new PodsClient({apiKey:"fake-key",fetcher:async(input,init)=>{const url=new URL(String(input));calls.push(url.pathname);if(url.pathname==="/api/v1/kyc/hosted/sessions"){const body=JSON.parse(String(init!.body));assert.equal(body.cpf,"52998224725");assert.equal(body.externalUserId,"alice");assert.equal(body.redirectUrl,undefined);return Response.json({kycUserId:"550e8400-e29b-41d4-a716-446655440000",status:"created",requiresWebView:true,verificationLink:"https://in.sumsub.com/websdk/example",verificationLinkExpiresAt:new Date(Date.now()+600000).toISOString()});}if(url.pathname.includes("/limits"))return Response.json({provider:"avenia",currency:"BRL",blocked:false,remaining:"wrong-deprecated-alias",offramp:{remaining:"5500",remainingGlobalUsd:"1100"}});return Response.json({kycUserId:"550e8400-e29b-41d4-a716-446655440000",status:"approved",brlaEnabled:true,walletAddress:applicant.walletAddress});}});const service=new PodsKycService(repo,client,new RampCodec(Buffer.alloc(32,7).toString("base64")),{enabled:true});return {service,repo,calls};}
test("hosted KYC validates CPF/address and returns an owned session without retaining CPF",async()=>{
 const {service,repo}=fixture();const result=await service.session("alice",parseKycApplicant(applicant));assert.equal(result.status,"created");assert.equal(result.requiresWebView,true);assert.ok(result.verificationLink);assert.ok(!JSON.stringify([...repo.rows.values()]).includes("52998224725"));
 await assert.rejects(()=>service.status("bob"));assert.equal((await service.status("alice")).brlaEnabled,true);
 for(const body of [{...applicant,cpf:"11111111111"},{...applicant,walletAddress:"bad"},{...applicant,redirectUrl:"https://evil.test"}])assert.throws(()=>parseKycApplicant(body));
 await assert.rejects(()=>service.session("alice",parseKycApplicant({...applicant,email:"other@example.com"})));
});
test("limits use directional values and enforce KYC wallet ownership",async()=>{
 const {service}=fixture();await service.session("alice",parseKycApplicant(applicant));const limits=await service.limits("alice");assert.equal(limits.offramp.remaining,"5500");assert.equal(limits.currency,"BRL");assert.equal(limits.blocked,false);
});
test("KYC status from a different wallet cannot leak a verification session",async()=>{
 const repo=new MemoryKyc(),codec=new RampCodec(Buffer.alloc(32,7).toString("base64"));let stage="session";
 const client=new PodsClient({apiKey:"fake-key",fetcher:async()=>Response.json(stage==="session"?{kycUserId:"550e8400-e29b-41d4-a716-446655440000",status:"created",verificationLink:null,walletAddress:applicant.walletAddress}:{kycUserId:"550e8400-e29b-41d4-a716-446655440000",status:"approved",brlaEnabled:true,walletAddress:"0x0000000000000000000000000000000000000002"})});
 const service=new PodsKycService(repo,client,codec,{enabled:true});await service.session("alice",parseKycApplicant(applicant));stage="status";await assert.rejects(()=>service.status("alice"));
});
test("hosted reset follows retryable state and uses only the owned profile id",async()=>{
 const repo=new MemoryKyc(),codec=new RampCodec(Buffer.alloc(32,7).toString("base64"));let status="created";const id="550e8400-e29b-41d4-a716-446655440000";let reset=0;
 const client=new PodsClient({apiKey:"fake-key",fetcher:async(input,init)=>{const path=new URL(String(input)).pathname;if(path.endsWith("/reset")){assert.equal(JSON.parse(String(init!.body)).kycUserId,id);reset++;return Response.json({kycUserId:id,status:"created",verificationLink:null});}return Response.json({kycUserId:id,status,brlaEnabled:false,walletAddress:applicant.walletAddress,verificationLink:null});}});
 const service=new PodsKycService(repo,client,codec,{enabled:true});await service.session("alice",parseKycApplicant(applicant));await assert.rejects(()=>service.reset("alice"));assert.equal(reset,0);status="rejected_retryable";assert.equal((await service.reset("alice")).status,"created");assert.equal(reset,1);
});
