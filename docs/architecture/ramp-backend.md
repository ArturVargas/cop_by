# Modular Stellar → PIX backend

Date: 2026-11-27. Branch: codex/backend-pix-pods. Operational details and current resources: ramp-runbook.md.

## Confirmed scope
USDC from a Cavos Stellar wallet pays BRL via PIX. Start with Pods, then implement the same provider contract for TuCOP when Stellar is ready. Signing stays on the user's device. This branch builds private integration APIs and an official sandbox runner; it does not expose them directly to browser users or enable live funds.

## Architecture
Next.js Route Handlers on Cloudflare/OpenNext with Cloudflare D1 persistence. D1 replaces the initial unused ramp Postgres implementation to respect the user's all-Cloudflare hosting choice. No remote ramp data needed migration. The legacy Celo APIs keep their separate Neon dependency.

The provider id is stored on each operation, so changing the default cannot reroute in-flight payments. A small provider interface handles quotes, funding instructions, status and webhook verification. TuCOP explicitly reports unavailable. Mock returns simulation-only instructions with no executable destination. Official pBRL sandbox uses a separate test client because its Base Sepolia chain, token, decimals and settlement mechanics differ from Stellar.

The private API uses server-only Bearer RAMP_INTERNAL_API_TOKEN and a trusted X-Ramp-Customer-Id. This is an administrator integration principal, not end-user authentication. Customer-facing access still requires verified Cavos identity and wallet ownership. Never put the integration token in a browser.

## Data and sources of truth
Pods owns KYC, currency capability, limits, quotes and canonical settlement status. Stellar owns actual funding. D1 owns application idempotency, operation snapshots, audit revisions, KYC ownership associations and webhook inbox. A reported hash or ACTION_UPDATE success is not evidence of payout; query the quote status.

Stellar money uses exact string/BigInt amounts with seven ledger decimals; BRL has two. pBRL sandbox uses eighteen decimals and independent bounds. Preserve exact quote amount, fees, expiry and destination. Require explicit thirdParty. Do not adapt another network's bytecode into an invented Stellar operation.

D1 stores encrypted operation snapshots with AES-256-GCM, bound to customer/operation id. HMAC keys derived from the encryption key protect idempotency and identity fingerprints. CAS revisions plus SQLite triggers make snapshot writes and audit appends atomic. Attempt timestamps rotate work queues even when provider queries fail. No runtime DDL or memory fallback.

Hosted KYC reserves a unique customer/applicant/wallet binding before POSTing to Pods. CPF/email are not persisted. Store keyed fingerprints, encrypted wallet and unique provider profile id; verify the provider wallet before releasing any verification bearer link. Status/reset/limits look up the profile from the owning principal. Retry the same session request using Pods' CPF idempotency; never silently replace an existing profile/wallet. KYC links remain transient, uncached and unlogged.

## State and event handling
States: quoting, quoted, awaiting_funding, funding_reported, processing, paid, refunded, expired, failed, needs_attention. Reserve before provider quote creation. Unknown timeout outcomes are retained without automatic duplicate requests. Pending observations cannot reopen funding after processing, and stale observations cannot downgrade paid/refunded states. Later confirmed refunds are allowed.

Canonical fulfilled is paid even if the bank receipt has not arrived. Expose receiptPending, retain original/refund PIX ids independently and keep the first observed values. Failure codes remain separate from creation/transport errors.

Signed webhooks are authenticated over raw bytes, replay-bounded and durably deduplicated before acknowledgement. They enqueue canonical status reconciliation. Pods does not automatically retry webhook delivery, so scheduling/polling remains required; this branch does not publish a scheduler.

## Readiness boundaries
- Dedicated D1 staging database and migrations exist. No production Worker deploy or production D1 binding was added.
- API key accepted a limits query at api.pods.finance; sandbox confirmation route returned404 there. Full authenticated staging scenarios remain unexecuted until Pods enables/provides that environment.
- Hosted KYC requires account enablement and return URL allowlisting. The current currency-unlock schema is USD-only; hosted BRL readiness is checked through brlaEnabled.
- Stellar token identifier, KYC wallet support, mainnet funding response and third-party payout support need credentialed validation. Keep live Stellar disabled.
- BR Code amountOut pricing and abnormal/late funding need an explicit product flow before advertising them.
- Verified Cavos sessions, production secrets/database, scheduled reconciliation and real-corridor verification remain prerequisites for customer-facing payments.

## Primary sources
- https://docs.pods.finance/guides/kyc/pods-hosted
- https://docs.pods.finance/guides/kyc/sandbox
- https://docs.pods.finance/guides/ramp/overview
- https://docs.pods.finance/guides/ramp/quotes
- https://docs.pods.finance/guides/ramp/status
- https://docs.pods.finance/guides/ramp/sandbox
- https://docs.pods.finance/guides/webhooks
- https://docs.pods.finance/openapi.yaml
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- https://opennext.js.org/cloudflare/bindings
