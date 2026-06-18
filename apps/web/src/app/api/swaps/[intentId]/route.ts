import { NextResponse } from "next/server";

import { ensureSwapTable, getSql } from "@/lib/db";

type UpdateSwapBody = {
  copmReceived?: string;
  error?: string | null;
  onchainLogTxHash?: string | null;
  squidRequestIds?: unknown[];
  status?: string;
  swapTxHashes?: string[];
  tokensSpent?: unknown[];
};

export async function PATCH(
  request: Request,
  { params }: { params: { intentId: string } }
) {
  try {
    const body = (await request.json()) as UpdateSwapBody;
    const tokensSpent = body.tokensSpent === undefined ? null : JSON.stringify(body.tokensSpent);
    const squidRequestIds =
      body.squidRequestIds === undefined ? null : JSON.stringify(body.squidRequestIds);
    const swapTxHashes =
      body.swapTxHashes === undefined ? null : JSON.stringify(body.swapTxHashes);
    await ensureSwapTable();

    const [swap] = await getSql()`
      UPDATE swap_intents SET
        status = COALESCE(${body.status ?? null}, status),
        tokens_spent = COALESCE(${tokensSpent}::jsonb, tokens_spent),
        squid_request_ids = COALESCE(${squidRequestIds}::jsonb, squid_request_ids),
        swap_tx_hashes = COALESCE(${swapTxHashes}::jsonb, swap_tx_hashes),
        copm_received = COALESCE(${body.copmReceived ?? null}, copm_received),
        onchain_log_tx_hash = COALESCE(${body.onchainLogTxHash ?? null}, onchain_log_tx_hash),
        error = COALESCE(${body.error ?? null}, error),
        updated_at = NOW()
      WHERE intent_id = ${params.intentId}
      RETURNING *
    `;

    if (!swap) {
      return NextResponse.json({ error: "Swap not found" }, { status: 404 });
    }

    return NextResponse.json({ swap });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update swap" },
      { status: 500 }
    );
  }
}
