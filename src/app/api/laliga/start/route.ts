// Conectar con LaLiga, paso 1: prepara el login oficial (PKCE) y devuelve su dirección.
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { startConnect } from "@/lib/conectar";
import { currentUser } from "@/lib/session";

export async function POST() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Entra primero en la web" }, { status: 401 });
    return NextResponse.json({ url: await startConnect(await getDb(), user.id) });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo empezar: ${String(e instanceof Error ? e.message : e)}` }, { status: 500 });
  }
}
