"use client";

import { HelpCircle } from "lucide-react";

import { OPEN_ONBOARDING_EVENT } from "@/components/onboarding-screen";
import {
  AddressBadge,
  ConnectButton,
  CopmBalanceBadge,
} from "@/components/connect-button";
import { useWalletAdapter } from "@/hooks/use-wallet-adapter";

const COPM_ICON_URL = "https://app.mento.org/tokens/COPm.svg";

export function Navbar() {
  const { currentNetwork, isMiniPay, targetNetwork } = useWalletAdapter();
  const networkName = currentNetwork?.name ?? targetNetwork.name;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#DDE4DC] bg-[#F7F8F5]/95 backdrop-blur">
      <div className="mx-auto flex h-12 w-full max-w-md items-center justify-between px-4 sm:max-w-lg md:max-w-2xl">
        <div className="flex items-center gap-2">
          <img
            src={COPM_ICON_URL}
            alt="COPm"
            className="h-7 w-7 rounded-[8px]"
          />
          <div className="hidden sm:block">
            <p className="text-sm font-semibold leading-none text-[#17211B]">
              COPm
            </p>
            <p className="mt-0.5 text-[11px] leading-none text-[#66736B]">
              USD → pesos en MiniPay
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isMiniPay ? (
            <>
              <CopmBalanceBadge />
              <AddressBadge />
              <span className="inline-flex h-8 items-center rounded-full border border-[#DDE4DC] bg-white px-2.5 text-[11px] font-semibold text-[#66736B]">
                {networkName}
              </span>
            </>
          ) : (
            <ConnectButton />
          )}
          <button
            type="button"
            aria-label="Ayuda"
            onClick={() => window.dispatchEvent(new CustomEvent(OPEN_ONBOARDING_EVENT))}
            className="grid h-9 w-9 place-items-center rounded-full border border-[#DDE4DC] bg-white text-[#66736B]"
          >
            <HelpCircle className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </header>
  );
}
