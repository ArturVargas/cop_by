# Modular Stellar → PIX backend

Date: 2026-11-27. Branch: codex/backend-pix-pods.

## Confirmed scope
USDC from a Cavos Stellar wallet pays a BRL PIX key. Start with Pods; add TuCOP by implementing the same provider contract when its Stellar rail is enabled. This branch adds server endpoints, persistence and tests. Signing remains on the user's device; the existing UI is outside this slice.

## Decisions
Keep Next.js Route Handlers and Cloudflare deployment, use existing Neon/Postgres driver. A separate service would duplicate auth, deployment and operations without a current need. A direct Pods-only route would couple the app to provider field names; use one small provider interface instead. Store the provider on each operation so changing the default does not reroute existing payments.

The initial routes are a private server-to-server integration API: Bearer RAMP_INTERNAL_API_TOKEN plus X-Ramp-Customer-Id from a trusted server. This is an administrator integration credential, not customer authentication and never a browser key. A future Cavos session verifier supplies the same customer principal; it must verify wallet ownership server-side. Do not connect these endpoints directly from a browser with the integration token.

## Source of truth and data
Pods owns quote amounts, expiry, KYC eligibility and payout status. Stellar owns on-chain funding. Postgres owns application idempotency and the operation/audit/inbox records. A reported transaction hash is a claim, not evidence of funding or PIX completion. Webhooks invalidate/queue reconciliation; their action status does not by itself mark PIX paid. The signed wallet operation is not a backend responsibility.

Amounts are decimal strings, converted with bigint: Stellar USDC has seven ledger decimals and BRL has two. Preserve the exact provider gross amount, fees, quote id and deadline. Require explicit thirdParty on the request and preserve it. Never reuse a quote with another customer, wallet, key or amount.

Operation states: quoting, quoted, awaiting_funding, funding_reported, processing, paid, refunded, expired, failed, needs_attention. Stale provider observations cannot downgrade a paid/refunded operation; later provider-confirmed refunds are allowed. Duplicate requests return their original operation; conflicting bodies with the same key fail. Provider/network timeouts never trigger an automatic duplicate quote request.

## Persistence and security
Apply the SQL migration explicitly; no DDL on normal requests. Encrypt each operation snapshot with AES-256-GCM using an operation/customer binding. Store only non-sensitive lookup fields and append-only state events outside that snapshot. Idempotency request fingerprints use a key derived from the encryption key. Use compare-and-set revisions to avoid races. No process-memory storage in production; in-memory repositories are test fixtures only.

All API/provider secrets are server variables. Limit request bodies, validate addresses/checksums and bounds, use timeouts and disable caches. Never log provider URLs containing PIX keys, KYC evidence, authorization headers or raw responses. Store authenticated webhook deliveries durably before acknowledging them. Pods documents no automatic delivery retries; polling/reconciliation is required even with webhooks, including expiry events that are not pushed.

## Provider readiness
Pods live mode is explicitly gated, mainnet only, and requires API credentials, an approved BRL KYC profile bound to the wallet, and the exact Stellar token identifier from Pods. The public marketing names Stellar, but the inspected OpenAPI still describes several wallet/token/execution fields as EVM/Solana. Missing/unsupported funding payloads must produce an explicit unavailable instruction, never a fabricated address or an executable EVM payload.

Pods documents M… muxed Stellar deposits. Preserve and validate the complete M address; never strip it to G or reuse the current G-only P2P helper. Return normalized payment instructions only after accepting a current quote. No /bytecode call for new integrations: the current Ramp guide says the quote response includes execution fields. Do not call the deprecated status update endpoint or invent a Stellar /fulfill hash contract.

TuCOP remains explicitly unavailable until its Stellar contract is confirmed. The mock provider is visibly simulation-only and returns no deposit address or executable transaction.

## Endpoints
Private: provider capabilities; POST quotes (Idempotency-Key required); GET operation; POST accept; POST report-funding; POST reconcile; POST reconciliation batch. Public only with provider HMAC: Pods webhook inbox. KYC is checked server-side against a supplied Pods kycUserId; KYC capture/identity provisioning UI is a later slice.

## Open items before live payments
- Pods account/KYB/API key and approved BRL KYC; no credentials were present in this app during implementation.
- Confirm Stellar token identifier, quote funding payload and mainnet availability with Pods using a credentialed fixture.
- Configure an isolated DATABASE_URL, encryption key and internal API token; apply migration.
- Wire a verified Cavos customer session/ownership boundary before customer-facing UI access.
- Schedule the bounded reconciliation endpoint and register webhook URL/secret with Pods support.
- Obtain a real test of the intended corridor; provider sandbox described publicly is Base Sepolia, not Stellar Testnet.

## Sources inspected
- https://docs.pods.finance/llms-full.txt
- https://docs.pods.finance/openapi.yaml
- https://docs.pods.finance/guides/ramp/quotes
- https://docs.pods.finance/guides/ramp/status
- https://docs.pods.finance/guides/webhooks
- https://www.pods.finance/products/ramp
