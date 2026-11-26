"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LogOut, Wallet } from "lucide-react";

import { useStellarWallet } from "@/hooks/use-stellar-wallet";

function formatUsdc(balance: string | null) {
  if (balance === null) return "—";
  const n = Number(balance);
  if (!Number.isFinite(n)) return balance;
  return n.toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function CavosAccountControls() {
  const {
    configured,
    status,
    usdcBalance,
    balanceError,
    openModal,
    login,
    logout,
    isAuthenticated,
  } = useStellarWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  if (!configured) {
    return (
      <span className="inline-flex h-11 items-center rounded-full border border-[#F2C94C] bg-[#FFF6D8] px-3 text-[11px] font-semibold text-[#17211B]">
        Configura Cavos
      </span>
    );
  }

  if (status === "loading") {
    return (
      <span className="inline-flex h-11 items-center rounded-full border border-[#DDE4DC] bg-white px-3 text-[11px] font-semibold text-[#66736B]">
        Cargando
      </span>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            void login("google").catch((err: unknown) => {
              console.error("cavos login google", err);
            });
          }}
          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[#DDE4DC] bg-white px-3 text-xs font-semibold text-[#17211B]"
        >
          <Wallet className="h-3.5 w-3.5" />
          Google
        </button>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex h-11 items-center rounded-full border border-[#DDE4DC] bg-[#17211B] px-3 text-xs font-semibold text-white"
        >
          Entrar
        </button>
      </div>
    );
  }

  return (
    <div ref={accountRef} className="relative flex items-center gap-1.5" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenuOpen(false); }}>
      <span className="inline-flex h-11 max-w-[140px] items-center truncate rounded-full border border-[#D5EADF] bg-[#E6F4EE] px-2.5 text-[11px] font-semibold text-[#0E7C4F]">
        {balanceError ? "Saldo sin actualizar" : `${formatUsdc(usdcBalance)} USDC`}
      </span>
      <button
        type="button"
        ref={buttonRef}
        aria-expanded={menuOpen}
        aria-controls={menuId}
        aria-label="Cuenta"
        onClick={() => setMenuOpen((open) => !open)}
        className="inline-flex h-11 items-center rounded-full border border-[#DDE4DC] bg-white px-3 text-xs font-semibold text-[#17211B]"
      >
        Cuenta
      </button>
      {menuOpen && (
        <div id={menuId} className="absolute right-0 top-11 z-50 w-44 rounded-[8px] border border-[#DDE4DC] bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => {
              logout();
              setMenuOpen(false);
            }}
            className="flex min-h-11 w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-xs font-semibold text-[#17211B] hover:bg-[#F7F8F5]"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
