"use client";

import { useEffect, useId, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  HomeTabPanel,
  HomeTabs,
  type HomeTab,
} from "@/components/home-tabs";
import { SendUsdcPanel } from "@/components/send-usdc-panel";
import { useStellarWallet } from "@/hooks/use-stellar-wallet";
import { CAVOS_NETWORK } from "@/lib/cavos-config";
import { formatShortStellarGAddress } from "@/lib/stellar-address";
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

  const tabsBaseId = `stellar-home-${useId().replace(/:/g, "")}`;
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "ok" | "fail">("idle");
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<HomeTab>("enviar");

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
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(address);
      setCopyStatus("ok");
    } catch {
      setCopyStatus("fail");
    }
    window.setTimeout(() => setCopyStatus("idle"), 1600);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshUsdcBalance();
    } finally {
      setRefreshing(false);
    }
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
        <p className="text-sm text-[#66736B]" role="status">
          Preparando tu cuenta…
        </p>
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
          <p
            className="rounded-[8px] border border-[#F5C6CB] bg-[#FDECEE] px-3 py-2 text-sm text-[#9B1C1C]"
            role="alert"
          >
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
          <p
            className="rounded-[8px] border border-[#DDE4DC] bg-white px-3 py-2 font-mono text-xs text-[#17211B]"
            title={address}
          >
            {formatShortStellarGAddress(address)}
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
      </div>

      <section className="rounded-[8px] border border-[#DDE4DC] bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-[#66736B]">Saldo</p>
            <p className="mt-1 text-3xl font-bold text-[#17211B]">
              {formatUsdc(usdcBalance)}{" "}
              <span className="text-base font-semibold text-[#66736B]">USDC</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={refreshing}
            aria-busy={refreshing}
            className="h-9 min-h-9 shrink-0 rounded-full border border-[#DDE4DC] bg-[#F7F8F5] px-3 text-[11px] font-semibold text-[#17211B] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E7C4F]"
          >
            {refreshing ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p
            className="font-mono text-[11px] leading-4 text-[#66736B]"
            title={address ?? undefined}
          >
            {address ? formatShortStellarGAddress(address) : "—"}
          </p>
          <button
            type="button"
            onClick={() => void copyAddress()}
            aria-label="Copiar direccion de cuenta"
            className="inline-flex h-8 min-h-8 shrink-0 items-center gap-1 rounded-full border border-[#DDE4DC] bg-white px-2.5 text-[11px] font-semibold text-[#17211B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E7C4F]"
          >
            {copyStatus === "ok" ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copyStatus === "ok"
              ? "Copiado"
              : copyStatus === "fail"
                ? "Error"
                : "Copiar"}
          </button>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {copyStatus === "ok"
            ? "Direccion copiada"
            : copyStatus === "fail"
              ? "No se pudo copiar la direccion"
              : ""}
        </p>
        {!trustlineReady && (
          <>
            <p className="mt-2 text-[11px] text-[#66736B]" role="status">
              Preparando cuenta…
            </p>
            {bootstrapError && (
              <p
                className="mt-2 rounded-[8px] border border-[#F5C6CB] bg-[#FDECEE] px-3 py-2 text-xs text-[#9B1C1C]"
                role="alert"
              >
                {bootstrapError}
              </p>
            )}
            <Button
              className="mt-3 h-10 w-full rounded-[8px] bg-[#0E7C4F] text-sm font-semibold text-white hover:bg-[#0A5F3C]"
              disabled={bootstrapping}
              onClick={() => void ensureAccountAndTrustline()}
            >
              {bootstrapping ? "Preparando…" : "Preparar cuenta"}
            </Button>
          </>
        )}
      </section>

      <HomeTabs active={tab} onChange={setTab} id={tabsBaseId} />

      <HomeTabPanel tab="obtener" active={tab} baseId={tabsBaseId}>
        <div className="rounded-[8px] border border-[#DDE4DC] bg-white p-4">
          <p className="text-sm font-semibold text-[#17211B]">Obtener USDC</p>
          <p className="mt-1 text-sm text-[#66736B]">
            Copia tu cuenta y fondea desde otra wallet, o usa el faucet de Circle
            en testnet. Depositar en la app llega mas adelante.
          </p>
          <p className="mt-3 text-[11px] text-[#66736B]">
            Asset {usdc.code} · issuer en tooltip del saldo
          </p>
          <p className="mt-1 break-all font-mono text-[10px] text-[#66736B]" title={usdc.issuer}>
            {usdc.code}:{formatShortStellarGAddress(usdc.issuer)}
          </p>
        </div>
      </HomeTabPanel>

      <HomeTabPanel tab="enviar" active={tab} baseId={tabsBaseId}>
        <SendUsdcPanel />
      </HomeTabPanel>

      <HomeTabPanel tab="gastar" active={tab} baseId={tabsBaseId}>
        <div className="rounded-[8px] border border-[#DDE4DC] bg-white p-4">
          <p className="text-sm font-semibold text-[#17211B]">Gastar a pesos</p>
          <p className="mt-1 text-sm text-[#66736B]">
            Pronto: Bre-B (COP), Pix y SPEI con TuCOP Ramp. Mientras tanto puedes
            enviar USDC a otra cuenta Stellar.
          </p>
        </div>
      </HomeTabPanel>
    </div>
  );
}
