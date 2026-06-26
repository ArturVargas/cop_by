"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import {
  erc20Abi,
  formatUnits,
  isAddress,
  parseEventLogs,
  parseUnits,
  type Address,
  type TransactionReceipt,
} from "viem";
import { usePublicClient, useSendTransaction, useWriteContract } from "wagmi";
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  GripVertical,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  useTokenPortfolio,
  type TokenUsdPrices,
} from "@/hooks/use-token-portfolio";
import {
  formatUsd,
  mockPortfolioTokens,
  PortfolioToken,
  purchasePreview,
} from "@/lib/mock-portfolio";
import { getTargetNetwork } from "@/lib/network-config";
import {
  getSquidServiceFeeUsd,
  getSquidRoute,
  getSquidStatus,
  SQUID_INTEGRATOR_FEE_BPS,
  SQUID_INTEGRATOR_FEE_SPLIT,
  type SquidRouteResult,
} from "@/lib/squid-config";
import {
  createSwapIntent,
  createCopmTransfer,
  logSwapOnchain,
  updateCopmTransfer,
  updateSwapIntent,
} from "@/lib/swap-logging";

const steps = ["Ordenar", "Activar", "Comprar"];
const stepColors = ["#D9CCF7", "#A98BE5", "#6D45B8"];
const FALLBACK_COP_PER_USD = 3400;
const MIN_PURCHASE_USD = 1;
const MIN_SWAP_LEG_USD = 0.01;
const MAX_COPM_AMOUNT = 10_000_000;
const USD_PLAN_TOLERANCE = 0.001;
const RECIPIENTS_STORAGE_KEY = "cop_by_recent_recipients";
const TOKEN_ORDER_STORAGE_KEY = "cop_by_token_order";
const SQUID_CELO_APPROVAL_TARGET =
  "0xce16F69375520ab01377ce7B88f5BA8C48F8D666" as Address;

type SwapStatus = "idle" | "quoting" | "buying" | "complete" | "error";
type SwapProgress = "idle" | "quoting" | "confirming" | "processing";
type ActionMode = "buy" | "transfer";
type SwapResult = {
  amountLabel?: string;
  copmBalance: string;
  receivedCopm: string;
  recipientAddress?: string;
  shortfallMessage?: string;
  title?: string;
  txHash: string;
  txUrl: string;
};
type ShortfallQuote = {
  copAmount: string;
  quotedCopm: string;
  quotedUsd: number;
  message: string;
};
type TransferStatus = "idle" | "confirming" | "sending" | "complete" | "error";
type SwapPlanLeg = {
  token: PortfolioToken;
  usdAmount: number;
  fromAmount: bigint;
};

function getDefaultApprovalTargets(targetNetwork: ReturnType<typeof getTargetNetwork>) {
  if (targetNetwork.key !== "celo") return {};

  return Object.fromEntries(
    Object.values(targetNetwork.tokens)
      .filter((token) => token.requiresApproval)
      .map((token) => [token.symbol, SQUID_CELO_APPROVAL_TARGET])
  ) as Partial<Record<string, Address>>;
}

function createIntentId() {
  return crypto.randomUUID();
}

function getFriendlyErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("user rejected") ||
    lowerMessage.includes("user denied") ||
    lowerMessage.includes("rejected the request") ||
    lowerMessage.includes("denied transaction")
  ) {
    return "Cancelaste la confirmacion en tu wallet.";
  }

  if (
    lowerMessage.includes("too many quote requests") ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("429")
  ) {
    return "Estamos recibiendo muchas cotizaciones. Espera unos segundos e intenta de nuevo.";
  }

  if (lowerMessage.includes("low liquidity")) {
    return "No encontramos suficiente liquidez para comprar COPm con este token. Intenta con un monto menor o con otro token.";
  }

  if (lowerMessage.includes("minimum purchase amount")) {
    return `La compra minima es de ${formatUsd(MIN_PURCHASE_USD)} USD aprox.`;
  }

  if (lowerMessage.includes("squid route unavailable")) {
    return "No pudimos obtener una cotizacion de Squid. Intenta de nuevo.";
  }

  if (lowerMessage.includes("insufficient")) {
    return "Saldo o permiso insuficiente para completar esta compra.";
  }

  if (message.length > 180 || lowerMessage.includes("request arguments")) {
    return "No pudimos completar la compra. Revisa la confirmacion en tu wallet e intenta de nuevo.";
  }

  return message || "No pudimos completar la compra. Intenta de nuevo.";
}

