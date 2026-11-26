"use client";

import { useEffect, useId, useRef } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";

const COPM_ICON_URL = "https://app.mento.org/tokens/COPm.svg";
export const ONBOARDING_STORAGE_KEY = "cop_by_onboarding_seen";
export const OPEN_ONBOARDING_EVENT = "cop_by:open-onboarding";

const bullets = [
  "Entra con Google, Apple o correo y obtén tu cuenta Stellar.",
  "Recibe y envía USDC. Cavos cubre el costo de red en los envíos directos.",
  "Consulta tus movimientos y comparte comprobantes. Los pagos a pesos estarán disponibles próximamente.",
];

export function hasSeenOnboarding() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
}

export function markOnboardingSeen() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
}

export function OnboardingScreen({ onStart }: { onStart: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} onClose={() => { if (!dialogRef.current?.open) onStart(); }} className="onboarding-dialog m-0 h-[100dvh] max-h-none w-full max-w-none overflow-y-auto border-0 bg-wallet-surface p-4">
      <div className="mx-auto my-auto shrink-0 w-full max-w-md rounded-[8px] border border-wallet-border bg-wallet-card p-6 shadow-sm">
        <img
          src={COPM_ICON_URL}
          alt="COP By"
          className="h-12 w-12 rounded-[8px]"
        />
        <h1 id={titleId} className="mt-5 text-2xl font-bold leading-tight text-wallet-ink">
          Tu USDC en Stellar
        </h1>
        <p className="mt-2 text-sm leading-5 text-wallet-muted">
          Non-custodial Wallet
        </p>
        <ul className="mt-6 space-y-3">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-3 text-sm text-wallet-ink">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-wallet-positive-soft text-wallet-brand">
                <Check className="h-3 w-3" />
              </span>
              {bullet}
            </li>
          ))}
        </ul>
        <Button
          className="mt-6 h-12 w-full rounded-[8px] bg-wallet-purple text-base font-semibold text-wallet-on-brand hover:bg-wallet-purple-hover"
          autoFocus
          onClick={() => dialogRef.current?.close()}
        >
          Empezar
        </Button>
      </div>
    </dialog>
  );
}
