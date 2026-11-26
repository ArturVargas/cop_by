/** Format Stellar's decimal amount string without losing precision to a float. */
export function formatUsdcAmount(amount: string) {
  const [whole, fraction = ""] = amount.split(".");
  const decimals = fraction.replace(/0+$/, "").padEnd(2, "0");
  return `${BigInt(whole).toLocaleString("es-CO")},${decimals}`;
}

/** Compact balance label only; transfer values retain their ledger precision. */
export function formatUsdcAmountLabel(amount: string) {
  const [whole, fraction = ""] = amount.split(".");
  const cents = BigInt(whole) * 100n + (BigInt(fraction.padEnd(3, "0").slice(0, 3)) + 5n) / 10n;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** Editable amount: at least two decimals, without discarding nonzero precision. */
export function formatUsdcInputAmount(amount: string) {
  const [whole, fraction = ""] = amount.split(".");
  return `${whole}.${fraction.replace(/0+$/, "").padEnd(2, "0")}`;
}
