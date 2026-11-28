import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { PodsRampProvider } from "../providers/pods";
import { PodsClient } from "../providers/pods-client";
import { PodsKycService } from "../kyc";
import { MemoryKyc } from "./memory-kyc";
import { handleRampRequest } from "../api";
import { RampCodec } from "../codec";
import { RampService } from "../service";
import { MockRampProvider } from "../providers/mock";
import { MemoryRepository } from "./memory";
import { request } from "./fixtures";

const env={RAMP_INTERNAL_API_TOKEN:"test-"+"a".repeat(40)};
const repository=new MemoryRepository(),mock=new MockRampProvider();
const service=new RampService(repository,()=>mock,new RampCodec(Buffer.alloc(32,7).toString("base64")));
const options={env,runtime:()=>({service,repository,providers:{mock},defaultProvider:"mock" as const})};
function req(body?:unknown,customer="alice") {return new Request("https://copby.test/api/ramp",{method:"POST",headers:{Authorization:`Bearer ${env.RAMP_INTERNAL_API_TOKEN}`,"X-Ramp-Customer-Id":customer,"Content-Type":"application/json","Idempotency-Key":"api-test-key"},body:body===undefined?undefined:JSON.stringify(body)});}
test("private API fails closed before touching the database",async()=>{
  let touched=false;const runtime=()=>{touched=true;throw new Error("database");};
  assert.equal((await handleRampRequest(new Request("https://copby.test"),"providers",undefined,{env,runtime})).status,401);
  assert.equal((await handleRampRequest(req(),"providers",undefined,{env:{},runtime})).status,503);assert.equal(touched,false);
});
test("private quote API normalizes amounts, scopes operations and withholds funding until acceptance",async()=>{
  const response=await handleRampRequest(req({...request,provider:"mock",network:"testnet",amount:"15.0000000"}),"quotes",undefined,options);
  assert.equal(response.status,201);assert.equal(response.headers.get("cache-control"),"no-store");
  const data=await response.json();assert.equal(data.quote.sourceAmount,"15");assert.equal(data.quote.funding,undefined);assert.equal(data.simulation,true);assert.equal(data.request,undefined);
  assert.equal((await handleRampRequest(req(undefined,"bob"),"get",data.id,options)).status,404);
  const accepted=await handleRampRequest(req(),"accept",data.id,options);assert.equal((await accepted.json()).quote.funding.kind,"simulation");
});
test("API rejects oversized, malformed, unknown fields and invalid identifiers",async()=>{
  const huge=req({padding:"x".repeat(17000)});assert.equal((await handleRampRequest(huge,"quotes",undefined,options)).status,413);
  assert.equal((await handleRampRequest(req({limit:100}),"batch",undefined,options)).status,400);
  assert.equal((await handleRampRequest(req(),"get","invalid",options)).status,400);
  assert.equal((await handleRampRequest(req({...request,unexpected:true}),"quotes",undefined,options)).status,400);
  const invalid=req();assert.equal((await handleRampRequest(invalid,"quotes",undefined,options)).status,400);
});

test("webhooks require the raw-body signature and acknowledge only a durable inbox write",async()=>{
  const secret="webhook-test-secret",timestamp=String(Math.floor(Date.now()/1000)),id="signed-event-1";
  const body=JSON.stringify({messageType:"ACTION_UPDATE",data:{id:"action-1",status:"SUCCESS"}});
  const signature="v1="+createHmac("sha256",secret).update(`${timestamp}.${id}.${body}`).digest("hex");
  const provider=new PodsRampProvider({webhookSecret:secret});const inbox=new MemoryRepository();
  const dependencies={env:{},runtime:()=>({service,repository:inbox,providers:{pods:provider},defaultProvider:"pods" as const})};
  const webhook=(signed=true)=>new Request("https://copby.test/webhooks/pods",{method:"POST",body,headers:{"X-Deframe-Webhook-Id":id,"X-Deframe-Webhook-Timestamp":timestamp,"X-Deframe-Webhook-Signature":signed?signature:"bad"}});
  assert.equal((await handleRampRequest(webhook(false),"webhook",undefined,dependencies)).status,401);assert.equal(inbox.events.size,0);
  assert.equal((await handleRampRequest(webhook(),"webhook",undefined,dependencies)).status,202);
  assert.equal((await handleRampRequest(webhook(),"webhook",undefined,dependencies)).status,202);assert.equal(inbox.events.size,1);
  inbox.inbox=async()=>{throw new Error("database secret failure");};
  const failed=await handleRampRequest(webhook(),"webhook",undefined,dependencies);assert.equal(failed.status,500);assert.ok(!(await failed.text()).includes("secret failure"));
});

