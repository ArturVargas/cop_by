# Pods integration: D1, hosted KYC and official sandbox

User authorized continuing Pods integration and committing/pushing changes. Keep codex/backend-pix-pods; no production deployment or main merge. Previous backend is already committed and pushed. Existing private server API remains the integration boundary; customer-facing Cavos session wiring is a separate prerequisite before exposing these routes to the wallet UI.

## Design
Use Cloudflare D1 for ramp persistence, preserving encrypted snapshots, owner scoping, durable idempotency, CAS and audit/inbox semantics. No existing remote ramp database/data needs migration. Replace the unused Postgres ramp implementation; retain Neon dependencies used by legacy APIs. SQLite triggers keep operation writes and audit events atomic. Record queue attempts independently from successful provider calls.

Add a shared server-only Pods HTTP client, an owned hosted-KYC session/status/reset service, and a separate official sandbox client/harness for pBRL Base Sepolia. Do not pretend Base testnet validates Stellar funding. Sandbox requires explicit staging URL/configuration and never defaults to production. The live Stellar provider stays disabled until its contract is verified. Hosted KYC automatically supplies BRL capability; the current currency-unlock OpenAPI is for USD, so do not invent a manual BRL unlock call based on inconsistent narrative docs.

Hosted profile association is reserved before provider POSTs; store only encrypted profile/session snapshots and a keyed applicant fingerprint, not CPF. Provider sessions are idempotent by CPF; prevent cross-customer reuse of a profile. KYC links are bearer secrets, returned only to the owning integration principal and never logged. Retries follow provider states. Limits read directional offramp values, blocked status, BRL/USD units without comparing different currencies.

## Execution
- [ ] 1. Correct settlement/receipt semantics: fulfilled without receipt; preserve original/refund ids and safe failure codes. Add regression tests, commit/push.
- [ ] 2. Replace ramp Postgres persistence with D1 migration/repository/runtime. Test actual D1 binding and SQL, CAS/audit, ownership, queue fairness and inbox dedupe; configure dedicated staging database without publishing app.
- [ ] 3. Add Pods HTTP client, hosted KYC ownership/session/status/reset and limits. Unit/route tests for validation, owner isolation, errors and identity reuse. Keep credentials server-only.
- [ ] 4. Add official sandbox client and reproducible test runner: hosted KYC scenarios; pBRL mint/redeem, payout rejection and payer-mismatch refund; record result metadata without secrets. Run against staging only when user confirms URL/key environment. Never fake a successful external run.
- [ ] 5. Verify ramp/Stellar tests, type-check and Cloudflare build; independent review, fix findings, logical commits/push; document provisioned resources and remaining real-environment prerequisites.

Primary references: Pods user-supplied KYC/ramp/status/sandbox guides, current OpenAPI; Cloudflare D1 prepared statements and SQLite triggers; OpenNext Cloudflare bindings. No added production dependency is needed.
