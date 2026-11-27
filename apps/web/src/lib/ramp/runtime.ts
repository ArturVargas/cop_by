import { getCloudflareContext } from "@opennextjs/cloudflare";
import { RampCodec } from "./codec";
import { RampError } from "./errors";
import { isProvider } from "./domain";
import { MockRampProvider } from "./providers/mock";
import { PodsRampProvider } from "./providers/pods";
import { TucopRampProvider } from "./providers/tucop";
import { D1RampRepository, type RampDatabase } from "./repository";
import { RampService } from "./service";
import { PodsClient } from "./providers/pods-client";
import { PodsKycService } from "./kyc";
import { D1KycRepository } from "./kyc-repository";
import type { RampProvider, RampProviderId, RampRepository } from "./types";

export type RampRuntime = { service: RampService; repository: RampRepository; providers: Partial<Record<RampProviderId, RampProvider>>; defaultProvider: RampProviderId; kyc?: PodsKycService };
export async function createRampRuntime(env: Record<string, string | undefined> = process.env, database?: RampDatabase): Promise<RampRuntime> {
  if (!database) {
    try { const context=await getCloudflareContext({async:true}); database=(context.env as unknown as {RAMP_DB?:RampDatabase}).RAMP_DB; } catch { /* Outside Cloudflare, a binding must be supplied explicitly. */ }
  }
  if (!database || !env.RAMP_ENCRYPTION_KEY) throw new RampError("RAMP_NOT_CONFIGURED", "Configura la base de datos y el cifrado del backend ramp.", 503);
  const defaultProvider = env.RAMP_PROVIDER ?? "pods";
  if (!isProvider(defaultProvider)) throw new RampError("INVALID_PROVIDER_CONFIG", "El proveedor ramp no es válido.", 503);
  const codec = new RampCodec(env.RAMP_ENCRYPTION_KEY);
  const repository = new D1RampRepository(database, codec);
  const providers: RampRuntime["providers"] = {
    pods: new PodsRampProvider({ apiKey: env.PODS_API_KEY, baseUrl: env.PODS_API_BASE_URL, enabled: env.PODS_STELLAR_ENABLED === "true", stellarToken: env.PODS_STELLAR_TOKEN_IN, webhookSecret: env.PODS_WEBHOOK_SECRET }),
    tucop: new TucopRampProvider(),
    ...(env.RAMP_ALLOW_MOCK === "true" ? { mock: new MockRampProvider() } : {}),
  };
  const resolve = (id: RampProviderId) => { const provider = providers[id]; if (!provider) throw new RampError("PROVIDER_DISABLED", "El proveedor está deshabilitado.", 503); return provider; };
  if (!providers[defaultProvider]) throw new RampError("INVALID_PROVIDER_CONFIG", "El proveedor predeterminado está deshabilitado.", 503);
  const kyc = new PodsKycService(new D1KycRepository(database), new PodsClient({apiKey:env.PODS_API_KEY,baseUrl:env.PODS_API_BASE_URL}), codec, {enabled:env.PODS_KYC_ENABLED === "true",redirectUrl:env.PODS_KYC_REDIRECT_URL,allowStellar:env.PODS_STELLAR_ENABLED === "true",sandbox:env.PODS_ENVIRONMENT === "sandbox"});
  return { service: new RampService(repository, resolve, codec), repository, providers, defaultProvider, kyc };
}
