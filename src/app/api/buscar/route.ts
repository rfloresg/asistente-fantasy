import { NextResponse } from "next/server";
import { norm } from "@/lib/onces/match";
import { candidates } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Búsqueda por nombre para corregir a mano un emparejado de la captura.
export async function GET(req: Request) {
  const q = norm(new URL(req.url).searchParams.get("q") ?? "");
  if (q.length < 2) return NextResponse.json({ resultados: [] });
  const hits = (await candidates()).filter((c) => norm(c.nickname).includes(q)).slice(0, 8);
  return NextResponse.json({ resultados: hits.map((c) => ({ id: c.id, nickname: c.nickname, team: c.teamShort })) });
}
