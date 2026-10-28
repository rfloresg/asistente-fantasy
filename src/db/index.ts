import path from "node:path";
import * as schema from "./schema";

// Con DATABASE_URL usa Postgres (Neon, Supabase...). Sin ella, PGlite en ./.data.
// PGlite: un solo proceso a la vez (para la ingesta, apaga `npm run dev`).

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function create() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const client = postgres(url, { max: 5, prepare: false, onnotice: () => {} });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return { db, close: () => client.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = path.join(process.cwd(), ".data", "pglite");
  (await import("node:fs")).mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, close: () => client.close() };
}

type Conn = Awaited<ReturnType<typeof create>>;
export type Db = Conn["db"];

const g = globalThis as unknown as { __conn?: Promise<Conn> };

export function getConn(): Promise<Conn> {
  g.__conn ??= create();
  return g.__conn;
}

export async function getDb(): Promise<Db> {
  return (await getConn()).db;
}
