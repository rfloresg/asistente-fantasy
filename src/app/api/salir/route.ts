// Entrada que ya no vale (usuario borrado, o la contraseña de administrador sin administrador):
// borra las cookies y lleva a la pantalla de entrar.
import { NextResponse } from "next/server";
import { COOKIE } from "@/middleware";
import { USER_COOKIE } from "@/lib/session";

export async function GET(req: Request) {
  const next = new URL(req.url).searchParams.get("next") ?? "/";
  const res = NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next.startsWith("/") ? next : "/")}`, req.url), 303);
  res.cookies.delete(USER_COOKIE);
  res.cookies.delete(COOKIE);
  return res;
}
