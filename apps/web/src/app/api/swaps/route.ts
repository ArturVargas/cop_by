import { NextResponse } from "next/server";
import { isAddress } from "viem";

import { ensureSwapTable, getSql } from "@/lib/db";

type CreateSwapBody = {
  chainId?: number;
  intentId?: string;
  recipientAddress?: string;
  requestedCopm?: string;
  userAddress?: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get("userAddress");
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
    const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json({ error: "Invalid user address" }, { status: 400 });
    }

    await ensureSwapTable();
    const items = await getSql()`
      SELECT
        intent_id,
        user_address,
        recipient_address,
        requested_copm,
        status,
        swap_tx_hashes,
        error,
        created_at,
        updated_at
      FROM swap_intents
      WHERE LOWER(user_address) = ${userAddress.toLowerCase()}
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const [{ count }] = await getSql()`
      SELECT COUNT(*)::int AS count
      FROM swap_intents
      WHERE LOWER(user_address) = ${userAddress.toLowerCase()}
    `;

    return NextResponse.json({ items, total: count });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load swaps" },
      { status: 500 }
    );
  }
}

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
        recipient_address,
        chain_id,
        status,
        requested_copm
      )
      VALUES (
        ${body.intentId},
        ${body.userAddress.toLowerCase()},
        ${(body.recipientAddress ?? body.userAddress).toLowerCase()},
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
