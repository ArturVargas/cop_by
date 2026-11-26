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
  const { address, status, openModal, authError, bootstrapping, bootstrapError, ensureAccountAndTrustline, approveDeviceWithPasskey } = useStellarWallet();
  const [accessError, setAccessError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ address: string; items: StellarActivityItem[]; nextCursor: string | null } | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StellarActivityItem | null>(null);
  const items = history?.address === address ? history.items : [];
  const nextCursor = history?.address === address ? history.nextCursor : null;

  useEffect(() => { setCursor(null); setHistory(null); setSelected(null); setError(null); setAccessError(null); }, [address]);

  const receipt = useMemo<StellarReceiptData | null>(() => selected && history?.address === address ? {
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
  } : null, [address, history?.address, selected]);

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
      <Link href="/" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-wallet-muted">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
      </Link>
      <div className="mt-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-wallet-ink">Actividad</h1>
        {status === "ready" && (
          <Button type="button" variant="outline" disabled={loading} onClick={() => { setCursor(null); setRefresh((value) => value + 1); }}>
            {loading ? "Actualizando…" : "Actualizar"}
          </Button>
        )}
      </div>
      <p className="mt-2 text-sm text-wallet-muted">
        Movimientos de USDC en Stellar {CAVOS_NETWORK === "testnet" ? "Testnet · fondos de prueba" : "Mainnet"}.
      </p>
      {status !== "ready" ? (
        <section className="mt-6 space-y-3 rounded-[8px] border border-wallet-border bg-wallet-card p-4">
          {status === "loading" ? <p className="text-sm text-wallet-muted" role="status">Abriendo tu cuenta…</p>
          : status === "unconfigured" ? <p className="text-sm text-wallet-negative" role="alert">El acceso a la cuenta no está disponible en este momento. Intenta abrir la app más tarde.</p>
          : status === "signed-out" ? <>
            <p className="text-sm text-wallet-muted">Entra a tu cuenta para consultar sus movimientos.</p>
            {authError && <p className="text-sm text-wallet-negative" role="alert">{authError}</p>}
            <Button className="h-11 w-full" onClick={openModal}>Entrar</Button>
          </> : status === "needs-device-approval" || status === "needs-relogin" ? <>
            <h2 className="font-semibold text-wallet-ink">Confirma que eres tú</h2>
            <p className="text-sm text-wallet-muted">Vuelve a entrar para abrir tu cuenta en este dispositivo y consultar tu historial.</p>
            <Button className="h-11 w-full" onClick={openModal}>Volver a entrar</Button>
            {status === "needs-device-approval" && approveDeviceWithPasskey && <Button variant="outline" className="h-11 w-full" onClick={() => {
              setAccessError(null);
              void approveDeviceWithPasskey().catch(() => setAccessError("No pudimos confirmar el dispositivo. Reintenta o vuelve a entrar."));
            }}>Usar clave de acceso</Button>}
          </> : status === "undeployed" ? <>
            <h2 className="font-semibold text-wallet-ink">Prepara tu cuenta Stellar</h2>
            <p className="text-sm text-wallet-muted">Tu cuenta necesita activarse antes de consultar movimientos.</p>
            {bootstrapError && <p className="text-sm text-wallet-negative" role="alert">{bootstrapError}</p>}
            <Button className="h-11 w-full" disabled={bootstrapping} onClick={() => void ensureAccountAndTrustline().catch(() => undefined)}>{bootstrapping ? "Preparando cuenta…" : "Preparar cuenta"}</Button>
          </> : <>
            <p className="text-sm text-wallet-negative" role="alert">No pudimos abrir tu cuenta. Vuelve a entrar para intentarlo de nuevo.</p>
            <Button className="h-11 w-full" onClick={openModal}>Volver a entrar</Button>
          </>}
          {accessError && <p className="text-sm text-wallet-negative" role="alert">{accessError}</p>}
        </section>
      ) : (
        <>
          {address && <p className="mt-4 font-mono text-xs text-wallet-muted" title={address}>{formatShortStellarGAddress(address)}</p>}
          {receipt ? <div className="mt-5"><StellarReceipt data={receipt} onDone={() => setSelected(null)} doneLabel="Volver a Actividad" /></div> : <>
          {error && (
            <div className="mt-5 rounded-[8px] bg-wallet-negative-soft p-4 text-sm text-wallet-negative" role="alert">
              <p>{error}</p>
              <button type="button" className="mt-2 min-h-11 font-semibold underline" onClick={() => setRefresh((value) => value + 1)}>Reintentar</button>
            </div>
          )}
          {loading && !items.length && <p className="mt-6 text-sm text-wallet-muted" role="status">Cargando movimientos…</p>}
          {!loading && !error && !items.length && (
            <p className="mt-6 rounded-[8px] border border-wallet-border bg-wallet-card p-4 text-sm text-wallet-muted">
              {nextCursor ? "No hay movimientos de USDC en este bloque. Puedes cargar los anteriores." : "Todavía no hay movimientos de USDC. Tus envíos y depósitos aparecerán aquí."}
            </p>
          )}
          <ul className="mt-5 space-y-3" aria-label="Movimientos de USDC" aria-busy={loading}>
            {items.map((item) => {
              const sent = item.direction === "sent";
              const counterparty = sent ? item.to : item.from;
              const Icon = sent ? ArrowUpRight : ArrowDownLeft;
              return (
                <li key={item.id} className="rounded-[8px] border border-wallet-border bg-wallet-card p-4">
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-wallet-brand" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-wallet-ink">{item.kind === "claimable" ? "Saldo reclamable" : item.kind === "conversion" ? (sent ? "Pago en ruta · Salida" : "Pago en ruta · Entrada") : sent ? "Enviaste" : "Recibiste"} {formatUsdcAmount(item.amount)} USDC</p>
                      <p className="mt-1 text-xs text-wallet-muted" title={counterparty}>{sent ? "Para" : "De"} {formatShortStellarGAddress(counterparty)}</p>
                      <time dateTime={item.createdAt} className="mt-1 block text-xs text-wallet-muted">
                        {new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}
                      </time>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-wallet-brand">{item.kind === "claimable" ? "Creado" : "Confirmado"}</span>
                  </div>
                  {item.memo && <p className="mt-3 break-words text-xs text-wallet-muted">Memo: {item.memo}</p>}
                  {item.kind === "claimable" && <p className="mt-3 text-xs text-wallet-muted">Fondos reservados para reclamar. Revisa el estado actual en el explorador.</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4">
                    {item.kind !== "conversion" && <button type="button" className="min-h-11 text-sm font-semibold text-wallet-purple underline" onClick={() => setSelected(item)}>Ver comprobante</button>}
                    <a href={stellarTransactionUrl(item.txHash)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-wallet-brand underline">Ver en Stellar Expert</a>
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
