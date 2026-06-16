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
  slippage?: number;
  toAddress: Address;
  toChain: string;
  toToken: Address;
};

export type SquidRoute = {
  quoteId?: string;
  transactionRequest?: {
    target?: string;
    data?: `0x${string}`;
    value?: string;
    gasLimit?: string;
    gasPrice?: string;
  };
};

export type SquidRouteResult = {
  approvalTarget?: Address;
  requestId?: string;
  route?: SquidRoute;
};

export type SquidStatusParams = {
  fromChainId: string;
  quoteId?: string;
  requestId?: string;
  toChainId: string;
  transactionId: string;
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
  const requestId = response.headers.get("x-request-id") ?? undefined;

  return {
    approvalTarget: target && isAddress(target) ? target : undefined,
    requestId,
    route: payload.route,
  } satisfies SquidRouteResult;
}

export async function getSquidStatus(params: SquidStatusParams) {
  const integratorId = getSquidIntegratorId();
  if (!integratorId) throw new Error("Missing Squid integrator id");

  const search = new URLSearchParams({
    transactionId: params.transactionId,
    fromChainId: params.fromChainId,
    toChainId: params.toChainId,
  });
  if (params.requestId) search.set("requestId", params.requestId);
  if (params.quoteId) search.set("quoteId", params.quoteId);

  const response = await fetch(`${SQUID_API_BASE_URL}/v2/status?${search}`, {
    headers: {
      "x-integrator-id": integratorId,
    },
  });

  if (!response.ok) throw new Error("Squid status unavailable");

  return response.json() as Promise<{ squidTransactionStatus?: string }>;
}
