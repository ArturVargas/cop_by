import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ShareableReceipt, type StellarReceiptData } from "./shareable-receipt";

const receipt: StellarReceiptData = {
  variant: "stellar-transfer",
  amount: "0.1234567",
  completedAt: "2026-11-25T18:00:00.000Z",
  network: "testnet",
  senderAddress: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  recipientAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  recipientAlias: "Ana",
  memo: "Demo",
  txHash: "c081f56eefbd7851dd115ae5a1b00af277aabd32e66858585ada59b215c17ba0",
};

test("Stellar receipts preserve all seven amount decimals and identify test funds", () => {
  const html = renderToStaticMarkup(<ShareableReceipt data={receipt} />);
  assert.match(html, /0,1234567/);
  assert.match(html, /USDC/);
  assert.match(html, /Stellar Testnet/);
  assert.match(html, /Fondos de prueba/);
  assert.doesNotMatch(html, /pesos|COPm/);
});

test("Stellar receipts retain full verification details and distinguish mainnet", () => {
  const html = renderToStaticMarkup(
    <ShareableReceipt data={{ ...receipt, amount: "1", network: "mainnet" }} />
  );
  assert.match(html, /Stellar Mainnet/);
  assert.doesNotMatch(html, /Fondos de prueba/);
  assert.ok(html.includes(receipt.senderAddress));
  assert.ok(html.includes(receipt.recipientAddress));
  assert.ok(html.includes(receipt.txHash));
  assert.match(html, /Ana/);
  assert.match(html, /Demo/);
});

test("existing COPm receipts retain their peso amount", () => {
  const html = renderToStaticMarkup(
    <ShareableReceipt data={{
      variant: "transfer",
      amountLabel: "Enviaste",
      title: "Envío completado",
      receivedCopm: "1234.5",
      txHash: "0x1234567890abcdef",
    }} />
  );
  assert.match(html, /1,234\.5/);
  assert.match(html, /pesos/);
  assert.doesNotMatch(html, /Stellar/);
});

test("large Stellar amounts retain seven decimals without floating point rounding", () => {
  const html = renderToStaticMarkup(<ShareableReceipt data={{ ...receipt, amount: "922337203685.4775807" }} />);
  assert.match(html, /922\.337\.203\.685,4775807/);
});

test("claimable receipts describe a reservation instead of asserting receipt of funds", () => {
  const html = renderToStaticMarkup(<ShareableReceipt data={{ ...receipt, direction: "received", delivery: "claimable" }} />);
  assert.match(html, /Saldo reclamable creado/);
  assert.match(html, /Monto reservado/);
  assert.doesNotMatch(html, /USDC recibido|Recibiste|Envío completado/);
});


import { formatUsdcAmountLabel } from "../lib/format-usdc";
test("USDC balance labels show exactly two decimals without rounding the transfer value", () => {
  const format = formatUsdcAmountLabel;
  assert.equal(format("15.0000000"), "15.00");
  assert.equal(format("0.1234567"), "0.12");
  assert.equal(format("1.0050000"), "1.01");
  assert.equal(format("922337203685.4775807"), "922337203685.48");
});
