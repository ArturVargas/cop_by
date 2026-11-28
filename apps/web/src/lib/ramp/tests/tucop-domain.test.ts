import assert from "node:assert/strict";
import test from "node:test";
import { parseQuoteRequest } from "../domain";
import { RampCodec } from "../codec";
import { address } from "./fixtures";
const raw={provider:"tucop",network:"testnet",sourceAddress:address,amount:"250.00",currency:"BRL",destinationId:"11111111-1111-4111-8111-111111111111",returnMemo:"copby-refund"};
test("TuCOP pay uses destination fiat amount and return memo without Pods KYC",()=>{
 const request=parseQuoteRequest(raw,"pods");assert.equal(request.provider,"tucop");assert.equal(request.amount,"250");assert.equal("kycUserId" in request,false);
 for(const value of [{...raw,returnMemo:" invalid "},{...raw,returnMemo:"💸"},{...raw,currency:"USD"},{...raw,amount:"250.001"},{...raw,kycUserId:"unused"}])assert.throws(()=>parseQuoteRequest(value,"pods"));
 const codec=new RampCodec(Buffer.alloc(32,7).toString("base64"));assert.notEqual(codec.fingerprint(request),codec.fingerprint(parseQuoteRequest({...raw,returnMemo:"other"},"pods")));
});
