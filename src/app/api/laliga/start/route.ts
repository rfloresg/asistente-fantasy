// Conectar con LaLiga, paso 1: prepara el login oficial (PKCE) y devuelve su dirección.
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { startConnect } from "@/lib/conectar";
import { canJoin } from "@/lib/plazas";
import { currentUser } from "@/lib/session";

export async function POST() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Entra primero en la web" }, { status: 401 });
    const db = await getDb();
    if (!(await canJoin(db, user.id))) return NextResponse.json({ error: "La beta está completa ahora mismo. Escribe al bot y te apunta en la lista." }, { status: 403 });
    return NextResponse.json({ url: await startConnect(db, user.id) });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo empezar: ${String(e instanceof Error ? e.message : e)}` }, { status: 500 });
  }
}
