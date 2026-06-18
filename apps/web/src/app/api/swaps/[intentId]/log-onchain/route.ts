import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  keccak256,
  parseUnits,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ensureSwapTable, getSql } from "@/lib/db";
import { getTargetNetwork } from "@/lib/network-config";

const purchaseLogAbi = [
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "intentId", type: "bytes32" },
      { name: "swapTxHash", type: "bytes32" },
      { name: "copmAmount", type: "uint256" },
      { name: "tokensSpent", type: "string" },
    ],
    name: "logPurchase",
    outputs: [{ name: "purchaseNumber", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

function getPrivateKey() {
  const privateKey = process.env.BACKEND_LOGGER_PRIVATE_KEY;
  if (!privateKey) throw new Error("Missing BACKEND_LOGGER_PRIVATE_KEY");
  return privateKey.startsWith("0x") ? (privateKey as Hex) : (`0x${privateKey}` as Hex);
}

function getPurchaseLogAddress() {
  const address = process.env.PURCHASE_LOG_CONTRACT_ADDRESS;
  if (!address || !isAddress(address)) {
    throw new Error("Missing PURCHASE_LOG_CONTRACT_ADDRESS");
  }
  return address;
}

function toBytes32(value: string) {
  return value.startsWith("0x") && value.length === 66
    ? (value as Hex)
    : keccak256(stringToHex(value));
}

function formatTokensSpent(tokensSpent: unknown) {
  if (!Array.isArray(tokensSpent)) return "";
  return tokensSpent
    .map((token) => {
      if (!token || typeof token !== "object") return;
      const item = token as { amount?: unknown; symbol?: unknown };
      return typeof item.symbol === "string" && typeof item.amount === "string"
        ? `${item.symbol}:${item.amount}`
        : undefined;
    })
    .filter(Boolean)
    .join(",");
}

export async function POST(
  _request: Request,
  { params }: { params: { intentId: string } }
) {
  try {
    await ensureSwapTable();
    const [swap] = await getSql()`
      SELECT * FROM swap_intents
      WHERE intent_id = ${params.intentId}
    `;

    if (!swap) return NextResponse.json({ error: "Swap not found" }, { status: 404 });
    if (swap.onchain_log_tx_hash) {
      return NextResponse.json({ txHash: swap.onchain_log_tx_hash });
    }
    if (swap.status !== "confirmed") {
      return NextResponse.json({ error: "Swap is not confirmed" }, { status: 409 });
    }

    const txHashes = Array.isArray(swap.swap_tx_hashes) ? swap.swap_tx_hashes : [];
    const lastSwapHash = txHashes.at(-1);
    if (!lastSwapHash) {
      return NextResponse.json({ error: "Missing swap tx hash" }, { status: 400 });
    }

    const targetNetwork = getTargetNetwork();
    const account = privateKeyToAccount(getPrivateKey());
    const publicClient = createPublicClient({
      chain: targetNetwork.chain,
      transport: http(targetNetwork.rpcUrl),
    });
    const walletClient = createWalletClient({
      account,
      chain: targetNetwork.chain,
      transport: http(targetNetwork.rpcUrl),
    });

    const hash = await walletClient.writeContract({
      address: getPurchaseLogAddress() as Address,
      abi: purchaseLogAbi,
      functionName: "logPurchase",
      args: [
        swap.user_address as Address,
        toBytes32(swap.intent_id),
        toBytes32(lastSwapHash),
        parseUnits(String(swap.copm_received ?? "0"), 18),
        formatTokensSpent(swap.tokens_spent),
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    await getSql()`
      UPDATE swap_intents SET
        status = 'logged',
        onchain_log_tx_hash = ${hash},
        updated_at = NOW()
      WHERE intent_id = ${params.intentId}
    `;

    return NextResponse.json({ txHash: hash });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not log swap onchain" },
      { status: 500 }
    );
  }
}
