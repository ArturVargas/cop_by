# Contributing to COP By

COP By is a Celo app for buying, selling, transferring, and spending COPm. Contributions are welcome, but this project handles real funds, token approvals, swaps, database writes, and onchain logs, so changes must be scoped and easy to review.

## Local Setup

Use Node 20.18.0 and pnpm 8.10.0.

```bash
nvm use 20.18.0
corepack enable
corepack prepare pnpm@8.10.0 --activate
pnpm install
```

Run the web app:

```bash
pnpm --filter web dev
```

Run validation:

```bash
pnpm --filter web type-check
pnpm --filter hardhat test
```

## Contribution Flow

1. Pick an existing issue or open one before starting larger work.
2. Comment on the issue so maintainers know you are working on it.
3. Create a focused branch from the latest `main`.
4. Keep the PR small and limited to one problem.
5. Fill out the PR template completely.
6. Include screenshots or a short video for UI changes.
7. Explain exactly how you tested the change.

## Good First Contributions

Good starter tasks usually include:

- Small UI fixes
- Mobile responsiveness improvements
- Empty, loading, and error states
- Copy or documentation improvements
- Analytics display improvements
- Tests around existing behavior

Look for labels such as `good first issue`, `frontend`, `docs`, `analytics`, or `needs-spec`.

## Quality Rules

- Keep each PR scoped to one issue.
- Do not mix refactors, formatting, dependency updates, and feature work in the same PR.
- Do not add dependencies unless they are clearly justified.
- Follow existing project patterns before introducing new abstractions.
- Add tests when changing contracts, backend flows, swaps, or shared logic.
- UI changes must be mobile-first and consistent with the existing COP By visual style.
- Never commit secrets, API keys, private keys, seed phrases, database URLs, or production env values.

## Sensitive Areas

Open an issue or proposal before working on these areas:

- Squid Router quotes or swap execution
- Token balances, approvals, allowances, fees, or slippage
- Recipient purchase or transfer flows
- Smart contracts
- EIP-7702, BatchExecutor, agent trading, or relayer execution
- Backend API routes
- Neon database writes or schema changes
- Onchain logger and analytics attribution
- Environment variables or deployment configuration

These changes may require additional review before implementation and before merge.

## Review Expectations

Simple docs or low-risk UI changes can be approved by one maintainer.

Changes touching contracts, swaps, fees, backend execution, database writes, onchain logging, EIP-7702, or financial logic require stricter review. Maintainers may ask for a design note, extra tests, or a smaller PR.

## Anti-Spam Rules

We may close issues or PRs that are:

- Duplicated without adding new context
- Low-effort or mostly generated
- Unrelated to the roadmap
- Large unrequested rewrites
- Formatting-only changes across many files
- Dependency bumps without a clear reason
- PRs that ignore the template or have no testing notes

## Roadmap Alignment

COP By is focused on:

- Buying COPm
- Selling COPm
- Transfers and recipient purchases
- Spending COPm through services
- Public analytics
- Onchain attribution
- Agent trading infrastructure

If your idea does not clearly fit one of these areas, please open a discussion first.