function formatAddressPreview(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 7)}...${address.slice(-4)}`;
}

function getTokenPrice(token: PortfolioToken, prices: TokenUsdPrices) {
  if (["USDC", "USDT"].includes(token.symbol)) return 1;
  return token.symbol === "ETH" || token.symbol === "WBTC"
    ? prices[token.symbol]
    : undefined;
}

function floorToDecimals(value: number, decimals: number) {
  const factor = 10 ** Math.min(decimals, 8);
  return Math.floor(value * factor) / factor;
}

function toUnitsDecimal(value: number, decimals: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const places = Math.min(decimals, 18);
  return (
    floorToDecimals(value, decimals)
    .toFixed(places)
      .replace(/\.?0+$/, "") || "0"
  );
}

function getApprovalCap(token: PortfolioToken, prices: TokenUsdPrices) {
  if (!token.decimals) return;
  const price = getTokenPrice(token, prices);
  if (!price) return;
  const tokenAmount = purchasePreview.activationCapUsd / price;
  return parseUnits(toUnitsDecimal(tokenAmount, token.decimals), token.decimals);
}

function tokenHasBalance(token: PortfolioToken) {
  return token.hasBalance ?? token.balanceUsd > 0;
}

function parseCopAmount(value: string) {
  return Number(value.replace(/[^\d.]/g, "")) || 0;
}

function cleanCopInput(value: string) {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function parseCopmUnits(value: string, decimals: number) {
  return parseUnits(toUnitsDecimal(parseCopAmount(value), decimals), decimals);
}

function formatCopmUnits(value: bigint, decimals: number) {
  const numeric = Number(formatUnits(value, decimals));

  if (!Number.isFinite(numeric)) return formatUnits(value, decimals);

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatCopPerUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function getRouteToAmount(routeResult: SquidRouteResult) {
  const toAmount = routeResult.route?.estimate?.toAmount;
  if (!toAmount) return;

  try {
    return BigInt(toAmount);
  } catch {
    return;
  }
}

function getRouteFeeUsd(routeResult: SquidRouteResult) {
  return getSquidServiceFeeUsd(routeResult.route);
}

function getPurchaseUsdAmount(copAmount: string, copPerUsd: number) {
  return parseCopAmount(copAmount) / copPerUsd;
}

function sortTokensBySavedOrder(tokens: PortfolioToken[]) {
  if (typeof window === "undefined") return tokens;
  const saved = window.localStorage.getItem(TOKEN_ORDER_STORAGE_KEY);
  if (!saved) return tokens;
  const order = new Map(saved.split(",").map((symbol, index) => [symbol, index]));
  return [...tokens].sort(
    (a, b) =>
      (order.get(a.symbol) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.symbol) ?? Number.MAX_SAFE_INTEGER)
  );
}

function saveTokenOrder(tokens: PortfolioToken[]) {
  window.localStorage.setItem(
    TOKEN_ORDER_STORAGE_KEY,
    tokens.map((token) => token.symbol).join(",")
  );
}

function getRecentRecipients() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(RECIPIENTS_STORAGE_KEY) ?? "[]"
    );
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && isAddress(item))
      : [];
  } catch {
    return [];
  }
}

function saveRecentRecipient(address: string) {
  if (typeof window === "undefined" || !isAddress(address)) return;
  const normalized = address.toLowerCase();
  const next = [
    normalized,
    ...getRecentRecipients().filter((item) => item.toLowerCase() !== normalized),
  ].slice(0, 5);
  window.localStorage.setItem(RECIPIENTS_STORAGE_KEY, JSON.stringify(next));
}

function getTokenAmountForUsd(
  token: PortfolioToken,
  prices: TokenUsdPrices,
  usdAmount: number
) {
  if (!token.decimals) return;
  const price = getTokenPrice(token, prices);
  if (!price) return;

  return parseUnits(toUnitsDecimal(usdAmount / price, token.decimals), token.decimals);
}

function getTokenAllowanceUsd(token: PortfolioToken, prices: TokenUsdPrices) {
  if (!token.allowance || !token.decimals) return 0;
  const price = getTokenPrice(token, prices);
  if (!price) return 0;
  return Number(formatUnits(token.allowance, token.decimals)) * price;
}

function getTokenSpendableUsd(token: PortfolioToken, prices: TokenUsdPrices) {
  if (!token.isLive) return token.balanceUsd;
  if (token.activation !== "active") return 0;
  return Math.min(token.balanceUsd, getTokenAllowanceUsd(token, prices));
}

function getSwapSourceToken(
  tokens: PortfolioToken[],
  prices: TokenUsdPrices,
  usdAmount: number
) {
  return tokens.find((token) => {
    const fromAmount = getTokenAmountForUsd(token, prices, usdAmount);
    const isApproved =
      !token.isLive ||
      (token.activation === "active" &&
        token.allowance !== undefined &&
        fromAmount !== undefined &&
        token.allowance >= fromAmount);

    return (
      isApproved &&
      Boolean(token.address) &&
      Boolean(fromAmount) &&
      token.balanceUsd >= usdAmount &&
      (!token.balance || !fromAmount || token.balance >= fromAmount)
    );
  });
}

function getApprovedSwapPlan(
  tokens: PortfolioToken[],
  prices: TokenUsdPrices,
  usdAmount: number
): SwapPlanLeg[] {
  const sourceToken = getSwapSourceToken(tokens, prices, usdAmount);
  const singleFromAmount = sourceToken
    ? getTokenAmountForUsd(sourceToken, prices, usdAmount)
    : undefined;

  if (sourceToken && singleFromAmount) {
    return [{ token: sourceToken, usdAmount, fromAmount: singleFromAmount }];
  }

  const plan: SwapPlanLeg[] = [];
  let remainingUsd = usdAmount;

  for (const token of tokens) {
    const spendUsd = Math.min(getTokenSpendableUsd(token, prices), remainingUsd);
    const fromAmount = getTokenAmountForUsd(token, prices, spendUsd);
    if (
      spendUsd < MIN_SWAP_LEG_USD ||
      !fromAmount ||
      !token.address
    ) {
      continue;
    }

    plan.push({ token, usdAmount: spendUsd, fromAmount });
    remainingUsd -= spendUsd;
    if (remainingUsd <= USD_PLAN_TOLERANCE) return plan;
  }

  return plan;
}

function getSwapApprovalCandidate(
  tokens: PortfolioToken[],
  prices: TokenUsdPrices,
  usdAmount: number
) {
  let remainingUsd = usdAmount;

  for (const token of tokens) {
    const neededUsd = Math.min(token.balanceUsd, remainingUsd);
    const fromAmount = getTokenAmountForUsd(token, prices, neededUsd);
    const hasEnoughBalance =
      Boolean(token.address) &&
      Boolean(fromAmount) &&
      (!token.balance || !fromAmount || token.balance >= fromAmount);

    if (
      neededUsd >= MIN_SWAP_LEG_USD &&
      hasEnoughBalance &&
      getTokenSpendableUsd(token, prices) < neededUsd
    ) {
      return { token, usdAmount: neededUsd, fromAmount };
    }

    const spendableUsd = Math.min(getTokenSpendableUsd(token, prices), neededUsd);
    remainingUsd -= spendableUsd >= MIN_SWAP_LEG_USD ? spendableUsd : 0;
    if (remainingUsd <= USD_PLAN_TOLERANCE) return;
  }
}

function getSwapPlanTokenSymbols(plan: SwapPlanLeg[]) {
  return plan.map((leg) => leg.token.symbol).join(" + ");
}

function getSwapPlanUsd(plan: SwapPlanLeg[]) {
  return plan.reduce((sum, leg) => sum + leg.usdAmount, 0);
}

async function waitForSquidStatus(
  routeResult: SquidRouteResult,
  transactionId: string,
  chainId: string
) {
  if (!routeResult.requestId) return;

  const completedStatuses = new Set([
    "success",
    "partial_success",
  ]);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const status = await getSquidStatus({
        transactionId,
        requestId: routeResult.requestId,
        fromChainId: chainId,
        toChainId: chainId,
        quoteId: routeResult.route?.quoteId,
      });

      if (
        status.squidTransactionStatus &&
        completedStatuses.has(status.squidTransactionStatus)
      ) {
        return status.squidTransactionStatus;
      }
    } catch {
      // keep polling briefly; Squid status can lag the receipt
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCopmReceivedFromReceipts(
  receipts: TransactionReceipt[],
  copmAddress: Address,
  userAddress: Address
) {
  const normalizedCopmAddress = copmAddress.toLowerCase();
  const normalizedUserAddress = userAddress.toLowerCase();

  return receipts.reduce((total, receipt) => {
    const logs = parseEventLogs({
      abi: erc20Abi,
      eventName: "Transfer",
      logs: receipt.logs.filter(
        (log) => log.address.toLowerCase() === normalizedCopmAddress
      ),
    });

    return logs.reduce((sum, log) => {
      const to = log.args.to?.toLowerCase();
      return to === normalizedUserAddress ? sum + log.args.value : sum;
    }, total);
  }, 0n);
}

export default function Home() {
  const targetNetwork = getTargetNetwork();
  const copmToken = targetNetwork.tokens.copm;
  const approvalRouteKeyRef = useRef<string | null>(null);
  const [approvalTargets, setApprovalTargets] = useState<
    Partial<Record<string, Address>>
  >(() => getDefaultApprovalTargets(targetNetwork));
  const [routeError, setRouteError] = useState<string | null>(null);
  const [tokenPrices, setTokenPrices] = useState<TokenUsdPrices>({});
  const portfolio = useTokenPortfolio(approvalTargets, tokenPrices);
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const [step, setStep] = useState(0);
  const [actionMode, setActionMode] = useState<ActionMode>("buy");
  const [tokens, setTokens] = useState(mockPortfolioTokens);
  const [copAmount, setCopAmount] = useState(purchasePreview.copAmount);
  const [recipientMode, setRecipientMode] = useState<"self" | "other">("self");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recentRecipients, setRecentRecipients] = useState<string[]>([]);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferConfirming, setTransferConfirming] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferStatus, setTransferStatus] = useState<TransferStatus>("idle");
  const [copmBalance, setCopmBalance] = useState<bigint | undefined>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [swapStatus, setSwapStatus] = useState<SwapStatus>("idle");
  const [swapProgress, setSwapProgress] = useState<SwapProgress>("idle");
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapFeeUsd, setSwapFeeUsd] = useState<number | null>(null);
  const [swapResult, setSwapResult] = useState<SwapResult | null>(null);
  const [shortfallQuote, setShortfallQuote] = useState<ShortfallQuote | null>(
    null
  );
  const copPerUsd = tokenPrices.COP_PER_USD ?? FALLBACK_COP_PER_USD;

  const totalUsd = useMemo(
    () => tokens.reduce((sum, token) => sum + token.balanceUsd, 0),
    [tokens]
  );
  const isLivePortfolio = portfolio.isConnected && portfolio.isCorrectNetwork;
  const isLoadingPortfolio = isLivePortfolio && portfolio.isBalanceLoading;
  const effectiveTotalUsd = portfolio.isConnected ? portfolio.totalUsd : totalUsd;
  const hasCompatibleTokens = tokens.some(
    (token) => tokenHasBalance(token)
  );

  const pendingTokens = tokens.filter(
    (token) =>
      tokenHasBalance(token) &&
      token.activation !== "active" &&
      getApprovalCap(token, tokenPrices)
  );
  const allActive = pendingTokens.length === 0;

  const refreshCopmBalance = async () => {
    if (!publicClient || !portfolio.address || !copmToken.address) {
      setCopmBalance(undefined);
      return;
    }
    const balance = (await publicClient.readContract({
      address: copmToken.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [portfolio.address],
    })) as bigint;
    setCopmBalance(balance);
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  useEffect(() => {
    setTokens((currentTokens) => sortTokensBySavedOrder(currentTokens));
  }, []);

  useEffect(() => {
    setRecentRecipients(getRecentRecipients());
  }, []);

  useEffect(() => {
    void refreshCopmBalance();
  }, [portfolio.address, publicClient, copmToken.address]);

  useEffect(() => {
    if (isLivePortfolio && !isLoadingPortfolio && hasCompatibleTokens && allActive) {
      setStep(2);
    }
  }, [allActive, hasCompatibleTokens, isLivePortfolio, isLoadingPortfolio]);

  useEffect(() => {
    fetch("/api/token-prices")
      .then((response) => (response.ok ? response.json() : undefined))
      .then((prices: TokenUsdPrices | undefined) => {
        if (prices) setTokenPrices(prices);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setTokens((currentTokens) => {
      const nextBySymbol = new Map(
        portfolio.tokens.map((token) => [token.symbol, token])
      );
      const orderedTokens: PortfolioToken[] = [];

      currentTokens.forEach((token) => {
        const nextToken = nextBySymbol.get(token.symbol);
        if (nextToken) {
          orderedTokens.push(nextToken);
        }
      });

      const missingTokens = portfolio.tokens.filter(
        (token) =>
          !orderedTokens.some(
            (orderedToken) => orderedToken.symbol === token.symbol
          )
      );
      const nextTokens = sortTokensBySavedOrder([...orderedTokens, ...missingTokens]);

      if (
        nextTokens.length === currentTokens.length &&
        nextTokens.every(
          (token, index) =>
            token.symbol === currentTokens[index].symbol &&
            token.balanceDisplay === currentTokens[index].balanceDisplay &&
            token.balanceUsd === currentTokens[index].balanceUsd &&
            token.activation === currentTokens[index].activation &&
            token.allowanceDisplay === currentTokens[index].allowanceDisplay &&
            token.requiresApproval === currentTokens[index].requiresApproval
        )
      ) {
        return currentTokens;
      }

      return nextTokens;
    });
  }, [portfolio.tokens]);

  useEffect(() => {
    const sourceToken = tokens.find(
      (token) =>
        tokenHasBalance(token) &&
        token.address &&
        token.requiresApproval &&
        !approvalTargets[token.symbol] &&
        getApprovalCap(token, tokenPrices)
    );

    if (
      !isLivePortfolio ||
      isLoadingPortfolio ||
      !portfolio.address ||
      !copmToken.address ||
      !sourceToken?.address
    ) {
      return;
    }

    const sourceCap = getApprovalCap(sourceToken, tokenPrices);
    if (!sourceCap) return;
    const fromAmount =
      sourceToken.balance && sourceCap > sourceToken.balance
        ? sourceToken.balance
        : sourceCap;
    const routeKey = [
      portfolio.address,
      sourceToken.address,
      fromAmount.toString(),
      copmToken.address,
      targetNetwork.squidChainId,
    ].join(":");

    if (approvalRouteKeyRef.current === routeKey) return;

    let cancelled = false;
    approvalRouteKeyRef.current = routeKey;
    setRouteError(null);

    getSquidRoute({
      fromAddress: portfolio.address,
      fromAmount: fromAmount.toString(),
      fromChain: targetNetwork.squidChainId,
      fromToken: sourceToken.address,
      toAddress: portfolio.address,
      toChain: targetNetwork.squidChainId,
      toToken: copmToken.address,
    })
      .then(({ approvalTarget: nextTarget }) => {
        if (cancelled) return;
        if (nextTarget) {
          setApprovalTargets((current) => ({
            ...current,
            [sourceToken.symbol]: nextTarget,
          }));
        }
        if (!nextTarget) setRouteError("Squid no devolvio approval target.");
      })
      .catch(() => {
        if (cancelled) return;
        approvalRouteKeyRef.current = null;
        setRouteError("No pudimos obtener una route de Squid.");
      });

    return () => {
      cancelled = true;
    };
  }, [
    copmToken.address,
    approvalTargets,
    isLivePortfolio,
    isLoadingPortfolio,
    portfolio.address,
    targetNetwork.squidChainId,
    tokenPrices,
    tokens,
  ]);

  const reorderToken = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= tokens.length ||
      toIndex >= tokens.length
    ) {
      return;
    }

    const updated = [...tokens];
    const [item] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, item);
    setTokens(updated);
    saveTokenOrder(updated);
  };

  const waitForTokenAllowance = async (
    token: PortfolioToken,
    spender: Address,
    minimum: bigint
  ) => {
    if (!publicClient || !portfolio.address || !token.address) return minimum;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const allowance = (await publicClient.readContract({
        address: token.address as Address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [portfolio.address, spender],
      })) as bigint;

      if (allowance >= minimum) return allowance;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    return (await publicClient.readContract({
      address: token.address as Address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [portfolio.address, spender],
    })) as bigint;
  };

  const activateNextToken = async () => {
    const nextToken = tokens.find(
      (token) =>
        tokenHasBalance(token) &&
        token.activation !== "active" &&
        getApprovalCap(token, tokenPrices)
    );
    if (!nextToken) {
      setStep(2);
      return;
    }

    const approvalCap = getApprovalCap(nextToken, tokenPrices);
    const approvalTarget = approvalTargets[nextToken.symbol];
    const ownerAddress = portfolio.address;
    setActivating(nextToken.symbol);

    try {
      if (!ownerAddress) return;

      if (
        nextToken.requiresApproval &&
        (!nextToken.address || !approvalTarget || !approvalCap)
      ) {
        return;
      }

      let confirmedAllowance = nextToken.allowance;

      if (nextToken.address && approvalTarget && approvalCap) {
        let allowance = await waitForTokenAllowance(nextToken, approvalTarget, 1n);

        if (allowance <= 0n) {
          const hash = await writeContractAsync({
            address: nextToken.address as Address,
            abi: erc20Abi,
            functionName: "approve",
            args: [approvalTarget, approvalCap],
          });
          await publicClient?.waitForTransactionReceipt({ hash });
          allowance = await waitForTokenAllowance(nextToken, approvalTarget, 1n);
        }

        if (allowance <= 0n) {
          throw new Error("No pudimos confirmar el permiso onchain.");
        }

        confirmedAllowance = allowance;
      }

      await portfolio.refetchAllowances();
      setTokens((currentTokens) =>
        currentTokens.map((token) =>
          token.symbol === nextToken.symbol
            ? { ...token, activation: "active", allowance: confirmedAllowance }
            : token
        )
      );
    } finally {
      setActivating(null);
    }
  };

  const updateCopAmount = (value: string) => {
    setCopAmount(cleanCopInput(value));
    setSwapStatus("idle");
    setSwapProgress("idle");
    setSwapError(null);
    setSwapFeeUsd(null);
    setShortfallQuote(null);
  };

  const updateRecipientAddress = (value: string) => {
    setRecipientAddress(value.trim());
    setSwapError(null);
  };

  const approvePurchaseToken = async () => {
    setSwapError(null);

    try {
      if (!portfolio.address) throw new Error("Wallet not ready");

      const usdAmount = getPurchaseUsdAmount(copAmount, copPerUsd);
      const approvalCandidate = getSwapApprovalCandidate(
        tokens,
        tokenPrices,
        usdAmount
      );
      const token = approvalCandidate?.token;
      const fromAmount = approvalCandidate?.fromAmount;
      const approvalTarget = token ? approvalTargets[token.symbol] : undefined;

      if (!token?.address || !fromAmount || !approvalTarget) {
        throw new Error("No pudimos preparar el permiso para este token.");
      }

      setActivating(token.symbol);

      const hash = await writeContractAsync({
        address: token.address as Address,
        abi: erc20Abi,
        functionName: "approve",
        args: [approvalTarget, fromAmount],
      });
      await publicClient?.waitForTransactionReceipt({ hash });

      const allowance = await waitForTokenAllowance(
        token,
        approvalTarget,
        fromAmount
      );

      if (allowance < fromAmount) {
        throw new Error("El permiso aprobado no alcanza para esta compra.");
      }

      await portfolio.refetchAllowances();
      setTokens((currentTokens) =>
        currentTokens.map((currentToken) =>
          currentToken.symbol === token.symbol
            ? { ...currentToken, activation: "active", allowance }
            : currentToken
        )
      );
    } catch (error) {
      setSwapError(getFriendlyErrorMessage(error));
    } finally {
      setActivating(null);
    }
  };

  const buyCopm = async () => {
    setSwapError(null);
    setSwapFeeUsd(null);
    setSwapResult(null);
    setSwapProgress("idle");

    try {
      if (!portfolio.address || !copmToken.address) {
        throw new Error("Wallet not ready");
      }

      const usdAmount = getPurchaseUsdAmount(copAmount, copPerUsd);
      if (usdAmount < MIN_PURCHASE_USD) {
        throw new Error("Minimum purchase amount");
      }
      if (parseCopAmount(copAmount) > MAX_COPM_AMOUNT) {
        throw new Error("El monto maximo es 10,000,000 COPm.");
      }

      const swapRecipient =
        recipientMode === "other" ? recipientAddress : portfolio.address;
      if (!isAddress(swapRecipient)) {
        throw new Error("Ingresa una wallet destino valida.");
      }

      const swapPlan = getApprovedSwapPlan(tokens, tokenPrices, usdAmount);
      const requestedCopm = parseCopmUnits(copAmount, copmToken.decimals);
      const intentId = createIntentId();

      if (getSwapPlanUsd(swapPlan) + 0.01 < usdAmount) {
        throw new Error("No approved source token");
      }

      await createSwapIntent({
        chainId: targetNetwork.chainId,
        intentId,
        recipientAddress: swapRecipient,
        requestedCopm: copAmount,
        userAddress: portfolio.address,
      });
      setSwapStatus("quoting");
      setSwapProgress("quoting");
      const initialCopmBalance = publicClient
        ? ((await publicClient.readContract({
            address: copmToken.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [portfolio.address],
          })) as bigint)
        : undefined;
      let lastHash: string | undefined;
      let quotedCopmTotal = 0n;
      let totalFeeUsd = 0;
      const squidRequestIds: string[] = [];
      const swapTxHashes: string[] = [];
      const swapReceipts: TransactionReceipt[] = [];
      const tokensSpent: Array<{
        amount: string;
        amountUsd: number;
        symbol: string;
      }> = [];
      let shortfallMessage: string | undefined;
      const quotedLegs: Array<{
        leg: SwapPlanLeg;
        legFromAmount: bigint;
        routeResult: SquidRouteResult;
        transactionRequest: {
          data: `0x${string}`;
          target: Address;
          value?: string;
        };
      }> = [];

      for (const leg of swapPlan) {
        let routeResult: SquidRouteResult | undefined;
        let quotedCopm: bigint | undefined;
        let legFromAmount = leg.fromAmount;

        for (let attempt = 0; attempt < 2; attempt += 1) {
          routeResult = await getSquidRoute({
            fromAddress: portfolio.address,
            fromAmount: legFromAmount.toString(),
            fromChain: targetNetwork.squidChainId,
            fromToken: leg.token.address!,
            slippage: 0.3,
            toAddress: swapRecipient,
            toChain: targetNetwork.squidChainId,
            toToken: copmToken.address,
          });
          quotedCopm = getRouteToAmount(routeResult);

          if (swapPlan.length > 1 || !quotedCopm || quotedCopm >= requestedCopm) {
            break;
          }

          const nextFromAmount =
            (legFromAmount * requestedCopm * 1005n) / (quotedCopm * 1000n) + 1n;

          if (
            (leg.token.balance && nextFromAmount > leg.token.balance) ||
            (leg.token.allowance && nextFromAmount > leg.token.allowance)
          ) {
            break;
          }

          legFromAmount = nextFromAmount;
        }

        if (!routeResult) throw new Error("Squid route unavailable");
        if (routeResult.requestId) squidRequestIds.push(routeResult.requestId);
        totalFeeUsd += getRouteFeeUsd(routeResult);
        setSwapFeeUsd(totalFeeUsd);

        quotedCopmTotal += quotedCopm ?? 0n;

        const transactionRequest = routeResult.route?.transactionRequest;
        if (
          !transactionRequest?.target ||
          !isAddress(transactionRequest.target) ||
          !transactionRequest.data
        ) {
          throw new Error("Invalid Squid transaction");
        }

        quotedLegs.push({
          leg,
          legFromAmount,
          routeResult,
          transactionRequest: {
            data: transactionRequest.data,
            target: transactionRequest.target,
            value: transactionRequest.value,
          },
        });
      }

      if (quotedCopmTotal < requestedCopm) {
        const quotedCopm = formatCopmUnits(quotedCopmTotal, copmToken.decimals);
        const quotedUsd = Number(formatUnits(quotedCopmTotal, copmToken.decimals)) / copPerUsd;

        shortfallMessage = `No pudimos completar el monto exacto. La mejor cotizacion disponible entrega ${quotedCopm} COPm.`;

        if (
          shortfallQuote?.copAmount !== copAmount ||
          shortfallQuote.quotedCopm !== quotedCopm
        ) {
          setShortfallQuote({
            copAmount,
            quotedCopm,
            quotedUsd,
            message: shortfallMessage,
          });
          setSwapStatus("idle");
          setSwapProgress("idle");
          return;
        }
      }

      setShortfallQuote(null);

      for (const [index, quotedLeg] of quotedLegs.entries()) {
        const { leg, legFromAmount, routeResult, transactionRequest } = quotedLeg;
        const isLastLeg = index === quotedLegs.length - 1;

        setSwapStatus("buying");
        setSwapProgress("confirming");
        const hash = await sendTransactionAsync({
          to: transactionRequest.target,
          data: transactionRequest.data,
          value: BigInt(transactionRequest.value ?? "0"),
        });
        lastHash = hash;
        swapTxHashes.push(hash);
        const tokenPrice = getTokenPrice(leg.token, tokenPrices) ?? 0;
        tokensSpent.push({
          amount: formatUnits(legFromAmount, leg.token.decimals ?? 18),
          amountUsd:
            Number(formatUnits(legFromAmount, leg.token.decimals ?? 18)) *
            tokenPrice,
          symbol: leg.token.symbol,
        });
        await updateSwapIntent(intentId, {
          squidRequestIds,
          status: "submitted",
          swapTxHashes,
          tokensSpent,
        });

        setSwapProgress("processing");
        const receipt = await publicClient?.waitForTransactionReceipt({ hash });
        if (receipt) swapReceipts.push(receipt);
        await waitForSquidStatus(routeResult, hash, targetNetwork.squidChainId);
        if (!isLastLeg) setSwapProgress("quoting");
      }
      let finalCopmBalance = publicClient
        ? ((await publicClient.readContract({
            address: copmToken.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [portfolio.address],
          })) as bigint)
        : undefined;

      if (
        publicClient &&
        initialCopmBalance !== undefined &&
        finalCopmBalance !== undefined &&
        finalCopmBalance <= initialCopmBalance &&
        quotedCopmTotal > 0n
      ) {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          await wait(2000);
          finalCopmBalance = (await publicClient.readContract({
            address: copmToken.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [portfolio.address],
          })) as bigint;
          if (finalCopmBalance > initialCopmBalance) break;
        }
      }

      const receiptCopm =
        copmToken.address && portfolio.address
          ? getCopmReceivedFromReceipts(
              swapReceipts,
              copmToken.address,
              portfolio.address
            )
          : 0n;
      const balanceDeltaCopm =
        initialCopmBalance !== undefined &&
        finalCopmBalance !== undefined &&
        finalCopmBalance > initialCopmBalance
          ? finalCopmBalance - initialCopmBalance
          : undefined;
      const receivedCopm =
        receiptCopm > 0n ? receiptCopm : balanceDeltaCopm ?? quotedCopmTotal;
      const displayedCopmBalance =
        initialCopmBalance !== undefined &&
        finalCopmBalance !== undefined &&
        finalCopmBalance <= initialCopmBalance &&
        quotedCopmTotal > 0n
          ? initialCopmBalance + quotedCopmTotal
          : finalCopmBalance;

      setSwapResult({
        copmBalance:
          swapRecipient.toLowerCase() !== portfolio.address.toLowerCase()
            ? "No disponible"
            : displayedCopmBalance !== undefined
            ? formatCopmUnits(displayedCopmBalance, copmToken.decimals)
            : "No disponible",
        receivedCopm:
          receivedCopm !== undefined
            ? formatCopmUnits(receivedCopm, copmToken.decimals)
            : formatCopmUnits(requestedCopm, copmToken.decimals),
        recipientAddress:
          swapRecipient.toLowerCase() !== portfolio.address.toLowerCase()
            ? swapRecipient
            : undefined,
        shortfallMessage,
        txHash: lastHash ?? "",
        txUrl: `${targetNetwork.blockExplorerUrl}/tx/${lastHash}`,
      });
      if (swapRecipient.toLowerCase() !== portfolio.address.toLowerCase()) {
        saveRecentRecipient(swapRecipient);
        setRecentRecipients(getRecentRecipients());
      }
      if (receivedCopm !== undefined) {
        void updateSwapIntent(intentId, {
          copmReceived: formatUnits(receivedCopm, copmToken.decimals),
          feeUsd: totalFeeUsd.toFixed(6),
          squidRequestIds,
          status: "confirmed",
          swapTxHashes,
          tokensSpent,
        }).then(() => logSwapOnchain(intentId));
      }
      setSwapStatus("complete");
      setSwapProgress("idle");
    } catch (error) {
      setSwapStatus("error");
      setSwapProgress("idle");
      setSwapError(getFriendlyErrorMessage(error));
    }
  };

  const sendCopmTransfer = async () => {
    setTransferError(null);

    try {
      if (!portfolio.address || !copmToken.address) throw new Error("Wallet not ready");
      if (!isAddress(recipientAddress)) throw new Error("Ingresa una wallet destino valida.");

      const amountNumber = parseCopAmount(transferAmount);
      if (amountNumber <= 0) throw new Error("Ingresa un monto mayor a 0.");
      if (amountNumber > MAX_COPM_AMOUNT) {
        throw new Error("El monto maximo es 10,000,000 COPm.");
      }

      const amount = parseCopmUnits(transferAmount, copmToken.decimals);
      if (copmBalance !== undefined && amount > copmBalance) {
        throw new Error("Saldo COPm insuficiente.");
      }

      if (!transferConfirming) {
        setTransferConfirming(true);
        return;
      }

      const transferId = createIntentId();
      setTransferStatus("confirming");
      await createCopmTransfer({
        chainId: targetNetwork.chainId,
        copmAmount: transferAmount,
        recipientAddress,
        senderAddress: portfolio.address,
        transferId,
      });

      const hash = await writeContractAsync({
        address: copmToken.address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [recipientAddress, amount],
      });
      setTransferStatus("sending");
      await updateCopmTransfer(transferId, { status: "submitted", txHash: hash });
      await publicClient?.waitForTransactionReceipt({ hash });
      await updateCopmTransfer(transferId, { status: "confirmed", txHash: hash });

      saveRecentRecipient(recipientAddress);
      setRecentRecipients(getRecentRecipients());
      setTransferConfirming(false);
      setTransferStatus("complete");
      setSwapResult({
        amountLabel: "Enviado",
        copmBalance: "Actualizando",
        receivedCopm: transferAmount,
        recipientAddress,
        title: "Transferencia completada",
        txHash: hash,
        txUrl: `${targetNetwork.blockExplorerUrl}/tx/${hash}`,
      });
      await refreshCopmBalance();
    } catch (error) {
      setTransferStatus("error");
      setTransferError(getFriendlyErrorMessage(error));
    }
  };

  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[#F7F8F5] text-[#17211B]">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col px-4 py-3 sm:max-w-lg sm:py-5 md:max-w-2xl">
        <div className="mb-3 grid grid-cols-3 gap-2">
          {steps.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(index)}
              className="h-2 rounded-full transition-colors"
              style={{ backgroundColor: index <= step ? stepColors[index] : "#DDE4DC" }}
              aria-label={`Ir a ${label}`}
            />
          ))}
        </div>

        {step === 0 && (
          <TokenOrderScreen
            tokens={tokens}
            canContinue={
              !isLivePortfolio || (!isLoadingPortfolio && hasCompatibleTokens)
            }
            hasCompatibleTokens={hasCompatibleTokens}
            isLive={isLivePortfolio}
            isLoading={isLoadingPortfolio}
            userAddress={portfolio.address}
            onReorder={reorderToken}
            onContinue={() => setStep(1)}
          />
        )}

        {step === 1 && (
          <TokenActivationScreen
            tokens={tokens}
            allActive={allActive}
            approvalTargets={approvalTargets}
            activating={activating}
            routeError={routeError}
            tokenPrices={tokenPrices}
            onActivate={activateNextToken}
            onSkip={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <>
            <ActionModeTabs mode={actionMode} onChange={setActionMode} />
            {actionMode === "buy" ? (
              <BuyCopmScreen
                copAmount={copAmount}
                copPerUsd={copPerUsd}
                hasCompatibleTokens={hasCompatibleTokens}
                isLive={isLivePortfolio}
                totalUsd={effectiveTotalUsd}
                detailsOpen={detailsOpen}
                swapError={swapError}
                swapProgress={swapProgress}
                swapStatus={swapStatus}
                swapFeeUsd={swapFeeUsd}
                shortfallQuote={shortfallQuote}
                tokenPrices={tokenPrices}
                tokens={tokens}
                activating={activating}
                approvalTargets={approvalTargets}
                recipientAddress={recipientAddress}
                recipientMode={recipientMode}
                recentRecipients={recentRecipients}
                onAmountChange={updateCopAmount}
                onApprovePurchase={approvePurchaseToken}
                onBuy={buyCopm}
                onDetailsToggle={() => setDetailsOpen((open) => !open)}
                onRecipientAddressChange={updateRecipientAddress}
                onRecipientModeChange={setRecipientMode}
              />
            ) : (
              <TransferCopmScreen
                amount={transferAmount}
                balance={copmBalance}
                confirming={transferConfirming}
                error={transferError}
                recipientAddress={recipientAddress}
                recentRecipients={recentRecipients}
                status={transferStatus}
                tokenDecimals={copmToken.decimals}
                onAmountChange={(value) => {
                  setTransferAmount(cleanCopInput(value));
                  setTransferConfirming(false);
                  setTransferError(null);
                }}
                onMax={() => {
                  if (copmBalance !== undefined) {
                    setTransferAmount(formatUnits(copmBalance, copmToken.decimals));
                    setTransferConfirming(false);
                  }
                }}
                onRecipientAddressChange={(value) => {
                  updateRecipientAddress(value);
                  setTransferConfirming(false);
                }}
                onSend={sendCopmTransfer}
              />
            )}
          </>
        )}
        <footer className="mt-auto py-5 text-center">
          <Link
            href="/analytics"
            className="text-xs font-semibold text-[#66736B] underline-offset-4 hover:text-[#0E7C4F] hover:underline"
          >
            Ver stats
          </Link>
        </footer>
        {swapResult && (
          <SwapSuccessModal
            result={swapResult}
            onClose={() => setSwapResult(null)}
          />
        )}
      </section>
    </main>
  );
}

function TokenOrderScreen({
  tokens,
  canContinue,
  hasCompatibleTokens,
  isLive,
  isLoading,
  userAddress,
  onReorder,
  onContinue,
}: {
  tokens: PortfolioToken[];
  canContinue: boolean;
  hasCompatibleTokens: boolean;
  isLive: boolean;
  isLoading: boolean;
  userAddress?: string;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onContinue: () => void;
}) {
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const draggingSymbolRef = useRef<string | null>(null);
  const [draggingSymbol, setDraggingSymbol] = useState<string | null>(null);
  const orderableTokenCount = isLive
    ? tokens.filter((token) => token.hasBalance).length
    : tokens.length;
  const isOrderableToken = (token: PortfolioToken) =>
    !isLive || Boolean(token.hasBalance);

  const getTargetIndex = (clientY: number) => {
    for (let index = 0; index < tokens.length; index += 1) {
      if (!isOrderableToken(tokens[index])) continue;
      const row = rowRefs.current[tokens[index].symbol];
      if (!row) continue;

      const rect = row.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return index;
      }
    }

    for (let index = tokens.length - 1; index >= 0; index -= 1) {
      if (isOrderableToken(tokens[index])) return index;
    }

    return -1;
  };

  const getNextOrderableIndex = (index: number, direction: -1 | 1) => {
    for (
      let nextIndex = index + direction;
      nextIndex >= 0 && nextIndex < tokens.length;
      nextIndex += direction
    ) {
      if (isOrderableToken(tokens[nextIndex])) return nextIndex;
    }

    return -1;
  };

  const startDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    symbol: string
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingSymbolRef.current = symbol;
    setDraggingSymbol(symbol);
  };

  const startTouchDrag = (
    event: ReactTouchEvent<HTMLButtonElement>,
    symbol: string
  ) => {
    event.preventDefault();
    draggingSymbolRef.current = symbol;
    setDraggingSymbol(symbol);
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggingSymbolRef.current = null;
    setDraggingSymbol(null);
  };

  const endTouchDrag = () => {
    draggingSymbolRef.current = null;
    setDraggingSymbol(null);
  };

  useEffect(() => {
    if (!draggingSymbol) return;

    const moveDragTo = (clientY: number) => {
      const symbol = draggingSymbolRef.current;
      if (!symbol) return;

      const fromIndex = tokens.findIndex((token) => token.symbol === symbol);
      const toIndex = getTargetIndex(clientY);
      if (toIndex === -1) return;
      onReorder(fromIndex, toIndex);
    };

    const movePointerDrag = (event: PointerEvent) => {
      moveDragTo(event.clientY);
    };

    const moveTouchDrag = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      event.preventDefault();
      moveDragTo(touch.clientY);
    };

    const cancelDrag = () => {
      draggingSymbolRef.current = null;
      setDraggingSymbol(null);
    };

    window.addEventListener("pointermove", movePointerDrag);
    window.addEventListener("pointerup", cancelDrag);
    window.addEventListener("pointercancel", cancelDrag);
    window.addEventListener("touchmove", moveTouchDrag, { passive: false });
    window.addEventListener("touchend", cancelDrag);
    window.addEventListener("touchcancel", cancelDrag);

    return () => {
      window.removeEventListener("pointermove", movePointerDrag);
      window.removeEventListener("pointerup", cancelDrag);
      window.removeEventListener("pointercancel", cancelDrag);
      window.removeEventListener("touchmove", moveTouchDrag);
      window.removeEventListener("touchend", cancelDrag);
      window.removeEventListener("touchcancel", cancelDrag);
    };
  }, [draggingSymbol, onReorder, tokens]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-3 rounded-[8px] border border-[#DDE4DC] bg-white p-4">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#E6F4EE] text-[#0E7C4F]">
          <ArrowLeftRight className="h-5 w-5" />
        </div>
        <h2 className="text-xl font-semibold leading-tight">
          Compra pesos digitales con lo que ya tienes en MiniPay.
        </h2>
        <p className="mt-2 text-sm leading-5 text-[#66736B]">
          Ordena como quieres pagar. Usaremos primero los tokens de arriba.
        </p>
        {isLive && (
          <p className="mt-2 text-xs font-medium text-[#0E7C4F]">
            Saldos leidos desde tu wallet.
          </p>
        )}
      </div>

      {isLoading ? (
        <TokenListSkeleton />
      ) : isLive && !hasCompatibleTokens ? (
        <TokenEmptyStateMessage userAddress={userAddress} />
      ) : (
        <div className="space-y-2.5 pb-16">
        {tokens.map((token, index) => {
            const hasBalance = tokenHasBalance(token);
            const isMuted = isLive && !hasBalance;
            const canReorder = !isMuted && orderableTokenCount > 1;
            const previousOrderableIndex = getNextOrderableIndex(index, -1);
            const nextOrderableIndex = getNextOrderableIndex(index, 1);

            return (
              <div
                key={token.symbol}
                ref={(element) => {
                  rowRefs.current[token.symbol] = element;
                }}
                className={`flex min-h-[62px] items-center gap-3 rounded-[8px] border bg-white p-3 transition ${
                  draggingSymbol === token.symbol
                    ? "scale-[0.99] border-[#0E7C4F] shadow-sm"
                    : "border-[#DDE4DC]"
                } ${isMuted ? "opacity-45" : ""}`}
              >
                <button
                  type="button"
                  aria-label={`Arrastrar ${token.symbol}`}
                  disabled={!canReorder}
                  className="touch-none rounded-full p-1 text-[#9AA69D] enabled:cursor-grab enabled:active:cursor-grabbing enabled:active:text-[#0E7C4F] disabled:cursor-not-allowed disabled:opacity-40"
                  onPointerDown={(event) => startDrag(event, token.symbol)}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onTouchStart={(event) => startTouchDrag(event, token.symbol)}
                  onTouchEnd={endTouchDrag}
                  onTouchCancel={endTouchDrag}
                >
                  <GripVertical className="h-5 w-5 shrink-0" />
                </button>
                <TokenMark token={token} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{token.symbol}</p>
                  <p className="truncate text-xs text-[#66736B]">
                    {token.label}
                  </p>
                  {isMuted ? (
                    <p className="text-[11px] text-[#9AA69D]">Sin saldo</p>
                  ) : null}
                </div>
                <p className="text-sm font-semibold">
                  {token.balanceDisplay ?? formatUsd(token.balanceUsd)}
                </p>
                <div className="flex flex-col gap-1">
                  <MoveButton
                    label={`Subir ${token.symbol}`}
                    disabled={!canReorder || previousOrderableIndex === -1}
                    onClick={() => onReorder(index, previousOrderableIndex)}
                    direction="up"
                  />
                  <MoveButton
                    label={`Bajar ${token.symbol}`}
                    disabled={!canReorder || nextOrderableIndex === -1}
                    onClick={() => onReorder(index, nextOrderableIndex)}
                    direction="down"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 mt-auto bg-[#F7F8F5]/95 px-4 py-3 backdrop-blur">
        <Button
          className="h-12 w-full rounded-[8px] bg-[#6D45B8] text-base font-semibold text-white hover:bg-[#56359A] disabled:bg-[#C8B9E8]"
          disabled={!canContinue}
          onClick={onContinue}
        >
          Continuar
        </Button>
      </div>
    </div>
  );
}

function TokenActivationScreen({
  tokens,
  allActive,
  approvalTargets,
  activating,
  routeError,
  tokenPrices,
  onActivate,
  onSkip,
}: {
  tokens: PortfolioToken[];
  allActive: boolean;
  approvalTargets: Partial<Record<string, Address>>;
  activating: string | null;
  routeError: string | null;
  tokenPrices: TokenUsdPrices;
  onActivate: () => void;
  onSkip: () => void;
}) {
  const nextToken = tokens.find(
    (token) =>
      tokenHasBalance(token) &&
      token.activation !== "active" &&
      getApprovalCap(token, tokenPrices)
  );
  const canApprove = !nextToken || Boolean(approvalTargets[nextToken.symbol]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-3 rounded-[8px] border border-[#DDE4DC] bg-white p-4">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#E6F4EE] text-[#0E7C4F]">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h2 className="text-xl font-semibold leading-tight">
          Prepara tus tokens
        </h2>
        <p className="mt-2 text-sm leading-5 text-[#66736B]">
          Autoriza una vez para comprar COPm con un toque despues.
        </p>
        <div className="mt-3 rounded-[8px] bg-[#FFF6D8] px-3 py-2 text-sm font-medium text-[#17211B]">
          {canApprove
            ? `Permiso por token: hasta ${formatUsd(
                purchasePreview.activationCapUsd
              )}`
            : (routeError ??
              "Buscando route de Squid para saber a que contrato aprobar.")}
        </div>
      </div>

      <div className="space-y-2.5 pb-16">
        {tokens.map((token) => {
          const hasBalance = tokenHasBalance(token);
          const isActive = token.activation === "active";
          const isActivating = activating === token.symbol;
          const canTokenApprove =
            hasBalance && Boolean(getApprovalCap(token, tokenPrices));
          const isMuted = !hasBalance;

          return (
            <div
              key={token.symbol}
              className={`flex min-h-[62px] items-center gap-3 rounded-[8px] border border-[#DDE4DC] bg-white p-3 ${
                isMuted ? "opacity-45" : ""
              }`}
            >
              <TokenMark token={token} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{token.symbol}</p>
                <p className="text-xs text-[#66736B]">
                  {token.balanceDisplay ?? formatUsd(token.balanceUsd)}
                </p>
              </div>
              <span
                className={`inline-flex h-8 min-w-[86px] items-center justify-center rounded-full px-3 text-xs font-semibold ${
                  isActive
                    ? "bg-[#E6F4EE] text-[#0E7C4F]"
                    : isActivating
                      ? "bg-[#FFF6D8] text-[#B7791F]"
                      : !canTokenApprove
                        ? "bg-[#F7F8F5] text-[#9AA69D]"
                      : "bg-[#F7F8F5] text-[#66736B]"
                }`}
              >
                {isMuted ? (
                  "Sin saldo"
                ) : isActive ? (
                  <>
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Activo
                  </>
                ) : isActivating ? (
                  "Activando"
                ) : !canTokenApprove ? (
                  "Luego"
                ) : (
                  "Activar"
                )}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-center text-xs text-[#66736B]">
        Esto no mueve tu saldo. Solo deja listo cada token.
      </p>

      <div className="sticky bottom-0 -mx-4 mt-auto space-y-2 bg-[#F7F8F5]/95 px-4 py-3 backdrop-blur">
        <Button
          className="h-12 w-full rounded-[8px] bg-[#6D45B8] text-base font-semibold text-white hover:bg-[#56359A] disabled:bg-[#C8B9E8]"
          onClick={allActive ? onSkip : onActivate}
          disabled={activating !== null || (!allActive && !canApprove)}
        >
          {allActive ? "Continuar" : "Preparar tokens"}
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="h-11 w-full text-sm font-semibold text-[#66736B]"
        >
          Saltar por ahora
        </button>
      </div>
    </div>
  );
}

function TokenListSkeleton() {
  return (
    <div className="space-y-2.5 pb-16">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="flex min-h-[62px] items-center gap-3 rounded-[8px] border border-dashed border-[#DDE4DC] bg-white/70 p-3"
          aria-hidden="true"
        >
          <div className="h-5 w-5 rounded-full bg-[#DDE4DC]" />
          <div className="h-10 w-10 shrink-0 rounded-full bg-[#E8EDE7]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-24 rounded-full bg-[#DDE4DC]" />
            <div className="h-2.5 w-36 rounded-full bg-[#E8EDE7]" />
          </div>
          <div className="h-4 w-14 rounded-full bg-[#DDE4DC]" />
        </div>
      ))}
    </div>
  );
}

function TokenEmptyStateMessage({ userAddress }: { userAddress?: string }) {
  const copyAddress = () => {
    if (!userAddress) return;
    void navigator.clipboard.writeText(userAddress);
  };
  const addressPreview = userAddress
    ? formatAddressPreview(userAddress)
    : undefined;

  return (
    <div className="pb-16">
      <div className="rounded-[8px] border border-[#DDE4DC] bg-white p-4">
        <p className="text-sm font-semibold text-[#17211B]">
          No encontramos tokens compatibles
        </p>
        <p className="mt-1 text-sm leading-5 text-[#66736B]">
          Puedes recibir USDC, USDT o ETH en Celo para comprar COPm.
        </p>
        {userAddress && (
          <div className="mt-4 border-t border-[#DDE4DC] pt-3">
            <p className="text-xs font-medium text-[#66736B]">
              Tu address para recibir tokens:
            </p>
            <div className="mt-2 flex items-center gap-2 rounded-[8px] bg-[#F7F8F5] p-2">
              <p className="min-w-0 flex-1 font-mono text-xs text-[#17211B]">
                {addressPreview}
              </p>
              <button
                type="button"
                aria-label="Copiar address"
                onClick={copyAddress}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-white text-[#0E7C4F] shadow-sm"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionModeTabs({
  mode,
  onChange,
}: {
  mode: ActionMode;
  onChange: (mode: ActionMode) => void;
}) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 rounded-[8px] bg-white p-1">
      {(["buy", "transfer"] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`h-10 rounded-[8px] text-sm font-semibold ${
            mode === item
              ? "bg-[#6D45B8] text-white"
              : "bg-[#F7F8F5] text-[#66736B]"
          }`}
        >
          {item === "buy" ? "Comprar" : "Transferir"}
        </button>
      ))}
    </div>
  );
}

function BuyCopmScreen({
  copAmount,
  copPerUsd,
  hasCompatibleTokens,
  isLive,
  totalUsd,
  detailsOpen,
  swapError,
  swapProgress,
  swapStatus,
  swapFeeUsd,
  shortfallQuote,
  tokenPrices,
  tokens,
  activating,
  approvalTargets,
  recipientAddress,
  recipientMode,
  recentRecipients,
  onAmountChange,
  onApprovePurchase,
  onBuy,
  onDetailsToggle,
  onRecipientAddressChange,
  onRecipientModeChange,
}: {
  copAmount: string;
  copPerUsd: number;
  hasCompatibleTokens: boolean;
  isLive: boolean;
  totalUsd: number;
  detailsOpen: boolean;
  swapError: string | null;
  swapProgress: SwapProgress;
  swapStatus: SwapStatus;
  swapFeeUsd: number | null;
  shortfallQuote: ShortfallQuote | null;
  tokenPrices: TokenUsdPrices;
  tokens: PortfolioToken[];
  activating: string | null;
  approvalTargets: Partial<Record<string, Address>>;
  recipientAddress: string;
  recipientMode: "self" | "other";
  recentRecipients: string[];
  onAmountChange: (value: string) => void;
  onApprovePurchase: () => void;
  onBuy: () => void;
  onDetailsToggle: () => void;
  onRecipientAddressChange: (value: string) => void;
  onRecipientModeChange: (mode: "self" | "other") => void;
}) {
  const hasNoFunds = isLive && !hasCompatibleTokens;
  const requestedUsd = getPurchaseUsdAmount(copAmount, copPerUsd);
  const isBelowMinimum = requestedUsd > 0 && requestedUsd < MIN_PURCHASE_USD;
  const missingUsd = Math.max(requestedUsd - totalUsd, 0);
  const hasInsufficientFunds =
    !hasNoFunds && missingUsd > USD_PLAN_TOLERANCE;
  const selectedToken = getSwapSourceToken(tokens, tokenPrices, requestedUsd);
  const approvedPlan = getApprovedSwapPlan(tokens, tokenPrices, requestedUsd);
  const approvedPlanUsd = getSwapPlanUsd(approvedPlan);
  const hasApprovedPlan =
    approvedPlanUsd + USD_PLAN_TOLERANCE >= requestedUsd;
  const detailPlan = approvedPlan.length
    ? approvedPlan
    : getApprovedSwapPlan(tokens, tokenPrices, Math.min(requestedUsd, totalUsd));
  const approvalToken =
    selectedToken ??
    getSwapApprovalCandidate(tokens, tokenPrices, requestedUsd)?.token;
  const needsApprovedToken =
    isLive &&
    !hasNoFunds &&
    !isBelowMinimum &&
    !hasInsufficientFunds &&
    !hasApprovedPlan;
  const isPreparingApproval =
    needsApprovedToken &&
    (approvalToken ? !approvalTargets[approvalToken.symbol] : false);
  const canApprovePurchase =
    Boolean(approvalToken && approvalTargets[approvalToken.symbol]) &&
    needsApprovedToken &&
    requestedUsd > 0;
  const canBuy =
    !hasNoFunds &&
    !isBelowMinimum &&
    !hasInsufficientFunds &&
    !needsApprovedToken &&
    (recipientMode === "self" || isAddress(recipientAddress)) &&
    requestedUsd > 0;
  const isBusy = swapStatus === "quoting" || swapStatus === "buying";
  const isApproving = Boolean(activating && approvalToken?.symbol === activating);
  const buttonLabel =
    isApproving
      ? "Confirma en tu wallet"
      : needsApprovedToken
        ? isPreparingApproval
          ? "Preparando permiso"
          : "Activar token"
        : swapProgress === "quoting"
          ? "Cotizando"
          : swapProgress === "confirming"
            ? "Confirma en tu wallet"
            : swapProgress === "processing"
              ? "Procesando compra"
              : swapStatus === "complete"
                ? "Completado"
                : shortfallQuote?.copAmount === copAmount
                  ? `Comprar ${shortfallQuote.quotedCopm} COPm`
                  : "Comprar COPm";
  const progressMessage =
    swapProgress === "confirming"
      ? "Confirma la transaccion en tu wallet para iniciar la compra."
      : swapProgress === "processing"
        ? "Tu transaccion fue enviada. Estamos esperando confirmacion y actualizando tu balance."
      : swapProgress === "quoting"
        ? "Estamos buscando la mejor ruta disponible."
        : null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="rounded-[8px] border border-[#DDE4DC] bg-white p-4">
        <p className="text-sm font-medium text-[#66736B]">Disponible</p>
        <p className="mt-1 text-2xl font-semibold leading-none">
          {formatUsd(totalUsd)}{" "}
          <span className="text-sm font-medium text-[#66736B]">aprox.</span>
        </p>
        <p className="mt-2 text-xs font-medium text-[#66736B]">
          Tipo de cambio: 1 USD = {formatCopPerUsd(copPerUsd)} COPm
        </p>
      </div>

      <div className="mt-3 rounded-[8px] border border-[#DDE4DC] bg-white p-4">
        <label
          htmlFor="cop-amount"
          className="block text-sm font-semibold text-[#17211B]"
        >
          Cuanto COP necesitas hoy?
        </label>
        <input
          id="cop-amount"
          inputMode="numeric"
          value={copAmount}
          onChange={(event) => onAmountChange(event.target.value)}
          className="mt-2 h-[52px] w-full rounded-[8px] border border-[#DDE4DC] bg-[#F7F8F5] px-4 text-2xl font-semibold outline-none ring-[#0E7C4F] focus:ring-2"
        />
        <p className="mt-2 text-xs font-medium text-[#66736B]">
          Equivale a {formatUsd(requestedUsd)} USD aprox.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onRecipientModeChange("self")}
            className={`h-10 rounded-[8px] text-sm font-semibold ${
              recipientMode === "self"
                ? "bg-[#E9DFFC] text-[#56359A]"
                : "bg-[#F7F8F5] text-[#66736B]"
            }`}
          >
            Mi wallet
          </button>
          <button
            type="button"
            onClick={() => onRecipientModeChange("other")}
            className={`h-10 rounded-[8px] text-sm font-semibold ${
              recipientMode === "other"
                ? "bg-[#E9DFFC] text-[#56359A]"
                : "bg-[#F7F8F5] text-[#66736B]"
            }`}
          >
            Otra wallet
          </button>
        </div>
        {recipientMode === "other" && (
          <RecipientAddressInput
            address={recipientAddress}
            recentRecipients={recentRecipients}
            warning="Verifica esta wallet. Si compras COPm para una wallet equivocada, no podremos revertirlo."
            onChange={onRecipientAddressChange}
          />
        )}
        {(hasNoFunds || hasInsufficientFunds) && (
          <div className="mt-3 rounded-[8px] bg-[#FFF6D8] px-3 py-2 text-sm font-medium leading-5 text-[#17211B]">
            {hasNoFunds
              ? "No encontramos tokens compatibles para comprar COPm."
              : `Te faltan ${formatUsd(missingUsd)} aprox. para comprar esta cantidad de COPm.`}
          </div>
        )}
        {isBelowMinimum && (
          <div className="mt-3 rounded-[8px] bg-[#FFF6D8] px-3 py-2 text-sm font-medium leading-5 text-[#17211B]">
            La compra minima es de {formatUsd(MIN_PURCHASE_USD)} USD aprox.
          </div>
        )}
        {needsApprovedToken && (
          <div className="mt-3 rounded-[8px] bg-[#FFF6D8] px-3 py-2 text-sm font-medium leading-5 text-[#17211B]">
            Activa permiso suficiente para comprar este monto de COPm.
          </div>
        )}
        {approvedPlan.length > 1 && canBuy && (
          <div className="mt-3 rounded-[8px] bg-[#FFF6D8] px-3 py-2 text-sm font-medium leading-5 text-[#17211B]">
            Esta compra usará {getSwapPlanTokenSymbols(approvedPlan)} y requiere{" "}
            {approvedPlan.length} confirmaciones.
          </div>
        )}
        {swapError && (
          <div className="mt-3 rounded-[8px] bg-[#FDECEC] px-3 py-2 text-sm font-medium leading-5 text-[#8A1F1F]">
            {swapError}
          </div>
        )}
        {shortfallQuote?.copAmount === copAmount && (
          <div className="mt-3 rounded-[8px] bg-[#FFF6D8] px-3 py-2 text-sm font-medium leading-5 text-[#17211B]">
            {shortfallQuote.message} Ajusta el monto a{" "}
            {formatUsd(shortfallQuote.quotedUsd)} USD aprox. o continua con esta
            cotizacion.
          </div>
        )}

        <div
          className={`mt-3 rounded-[8px] p-4 ${
            canBuy ? "bg-[#E6F4EE]" : "bg-[#F2F5F1]"
          }`}
        >
          <p className="text-sm font-medium text-[#66736B]">Recibiras</p>
          <p
            className={`mt-1 text-[28px] font-semibold leading-tight ${
              canBuy ? "text-[#0E7C4F]" : "text-[#66736B]"
            }`}
          >
            {copAmount || "0"} COPm
          </p>
        </div>

        <Button
          className="mt-4 h-12 w-full rounded-[8px] bg-[#6D45B8] text-base font-semibold text-white hover:bg-[#56359A] disabled:bg-[#C8B9E8]"
          disabled={isBusy || isApproving || (!canBuy && !canApprovePurchase)}
          onClick={needsApprovedToken ? onApprovePurchase : onBuy}
        >
          {buttonLabel}
        </Button>
        {progressMessage && (
          <p className="mt-3 text-center text-sm font-medium text-[#66736B]">
            {progressMessage}
          </p>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-[8px] border border-[#DDE4DC] bg-white">
        <button
          type="button"
          className="flex h-14 w-full items-center justify-between px-4 text-sm font-semibold"
          onClick={onDetailsToggle}
        >
          Detalles de la compra
          {detailsOpen ? (
            <ChevronUp className="h-5 w-5 text-[#66736B]" />
          ) : (
            <ChevronDown className="h-5 w-5 text-[#66736B]" />
          )}
        </button>

        {detailsOpen && (
          <div className="border-t border-[#DDE4DC] px-4 py-4">
            <p className="mb-3 text-xs font-semibold uppercase text-[#66736B]">
              Usaremos
            </p>
            <div className="space-y-2">
              {(detailPlan.length ? detailPlan : approvedPlan).map((leg) => (
                <div
                  key={leg.token.symbol}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: leg.token.color }}
                    />
                    {leg.token.symbol}
                  </span>
                  <span className="font-medium">
                    {formatUsd(leg.usdAmount)}
                  </span>
                </div>
              ))}
              {!detailPlan.length && !approvedPlan.length && (
                <p className="text-sm font-medium text-[#66736B]">
                  Activa un token para ver el detalle.
                </p>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-[8px] bg-[#F7F8F5] p-3">
                <p className="text-xs text-[#66736B]">
                  Fee Squid {(SQUID_INTEGRATOR_FEE_BPS / 100).toFixed(2)}%
                </p>
                <p className="mt-1 font-semibold">
                  {swapFeeUsd === null ? "Por cotizar" : formatUsd(swapFeeUsd)}
                </p>
                <p className="mt-1 text-[11px] font-medium text-[#66736B]">
                  Split {SQUID_INTEGRATOR_FEE_SPLIT}
                </p>
              </div>
              <div className="rounded-[8px] bg-[#F7F8F5] p-3">
                <p className="text-xs text-[#66736B]">Slippage max</p>
                <p className="mt-1 font-semibold">
                  {purchasePreview.slippageLabel}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TokenMark({ token }: { token: PortfolioToken }) {
  return (
    <div
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
      style={{ backgroundColor: token.color }}
    >
      {token.symbol.slice(0, 2)}
    </div>
  );
}

function RecipientAddressInput({
  address,
  recentRecipients,
  warning,
  onChange,
}: {
  address: string;
  recentRecipients: string[];
  warning: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      <input
        inputMode="text"
        placeholder="0x..."
        value={address}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-[8px] border border-[#DDE4DC] bg-[#F7F8F5] px-3 font-mono text-sm outline-none ring-[#6D45B8] focus:ring-2"
      />
      {recentRecipients.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {recentRecipients.map((recipient) => (
            <button
              key={recipient}
              type="button"
              onClick={() => onChange(recipient)}
              className="rounded-full bg-[#F7F8F5] px-3 py-1 text-xs font-semibold text-[#66736B]"
            >
              {formatAddressPreview(recipient)}
            </button>
          ))}
        </div>
      )}
      <p className="rounded-[8px] bg-[#FFF6D8] px-3 py-2 text-xs font-semibold leading-5 text-[#17211B]">
        {warning}
      </p>
    </div>
  );
}

function TransferCopmScreen({
  amount,
  balance,
  confirming,
  error,
  recipientAddress,
  recentRecipients,
  status,
  tokenDecimals,
  onAmountChange,
  onMax,
  onRecipientAddressChange,
  onSend,
}: {
  amount: string;
  balance?: bigint;
  confirming: boolean;
  error: string | null;
  recipientAddress: string;
  recentRecipients: string[];
  status: TransferStatus;
  tokenDecimals: number;
  onAmountChange: (value: string) => void;
  onMax: () => void;
  onRecipientAddressChange: (value: string) => void;
  onSend: () => void;
}) {
  const balanceDisplay =
    balance === undefined ? "0" : formatCopmUnits(balance, tokenDecimals);
  const isBusy = status === "confirming" || status === "sending";
  const buttonLabel =
    status === "confirming"
      ? "Confirma en tu wallet"
      : status === "sending"
        ? "Enviando"
        : confirming
          ? "Enviar COPm"
          : "Continuar";

  return (
    <div className="flex flex-1 flex-col">
      <div className="rounded-[8px] border border-[#DDE4DC] bg-white p-4">
        <p className="text-sm font-medium text-[#66736B]">Disponible</p>
        <p className="mt-1 text-2xl font-semibold leading-none">
          {balanceDisplay} COPm
        </p>
      </div>

      <div className="mt-3 rounded-[8px] border border-[#DDE4DC] bg-white p-4">
        <label className="block text-sm font-semibold text-[#17211B]">
          Wallet destino
        </label>
        <RecipientAddressInput
          address={recipientAddress}
          recentRecipients={recentRecipients}
          warning="Verifica esta wallet. Las transferencias de COPm no se pueden revertir."
          onChange={onRecipientAddressChange}
        />

        <label className="mt-4 block text-sm font-semibold text-[#17211B]">
          Monto COPm
        </label>
        <div className="mt-2 flex gap-2">
          <input
            inputMode="numeric"
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            className="h-[52px] min-w-0 flex-1 rounded-[8px] border border-[#DDE4DC] bg-[#F7F8F5] px-4 text-2xl font-semibold outline-none ring-[#6D45B8] focus:ring-2"
          />
          <button
            type="button"
            onClick={onMax}
            className="h-[52px] rounded-[8px] bg-[#E9DFFC] px-4 text-sm font-semibold text-[#56359A]"
          >
            Max
          </button>
        </div>

        {confirming && (
          <div className="mt-3 rounded-[8px] bg-[#FFF6D8] px-3 py-2 text-sm font-medium leading-5 text-[#17211B]">
            Enviaras {amount || "0"} COPm a{" "}
            {formatAddressPreview(recipientAddress)}. Verifica la wallet antes
            de confirmar.
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-[8px] bg-[#FDECEC] px-3 py-2 text-sm font-medium leading-5 text-[#8A1F1F]">
            {error}
          </div>
        )}

        <Button
          className="mt-4 h-12 w-full rounded-[8px] bg-[#6D45B8] text-base font-semibold text-white hover:bg-[#56359A] disabled:bg-[#C8B9E8]"
          disabled={isBusy}
          onClick={onSend}
        >
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

function SwapSuccessModal({
  result,
  onClose,
}: {
  result: SwapResult;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/35 px-4 pb-4 sm:items-center sm:justify-center sm:pb-0">
      <div className="w-full max-w-md rounded-[8px] bg-white p-4 shadow-xl">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#E6F4EE] text-[#0E7C4F]">
          <Check className="h-5 w-5" />
        </div>
        <h2 className="text-xl font-semibold">
          {result.title ?? "Compra completada"}
        </h2>
        <p className="mt-2 text-sm text-[#66736B]">
          {result.amountLabel ?? "Recibiste"}
        </p>
        <p className="mt-1 text-3xl font-semibold text-[#0E7C4F]">
          {result.receivedCopm} COPm
        </p>
        {result.shortfallMessage && (
          <div className="mt-3 rounded-[8px] bg-[#FFF6D8] px-3 py-2 text-sm font-medium leading-5 text-[#17211B]">
            {result.shortfallMessage}
          </div>
        )}
        {result.recipientAddress && (
          <p className="mt-2 text-sm font-semibold text-[#66736B]">
            Destino {formatAddressPreview(result.recipientAddress)}
          </p>
        )}

        <div className="mt-4 space-y-3 rounded-[8px] bg-[#F7F8F5] p-3 text-sm">
          <div>
            <p className="text-xs text-[#66736B]">Balance final</p>
            <p className="font-semibold">{result.copmBalance} COPm</p>
          </div>
          <div>
            <p className="text-xs text-[#66736B]">Transaccion</p>
            <a
              href={result.txUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all font-semibold text-[#0E7C4F]"
            >
              {formatAddressPreview(result.txHash)}
            </a>
          </div>
        </div>

        <Button
          className="mt-4 h-12 w-full rounded-[8px] bg-[#6D45B8] text-base font-semibold text-white hover:bg-[#56359A] disabled:bg-[#C8B9E8]"
          onClick={onClose}
        >
          Listo
        </Button>
      </div>
    </div>
  );
}

function MoveButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: "up" | "down";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-6 w-6 place-items-center rounded-full bg-[#F7F8F5] text-[#66736B] disabled:opacity-30"
    >
      <ChevronRight
        className={`h-4 w-4 ${direction === "up" ? "-rotate-90" : "rotate-90"}`}
      />
    </button>
  );
}
