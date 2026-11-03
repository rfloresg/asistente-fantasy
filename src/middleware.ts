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

// Cookie de usuario (entrar con Telegram): "id.firma", firmada con SESSION_KEY (igual que src/lib/session.ts)
async function validUser(raw: string | undefined) {
  if (!raw || !process.env.SESSION_KEY) return false;
  const [id, sig] = raw.split(".");
  if (!id || !sig) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(process.env.SESSION_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(id));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64 === sig;
}

// Páginas y llamadas que no piden entrar: la entrada, el login con Telegram y el bot
const PUBLIC = ["/login", "/api/login", "/api/auth/telegram", "/api/auth/bot", "/api/telegram"];

export async function middleware(req: NextRequest) {
  if (!process.env.APP_PASSWORD && !process.env.SESSION_KEY) return NextResponse.next(); // local, sin nada configurado
  const { pathname } = req.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();
  if (await validUser(req.cookies.get("fa_user")?.value)) return NextResponse.next();
  if (process.env.APP_PASSWORD && req.cookies.get(COOKIE)?.value === (await expectedCookie())) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

// El icono, el manifiesto y el service worker se sirven sin contraseña (los pide el móvil al instalar)
export const config = { matcher: ["/((?!_next/|favicon.ico|icons/|manifest.webmanifest|sw.js).*)"] };
