"use client";

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";

const COPM_ICON_URL = "https://app.mento.org/tokens/COPm.svg";
export const ONBOARDING_STORAGE_KEY = "cop_by_onboarding_seen";
export const OPEN_ONBOARDING_EVENT = "cop_by:open-onboarding";

const bullets = [
  "Usamos el saldo que ya tienes en MiniPay (USDC, USDT…).",
  "Eliges cuántos pesos necesitas.",
  "Los recibes en tu wallet o se los envías a alguien.",
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
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#F7F8F5] px-4">
      <div className="w-full max-w-md rounded-[8px] border border-[#DDE4DC] bg-white p-6 shadow-sm">
        <img
          src={COPM_ICON_URL}
          alt="COP By"
          className="h-12 w-12 rounded-[8px]"
        />
        <h1 className="mt-5 text-2xl font-bold leading-tight text-[#17211B]">
          Convierte tus dólares en pesos
        </h1>
        <p className="mt-2 text-sm leading-5 text-[#66736B]">
          Envía pesos a cualquier wallet en Colombia desde MiniPay.
        </p>
        <ul className="mt-6 space-y-3">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-3 text-sm text-[#17211B]">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#E6F4EE] text-[#0E7C4F]">
                <Check className="h-3 w-3" />
              </span>
              {bullet}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs leading-5 text-[#66736B]">
          Sin cuentas bancarias extra. Tú confirmas cada paso en tu wallet.
        </p>
        <Button
          className="mt-6 h-12 w-full rounded-[8px] bg-[#6D45B8] text-base font-semibold text-white hover:bg-[#56359A]"
          onClick={onStart}
        >
          Empezar
        </Button>
      </div>
    </div>
  );
}
