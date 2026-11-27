# Stellar → PIX backend runbook

This branch implements a private integration API. It does not add a PIX button to the wallet, provision KYC identities, sign transactions, deploy infrastructure or enable real payouts. Pods live Stellar execution still requires a credentialed contract fixture. TuCOP is deliberately unavailable until its Stellar API is ready.

## Configuration and schema
Copy the server variables from `apps/web/.env.template` into your local environment or Cloudflare secrets. Do not prefix them with NEXT_PUBLIC_ or include them in frontend requests. Use a dedicated database, a random integration token of at least 32 characters and a stable base64 encryption key representing 32 random bytes. Do not rotate that key without re-encrypting existing snapshots and idempotency fingerprints.

Apply the migration explicitly from `apps/web` using an authorized Postgres client:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/001_ramp.sql
```

No request installs or alters tables. Set RAMP_PROVIDER=pods for live integration. Keep PODS_STELLAR_ENABLED=false until Pods confirms the exact PODS_STELLAR_TOKEN_IN, mainnet access, KYC wallet binding, quote response and M-address deposit contract. PODS_API_BASE_URL defaults to https://api.pods.finance; overrides must be trusted HTTPS endpoints because they receive your API key. The current parser intentionally rejects unexpected networks, amounts, fees and execution data. Unsupported funding payloads return an unavailable instruction and cannot be accepted.

For simulation only, set RAMP_ALLOW_MOCK=true and RAMP_PROVIDER=mock, and send network=testnet. This uses the same database/lifecycle but produces no deposit address, XDR or real PIX payment. Disable the mock explicitly outside that environment.

## Private API contract
Every private request requires Authorization: Bearer RAMP_INTERNAL_API_TOKEN. Customer operations also require X-Ramp-Customer-Id from a trusted server. A customer cannot supply another user's id through an untrusted browser. This is not a Cavos login verifier: the next UI integration must replace/bridge this boundary with server-verified Cavos identity and wallet ownership. Never ship the integration token to a browser.

All amounts are decimal strings. Requests reject scientific notation and more than seven USDC ledger decimals. Responses are uncached and exclude the PIX key, KYC id, idempotency fingerprint and encrypted snapshot.

| Method | Path under /api/ramp | Purpose |
| --- | --- | --- |
| GET | /providers | Available providers/networks and readiness reason |
| POST | /quotes | Create operation; Idempotency-Key required |
| GET | /operations/:id | Read an owned operation |
| POST | /operations/:id/accept | Accept a current quote; unlock funding instructions |
| POST | /operations/:id/funding | Record `{ "txHash": "64 hexadecimal characters" }` as an unverified report |
| POST | /operations/:id/reconcile | Query the provider's canonical quote status |
| POST | /reconcile | Private scheduler batch, `{ "limit": 5 }`, maximum 20 |
| POST | /webhooks/pods | HMAC-authenticated durable inbox; no integration bearer |

Example simulation quote from a trusted terminal/server, with RAMP_ORIGIN pointing to the local app:

```sh
curl "$RAMP_ORIGIN/api/ramp/quotes" \
  -H "Authorization: Bearer $RAMP_INTERNAL_API_TOKEN" \
  -H 'X-Ramp-Customer-Id: integration-test-user' \
  -H 'Idempotency-Key: pix-demo-0001' \
  -H 'Content-Type: application/json' \
  --data '{"provider":"mock","network":"testnet","sourceAddress":"REPLACE_WITH_VALID_G_ACCOUNT","amount":"15.00","pixKey":"demo@example.com","thirdParty":false,"kycUserId":"11111111-1111-4111-8111-111111111111"}'
