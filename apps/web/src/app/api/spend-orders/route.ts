import { NextResponse } from "next/server";
import { isAddress } from "viem";

import { ensureSpendOrderTable, getSql } from "@/lib/db";

type CreateSpendOrderBody = {
  amountCopm?: string;
  category?: string;
  chainId?: number;
  email?: string;
  orderId?: string;
  phone?: string;
  productType?: "topup" | "giftcard";
  provider?: string;
  userAddress?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateSpendOrderBody;
    const paymentAddress = process.env.SPEND_COP_CONTRACT_ADDRESS;

    if (!paymentAddress || !isAddress(paymentAddress)) {
      return NextResponse.json(
        { error: "Missing spend payment address" },
        { status: 500 }
      );
    }

    if (
      !body.orderId ||
      !body.userAddress ||
      !body.chainId ||
      !body.productType ||
      !body.provider ||
      !body.amountCopm ||
      !body.email ||
      !isAddress(body.userAddress)
    ) {
      return NextResponse.json({ error: "Missing spend order fields" }, { status: 400 });
    }

    await ensureSpendOrderTable();
    const [order] = await getSql()`
      INSERT INTO spend_orders (
        order_id,
        user_address,
        chain_id,
        status,
        product_type,
        category,
        provider,
        amount_copm,
        phone,
        email,
        payment_address
      )
      VALUES (
        ${body.orderId},
        ${body.userAddress.toLowerCase()},
        ${body.chainId},
        'created',
        ${body.productType},
        ${body.category ?? null},
        ${body.provider},
        ${body.amountCopm},
        ${body.phone ?? null},
        ${body.email},
        ${paymentAddress.toLowerCase()}
      )
      ON CONFLICT (order_id) DO UPDATE SET
        updated_at = NOW()
      RETURNING *
    `;

    return NextResponse.json({ order, paymentAddress });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create spend order" },
      { status: 500 }
    );
  }
}
