"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StellarReceipt } from "@/components/stellar-receipt";
import type { StellarReceiptData } from "@/components/shareable-receipt";
import { getRecipientAlias } from "@/lib/saved-recipients";
import { formatUsdcAmount } from "@/lib/format-usdc";
import { useStellarWallet } from "@/hooks/use-stellar-wallet";
import { CAVOS_NETWORK } from "@/lib/cavos-config";
import { formatShortStellarGAddress } from "@/lib/stellar-address";
import { stellarTransactionUrl, type StellarActivityItem, type StellarActivityPage } from "@/lib/stellar-activity";

export default function ActivityPage() {
  const { address, status, isAuthenticated, openModal } = useStellarWallet();
  const [history, setHistory] = useState<{ address: string; items: StellarActivityItem[]; nextCursor: string | null } | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StellarActivityItem | null>(null);
  const items = history?.address === address ? history.items : [];
  const nextCursor = history?.address === address ? history.nextCursor : null;

  useEffect(() => { setCursor(null); setHistory(null); setSelected(null); }, [address]);

  const receipt = useMemo<StellarReceiptData | null>(() => selected ? {
    variant: "stellar-transfer",
    direction: selected.direction,
    delivery: selected.kind === "claimable" ? "claimable" : undefined,
    amount: selected.amount,
    senderAddress: selected.from,
    recipientAddress: selected.to,
    recipientAlias: getRecipientAlias(selected.to),
    completedAt: selected.createdAt,
    txHash: selected.txHash,
    memo: selected.memo,
    network: CAVOS_NETWORK,
  } : null, [selected]);

  useEffect(() => {
    if (!address || status !== "ready") return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ address });
    if (cursor) params.set("cursor", cursor);
    void fetch(`/api/stellar/activity?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("No pudimos cargar tu actividad. Intenta de nuevo.");
        const page = await response.json() as StellarActivityPage;
        if (controller.signal.aborted) return;
        setHistory((previous) => {
          const merged = cursor && previous?.address === address ? [...previous.items, ...page.items] : page.items;
          return { address, items: [...new Map(merged.map((item) => [item.id, item])).values()], nextCursor: page.nextCursor };
        });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos cargar tu actividad.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [address, status, cursor, refresh]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-lg">
      <Link href="/" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#66736B]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
      </Link>
      <div className="mt-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[#17211B]">Actividad</h1>
        {status === "ready" && (
          <Button type="button" variant="outline" disabled={loading} onClick={() => { setCursor(null); setRefresh((value) => value + 1); }}>
            {loading ? "Actualizando…" : "Actualizar"}
          </Button>
        )}
      </div>
      <p className="mt-2 text-sm text-[#66736B]">
        Movimientos de USDC en Stellar {CAVOS_NETWORK === "testnet" ? "Testnet · fondos de prueba" : "Mainnet"}.
      </p>
      {!isAuthenticated && status !== "loading" ? (
        <Button className="mt-6 h-11 bg-[#0E7C4F] text-white hover:bg-[#0A5F3C]" onClick={openModal}>Entrar</Button>
      ) : status !== "ready" ? (
        <p className="mt-6 text-sm text-[#66736B]" role="status">Preparando tu cuenta…</p>
      ) : (
        <>
          {address && <p className="mt-4 font-mono text-xs text-[#66736B]" title={address}>{formatShortStellarGAddress(address)}</p>}
          {receipt ? <div className="mt-5"><StellarReceipt data={receipt} onDone={() => setSelected(null)} doneLabel="Volver a Actividad" /></div> : <>
          {error && (
            <div className="mt-5 rounded-[8px] bg-[#FDECEE] p-4 text-sm text-[#9B1C1C]" role="alert">
              <p>{error}</p>
              <button type="button" className="mt-2 min-h-10 font-semibold underline" onClick={() => setRefresh((value) => value + 1)}>Reintentar</button>
            </div>
          )}
          {loading && !items.length && <p className="mt-6 text-sm text-[#66736B]" role="status">Cargando movimientos…</p>}
          {!loading && !error && !items.length && (
            <p className="mt-6 rounded-[8px] border border-[#DDE4DC] bg-white p-4 text-sm text-[#66736B]">
              {nextCursor ? "No hay movimientos de USDC en este bloque. Puedes cargar los anteriores." : "Todavía no hay movimientos de USDC. Tus envíos y depósitos aparecerán aquí."}
            </p>
          )}
          <ul className="mt-5 space-y-3" aria-label="Movimientos de USDC" aria-busy={loading}>
            {items.map((item) => {
              const sent = item.direction === "sent";
              const counterparty = sent ? item.to : item.from;
              const Icon = sent ? ArrowUpRight : ArrowDownLeft;
              return (
                <li key={item.id} className="rounded-[8px] border border-[#DDE4DC] bg-white p-4">
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#0E7C4F]" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#17211B]">{item.kind === "claimable" ? "Saldo reclamable" : item.kind === "conversion" ? (sent ? "Pago en ruta · Salida" : "Pago en ruta · Entrada") : sent ? "Enviaste" : "Recibiste"} {formatUsdcAmount(item.amount)} USDC</p>
                      <p className="mt-1 text-xs text-[#66736B]" title={counterparty}>{sent ? "Para" : "De"} {formatShortStellarGAddress(counterparty)}</p>
                      <time dateTime={item.createdAt} className="mt-1 block text-xs text-[#66736B]">
                        {new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}
                      </time>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-[#0E7C4F]">{item.kind === "claimable" ? "Creado" : "Confirmado"}</span>
                  </div>
                  {item.memo && <p className="mt-3 break-words text-xs text-[#66736B]">Memo: {item.memo}</p>}
                  {item.kind === "claimable" && <p className="mt-3 text-xs text-[#66736B]">Fondos reservados para reclamar. Revisa el estado actual en el explorador.</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4">
                    {item.kind !== "conversion" && <button type="button" className="min-h-10 text-sm font-semibold text-[#6D45B8] underline" onClick={() => setSelected(item)}>Ver comprobante</button>}
                    <a href={stellarTransactionUrl(item.txHash)} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center text-sm font-semibold text-[#0E7C4F] underline">Ver en Stellar Expert</a>
                  </div>
                </li>
              );
            })}
          </ul>
          {nextCursor && <Button type="button" variant="outline" className="mt-4 h-11 w-full" disabled={loading} onClick={() => setCursor(nextCursor)}>{loading ? "Cargando…" : "Cargar anteriores"}</Button>}
          </>}
        </>
      )}
    </div>
  );
}
