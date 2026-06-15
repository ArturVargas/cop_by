export const SQUID_API_BASE_URL = "https://apiplus.squidrouter.com";

export function getSquidIntegratorId() {
  return process.env.NEXT_PUBLIC_SQUID_INTEGRATOR_ID ?? "";
}

export function hasSquidIntegratorId() {
  return getSquidIntegratorId().trim().length > 0;
}
