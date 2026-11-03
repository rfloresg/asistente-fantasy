// Enlaza un grupo de Telegram con una de tus ligas: el Espía empieza a publicar ahí.
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { laligaSessions, leagues, memberships } from "@/db/schema";
import { sendMessage } from "@/lib/espia/telegram";
import { groupSig } from "@/lib/grupo";
import { currentUser } from "@/lib/session";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Entra primero en la web" }, { status: 401 });
  const { chat, sig, leagueId } = (await req.json().catch(() => ({}))) as { chat?: string; sig?: string; leagueId?: string };
  if (!chat || !leagueId || sig !== groupSig(chat)) return NextResponse.json({ error: "Enlace no válido: escribe otra vez /espia en el grupo" }, { status: 400 });

  const db = await getDb();
  const [m] = await db.select().from(memberships).where(and(eq(memberships.userId, user.id), eq(memberships.leagueId, leagueId)));
  if (!m) return NextResponse.json({ error: "Esa liga no es tuya: conéctala primero en Cuenta" }, { status: 403 });
  const [s] = await db.select().from(laligaSessions).where(eq(laligaSessions.userId, user.id));
  if (!s || s.lastError) return NextResponse.json({ error: "Tu sesión de LaLiga no está activa: vuelve a conectar en Cuenta" }, { status: 400 });
  const [l] = await db.select().from(leagues).where(eq(leagues.leagueId, leagueId));
  if (l?.groupChatId && l.groupChatId !== chat && l.groupOwnerId !== user.id) {
    return NextResponse.json({ error: "Esa liga ya tiene el Espía en otro grupo" }, { status: 409 });
  }
  // Otra liga que ya usaba este grupo, lo suelta
  await db.update(leagues).set({ groupChatId: null }).where(eq(leagues.groupChatId, chat));
  await db.update(leagues).set({ groupChatId: chat, groupOwnerId: user.id, active: true }).where(eq(leagues.leagueId, leagueId));
  await sendMessage(chat, `🕵️ <b>Espía activado</b> en ${(l?.name ?? "vuestra liga").replace(/[<>&]/g, "")}. Desde ahora publicaré fichajes, ventas y cláusulas, y un resumen cada mañana.`).catch(() => {});
  return NextResponse.json({ ok: true });
}
