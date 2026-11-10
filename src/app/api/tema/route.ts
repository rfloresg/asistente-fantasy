// Tema de la web y la app: oscuro (por defecto) o claro. Se guarda en una cookie de este navegador.
import { NextResponse } from "next/server";
import { THEME_COOKIE, type Theme } from "@/lib/tema";

export async function POST(req: Request) {
  const form = await req.formData();
  const tema: Theme = form.get("tema") === "claro" ? "claro" : "oscuro";
  const back = new URL(req.headers.get("referer") ?? "/conectar", req.url);
  const res = NextResponse.redirect(new URL(back.pathname + back.search, req.url), 303);
  res.cookies.set(THEME_COOKIE, tema, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 * 2 });
  return res;
}
