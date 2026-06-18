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
    await ensureSwapTable();

    const [swap] = await getSql()`
      UPDATE swap_intents SET
        status = COALESCE(${body.status ?? null}, status),
        tokens_spent = COALESCE(${JSON.stringify(body.tokensSpent ?? null)}::jsonb, tokens_spent),
        squid_request_ids = COALESCE(${JSON.stringify(body.squidRequestIds ?? null)}::jsonb, squid_request_ids),
        swap_tx_hashes = COALESCE(${JSON.stringify(body.swapTxHashes ?? null)}::jsonb, swap_tx_hashes),
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
