import assert from "node:assert/strict";
import test from "node:test";
import { RampService, publicOperation } from "../service";
import { RampCodec } from "../codec";
import { RampError } from "../errors";
import { MemoryRepository } from "./memory";
import { now, request } from "./fixtures";
import type { RampProvider, RampQuote } from "../types";

const key=Buffer.alloc(32,7).toString("base64");
const quote:RampQuote={providerQuoteId:"quote-1",providerActionId:"action-1",expiresAt:new Date(now+300000).toISOString(),sourceAmount:"15",destinationAmount:"75",fees:[],funding:{kind:"simulation"}};
function setup(create?:()=>Promise<RampQuote>) {
  let calls=0;const repository=new MemoryRepository();
  const provider:RampProvider={id:"pods",capability:()=>({id:"pods",available:true,networks:["mainnet"]}),createQuote:async()=>{calls++;return create?create():quote;},getStatus:async()=>({state:"paid",observedAt:now+1,receiptId:"PIX-receipt"}),verifyWebhook:()=>{throw new Error("unused");}};
  const service=new RampService(repository,()=>provider,new RampCodec(key),()=>now);
  return {service,repository,provider,calls:()=>calls};
}
test("quote idempotency is durable under concurrent calls and rejects changed inputs",async()=>{
  const {service,calls}=setup();const results=await Promise.all(Array.from({length:8},()=>service.create("alice","same-key",request)));
  assert.equal(calls(),1);assert.equal(new Set(results.map(v=>v.id)).size,1);
  await assert.rejects(()=>service.create("alice","same-key",{...request,amount:"16"}),/misma/);
  await assert.rejects(()=>service.get("bob",results[0].id),/encontrada/);
  const done=await service.get("alice",results[0].id);assert.equal(done.state,"quoted");assert.equal(publicOperation(done).quote!.funding,undefined);
});
test("unknown quote outcome is retained and never automatically requests a second quote",async()=>{
  const {service,calls}=setup(async()=>{throw new RampError("PODS_TIMEOUT","timeout",502,true);});
  const operation=await service.create("alice","timeout-key",request);assert.equal(operation.state,"needs_attention");
  assert.equal((await service.create("alice","timeout-key",request)).id,operation.id);assert.equal(calls(),1);
});
test("acceptance, funding reports and reconciliation preserve ownership and provider authority",async()=>{
  const {service,provider}=setup();const operation=await service.create("alice","funding-key",request);
  await assert.rejects(()=>service.reportFunding("alice",operation.id,"a".repeat(64)),/aceptar/);
  const accepted=await service.accept("alice",operation.id);assert.equal(accepted.state,"awaiting_funding");assert.equal(publicOperation(accepted,now).quote!.funding!.kind,"simulation");
  await service.reportFunding("alice",operation.id,"a".repeat(64));
  await assert.rejects(()=>service.reportFunding("alice",operation.id,"b".repeat(64)),/registrada/);
  const paid=await service.reconcile("alice",operation.id);assert.equal(paid.state,"paid");
  provider.getStatus=async()=>({state:"awaiting_funding",observedAt:now+100});
  assert.equal((await service.reconcile("alice",operation.id)).state,"paid");
});
test("expired quotes cannot be accepted; webhook inbox never trusts success payloads",async()=>{
  const {service,repository,provider}=setup(async()=>({...quote,expiresAt:new Date(now-1).toISOString()}));
  const expired=await service.create("alice","expired-key",request);await assert.rejects(()=>service.accept("alice",expired.id),/venció/);
  const other=setup();const op=await other.service.create("alice","webhook-key",request);
  await other.repository.inbox("pods",{id:"event",digest:"digest",actionId:"action-1",relevant:true});
  other.provider.getStatus=async()=>({state:"processing",observedAt:now+1});
  await other.service.reconcileBatch(10);assert.equal((await other.service.get("alice",op.id)).state,"processing");assert.equal((await other.repository.pendingEvents(10)).length,0);
});
test("encrypted snapshots bind their customer and operation; fingerprints are stable and keyed",()=>{
  const codec=new RampCodec(key);const value={pixKey:"private@example.com"};const encrypted=codec.encrypt(value,"alice","id");
  assert.ok(!encrypted.includes(value.pixKey));assert.deepEqual(codec.decrypt(encrypted,"alice","id"),value);
  assert.throws(()=>codec.decrypt(encrypted,"bob","id"));assert.throws(()=>codec.decrypt(encrypted,"alice","different"));
  assert.equal(codec.fingerprint(request),codec.fingerprint({...request}));assert.notEqual(codec.fingerprint(request),new RampCodec(Buffer.alloc(32,8).toString("base64")).fingerprint(request));
});
test("concurrent funding reports cannot overwrite another transaction; polling cannot bypass acceptance",async()=>{
  const {service,provider}=setup();const operation=await service.create("alice","race-key",request);
  provider.getStatus=async()=>({state:"awaiting_funding",observedAt:now+1});
  assert.equal((await service.reconcile("alice",operation.id)).state,"quoted");
  assert.equal(publicOperation(await service.get("alice",operation.id)).quote!.funding,undefined);
  await service.accept("alice",operation.id);
  const results=await Promise.allSettled([service.reportFunding("alice",operation.id,"a".repeat(64)),service.reportFunding("alice",operation.id,"b".repeat(64))]);
  assert.equal(results.filter(v=>v.status==="fulfilled").length,1);
  assert.equal((await service.get("alice",operation.id)).reportedTxHash,"a".repeat(64));
});
test("unknown Stellar funding contracts cannot be accepted",async()=>{
  const {service}=setup(async()=>({...quote,funding:{kind:"unavailable",reason:"unverified"}}));
  const operation=await service.create("alice","unsafe-key",request);
  await assert.rejects(()=>service.accept("alice",operation.id),/contrato/);
});
test("public funding instructions disappear after expiry or settlement",()=>{
  const operation={id:"id",customerId:"alice",provider:"pods" as const,idempotencyKey:"key",requestHash:"hash",request,state:"awaiting_funding" as const,version:1,quote,acceptedAt:new Date(now).toISOString(),createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()};
  assert.equal(publicOperation(operation,now).quote!.canFund,true);
  assert.equal(publicOperation(operation,now+300001).quote!.funding,undefined);
  assert.equal(publicOperation({...operation,state:"paid"},now).quote!.funding,undefined);
});
test("a reported transaction cannot unlock a second funding instruction after pending polling",async()=>{
  const {service,provider}=setup();const operation=await service.create("alice","once-key",request);await service.accept("alice",operation.id);await service.reportFunding("alice",operation.id,"a".repeat(64));
  provider.getStatus=async()=>({state:"awaiting_funding",observedAt:now+1});
  const pending=await service.reconcile("alice",operation.id);assert.equal(publicOperation(pending,now).quote!.canFund,false);assert.equal(publicOperation(pending,now).quote!.funding,undefined);
});
test("processing cannot regress to a fundable quote on tied or newer pending responses",async()=>{
  const {service,provider}=setup();const operation=await service.create("alice","detected-key",request);await service.accept("alice",operation.id);
  provider.getStatus=async()=>({state:"processing",observedAt:now+1});await service.reconcile("alice",operation.id);
  for(const timestamp of [now+1,now+2]) {provider.getStatus=async()=>({state:"awaiting_funding",observedAt:timestamp});const result=await service.reconcile("alice",operation.id);assert.equal(result.state,"processing");assert.equal(publicOperation(result,now).quote!.canFund,false);}
});
test("provider settlement keeps first payment/refund receipts and independent failure metadata",async()=>{
  const {service,provider}=setup();const operation=await service.create("alice","receipt-key",request);
  provider.getStatus=async()=>({state:"paid",observedAt:now+1});let result=await service.reconcile("alice",operation.id);assert.equal(result.state,"paid");assert.equal(result.receiptId,undefined);
  provider.getStatus=async()=>({state:"paid",observedAt:now+2,receiptId:"E-original"});await service.reconcile("alice",operation.id);
  provider.getStatus=async()=>({state:"refunded",observedAt:now+3,receiptId:"E-changed",refundReceiptId:"D-original",failureCode:"PROVIDER_REJECTED"});result=await service.reconcile("alice",operation.id);
  assert.equal(result.receiptId,"E-original");assert.equal(result.refundReceiptId,"D-original");assert.equal(result.failureCode,"PROVIDER_REJECTED");
  provider.getStatus=async()=>({state:"refunded",observedAt:now+4,refundReceiptId:"D-changed"});result=await service.reconcile("alice",operation.id);assert.equal(result.refundReceiptId,"D-original");
});
test("payment creation is a separate idempotent acceptance phase and stale amounts refresh",async()=>{
 const {service,provider}=setup(async()=>({...quote,funding:{kind:"unavailable",reason:"ACCEPT_TO_PREPARE"}}));let preparations=0;const keys:string[]=[];
 provider.prepareFunding=async(_request,q,context)=>{preparations++;keys.push(context.idempotencyKey);return {...q,providerPaymentId:"op-id",funding:{kind:"simulation"}};};
 provider.getStatus=async()=>({state:"awaiting_funding",observedAt:now+1});
 const op=await service.create("alice","prepare-key",request);assert.equal(preparations,0);
 const results=await Promise.all([service.accept("alice",op.id),service.accept("alice",op.id)]);assert.equal(new Set(keys).size,1);assert.ok(results.every(v=>v.quote!.providerPaymentId==="op-id"));
 provider.getStatus=async()=>({state:"awaiting_funding",observedAt:now+10,sourceAmount:"16",totalAmount:"16",funding:{kind:"simulation"}});
 assert.equal((await service.getForClient("alice",op.id)).quote!.sourceAmount,"16");
});
test("unknown acceptance outcomes recover using the same provider key even after quote expiry",async()=>{
 let time=now;const repository=new MemoryRepository();let attempts=0;const keys:string[]=[];
 const provider:RampProvider={id:"pods",capability:()=>({id:"pods",available:true,networks:["mainnet"]}),createQuote:async()=>quote,prepareFunding:async(_r,q,ctx)=>{keys.push(ctx.idempotencyKey);if(++attempts===1)throw new RampError("TUCOP_TIMEOUT","timeout",502,true);return {...q,providerPaymentId:"op-id",expiresAt:new Date(time+600000).toISOString(),funding:{kind:"simulation"}};},getStatus:async()=>({state:"awaiting_funding",observedAt:time}),verifyWebhook:()=>{throw new Error("unused");}};
 const service=new RampService(repository,()=>provider,new RampCodec(key),()=>time),op=await service.create("alice","retry-payment-key",request);
 await assert.rejects(()=>service.accept("alice",op.id));assert.equal((await service.get("alice",op.id)).acceptancePending,true);time+=600000;
 assert.equal((await service.accept("alice",op.id)).state,"awaiting_funding");assert.equal(new Set(keys).size,1);
});

