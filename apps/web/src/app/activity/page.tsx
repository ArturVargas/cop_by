"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { useStellarWallet } from "@/hooks/use-stellar-wallet";
import { formatShortStellarGAddress } from "@/lib/stellar-address";

export default function ActivityPage() {
  const { address, isAuthenticated, openModal } = useStellarWallet();

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-lg">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-semibold text-[#66736B]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-[#17211B]">Actividad</h1>
      <p className="mt-2 text-sm text-[#66736B]">
        El historial Stellar + TuCOP llega en el dia 6 del MVP. Por ahora solo
        ves la cuenta conectada.
      </p>
      {!isAuthenticated ? (
        <button
          type="button"
          onClick={openModal}
          className="mt-6 inline-flex h-11 min-h-11 items-center rounded-[8px] bg-[#0E7C4F] px-4 text-sm font-semibold text-white"
        >
          Entrar
        </button>
      ) : (
        <p
          className="mt-6 rounded-[8px] border border-[#DDE4DC] bg-white px-3 py-3 font-mono text-xs text-[#17211B]"
          title={address ?? undefined}
          role="status"
        >
          {address ? formatShortStellarGAddress(address) : "—"}
        </p>
      )}
    </div>
  );
}
