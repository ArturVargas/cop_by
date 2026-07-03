import { formatUnits } from "viem";

export const MAX_PESO_DECIMALS = 4;

export function truncateToDecimals(value: number, maxDecimals = MAX_PESO_DECIMALS) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** maxDecimals;
  return Math.floor(value * factor) / factor;
}

export function formatPesoAmount(value: number, maxDecimals = MAX_PESO_DECIMALS) {
  const truncated = truncateToDecimals(value, maxDecimals);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
  }).format(truncated);
}

export function formatPesoAmountFromString(
  value: string,
  maxDecimals = MAX_PESO_DECIMALS
) {
  const normalized = value.replace(/[^\d.-]/g, "");
  if (!normalized) return "0";

  const num = Number(normalized);
  if (!Number.isFinite(num)) return value;

  return formatPesoAmount(num, maxDecimals);
}

export function formatPesoAmountFromBigInt(
  value: bigint,
  decimals: number,
  maxDecimals = MAX_PESO_DECIMALS
) {
  return formatPesoAmountFromString(formatUnits(value, decimals), maxDecimals);
}
