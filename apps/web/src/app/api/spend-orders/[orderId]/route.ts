import { NextResponse } from "next/server";

import { ensureSpendOrderTable, getSql } from "@/lib/db";

type UpdateSpendOrderBody = {
  error?: string | null;
  paymentTxHash?: string;
  status?: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    const body = (await request.json()) as UpdateSpendOrderBody;
    await ensureSpendOrderTable();

    const [order] = await getSql()`
      UPDATE spend_orders SET
        status = COALESCE(${body.status ?? null}, status),
        payment_tx_hash = COALESCE(${body.paymentTxHash ?? null}, payment_tx_hash),
        error = COALESCE(${body.error ?? null}, error),
        updated_at = NOW()
      WHERE order_id = ${params.orderId}
      RETURNING *
    `;

    if (!order) {
      return NextResponse.json({ error: "Spend order not found" }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update spend order" },
      { status: 500 }
    );
  }
}
