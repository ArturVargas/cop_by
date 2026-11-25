import assert from "node:assert/strict";
import test from "node:test";
import { mapStellarOperations } from "./stellar-activity";

const address = "GANTUVPE7JSXMMZHEOHWAWBJY5BIKDW2KYYI2ELBWBRC2TL7THMT6Z5I";
const recipient = "GBIMQFMFVQ2JGNSKL6RGPBYW3MCV7WTUEMOEBB44EAVMKRXBZW7VROGR";
const asset = { code: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" };
const movement = {
  asset_code: asset.code,
  asset_issuer: asset.issuer,
  from: address,
  to: recipient,
  amount: "1.0000000",
};
const operation = {
  id: "25379086306140161",
  type: "payment",
  transaction_successful: true,
  created_at: "2026-11-25T01:06:27Z",
  transaction_hash: "c081f56eefbd7851dd115ae5a1b00af277aabd32e66858585ada59b215c17ba0",
  transaction: { memo: "SHIP-S97KF8", memo_type: "text" },
  ...movement,
};

test("classic USDC payments preserve amount, direction, memo and transaction hash", () => {
  const [item] = mapStellarOperations([operation], address, asset);
  assert.equal(item.direction, "sent");
  assert.equal(item.amount, "1.0000000");
  assert.equal(item.from, address);
  assert.equal(item.to, recipient);
  assert.equal(item.memo, "SHIP-S97KF8");
  assert.equal(item.txHash, operation.transaction_hash);
});

test("Soroban transfers include incoming transfers and keep each balance change distinct", () => {
  const items = mapStellarOperations([{
    ...operation,
    type: "invoke_host_function",
    asset_balance_changes: [
      { ...movement, type: "transfer" },
      { ...movement, type: "transfer", from: recipient, to: address, amount: "0.1234567" },
    ],
  }], address, asset);
  assert.equal(items.length, 2);
  assert.equal(items[0].direction, "sent");
  assert.equal(items[1].direction, "received");
  assert.equal(items[1].amount, "0.1234567");
  assert.notEqual(items[0].id, items[1].id);
});

test("failed operations, lookalike assets and unrelated or self transfers are excluded", () => {
  const items = mapStellarOperations([
    { ...operation, transaction_successful: false },
    { ...operation, asset_issuer: "ANOTHER_ISSUER" },
    { ...operation, asset_code: "USDT" },
    { ...operation, from: recipient, to: recipient },
    { ...operation, to: address },
    { ...operation, type: "change_trust" },
  ], address, asset);
  assert.deepEqual(items, []);
});

test("path payments display the delivered USDC amount", () => {
  const [item] = mapStellarOperations([{
    ...operation,
    type: "path_payment_strict_receive",
    from: recipient,
    to: address,
    amount: "2.5000000",
    source_amount: "3.0000000",
  }], address, asset);
  assert.equal(item.direction, "received");
  assert.equal(item.amount, "2.5000000");
});

test("outgoing path payments use the source asset and debit rather than destination amount", () => {
  const path = { ...operation, type: "path_payment_strict_send", source_asset_code: "USDC", source_asset_issuer: asset.issuer, source_amount: "3.0000000", amount: "2.5000000" };
  assert.equal(mapStellarOperations([path], address, asset)[0].amount, "3.0000000");
  assert.equal(mapStellarOperations([path], address, asset)[0].kind, "conversion");
  assert.deepEqual(mapStellarOperations([{ ...path, source_asset_code: "XLM", source_asset_issuer: undefined }], address, asset), []);
  const [conversion] = mapStellarOperations([{ ...path, asset_code: "XLM", asset_issuer: undefined }], address, asset);
  assert.equal(conversion.amount, "3.0000000");
  assert.equal(conversion.kind, "conversion");
});

test("self conversions track the USDC debit without inventing a transfer to someone else", () => {
  const [item] = mapStellarOperations([{
    ...operation, type: "path_payment_strict_send", to: address,
    source_asset_code: "USDC", source_asset_issuer: asset.issuer,
    source_amount: "2.0000000", asset_code: "XLM", asset_issuer: undefined,
  }], address, asset);
  assert.equal(item.direction, "sent");
  assert.equal(item.amount, "2.0000000");
  assert.equal(item.kind, "conversion");
});

test("Reserve claimable sends remain in history as creations rather than delivered payments", () => {
  const [item] = mapStellarOperations([{
    ...operation, type: "create_claimable_balance", source_account: address,
    asset: `USDC:${asset.issuer}`, claimants: [{ destination: address }, { destination: recipient }],
  }], address, asset);
  assert.equal(item.kind, "claimable");
  assert.equal(item.to, recipient);
  assert.equal(item.amount, "1.0000000");
});
