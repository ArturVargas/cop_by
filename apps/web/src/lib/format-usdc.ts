/** Format Stellar's decimal amount string without losing precision to a float. */
export function formatUsdcAmount(amount: string) {
  const [whole, fraction = ""] = amount.split(".");
  const decimals = fraction.replace(/0+$/, "").padEnd(2, "0");
  return `${BigInt(whole).toLocaleString("es-CO")},${decimals}`;
}
