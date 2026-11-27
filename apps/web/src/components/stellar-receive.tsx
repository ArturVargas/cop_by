"use client";

import { useId } from "react";
import { create } from "qrcode";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CAVOS_NETWORK, getStellarUsdc } from "@/lib/cavos-config";
import { formatShortStellarGAddress } from "@/lib/stellar-address";

export function StellarAccountQr({ address }: { address: string }) {
  const titleId = useId();
  const descriptionId = useId();
  const { modules } = create(address, { errorCorrectionLevel: "M" });
  const side = modules.size + 8;
  let path = "";
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (modules.get(row, column)) path += `M${column + 4} ${row + 4}h1v1h-1z`;
    }
  }
  return (
    <svg role="img" aria-labelledby={titleId} aria-describedby={descriptionId} viewBox={`0 0 ${side} ${side}`} width={224} height={224} shapeRendering="crispEdges" className="mx-auto block h-auto w-full max-w-[224px]">
      <title id={titleId}>QR de tu cuenta Stellar</title>
      <desc id={descriptionId}>{address}</desc>
      <rect width={side} height={side} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

export function StellarReceivePanel({ address, copyStatus, onCopy }: {
  address: string;
  copyStatus: "idle" | "ok" | "fail";
  onCopy: () => void;
}) {
  const usdc = getStellarUsdc();
  return (
    <section className="rounded-[8px] border border-wallet-border bg-wallet-card p-4">
      <h2 className="text-base font-semibold text-wallet-ink">Recibir USDC</h2>
      <p className="mt-1 text-sm text-wallet-muted">Escanea el QR o comparte tu cuenta para recibir USDC en Stellar{CAVOS_NETWORK === "testnet" ? " Testnet" : ""}.</p>
      <div className="mt-4"><StellarAccountQr address={address} /></div>
      <p className="mt-3 text-center text-sm font-semibold text-wallet-ink">Stellar {CAVOS_NETWORK === "testnet" ? "Testnet · Fondos de prueba" : "Mainnet"}</p>
      <p className="mt-4 select-all break-all font-mono text-xs leading-5 text-wallet-ink">{address}</p>
      <Button type="button" variant="outline" className="mt-3 min-h-11 w-full" onClick={onCopy}>
        <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
        {copyStatus === "ok" ? "Cuenta copiada" : copyStatus === "fail" ? "Reintentar copia" : "Copiar cuenta"}
      </Button>
      <p className="mt-3 text-xs text-wallet-muted">{CAVOS_NETWORK === "testnet" ? "Usa solo USDC de prueba en Stellar Testnet." : "Envía únicamente USDC de la red Stellar a esta cuenta."}</p>
      <p className="mt-1 break-all font-mono text-xs text-wallet-muted" title={usdc.issuer}>{usdc.code}:{formatShortStellarGAddress(usdc.issuer)}</p>
    </section>
  );
}
