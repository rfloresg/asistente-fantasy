// Lista de espera con la base de datos de pruebas (PGlite en memoria)
import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { laligaSessions, users } from "../src/db/schema";

const sent: string[] = [];
vi.mock("../src/lib/espia/telegram", () => ({ sendMessage: async (chat: string) => { sent.push(chat); } }));

describe("lista de espera", () => {
  it("apunta por orden, avisa a tantos como plazas y no repite", async () => {
    const db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "drizzle" });
    const { joinWaitlist, inviteWaiting, waiting } = await import("../src/lib/espera");
    process.env.MAX_USUARIOS = "1";
    const mk = async (name: string, tg: string) => (await db.insert(users).values({ name, telegramId: tg, createdAt: new Date() }).returning())[0].id;
    const a = await mk("A", "100"), b = await mk("B", "200"), c = await mk("C", "300");
    expect(await joinWaitlist(db as never, b)).toBe(1);
    expect(await joinWaitlist(db as never, c)).toBe(2);
    expect(await joinWaitlist(db as never, b)).toBe(2); // ya estaba
    // Una plaza y la ocupa A: nadie
    await db.insert(laligaSessions).values({ userId: a, refreshEnc: "x", redirect: "x", updatedAt: new Date() } as never);
    expect(await inviteWaiting(db as never)).toBe(0);
    // Sube a 2 plazas: avisa a B (el primero)
    process.env.MAX_USUARIOS = "2";
    expect(await inviteWaiting(db as never)).toBe(1);
    expect(sent).toEqual(["200"]);
    expect(await waiting(db as never)).toBe(1);
    expect(await inviteWaiting(db as never)).toBe(1); // B aún no ha conectado: sigue habiendo plaza, va C
    expect(sent).toEqual(["200", "300"]);
    expect(await inviteWaiting(db as never)).toBe(0);
    delete process.env.MAX_USUARIOS;
  });
});
