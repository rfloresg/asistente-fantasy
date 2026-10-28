import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  slug: text("slug"),
  badgeUrl: text("badge_url"),
});

export const players = pgTable("players", {
  id: text("id").primaryKey(),
  nickname: text("nickname").notNull(),
  teamId: text("team_id"),
  // 1 portero, 2 defensa, 3 centrocampista, 4 delantero, 5 entrenador
  positionId: integer("position_id").notNull(),
  // ok | injured | doubtful | suspended | out_of_league
  status: text("status").notNull(),
  marketValue: bigint("market_value", { mode: "number" }).notNull(),
  points: integer("points").notNull(),
  averagePoints: real("average_points").notNull(),
  lastSeasonPoints: integer("last_season_points"),
  imageUrl: text("image_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// Valor diario. Viene de la API con todo el histórico de la temporada.
export const playerValues = pgTable(
  "player_values",
  {
    playerId: text("player_id").notNull(),
    day: date("day").notNull(),
    value: bigint("value", { mode: "number" }).notNull(),
    bids: integer("bids").notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.day] })],
);

// Puntos y estadísticas por jornada.
export const playerWeeks = pgTable(
  "player_weeks",
  {
    playerId: text("player_id").notNull(),
    week: integer("week").notNull(),
    points: integer("points").notNull(),
    minutes: integer("minutes").notNull(),
    ideal: boolean("ideal").notNull(),
    // { stat: [valor, puntos] } tal cual lo da la API
    stats: jsonb("stats").$type<Record<string, [number, number]>>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.week] })],
);

export const matches = pgTable("matches", {
  id: text("id").primaryKey(),
  week: integer("week").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  localId: text("local_id").notNull(),
  visitorId: text("visitor_id").notNull(),
  state: integer("state").notNull(),
  localScore: integer("local_score"),
  visitorScore: integer("visitor_score"),
});

export const ingestRuns = pgTable("ingest_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok").notNull().default(false),
  players: integer("players").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  note: text("note"),
});