```

For Pods, use provider=pods, network=mainnet and an approved BRL-enabled kycUserId bound to the exact source G account. `thirdParty` is always explicit: true for someone else's PIX key, false for the KYC holder's key. KYC capture/provisioning is not included. The current app is Testnet by default; it cannot fund a mainnet operation as it stands.

Reusing a customer/idempotency key returns the original operation, including a still-pending result. Changing its normalized request returns 409. Quote creation returns an operation (201) whose state may be quoted, failed or needs_attention; callers must inspect state/errorCode before offering acceptance. A provider timeout or process interruption must not cause an automatic new quote request. Retrieve the existing operation first; records stuck in quoting or needs_attention without a quote reference require operator/provider review. There is no unsafe retry/requote endpoint.

Before acceptance, the response shows amount, BRL result, fees, recipient name if supplied, and expiry. Funding instructions appear only after acceptance while the quote remains valid and the state permits funding (`canFund=true`). After reporting a transaction, do not broadcast it again; consult the state instead. Reporting a hash does not broadcast, call an invented Stellar fulfill API, or prove settlement. Actual execution must preserve the full M muxed destination, Circle USDC issuer, amount and mainnet network in the returned instruction. The existing G-only P2P helper is not suitable for this deposit.

## Webhooks and reconciliation
Register `/api/ramp/webhooks/pods` and PODS_WEBHOOK_SECRET with Pods. The handler verifies X-Deframe-Webhook-Id/Timestamp/Signature, HMAC-SHA256 over `timestamp.id.` plus the exact raw bytes, with a five-minute replay window. It deduplicates by provider/event id and body digest, persists an inbox row, then acknowledges 202. It never treats an ACTION_UPDATE success payload as evidence of PIX completion. Unsupported message types are acknowledged as ignored. No raw body or KYC data is persisted in the inbox.

Pods documents no automatic webhook retries, and expiration updates are not pushed. Before enabling live funds, configure an authenticated scheduler to POST `/api/ramp/reconcile` at least every minute; the branch does not provision that scheduler. Repeated/concurrent runs are safe through compare-and-set revisions. The response exposes reconciled/events/errors counts; alert on errors > 0, backlog age and operations stuck without a quote. A limit can process up to twice that many provider lookups (inbox plus operations); size the schedule and HTTP timeout for provider latency. There are no automatic network retries.

The worker rotates both pending inbox entries and operation lookups using separate attempt timestamps, so a provider failure cannot starve later operations. It polls active operations even without a webhook. Paid/failed/expired operations are also polled for seven days from creation for late settlement/refunds; refunded operations are terminal. Older terminal operations can be reconciled manually. An unmatched action event remains pending for later matching (it may precede the quote commit); investigate persistent unmatched entries. Monitor retention and archive completed inbox/audit records according to the application's privacy policy; no destructive automatic retention is enabled here.

Source of truth: canonical Pods quote status plus PIX settlement metadata. `paid` cannot be produced from a user-supplied hash. Stale observations cannot downgrade paid/refunded states, while a later provider-confirmed refund can update paid → refunded. Server projections hide funding instructions once a hash is reported, expired, processing or terminal. Pending responses cannot reopen funding after processing, including equal-timestamp responses.

## Verification
From the repo root: `pnpm --filter web test:ramp`, `pnpm --filter web type-check`, `pnpm --filter web cf:build`. Unit/HTTP fixtures never contact Pods or move money.

An optional PostgreSQL test runs the actual migration and repository SQL via psql in a disposable container; it never reads DATABASE_URL. It clears only the three ramp tables in the named `ramp_test` database. Use a fresh container with the required `copby-ramp-test-*` name:

```sh
docker run -d --name copby-ramp-test-local -e POSTGRES_PASSWORD=local-test-only -e POSTGRES_DB=ramp_test postgres:17-alpine
cd apps/web
RAMP_TEST_CONTAINER=copby-ramp-test-local node scripts/test-ramp-postgres.mjs
docker rm -f copby-ramp-test-local
```

The migration and repository are verified locally; hosted Neon credentials, Cloudflare secrets, scheduler delivery and a real Pods Stellar fixture still require environment-specific verification before enabling this corridor. No live PIX payment was executed during implementation.
