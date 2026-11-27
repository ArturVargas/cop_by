# PIX backend execution plan

Spec: docs/architecture/ramp-backend.md. User confirmed USDC Stellar → PIX. Work stays on codex/backend-pix-pods; no production deployment requested for this branch.

- [x] 1. Domain/provider contract: exact amounts, input validation, state transitions; disabled TuCOP and explicit mock adapter. Add focused failing tests, implement and verify.
- [x] 2. Pods HTTP adapter: API key, approved/bound KYC, GET quote, canonical fees/expiry, full muxed destination validation, status normalization, HMAC webhook verification. Contract fixtures only; no real payout requests.
- [x] 3. Persistence/service: encrypted Postgres snapshots, migration, owner/key idempotency, CAS audit log, durable webhook inbox, reconciliation; in-memory repository only in tests. Race and retry tests.
- [x] 4. Private API routes/config: fail-closed integration auth, bounded JSON, provider registry, quote/get/accept/funding/reconcile/webhook routes. Route tests including invalid auth and cross-customer access. Env/migration/runbook docs.
- [ ] 5. Final verification: complete test suite, type-check, build, independent review; commit logical changes and push branch. Report missing live prerequisites candidly. Do not merge or deploy main.

Review focus: duplicate network requests, unknown outcomes after timeouts, cross-customer access, stale reconciliations, false paid statuses, expired quotes, mixed mainnet/Testnet, M-address preservation, webhook HMAC/replay/inbox durability, secrets and PIX data disclosure.

Task 1: domain tests passed (exact amounts, invalid requests, stale/terminal observations); provider contract and explicitly disabled TuCOP/simulation boundaries added.

Tasks 2–4: Pods contract/HMAC/timeout fixtures passed; encrypted snapshots and service race tests passed. Actual migration/repository SQL passed in disposable PostgreSQL 17, including repeated migration, owner scoping, CAS/audit and webhook deduplication. Private API tests pass; no live credentials, migration, scheduler or payout were used.

Independent review found equal-timestamp processing→pending regressions and failed lookups starving later candidates. Fixed with monotonic funding states, a no-reported-hash funding projection and independent attempted_at rotation. Added service regressions plus actual PostgreSQL failing-provider recovery; all 24 ramp tests and PostgreSQL checks passed. Final Cloudflare rebuild and review follow-up pending.
