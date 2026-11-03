import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db";
import * as s from "../src/db/schema";
import { deleteUser } from "../src/lib/borrar";

const now = new Date();
let db: Db;

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema: s });
  await migrate(pg, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  db = pg as unknown as Db;
  await db.insert(s.users).values([
    { id: 1, name: "Ana", telegramId: "1", createdAt: now },
    { id: 2, name: "Bea", telegramId: "2", createdAt: now },
  ]);
  await db.insert(s.laligaSessions).values([
    { userId: 1, refreshEnc: "x", redirect: "r", updatedAt: now },
    { userId: 2, refreshEnc: "y", redirect: "r", updatedAt: now },
  ]);
  await db.insert(s.leagues).values([
    { leagueId: "A", name: "Compartida", groupChatId: "-1", groupOwnerId: 1, createdAt: now },
    { leagueId: "B", name: "Solo Ana", groupChatId: "-2", groupOwnerId: 1, createdAt: now },
    { leagueId: "C", name: "Sin grupo", createdAt: now },
  ]);
  await db.insert(s.memberships).values([
    { userId: 1, leagueId: "A", createdAt: now }, { userId: 2, leagueId: "A", createdAt: now },
    { userId: 1, leagueId: "B", createdAt: now }, { userId: 1, leagueId: "C", createdAt: now },
  ]);
  await db.insert(s.espiaPlans).values([1, 2].map((u) => ({ userId: u, leagueId: "A", leagueName: "A", createdAt: now, myMoney: 0, acciones: [] })));
  await db.insert(s.espiaDone).values([{ leagueId: "A", key: "u1:vender:3", createdAt: now }, { leagueId: "A", key: "u2:vender:3", createdAt: now }]);
  await db.insert(s.chatUsage).values({ userId: 1, day: "2026-11-03", count: 3 });
  await deleteUser(db, 1);
});

describe("borrar mi cuenta", () => {
  it("borra al usuario, su sesión, sus planes, lo hecho y su uso del chat", async () => {
    expect(await db.select().from(s.users)).toHaveLength(1);
    expect((await db.select().from(s.laligaSessions)).map((x) => x.userId)).toEqual([2]);
    expect((await db.select().from(s.espiaPlans)).map((x) => x.userId)).toEqual([2]);
    expect((await db.select().from(s.espiaDone)).map((x) => x.key)).toEqual(["u2:vender:3"]);
    expect(await db.select().from(s.chatUsage)).toHaveLength(0);
    expect((await db.select().from(s.memberships)).map((x) => x.userId)).toEqual([2]);
  });
  it("el grupo compartido pasa a otro miembro; el que era solo suyo se apaga", async () => {
    const l = Object.fromEntries((await db.select().from(s.leagues)).map((x) => [x.leagueId, x]));
    expect(l.A).toMatchObject({ groupOwnerId: 2, groupChatId: "-1", active: true });
    expect(l.B).toMatchObject({ groupOwnerId: null, groupChatId: null, active: false });
    expect(l.C.active).toBe(false);
  });
});
