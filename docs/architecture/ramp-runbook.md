# Stellar → PIX backend runbook

This branch adds a private integration backend, not a PIX button or a customer-facing Cavos auth flow. It does not sign transactions or enable live payouts. Cloudflare D1 is now the ramp database; the earlier Postgres ramp implementation/migration was replaced before deployment. Legacy Celo APIs retain their own Neon dependency.

## Current resources and observed connectivity

- Branch: codex/backend-pix-pods.
- Cloudflare staging database: **copby-ramp-staging**, id **1d5067ab-4193-4329-8029-8767ad8833c1**, binding **RAMP_DB** under Wrangler environment **staging**.
- D1 migrations 0001_ramp.sql, 0002_kyc.sql and 0003_tucop_destinations.sql have been applied to that staging database. No user profiles, payouts or real payment data were inserted remotely.
- No Worker/app deployment or production route change was performed. The existing stellar.copby.money app has not received these backend changes.
- On 2026-11-27, the configured key was accepted by `GET https://api.pods.finance/api/v1/limits` for the public documentation example address (HTTP 200). Public `/health` also returned 200.
- An empty `POST /v2/swap/status/sandbox/confirmed` at that host returned **404 NOT_FOUND**. The sandbox runner stopped at preflight with SANDBOX_UNAVAILABLE, before creating any profile/quote. This does not prove that the key itself has a staging or production label; it proves the tested host/key combination did not expose that sandbox route. Pods must supply/enable the appropriate environment.

## D1 setup and local development

The staging binding is configured in apps/web/wrangler.jsonc. The default production Worker intentionally has no ramp D1 binding; production ramp requests fail closed until a production database and its secrets are configured. No database is created during an HTTP request, and there is no process-memory fallback.

From apps/web:

```sh
pnpm exec wrangler d1 migrations apply RAMP_DB --env staging --local
# Run only against the intended remote staging database:
pnpm exec wrangler d1 migrations apply RAMP_DB --env staging --remote
pnpm dev
```

Next development initializes the local Cloudflare bindings using the staging configuration. Local D1 uses separate storage from remote D1. Do not point a production Worker at this staging database.

Server variables are listed in .env.template. Existing local secrets in .env are ignored by Git. RAMP_INTERNAL_API_TOKEN requires at least 32 characters. RAMP_ENCRYPTION_KEY is base64 of 32 random bytes and must stay stable: it encrypts operation snapshots and KYC wallet associations, and derives HMAC keys for idempotency/identity fingerprints. Rotation requires re-encrypting snapshots and updating keyed fingerprints. No values are included in this guide.

## Private API and identity boundary

All private requests require Authorization: Bearer RAMP_INTERNAL_API_TOKEN. Customer endpoints also require X-Ramp-Customer-Id supplied by a trusted server. These are administrator integration credentials, not a Cavos login verifier. The next customer-facing slice must bridge a verified Cavos session and verified wallet ownership to this principal. Never embed the integration token in the browser.

| Method | Path under /api/ramp | Purpose |
| --- | --- | --- |
| GET | /providers | Provider availability/networks |
| POST | /kyc/session | Create/reuse an owned Pods hosted session |
| GET | /kyc/status | Read the owning customer's profile and BRL capability |
| POST | /kyc/reset | Reset the owned rejected_retryable profile |
| GET | /limits | Read directional BRL offramp limits for the owned approved wallet |
| POST | /quotes | Create operation; Idempotency-Key required |
| GET | /operations/:id | Read owned operation |
| POST | /operations/:id/accept | Accept a current quote and expose funding instructions |
| POST | /operations/:id/funding | Record a 64-hex Stellar txHash as an unverified report |
| POST | /operations/:id/reconcile | Query canonical provider quote status |
| POST | /reconcile | Scheduler batch, `{ "limit": 5 }`, maximum 20 |
| POST | /webhooks/pods | Public only with valid Pods HMAC; durable inbox |
| GET | /tucop/account?currency=BRL | Read-only own-business readiness; no per-user TuCOP session |
| POST | /tucop/destinations | Register/reuse owned third-party PIX or Bre-B destination; Idempotency-Key |
| GET | /tucop/destinations/:id | Refresh holder, status and the customer's confirmation revision |
| POST | /tucop/destinations/:id/confirm | Confirm displayed holderRevision; Idempotency-Key |
| POST | /webhooks/tucop | Public only with valid Standard Webhooks signature; durable inbox |

