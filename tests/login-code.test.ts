import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db";
import * as s from "../src/db/schema";
import { approveCode, claimCode, CODE_TTL_MS, createCode, validCode } from "../src/lib/login-code";

let db: Db;
beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema: s });
  await migrate(pg, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  db = pg as unknown as Db;
});

describe("entrar con un toque", () => {
  it("pendiente hasta que confirmas en Telegram; luego entra una sola vez", async () => {
    const code = await createCode(db);
    expect(validCode(code)).toBe(true);
    expect(await claimCode(db, code)).toEqual({ state: "pending" });
    expect(await approveCode(db, code, "123", "Rubén")).toBe(true);
    expect(await claimCode(db, code)).toEqual({ state: "ok", telegramId: "123", name: "Rubén" });
    expect(await claimCode(db, code)).toEqual({ state: "expired" }); // ya gastado
  });
  it("no se puede confirmar dos veces ni con otro Telegram", async () => {
    const code = await createCode(db);
    expect(await approveCode(db, code, "123", "Rubén")).toBe(true);
    expect(await approveCode(db, code, "999", "Otro")).toBe(false);
    expect(await claimCode(db, code)).toMatchObject({ telegramId: "123" });
  });
  it("caduca a los 10 minutos", async () => {
    const t0 = new Date("2026-11-10T10:00:00Z");
    const code = await createCode(db, t0);
    const late = new Date(t0.getTime() + CODE_TTL_MS + 1000);
    expect(await approveCode(db, code, "123", "Rubén", late)).toBe(false);
    expect(await claimCode(db, code, late)).toEqual({ state: "expired" });
  });
  it("códigos raros, fuera", async () => {
    expect(validCode("ABC")).toBe(false);
    expect(await claimCode(db, "../../x")).toEqual({ state: "expired" });
    expect(await approveCode(db, "nope", "1", "x")).toBe(false);
  });
});
