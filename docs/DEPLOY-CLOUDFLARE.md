# Stellar deployment on Cloudflare Workers

Host: `https://stellar.copby.money`
Worker: `copby-stellar`
Application: `apps/web` (OpenNext + Wrangler, Node.js 22.12+)

First deployed: 2026-11-25. Version: `949694a1-5371-4b36-aef8-871db5ada39a`.

## Build variables

Create an ignored `apps/web/.env.production.local` with the Cavos App ID from
the existing local configuration and these values:

```dotenv
NEXT_PUBLIC_CAVOS_APP_ID=<Cavos App ID>
NEXT_PUBLIC_CAVOS_NETWORK=testnet
NEXT_PUBLIC_CAVOS_ENVIRONMENT=development
NEXT_PUBLIC_CAVOS_REDIRECT_URI=https://stellar.copby.money/
```

Use the App ID, never a Cavos team API key. Public variables are embedded during
the Next.js build; changing Worker runtime variables alone does not update them.
For Workers Builds, configure the same values as build variables.

In the existing Cavos app, add `https://stellar.copby.money` as an allowed web
origin and `https://stellar.copby.money/` as a callback URL. Keep the existing
localhost entries. This deployment continues to use Stellar testnet.

## Deploy

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter web exec wrangler login
pnpm --filter web cf:build
pnpm --filter web cf:preview
pnpm --filter web cf:deploy
```

The Wrangler configuration binds the custom domain directly to the Worker.
Cloudflare manages its DNS record and TLS certificate. The account must manage
the `copby.money` zone. Do not create a separate CNAME or change the apex domain.

The existing EVM API routes are retained but no legacy database or signing keys
are configured for this Stellar deployment. TuCOP remains pending. USDC history, receiving addresses and shareable Stellar
receipts are available. There is no R2 cache requirement for the current frontend.

## Verify

- The OpenNext build and Wrangler dry run succeed.
- `/` and `/activity` return HTTP 200 through Workers.
- The home response contains the Cavos CSP and serves its JavaScript assets.
- The public custom domain serves HTTPS after deployment.
- Cavos login returns to the custom domain and shows the expected testnet wallet.
- Any payment smoke test uses testnet USDC only.

Wrangler reports the compressed Worker size before deployment. If it exceeds
the account's plan limit, deployment needs either a smaller bundle or an account
plan change; do not enable a paid plan automatically.

## UI improvements release — 2026-11-25

Application commit: `9ca3b19` (15 separate implementation commits since `d57402b`).
Cloudflare Worker version: `3fba35ea-835b-42fd-84a2-af60723c9caf`.

This release shares confirmed wallet balances, preserves them on query errors,
binds send confirmation to delivery and the verified fee ceiling, distinguishes
claimable balances, and improves onboarding, keyboard navigation, touch targets
and Activity recovery. The Usar todo balance label uses two decimals (`15.00`)
while transfers keep the original ledger precision. The palette is documented
in DESIGN.md and noncritical send/receipt components load on demand.

Validation completed:

- `pnpm --filter web test:stellar`: 15 passing tests.
- `pnpm --filter web test:wallet-state`: shared consumers, offline/retry,
  response ordering, account switches, zero balances and setup outcomes.
- `pnpm --filter web test:receipt-export`: full PNG bounds at 320px/480px containers.
- Type-check, OpenNext Cloudflare build and Wrangler dry run passed.
- Responsive and keyboard browser checks passed; signed-in UI used a simulated wallet.
- Independent code review found no remaining critical or important issues.
- Live HTTPS `/`, `/activity` and the Stellar activity API returned 200; the API
  returned six movements for the public test account during verification.
- The deployed onboarding and Cavos sign-in modal opened successfully.

No real transfers or authenticated Cavos submissions were performed in this QA.
The Worker gzip upload was approximately 1.9 MiB. Vendored SDK build warnings
remain; they did not prevent building, deploying or serving the app.
