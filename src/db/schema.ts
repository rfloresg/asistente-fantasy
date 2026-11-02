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

// Nota Fantasy de cada jugador y día. Se guarda para validar con lo que pasó después.
export const playerScores = pgTable(
  "player_scores",
  {
    playerId: text("player_id").notNull(),
    day: date("day").notNull(),
    nota: integer("nota").notNull(),
    f: integer("f").notNull(),
    t: integer("t").notNull(),
    p: integer("p").notNull(),
    m: integer("m").notNull(),
    c: integer("c").notNull(),
    r: integer("r").notNull(),
    value: bigint("value", { mode: "number" }).notNull(),
    formAvg: real("form_avg"),
    minutesAvg: real("minutes_avg"),
    startProb: integer("start_prob"),
    seasonAvg: real("season_avg"),
    pct3: real("pct3"),
    pct7: real("pct7"),
    dailyRate: real("daily_rate"),
    ptsPerM: real("pts_per_m"),
    nextOpponents: jsonb("next_opponents").$type<{ teamId: string; home: boolean }[]>().notNull(),
    calendarDifficulty: real("calendar_difficulty"),
    expected: bigint("expected", { mode: "number" }).notNull(),
    maxBidSpec: bigint("max_bid_spec", { mode: "number" }),
    maxBidPlay: bigint("max_bid_play", { mode: "number" }).notNull(),
    action: text("action").$type<"fichar" | "mantener" | "vender">().notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.day] })],
);

// Once probable por jugador y día (futbolfantasy).
export const lineups = pgTable(
  "lineups",
  {
    playerId: text("player_id").notNull(),
    day: date("day").notNull(),
    ffId: text("ff_id").notNull(),
    starter: boolean("starter").notNull(),
    prob: integer("prob"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.day] })],
);

// Secretos de la app (p. ej. sesión de LaLiga, que se renueva en cada uso).
export const appSecrets = pgTable("app_secrets", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// Espía: actividades de la liga ya procesadas (para no repetir avisos).
export const espiaEvents = pgTable(
  "espia_events",
  {
    leagueId: text("league_id").notNull(),
    activityId: text("activity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }), // null = vista al activar, no enviada
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.activityId] })],
);

// Espía: último resumen diario enviado por liga.
export const espiaState = pgTable("espia_state", {
  leagueId: text("league_id").primaryKey(),
  lastSummaryDay: date("last_summary_day"),
  // Puntos por equipo en el último resumen, para sacar los de la jornada
  points: jsonb("points").$type<Record<string, number>>(),
});

// Espía: última cláusula vista de cada jugador de la liga (para detectar subidas)
export const espiaClauses = pgTable(
  "espia_clauses",
  {
    leagueId: text("league_id").notNull(),
    playerId: text("player_id").notNull(),
    teamId: text("team_id").notNull(),
    clause: bigint("clause", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.playerId] })],
);

// Espía: subidas de cláusula detectadas. cost = lo que pagó el dueño (la mitad de la subida)
export const espiaRaises = pgTable("espia_raises", {
  id: serial("id").primaryKey(),
  leagueId: text("league_id").notNull(),
  teamId: text("team_id").notNull(),
  playerId: text("player_id").notNull(),
  increase: bigint("increase", { mode: "number" }).notNull(),
  cost: bigint("cost", { mode: "number" }).notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
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
