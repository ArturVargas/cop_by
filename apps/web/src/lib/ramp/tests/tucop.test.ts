import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { tucopFixture,externalPayment } from "./tucop-fixtures";
import { RampService } from "../service";
import { MemoryRepository } from "./memory";
import { now } from "./fixtures";
import { verifyTucopWebhook } from "../tucop/webhook";
const context={customerId:"alice",operationId:"operation-id",idempotencyKey:"quote:test-key"};
test("shared business destinations still require each COP By customer to confirm the current holder",async()=>{
 const f=await tucopFixture();assert.equal(f.destinations.view(f.registered).confirmed,false);await assert.rejects(()=>f.provider.createQuote(f.request,context));await f.confirm();const q=await f.provider.createQuote(f.request,context);assert.equal(q.funding.kind,"unavailable");assert.equal(f.creations(),0);
 await assert.rejects(()=>f.destinations.requireConfirmed("bob",f.registered.id,"BRL"));f.setHolder("Different Recipient");await assert.rejects(()=>f.provider.createQuote(f.request,context));
});
test("TuCOP pay creates once at acceptance, preserves exact Stellar memo/issuer and refreshes deposit amount",async()=>{
 const f=await tucopFixture();await f.confirm();const service=new RampService(new MemoryRepository(),()=>f.provider,f.codec,()=>now),op=await service.create("alice","tucop-operation-key",f.request);assert.equal(op.state,"quoted");assert.equal(f.creations(),0);
 const accepted=await Promise.all([service.accept("alice",op.id),service.accept("alice",op.id)]);assert.equal(f.creations(),1);const q=accepted[0].quote!;assert.equal(q.providerPaymentId,externalPayment);assert.equal(q.totalAmount,"5.025");
 assert.equal(q.funding.kind,"stellar_payment");if(q.funding.kind==="stellar_payment"){assert.equal(q.funding.memo,"123456789");assert.equal(q.funding.amount,"5");assert.equal(q.funding.network,"testnet");assert.ok(q.funding.memolessDestination?.startsWith("M"));}
 f.setAmount("5.02");const latest=await service.getForClient("alice",op.id);assert.equal(latest.quote!.sourceAmount,"5.02");assert.equal(latest.quote!.totalAmount,"5.045");
 const posts=f.calls.filter(v=>v.path==="/ramp/payments"&&v.method==="POST");assert.equal(new Set(posts.map(v=>v.key)).size,1);assert.equal(posts[0].body!.source_chain,"stellar");assert.equal(posts[0].body!.return_memo,"copby-return");
});
test("Stellar funding rejects wrong network, issuer, memo and return account",async()=>{
 const f=await tucopFixture();await f.confirm();const q=await f.provider.createQuote(f.request,context);
 const mutations:Parameters<typeof f.mutatePayment>[0][]=[v=>({...v,deposit:{...v.deposit,chain:"stellar:pubnet"}}),v=>({...v,deposit:{...v.deposit,memo:""}}),v=>({...v,deposit:{...v.deposit,asset_issuer:"wrong"}}),v=>({...v,return_address:"wrong"})];for(const mutate of mutations){f.mutatePayment(mutate);await assert.rejects(()=>f.provider.prepareFunding(f.request,q,{...context,idempotencyKey:"payment:validation"}));}
});
test("TuCOP Standard Webhooks authenticates raw bytes, event id, timestamp and signature rotation",()=>{
 const secret="whsec_"+Buffer.alloc(32,9).toString("base64"),id="evt_"+"0".repeat(26),timestamp=String(now/1000),raw=new TextEncoder().encode(JSON.stringify({id,type:"operation.updated",api_version:"2026-10-08",data:{product:"pay",operation_id:externalPayment,status:"completed"}}));
 const signature=createHmac("sha256",Buffer.from(secret.slice(6),"base64")).update(`${id}.${timestamp}.`).update(raw).digest("base64");const headers=new Headers({"webhook-id":id,"webhook-timestamp":timestamp,"webhook-signature":"v2,ignored v1,"+signature});
 assert.equal(verifyTucopWebhook(raw,headers,secret,now).actionId,externalPayment);assert.throws(()=>verifyTucopWebhook(new TextEncoder().encode("{}"),headers,secret,now));assert.throws(()=>verifyTucopWebhook(raw,headers,secret,now+301000));
});

test("TuCOP in-progress idempotency responses stay retryable and never disclose provider detail",async()=>{
 const {TucopClient}=await import("../tucop/client");const client=new TucopClient({apiKey:"tcr_test_sk_fixture",environment:"sandbox",fetcher:async()=>Response.json({code:"idempotency_in_progress",detail:"private secret"},{status:409})});
 await assert.rejects(()=>client.request("/ramp/payments",{post:true,idempotencyKey:"same-key"}),(error:unknown)=>error instanceof Error&&"retryable" in error&&error.retryable===true&&!error.message.includes("private"));
});

