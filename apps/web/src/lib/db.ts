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
      tokens_spent JSONB NOT NULL DEFAULT '[]'::jsonb,
      squid_request_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      swap_tx_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
      copm_received TEXT,
      onchain_log_tx_hash TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}
