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

export async function shareReceiptImage(blob: Blob) {
  const file = new File([blob], "comprobante-cop-by.png", { type: "image/png" });

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
  link.download = "comprobante-cop-by.png";
  link.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}
