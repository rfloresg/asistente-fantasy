import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "../src/db";
import * as s from "../src/db/schema";

let db: Db;
beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema: s });
  await migrate(pg, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  db = pg as unknown as Db;
  await db.insert(s.users).values({ id: 1, name: "Rubén", createdAt: new Date() } as never);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("avisos al móvil", () => {
  it("el aviso del plan: lo más urgente en una línea", async () => {
    const { planPush } = await import("../src/lib/push");
    const m = planPush("KFC Fantasy", [
      { tipo: "aviso", prioridad: 0, titulo: "Parón" },
      { tipo: "pujar", prioridad: 3, titulo: "Puja 10 M por Koke" },
      { tipo: "vender", prioridad: 4, titulo: "Vende a Pablo" },
      { tipo: "proteger", prioridad: 1, titulo: "Blinda a Hancko" },
      { tipo: "pujar", prioridad: 3, titulo: "Hecha", hecho: true },
    ]);
    expect(m.title).toBe("🧠 Tu plan en KFC Fantasy");
    expect(m.body).toBe("Blinda a Hancko · Puja 10 M por Koke y 1 más");
  });

  it("sin llaves no envía nada ni falla", async () => {
    const { pushToUser } = await import("../src/lib/push");
    await db.insert(s.pushDevices).values({ userId: 1, kind: "web", endpoint: "https://push.example/a", p256dh: "x", auth: "y", createdAt: new Date() });
    expect(await pushToUser(db, 1, { title: "t", body: "b" })).toBe(0);
    await db.delete(s.pushDevices);
  });

  it("Firebase: firma, envía al token y borra los que ya no existen", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    vi.stubEnv("FCM_SERVICE_ACCOUNT", Buffer.from(JSON.stringify({ client_email: "bot@x.iam.gserviceaccount.com", private_key: privateKey, project_id: "fantasy" })).toString("base64"));
    vi.stubEnv("APP_URL", "https://app.test");
    const sent: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: unknown }) => {
      const body = String(init.body);
      sent.push({ url, body });
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
      if (body.includes("viejo")) return new Response('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', { status: 404 });
      return new Response("{}");
    }));
    await db.insert(s.pushDevices).values([
      { userId: 1, kind: "fcm", endpoint: "token-bueno", createdAt: new Date() },
      { userId: 1, kind: "fcm", endpoint: "token-viejo", createdAt: new Date() },
    ]);
    const { pushToUser } = await import("../src/lib/push");
    expect(await pushToUser(db, 1, { title: "Hola", body: "Puja ya", url: "/aciertos" })).toBe(1);
    const fcm = sent.filter((x) => x.url.includes("fcm.googleapis.com/v1/projects/fantasy/messages:send"));
    expect(fcm).toHaveLength(2);
    expect(JSON.parse(fcm[0].body).message).toMatchObject({ token: "token-bueno", notification: { title: "Hola", body: "Puja ya" }, data: { url: "https://app.test/aciertos" } });
    const left = await db.select().from(s.pushDevices);
    expect(left.map((d) => d.endpoint)).toEqual(["token-bueno"]);
    expect(left[0].lastOkAt).not.toBeNull();
  });
});
