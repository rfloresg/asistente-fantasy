// Conectar con LaLiga, paso 2: el usuario pega la dirección de jwt.ms. Nunca vemos su contraseña.
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { ConnectError, finishConnect } from "@/lib/conectar";
import { dispatchPlan } from "@/lib/github";
import { currentUser } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Entra primero en la web" }, { status: 401 });
    const { pasted } = (await req.json().catch(() => ({}))) as { pasted?: string };
    const out = await finishConnect(await getDb(), user.id, pasted ?? "");
    await dispatchPlan().catch(() => null); // su primer plan, ya
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof ConnectError ? msg : `Error al guardar la sesión: ${msg}` }, { status: e instanceof ConnectError ? 400 : 500 });
  }
}