Request bodies are bounded and responses uncached. API errors expose sanitized codes/messages, never raw provider bodies. Plaintext CPF, KYC evidence, bearer verification links, authorization headers and provider URLs with PIX keys must not enter logs.

## Hosted KYC and limits

Ask Pods to enable hosted KYC and allowlist the exact HTTPS return URL. Set PODS_KYC_ENABLED=true and optional PODS_KYC_REDIRECT_URL on the server only after environment/account readiness is confirmed. The status endpoint is authoritative; a browser return does not imply approval. Poll roughly every five seconds during verification.

POST /kyc/session accepts only:

```json
{ "cpf": "TEST_OR_APPLICANT_CPF", "email": "applicant@example.com", "walletAddress": "APPROVED_WALLET_FORMAT" }
```

CPF check digits, email and wallet format are validated. A customer/applicant/wallet association is reserved before contacting Pods. Identity and wallet fingerprints and provider profile ids are unique across customers. The provider's idempotency by CPF supports retrying the same session request after transport failures; changing applicant data or wallets requires a separate verified account-management flow, not silently replacing the mapping.

CPF/email are not persisted locally. The wallet association is encrypted; identity/request fingerprints are HMACs. The verification link is returned only after fetching the associated provider profile and checking its wallet. It is not persisted. Status/reset/limits resolve the profile from the authenticated customer; callers cannot pass another user's kycUserId.

Use the returned status, brlaEnabled and reason fields. Reset is limited to rejected_retryable; rejection and blocked states do not trigger automatic retries. Hosted KYC unlocks BRL as part of provider onboarding. The current currency-unlock OpenAPI accepts USD, despite narrative guides mentioning manual BRL unlock; this implementation checks brlaEnabled and does not invent a BRL request.

Hosted KYC docs currently describe EVM/Solana addresses. Stellar G accounts remain gated by PODS_STELLAR_ENABLED until their contract is confirmed with Pods. EVM/Solana sandbox onboarding does not establish a Stellar wallet's eligibility.

Limits use `offramp.remaining` and `offramp.remainingGlobalUsd`, not deprecated top-level aliases. Blocked accounts and zero limits cannot obtain a live quote. The backend preserves the directional decimal strings/currencies as supplied by Pods, without comparing a USDC amount with a BRL or USD cap; Pods performs the exact quote-specific limit check.

## Live Stellar corridor

Keep PODS_STELLAR_ENABLED=false until Pods confirms mainnet availability, KYC wallet binding, exact PODS_STELLAR_TOKEN_IN and the actual funding response. Current integration accepts only validated M muxed deposit instructions without unsupported raw execution data; unexpected responses are unavailable and cannot be accepted. Preserve the complete M address, exact amount, Circle issuer and network when wiring Cavos. The current G-only P2P helper cannot execute this deposit.

Stellar USDC uses seven ledger decimals. Amounts are strings/BigInt. Quote creation reserves idempotency before the provider call; duplicate normalized inputs reuse the operation and conflicting inputs return 409. A timeout never automatically creates a second quote. A record stuck without a provider quote reference requires operator/provider review. Public quote responses expose funding only after acceptance while unexpired, awaiting funding and without a reported hash.

The live adapter uses GET /v2/swap/quote; no new /bytecode integration or invented Stellar /fulfill API. The exact source and quoted BRL amounts are checked on status responses. BR Codes with provider-calculated source amounts, late repricing and abnormal deposits require explicit future handling before advertising those cases. Third-party payouts are documented for Base/Monad; do not advertise Stellar third-party payments until Pods confirms support.

## TuCOP pay on Stellar

This provider uses COP By's own verified provider account and product pay, not withdraw. Cavos login and Pods KYC are independent; no per-user TuCOP session/OTP is required in this model. Private API identity restrictions above still apply.

On 2026-11-27, after the user replaced the key, production GET /consumer and GET /ramp/parties/me returned 200. The adapter's own readiness check also passed: environment live/production, pay enabled, KYC approved, terms accepted, PIX offramp approved, unrestricted. The previous key's 401 is resolved. No destination, quote, payment or production funding transaction was created during this verification. Neither these reads nor fixture tests prove the Stellar payout corridor is operational.

Server variables:

