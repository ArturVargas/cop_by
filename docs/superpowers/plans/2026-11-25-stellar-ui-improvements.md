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
- [x] 4. Copy: distinguish available/pending spending; explain memo and reserved funds without SDK jargon. Review actual states and labels.
- [x] 5. Keyboard: tabs Home/End focus; account disclosure state, Escape/outside dismissal. Browser assertions.
- [x] 6. Touch targets: minimum 44px for relevant Stellar actions and legible inputs. Browser measurements at 320px.
- [x] 7. Activity recovery: distinct loading/device/login/deployment/error actions. Render/check each state; preserve history and receipt navigation.
- [x] 8. Tokens: centralize current Stellar palette and apply it across the audited components, preserve exported-image colors. Detector plus screenshot comparison.
- [x] 9. Loading: isolate send/receipt heavy modules from initial home route; compare production JS chunks, confirm history and receipt export still work.
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

Task 4 verified: onboarding matches current availability; memo hint is associated with input; SDK jargon removed from user messages. Unit suite and type-check passed.

Task 5 verified: keyboard regression failed before implementation and now passes Home/End, expanded state, Escape focus return and pointer dismissal. Type-check passed.

Task 6 verified: visible action targets are >=44x44 at 320px on Home, Activity and receipt; no horizontal overflow; type-check passed.

Task 7 verified: seven Activity access states show the appropriate explanation/action and keep history hidden; type-check passed.

Task 8 verified: 14 tests, type-check, share/download PNG at both widths; exported image visually retains full content and palette. Detector: no primary findings, 16 small-font advisories reserved for final polish.

Task 9 verified: production build passed; initial JS measured {"/page": {"before": 439920, "after": 429525}, "/activity/page": {"before": 430565, "after": 428934}}. Send and receipt chunks load on demand; Cavos remains the main shared payload.

Final regression found and fixed: confirmed receipt was hidden when post-send balance refresh failed. Browser check failed before the fix and passes with reviewed Reserve costs, claimable outcome and persisted receipt. No real transaction was sent.

Final regression found and fixed: a delayed balance query could overwrite a newer result. Browser test reproduced 99 replacing 6, then passed with request ordering, offline retention and retry recovery. Bootstrap completion is account-scoped.

Final review: fee display now derives from the verified quote payload instead of duplicate response metadata. Regression with mismatching metadata failed before the change; all 14 tests and type-check pass.
