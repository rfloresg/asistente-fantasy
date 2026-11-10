// Entrar desde el bot: el enlace personal que da /start en privado (firmado, 15 min).
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { checkBotLogin } from "@/lib/grupo";
import { userForTelegram } from "@/lib/users";
import { COOKIE, expectedCookie } from "@/middleware";
import { USER_COOKIE, USER_COOKIE_OPTS, userCookieValue } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? "";
  const next = g("next").startsWith("/") && !g("next").startsWith("//") ? g("next") : "/";
  if (!/^\d+$/.test(g("tg")) || !checkBotLogin(g("tg"), g("exp"), g("n"), g("sig"))) {
    return NextResponse.redirect(new URL("/login?error=enlace", url), 303);
  }
  const db = await getDb();
  const isAdminNow = !!process.env.APP_PASSWORD && (req.headers.get("cookie") ?? "").includes(`${COOKIE}=${await expectedCookie()}`);
  const user = await userForTelegram(db, g("tg"), g("n"), isAdminNow);
  const res = NextResponse.redirect(new URL(next, url), 303);
  res.cookies.set(USER_COOKIE, userCookieValue(user.id), USER_COOKIE_OPTS);
  return res;
}
