// Entrar desde el bot: el enlace personal que da /start en privado (firmado, 15 min).
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { checkBotLogin } from "@/lib/grupo";
import { COOKIE, expectedCookie } from "@/middleware";
import { USER_COOKIE, userCookieValue } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? "";
  const next = g("next").startsWith("/") && !g("next").startsWith("//") ? g("next") : "/";
  if (!/^\d+$/.test(g("tg")) || !checkBotLogin(g("tg"), g("exp"), g("n"), g("sig"))) {
    return NextResponse.redirect(new URL("/login?error=enlace", url), 303);
  }
  const db = await getDb();
  let [user] = await db.select().from(users).where(eq(users.telegramId, g("tg")));
  if (!user) {
    // Tu usuario de administrador aún sin Telegram: se le asocia (ADMIN_TELEGRAM_ID o ya habías entrado con la contraseña)
    const isAdminNow = !!process.env.APP_PASSWORD && (req.headers.get("cookie") ?? "").includes(`${COOKIE}=${await expectedCookie()}`);
    const [admin] = await db.select().from(users).where(and(eq(users.isAdmin, true), isNull(users.telegramId))).limit(1);
    if (admin && (isAdminNow || process.env.ADMIN_TELEGRAM_ID === g("tg"))) {
      [user] = await db.update(users).set({ telegramId: g("tg") }).where(eq(users.id, admin.id)).returning();
    } else {
      [user] = await db.insert(users).values({ name: g("n") || "Mánager", telegramId: g("tg"), isAdmin: false, createdAt: new Date() }).returning();
    }
  }
  const res = NextResponse.redirect(new URL(next, url), 303);
  res.cookies.set(USER_COOKIE, userCookieValue(user.id), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
  return res;
}
