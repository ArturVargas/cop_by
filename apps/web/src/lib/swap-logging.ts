type SwapLegLog = {
  amount: string;
  amountUsd: number;
  symbol: string;
};

export async function createSwapIntent(input: {
  chainId: number;
  intentId: string;
  recipientAddress?: string;
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
    feeUsd?: string;
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

export async function createCopmTransfer(input: {
  chainId: number;
  copmAmount: string;
  recipientAddress: string;
  senderAddress: string;
  transferId: string;
}) {
  await fetch("/api/transfers", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

export async function updateCopmTransfer(
  transferId: string,
  input: {
    error?: string;
    status: string;
    txHash?: string;
  }
) {
  await fetch(`/api/transfers/${transferId}`, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
}

export async function createSpendOrder(input: {
  amountCopm: string;
  category?: string;
  chainId: number;
  email: string;
  orderId: string;
  phone?: string;
  productType: "topup" | "giftcard";
  provider: string;
  userAddress: string;
}) {
  const response = await fetch("/api/spend-orders", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("No pudimos crear la orden.");
  }

  return response.json() as Promise<{ paymentAddress: `0x${string}` }>;
}

export async function updateSpendOrder(
  orderId: string,
  input: {
    error?: string;
    paymentTxHash?: string;
    status: string;
  }
) {
  await fetch(`/api/spend-orders/${orderId}`, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
}
