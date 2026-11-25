import { NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { loadStellarActivity } from "@/lib/stellar-activity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address")?.trim().toUpperCase() ?? "";
  const cursor = searchParams.get("cursor") ?? undefined;
  if (!StrKey.isValidEd25519PublicKey(address) || (cursor !== undefined && !/^\d{1,30}$/.test(cursor))) {
    return NextResponse.json({ error: "Cuenta Stellar o cursor inválido." }, { status: 400 });
  }
  try {
    return NextResponse.json(await loadStellarActivity(address, cursor), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "No pudimos cargar tu actividad. Intenta de nuevo." }, { status: 502 });
  }
}
