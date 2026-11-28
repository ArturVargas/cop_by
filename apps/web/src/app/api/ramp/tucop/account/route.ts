import { handleRampRequest } from "@/lib/ramp/api";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export function GET(request:Request) { return handleRampRequest(request,"tucop_account"); }
