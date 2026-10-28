import { NextResponse } from "next/server";
import { COOKIE, expectedCookie } from "@/middleware";

export async function POST(req: Request) {
  const form = await req.formData();
  const next = String(form.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const url = new URL(req.url);
  if (!process.env.APP_PASSWORD || form.get("password") !== process.env.APP_PASSWORD) {
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(safeNext)}`, url), 303);
  }
  const res = NextResponse.redirect(new URL(safeNext, url), 303);
  res.cookies.set(COOKIE, await expectedCookie(), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
  return res;
}
