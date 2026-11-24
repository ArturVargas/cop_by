/** Classic Stellar account id: G + 55 base32 chars (no checksum verify beyond charset). */
const STELLAR_G_RE = /^G[A-Z2-7]{55}$/;

export function isStellarGAddress(value: string): boolean {
  return STELLAR_G_RE.test(value.trim().toUpperCase());
}

export function normalizeStellarGAddress(value: string): string {
  return value.trim().toUpperCase();
}

/** UI-only short form, e.g. GANTU....MT6Z5I. Copy/logs keep the full G… */
export function formatShortStellarGAddress(value: string): string {
  const normalized = normalizeStellarGAddress(value);
  if (normalized.length < 12) return normalized;
  return `${normalized.slice(0, 5)}....${normalized.slice(-6)}`;
}
