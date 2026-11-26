"use client";

import { HelpCircle } from "lucide-react";

import { CavosAccountControls } from "@/components/cavos-account";
import { OPEN_ONBOARDING_EVENT } from "@/components/onboarding-screen";
import { CAVOS_NETWORK } from "@/lib/cavos-config";

const COPM_ICON_URL = "https://app.mento.org/tokens/COPm.svg";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#DDE4DC] bg-[#F7F8F5]/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4 sm:max-w-lg md:max-w-2xl">
        <div className="flex items-center gap-2">
          <img
            src={COPM_ICON_URL}
            alt="COP By"
            className="h-7 w-7 rounded-[8px]"
          />
          <div className="hidden sm:block">
            <p className="text-sm font-semibold leading-none text-[#17211B]">
              COP By
            </p>
            <p className="mt-0.5 text-[11px] leading-none text-[#66736B]">
              USDC · Stellar {CAVOS_NETWORK}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CavosAccountControls />
          <button
            type="button"
            aria-label="Ayuda"
            onClick={() =>
              window.dispatchEvent(new CustomEvent(OPEN_ONBOARDING_EVENT))
            }
            className="grid h-11 w-11 place-items-center rounded-full border border-[#DDE4DC] bg-white text-[#66736B]"
          >
            <HelpCircle className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </header>
  );
}