test("hosted KYC routes authenticate and scope profile/status/limits to the trusted customer",async()=>{
 const kyc=new PodsKycService(new MemoryKyc(),new PodsClient({apiKey:"fake",fetcher:async(input)=>{const url=new URL(String(input));if(url.pathname.endsWith("/sessions"))return Response.json({kycUserId:"550e8400-e29b-41d4-a716-446655440000",status:"created",verificationLink:"https://in.sumsub.com/demo",verificationLinkExpiresAt:new Date(Date.now()+600000).toISOString()});return Response.json({kycUserId:"550e8400-e29b-41d4-a716-446655440000",status:"approved",brlaEnabled:true,walletAddress:"0x0000000000000000000000000000000000000001"});}}),new RampCodec(Buffer.alloc(32,7).toString("base64")),{enabled:true});
 const deps={env,runtime:()=>({...options.runtime(),kyc})};
 const body={cpf:"52998224725",email:"test@example.com",walletAddress:"0x0000000000000000000000000000000000000001"};
 const created=await handleRampRequest(req(body),"kyc_session",undefined,deps);assert.equal(created.status,201);const text=await created.text();assert.ok(text.includes("verificationLink"));assert.ok(!text.includes(body.cpf));
 assert.equal((await handleRampRequest(req(undefined,"bob"),"kyc_status",undefined,deps)).status,404);
 const own=await handleRampRequest(req(),"kyc_status",undefined,deps);assert.equal((await own.json()).brlaEnabled,true);
 assert.equal((await handleRampRequest(new Request("https://copby.test"),"kyc_status",undefined,deps)).status,401);
});
test("TuCOP pay API keeps owned destinations and payments separate from Pods KYC",async()=>{
 const {tucopFixture}=await import("./tucop-fixtures");const clock=Date.now(),f=await tucopFixture(clock);const paymentRepository=new MemoryRepository(),payments=new RampService(paymentRepository,()=>f.provider,f.codec,()=>clock);
 const deps={env,runtime:()=>({service:payments,repository:paymentRepository,providers:{tucop:f.provider},defaultProvider:"tucop" as const,tucop:{client:f.client,destinations:f.destinations}})};
 const view=f.destinations.view(f.registered);
 assert.equal((await handleRampRequest(req(undefined,"bob"),"tucop_destination_get",view.id,deps)).status,404);
 assert.equal((await handleRampRequest(req({holderRevision:"0".repeat(64)}),"tucop_destination_confirm",view.id,deps)).status,409);
 const confirmed=await handleRampRequest(req({holderRevision:view.holderRevision}),"tucop_destination_confirm",view.id,deps);assert.equal(confirmed.status,200);assert.equal((await confirmed.json()).confirmed,true);
 const created=await handleRampRequest(req(f.request),"quotes",undefined,deps);assert.equal(created.status,201);const op=await created.json();assert.equal(op.state,"quoted");assert.equal(op.quote.destinationCurrency,"BRL");assert.equal(op.quote.funding,undefined);
 const accepted=await handleRampRequest(req(),"accept",op.id,deps);assert.equal(accepted.status,200);const result=await accepted.json();assert.equal(result.quote.funding.memo,"123456789");assert.equal(result.quote.sourceAmount,"5");assert.equal(f.creations(),1);
 f.setAmount("5.02");const replay=await handleRampRequest(req(f.request),"quotes",undefined,deps);assert.equal(replay.status,201);assert.equal((await replay.json()).quote.funding.amount,"5.02");
});
