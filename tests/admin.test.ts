import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db";
import * as s from "../src/db/schema";
import { digestText, gatherDigest } from "../src/lib/admin";
import { canJoin, seats } from "../src/lib/plazas";

const now = new Date();
let db: Db;

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema: s });
  await migrate(pg, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  db = pg as unknown as Db;
  await db.insert(s.users).values([
    { id: 1, name: "Rubén", telegramId: "1", isAdmin: true, createdAt: new Date("2026-10-01") },
    { id: 2, name: "Ana", telegramId: "2", createdAt: now },
    { id: 3, name: "Bea", telegramId: "3", createdAt: now },
    { id: 4, name: "Caro", telegramId: "4", createdAt: now },
  ]);
  await db.insert(s.laligaSessions).values([
    { userId: 1, refreshEnc: "x", redirect: "r", updatedAt: now },
    { userId: 2, refreshEnc: "x", redirect: "r", updatedAt: now },
    { userId: 3, refreshEnc: "x", redirect: "r", updatedAt: now, lastError: "caducada" },
  ]);
  await db.insert(s.espiaPlans).values({ userId: 2, leagueId: "A", leagueName: "A", createdAt: now, myMoney: 0, acciones: [] });
  await db.insert(s.feedback).values({ userId: 2, name: "Ana", text: "El once mola", createdAt: now });
});
afterEach(() => { delete process.env.MAX_USUARIOS; });

describe("plazas de la beta", () => {
  it("sin MAX_USUARIOS no hay tope", async () => {
    expect(await seats(db)).toEqual({ max: null, used: 1, left: null });
    expect(await canJoin(db, 4)).toBe(true);
  });
  it("con la beta llena, los nuevos no entran; los de antes y el admin sí", async () => {
    process.env.MAX_USUARIOS = "1"; // Ana ocupa la única plaza (el admin no cuenta, la caducada tampoco)
    expect(await canJoin(db, 4)).toBe(false);
    expect(await canJoin(db, 3)).toBe(true); // ya tenía sesión: puede volver a conectar
    expect(await canJoin(db, 1)).toBe(true);
  });
});

describe("parte diario", () => {
  it("cuenta lo importante y lo dice claro", async () => {
    const d = await gatherDigest(db, now);
    expect(d).toMatchObject({ users: 4, connected: 2, expired: ["Bea"], waiting: ["Caro"], plans: 1, noPlan: ["Rubén"] });
    const t = digestText(d);
    expect(t).toContain("2 conectados de 4 usuarios");
    expect(t).toContain("Sesión caducada: Bea");
    expect(t).toContain("<b>Ana</b>: El once mola");
    expect(t).not.toContain("Todo en orden");
  });
});
