import { StrKey } from "@stellar/stellar-sdk";
import { RampError } from "./errors";
import type { ProviderObservation, QuoteRequest, RampProviderId, RampState } from "./types";

export function amountToUnits(value: string, decimals: number): bigint {
  if (typeof value !== "string" || value.length > 48 || !new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(value)) throw new RampError("INVALID_AMOUNT", "Monto inválido o con demasiados decimales.");
  const [whole, fraction = ""] = value.split(".");
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0"));
  if (units > 9_223_372_036_854_775_807n) throw new RampError("INVALID_AMOUNT", "El monto supera el límite permitido.");
  return units;
}
export function unitsToAmount(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${value / scale}${fraction ? `.${fraction}` : ""}`;
}
export function isProvider(value: unknown): value is RampProviderId { return value === "pods" || value === "tucop" || value === "mock"; }
export function parseQuoteRequest(body: unknown, defaultProvider: RampProviderId): QuoteRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RampError("INVALID_REQUEST", "Se requiere un objeto JSON.");
  const b = body as Record<string, unknown>;
  const fields = new Set(["provider", "network", "sourceAddress", "amount", "pixKey", "thirdParty", "kycUserId"]);
  if (Object.keys(b).some(key => !fields.has(key))) throw new RampError("INVALID_REQUEST", "La solicitud contiene campos no admitidos.");
  const provider = b.provider ?? defaultProvider;
  if (!isProvider(provider) || (b.network !== "mainnet" && b.network !== "testnet")) throw new RampError("INVALID_REQUEST", "Proveedor o red no válidos.");
  if (typeof b.sourceAddress !== "string" || !StrKey.isValidEd25519PublicKey(b.sourceAddress)) throw new RampError("INVALID_ADDRESS", "Se requiere una cuenta Stellar G válida.");
  if (typeof b.amount !== "string" || amountToUnits(b.amount, 7) <= 0n) throw new RampError("INVALID_AMOUNT", "El monto debe ser mayor a cero.");
  if (typeof b.pixKey !== "string" || !b.pixKey.trim() || b.pixKey.length > 2048 || /[\u0000-\u001f\u007f]/.test(b.pixKey)) throw new RampError("INVALID_PIX_KEY", "Llave PIX no válida.");
  if (typeof b.thirdParty !== "boolean") throw new RampError("INVALID_REQUEST", "Indica explícitamente si el pago es a un tercero.");
  if (typeof b.kycUserId !== "string" || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(b.kycUserId)) throw new RampError("INVALID_KYC_ID", "Se requiere el identificador KYC del proveedor.");
  return { provider, network: b.network, sourceAddress: b.sourceAddress, amount: unitsToAmount(amountToUnits(b.amount, 7), 7), pixKey: b.pixKey.trim(), thirdParty: b.thirdParty, kycUserId: b.kycUserId };
}
export function applyObservation(current: RampState, previousTime: number, observation: ProviderObservation): RampState {
  if (observation.observedAt < previousTime) return current;
  if (current === "refunded") return current;
  if (current === "paid" && observation.state !== "paid" && observation.state !== "refunded") return current;
  // Once funding is reported/detected, pending must never invite another payment,
  // even when provider timestamps tie or a newer response regresses temporarily.
  if (["funding_reported", "processing", "expired", "failed"].includes(current) && observation.state === "awaiting_funding") return current;
  return observation.state;
}
export function validateCustomerId(value: string | null): string {
  if (!value || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new RampError("INVALID_CUSTOMER", "Falta un identificador de cliente válido.");
  return value;
}
export function validateIdempotencyKey(value: string | null): string {
  if (!value || !/^[A-Za-z0-9_.:-]{8,128}$/.test(value)) throw new RampError("INVALID_IDEMPOTENCY_KEY", "Se requiere Idempotency-Key (8–128 caracteres).");
  return value;
}
