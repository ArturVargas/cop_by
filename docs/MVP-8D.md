# COP By Stellar — MVP 8 dias

> Asume: TuCOP Ramp ya acepta USDC en Stellar (deposito `G…`, `return_address` Stellar).
> Stack: Cavos (wallet) + TuCOP Ramp (Bre-B / Pix / SPEI) + Next.js sobre el main de julio 2026.
> Base: `https://github.com/ArturVargas/cop_by` @ `7034155`.
> Fuera de scope: MiniPay, Squid, ETH/WBTC, CoDi, Pollar, clone de Cop-BY (Clerk/Arc/VPS kill switch).

## North star del MVP

Un usuario entra con Google/email (Cavos), tiene USDC en Stellar, y puede:

1. Ver saldo USDC (y equivalente en pesos).
2. Enviar USDC a otra `G…`.
3. Gastar USDC a Bre-B (COP), Pix (BRL) o SPEI/CLABE (MXN) via TuCOP.
4. Ver actividad + comprobante.

## Dia 0 (antes de codear) — checklist TuCOP Stellar

Confirmar con docs/sandbox real (no inventar):

- [ ] `deposit.chain` / issuer USDC Circle en Stellar
- [ ] `return_address` acepta `G…`
- [ ] Party session: email OTP y/o firma Stellar (Cavos Google no abre session TuCOP)
- [ ] `consumer_fee_wallet` en Stellar o sigue `0x`
- [ ] Sandbox Stellar + webhooks
- [ ] Productos `pay` (+ `withdraw` si da tiempo) habilitados; BRL/MXN prendidos si van en MVP

Si algo falla, el dia 1-2 no se bloquea: mock del cliente TuCOP.

## Dia 1 — Bootstrap Stellar + Cavos

Objetivo: app corre, login Cavos, `G…` visible, sin MiniPay/wagmi.

- Branch `feat/stellar-mvp` desde `main`.
- Quitar RainbowKit/wagmi/viem del camino critico (o dejar muerto sin importar en home).
- Instalar `@cavos/kit`, env: `NEXT_PUBLIC_CAVOS_APP_ID`, network testnet/mainnet, `appSalt`.
- `CavosProvider` + login modal (Google / Apple / email).
- `create()` + trustline USDC Circle si hace falta.
- Navbar: saldo USDC + alias; sin `Connect Wallet` tipo EVM.
- Copy pesos-first en espanol (reusar onboarding corto).

Done: usuario logueado ve `G…` y saldo USDC (0 ok).

## Dia 2 — Home pesos + enviar USDC

Objetivo: tabs `Obtener` (placeholder) | `Enviar` | `Gastar` (shell).

- Home mobile-first (recortar `page.tsx` monolitico: extraer pantallas).
- Enviar USDC: monto + destinatario `G…` + confirm + `sign`/`payment`.
- Destinatarios guardados (alias, max 5) adaptados a Stellar.
- Mensajes de error: trustline, XLM/sponsor, rechazo de firma.
- Token set: solo USDC (sacar ETH/WBTC/USDT del portfolio).

Done: envio USDC testnet end-to-end + receipt basico.

## Dia 3 — Backend TuCOP (server only)

Objetivo: cliente server-side TuCOP listo, sin key en browser.

- `TUCOPRAMP_API_KEY` solo server; base URL sandbox.
- Routes Next: party session proxy, destinations, quotes, payments, rates, limits, webhooks.
- Seguir reglas agents: Idempotency-Key, amounts `{amount, asset}`, branch on `code`, verify webhooks.
- Tabla Neon `ramp_operations` (espejo swaps/transfers): op_id, party, rail, status, amounts, tx hashes.
- Mapear identidad Cavos `userId`/email → party TuCOP (session email OTP o el metodo Stellar que confirmen).

Done: desde API interna se puede quote + crear payment (aunque el UI aun no).

## Dia 4 — Flujo Gastar (Bre-B COP)

Objetivo: off-ramp COP al Bre-B de un tercero.

UI:

1. Monto en pesos (o USDC con estimate `GET /ramp/rates`).
2. Llave Bre-B → register destination → mostrar holder → confirm.
3. Quote (2 min TTL) → crear payment → firmar envio exacto `deposit.amount` desde `G…` del user.
4. Estados: awaiting_funds / processing / completed / failed (copy 15–30 min).

No swap directo al deposit address (regla TuCOP).

Done: un pago Bre-B sandbox completado + webhook actualiza activity.

## Dia 5 — Pix + SPEI

Objetivo: mismos flujos con rail distinto.

- Destinos Pix (BRL) y CLABE SPEI (MXN); `destination_amount` en moneda del rail.
- Endorsements `pix_offramp` / `spei`; copy de errores `currency_not_enabled`.
- Selector de pais/riel en Gastar.
- Limits por moneda (`GET /ramp/limits?currency=`).

Done: al menos un rail extra E2E en sandbox (Pix o SPEI); el otro con UI + mock si falta enable.

## Dia 6 — Activity, recibos, fee

Objetivo: producto usable y con revenue path.

- Unificar activity: transfers Stellar + ramp ops (reusar `/activity` patterns).
- Comprobante compartible (WhatsApp) para envio y para gasto fiat.
- Mostrar fee TuCOP + `consumer_bps` en confirmacion (si `consumer_fee_wallet` Stellar listo; si no, fee visible y cobro diferido).
- Withdraw first-party (propia llave Bre-B) si da tiempo; si no, backlog.

Done: historial legible + fee visible en al menos un flujo pay.

## Dia 7 — Hardening + QA

Objetivo: no perder fondos por edge cases.

- Checklist TuCOP: monto exacto, mismo sender, un payment abierto, cancel unfunded, no reintento 4xx.
- Idempotencia y webhook verify.
- Empty/loading/error states mobile 360x640.
- Sin message signing innecesario; party auth solo lo que TuCOP pide.
- Type-check + smoke testnet/sandbox.

Done: lista de bugs P0 cerrada; happy path grabado (video corto).

## Dia 8 — Polish + ship staging

Objetivo: staging publico.

- Copy final es-CO (Network fee / Deposit / Withdraw / Stablecoin / Phone number segun contexto MiniPay-less pero claro).
- README + `.env.template` Cavos + TuCOP + Neon + Stellar RPC.
- Deploy Vercel (web) + Neon prod-like sandbox.
- Criterios de exito medibles:
  - Login → trustline → saldo en < 2 min
  - Envio USDC success rate smoke
  - Pay Bre-B: quote → deposit → webhook completed
- Backlog escrito: CoDi, Soroswap partner fee on-chain, withdraw, analytics, multi-device Cavos restore.

Done: URL staging + checklist de go-live.

## Fuera de los 8 dias

- CoDi
- Squid / Soroswap aggregator (salvo fee TuCOP)
- Partner portal Clerk / Arc / Pix SPEI deploy VPS legacy Cop-BY
- Kill switch mantenimiento Cop-BY
- P2P TuCOP (solo apps TuCOP)

## Orden de riesgo

| Riesgo | Mitigacion |
| --- | --- |
| Party session Stellar distinta a Cavos Google | Email OTP bridge dia 3 |
| `consumer_fee_wallet` solo EVM | Mostrar fee; cobrar despues |
| BRL/MXN no enabled | MVP solo Bre-B; UI lista |
| `page.tsx` 4k LOC | Extraer screens dia 2, no rewrite total |

## Dependencias externas

- Cuenta Cavos + gas Stellar fondeado
- Integrator TuCOP sandbox `pay` (+ currencies)
- Neon `DATABASE_URL`
- RPC Stellar (testnet public / mainnet provider)
