# cop_by

Buy COPm in MiniPay with the tokens already in your wallet.

## One Slide Pitch

**COP By turns fragmented MiniPay balances into Colombian digital pesos in a few taps.**

MiniPay users often hold small amounts across USDC, USDT, ETH, or WBTC, but converting those balances into COPm should feel like one simple purchase, not a crypto workflow. COP By detects the compatible tokens in the user's wallet, lets them choose the order in which balances should be spent, prepares token permissions, quotes swaps through Squid Router, and delivers COPm directly to the same wallet.

- **User problem**: people want usable COPm, not manual token routing.
- **Solution**: a MiniPay-first COPm purchase flow with ordered token spending.
- **First market**: Colombian users who need local digital pesos for daily payments.
- **MVP flow**: order tokens, approve once per token, enter COPm amount, buy.
- **Data layer**: swaps are stored in Neon and logged onchain for attribution and analytics.
- **Revenue path**: protocol fee through Squid integrator fee configuration.

A modern Celo blockchain application built with Next.js, TypeScript, Squid Router, Neon, and Turborepo.

## Getting Started

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start the development server:
   ```bash
   pnpm dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

This is a monorepo managed by Turborepo with the following structure:

- `apps/web` - Next.js application with embedded UI components and utilities
- `apps/hardhat` - Smart contract development environment

## Available Scripts

- `pnpm dev` - Start development servers
- `pnpm build` - Build all packages and apps
- `pnpm lint` - Lint all packages and apps
- `pnpm type-check` - Run TypeScript type checking

### Smart Contract Scripts

- `pnpm contracts:compile` - Compile smart contracts
- `pnpm contracts:test` - Run smart contract tests
- `pnpm contracts:deploy` - Deploy contracts to local network
- `pnpm contracts:deploy:celo-sepolia` - Deploy to Celo Sepolia Testnet
- `pnpm contracts:deploy:celo` - Deploy to Celo Mainnet

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Smart Contracts**: Hardhat with Viem
- **Monorepo**: Turborepo
- **Package Manager**: PNPM

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Celo Documentation](https://docs.celo.org/)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com/)
