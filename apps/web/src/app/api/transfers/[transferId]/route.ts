import { NextResponse } from "next/server";

import { ensureTransferTable, getSql } from "@/lib/db";

type UpdateTransferBody = {
  error?: string | null;
  onchainLogTxHash?: string | null;
  status?: string;
  txHash?: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ transferId: string }> }
) {
  try {
    const { transferId } = await params;
    const body = (await request.json()) as UpdateTransferBody;
    await ensureTransferTable();

    const [transfer] = await getSql()`
      UPDATE copm_transfers SET
        status = COALESCE(${body.status ?? null}, status),
        tx_hash = COALESCE(${body.txHash ?? null}, tx_hash),
        onchain_log_tx_hash = COALESCE(${body.onchainLogTxHash ?? null}, onchain_log_tx_hash),
        error = COALESCE(${body.error ?? null}, error),
        updated_at = NOW()
      WHERE transfer_id = ${transferId}
      RETURNING *
    `;

    if (!transfer) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }

    return NextResponse.json({ transfer });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update transfer" },
      { status: 500 }
    );
  }
}
