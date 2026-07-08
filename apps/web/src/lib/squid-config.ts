import { isAddress, type Address } from "viem";

export const SQUID_API_BASE_URL = "https://v2.api.squidrouter.com";
export const SQUID_INTEGRATOR_FEE_BPS = 25; // 0.25%, configured by Squid for this integrator id.
export const SQUID_INTEGRATOR_FEE_SPLIT = "50/50";
export const SQUID_DEFAULT_PREFERRED_DEXES = ["Uniswap V3"] as const;

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
  prefer?: string[];
  slippage?: number;
  toAddress: Address;
  toChain: string;
  toToken: Address;
};

export type SquidRouteAttempt = {
  params: SquidRouteParams;
  requestId?: string;
  errorMessage?: string;
};

type SquidRouteAction = {
  data?: {
    dex?: string;
  };
  provider?: string;
  type?: string;
};

export type SquidRoute = {
  estimate?: {
    actions?: SquidRouteAction[];
    fromAmount?: string;
    toAmount?: string;
    toAmountMin?: string;
    toAmountUSD?: string;
    feeCosts?: Array<{ amountUsd?: string; name?: string }>;
    gasCosts?: Array<{ amountUsd?: string; name?: string }>;
  };
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

export class SquidApiError extends Error {
  attempts?: SquidRouteAttempt[];
  params?: SquidRouteParams;
  requestId?: string;
  status: number;
  type?: string;

  constructor({
    attempts,
    message,
    params,
    requestId,
    status,
    type,
  }: {
    attempts?: SquidRouteAttempt[];
    message: string;
    params?: SquidRouteParams;
    requestId?: string;
    status: number;
    type?: string;
  }) {
    super(message);
    this.name = "SquidApiError";
    this.attempts = attempts;
    this.params = params;
    this.requestId = requestId;
    this.status = status;
    this.type = type;
  }
}

export type SquidStatusParams = {
  fromChainId: string;
  quoteId?: string;
  requestId?: string;
  toChainId: string;
  transactionId: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getSquidPreferredDexes() {
  const configured = process.env.NEXT_PUBLIC_SQUID_PREFER_DEX?.trim();
  if (!configured) return [...SQUID_DEFAULT_PREFERRED_DEXES];

  const dexes = configured
    .split(",")
    .map((dex) => dex.trim())
    .filter(Boolean);

  return dexes.length ? dexes : [...SQUID_DEFAULT_PREFERRED_DEXES];
}

export function getSquidRouteProviders(route?: SquidRoute) {
  const providers = new Set<string>();

  for (const action of route?.estimate?.actions ?? []) {
    if (action.type === "swap") {
      if (action.data?.dex) providers.add(action.data.dex);
      if (action.provider) providers.add(action.provider);
    }
  }

  return [...providers];
}

function isSquidLiquidityRouteError(error: unknown) {
  if (!(error instanceof SquidApiError)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes("low liquidity") ||
    message.includes("no route") ||
    message.includes("route unavailable") ||
    message.includes("insufficient liquidity")
  );
}

export function formatSquidErrorForSupport(error: SquidApiError) {
  const attempts =
    error.attempts ??
    (error.params
      ? [{ params: error.params, requestId: error.requestId, errorMessage: error.message }]
      : []);

  return JSON.stringify(
    {
      api: `${SQUID_API_BASE_URL}/v2/route`,
      integratorId: getSquidIntegratorId() || "[missing NEXT_PUBLIC_SQUID_INTEGRATOR_ID]",
      error: {
        message: error.message,
        status: error.status,
        type: error.type,
        requestId: error.requestId,
      },
      quoteAttempts: attempts.map((attempt) => ({
        requestId: attempt.requestId,
        params: attempt.params,
        errorMessage: attempt.errorMessage,
      })),
    },
    null,
    2
  );
}

function logSquidRouteFailure(params: SquidRouteParams, error: SquidApiError) {
  console.error("[Squid route failed]", formatSquidErrorForSupport(error));
}

export async function getSquidCopmRoute(params: SquidRouteParams) {
  const preferredDexes = getSquidPreferredDexes();
  const attempts: SquidRouteAttempt[] = [];

  if (preferredDexes.length) {
    const preferredParams = { ...params, prefer: preferredDexes };
    try {
      return await getSquidRoute(preferredParams);
    } catch (error) {
      if (error instanceof SquidApiError) {
        attempts.push({
          params: preferredParams,
          requestId: error.requestId,
          errorMessage: error.message,
        });
        if (!isSquidLiquidityRouteError(error)) {
          error.attempts = attempts;
          logSquidRouteFailure(preferredParams, error);
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  try {
    return await getSquidRoute(params);
  } catch (error) {
    if (error instanceof SquidApiError) {
      attempts.push({
        params,
        requestId: error.requestId,
        errorMessage: error.message,
      });
      error.attempts = attempts;
      logSquidRouteFailure(params, error);
    }
    throw error;
  }
}

export async function getSquidRoute(params: SquidRouteParams) {
  const integratorId = getSquidIntegratorId();
  if (!integratorId) throw new Error("Missing Squid integrator id");

  let response: Response | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await fetch(`${SQUID_API_BASE_URL}/v2/route`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-integrator-id": integratorId,
      },
      body: JSON.stringify(params),
    });

    if (response.status !== 429) break;

    const payload = (await response.json().catch(() => undefined)) as
      | { retryAfter?: number }
      | undefined;
    await sleep((payload?.retryAfter ?? 1) * 1000);
  }

  if (!response?.ok) {
    const payload = (await response?.json().catch(() => undefined)) as
      | { message?: string; type?: string }
      | undefined;
    const error = new SquidApiError({
      message: payload?.message ?? "Squid route unavailable",
      params,
      requestId: response?.headers.get("x-request-id") ?? undefined,
      status: response?.status ?? 0,
      type: payload?.type,
    });
    logSquidRouteFailure(params, error);
    throw error;
  }

  const payload = (await response.json()) as { route?: SquidRoute };
  const target = payload.route?.transactionRequest?.target;
  const requestId = response.headers.get("x-request-id") ?? undefined;

  return {
    approvalTarget: target && isAddress(target) ? target : undefined,
    requestId,
    route: payload.route,
  } satisfies SquidRouteResult;
}

export function getSquidServiceFeeUsd(route?: SquidRoute) {
  const costs = route?.estimate?.feeCosts ?? [];
  const serviceCosts = costs.filter((cost) =>
    cost.name?.toLowerCase().includes("service")
  );
  const relevantCosts = serviceCosts.length ? serviceCosts : costs;
  const total = relevantCosts.reduce(
    (sum, cost) => sum + Number(cost.amountUsd ?? 0),
    0
  );

  return Number.isFinite(total) ? total : 0;
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
