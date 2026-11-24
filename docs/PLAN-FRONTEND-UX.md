# Plan — frontend UX (Stellar home)

Date: 2026-11-24  
Depends on: `docs/AUDIT-FRONTEND.md`  
Out of scope: TuCOP Gastar flow, backend Ramp, Inter/font redesign

## Goal

Ship an accessible Obtener | Enviar | Gastar shell and a send form that matches modern forms/tabs/copy guidance, without changing send economics (kit SAC / Reserve).

## Implementation steps

1. **Tabs** — `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`; panels `role="tabpanel"` + `aria-labelledby`; Left/Right arrows to move selection; style from `aria-selected`.
2. **Send form** — `<form>` with labelled inputs (`htmlFor`/`id`); `required` on amount + destination; validate destination/amount on blur and on submit; set `aria-invalid` + `aria-describedby`; announce errors with `aria-live="polite"`; do not show destination format errors on every keystroke; clear field error on input once valid; primary button `type="submit"`; disable only while `sending`.
3. **Copy address** — try/catch clipboard; announce success/failure via `role="status"`; keep full `G…` on clipboard.
4. **Confirm / result** — `aria-busy` while signing; success block `role="status"`; shorten display of saved recipients; keep full destination on confirm (safety).
5. **Empty tabs** — clearer Obtener (faucet/copy hint) and Gastar (Bre-B coming) copy; no fake cards.
6. **Activity** — short `G…` display + title with full address.

## Verify

- `pnpm --filter web type-check`
- Manual: keyboard through tabs; submit empty form; invalid G; copy address; send confirm busy text

## Done when

Keyboard and screen-reader users can select tabs and complete/continue the send form with announced errors; copy reports success or failure.
