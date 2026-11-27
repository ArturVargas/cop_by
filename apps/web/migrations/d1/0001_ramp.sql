CREATE TABLE ramp_operations (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('pods','tucop','mock')),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  provider_quote_id TEXT,
  provider_action_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('quoting','quoted','awaiting_funding','funding_reported','processing','paid','refunded','expired','failed','needs_attention')),
  version INTEGER NOT NULL CHECK (version >= 0),
  encrypted_data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reconcile_attempted_at TEXT,
  UNIQUE (customer_id, idempotency_key),
  UNIQUE (provider, provider_quote_id),
  UNIQUE (provider, provider_action_id)
);
-- statement-breakpoint
CREATE INDEX ramp_operations_reconcile ON ramp_operations (COALESCE(reconcile_attempted_at, updated_at)) WHERE provider_quote_id IS NOT NULL;
-- statement-breakpoint
CREATE TABLE ramp_operation_events (
  operation_id TEXT NOT NULL REFERENCES ramp_operations(id),
  version INTEGER NOT NULL,
  state TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  PRIMARY KEY (operation_id, version)
);
-- statement-breakpoint
CREATE TRIGGER ramp_audit_insert AFTER INSERT ON ramp_operations BEGIN
  INSERT INTO ramp_operation_events (operation_id, version, state, occurred_at)
  VALUES (NEW.id, NEW.version, NEW.state, NEW.updated_at);
END;
-- statement-breakpoint
CREATE TRIGGER ramp_audit_update AFTER UPDATE OF version ON ramp_operations WHEN NEW.version <> OLD.version BEGIN
  INSERT INTO ramp_operation_events (operation_id, version, state, occurred_at)
  VALUES (NEW.id, NEW.version, NEW.state, NEW.updated_at);
END;
-- statement-breakpoint
CREATE TABLE ramp_webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  action_id TEXT,
  relevant INTEGER NOT NULL CHECK (relevant IN (0,1)),
  processed INTEGER NOT NULL DEFAULT 0 CHECK (processed IN (0,1)),
  received_at TEXT NOT NULL,
  attempted_at TEXT,
  PRIMARY KEY (provider, event_id)
);
-- statement-breakpoint
CREATE INDEX ramp_webhook_pending ON ramp_webhook_events (COALESCE(attempted_at, received_at)) WHERE processed = 0;
