CREATE TABLE ramp_tucop_destinations (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  encrypted_data TEXT NOT NULL,
  confirmed_hash TEXT,
  UNIQUE (customer_id, external_id)
);