test("TuCOP published Standard Webhooks signature fixture verifies",()=>{
 const raw=new TextEncoder().encode("{\"id\":\"evt_3f3gn1wv2y9e59mn9z1xn1pb1x\",\"type\":\"ping\",\"category\":\"platform\",\"timestamp\":\"2026-10-07T21:04:11.512Z\",\"api_version\":\"2026-10-08\",\"data\":{\"consumer_id\":\"con_0bdy554f0x9szsmatwdnz8z6gb\",\"endpoint_id\":\"whep_1x5gdgn7we9ny8ptjz9ryjr6ra\"}}");
 const headers=new Headers({"webhook-id":"evt_3f3gn1wv2y9e59mn9z1xn1pb1x","webhook-timestamp":"1791407052","webhook-signature":"v1,Z4W6G7gxqWMDzv4tLJjy4ACXAU09jpkyz94L7QNlS5U="});
 assert.equal(verifyTucopWebhook(raw,headers,"whsec_dHVjb3ByYW1wLWV4YW1wbGUtc2VjcmV0LW5vdC11c2U=",1791407052000).relevant,false);
});
test("TuCOP cannot create a payment before the return account trusts USDC and covers total spend",async()=>{
 const f=await tucopFixture();await f.confirm();const quote=await f.provider.createQuote(f.request,context),{TucopRampProvider}=await import("../providers/tucop");
 for(const result of [{trustsUsdc:false,balance:"100"},{trustsUsdc:true,balance:"5"}]){
  const provider=new TucopRampProvider({client:f.client,destinations:f.destinations,loadAccount:async()=>result});await assert.rejects(()=>provider.prepareFunding(f.request,quote,{...context,idempotencyKey:"payment:unfunded"}));
 }
 assert.equal(f.creations(),0);
});

test("known payment ids survive a failed follow-up GET and recover without a second POST or new consent",async()=>{
 const f=await tucopFixture();await f.confirm();let time=now;const service=new RampService(new MemoryRepository(),()=>f.provider,f.codec,()=>time),op=await service.create("alice","checkpoint-key",f.request);
 f.mutatePayment(v=>({...v,deposit:null}));await assert.rejects(()=>service.accept("alice",op.id));
 const pending=await service.get("alice",op.id);assert.equal(pending.quote!.providerPaymentId,externalPayment);assert.equal(pending.quote!.providerActionId,externalPayment);assert.equal(pending.acceptancePending,true);
 f.setHolder("Changed Holder");f.mutatePayment(v=>v);time+=24*60*60*1000;
 const accepted=await service.reconcile("alice",op.id);assert.ok(accepted.acceptedAt);assert.equal(f.calls.filter(v=>v.path==="/ramp/payments"&&v.method==="POST").length,1);
});
test("canonical failed and canceled payments reconcile nullable deposit/quote data and preserve failure codes",async()=>{
 for(const status of ["failed","canceled"]){
  const f=await tucopFixture();await f.confirm();const service=new RampService(new MemoryRepository(),()=>f.provider,f.codec,()=>now),op=await service.create("alice","terminal-null-"+status,f.request);await service.accept("alice",op.id);
  f.mutatePayment(v=>({...v,status,quote_id:null,destination_id:null,destination_amount:null,source_amount:null,fees:null,total_amount:null,deposit:null,return_address:null,return_memo:null,error_code:status==="failed"?"provider_error":"expired_unfunded"}));
  const result=await service.reconcile("alice",op.id);assert.equal(result.state,status==="failed"?"failed":"expired");assert.equal(result.failureCode,status==="failed"?"provider_error":"expired_unfunded");assert.equal(result.quote!.funding.kind,"unavailable");
 }
});

test("canonical creating resumes the exact same POST inside retention without a duplicate payment",async()=>{
 const f=await tucopFixture();await f.confirm();const service=new RampService(new MemoryRepository(),()=>f.provider,f.codec,()=>now),op=await service.create("alice","creating-resume-key",f.request);
 const posts=()=>f.calls.filter(v=>v.path==="/ramp/payments"&&v.method==="POST");
 f.mutatePayment(v=>posts().length<2?{...v,status:"creating",deposit:null}:v);await assert.rejects(()=>service.accept("alice",op.id));
 assert.ok((await service.accept("alice",op.id)).acceptedAt);assert.equal(posts().length,2);assert.equal(new Set(posts().map(v=>v.key)).size,1);assert.deepEqual(posts()[0].body,posts()[1].body);assert.equal(f.creations(),1);
});
test("known creating payments never resume POST after the retention safety window",async()=>{
 const f=await tucopFixture();await f.confirm();let time=now;const service=new RampService(new MemoryRepository(),()=>f.provider,f.codec,()=>time),op=await service.create("alice","creating-expired-key",f.request);
 f.mutatePayment(v=>({...v,status:"creating",deposit:null}));await assert.rejects(()=>service.accept("alice",op.id));time+=23*60*60*1000+1;
 await assert.rejects(()=>service.accept("alice",op.id),(error:unknown)=>error instanceof Error&&"code" in error&&error.code==="ACCEPTANCE_REVIEW_REQUIRED");assert.equal(f.calls.filter(v=>v.path==="/ramp/payments"&&v.method==="POST").length,1);
});
