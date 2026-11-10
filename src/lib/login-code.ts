// Entrar con un toque (como al vincular una tele): la página pide un código, abre el bot con él, el bot
// pregunta "¿Eres tú?" y, al confirmar, la página que va preguntando recibe la sesión. Sirve también
// en la app instalada del iPhone, que no comparte la sesión con Safari.

import { randomBytes } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { loginCodes } from "@/db/schema";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_PREFIX = "entrar_"; // /start entrar_<código>
const CODE_RE = /^[0-9a-f]{32}$/;

export const validCode = (c: string | null | undefined): c is string => !!c && CODE_RE.test(c);
const fresh = (createdAt: Date, now: Date) => now.getTime() - createdAt.getTime() < CODE_TTL_MS;

export async function createCode(db: Db, now = new Date()): Promise<string> {
  const code = randomBytes(16).toString("hex");
  await db.delete(loginCodes).where(lt(loginCodes.createdAt, new Date(now.getTime() - 24 * 3600e3))); // limpieza
  await db.insert(loginCodes).values({ code, createdAt: now });
  return code;
}

// El bot, cuando confirmas: lo ata a tu Telegram. false si no existe, caducó o ya se usó.
export async function approveCode(db: Db, code: string, telegramId: string, name: string, now = new Date()): Promise<boolean> {
  if (!validCode(code)) return false;
  const [row] = await db.select().from(loginCodes).where(eq(loginCodes.code, code));
  if (!row || row.usedAt || row.telegramId || !fresh(row.createdAt, now)) return false;
  await db.update(loginCodes).set({ telegramId, name }).where(and(eq(loginCodes.code, code), isNull(loginCodes.telegramId)));
  return true;
}

export type ClaimResult = { state: "ok"; telegramId: string; name: string } | { state: "pending" } | { state: "expired" };

// La página, preguntando: si ya está confirmado, lo gasta (una sola vez) y devuelve quién es.
export async function claimCode(db: Db, code: string, now = new Date()): Promise<ClaimResult> {
  if (!validCode(code)) return { state: "expired" };
  const [row] = await db.select().from(loginCodes).where(eq(loginCodes.code, code));
  if (!row || row.usedAt || !fresh(row.createdAt, now)) return { state: "expired" };
  if (!row.telegramId) return { state: "pending" };
  const used = await db.update(loginCodes).set({ usedAt: now }).where(and(eq(loginCodes.code, code), isNull(loginCodes.usedAt))).returning();
  if (!used.length) return { state: "expired" };
  return { state: "ok", telegramId: row.telegramId, name: row.name ?? "Mánager" };
}
