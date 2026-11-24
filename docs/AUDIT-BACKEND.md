# Audit backend — artur-cop-by (Stellar MVP)

Date: 2026-11-24  
Scope: `apps/web/src/app/api/*`, `lib/db.ts`, env templates  
Method: code review + MVP-8D gap vs TuCOP own-provider model in `cop_by`

## Verdict

Backend is still **MiniPay / Squid / EVM**. There is **no TuCOP Ramp**, no Stellar persistence, and no server path for Day 3+. Cavos + send USDC run client-side only.

## What exists

| Area | Path | Notes |
|------|------|--------|
| Swaps | `/api/swaps`, `/api/swaps/[intentId]`, log-onchain | EVM `0x` via `viem.isAddress`; Neon `swap_intents` |
| Transfers | `/api/transfers`, `/api/transfers/[transferId]` | COPm transfer intents; EVM addresses |
| Prices | `/api/token-prices`, `/api/copm-rate-history` | Display helpers for old portfolio |
| DB | `lib/db.ts` | `swap_intents`, `copm_transfers`; requires `DATABASE_URL` |
| Auth | none | No session, no API key gate on these routes |

## Gaps for Stellar / TuCOP (Day 3+)

1. **No `lib/tucopramp` client** — no `TUCOPRAMP_API_KEY`, base URL, mock, or Idempotency-Key helper.
2. **No `/api/ramp/*` or `/api/breb/*`** — destinations, quote, rates, payments, cancel, webhook.
3. **No `ramp_operations` (or equivalent) table** — nowhere to store `op_…`, destination, status, `G…` return, Stellar tx hash.
4. **Address model mismatch** — APIs reject non-`0x` addresses; Stellar needs `G…` validation and never truncate in storage/logs.
5. **Webhook surface missing** — no Standard Webhooks (`whsec_`) verify endpoint for `operation.updated` / `destination.*`.
6. **Env template** — `.env.template` has Cavos + legacy Celo; missing `TUCOPRAMP_*`, `DATABASE_URL` docs for ramp.
7. **Legacy dead weight** — Squid swap routes will confuse Day 3 work if left as the only “backend” story; keep but isolate from Stellar home.

## Risks

- Calling legacy swap/transfer APIs from a Stellar UX would fail validation or write wrong chain data.
- Without server-side Ramp, any TuCOP key in the browser would violate agent rules (never ship).
- OpenAPI TuCOP still documents `return_address` as `0x` / Celo; confirm Stellar enablement before wiring live settle.

## Recommended next backend slice (not in this PR)

1. Port `cop_by` `lib/tucopramp` chain-agnostic (own-provider, mock with `G…` deposit).
2. Add Neon `ramp_operations` + thin Next routes under `/api/ramp/*`.
3. Webhook verify + reconcile; leave UI Gastar for Day 4.

## Evidence

- `rg` / glob: zero `tucopramp|TUCOPRAMP|/ramp/` under `apps/web/src`.
- API routes listed above all import `viem` address checks.
- `modern-web-guidance legacy-scan` did not target API semantics (UI/JS corpus only); backend findings are from product review.
