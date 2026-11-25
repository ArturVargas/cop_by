"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareableReceipt, type StellarReceiptData } from "@/components/shareable-receipt";
import { createReceiptImageBlob, downloadReceiptFile, shareReceiptFile } from "@/lib/receipt-share";
import { stellarTransactionUrl } from "@/lib/stellar-activity";

export function StellarReceipt({ data, onDone, doneLabel }: {
  data: StellarReceiptData;
  onDone: () => void;
  doneLabel: string;
}) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<Blob | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setPreparing(true);
    setExportError(false);
    if (receiptRef.current) {
      void createReceiptImageBlob(receiptRef.current)
        .then((blob) => { if (!cancelled) setImage(blob); })
        .catch(() => { if (!cancelled) setExportError(true); })
        .finally(() => { if (!cancelled) setPreparing(false); });
    }
    return () => { cancelled = true; };
  }, [data, retry]);

  const share = async () => {
    if (!image || sharing) return;
    setSharing(true);
    setFeedback(null);
    try {
      // The image is ready before the click, preserving Web Share user activation.
      const outcome = await shareReceiptFile(image, "png");
      setFeedback(outcome === "shared" ? "Comprobante compartido." : "Comprobante descargado.");
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setFeedback("No se pudo compartir. Puedes descargar la imagen.");
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div ref={receiptRef} className="mx-auto w-full max-w-[360px]">
        <ShareableReceipt data={data} />
      </div>
      <div className="flex flex-col gap-2">
        <Button type="button" className="h-11 w-full bg-[#6D45B8] text-white hover:bg-[#56359A]" disabled={!image || sharing} onClick={() => void share()}>
          <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
          {preparing ? "Preparando comprobante…" : sharing ? "Compartiendo…" : "Compartir comprobante"}
        </Button>
        <Button type="button" variant="outline" className="h-11 w-full" disabled={!image || sharing} onClick={() => {
          if (!image) return;
          try { downloadReceiptFile(image, "png"); setFeedback("Comprobante descargado."); }
          catch { setFeedback("No se pudo descargar la imagen. Intenta de nuevo."); }
        }}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Descargar imagen
        </Button>
        {exportError && <p className="text-sm text-[#9B1C1C]" role="alert">No se pudo preparar la imagen. <button type="button" className="min-h-10 font-semibold underline" onClick={() => setRetry((value) => value + 1)}>Reintentar</button></p>}
        <p className="text-sm text-[#66736B]" role="status" aria-live="polite">{feedback}</p>
      </div>
      <a href={stellarTransactionUrl(data.txHash)} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center text-sm font-semibold text-[#0E7C4F] underline">Ver en Stellar Expert</a>
      <Button type="button" variant="outline" className="h-11 w-full" onClick={onDone}>{doneLabel}</Button>
    </div>
  );
}
