type SwapLegLog = {
  amount: string;
  amountUsd: number;
  symbol: string;
};

export async function createSwapIntent(input: {
  chainId: number;
  intentId: string;
  requestedCopm: string;
  userAddress: string;
}) {
  await fetch("/api/swaps", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

export async function updateSwapIntent(
  intentId: string,
  input: {
    copmReceived?: string;
    error?: string;
    squidRequestIds?: string[];
    status: string;
    swapTxHashes?: string[];
    tokensSpent?: SwapLegLog[];
  }
) {
  await fetch(`/api/swaps/${intentId}`, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
}

export async function logSwapOnchain(intentId: string) {
  await fetch(`/api/swaps/${intentId}/log-onchain`, {
    method: "POST",
  });
}
