import assert from "node:assert/strict";
import test from "node:test";
import { amountToUnits, unitsToAmount, parseQuoteRequest, applyObservation } from "../domain";
const sourceAddress = "GANTUVPE7JSXMMZHEOHWAWBJY5BIKDW2KYYI2ELBWBRC2TL7THMT6Z5I";
export const request = { provider: "mock", network: "testnet", sourceAddress, amount: "15.0000000", pixKey: "test@example.com", thirdParty: true, kycUserId: "550e8400-e29b-41d4-a716-446655440000" };
test("ramp amounts preserve Stellar precision and reject ambiguous input", () => {
  assert.equal(amountToUnits("922337203685.4775807", 7), 9223372036854775807n);
  assert.equal(unitsToAmount(150000000n, 7), "15");
  for (const value of ["-1", "1e3", "1,5", "0.00000001", "", "NaN"]) assert.throws(() => amountToUnits(value, 7));
});
test("PIX requests require checked G addresses, exact amounts and explicit third-party choice", () => {
  const parsed = parseQuoteRequest(request, "pods");
  assert.equal(parsed.amount, "15"); assert.ok(parsed.provider!=="tucop"); assert.equal(parsed.thirdParty, true);
  for (const change of [{ sourceAddress: sourceAddress.slice(0,-1)+"A" }, { thirdParty: undefined }, { network: "base" }, { amount: "0" }, { provider: "unknown" }, { pixKey: "x\nsecret" }, { status: "paid" }]) assert.throws(() => parseQuoteRequest({ ...request, ...change }, "pods"));
});
test("provider observations never downgrade paid/refunded or overwrite newer observations", () => {
  assert.equal(applyObservation("paid", 20, { state: "processing", observedAt: 30 }), "paid");
  assert.equal(applyObservation("processing", 20, { state: "paid", observedAt: 10 }), "processing");
  assert.equal(applyObservation("paid", 20, { state: "refunded", observedAt: 30 }), "refunded");
  assert.equal(applyObservation("expired", 20, { state: "paid", observedAt: 30 }), "paid");
});
