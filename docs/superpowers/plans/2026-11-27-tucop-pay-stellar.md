# TuCOP pay on Stellar with the integrator's own provider account

User confirmed own-provider-account model and product pay, and accepted TuCOP's 0x consumer commission wallet as provider configuration. Continue on codex/backend-pix-pods, logical commits/push. No withdraw or per-user TuCOP party/OTP flow; Cavos user authentication remains a separate customer-facing prerequisite. No production payment/deployment authorized.

## Design
Reuse encrypted D1 operations, idempotency, CAS, inbox and provider state reconciliation. Add a discriminated quote request for TuCOP destination fiat amounts (BRL/COP/MXN) without requiring Pods KYC. Keep Pods and its behavior compatible. Add an optional provider funding-preparation phase at acceptance: TuCOP quote is not a payment. Reserve the acceptance attempt before network calls; recover unknown outcomes with the exact same provider idempotency key/body and a bounded retention window. Never automatically send funds.

Destinations belong to the shared TuCOP business party but must still be mapped to each COP By customer in D1. Require explicit holder-revision confirmation for each customer; a global provider confirmation must not substitute for another user's consent. Refresh destination/holder before quoting. Add a D1 table storing encrypted recipient snapshots and local confirmation hash with CAS.

TuCOP transport uses server-only X-TuCOPRamp-Key, no Party-Session and no obsolete API-version header. Account readiness checks key environment, pay, source-chain/currency configuration and linked party KYC/terms/endorsement. Stellar source account must exist, trust the expected Circle USDC issuer and cover the total spend before creating a payment. Preserve exact latest deposit amount, G+memo and optional M alternative, source network and issuer. Consumer fee/wallet are separate quote metadata, not an invented Stellar transfer to 0x.

Expose latest funding only after acceptance, refresh before presenting it, hide after a reported tx/processing/expiry, and stop early near the 30-minute payment window. Preserve cancellation/refund/status codes. Webhooks use Standard Webhooks raw-body HMAC + durable inbox, not the Pods signature scheme. Never use a webhook alone as payment proof.

## Execution
- [x] 1. Domain/lifecycle and tests: provider-specific quote inputs, explicit preparation, safe acceptance recovery, dynamic funding refresh and fiat projections; preserve Pods tests.
- [x] 2. TuCOP server client, readiness, owned destinations and D1 migration; destination/key/idempotency/confirmation tests.
- [x] 3. TuCOP quote/payment/status adapter, source account checks, exact Stellar memo/asset/network normalization, webhook signature tests and private API routes/config.
- [x] 4. Local D1/API/integration tests, type-check, Cloudflare build, independent review and fixes; docs, commits/push. No production POST or app deployment.

## Credential evidence
No TuCOP variable existed initially. User then added TUCOPRAMP_API_KEY; detected a live-key prefix, so the sandbox probe stopped before any request. Only read-only GET /consumer and /ramp/parties/me are permitted with that production key for readiness. Financial POST tests require an explicitly configured sandbox key; local fixtures do not establish a real payout.

Sources: https://admin.ramp.tucop.xyz/docs/own-provider-account; /docs/payments#usdc-on-stellar; /docs/destinations; /docs/webhooks; /docs/sandbox; /docs/conventions; /docs/api-reference.


Updated credential evidence: the user replaced the production key. GET /consumer and GET /ramp/parties/me returned 200; environment live, pay enabled, party KYC approved, terms accepted, PIX-offramp approved, unrestricted. The production-configured adapter's read-only account check passed too. No production POST or live financial E2E test was performed. Sandbox financial tests still need a sandbox key/business.

Review regressions: checkpoint provider payment id/action before follow-up GET; recover known ids without another POST or mutable preflight; preserve retryability of known-id canonical-read failures; handle nullable terminal payment data/error_code; refresh funding on idempotent quote replay. Each has a focused regression test.

Final verification: 53 ramp tests and 22 Stellar tests passed; local workerd/D1 integration, type-check, Next/D1 HTTP smoke (including production read-only TuCOP readiness) and Cloudflare build passed. Independent review closed all material findings, including canonical creating resumption with the same key/body only within the safe retention window. Migration0003 applied locally and to the existing remote D1 staging database; no production Worker deployment. Implementation/config/docs are delivered as separate commits on the existing branch.
