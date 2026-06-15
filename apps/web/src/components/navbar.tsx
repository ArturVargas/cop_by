"use client";

import { HelpCircle } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#DDE4DC] bg-[#F7F8F5]/95 backdrop-blur">
      <div className="mx-auto flex h-12 w-full max-w-md items-center justify-between px-4 sm:max-w-lg md:max-w-2xl">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-[8px] bg-[#0E7C4F] text-xs font-bold text-white">
            C
          </div>
          <div>
            <p className="text-sm font-semibold leading-none text-[#17211B]">
              COPm
            </p>
            <p className="mt-0.5 text-[11px] leading-none text-[#66736B]">
              Pesos digitales
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-label="Ayuda"
          className="grid h-9 w-9 place-items-center rounded-full border border-[#DDE4DC] bg-white text-[#66736B]"
        >
          <HelpCircle className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
}
