"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCavos } from "@cavos/kit/react";

import { getStellarUsdc, isCavosConfigured } from "@/lib/cavos-config";

export type StellarWalletStatus =
  | "unconfigured"
  | "loading"
  | "signed-out"
  | "needs-device-approval"
  | "needs-relogin"
  | "undeployed"
  | "ready"
  | "error";

const RECOVERY_RELOGIN_HINT =
  "Para abrir tu cuenta en este dispositivo, vuelve a iniciar sesion.";

function isRecoveryReloginError(message: string) {
  return (
    message.includes("protected by recovery") ||
    message.includes("Sign in again") ||
    message.includes("SIGN_IN_AGAIN_TO_RECOVER") ||
    message.includes("social-recovery")
  );
}

function humanizeWalletError(message: string) {
  if (isRecoveryReloginError(message)) return RECOVERY_RELOGIN_HINT;
  if (message.startsWith("kit/")) {
    return "No se pudo preparar la cuenta. Intenta de nuevo o vuelve a entrar.";
  }
  return message;
}

function isBenignTrustlineError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("already") ||
    lower.includes("trustline") && lower.includes("exist") ||
    lower.includes("op_already_exists") ||
    lower.includes("change_trust") && lower.includes("low")
  );
}

export function useStellarWallet() {
  const configured = isCavosConfigured();
  const {
    wallet: rawWallet,
    isAuthenticated,
    isLoading,
    user,
    authError,
    openModal,
    login,
    logout,
    approveDeviceWithPasskey,
  } = useCavos();

  const usdc = getStellarUsdc();
  const wallet = rawWallet?.chain === "stellar" ? rawWallet : null;
  const address = wallet?.address ?? null;

  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [trustlineReady, setTrustlineReady] = useState(false);
  const [needsRelogin, setNeedsRelogin] = useState(false);
  const bootstrapInFlight = useRef(false);

  let status: StellarWalletStatus = "unconfigured";
  if (!configured) {
    status = "unconfigured";
  } else if (isLoading) {
    status = "loading";
  } else if (!isAuthenticated || !wallet) {
    status = "signed-out";
  } else if (needsRelogin) {
    status = "needs-relogin";
  } else if (wallet.status === "needs-device-approval") {
    status = "needs-device-approval";
  } else if (wallet.status === "undeployed") {
    status = "undeployed";
  } else if (wallet.status === "ready") {
    status = "ready";
  }

  const refreshUsdcBalance = useCallback(async () => {
    if (!wallet || wallet.status !== "ready") {
      setUsdcBalance(null);
      return null;
    }
    try {
      const bal = await wallet.tokenBalance({
        code: usdc.code,
        issuer: usdc.issuer,
      });
      setUsdcBalance(bal);
      setTrustlineReady(true);
      setBootstrapError(null);
      return bal;
    } catch {
      setUsdcBalance("0");
      setTrustlineReady(false);
      return "0";
    }
  }, [usdc.code, usdc.issuer, wallet]);

  const ensureAccountAndTrustline = useCallback(async () => {
    if (!wallet) {
      throw new Error("Cuenta Stellar no disponible");
    }
    if (wallet.status === "needs-device-approval") {
      setNeedsRelogin(true);
      throw new Error(RECOVERY_RELOGIN_HINT);
    }
    if (bootstrapInFlight.current) return;

    bootstrapInFlight.current = true;
    setBootstrapping(true);
    setBootstrapError(null);
    try {
      try {
        await wallet.create();
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        if (isRecoveryReloginError(raw)) throw err;
        // create() can race / retry; if the account is already ready, continue.
        if (wallet.status !== "ready") throw err;
      }

      try {
        await wallet.addTrustline({ code: usdc.code, issuer: usdc.issuer });
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        if (isRecoveryReloginError(raw)) throw err;
        if (!isBenignTrustlineError(raw)) {
          // Trustline may already exist from a previous successful relay.
          const bal = await refreshUsdcBalance();
          if (bal !== null) {
            setTrustlineReady(true);
            setBootstrapError(null);
            setNeedsRelogin(false);
            return;
          }
          throw err;
        }
      }

      setTrustlineReady(true);
      setNeedsRelogin(false);
      setBootstrapError(null);
      await refreshUsdcBalance();
    } catch (err) {
      const raw =
        err instanceof Error ? err.message : "No se pudo preparar la cuenta USDC";
      if (isRecoveryReloginError(raw)) {
        setNeedsRelogin(true);
        setBootstrapError(null);
      } else {
        setBootstrapError(humanizeWalletError(raw));
      }
      throw err;
    } finally {
      bootstrapInFlight.current = false;
      setBootstrapping(false);
    }
  }, [refreshUsdcBalance, usdc.code, usdc.issuer, wallet]);

  useEffect(() => {
    if (!isAuthenticated) {
      setNeedsRelogin(false);
      setBootstrapError(null);
      bootstrapInFlight.current = false;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (status === "ready") {
      void refreshUsdcBalance();
    } else if (status === "signed-out" || status === "loading") {
      setUsdcBalance(null);
      setTrustlineReady(false);
    }
  }, [refreshUsdcBalance, status]);

  useEffect(() => {
    if (trustlineReady) setBootstrapError(null);
  }, [trustlineReady]);

  return {
    configured,
    status,
    address,
    usdc,
    usdcBalance,
    trustlineReady,
    bootstrapping,
    bootstrapError,
    user,
    authError,
    isAuthenticated,
    openModal,
    login,
    logout,
    approveDeviceWithPasskey,
    ensureAccountAndTrustline,
    refreshUsdcBalance,
    wallet,
  };
}
