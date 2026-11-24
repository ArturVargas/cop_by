/** Classic Stellar account id: G + 55 base32 chars (no checksum verify beyond charset). */
const STELLAR_G_RE = /^G[A-Z2-7]{55}$/;

export function isStellarGAddress(value: string): boolean {
  return STELLAR_G_RE.test(value.trim().toUpperCase());
}

export function normalizeStellarGAddress(value: string): string {
  return value.trim().toUpperCase();
}
