# Stellar UI improvements implementation plan

> Execute inline with superpowers:executing-plans. Scope approved in chat: nine Impeccable findings, separate commits, then Cloudflare deployment.

**Goal:** Resolve the UI audit without replacing the visual identity or adding dependencies.
**Architecture:** Shared wallet context; explicit transfer preparation and delivery outcomes; native dialog; existing Next.js/Tailwind components.
**Stack:** React 18, Next 15, Cavos, Stellar SDK, Cloudflare Workers.
**Spec:** Impeccable audit accepted in this chat on 2026-11-25.

## Constraints
Preserve Spanish UI, "Non-custodial Wallet", Stellar Testnet and full receipt verification details. No real transfers during automated QA. Keep changes sequential and commit each finding separately. Deploy only after all verification passes.

## Tasks
- [x] 1. Shared balance: preserve last confirmed value on errors, visible retry, prevent stale-balance sends. Browser checks: shared consumers, offline, retry and account changes.
- [x] 2. Prepare transfer before confirmation: display delivery and maximum extra fee; never silently switch to a paid route. Tests: sponsored/claimable plans, exact amount/fee arithmetic, expired quote and receipt delivery.
- [x] 3. Onboarding: native modal, scrollable short viewports, contained focus and dismissal. Browser: 568x320, Tab, Escape.
- [ ] 4. Copy: distinguish available/pending spending; explain memo and reserved funds without SDK jargon. Review actual states and labels.
- [ ] 5. Keyboard: tabs Home/End focus; account disclosure state, Escape/outside dismissal. Browser assertions.
- [ ] 6. Touch targets: minimum 44px for relevant Stellar actions and legible inputs. Browser measurements at 320px.
- [ ] 7. Activity recovery: distinct loading/device/login/deployment/error actions. Render/check each state; preserve history and receipt navigation.
- [ ] 8. Tokens: centralize current Stellar palette and apply it across the audited components, preserve exported-image colors. Detector plus screenshot comparison.
- [ ] 9. Loading: isolate send/receipt heavy modules from initial home route; compare production JS chunks, confirm history and receipt export still work.
- [ ] Final polish and regression: unit tests, type-check, build, mobile/desktop/landscape, shared wallet errors and PNG export. Review entire diff, push commits, deploy Worker, verify live app/API.

## Review focus
- Query failure must never become a valid zero or permit a stale balance to authorize a send (task 1).
- Fees and reserve outcomes must be confirmed before signing; quote failures cannot silently reprice or retry a send (task 2).
- Wallet/account changes cannot show a previous user's balance or receipt (tasks 1/2/7).
- Small viewports and keyboard-only use must reach every primary action (tasks 3/5/6).
- Shared palette must survive html-to-image export; dynamic chunks must load on Cloudflare (tasks 8/9/final).

Task 1 verified: browser regression failed before the change (consumer B stayed at 20), then passed (shared 8, offline preservation, retry); TypeScript passed.

Task 2 verified: 14 unit tests and type-check pass. Exact amount parsing failed before fix; prepared routes, fee caps, account mismatch, expired quotes and no paid fallback covered.

Task 3 verified: native modal, contained Tab focus, reachable Start at 568x320 and Escape; type-check passed.
