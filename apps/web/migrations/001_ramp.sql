BEGIN;
CREATE TABLE IF NOT EXISTS ramp_operations (
  id UUID PRIMARY KEY,
  customer_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('pods', 'tucop', 'mock')),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  provider_quote_id TEXT,
  provider_action_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('quoting','quoted','awaiting_funding','funding_reported','processing','paid','refunded','expired','failed','needs_attention')),
  version INTEGER NOT NULL CHECK (version >= 0),
  encrypted_data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (customer_id, idempotency_key),
  UNIQUE (provider, provider_quote_id),
  UNIQUE (provider, provider_action_id)
);
CREATE INDEX IF NOT EXISTS ramp_operations_reconcile ON ramp_operations (updated_at) WHERE provider_quote_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS ramp_operation_events (
  operation_id UUID NOT NULL REFERENCES ramp_operations(id),
  version INTEGER NOT NULL,
  state TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (operation_id, version)
);
CREATE TABLE IF NOT EXISTS ramp_webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  action_id TEXT,
  relevant BOOLEAN NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempted_at TIMESTAMPTZ,
  PRIMARY KEY (provider, event_id)
);
CREATE INDEX IF NOT EXISTS ramp_webhook_pending ON ramp_webhook_events (COALESCE(attempted_at, received_at)) WHERE processed = FALSE;
COMMIT;
