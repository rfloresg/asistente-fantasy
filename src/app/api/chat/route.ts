import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { chatUsage } from "@/db/schema";
import { logActivity } from "@/lib/actividad";
import { ask, type ChatTurn } from "@/lib/chat/agent";
import { currentUser } from "@/lib/session";

const DAILY = Number(process.env.CHAT_DAILY_LIMIT ?? 15); // preguntas al día por persona (el administrador, sin límite)

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Claude puede tardar unos segundos

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { messages?: ChatTurn[] } | null;
  const history = (body?.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10) // contexto corto: más barato
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!history.length || history.at(-1)!.role !== "user") {
    return NextResponse.json({ error: "Falta la pregunta" }, { status: 400 });
  }
  const user = await currentUser().catch(() => null);
  if (user && !user.isAdmin) {
    const db = await getDb();
    const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
    await db.insert(chatUsage).values({ userId: user.id, day, count: 1 })
      .onConflictDoUpdate({ target: [chatUsage.userId, chatUsage.day], set: { count: sql`${chatUsage.count} + 1` } });
    const [row] = await db.select({ count: chatUsage.count }).from(chatUsage).where(and(eq(chatUsage.userId, user.id), eq(chatUsage.day, day)));
    if ((row?.count ?? 0) > DAILY) {
      return NextResponse.json({ error: `Has llegado a las ${DAILY} preguntas de hoy. Mañana más.` }, { status: 429 });
    }
    await logActivity(db, user.id, "pregunta", history.at(-1)!.content);
  }
  try {
    return NextResponse.json(await ask(history, { userId: user?.id ?? null }));
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
