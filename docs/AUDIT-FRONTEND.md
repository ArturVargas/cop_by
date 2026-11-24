# Audit frontend — artur-cop-by (Stellar home)

Date: 2026-11-24  
Scope: `stellar-home`, `send-usdc-panel`, `home-tabs`, navbar, activity, onboarding  
Method: code review + `modern-web-guidance` (`legacy-scan` + guides: forms, tabs, accessibility, copy-button, validate-input-after-interaction)

## Verdict

Day 1–2 UX works for happy path send, but a11y and form patterns are incomplete for mobile/screen readers. Placeholders Obtener/Gastar are thin. Legacy MiniPay page is out of the critical path.

## `legacy-scan` (deterministic subset)

- 1 finding in `legacy/page.minipay.tsx` (`[...tokens].sort` → prefer `toSorted`). Out of scope for Stellar home; ignore for this UX pass.

## Findings (active Stellar UI)

### Tabs (`home-tabs.tsx`)

- Buttons without `role="tab"` / `tablist` / `aria-selected`.
- No `tabpanel` linkage; panels are plain siblings.
- No arrow-key selection (ARIA tabs pattern).

### Send form (`send-usdc-panel.tsx`)

- Labels not wired with `htmlFor` / `id`.
- Not wrapped in `<form>`; primary CTA is `type="button"` not submit.
- Validation shown while typing destination (guide: validate on blur/submit, not every keystroke).
- `Continuar` disabled instead of allowing submit then surfacing errors (forms: don't block discovery of errors by disabling).
- Errors not in `aria-live` / `aria-invalid` on fields.
- Confirm step: dead noop `error && step === "sending" ? null : null`.
- Success copy "Envio enviado"; hash shown raw without status announce.
- Saved recipients show full `G…` (display can short-form; copy/confirm keep full).

### Home / copy (`stellar-home.tsx`)

- Copy uses `clipboard.writeText` without failure path or live region (copy-button guide).
- Loading state is plain text without `role="status"`.
- Balance refresh button has no busy/disabled feedback.

### Activity

- Shows full address; inconsistent with home short form.
- Empty state only; no structure for future list (ok for Day 6, but a11y of empty state can improve).

### Design / product

- Layout uses Inter (existing); Obtener/Gastar placeholders don't explain next action clearly.
- Confirm shows full destination (good for safety) — keep full there; short elsewhere.

## Guides consulted

- `forms`, `tabs`, `accessibility`, `copy-button`, `validate-input-after-interaction`, `required-field-feedback`, `spinner` (loading busy state)

## Priority for immediate UX pass

P0: tabs semantics, form labels + blur validation + live errors, copy feedback.  
P1: confirm/sending busy announce, short recipients, activity short address.  
P2: richer Obtener/Gastar empty states (copy only).
