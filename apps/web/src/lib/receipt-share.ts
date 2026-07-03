import { formatPesoAmountFromString } from "@/lib/format-peso";
import type { ShareableReceiptData } from "@/components/shareable-receipt";

export function shouldUseReceiptPdf(isMiniPay: boolean) {
  const flag = process.env.NEXT_PUBLIC_RECEIPT_USE_PDF?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return isMiniPay;
}

function formatAddressPreview(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 7)}...${address.slice(-4)}`;
}

export async function createReceiptImageBlob(element: HTMLElement) {
  const { toPng } = await import("html-to-image");
  const dataUrl = await toPng(element, {
    backgroundColor: "#ffffff",
    cacheBust: true,
    pixelRatio: 2,
  });

  const response = await fetch(dataUrl);
  return response.blob();
}

export async function createReceiptPdfBlob(
  data: ShareableReceiptData,
  txUrl?: string
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ format: "a5", unit: "pt" });
  const margin = 40;
  let y = margin;

  const formattedDate = data.completedAt
    ? new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(data.completedAt))
    : null;
  const amount = formatPesoAmountFromString(data.receivedCopm);
  const destination = data.recipientAddress
    ? data.recipientAlias
      ? `${data.recipientAlias} (${formatAddressPreview(data.recipientAddress)})`
      : formatAddressPreview(data.recipientAddress)
    : "Mi wallet";

  doc.setFillColor(109, 69, 184);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 72, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("COP By", margin, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Comprobante de operación", margin, 50);

  y = 96;
  doc.setTextColor(23, 33, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(data.title, margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(102, 115, 107);
  doc.text(data.amountLabel, margin, y);
  y += 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(14, 124, 79);
  doc.text(`${amount} pesos`, margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 115, 107);
  doc.text("Equivalente en COPm onchain", margin, y);
  y += 28;

  doc.setDrawColor(221, 228, 220);
  doc.setFillColor(247, 248, 245);
  doc.roundedRect(margin, y, doc.internal.pageSize.getWidth() - margin * 2, 120, 6, 6, "FD");

  const boxX = margin + 16;
  let boxY = y + 22;
  doc.setFontSize(9);
  doc.setTextColor(102, 115, 107);
  doc.text(data.variant === "transfer" ? "DESTINATARIO" : "DESTINO", boxX, boxY);
  boxY += 14;
  doc.setFontSize(11);
  doc.setTextColor(23, 33, 27);
  doc.setFont("helvetica", "bold");
  doc.text(destination, boxX, boxY);
  boxY += 22;

  if (formattedDate) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(102, 115, 107);
    doc.text("FECHA", boxX, boxY);
    boxY += 14;
    doc.setFontSize(11);
    doc.setTextColor(23, 33, 27);
    doc.setFont("helvetica", "bold");
    doc.text(formattedDate, boxX, boxY);
    boxY += 22;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 115, 107);
  doc.text("TRANSACCIÓN", boxX, boxY);
  boxY += 14;
  doc.setFontSize(10);
  doc.setTextColor(14, 124, 79);
  doc.setFont("courier", "bold");
  doc.text(data.txHash, boxX, boxY, { maxWidth: doc.internal.pageSize.getWidth() - margin * 2 - 32 });

  y += 140;
  if (txUrl) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(109, 69, 184);
    doc.textWithLink("Ver en explorer", margin, y, { url: txUrl });
  }

  return doc.output("blob");
}

export async function shareReceiptFile(
  blob: Blob,
  kind: "pdf" | "png"
) {
  const extension = kind === "pdf" ? "pdf" : "png";
  const mimeType = kind === "pdf" ? "application/pdf" : "image/png";
  const file = new File([blob], `comprobante-cop-by.${extension}`, { type: mimeType });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: "Comprobante COP By",
    });
    return "shared";
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `comprobante-cop-by.${extension}`;
  link.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}

/** @deprecated Use shareReceiptFile */
export async function shareReceiptImage(blob: Blob) {
  return shareReceiptFile(blob, "png");
}
