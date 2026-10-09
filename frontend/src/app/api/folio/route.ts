import { NextResponse } from "next/server";
import { getFolio } from "@/lib/folio";
import { rateLimited } from "@/lib/ratelimit";

// Public Folio + ASP set so the browser can build Merkle paths locally (the server never learns which leaf is yours).
export async function GET(req: Request) {
  if (rateLimited(req, "folio", 60)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    return NextResponse.json(await getFolio());
  } catch (e: any) {
    return NextResponse.json({ error: e.shortMessage || e.message }, { status: 503 });
  }
}
