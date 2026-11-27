import { RampError } from "./errors";
export async function readBytes(message: Request | Response, maximum: number): Promise<Uint8Array> {
  if (Number(message.headers.get("content-length") ?? 0) > maximum) throw new RampError("BODY_TOO_LARGE", "La solicitud supera el tamaño permitido.", 413);
  const reader = message.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.length;
      if (total > maximum) { await reader.cancel(); throw new RampError("BODY_TOO_LARGE", "La solicitud supera el tamaño permitido.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
