// Administrador: ver la web como otro usuario (?u=id) o dejar de hacerlo (sin u).
import { NextResponse } from "next/server";
import { currentUser, VIEW_COOKIE } from "@/lib/session";

export async function GET(req: Request) {
  const me = await currentUser();
  const url = new URL(req.url);
  if (!me?.isAdmin) return NextResponse.redirect(new URL("/", url), 303);
  const id = Number(url.searchParams.get("u"));
  const res = NextResponse.redirect(new URL(id ? "/" : "/admin", url), 303);
  if (id && id !== me.id) res.cookies.set(VIEW_COOKIE, String(id), { path: "/", httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", maxAge: 60 * 60 });
  else res.cookies.delete(VIEW_COOKIE);
  return res;
}
