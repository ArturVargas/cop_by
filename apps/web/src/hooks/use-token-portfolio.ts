"use client";

import { useMemo } from "react";
import { erc20Abi, formatUnits, type Address } from "viem";
import { useReadContracts } from "wagmi";

import { useWalletAdapter } from "@/hooks/use-wallet-adapter";
import type { SupportedTokenKey, TokenConfig } from "@/lib/network-config";
import {
  formatUsd,
  mockPortfolioTokens,
  type PortfolioToken,
  type TokenActivation,
} from "@/lib/mock-portfolio";

const TOKEN_COLORS: Record<SupportedTokenKey, string> = {
  copm: "#0E7C4F",
  usdc: "#2775CA",
  usdt: "#26A17B",
  wbtc: "#F7931A",
  weth: "#627EEA",
};

const STABLE_SYMBOLS = new Set(["USDC", "USDT", "COPm"]);

export type PortfolioTokenWithOnchain = PortfolioToken & {
  address?: Address;
  allowance?: bigint;
  allowanceDisplay?: string;
  balance?: bigint;
  balanceDisplay: string;
  decimals: number;
  enabled: boolean;
  isLive: boolean;
  requiresApproval: boolean;
};

export type TokenPortfolioState = {
  approvalTarget?: Address;
  isConnected: boolean;
  isCorrectNetwork: boolean;
  isLoading: boolean;
  tokens: PortfolioTokenWithOnchain[];
  totalUsd: number;
};

function formatTokenAmount(value: bigint | undefined, token: TokenConfig) {
  if (value === undefined) return "0";

  const formatted = formatUnits(value, token.decimals);
  const numeric = Number(formatted);

  if (!Number.isFinite(numeric)) return formatted;
  if (numeric === 0) return "0";
  if (numeric < 0.0001) return "<0.0001";

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: token.decimals > 8 ? 4 : 6,
  }).format(numeric);
}

function estimateUsdValue(value: bigint | undefined, token: TokenConfig) {
  if (value === undefined || !STABLE_SYMBOLS.has(token.symbol)) return 0;
  return Number(formatUnits(value, token.decimals));
}

function getActivation(
  token: TokenConfig,
  allowance: bigint | undefined,
  approvalTarget?: Address
): TokenActivation {
  if (!token.requiresApproval) return "active";
  if (!approvalTarget) return "ready";
  return allowance && allowance > 0n ? "active" : "ready";
}

export function useTokenPortfolio(approvalTarget?: Address): TokenPortfolioState {
  const { address, currentNetwork, isConnected, isCorrectNetwork } =
    useWalletAdapter();

  const configuredTokens = useMemo(
    () =>
      Object.values(currentNetwork?.tokens ?? {}).filter(
        (token) => token.enabled && token.key !== "copm" && token.address
      ),
    [currentNetwork]
  );

  const balanceContracts = configuredTokens.map((token) => ({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  }));

  const allowanceContracts = configuredTokens
    .filter((token) => token.requiresApproval && approvalTarget)
    .map((token) => ({
      address: token.address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, approvalTarget],
    }));

  const shouldRead = Boolean(
    isConnected && isCorrectNetwork && address && currentNetwork
  );

  const balances = useReadContracts({
    contracts: balanceContracts,
    query: {
      enabled: shouldRead && balanceContracts.length > 0,
    },
  });

  const allowances = useReadContracts({
    contracts: allowanceContracts,
    query: {
      enabled:
        shouldRead && Boolean(approvalTarget) && allowanceContracts.length > 0,
    },
  });

  const liveTokens = useMemo(() => {
    if (!shouldRead) {
      return mockPortfolioTokens.map((token) => ({
        ...token,
        balanceDisplay: formatUsd(token.balanceUsd),
        decimals: 18,
        enabled: true,
        hasBalance: token.balanceUsd > 0,
        isLive: false,
        requiresApproval: token.activation !== "active",
      }));
    }

    let allowanceIndex = 0;

    return configuredTokens.map((token, index) => {
      const balance = balances.data?.[index]?.result as bigint | undefined;
      const allowance = token.requiresApproval
        ? (allowances.data?.[allowanceIndex++]?.result as bigint | undefined)
        : undefined;
      const balanceUsd = estimateUsdValue(balance, token);

      return {
        symbol: token.symbol,
        label: token.name,
        balanceUsd,
        activation: getActivation(token, allowance, approvalTarget),
        color: TOKEN_COLORS[token.key],
        address: token.address,
        allowance,
        allowanceDisplay:
          allowance !== undefined ? formatTokenAmount(allowance, token) : undefined,
        balance,
        balanceDisplay: `${formatTokenAmount(balance, token)} ${token.symbol}`,
        decimals: token.decimals,
        enabled: token.enabled,
        hasBalance: balance !== undefined && balance > 0n,
        isLive: true,
        requiresApproval: token.requiresApproval,
      };
    });
  }, [
    allowances.data,
    balances.data,
    configuredTokens,
    approvalTarget,
    shouldRead,
  ]);

  const totalUsd = useMemo(
    () => liveTokens.reduce((sum, token) => sum + token.balanceUsd, 0),
    [liveTokens]
  );

  return {
    approvalTarget,
    isConnected,
    isCorrectNetwork,
    isLoading: balances.isLoading || allowances.isLoading,
    tokens: liveTokens,
    totalUsd,
  };
}
