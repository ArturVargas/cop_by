import assert from "node:assert/strict";
import test from "node:test";
import { Reserve, type Quote } from "@cavos/reserve";
import { sendUsdc, usdcToStroops } from "./send-usdc";
import * as sends from "./send-usdc";
const prepareUsdcSend = sends["prepareUsdcSend"];

const source="GANTUVPE7JSXMMZHEOHWAWBJY5BIKDW2KYYI2ELBWBRC2TL7THMT6Z5I";
const destination="GBIMQFMFVQ2JGNSKL6RGPBYW3MCV7WTUEMOEBB44EAVMKRXBZW7VROGR";

test("send amounts preserve seven decimals without float rounding",()=>{
  assert.equal(usdcToStroops("922337203685.4775807"),9223372036854775807n);
  assert.throws(()=>usdcToStroops("0.00000001"));
  assert.throws(()=>usdcToStroops("-1"));
});

test("prepared sends bind delivery and fee before signing",async(t)=>{
 const original=Reserve.connect;
 t.after(()=>{Reserve.connect=original;});
 let ready=true,submitted=0,quoted=0;
 const quote={sendMaxStroops:1234567,payload:{ops:[]}} as unknown as Quote;
 const client={destinationReady:async()=>ready,quote:async(request:any)=>{quoted++;quote.request=request;return quote;},send:async(q:Quote)=>{assert.equal(q,quote);submitted++;return {hash:"reserved-hash"};}};
 Reserve.connect=async()=>client as unknown as Reserve;
 const direct=await prepareUsdcSend({source,destination,amount:"1"});
 assert.equal(direct.delivery,"payment");assert.equal(direct.maxFee,"0");assert.equal(quoted,0);
 ready=false;
 const plan=await prepareUsdcSend({source,destination,amount:"1"});
 assert.equal(plan.delivery,"claimable");assert.equal(plan.maxFee,"0.1234567");assert.equal(plan.maxTotal,"1.1234567");
 assert.equal(quote.request.ops[0].type,"create_claimable_balance");
 const wallet={chain:"stellar" as const,address:source,signXdr:async()=>"signed",invokeContract:async()=>{throw new Error("invoke failed");}};
 const result=await sendUsdc({wallet,plan});assert.equal(result.hash,"reserved-hash");assert.equal(result.delivery,"claimable");assert.equal(submitted,1);
 await assert.rejects(()=>sendUsdc({wallet:{...wallet,address:destination},plan}),/cuenta/i);
 await assert.rejects(()=>prepareUsdcSend({source,destination,amount:"1",memo:"reference"}),/memo/i);
 ready=true;
 const sponsored=await prepareUsdcSend({source,destination,amount:"1"});
 await assert.rejects(()=>sendUsdc({wallet,plan:sponsored}),/invoke failed/);
 assert.equal(submitted,1,"A sponsored failure must never silently switch to a paid route");
 client.send=async()=>{throw new Error("quote_expired");};
 await assert.rejects(()=>sendUsdc({wallet,plan}),/quote_expired/);
 assert.equal(quoted,1,"Expired quotes must require another explicit review");
 client.destinationReady=async()=>{throw new Error("offline");};
 await assert.rejects(()=>prepareUsdcSend({source,destination,amount:"1"}),/offline/);
});
