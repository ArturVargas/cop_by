"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStellarWallet } from "@/hooks/use-stellar-wallet";
import { CAVOS_NETWORK } from "@/lib/cavos-config";
import {
  hasSeenOnboarding,
  markOnboardingSeen,
  OnboardingScreen,
  OPEN_ONBOARDING_EVENT,
} from "@/components/onboarding-screen";

function formatUsdc(balance: string | null) {
  if (balance === null) return "—";
  const n = Number(balance);
  if (!Number.isFinite(n)) return balance;
  return n.toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function StellarHome() {
  const {
    configured,
    status,
    address,
    usdc,
    usdcBalance,
    trustlineReady,
    bootstrapping,
    bootstrapError,
    authError,
    openModal,
    approveDeviceWithPasskey,
    ensureAccountAndTrustline,
    refreshUsdcBalance,
  } = useStellarWallet();

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!hasSeenOnboarding()) setShowOnboarding(true);
    const open = () => setShowOnboarding(true);
    window.addEventListener(OPEN_ONBOARDING_EVENT, open);
    return () => window.removeEventListener(OPEN_ONBOARDING_EVENT, open);
  }, []);

  useEffect(() => {
    if (status === "undeployed" || (status === "ready" && !trustlineReady)) {
      void ensureAccountAndTrustline().catch(() => undefined);
    }
  }, [ensureAccountAndTrustline, status, trustlineReady]);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard?.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  if (showOnboarding) {
    return (
      <OnboardingScreen
        onStart={() => {
          markOnboardingSeen();
          setShowOnboarding(false);
        }}
      />
    );
  }

  if (!configured) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8 sm:max-w-lg">
        <h1 className="text-2xl font-bold text-[#17211B]">Falta configurar Cavos</h1>
        <p className="text-sm text-[#66736B]">
          Crea una app en el dashboard de Cavos, registra el origin local, y define
          `NEXT_PUBLIC_CAVOS_APP_ID` (y opcional `NEXT_PUBLIC_CAVOS_NETWORK=testnet|mainnet`).
        </p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-md items-center justify-center px-4 py-16">
        <p className="text-sm text-[#66736B]">Preparando tu cuenta…</p>
      </div>
    );
  }

  if (status === "signed-out") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-10 sm:max-w-lg">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#0E7C4F]">
            Stellar · {CAVOS_NETWORK}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[#17211B]">
            Entra para ver tu USDC
          </h1>
        </div>
        {authError && (
          <p className="rounded-[8px] border border-[#F5C6CB] bg-[#FDECEE] px-3 py-2 text-sm text-[#9B1C1C]">
            {authError}
          </p>
        )}
        <Button
          className="h-12 w-full rounded-[8px] bg-[#0E7C4F] text-base font-semibold text-white hover:bg-[#0A5F3C]"
          onClick={openModal}
        >
          Login
        </Button>
      </div>
    );
  }

  if (status === "needs-device-approval" || status === "needs-relogin") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10 sm:max-w-lg">
        <h1 className="text-2xl font-bold text-[#17211B]">Confirma que eres tu</h1>
        <p className="text-sm text-[#66736B]">
          Para abrir tu cuenta en este dispositivo, vuelve a iniciar sesion.
        </p>
        {address && (
          <p className="break-all rounded-[8px] border border-[#DDE4DC] bg-white px-3 py-2 font-mono text-xs text-[#17211B]">
            {address}
          </p>
        )}
        <Button
          className="h-12 w-full rounded-[8px] bg-[#0E7C4F] text-base font-semibold text-white hover:bg-[#0A5F3C]"
          onClick={openModal}
        >
          Login
        </Button>
        {status === "needs-device-approval" && approveDeviceWithPasskey && (
          <Button
            variant="outline"
            className="h-12 w-full rounded-[8px]"
            onClick={() => void approveDeviceWithPasskey()}
          >
            Usar passkey
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-8 sm:max-w-lg">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#0E7C4F]">
          Stellar · {CAVOS_NETWORK}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[#17211B]">Tu USDC</h1>
        <p className="mt-1 text-sm text-[#66736B]">
          Saldo listo para enviar o gastar (Bre-B / Pix / SPEI viene despues).
        </p>
      </div>

      <section className="rounded-[8px] border border-[#DDE4DC] bg-white p-4">
        <p className="text-xs font-semibold text-[#66736B]">Saldo</p>
        <p className="mt-1 text-3xl font-bold text-[#17211B]">
          {formatUsdc(usdcBalance)}{" "}
          <span className="text-base font-semibold text-[#66736B]">USDC</span>
        </p>
        <p className="mt-2 break-all text-[11px] leading-4 text-[#66736B]">
          Asset {usdc.code}:{usdc.issuer}
        </p>
      </section>

      <section className="rounded-[8px] border border-[#DDE4DC] bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-[#66736B]">Cuenta Stellar</p>
            <p className="mt-2 break-all font-mono text-xs leading-5 text-[#17211B]">
              {address}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyAddress()}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-[#DDE4DC] bg-[#F7F8F5] px-3 text-[11px] font-semibold text-[#17211B]"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        <p className="mt-3 text-xs text-[#66736B]">
          Estado: {status}
          {trustlineReady ? " · trustline USDC lista" : " · preparando trustline"}
          {bootstrapping ? " · trabajando…" : ""}
        </p>
        {bootstrapError && !trustlineReady && (
          <p className="mt-2 rounded-[8px] border border-[#F5C6CB] bg-[#FDECEE] px-3 py-2 text-xs text-[#9B1C1C]">
            {bootstrapError}
          </p>
        )}
      </section>

      <div className="flex flex-col gap-2">
        {!trustlineReady && (
          <Button
            className="h-11 w-full rounded-[8px] bg-[#0E7C4F] text-sm font-semibold text-white hover:bg-[#0A5F3C]"
            disabled={bootstrapping}
            onClick={() => void ensureAccountAndTrustline()}
          >
            {bootstrapping ? "Preparando cuenta…" : "Preparar cuenta + trustline USDC"}
          </Button>
        )}
        <Button
          variant="outline"
          className="h-11 w-full rounded-[8px]"
          onClick={() => void refreshUsdcBalance()}
        >
          Actualizar saldo
        </Button>
      </div>
    </div>
  );
}
