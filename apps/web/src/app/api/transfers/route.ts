import { NextResponse } from "next/server";
import { isAddress } from "viem";

import { ensureTransferTable, getSql } from "@/lib/db";

type CreateTransferBody = {
  chainId?: number;
  recipientAddress?: string;
  senderAddress?: string;
  transferId?: string;
  copmAmount?: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const senderAddress = searchParams.get("senderAddress");
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
    const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

    if (!senderAddress || !isAddress(senderAddress)) {
      return NextResponse.json({ error: "Invalid sender address" }, { status: 400 });
    }

    await ensureTransferTable();
    const items = await getSql()`
      SELECT
        transfer_id,
        sender_address,
        recipient_address,
        copm_amount,
        status,
        tx_hash,
        error,
        created_at,
        updated_at
      FROM copm_transfers
      WHERE LOWER(sender_address) = ${senderAddress.toLowerCase()}
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const [{ count }] = await getSql()`
      SELECT COUNT(*)::int AS count
      FROM copm_transfers
      WHERE LOWER(sender_address) = ${senderAddress.toLowerCase()}
    `;

    return NextResponse.json({ items, total: count });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load transfers" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateTransferBody;
    if (
      !body.transferId ||
      !body.senderAddress ||
      !body.recipientAddress ||
      !body.chainId ||
      !body.copmAmount ||
      !isAddress(body.senderAddress) ||
      !isAddress(body.recipientAddress)
    ) {
      return NextResponse.json({ error: "Missing transfer fields" }, { status: 400 });
    }

    await ensureTransferTable();
    const [transfer] = await getSql()`
      INSERT INTO copm_transfers (
        transfer_id,
        sender_address,
        recipient_address,
        chain_id,
        status,
        copm_amount
      )
      VALUES (
        ${body.transferId},
        ${body.senderAddress.toLowerCase()},
        ${body.recipientAddress.toLowerCase()},
        ${body.chainId},
        'created',
        ${body.copmAmount}
      )
      ON CONFLICT (transfer_id) DO UPDATE SET
        updated_at = NOW()
      RETURNING *
    `;

    return NextResponse.json({ transfer });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create transfer" },
      { status: 500 }
    );
  }
}
