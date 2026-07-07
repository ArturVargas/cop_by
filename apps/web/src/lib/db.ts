import { neon } from "@neondatabase/serverless";

export function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Missing DATABASE_URL");
  return neon(databaseUrl);
}

export async function ensureSwapTable() {
  await getSql()`
    CREATE TABLE IF NOT EXISTS swap_intents (
      intent_id TEXT PRIMARY KEY,
      user_address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      requested_copm TEXT NOT NULL,
      recipient_address TEXT,
      tokens_spent JSONB NOT NULL DEFAULT '[]'::jsonb,
      squid_request_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      swap_tx_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
      copm_received TEXT,
      fee_usd TEXT,
      onchain_log_tx_hash TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await getSql()`
    ALTER TABLE swap_intents
    ADD COLUMN IF NOT EXISTS fee_usd TEXT
  `;
  await getSql()`
    ALTER TABLE swap_intents
    ADD COLUMN IF NOT EXISTS recipient_address TEXT
  `;
}

export async function ensureTransferTable() {
  await getSql()`
    CREATE TABLE IF NOT EXISTS copm_transfers (
      transfer_id TEXT PRIMARY KEY,
      sender_address TEXT NOT NULL,
      recipient_address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      copm_amount TEXT NOT NULL,
      tx_hash TEXT,
      onchain_log_tx_hash TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function ensureSpendOrderTable() {
  await getSql()`
    CREATE TABLE IF NOT EXISTS spend_orders (
      order_id TEXT PRIMARY KEY,
      user_address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      product_type TEXT NOT NULL,
      category TEXT,
      provider TEXT NOT NULL,
      amount_copm TEXT NOT NULL,
      phone TEXT,
      email TEXT NOT NULL,
      payment_address TEXT NOT NULL,
      payment_tx_hash TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}
