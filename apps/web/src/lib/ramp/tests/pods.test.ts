import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { PodsRampProvider } from "../providers/pods";
import { address, muxed, now, podsResponse, request, token } from "./fixtures";

function fixture(change?: (value: ReturnType<typeof podsResponse>) => unknown) {
  const calls: URL[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url);
    assert.equal(new Headers(init?.headers).get("x-api-key"), "test-secret");
    const body = url.pathname.includes("/kyc/") ? { kycUserId: request.kycUserId, status: "approved", brlaEnabled: true, walletAddress: address } : (change ? change(podsResponse()) : podsResponse());
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const provider = new PodsRampProvider({ apiKey: "test-secret", enabled: true, stellarToken: token, fetcher, now: () => now });
  return { provider, calls };
}
test("Pods uses approved wallet KYC and the exact seven-decimal PIX quote contract", async () => {
  const { provider, calls } = fixture(); const quote = await provider.createQuote(request);
  assert.equal(calls.length, 2); assert.equal(calls[1].pathname, "/v2/swap/quote");
  for (const [key,value] of Object.entries({ originChain:"stellar", destinationChain:"fiat", tokenIn:token, tokenOut:"BRL", amountIn:"150000000", originAddress:address, pixKey:request.pixKey, thirdParty:"true" })) assert.equal(calls[1].searchParams.get(key), value);
  assert.equal(quote.destinationAmount, "75"); assert.equal(quote.fees[0].amount,"0.2");
  assert.equal(quote.funding.kind,"stellar_payment"); if(quote.funding.kind==="stellar_payment") assert.equal(quote.funding.destination,muxed);
});
test("wrong network, amounts and route metadata cannot authorize funding", async () => {
  const { provider }=fixture(); await assert.rejects(()=>provider.createQuote({...request,network:"testnet"}));
  for(const change of [ (v:ReturnType<typeof podsResponse>)=>{v.quote.tokenIn.decimals=6;return v;},(v:ReturnType<typeof podsResponse>)=>{v.quote.tokenIn.amount="150000001";return v;},(v:ReturnType<typeof podsResponse>)=>{v.quote.originChain="base";return v;} ]) await assert.rejects(()=>fixture(change).provider.createQuote(request));
  for(const destination of [address,"0x0000000000000000000000000000000000000001",""]) {
    const quote=await fixture(v=>({...v,depositAddress:destination})).provider.createQuote(request); assert.equal(quote.funding.kind,"unavailable");
  }
  const unsafe=await fixture(v=>({...v,transactionData:[{to:"0x123"}]})).provider.createQuote(request);assert.equal(unsafe.funding.kind,"unavailable");
});
test("KYC mismatches stop before a quote is created and disabled providers stay unavailable", async () => {
  let calls=0;const provider=new PodsRampProvider({apiKey:"test-secret",enabled:true,stellarToken:token,fetcher:async()=>{calls++;return new Response(JSON.stringify({kycUserId:request.kycUserId,status:"approved",brlaEnabled:true,walletAddress:"other"}));}});
  await assert.rejects(()=>provider.createQuote(request));assert.equal(calls,1);
  assert.equal(new PodsRampProvider({}).capability().available,false);
});
test("webhook signature matches the published Pods fixture and rejects replay/tampering", () => {
  const secret="whsec_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const body=new TextEncoder().encode('{"messageType":"ACTION_UPDATE","data":{"status":"confirmed"}}');
  const headers=new Headers({"X-Deframe-Webhook-Id":"674a1b2c3d4e5f60718293a4","X-Deframe-Webhook-Timestamp":"1783512000","X-Deframe-Webhook-Signature":"v1=b33e9026df818bb669129d01390c580f4097efcdaaca0a2c2bb03493e7c9c5f2"});
  const provider=new PodsRampProvider({webhookSecret:secret,now:()=>1783512000000});
  assert.equal(provider.verifyWebhook(body,headers).id,"674a1b2c3d4e5f60718293a4");
  assert.throws(()=>provider.verifyWebhook(new TextEncoder().encode('{}'),headers));
  assert.throws(()=>new PodsRampProvider({webhookSecret:secret,now:()=>1783512400000}).verifyWebhook(body,headers));
  const raw=new TextEncoder().encode('{"messageType":"ACTION_UPDATE","data":{"id":"action-1","status":"SUCCESS"}}');
  headers.set("X-Deframe-Webhook-Signature","v1="+createHmac("sha256",secret).update("1783512000.674a1b2c3d4e5f60718293a4.").update(raw).digest("hex"));
  assert.equal(provider.verifyWebhook(raw,headers).actionId,"action-1");
});
test("only canonical PIX fulfillment becomes paid and quote metadata survives config changes", async () => {
  const quote=await fixture().provider.createQuote(request);
  let body:Record<string,unknown>={...podsResponse().quote,status:"fulfilled",updatedAt:new Date(now).toISOString(),fiatSettlement:{method:"PIX",endToEndId:"E-test"}};
  const provider=new PodsRampProvider({apiKey:"test-secret",stellarToken:"changed",now:()=>now,fetcher:async()=>new Response(JSON.stringify(body))});
  assert.equal((await provider.getStatus(request,quote)).state,"paid");
  body={...body,fiatSettlement:undefined};await assert.rejects(()=>provider.getStatus(request,quote));
  body={...body,status:"SUCCESS"};await assert.rejects(()=>provider.getStatus(request,quote));
});
test("provider timeouts and private error payloads stay safe", async () => {
  const provider=new PodsRampProvider({apiKey:"secret",enabled:true,stellarToken:token,timeoutMs:5,fetcher:async(_input,init)=>new Promise((_resolve,reject)=>init!.signal!.addEventListener("abort",()=>reject(new Error("private data"))))});
  await assert.rejects(()=>provider.createQuote(request),(error:unknown)=>error instanceof Error && error.message.includes("consultar Pods") && !error.message.includes("private"));
  const failed=new PodsRampProvider({apiKey:"secret",enabled:true,stellarToken:token,fetcher:async()=>new Response(JSON.stringify({error:{code:"RATE_LIMIT",message:"private PIX value"}}),{status:429})});
  await assert.rejects(()=>failed.createQuote(request),(error:unknown)=>error instanceof Error && !error.message.includes("private PIX"));
});
