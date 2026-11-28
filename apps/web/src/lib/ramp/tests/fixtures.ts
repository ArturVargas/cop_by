import { Account, MuxedAccount } from "@stellar/stellar-sdk";
import { STELLAR_USDC_MAINNET } from "@/lib/cavos-config";
import { parseQuoteRequest } from "../domain";
export const address = "GANTUVPE7JSXMMZHEOHWAWBJY5BIKDW2KYYI2ELBWBRC2TL7THMT6Z5I";
export const otherAddress = "GBIMQFMFVQ2JGNSKL6RGPBYW3MCV7WTUEMOEBB44EAVMKRXBZW7VROGR";
export const muxed = new MuxedAccount(new Account(otherAddress, "0"), "123456789").accountId();
export const now = Date.parse("2026-11-27T18:00:00Z");
export const token = `USDC:${STELLAR_USDC_MAINNET.issuer}`;
import type { PodsQuoteRequest } from "../types";
export const request = parseQuoteRequest({ provider: "pods", network: "mainnet", sourceAddress: address, amount: "15.00", pixKey: "test@example.com", thirdParty: true, kycUserId: "550e8400-e29b-41d4-a716-446655440000" }, "pods") as PodsQuoteRequest;
export function podsResponse() {
  return { quote: { id: "quote-1", quoteId: "quote-1", originChain: "stellar", destinationChain: "fiat", originAddress: address, tokenIn: { contract: token, symbol: "USDC", decimals: 7, amount: "150000000" }, tokenOut: { contract: "BRL", symbol: "BRL", decimals: 2, amount: "7500", expectedAmountOut: "7500" }, deadline: (now + 300000) / 1000, deadlineDate: new Date(now + 300000).toISOString(), feeBreakdown: { charges: [{ kind: "paymentRail", label: "Pix fee", amountRaw: "20", decimals: 2, symbol: "BRL" }] } }, depositAddress: muxed, transactionData: [], id: "action-1" };
}
