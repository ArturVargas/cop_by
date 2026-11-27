import { handleRampRequest } from "@/lib/ramp/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ operationId: string }> }) {
  const { operationId } = await context.params;
  return handleRampRequest(request, "get", operationId);
}
