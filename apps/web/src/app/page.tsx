"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
  HelpCircle,
  Settings,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatUsd,
  mockPortfolioTokens,
  PortfolioToken,
  purchasePreview,
} from "@/lib/mock-portfolio";

const steps = ["Ordenar", "Activar", "Comprar"];

export default function Home() {
  const [step, setStep] = useState(0);
  const [tokens, setTokens] = useState(mockPortfolioTokens);
  const [copAmount, setCopAmount] = useState(purchasePreview.copAmount);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  const totalUsd = useMemo(
    () => tokens.reduce((sum, token) => sum + token.balanceUsd, 0),
    [tokens]
  );

  const pendingTokens = tokens.filter((token) => token.activation !== "active");
  const allActive = pendingTokens.length === 0;

  const moveToken = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= tokens.length) return;

    const updated = [...tokens];
    const [item] = updated.splice(index, 1);
    updated.splice(nextIndex, 0, item);
    setTokens(updated);
  };

  const activateNextToken = () => {
    const nextToken = tokens.find((token) => token.activation !== "active");
    if (!nextToken) {
      setStep(2);
      return;
    }

    setActivating(nextToken.symbol);
    setTimeout(() => {
      setTokens((currentTokens) =>
        currentTokens.map((token) =>
          token.symbol === nextToken.symbol
            ? { ...token, activation: "active" }
            : token
        )
      );
      setActivating(null);
    }, 650);
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#F7F8F5] text-[#17211B]">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col px-4 py-3 sm:max-w-lg sm:py-6 md:max-w-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-[#66736B]">
              COPm
            </p>
            <h1 className="text-xl font-semibold">Pesos digitales</h1>
          </div>
          <button
            type="button"
            aria-label={step === 2 ? "Configurar" : "Ayuda"}
            className="grid h-10 w-10 place-items-center rounded-full border border-[#DDE4DC] bg-white text-[#66736B]"
          >
            {step === 2 ? (
              <Settings className="h-5 w-5" />
            ) : (
              <HelpCircle className="h-5 w-5" />
            )}
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
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
            onMove={moveToken}
            onContinue={() => setStep(1)}
          />
        )}

        {step === 1 && (
          <TokenActivationScreen
            tokens={tokens}
            allActive={allActive}
            activating={activating}
            onActivate={activateNextToken}
            onSkip={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <BuyCopmScreen
            copAmount={copAmount}
            totalUsd={totalUsd}
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
  onMove,
  onContinue,
}: {
  tokens: PortfolioToken[];
  onMove: (index: number, direction: -1 | 1) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-5 rounded-[8px] border border-[#DDE4DC] bg-white p-5">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[8px] bg-[#E6F4EE] text-[#0E7C4F]">
          <ArrowLeftRight className="h-5 w-5" />
        </div>
        <h2 className="text-2xl font-semibold leading-tight">
          Compra pesos digitales con lo que ya tienes en MiniPay.
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#66736B]">
          Ordena como quieres pagar. Usaremos primero los tokens de arriba.
        </p>
      </div>

      <div className="space-y-3">
        {tokens.map((token, index) => (
          <div
            key={token.symbol}
            className="flex min-h-[68px] items-center gap-3 rounded-[8px] border border-[#DDE4DC] bg-white p-3"
          >
            <GripVertical className="h-5 w-5 shrink-0 text-[#9AA69D]" />
            <TokenMark token={token} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{token.symbol}</p>
              <p className="truncate text-xs text-[#66736B]">{token.label}</p>
            </div>
            <p className="text-sm font-semibold">{formatUsd(token.balanceUsd)}</p>
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

      <div className="sticky bottom-0 -mx-4 mt-auto bg-[#F7F8F5]/95 px-4 py-3 backdrop-blur">
        <Button
          className="h-12 w-full rounded-[8px] bg-[#0E7C4F] text-base font-semibold text-white hover:bg-[#075C3A]"
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
  activating,
  onActivate,
  onSkip,
}: {
  tokens: PortfolioToken[];
  allActive: boolean;
  activating: string | null;
  onActivate: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-5 rounded-[8px] border border-[#DDE4DC] bg-white p-5">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[8px] bg-[#E6F4EE] text-[#0E7C4F]">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h2 className="text-2xl font-semibold leading-tight">
          Prepara tus tokens
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#66736B]">
          Autoriza una vez para comprar COPm con un toque despues.
        </p>
        <div className="mt-4 rounded-[8px] bg-[#FFF6D8] px-3 py-2 text-sm font-medium text-[#17211B]">
          Permiso por token: hasta {formatUsd(purchasePreview.activationCapUsd)}
        </div>
      </div>

      <div className="space-y-3">
        {tokens.map((token) => {
          const isActive = token.activation === "active";
          const isActivating = activating === token.symbol;

          return (
            <div
              key={token.symbol}
              className="flex min-h-[68px] items-center gap-3 rounded-[8px] border border-[#DDE4DC] bg-white p-3"
            >
              <TokenMark token={token} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{token.symbol}</p>
                <p className="text-xs text-[#66736B]">
                  {formatUsd(token.balanceUsd)}
                </p>
              </div>
              <span
                className={`inline-flex h-8 min-w-[86px] items-center justify-center rounded-full px-3 text-xs font-semibold ${
                  isActive
                    ? "bg-[#E6F4EE] text-[#0E7C4F]"
                    : isActivating
                      ? "bg-[#FFF6D8] text-[#B7791F]"
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
                ) : (
                  "Activar"
                )}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-5 text-center text-xs text-[#66736B]">
        Esto no mueve tu saldo. Solo deja listo cada token.
      </p>

      <div className="sticky bottom-0 -mx-4 mt-auto space-y-2 bg-[#F7F8F5]/95 px-4 py-3 backdrop-blur">
        <Button
          className="h-12 w-full rounded-[8px] bg-[#0E7C4F] text-base font-semibold text-white hover:bg-[#075C3A]"
          onClick={allActive ? onSkip : onActivate}
          disabled={activating !== null}
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

function BuyCopmScreen({
  copAmount,
  totalUsd,
  detailsOpen,
  tokens,
  onAmountChange,
  onDetailsToggle,
}: {
  copAmount: string;
  totalUsd: number;
  detailsOpen: boolean;
  tokens: PortfolioToken[];
  onAmountChange: (value: string) => void;
  onDetailsToggle: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="rounded-[8px] border border-[#DDE4DC] bg-white p-5">
        <p className="text-sm font-medium text-[#66736B]">Disponible</p>
        <p className="mt-1 text-3xl font-semibold leading-none">
          {formatUsd(totalUsd)}{" "}
          <span className="text-sm font-medium text-[#66736B]">aprox.</span>
        </p>
      </div>

      <div className="mt-4 rounded-[8px] border border-[#DDE4DC] bg-white p-5">
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
          className="mt-3 h-14 w-full rounded-[8px] border border-[#DDE4DC] bg-[#F7F8F5] px-4 text-2xl font-semibold outline-none ring-[#0E7C4F] focus:ring-2"
        />

        <div className="mt-5 rounded-[8px] bg-[#E6F4EE] p-4">
          <p className="text-sm font-medium text-[#66736B]">Recibiras</p>
          <p className="mt-1 text-3xl font-semibold leading-tight text-[#0E7C4F]">
            {copAmount || "0"} COPm
          </p>
        </div>

        <Button className="mt-5 h-12 w-full rounded-[8px] bg-[#0E7C4F] text-base font-semibold text-white hover:bg-[#075C3A]">
          Comprar COPm
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-[8px] border border-[#DDE4DC] bg-white">
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
