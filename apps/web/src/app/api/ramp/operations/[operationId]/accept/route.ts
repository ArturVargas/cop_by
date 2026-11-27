import { handleRampRequest } from "@/lib/ramp/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ operationId: string }> }) {
  const { operationId } = await context.params;
  return handleRampRequest(request, "accept", operationId);
}
