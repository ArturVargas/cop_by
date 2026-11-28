import { handleRampRequest } from "@/lib/ramp/api";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{destinationId:string}>}) { const {destinationId}=await context.params; return handleRampRequest(request,"tucop_destination_confirm",destinationId); }
