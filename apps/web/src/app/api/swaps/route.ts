import { NextResponse } from "next/server";

import { ensureSwapTable, getSql } from "@/lib/db";

type CreateSwapBody = {
  chainId?: number;
  intentId?: string;
  requestedCopm?: string;
  userAddress?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateSwapBody;
    if (!body.intentId || !body.userAddress || !body.chainId || !body.requestedCopm) {
      return NextResponse.json({ error: "Missing swap intent fields" }, { status: 400 });
    }

    await ensureSwapTable();
    const [swap] = await getSql()`
      INSERT INTO swap_intents (
        intent_id,
        user_address,
        chain_id,
        status,
        requested_copm
      )
      VALUES (
        ${body.intentId},
        ${body.userAddress.toLowerCase()},
        ${body.chainId},
        'created',
        ${body.requestedCopm}
      )
      ON CONFLICT (intent_id) DO UPDATE SET
        updated_at = NOW()
      RETURNING *
    `;

    return NextResponse.json({ swap });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create swap" },
      { status: 500 }
    );
  }
}
