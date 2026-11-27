import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import * as accountShare from "./stellar-account-share";

const address = "GANTUVPE7JSXMMZHEOHWAWBJY5BIKDW2KYYI2ELBWBRC2TL7THMT6Z5I";
const share = accountShare.shareStellarAccount;

function navigatorFixture(t: TestContext, value: object) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value });
  t.after(() => { if (original) Object.defineProperty(globalThis, "navigator", original); else Reflect.deleteProperty(globalThis, "navigator"); });
}

test("native account sharing preserves address and identifies test funds", async (t) => {
  let payload: ShareData | undefined;
  navigatorFixture(t, { share: async (data: ShareData) => { payload = data; } });
  assert.equal(await share(address, "testnet"), "shared");
  assert.ok(payload?.text?.includes(address));
  assert.match(payload?.text ?? "", /Stellar Testnet/);
  assert.match(payload?.text ?? "", /prueba/);
  assert.equal(payload?.url, undefined);
  await share(address, "mainnet");
  assert.match(payload?.text ?? "", /Stellar Mainnet/);
  assert.doesNotMatch(payload?.text ?? "", /prueba/);
});

test("unsupported sharing copies only the complete address", async (t) => {
  let copied = "";
  navigatorFixture(t, { clipboard: { writeText: async (text: string) => { copied = text; } } });
  assert.equal(await share(address, "mainnet"), "copied");
  assert.equal(copied, address);
});

test("cancelled sharing neither reports failure nor silently copies", async (t) => {
  navigatorFixture(t, { share: async () => { throw new DOMException("cancelled", "AbortError"); }, clipboard: { writeText: async () => { assert.fail("Cancelled sharing must not copy"); } } });
  assert.equal(await share(address, "testnet"), "cancelled");
});

test("sharing errors and denied clipboard remain failures", async (t) => {
  navigatorFixture(t, { share: async () => { throw new DOMException("denied", "NotAllowedError"); } });
  await assert.rejects(() => share(address, "testnet"), { name: "NotAllowedError" });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async () => { throw new Error("denied"); } } } });
  await assert.rejects(() => share(address, "mainnet"), /denied/);
});
