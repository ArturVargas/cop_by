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
are configured for this Stellar deployment. TuCOP and Stellar history remain
pending. There is no R2 cache requirement for the current frontend.

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
