// Notificaciones del móvil. POST: guardar este dispositivo (Web Push o token de Firebase).
// DELETE: quitarlo. PUT: mandar una de prueba a tus dispositivos.
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pushDevices } from "@/db/schema";
import { pushToUser } from "@/lib/push";
import { currentUser } from "@/lib/session";

type Body = { kind?: string; endpoint?: string; token?: string; keys?: { p256dh?: string; auth?: string } };

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Entra primero" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const kind = b.kind === "fcm" ? "fcm" : "web";
  const endpoint = kind === "fcm" ? b.token : b.endpoint;
  if (!endpoint || endpoint.length > 2000 || (kind === "web" && (!b.keys?.p256dh || !b.keys?.auth || !/^https:\/\//.test(endpoint)))) {
    return NextResponse.json({ error: "Datos del dispositivo incompletos" }, { status: 400 });
  }
  const db = await getDb();
  const row = { userId: user.id, kind, endpoint, p256dh: b.keys?.p256dh ?? null, auth: b.keys?.auth ?? null, createdAt: new Date() };
  // El mismo móvil puede pasar a otro usuario (cerrar sesión y entrar con otro): manda el último
  await db.insert(pushDevices).values(row).onConflictDoUpdate({ target: pushDevices.endpoint, set: { userId: user.id, p256dh: row.p256dh, auth: row.auth } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Entra primero" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const endpoint = b.token ?? b.endpoint;
  if (endpoint) await (await getDb()).delete(pushDevices).where(and(eq(pushDevices.userId, user.id), eq(pushDevices.endpoint, endpoint)));
  return NextResponse.json({ ok: true });
}

export async function PUT() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Entra primero" }, { status: 401 });
  const n = await pushToUser(await getDb(), user.id, { title: "✅ Avisos activados", body: "Así te llegará el plan, el aviso de pujas y tu jornada.", url: "/", tag: "prueba" });
  return NextResponse.json({ sent: n });
}
