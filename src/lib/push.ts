// Notificaciones del móvil. Dos vías, un solo "avisar a este usuario":
// - Web Push (la app instalada desde la web: iPhone y Android). Llaves VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
// - Firebase (la app de Android que se descarga). Cuenta de servicio en FCM_SERVICE_ACCOUNT (JSON o base64).
// Si faltan las llaves, no se envía nada y no falla nada. Los dispositivos que ya no existen se borran.

import { createSign } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import type { Db } from "@/db";
import { pushDevices } from "@/db/schema";

export interface PushMessage {
  title: string;
  body: string;
  url?: string; // dónde abrir al tocarla (ruta de la web)
  tag?: string; // misma tag = reemplaza a la anterior
}

export const vapidPublicKey = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "";

let vapidReady: boolean | null = null;
function vapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  const pub = vapidPublicKey();
  const priv = process.env.VAPID_PRIVATE_KEY;
  vapidReady = !!(pub && priv);
  if (vapidReady) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://asistente-fantasy.vercel.app", pub, priv!);
  return vapidReady;
}

interface ServiceAccount { client_email: string; private_key: string; project_id: string }

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const txt = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const sa = JSON.parse(txt) as ServiceAccount;
    return sa.client_email && sa.private_key && sa.project_id ? sa : null;
  } catch {
    return null;
  }
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

// Token de acceso de Google (OAuth con JWT firmado por la cuenta de servicio), 1 h
let fcmToken: { token: string; exp: number } | null = null;
async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (fcmToken && fcmToken.exp - 60 > now) return fcmToken.token;
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = b64url(createSign("RSA-SHA256").update(`${head}.${claim}`).sign(sa.private_key));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${sig}` }),
  });
  if (!r.ok) throw new Error(`Google OAuth ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  fcmToken = { token: j.access_token, exp: now + j.expires_in };
  return j.access_token;
}

export const pushConfigured = () => ({ web: vapid(), fcm: !!serviceAccount() });

type Device = typeof pushDevices.$inferSelect;
type Result = "ok" | "gone" | "error" | "skip";

async function sendWeb(d: Device, m: PushMessage, appUrl: string): Promise<Result> {
  if (!vapid() || !d.p256dh || !d.auth) return "skip";
  try {
    await webpush.sendNotification(
      { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
      JSON.stringify({ title: m.title, body: m.body, url: new URL(m.url ?? "/", appUrl).toString(), tag: m.tag }),
      { TTL: 12 * 3600 },
    );
    return "ok";
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return code === 404 || code === 410 ? "gone" : "error";
  }
}

async function sendFcm(d: Device, m: PushMessage, appUrl: string): Promise<Result> {
  const sa = serviceAccount();
  if (!sa) return "skip";
  try {
    const token = await fcmAccessToken(sa);
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token: d.endpoint,
          notification: { title: m.title, body: m.body },
          data: { url: new URL(m.url ?? "/", appUrl).toString() },
          android: { priority: "high", notification: { tag: m.tag, color: "#3DEB8C" } },
        },
      }),
    });
    if (r.ok) return "ok";
    const txt = await r.text();
    return r.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(txt) ? "gone" : "error";
  } catch {
    return "error";
  }
}

// Avisa en todos los móviles de un usuario. Devuelve cuántos lo recibieron.
export async function pushToUser(db: Db, userId: number, m: PushMessage): Promise<number> {
  const appUrl = process.env.APP_URL || "https://asistente-fantasy.vercel.app";
  const devices = await db.select().from(pushDevices).where(eq(pushDevices.userId, userId));
  let ok = 0;
  const gone: number[] = [];
  const now = new Date();
  for (const d of devices) {
    const r = d.kind === "fcm" ? await sendFcm(d, m, appUrl) : await sendWeb(d, m, appUrl);
    if (r === "ok") {
      ok++;
      await db.update(pushDevices).set({ lastOkAt: now }).where(eq(pushDevices.id, d.id));
    }
    if (r === "gone") gone.push(d.id);
  }
  if (gone.length) await db.delete(pushDevices).where(inArray(pushDevices.id, gone));
  return ok;
}

// Lo que se ve en la notificación del plan: lo más urgente, en una línea
export function planPush(league: string, acciones: { titulo?: string; texto?: string; prioridad: number; tipo: string; hecho?: boolean }[]): PushMessage {
  const todo = acciones.filter((a) => !a.hecho && a.tipo !== "aviso" && a.tipo !== "alinear").sort((a, b) => a.prioridad - b.prioridad);
  const body = todo.length ? todo.slice(0, 2).map((a) => a.titulo ?? (a.texto ?? "").replace(/<[^>]+>/g, "").slice(0, 60)).join(" · ") + (todo.length > 2 ? ` y ${todo.length - 2} más` : "") : "Revisa tu once y el mercado.";
  return { title: `🧠 Tu plan en ${league}`, body, url: "/", tag: `plan:${league}` };
}
