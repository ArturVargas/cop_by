import { readBytes } from "../body";
import { RampError } from "../errors";

export type PodsClientConfig = { apiKey?: string; baseUrl?: string; fetcher?: typeof fetch; timeoutMs?: number };
export function invalidPods(): never { throw new RampError("PODS_INVALID_RESPONSE", "La respuesta de Pods no coincide con el contrato esperado.", 502); }
export function podsObject(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return invalidPods(); return value as Record<string, unknown>; }
export function podsText(value: unknown, maximum=256): string { if (typeof value!=="string" || !value || value.length>maximum) return invalidPods(); return value; }
export class PodsClient {
  constructor(private readonly config: PodsClientConfig) {}
  async request(path: string, options: { parameters?: Record<string,string>; body?: unknown } = {}): Promise<Record<string,unknown>> {
    if (!this.config.apiKey) throw new RampError("PROVIDER_NOT_CONFIGURED", "Falta configurar Pods en el servidor.", 503);
    const base = new URL(this.config.baseUrl ?? "https://api.pods.finance");
    if (base.protocol!=="https:" || base.username || base.password || base.search || base.hash) throw new RampError("INVALID_PROVIDER_CONFIG", "La URL de Pods debe ser HTTPS y no contener credenciales.", 503);
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid Pods API path");
    const url=new URL(path,base);for(const [key,value] of Object.entries(options.parameters??{})) url.searchParams.set(key,value);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.config.timeoutMs??12000);
    try {
      const response=await (this.config.fetcher??fetch)(url,{method:options.body===undefined?"GET":"POST",headers:{"x-api-key":this.config.apiKey,Accept:"application/json",...(options.body!==undefined?{"Content-Type":"application/json"}:{})},...(options.body!==undefined?{body:JSON.stringify(options.body)}:{}),cache:"no-store",signal:controller.signal,redirect:"error"});
      let body:Record<string,unknown>;
      try {body=podsObject(JSON.parse(new TextDecoder().decode(await readBytes(response,1_048_576))));}catch{return invalidPods();}
      if(!response.ok){const error=body.error&&typeof body.error==="object"?body.error as Record<string,unknown>:body;const code=typeof error.code==="string"&&/^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:`HTTP_${response.status}`;throw new RampError(`PODS_${code}`,"Pods no pudo completar la solicitud.",response.status===429||response.status>=500?502:422,response.status===429||response.status>=500);}
      return body;
    }catch(error){if(error instanceof RampError)throw error;throw new RampError(controller.signal.aborted?"PODS_TIMEOUT":"PODS_UNAVAILABLE","No pudimos consultar Pods. Reintenta la consulta de estado.",502,true);}finally{clearTimeout(timer);}
  }
}
