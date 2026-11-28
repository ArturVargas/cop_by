import { handleRampRequest } from "@/lib/ramp/api";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{destinationId:string}>}) { const {destinationId}=await context.params; return handleRampRequest(request,"tucop_destination_get",destinationId); }
