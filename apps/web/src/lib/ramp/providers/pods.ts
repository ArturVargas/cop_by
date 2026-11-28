import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import { STELLAR_USDC_MAINNET } from "@/lib/cavos-config";
import { amountToUnits, unitsToAmount } from "../domain";
import { PodsClient, invalidPods as invalid, podsObject as object, podsText as text } from "./pods-client";
import { RampError } from "../errors";
import { normalizeRampLimits } from "../kyc";
import type { ProviderEvent, ProviderObservation, QuoteRequest, PodsQuoteRequest, RampFee, RampProvider, RampQuote, RampState } from "../types";

type PodsConfig = { apiKey?: string; baseUrl?: string; enabled?: boolean; stellarToken?: string; webhookSecret?: string; fetcher?: typeof fetch; now?: () => number; timeoutMs?: number };
function units(value: unknown): bigint {
  const raw = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof raw !== "string" || !/^\d{1,19}$/.test(raw) || BigInt(raw) > 9_223_372_036_854_775_807n) return invalid();
  return BigInt(raw);
}

export class PodsRampProvider implements RampProvider {
  readonly id = "pods" as const;
  private readonly client: PodsClient;
  private readonly now: () => number;
  constructor(private readonly config: PodsConfig) { this.client = new PodsClient(config); this.now = config.now ?? Date.now; }
  capability() {
    const available = this.config.enabled === true && !!this.config.apiKey && !!this.config.stellarToken;
    return { id: this.id, available, networks: ["mainnet" as const], ...(available ? {} : { reason: "PODS_STELLAR_NOT_CONFIGURED" }) };
  }
  private get(path: string, parameters?: Record<string,string>) { return this.client.request(path, {parameters}); }
  async createQuote(request: QuoteRequest): Promise<RampQuote> {
    if(request.provider==="tucop") throw new RampError("INVALID_PROVIDER","La solicitud no corresponde a Pods.");
    if (!this.capability().available) throw new RampError("PROVIDER_NOT_CONFIGURED", "Pods Stellar requiere habilitación y credenciales del servidor.", 503);
    if (request.network !== "mainnet") throw new RampError("UNSUPPORTED_NETWORK", "La ruta real de Pods no admite Stellar Testnet.", 422);
    const kyc = await this.get("/api/v1/kyc/status", { kycUserId: request.kycUserId });
    const wallets = [kyc.walletAddress, ...(Array.isArray(kyc.walletAddresses) ? kyc.walletAddresses : [])];
    if (kyc.kycUserId !== request.kycUserId || kyc.status !== "approved" || kyc.brlaEnabled !== true || !wallets.includes(request.sourceAddress)) throw new RampError("KYC_REQUIRED", "Se requiere KYC aprobado para BRL y vinculado a esta cuenta Stellar.", 422);
    const limits=normalizeRampLimits(await this.get("/api/v1/limits",{currency:"BRL",originAddress:request.sourceAddress}));
    if(limits.blocked || BigInt(limits.offramp.remaining.replace(".",""))===0n || BigInt(limits.offramp.remainingGlobalUsd.replace(".",""))===0n) throw new RampError("RAMP_LIMIT_BLOCKED","La cuenta no tiene límite disponible para retirar.",422);
    const body = await this.get("/v2/swap/quote", { originChain: "stellar", destinationChain: "fiat", tokenIn: this.config.stellarToken!, tokenOut: "BRL", amountIn: amountToUnits(request.amount, 7).toString(), originAddress: request.sourceAddress, pixKey: request.pixKey, thirdParty: String(request.thirdParty) });
    const q = object(body.quote); this.validatePair(q, request, this.config.stellarToken!);
    const providerQuoteId = text(q.quoteId);
    if (q.id !== undefined && q.id !== providerQuoteId) return invalid();
    const dates: number[] = [];
    if (q.deadlineDate !== undefined) dates.push(Date.parse(text(q.deadlineDate)));
    if (q.deadline !== undefined) dates.push(typeof q.deadline === "number" && Number.isSafeInteger(q.deadline) ? q.deadline * 1000 : NaN);
    const expiry = Math.min(...dates);
    if (!dates.length || dates.some(value => !Number.isFinite(value)) || expiry <= this.now() || expiry > this.now() + 360000) return invalid();
    const breakdown = object(q.feeBreakdown); if (!Array.isArray(breakdown.charges) || breakdown.charges.length > 50) return invalid();
    const fees: RampFee[] = breakdown.charges.map(value => {
      const charge = object(value); const currency = charge.symbol;
      if ((currency !== "USDC" && currency !== "BRL") || charge.decimals !== (currency === "USDC" ? 7 : 2)) return invalid();
      return { kind: text(charge.kind, 80), label: text(charge.label), amount: unitsToAmount(units(charge.amountRaw), currency === "USDC" ? 7 : 2), currency };
    });
    const destinationAmount = unitsToAmount(units(object(q.tokenOut).expectedAmountOut ?? object(q.tokenOut).amount), 2);
    if (amountToUnits(destinationAmount, 2) <= 0n) return invalid();
    const rawTransactions = body.transactionData;
    const simpleDeposit = rawTransactions === undefined || (Array.isArray(rawTransactions) && rawTransactions.length === 0);
    const destination = body.depositAddress;
    const funding: RampQuote["funding"] = typeof destination === "string" && StrKey.isValidMed25519PublicKey(destination) && simpleDeposit
      ? { kind: "stellar_payment", network: "mainnet", sourceAddress: request.sourceAddress, destination, amount: request.amount, assetCode: "USDC", assetIssuer: STELLAR_USDC_MAINNET.issuer }
      : { kind: "unavailable", reason: "PODS_STELLAR_FUNDING_CONTRACT_UNVERIFIED" };
    const recipient = q.pixRecipient && typeof q.pixRecipient === "object" ? q.pixRecipient as Record<string, unknown> : null;
    return { providerQuoteId, providerTokenId: this.config.stellarToken, ...(body.id !== undefined ? { providerActionId: text(body.id) } : {}), expiresAt: new Date(expiry).toISOString(), sourceAmount: request.amount, destinationAmount, fees, ...(typeof recipient?.name === "string" ? { recipientName: text(recipient.name) } : {}), funding };
  }
  private validatePair(q: Record<string, unknown>, request: PodsQuoteRequest, token: string) {
    const source = object(q.tokenIn), destination = object(q.tokenOut);
    if (q.originChain !== "stellar" || q.destinationChain !== "fiat" || source.contract !== token || source.symbol !== "USDC" || source.decimals !== 7 || units(source.amount) !== amountToUnits(request.amount, 7) || destination.symbol !== "BRL" || destination.contract !== "BRL" || destination.decimals !== 2) return invalid();
    if (q.originAddress !== undefined && q.originAddress !== request.sourceAddress) return invalid();
    if (q.thirdParty !== undefined && q.thirdParty !== request.thirdParty) return invalid();
    if (q.pixKey !== undefined && q.pixKey !== request.pixKey) return invalid();
  }
  async getStatus(request: QuoteRequest, quote: RampQuote): Promise<ProviderObservation> {
    if(request.provider==="tucop") throw new RampError("INVALID_PROVIDER","La solicitud no corresponde a Pods.");
    const body = await this.get(`/v2/swap/status/${encodeURIComponent(quote.providerQuoteId)}`);
    if (body.quoteId !== quote.providerQuoteId) return invalid();
    this.validatePair(body, request, text(quote.providerTokenId));
    if (units(object(body.tokenOut).expectedAmountOut ?? object(body.tokenOut).amount) !== amountToUnits(quote.destinationAmount, 2)) return invalid();
    const states: Record<string, RampState> = { pending: "awaiting_funding", confirmed: "processing", processing: "processing", fulfilled: "paid", expired: "expired", failed: "failed", refunded: "refunded" };
    const state = typeof body.status === "string" ? states[body.status] : undefined;
    const observedAt = Date.parse(text(body.updatedAt));
    if (!state || !Number.isFinite(observedAt) || observedAt > this.now() + 300000) return invalid();
    const settlement = body.fiatSettlement && typeof body.fiatSettlement === "object" ? body.fiatSettlement as Record<string, unknown> : null;
    if (body.fiatSettlement != null && settlement?.method !== "PIX") return invalid();
    const failure = body.failure && typeof body.failure === "object" ? body.failure as Record<string, unknown> : null;
    return { state, observedAt, ...(typeof settlement?.endToEndId === "string" ? { receiptId: text(settlement.endToEndId) } : {}), ...(typeof settlement?.refundEndToEndId === "string" ? { refundReceiptId: text(settlement.refundEndToEndId) } : {}), ...(typeof failure?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(failure.code) ? { failureCode: failure.code } : {}) };
  }
  verifyWebhook(raw: Uint8Array, headers: Headers): ProviderEvent {
    if (!this.config.webhookSecret) throw new RampError("WEBHOOK_NOT_CONFIGURED", "Falta configurar la firma de Pods.", 503);
    const id = headers.get("x-deframe-webhook-id") ?? "", timestamp = headers.get("x-deframe-webhook-timestamp") ?? "", signature = headers.get("x-deframe-webhook-signature") ?? "";
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !/^\d{1,12}$/.test(timestamp) || Math.abs(this.now()/1000 - Number(timestamp)) > 300 || !/^v1=[a-f0-9]{64}$/i.test(signature)) throw new RampError("INVALID_WEBHOOK", "Firma de webhook no válida.", 401);
    const expected = createHmac("sha256", this.config.webhookSecret).update(`${timestamp}.${id}.`).update(raw).digest();
    const actual = Buffer.from(signature.slice(3), "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new RampError("INVALID_WEBHOOK", "Firma de webhook no válida.", 401);
    let envelope: Record<string, unknown>; try { envelope = object(JSON.parse(new TextDecoder().decode(raw))); } catch { throw new RampError("INVALID_WEBHOOK_BODY", "El webhook no contiene JSON válido."); }
    const data = envelope.data && typeof envelope.data === "object" ? envelope.data as Record<string, unknown> : null;
    const relevant = envelope.messageType === "ACTION_UPDATE" && typeof data?.id === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(data.id);
    return { id, digest: createHash("sha256").update(raw).digest("hex"), actionId: relevant ? String(data!.id) : null, relevant };
  }
}