test("unaccepted preparation quotes expire without creating a payment",async()=>{
 const {service,provider}=setup(async()=>({...quote,expiresAt:new Date(now-1).toISOString()}));let preparations=0;
 provider.prepareFunding=async(_r,q)=>{preparations++;return q;};
 const op=await service.create("alice","unused-quote-key",request);
 assert.equal((await service.getForClient("alice",op.id)).state,"expired");
 await assert.rejects(()=>service.accept("alice",op.id));assert.equal(preparations,0);
});
test("unknown payment outcomes stop retrying before provider idempotency retention ends",async()=>{
 let time=now;let attempts=0;const repository=new MemoryRepository();
 const provider:RampProvider={id:"pods",capability:()=>({id:"pods",available:true,networks:["mainnet"]}),createQuote:async()=>quote,prepareFunding:async()=>{attempts++;throw new RampError("TUCOP_TIMEOUT","timeout",502,true);},getStatus:async()=>({state:"awaiting_funding",observedAt:time}),verifyWebhook:()=>{throw new Error("unused");}};
 const service=new RampService(repository,()=>provider,new RampCodec(key),()=>time),op=await service.create("alice","retention-key",request);
 await assert.rejects(()=>service.accept("alice",op.id));time+=23*60*60*1000+1;
 await assert.rejects(()=>service.accept("alice",op.id),(e:unknown)=>e instanceof RampError&&e.code==="ACCEPTANCE_REVIEW_REQUIRED");assert.equal(attempts,1);
});
