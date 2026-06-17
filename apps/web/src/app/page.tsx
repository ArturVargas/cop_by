"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  erc20Abi,
  formatUnits,
  isAddress,
  parseUnits,
  type Address,
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
  getSquidRoute,
  getSquidStatus,
  type SquidRouteResult,
} from "@/lib/squid-config";

const steps = ["Ordenar", "Activar", "Comprar"];
const FALLBACK_COP_PER_USD = 3400;
const TOKEN_ORDER_STORAGE_KEY = "cop_by_token_order";

type SwapStatus = "idle" | "quoting" | "buying" | "complete" | "error";

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

function getApprovalCap(token: PortfolioToken, prices: TokenUsdPrices) {
  if (!token.decimals) return;
  const price = getTokenPrice(token, prices);
  if (!price) return;
  const tokenAmount = purchasePreview.activationCapUsd / price;
  return parseUnits(
    String(floorToDecimals(tokenAmount, token.decimals)),
    token.decimals
  );
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
  return parseUnits(
    String(floorToDecimals(parseCopAmount(value), decimals)),
    decimals
  );
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
  const costs = routeResult.route?.estimate?.feeCosts ?? [];
  const total = costs.reduce((sum, cost) => sum + Number(cost.amountUsd ?? 0), 0);
  return Number.isFinite(total) ? total : 0;
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

function getTokenAmountForUsd(
  token: PortfolioToken,
  prices: TokenUsdPrices,
  usdAmount: number
) {
  if (!token.decimals) return;
  const price = getTokenPrice(token, prices);
  if (!price) return;

  return parseUnits(
    String(floorToDecimals(usdAmount / price, token.decimals)),
    token.decimals
  );
}

function getSwapSourceToken(
  tokens: PortfolioToken[],
  prices: TokenUsdPrices,
  usdAmount: number
) {
  return tokens.find((token) => {
    const fromAmount = getTokenAmountForUsd(token, prices, usdAmount);
    const isApproved = !token.isLive || token.activation === "active";

    return (
      isApproved &&
      Boolean(token.address) &&
      Boolean(fromAmount) &&
      token.balanceUsd >= usdAmount &&
      (!token.balance || !fromAmount || token.balance >= fromAmount)
    );
  });
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
    "needs_gas",
    "not_found",
  ]);

  for (let attempt = 0; attempt < 3; attempt += 1) {
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
        return;
      }
    } catch {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

export default function Home() {
  const targetNetwork = getTargetNetwork();
  const copmToken = targetNetwork.tokens.copm;
  const approvalRouteKeyRef = useRef<string | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<Address>();
  const [routeError, setRouteError] = useState<string | null>(null);
  const [tokenPrices, setTokenPrices] = useState<TokenUsdPrices>({});
  const portfolio = useTokenPortfolio(approvalTarget, tokenPrices);
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const [step, setStep] = useState(0);
  const [tokens, setTokens] = useState(mockPortfolioTokens);
  const [copAmount, setCopAmount] = useState(purchasePreview.copAmount);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [swapStatus, setSwapStatus] = useState<SwapStatus>("idle");
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapFeeUsd, setSwapFeeUsd] = useState<number | null>(null);
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

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  useEffect(() => {
    setTokens((currentTokens) => sortTokensBySavedOrder(currentTokens));
  }, []);

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
        token.activation !== "active" &&
        token.address &&
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

    if (approvalTarget || approvalRouteKeyRef.current === routeKey) return;

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
        setApprovalTarget(nextTarget);
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
    approvalTarget,
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
    setActivating(nextToken.symbol);

    try {
      if (
        nextToken.requiresApproval &&
        (!nextToken.address || !approvalTarget || !approvalCap)
      ) {
        return;
      }

      if (nextToken.address && approvalTarget && approvalCap) {
        const hash = await writeContractAsync({
          address: nextToken.address as Address,
          abi: erc20Abi,
          functionName: "approve",
          args: [approvalTarget, approvalCap],
        });
        await publicClient?.waitForTransactionReceipt({ hash });
      }

      setTokens((currentTokens) =>
        currentTokens.map((token) =>
          token.symbol === nextToken.symbol
            ? { ...token, activation: "active" }
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
    setSwapError(null);
    setSwapFeeUsd(null);
  };

  const buyCopm = async () => {
    setSwapError(null);
    setSwapFeeUsd(null);

    try {
      if (!portfolio.address || !copmToken.address) {
        throw new Error("Wallet not ready");
      }

      const usdAmount = getPurchaseUsdAmount(copAmount, copPerUsd);
      const sourceToken = getSwapSourceToken(tokens, tokenPrices, usdAmount);
      const fromAmount = sourceToken
        ? getTokenAmountForUsd(sourceToken, tokenPrices, usdAmount)
        : undefined;
      const requestedCopm = parseCopmUnits(copAmount, copmToken.decimals);

      if (!sourceToken?.address || !fromAmount) {
        throw new Error("No approved source token");
      }

      setSwapStatus("quoting");
      let quotedFromAmount = fromAmount;
      let routeResult: SquidRouteResult | undefined;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        routeResult = await getSquidRoute({
          fromAddress: portfolio.address,
          fromAmount: quotedFromAmount.toString(),
          fromChain: targetNetwork.squidChainId,
          fromToken: sourceToken.address,
          slippage: 0.3,
          toAddress: portfolio.address,
          toChain: targetNetwork.squidChainId,
          toToken: copmToken.address,
        });
        setSwapFeeUsd(getRouteFeeUsd(routeResult));

        const quotedCopm = getRouteToAmount(routeResult);
        if (!quotedCopm || quotedCopm >= requestedCopm) break;

        const nextFromAmount =
          (quotedFromAmount * requestedCopm * 1005n) / (quotedCopm * 1000n) +
          1n;

        if (sourceToken.balance && nextFromAmount > sourceToken.balance) {
          throw new Error("Saldo insuficiente para recibir el COPm solicitado.");
        }

        quotedFromAmount = nextFromAmount;
      }

      const quotedCopm = routeResult ? getRouteToAmount(routeResult) : undefined;
      if (quotedCopm && quotedCopm < requestedCopm) {
        throw new Error(
          `La cotizacion actual solo entrega ${formatCopmUnits(
            quotedCopm,
            copmToken.decimals
          )} COPm. Intenta con un monto menor.`
        );
      }

      if (!routeResult) throw new Error("Squid route unavailable");
      const transactionRequest = routeResult.route?.transactionRequest;

      if (
        !transactionRequest?.target ||
        !isAddress(transactionRequest.target) ||
        !transactionRequest.data
      ) {
        throw new Error("Invalid Squid transaction");
      }

      setSwapStatus("buying");
      const hash = await sendTransactionAsync({
        to: transactionRequest.target,
        data: transactionRequest.data,
        value: BigInt(transactionRequest.value ?? "0"),
      });

      await publicClient?.waitForTransactionReceipt({ hash });
      await waitForSquidStatus(routeResult, hash, targetNetwork.squidChainId);
      setSwapStatus("complete");
    } catch (error) {
      setSwapStatus("error");
      setSwapError(
        error instanceof Error
          ? error.message
          : "No pudimos completar la compra. Revisa permisos, saldo y red."
      );
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
              className={`h-2 rounded-full transition-colors ${
                index <= step ? "bg-[#0E7C4F]" : "bg-[#DDE4DC]"
              }`}
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
            approvalTarget={approvalTarget}
            activating={activating}
            routeError={routeError}
            tokenPrices={tokenPrices}
            onActivate={activateNextToken}
            onSkip={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <BuyCopmScreen
            copAmount={copAmount}
            copPerUsd={copPerUsd}
            hasCompatibleTokens={hasCompatibleTokens}
            isLive={isLivePortfolio}
            totalUsd={effectiveTotalUsd}
            detailsOpen={detailsOpen}
            swapError={swapError}
            swapStatus={swapStatus}
            swapFeeUsd={swapFeeUsd}
            tokenPrices={tokenPrices}
            tokens={tokens}
            onAmountChange={updateCopAmount}
            onBuy={buyCopm}
            onDetailsToggle={() => setDetailsOpen((open) => !open)}
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

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggingSymbolRef.current = null;
    setDraggingSymbol(null);
  };

  useEffect(() => {
    if (!draggingSymbol) return;

    const moveDrag = (event: PointerEvent) => {
      const symbol = draggingSymbolRef.current;
      if (!symbol) return;

      const fromIndex = tokens.findIndex((token) => token.symbol === symbol);
      const toIndex = getTargetIndex(event.clientY);
      if (toIndex === -1) return;
      onReorder(fromIndex, toIndex);
    };

    const cancelDrag = () => {
      draggingSymbolRef.current = null;
      setDraggingSymbol(null);
    };

    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", cancelDrag);
    window.addEventListener("pointercancel", cancelDrag);

    return () => {
      window.removeEventListener("pointermove", moveDrag);
      window.removeEventListener("pointerup", cancelDrag);
      window.removeEventListener("pointercancel", cancelDrag);
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
          className="h-12 w-full rounded-[8px] bg-[#0E7C4F] text-base font-semibold text-white hover:bg-[#075C3A]"
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
  approvalTarget,
  activating,
  routeError,
  tokenPrices,
  onActivate,
  onSkip,
}: {
  tokens: PortfolioToken[];
  allActive: boolean;
  approvalTarget?: Address;
  activating: string | null;
  routeError: string | null;
  tokenPrices: TokenUsdPrices;
  onActivate: () => void;
  onSkip: () => void;
}) {
  const canApprove = Boolean(approvalTarget);

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
          className="h-12 w-full rounded-[8px] bg-[#0E7C4F] text-base font-semibold text-white hover:bg-[#075C3A]"
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

function BuyCopmScreen({
  copAmount,
  copPerUsd,
  hasCompatibleTokens,
  isLive,
  totalUsd,
  detailsOpen,
  swapError,
  swapStatus,
  swapFeeUsd,
  tokenPrices,
  tokens,
  onAmountChange,
  onBuy,
  onDetailsToggle,
}: {
  copAmount: string;
  copPerUsd: number;
  hasCompatibleTokens: boolean;
  isLive: boolean;
  totalUsd: number;
  detailsOpen: boolean;
  swapError: string | null;
  swapStatus: SwapStatus;
  swapFeeUsd: number | null;
  tokenPrices: TokenUsdPrices;
  tokens: PortfolioToken[];
  onAmountChange: (value: string) => void;
  onBuy: () => void;
  onDetailsToggle: () => void;
}) {
  const hasNoFunds = isLive && !hasCompatibleTokens;
  const requestedUsd = getPurchaseUsdAmount(copAmount, copPerUsd);
  const hasInsufficientFunds =
    !hasNoFunds && totalUsd < requestedUsd;
  const selectedToken = getSwapSourceToken(tokens, tokenPrices, requestedUsd);
  const needsApprovedToken =
    isLive && !hasNoFunds && !hasInsufficientFunds && !selectedToken;
  const canBuy =
    !hasNoFunds &&
    !hasInsufficientFunds &&
    !needsApprovedToken &&
    requestedUsd > 0;
  const isBusy = swapStatus === "quoting" || swapStatus === "buying";
  const buttonLabel =
    swapStatus === "quoting"
      ? "Cotizando"
      : swapStatus === "buying"
        ? "Comprando"
        : swapStatus === "complete"
          ? "Completado"
          : "Comprar COPm";

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
        {(hasNoFunds || hasInsufficientFunds) && (
          <div className="mt-3 rounded-[8px] bg-[#FFF6D8] px-3 py-2 text-sm font-medium leading-5 text-[#17211B]">
            {hasNoFunds
              ? "No encontramos tokens compatibles para comprar COPm."
              : "Saldo insuficiente para comprar esta cantidad de COPm."}
          </div>
        )}
        {needsApprovedToken && (
          <div className="mt-3 rounded-[8px] bg-[#FFF6D8] px-3 py-2 text-sm font-medium leading-5 text-[#17211B]">
            Activa un token con saldo suficiente antes de comprar COPm.
          </div>
        )}
        {swapError && (
          <div className="mt-3 rounded-[8px] bg-[#FDECEC] px-3 py-2 text-sm font-medium leading-5 text-[#8A1F1F]">
            {swapError} Intenta de nuevo.
          </div>
        )}

        <div className="mt-3 rounded-[8px] bg-[#E6F4EE] p-4">
          <p className="text-sm font-medium text-[#66736B]">Recibiras</p>
          <p className="mt-1 text-[28px] font-semibold leading-tight text-[#0E7C4F]">
            {copAmount || "0"} COPm
          </p>
        </div>

        <Button
          className="mt-4 h-12 w-full rounded-[8px] bg-[#0E7C4F] text-base font-semibold text-white hover:bg-[#075C3A]"
          disabled={!canBuy || isBusy}
          onClick={onBuy}
        >
          {buttonLabel}
        </Button>
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
              {(selectedToken ? [selectedToken] : tokens.slice(0, 3)).map((token) => (
                <div
                  key={token.symbol}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: token.color }}
                    />
                    {token.symbol}
                  </span>
                  <span className="font-medium">
                    {formatUsd(token.balanceUsd)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-[8px] bg-[#F7F8F5] p-3">
                <p className="text-xs text-[#66736B]">Fee</p>
                <p className="mt-1 font-semibold">
                  {swapFeeUsd === null ? "Por cotizar" : formatUsd(swapFeeUsd)}
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
