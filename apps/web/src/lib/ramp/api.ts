import { createHash, timingSafeEqual } from "node:crypto";
import { readBytes } from "./body";
import { parseQuoteRequest, validateCustomerId, validateIdempotencyKey } from "./domain";
import { asRampError, RampError } from "./errors";
import { createRampRuntime, type RampRuntime } from "./runtime";
import { publicOperation } from "./service";
import { parseKycApplicant } from "./kyc";

type Action = "providers" | "quotes" | "get" | "accept" | "funding" | "reconcile" | "batch" | "webhook" | "kyc_session" | "kyc_status" | "kyc_reset" | "limits";
type Options = { env?: Record<string, string | undefined>; runtime?: () => RampRuntime | Promise<RampRuntime> };
function authorize(request: Request, env: Record<string, string | undefined>) {
  const token = env.RAMP_INTERNAL_API_TOKEN;
  if (!token || token.length < 32) throw new RampError("RAMP_NOT_CONFIGURED", "Falta configurar la autenticación privada del backend.", 503);
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${token}`))) throw new RampError("UNAUTHORIZED", "Autenticación requerida.", 401);
}
async function json(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new RampError("INVALID_CONTENT_TYPE", "Usa Content-Type: application/json.", 415);
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(await readBytes(request, 16_384))); } catch (error) {
    if (error instanceof RampError) throw error;
    throw new RampError("INVALID_JSON", "Se requiere JSON válido.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RampError("INVALID_REQUEST", "Se requiere un objeto JSON.");
  return body as Record<string, unknown>;
}
function response(body: unknown, status = 200) { return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
export async function handleRampRequest(request: Request, action: Action, operationId?: string, options: Options = {}): Promise<Response> {
  try {
    const env = options.env ?? process.env;
    if (action !== "webhook") authorize(request, env);
    const customer = action === "webhook" || action === "batch" ? null : validateCustomerId(request.headers.get("x-ramp-customer-id"));
    if (["get", "accept", "funding", "reconcile"].includes(action) && (!operationId || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(operationId))) throw new RampError("INVALID_OPERATION_ID", "Identificador de operación no válido.");
    const runtime = await (options.runtime ? options.runtime() : createRampRuntime(env));
    if (["kyc_session", "kyc_status", "kyc_reset", "limits"].includes(action)) {
      if (!runtime.kyc) throw new RampError("KYC_NOT_CONFIGURED", "KYC hosted no está configurado.", 503);
      if (action === "kyc_session") return response(await runtime.kyc.session(customer!,parseKycApplicant(await json(request))),201);
      if (action === "kyc_status") return response(await runtime.kyc.status(customer!));
      if (action === "kyc_reset") return response(await runtime.kyc.reset(customer!));
      return response(await runtime.kyc.limits(customer!));
    }
    if (action === "providers") return response({ providers: Object.values(runtime.providers).map(provider => provider!.capability()) });
    if (action === "webhook") {
      const raw = await readBytes(request, 65_536);
      const provider = runtime.providers.pods;
      if (!provider) throw new RampError("PROVIDER_DISABLED", "Pods no está configurado.", 503);
      const event = provider.verifyWebhook(raw, request.headers);
      await runtime.repository.inbox("pods", event);
      return response({ received: true }, 202);
    }
    if (action === "batch") {
      const body = await json(request), limit = body.limit ?? 5;
      if (Object.keys(body).some(key => key !== "limit") || !Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 20) throw new RampError("INVALID_LIMIT", "El límite debe estar entre 1 y 20.");
      return response(await runtime.service.reconcileBatch(Number(limit)));
    }
    if (action === "quotes") {
      const key = validateIdempotencyKey(request.headers.get("idempotency-key"));
      const input = parseQuoteRequest(await json(request), runtime.defaultProvider);
      if (input.provider === "pods" && runtime.kyc) await runtime.kyc.assertApproved(customer!,input.kycUserId,input.sourceAddress);
      return response(publicOperation(await runtime.service.create(customer!, key, input)), 201);
    }
    if (action === "get") return response(publicOperation(await runtime.service.get(customer!, operationId!)));
    if (action === "accept") return response(publicOperation(await runtime.service.accept(customer!, operationId!)));
    if (action === "reconcile") return response(publicOperation(await runtime.service.reconcile(customer!, operationId!)));
    const body = await json(request);
    if (Object.keys(body).some(key => key !== "txHash") || typeof body.txHash !== "string") throw new RampError("INVALID_REQUEST", "Envía únicamente txHash.");
    return response(publicOperation(await runtime.service.reportFunding(customer!, operationId!, body.txHash)));
  } catch (error) {
    const safe = asRampError(error);
    return response({ error: { code: safe.code, message: safe.message, retryable: safe.retryable } }, safe.status);
  }
}
