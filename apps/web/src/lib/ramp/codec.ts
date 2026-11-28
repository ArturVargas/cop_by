import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { RampError } from "./errors";
import type { QuoteRequest } from "./types";

/** One active key. Rotation requires re-encrypting snapshots before removing the old key. */
export class RampCodec {
  private readonly key: Buffer;
  private readonly fingerprintKey: Buffer;
  constructor(encoded: string) {
    this.key = Buffer.from(encoded, "base64");
    if (this.key.length !== 32 || this.key.toString("base64") !== encoded) throw new RampError("INVALID_ENCRYPTION_KEY", "Configura una clave base64 de 32 bytes para ramp.", 503);
    this.fingerprintKey = Buffer.from(hkdfSync("sha256", this.key, Buffer.alloc(0), "copby-ramp-idempotency-v1", 32));
  }
  fingerprint(request: QuoteRequest): string {
    const canonical = request.provider === "tucop" ? [request.provider,request.network,request.sourceAddress,request.amount,request.currency,request.destinationId,request.returnMemo] : [request.provider, request.network, request.sourceAddress, request.amount, request.pixKey, request.thirdParty, request.kycUserId];
    return createHmac("sha256", this.fingerprintKey).update(JSON.stringify(canonical)).digest("hex");
  }
  fingerprintParts(domain: string, parts: unknown[]): string {
    return createHmac("sha256", this.fingerprintKey).update(JSON.stringify([domain, ...parts])).digest("hex");
  }
  encrypt(value: unknown, customer: string, id: string): string {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(JSON.stringify(["ramp-v1", customer, id])));
    const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
  }
  decrypt<T>(encoded: string, customer: string, id: string): T {
    const [version, iv, tag, data, extra] = encoded.split(".");
    if (version !== "v1" || !iv || !tag || !data || extra !== undefined) throw new Error("Invalid ramp snapshot");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64"));
    decipher.setAAD(Buffer.from(JSON.stringify(["ramp-v1", customer, id])));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")) as T;
  }
}