- TUCOPRAMP_API_KEY: ignored local .env or a server secret, never NEXT_PUBLIC_*.
- TUCOPRAMP_ENVIRONMENT: sandbox (default) or production; must match the test/live key prefix and authoritative GET /consumer environment.
- TUCOPRAMP_ENABLED: false by default. Keep disabled until the intended environment and financial test are authorized.
- TUCOPRAMP_API_BASE_URL: optional; official defaults are https://sandbox.api.ramp.tucop.xyz and https://api.ramp.tucop.xyz. No redirects or plaintext HTTP.
- TUCOPRAMP_WEBHOOK_SECRET: separate Standard Webhooks whsec_ secret. Do not reuse Pods' secret or the API key.

The user's current key is production; it cannot run sandbox financial scenarios. A test key from TuCOP's sandbox console and a sandbox-linked business are required for those. Local test fixtures never call either provider.

Example destination body for POST /tucop/destinations (synthetic values only):

```json
{"currency":"BRL","key":"recipient@example.com","ownerName":"Test Recipient","documentNumber":"52998224725"}
```

BRL requires the recipient's CPF/CNPJ digits (11/14) and full name. COP uses {"currency":"COP","key":"BRE_B_KEY"}, optionally ownerName. No SPEI destination creation is exposed in this slice. Confirm the returned holder explicitly by POSTing {"holderRevision":"REVISION_FROM_THE_DISPLAYED_DESTINATION"} to /tucop/destinations/:id/confirm. Each customer must confirm independently, even if TuCOP already marked its shared destination confirmed. A holder change invalidates local consent.

A TuCOP quote request uses the destination fiat amount, unlike Pods' source USDC input:

```json
{
  "provider":"tucop",
  "network":"testnet",
  "sourceAddress":"G_ACCOUNT_OF_THE_USER",
  "amount":"250.00",
  "currency":"BRL",
  "destinationId":"LOCAL_OWNED_DESTINATION_UUID",
  "returnMemo":"copby-return"
}
```

Production requires network mainnet; sandbox requires testnet. COP amounts are whole pesos. returnMemo is 1–28 printable ASCII bytes without outer whitespace. Quote acceptance creates the provider payment with quote_id, source_chain stellar, return_address and return_memo. The return account must exist, trust the correct Circle USDC issuer and cover source plus consumer fee before first creation.

The service reserves acceptance before network calls, keeps the exact payment idempotency key/body on retries, and checkpoints the provider id before fetching deposit instructions. A failed follow-up GET cannot lose that id or trigger a new payment. Recover known ids by GET. Only canonical creating resumes the exact same POST/key/body, with the same id checked; unknown outcomes and creating resumption only retry inside 23 hours. Beyond that window, operator/provider review is required rather than a new idempotency key.

Refresh the operation immediately before constructing a client transaction; idempotent quote replays and reads also refresh accepted unfunded payments. Use the exact latest funding.amount and validated network/assetIssuer plus G destination with memo, or the matching memolessDestination alternative. The backend does not build/sign XDR or execute the consumer commission. consumerFeeWallet may be 0x as confirmed by the user; it stays separate metadata. The current G-only P2P helper is insufficient for this payment. A future Cavos payment flow must explicitly support the memo/M destination and a separately reviewed fee flow.

TuCOP deposit amount may change while awaiting_funds without changing the state. Fund only before the exposed cutoff (28 minutes from creation), and never infer expiry/payout from a local timer or reported hash. TuCOP normally cancels unfunded payments after 30 minutes, subject to its chain-read rules. Canonical canceled maps to expired with providerStatus canceled and error_code preserved as failureCode. completed maps to paid and a later refunded is retained. Failed/canceled responses with null deposit/amounts still reconcile. No TuCOP PIX receipt-pending promise is inferred from the Pods schema.

Webhook validation uses HMAC SHA-256 over webhook-id + '.' + webhook-timestamp + '.' + exact raw body, with the base64-decoded whsec_ key and v1 signature entries. Compare the signed payload id, enforce ±5 minutes, deduplicate durably and then fetch canonical status. Register /api/ramp/webhooks/tucop with TuCOP before enabling delivery. Scheduled reconciliation is still required; this branch does not publish the scheduler.

## Settlement, receipts and webhooks

Canonical `fulfilled` confirms completion even when fiatSettlement/receipt is still absent. The response exposes receiptPending until the original PIX id arrives. If fiatSettlement is present its method must be PIX. Store the first endToEndId and refundEndToEndId independently, preserve original case/values, and expose failureCode separately from quote-creation errors. A client-supplied transaction hash never proves completion.

