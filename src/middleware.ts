// Contraseña de acceso a toda la web (APP_PASSWORD). Sin ella definida, la web es abierta (local).
import { NextResponse, type NextRequest } from "next/server";

export const COOKIE = "fa_session";

async function sign(value: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(process.env.APP_PASSWORD ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  // base64url sin Buffer (el middleware corre en el runtime Edge)
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function expectedCookie() {
  return sign("ok");
}

export async function middleware(req: NextRequest) {
  if (!process.env.APP_PASSWORD) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  if (req.cookies.get(COOKIE)?.value === (await expectedCookie())) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

// El icono, el manifiesto y el service worker se sirven sin contraseña (los pide el móvil al instalar)
export const config = { matcher: ["/((?!_next/|favicon.ico|icons/|manifest.webmanifest|sw.js).*)"] };
