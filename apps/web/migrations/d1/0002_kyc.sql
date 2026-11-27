CREATE TABLE ramp_kyc_profiles (
  customer_id TEXT PRIMARY KEY,
  identity_hash TEXT NOT NULL UNIQUE,
  wallet_hash TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  encrypted_wallet TEXT NOT NULL,
  provider_profile_id TEXT UNIQUE,
  created_at TEXT NOT NULL
);
