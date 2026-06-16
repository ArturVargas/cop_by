import { isAddress, type Address } from "viem";

export const SQUID_API_BASE_URL = "https://v2.api.squidrouter.com";

export function getSquidIntegratorId() {
  return process.env.NEXT_PUBLIC_SQUID_INTEGRATOR_ID ?? "";
}

export function hasSquidIntegratorId() {
  return getSquidIntegratorId().trim().length > 0;
}

export type SquidRouteParams = {
  fromAddress: Address;
  fromAmount: string;
  fromChain: string;
  fromToken: Address;
  toAddress: Address;
  toChain: string;
  toToken: Address;
};

export type SquidRoute = {
  transactionRequest?: {
    target?: string;
    data?: string;
    value?: string;
    gasLimit?: string;
    gasPrice?: string;
  };
};

export async function getSquidRoute(params: SquidRouteParams) {
  const integratorId = getSquidIntegratorId();
  if (!integratorId) throw new Error("Missing Squid integrator id");

  const response = await fetch(`${SQUID_API_BASE_URL}/v2/route`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-integrator-id": integratorId,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) throw new Error("Squid route unavailable");

  const payload = (await response.json()) as { route?: SquidRoute };
  const target = payload.route?.transactionRequest?.target;

  return {
    approvalTarget: target && isAddress(target) ? target : undefined,
    route: payload.route,
  };
}
