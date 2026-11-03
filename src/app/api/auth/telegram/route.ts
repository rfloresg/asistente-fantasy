// Vuelta del botón "Iniciar sesión con Telegram": crea o encuentra tu usuario y te deja dentro.
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { COOKIE, expectedCookie } from "@/middleware";
import { USER_COOKIE, userCookieValue } from "@/lib/session";
import { verifyTelegramLogin } from "@/lib/telegram-auth";
import { userForTelegram } from "@/lib/users";

const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 90 };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = Object.fromEntries(url.searchParams);
  const next = q.next && q.next.startsWith("/") && !q.next.startsWith("//") ? q.next : "/";
  delete q.next;
  const tg = process.env.TELEGRAM_BOT_TOKEN ? verifyTelegramLogin(q, process.env.TELEGRAM_BOT_TOKEN) : null;
  if (!tg) return NextResponse.redirect(new URL("/login?error=telegram", url), 303);

  const db = await getDb();
  const name = [tg.first_name, tg.last_name].filter(Boolean).join(" ") || tg.username || "Mánager";
  const isAdminNow = !!process.env.APP_PASSWORD && (req.headers.get("cookie") ?? "").includes(`${COOKIE}=${await expectedCookie()}`);
  const user = await userForTelegram(db, tg.id, name, isAdminNow);
  const res = NextResponse.redirect(new URL(user.isAdmin ? next : next === "/" ? "/conectar" : next, url), 303);
  res.cookies.set(USER_COOKIE, userCookieValue(user.id), COOKIE_OPTS);
  return res;
}
