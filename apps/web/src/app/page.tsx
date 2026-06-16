"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { erc20Abi, parseUnits, type Address } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
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
import { useTokenPortfolio } from "@/hooks/use-token-portfolio";
import {
  formatUsd,
  mockPortfolioTokens,
  PortfolioToken,
  purchasePreview,
} from "@/lib/mock-portfolio";

const steps = ["Ordenar", "Activar", "Comprar"];

function formatAddressPreview(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 7)}...${address.slice(-4)}`;
}

function getApprovalCap(token: PortfolioToken) {
  if (!token.decimals || !["USDC", "USDT"].includes(token.symbol)) return;
  return parseUnits(String(purchasePreview.activationCapUsd), token.decimals);
}

export default function Home() {
  const portfolio = useTokenPortfolio();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [step, setStep] = useState(0);
  const [tokens, setTokens] = useState(mockPortfolioTokens);
  const [copAmount, setCopAmount] = useState(purchasePreview.copAmount);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  const totalUsd = useMemo(
    () => tokens.reduce((sum, token) => sum + token.balanceUsd, 0),
    [tokens]
  );
  const isLivePortfolio = portfolio.isConnected && portfolio.isCorrectNetwork;
  const isLoadingPortfolio = isLivePortfolio && portfolio.isLoading;
  const effectiveTotalUsd = portfolio.isConnected ? portfolio.totalUsd : totalUsd;
  const hasCompatibleTokens = tokens.some(
    (token) => token.hasBalance ?? token.balanceUsd > 0
  );

  const pendingTokens = tokens.filter(
    (token) => token.activation !== "active" && getApprovalCap(token)
  );
  const allActive = pendingTokens.length === 0;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

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
      const nextTokens = [...orderedTokens, ...missingTokens];

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

  const moveToken = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= tokens.length) return;

    reorderToken(index, nextIndex);
  };

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
  };

  const activateNextToken = async () => {
    const nextToken = tokens.find(
      (token) => token.activation !== "active" && getApprovalCap(token)
    );
    if (!nextToken) {
      setStep(2);
      return;
    }

    const approvalCap = getApprovalCap(nextToken);
    const approvalTarget = portfolio.approvalTarget;
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
            onMove={moveToken}
            onReorder={reorderToken}
            onContinue={() => setStep(1)}
          />
        )}

        {step === 1 && (
          <TokenActivationScreen
            tokens={tokens}
            allActive={allActive}
            approvalTarget={portfolio.approvalTarget}
            activating={activating}
            onActivate={activateNextToken}
            onSkip={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <BuyCopmScreen
            copAmount={copAmount}
            hasCompatibleTokens={hasCompatibleTokens}
            isLive={isLivePortfolio}
            totalUsd={effectiveTotalUsd}
            detailsOpen={detailsOpen}
            tokens={tokens}
            onAmountChange={setCopAmount}
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
  onMove,
  onReorder,
  onContinue,
}: {
  tokens: PortfolioToken[];
  canContinue: boolean;
  hasCompatibleTokens: boolean;
  isLive: boolean;
  isLoading: boolean;
  userAddress?: string;
  onMove: (index: number, direction: -1 | 1) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onContinue: () => void;
}) {
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const draggingSymbolRef = useRef<string | null>(null);
  const [draggingSymbol, setDraggingSymbol] = useState<string | null>(null);

  const getTargetIndex = (clientY: number) => {
    for (let index = 0; index < tokens.length; index += 1) {
      const row = rowRefs.current[tokens[index].symbol];
      if (!row) continue;

      const rect = row.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return index;
      }
    }

    return tokens.length - 1;
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
          {tokens.map((token, index) => (
            <div
              key={token.symbol}
              ref={(element) => {
                rowRefs.current[token.symbol] = element;
              }}
              className={`flex min-h-[62px] items-center gap-3 rounded-[8px] border bg-white p-3 transition ${
                draggingSymbol === token.symbol
                  ? "scale-[0.99] border-[#0E7C4F] shadow-sm"
                  : "border-[#DDE4DC]"
              }`}
            >
              <button
                type="button"
                aria-label={`Arrastrar ${token.symbol}`}
                className="cursor-grab touch-none rounded-full p-1 text-[#9AA69D] active:cursor-grabbing active:text-[#0E7C4F]"
                onPointerDown={(event) => startDrag(event, token.symbol)}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <GripVertical className="h-5 w-5 shrink-0" />
              </button>
              <TokenMark token={token} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{token.symbol}</p>
                <p className="truncate text-xs text-[#66736B]">{token.label}</p>
                {token.requiresApproval && (
                  <p className="text-[11px] text-[#9AA69D]">
                    Allowance: {token.allowanceDisplay ?? "pendiente"}
                  </p>
                )}
              </div>
              <p className="text-sm font-semibold">
                {token.balanceDisplay ?? formatUsd(token.balanceUsd)}
              </p>
              <div className="flex flex-col gap-1">
                <MoveButton
                  label={`Subir ${token.symbol}`}
                  disabled={index === 0}
                  onClick={() => onMove(index, -1)}
                  direction="up"
                />
                <MoveButton
                  label={`Bajar ${token.symbol}`}
                  disabled={index === tokens.length - 1}
                  onClick={() => onMove(index, 1)}
                  direction="down"
                />
              </div>
            </div>
          ))}
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
  onActivate,
  onSkip,
}: {
  tokens: PortfolioToken[];
  allActive: boolean;
  approvalTarget?: Address;
  activating: string | null;
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
            : "Primero necesitamos una route de Squid para saber a que contrato aprobar."}
        </div>
      </div>

      <div className="space-y-2.5 pb-16">
        {tokens.map((token) => {
          const isActive = token.activation === "active";
          const isActivating = activating === token.symbol;
          const canTokenApprove = Boolean(getApprovalCap(token));

          return (
            <div
              key={token.symbol}
              className="flex min-h-[62px] items-center gap-3 rounded-[8px] border border-[#DDE4DC] bg-white p-3"
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
                {isActive ? (
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
  hasCompatibleTokens,
  isLive,
  totalUsd,
  detailsOpen,
  tokens,
  onAmountChange,
  onDetailsToggle,
}: {
  copAmount: string;
  hasCompatibleTokens: boolean;
  isLive: boolean;
  totalUsd: number;
  detailsOpen: boolean;
  tokens: PortfolioToken[];
  onAmountChange: (value: string) => void;
  onDetailsToggle: () => void;
}) {
  const hasNoFunds = isLive && !hasCompatibleTokens;
  const hasInsufficientFunds =
    !hasNoFunds && totalUsd < purchasePreview.inputUsdAmount;
  const canBuy = !hasNoFunds && !hasInsufficientFunds;

  return (
    <div className="flex flex-1 flex-col">
      <div className="rounded-[8px] border border-[#DDE4DC] bg-white p-4">
        <p className="text-sm font-medium text-[#66736B]">Disponible</p>
        <p className="mt-1 text-2xl font-semibold leading-none">
          {formatUsd(totalUsd)}{" "}
          <span className="text-sm font-medium text-[#66736B]">aprox.</span>
        </p>
        <p className="mt-2 text-xs font-medium text-[#66736B]">
          Tipo de cambio: {purchasePreview.exchangeRateLabel}
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
          {purchasePreview.inputUsdLabel}
        </p>
        {(hasNoFunds || hasInsufficientFunds) && (
          <div className="mt-3 rounded-[8px] bg-[#FFF6D8] px-3 py-2 text-sm font-medium leading-5 text-[#17211B]">
            {hasNoFunds
              ? "No encontramos tokens compatibles para comprar COPm."
              : "Saldo insuficiente para comprar esta cantidad de COPm."}
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
          disabled={!canBuy}
        >
          Comprar COPm
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
              {tokens.slice(0, 3).map((token, index) => (
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
                    {index === 2 ? "$12.50 aprox." : formatUsd(token.balanceUsd)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-[8px] bg-[#F7F8F5] p-3">
                <p className="text-xs text-[#66736B]">Fee</p>
                <p className="mt-1 font-semibold">{purchasePreview.feeLabel}</p>
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
