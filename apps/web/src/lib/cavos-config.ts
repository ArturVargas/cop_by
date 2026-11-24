export type CavosNetwork = "testnet" | "mainnet";
export type CavosEnvironment = "development" | "production";

export const CAVOS_APP_SALT = "cop-by";

export const CAVOS_APP_ID = process.env.NEXT_PUBLIC_CAVOS_APP_ID ?? "";

export const CAVOS_NETWORK: CavosNetwork =
  process.env.NEXT_PUBLIC_CAVOS_NETWORK === "mainnet" ? "mainnet" : "testnet";

export const CAVOS_ENVIRONMENT: CavosEnvironment =
  process.env.NEXT_PUBLIC_CAVOS_ENVIRONMENT === "production"
    ? "production"
    : "development";

/**
 * Must match a Callback URL in Cavos dashboard exactly (including trailing slash).
 * Default matches Next on `/` which is `http://localhost:3000/`.
 */
export const CAVOS_REDIRECT_URI =
  process.env.NEXT_PUBLIC_CAVOS_REDIRECT_URI ?? "http://localhost:3000/";

/** Circle USDC on Stellar mainnet. Full issuer, never truncate. */
export const STELLAR_USDC_MAINNET = {
  code: "USDC",
  issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  /** Stellar Asset Contract id for Circle USDC (Soroban transfer). */
  sac: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
} as const;

/**
 * Circle USDC on Stellar testnet (centre.io).
 * Cavos demo USDC is a different issuer - do not mix them.
 */
export const STELLAR_USDC_TESTNET = {
  code: "USDC",
  issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  sac: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
} as const;

export function getStellarUsdc() {
  return CAVOS_NETWORK === "mainnet" ? STELLAR_USDC_MAINNET : STELLAR_USDC_TESTNET;
}

export function isCavosConfigured() {
  return CAVOS_APP_ID.length > 0;
}