Register the webhook URL and PODS_WEBHOOK_SECRET with Pods. Verify X-Deframe-Webhook-Id/Timestamp/Signature over `timestamp.id.` plus exact raw body bytes with a five-minute replay window. Persist a digest/action-id inbox row and deduplicate before returning 202. ACTION_UPDATE is an invalidation hint, not direct proof of payout. No raw webhook body is stored.

Pods documents no automatic delivery retries; expiration is not pushed. Before live funds, configure an authenticated scheduler to POST /reconcile at least every minute. This branch does not deploy that scheduler. Each batch may perform up to twice limit provider lookups; size timeouts accordingly. Monitor errors/backlog and records without quote references.

D1 CAS revisions protect concurrent updates. SQLite triggers atomically append audit revisions. Inbox and operation queues record attempts before provider lookups, avoiding starvation when earlier requests fail. Stale/pending responses cannot reopen funding after processing; paid/refunded states do not regress. Active operations are polled; paid/failed/expired entries are polled for seven days from creation for late receipts/refunds. Older terminal records can be reconciled manually. Refunded is terminal. Unmatched action events remain pending for later matching and need monitoring/retention management.

## Official pBRL sandbox

The official sandbox is Base Sepolia pBRL, not Stellar Testnet USDC. Test funds have no real BRL claim or PIX payout. It uses 18 token decimals, a 1:1 BRL rate, zero fees, 0.01–1000 BRL bounds, and fifteen-minute quotes. It is deliberately isolated from the live Stellar adapter and its seven-decimal money limits.

First diagnose the configured API host without creating profiles or quotes:

```sh
# From apps/web; Node 22 is the tested runtime. Loads only the local ignored .env.
pnpm test:pods:sandbox -- --probe
```

The command uses an empty confirmation POST and expects VALIDATION_ERROR from an existing sandbox route. NOT_FOUND/auth/transport failures block the full run. A passing probe checks route availability, not hosted-KYC account enablement or successful settlement.

Once Pods provides/enables the confirmed staging URL, set PODS_SANDBOX_ENABLED=true, PODS_SANDBOX_API_BASE_URL=<confirmed URL> and the corresponding PODS_API_KEY in the local ignored .env, then:

```sh
pnpm test:pods:sandbox
```

The runner creates synthetic identities and fresh test wallets, checks dummy hosted links use the reserved .invalid domain, and exercises approval, final rejection, retry/reset, pBRL mint/redeem, duplicate confirmation, four payout failure reasons and payer-mismatch refund. Status polling is bounded. It logs only scenario/status/opaque ids/testnet hashes, never CPF/email/bearer links/headers/key. It does not test an actual fifteen-minute expiry by waiting; expiry handling is fixture-tested. If a run stops after a transition, inspect that quote before rerunning; the script does not retry mint/burn POSTs automatically.

## Verification

From the repo root:

```sh
pnpm --filter web test:ramp
pnpm --filter web test:ramp:d1
pnpm --filter web type-check
pnpm --filter web cf:build
```

D1 tests use an ephemeral local Cloudflare binding, never the remote database. They cover concurrent idempotency/CAS, trigger audit, encrypted snapshots, customer isolation, webhook deduplication, failed-provider queue rotation, identity uniqueness and profile reassignment rejection. An additional local Next/D1 HTTP smoke covered private auth, persisted mock quote, acceptance and cross-customer 404.

TuCOP local verification covers destination ownership/consent, concurrent acceptance, provider-id checkpoints, bounded recovery, dynamic amount refresh including quote replay, null terminal data, exact Stellar instructions and the published webhook-signature fixture. The updated production key passed a read-only check through the actual adapter and the local HTTP route. Final checks: 53 ramp tests, 22 Stellar tests, local D1 integration, type-check, local Next/D1 HTTP smoke and Cloudflare build passed. No TuCOP financial E2E test ran.

Remaining external prerequisites: TuCOP sandbox key/linked business and controlled Stellar payment validation; Pods sandbox access, hosted-KYC enablement/return allowlist, full authenticated sandbox run, Stellar contract validation, verified Cavos session integration, production D1/secrets and scheduled reconciliation. No production Worker deployment or live PIX payment was executed.
