import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db";
import * as s from "../src/db/schema";
import { activateGroup, telegramLeagues } from "../src/lib/grupo-activar";

const now = new Date();
let db: Db;

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema: s });
  await migrate(pg, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  db = pg as unknown as Db;
  await db.insert(s.users).values([
    { id: 1, name: "Ana", telegramId: "111", createdAt: now },
    { id: 2, name: "Bea", telegramId: "222", createdAt: now },
    { id: 3, name: "Caro", telegramId: "333", createdAt: now },
  ]);
  await db.insert(s.laligaSessions).values([
    { userId: 1, refreshEnc: "x", redirect: "r", updatedAt: now },
    { userId: 2, refreshEnc: "y", redirect: "r", updatedAt: now },
    { userId: 3, refreshEnc: "z", redirect: "r", updatedAt: now, lastError: "caducada" },
  ]);
  await db.insert(s.leagues).values([{ leagueId: "A", name: "KFC", createdAt: now }, { leagueId: "B", name: "Otra", createdAt: now }]);
  await db.insert(s.memberships).values([
    { userId: 1, leagueId: "A", createdAt: now }, { userId: 2, leagueId: "A", createdAt: now }, { userId: 2, leagueId: "B", createdAt: now },
    { userId: 3, leagueId: "A", createdAt: now },
  ]);
});

describe("activar el Espía desde el grupo", () => {
  it("sabe qué ligas tiene quien mete el bot; sin sesión válida, ninguna", async () => {
    expect((await telegramLeagues(db, "111"))?.leagues.map((l) => l.name)).toEqual(["KFC"]);
    expect((await telegramLeagues(db, "222"))?.leagues.map((l) => l.name)).toEqual(["KFC", "Otra"]);
    expect(await telegramLeagues(db, "333")).toBeNull();
    expect(await telegramLeagues(db, "999")).toBeNull();
  });
  it("activa la liga en el grupo y otro no se la puede quitar", async () => {
    expect(await activateGroup(db, 1, "A", "-100")).toEqual({ ok: true, name: "KFC" });
    expect(await activateGroup(db, 2, "A", "-200")).toMatchObject({ ok: false });
    expect(await activateGroup(db, 1, "B", "-100")).toMatchObject({ ok: false }); // B no es suya
    const [a] = await db.select().from(s.leagues).where((await import("drizzle-orm")).eq(s.leagues.leagueId, "A"));
    expect(a).toMatchObject({ groupChatId: "-100", groupOwnerId: 1, active: true });
  });
  it("su dueño sí la puede cambiar de grupo", async () => {
    expect(await activateGroup(db, 1, "A", "-300")).toMatchObject({ ok: true });
  });
});
