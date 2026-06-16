export type TokenActivation = "active" | "ready" | "pending";

export type PortfolioToken = {
  symbol: string;
  label: string;
  address?: `0x${string}`;
  allowance?: bigint;
  balanceUsd: number;
  balanceDisplay?: string;
  decimals?: number;
  activation: TokenActivation;
  color: string;
  allowanceDisplay?: string;
  hasBalance?: boolean;
  isLive?: boolean;
  requiresApproval?: boolean;
};

export const mockPortfolioTokens: PortfolioToken[] = [
  {
    symbol: "USDC",
    label: "USD Coin",
    balanceUsd: 10,
    activation: "active",
    color: "#2775CA",
  },
  {
    symbol: "USDT",
    label: "Tether USD",
    balanceUsd: 30,
    activation: "ready",
    color: "#26A17B",
  },
  {
    symbol: "ETH",
    label: "WETH on Celo",
    balanceUsd: 50,
    activation: "ready",
    color: "#627EEA",
  },
  {
    symbol: "WBTC",
    label: "Wrapped Bitcoin",
    balanceUsd: 12,
    activation: "ready",
    color: "#F7931A",
  },
];

export const purchasePreview = {
  copAmount: "200,000",
  exchangeRateLabel: "1 USD = 3,810 COPm",
  inputUsdAmount: 52.5,
  inputUsdLabel: "Equivale a $52.50 USD aprox.",
  feeLabel: "1.5% · $0.79",
  slippageLabel: "0.3%",
  activationCapUsd: 450,
};

export function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}
