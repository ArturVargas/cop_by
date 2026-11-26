"use client";

import { lazy, Suspense, useEffect, useId, useState } from "react";
import Link from "next/link";
import { Check, Copy, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  HomeTabPanel,
  HomeTabs,
  type HomeTab,
} from "@/components/home-tabs";
const SendUsdcPanel = lazy(() => import("@/components/send-usdc-panel").then((module) => ({ default: module.SendUsdcPanel })));
import { formatUsdcAmount } from "@/lib/format-usdc";
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
  return balance === null ? "—" : formatUsdcAmount(balance);
}

export function StellarHome() {
  const {
    configured,
    status,
    address,
    usdc,
    usdcBalance,
    balanceError,
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
    if (status === "undeployed" || (status === "ready" && !trustlineReady && !balanceError && !bootstrapError)) {
      void ensureAccountAndTrustline().catch(() => undefined);
    }
  }, [balanceError, bootstrapError, ensureAccountAndTrustline, status, trustlineReady]);

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
        <h1 className="text-2xl font-bold text-wallet-ink">Falta configurar Cavos</h1>
        <p className="text-sm text-wallet-muted">
          Crea una app en el dashboard de Cavos, registra el origin local, y define
          `NEXT_PUBLIC_CAVOS_APP_ID` (y opcional `NEXT_PUBLIC_CAVOS_NETWORK=testnet|mainnet`).
        </p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-md items-center justify-center px-4 py-16">
        <p className="text-sm text-wallet-muted" role="status">
          Preparando tu cuenta…
        </p>
      </div>
    );
  }

  if (status === "signed-out") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-10 sm:max-w-lg">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-wallet-brand">
            Stellar · {CAVOS_NETWORK}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-wallet-ink">
            Entra para ver tu USDC
          </h1>
        </div>
        {authError && (
          <p
            className="rounded-[8px] border border-wallet-negative-border bg-wallet-negative-soft px-3 py-2 text-sm text-wallet-negative"
            role="alert"
          >
            {authError}
          </p>
        )}
        <Button
          className="h-12 w-full rounded-[8px] bg-wallet-brand text-base font-semibold text-wallet-on-brand hover:bg-wallet-brand-hover"
          onClick={openModal}
        >
          Entrar
        </Button>
      </div>
    );
  }

  if (status === "needs-device-approval" || status === "needs-relogin") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10 sm:max-w-lg">
        <h1 className="text-2xl font-bold text-wallet-ink">Confirma que eres tú</h1>
        <p className="text-sm text-wallet-muted">
          Para abrir tu cuenta en este dispositivo, vuelve a iniciar sesión.
        </p>
        {address && (
          <p
            className="rounded-[8px] border border-wallet-border bg-wallet-card px-3 py-2 font-mono text-xs text-wallet-ink"
            title={address}
          >
            {formatShortStellarGAddress(address)}
          </p>
        )}
        <Button
          className="h-12 w-full rounded-[8px] bg-wallet-brand text-base font-semibold text-wallet-on-brand hover:bg-wallet-brand-hover"
          onClick={openModal}
        >
          Entrar
        </Button>
        {status === "needs-device-approval" && approveDeviceWithPasskey && (
          <Button
            variant="outline"
            className="h-12 w-full rounded-[8px]"
            onClick={() => void approveDeviceWithPasskey()}
          >
            Usar clave de acceso
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-8 sm:max-w-lg">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-wallet-brand">
          Stellar · {CAVOS_NETWORK}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-wallet-ink">Tu USDC</h1>
      </div>

      <section className="rounded-[8px] border border-wallet-border bg-wallet-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-wallet-muted">{balanceError ? "Último saldo confirmado" : "Saldo"}</p>
            <p className="mt-1 break-words text-3xl font-bold tabular-nums text-wallet-ink">
              {formatUsdc(usdcBalance)}{" "}
              <span className="text-base font-semibold text-wallet-muted">USDC</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={refreshing}
            aria-busy={refreshing}
            className="h-11 min-h-11 shrink-0 rounded-full border border-wallet-border bg-wallet-surface px-3 text-xs font-semibold text-wallet-ink disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wallet-brand"
          >
            {refreshing ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
        {balanceError && <p className="mt-3 text-sm text-wallet-negative" role="alert">{balanceError}{usdcBalance !== null ? " Mostramos el último saldo confirmado." : ""}</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <p
            className="font-mono text-xs leading-4 text-wallet-muted"
            title={address ?? undefined}
          >
            {address ? formatShortStellarGAddress(address) : "—"}
          </p>
          <button
            type="button"
            onClick={() => void copyAddress()}
            aria-label="Copiar direccion de cuenta"
            className="inline-flex h-11 min-h-11 shrink-0 items-center gap-1 rounded-full border border-wallet-border bg-wallet-card px-2.5 text-xs font-semibold text-wallet-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wallet-brand"
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
            <p className="mt-2 text-xs text-wallet-muted" role="status">
              Preparando cuenta…
            </p>
            {bootstrapError && (
              <p
                className="mt-2 rounded-[8px] border border-wallet-negative-border bg-wallet-negative-soft px-3 py-2 text-xs text-wallet-negative"
                role="alert"
              >
                {bootstrapError}
              </p>
            )}
            <Button
              className="mt-3 h-11 w-full rounded-[8px] bg-wallet-brand text-sm font-semibold text-wallet-on-brand hover:bg-wallet-brand-hover"
              disabled={bootstrapping}
              onClick={() => void ensureAccountAndTrustline().catch(() => undefined)}
            >
              {bootstrapping ? "Preparando…" : "Preparar cuenta"}
            </Button>
          </>
        )}
        {status === "ready" && (
          <Button asChild variant="outline" className="mt-4 h-11 w-full">
            <Link href="/activity">
              <History className="mr-2 h-4 w-4" aria-hidden="true" />
              Historial de transacciones
            </Link>
          </Button>
        )}
      </section>

      <HomeTabs active={tab} onChange={setTab} id={tabsBaseId} />

      <HomeTabPanel tab="recibir" active={tab} baseId={tabsBaseId}>
        <div className="rounded-[8px] border border-wallet-border bg-wallet-card p-4">
          <p className="text-sm font-semibold text-wallet-ink">Recibir USDC</p>
          <p className="mt-1 text-sm text-wallet-muted">
            Comparte tu cuenta para recibir USDC desde otra wallet en Stellar
            {CAVOS_NETWORK === "testnet" ? " Testnet." : "."}
          </p>
          {address && (
            <div className="mt-4">
              <p className="break-all font-mono text-xs leading-5 text-wallet-ink">{address}</p>
              <Button type="button" variant="outline" className="mt-3 h-11 w-full" onClick={() => void copyAddress()}>
                <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                {copyStatus === "ok" ? "Cuenta copiada" : copyStatus === "fail" ? "Reintentar copia" : "Copiar cuenta"}
              </Button>
            </div>
          )}
          <p className="mt-3 text-xs text-wallet-muted">
            {CAVOS_NETWORK === "testnet"
              ? "Usa solo USDC de prueba en Stellar Testnet."
              : "Envía únicamente USDC de la red Stellar a esta cuenta."}
          </p>
          <p className="mt-1 break-all font-mono text-xs text-wallet-muted" title={usdc.issuer}>
            {usdc.code}:{formatShortStellarGAddress(usdc.issuer)}
          </p>
        </div>
      </HomeTabPanel>

      <HomeTabPanel tab="enviar" active={tab} baseId={tabsBaseId}>
        <Suspense fallback={<p className="text-sm text-wallet-muted" role="status">Cargando formulario de envío…</p>}><SendUsdcPanel key={address} /></Suspense>
      </HomeTabPanel>

      <HomeTabPanel tab="gastar" active={tab} baseId={tabsBaseId}>
        <div className="rounded-[8px] border border-wallet-border bg-wallet-card p-4">
          <p className="text-sm font-semibold text-wallet-ink">Pagos a pesos · Próximamente</p>
          <p className="mt-1 text-sm text-wallet-muted">
            Los pagos por Bre-B (COP), Pix y SPEI aún no están disponibles. Mientras tanto puedes
            enviar USDC a otra cuenta Stellar.
          </p>
        </div>
      </HomeTabPanel>
    </div>
  );
}
