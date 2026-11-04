// Cosas del administrador: a qué chat de Telegram avisarle y su parte diario.
import { desc, eq, gte } from "drizzle-orm";
import type { Db } from "@/db";
import { espiaPlans, feedback, laligaSessions, leagues, users } from "@/db/schema";
import { seats } from "@/lib/plazas";

export async function adminChat(db: Db) {
  const [admin] = await db.select().from(users).where(eq(users.isAdmin, true)).limit(1);
  return admin?.telegramId ?? process.env.ADMIN_TELEGRAM_ID ?? process.env.ESPIA_PLAN_CHAT ?? null;
}

export interface Digest {
  users: number;
  connected: number;
  expired: string[];
  waiting: string[]; // entraron en el bot pero no han conectado
  newUsers: string[]; // últimas 24 h
  plans: number; // planes hechos en las últimas 24 h
  noPlan: string[]; // conectados sin plan en 26 h
  groups: number;
  seats: { max: number | null; used: number };
  opinions: { name: string; text: string }[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const names = (l: string[]) => l.map(esc).join(", ");

export function digestText(d: Digest): string {
  const lines = [
    "📊 <b>Parte del día</b>",
    "",
    `👥 ${d.connected} conectados de ${d.users} usuarios${d.seats.max ? ` · plazas ${d.seats.used}/${d.seats.max}` : ""}`,
    `📋 ${d.plans} planes en 24 h · 🕵️ ${d.groups} grupos con Espía`,
  ];
  if (d.newUsers.length) lines.push(`🆕 Nuevos: ${names(d.newUsers)}`);
  if (d.waiting.length) lines.push(`⏳ Sin conectar todavía: ${names(d.waiting)}`);
  if (d.expired.length) lines.push(`⚠️ Sesión caducada: ${names(d.expired)}`);
  if (d.noPlan.length) lines.push(`❌ Sin plan en 26 h: ${names(d.noPlan)}. Mira GitHub Actions.`);
  if (d.opinions.length) {
    lines.push("", `💬 <b>Opiniones</b> (${d.opinions.length})`);
    for (const o of d.opinions.slice(0, 5)) lines.push(`• <b>${esc(o.name)}</b>: ${esc(o.text.slice(0, 200))}`);
  }
  if (!d.expired.length && !d.noPlan.length) lines.push("", "✅ Todo en orden.");
  return lines.join("\n");
}

export async function gatherDigest(db: Db, now = new Date()): Promise<Digest> {
  const day = new Date(now.getTime() - 24 * 36e5);
  const [us, ss, ls, plans, ops, s] = await Promise.all([
    db.select().from(users),
    db.select().from(laligaSessions),
    db.select().from(leagues),
    db.select({ userId: espiaPlans.userId, createdAt: espiaPlans.createdAt }).from(espiaPlans)
      .where(gte(espiaPlans.createdAt, new Date(now.getTime() - 26 * 36e5))).orderBy(desc(espiaPlans.createdAt)),
    db.select().from(feedback).where(gte(feedback.createdAt, day)).orderBy(desc(feedback.createdAt)),
    seats(db),
  ]);
  const session = new Map(ss.map((x) => [x.userId, x]));
  const ok = us.filter((u) => session.get(u.id) && !session.get(u.id)!.lastError);
  return {
    users: us.length,
    connected: ok.length,
    expired: us.filter((u) => session.get(u.id)?.lastError).map((u) => u.name),
    waiting: us.filter((u) => !session.get(u.id)).map((u) => u.name),
    newUsers: us.filter((u) => u.createdAt >= day).map((u) => u.name),
    plans: plans.filter((p) => p.createdAt >= day).length,
    noPlan: ok.filter((u) => !plans.some((p) => p.userId === u.id)).map((u) => u.name),
    groups: ls.filter((l) => l.active && l.groupChatId).length,
    seats: { max: s.max, used: s.used },
    opinions: ops.map((o) => ({ name: o.name, text: o.text })),
  };
}

// Para no mandar el parte dos veces el mismo día (se apunta en espia_events con leagueId "admin")
export const digestKey = (now = new Date()) => `parte:${now.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" })}`;
