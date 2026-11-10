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
import type { LigaSnapshot, LineupSnapshot } from "../lib/plan/snapshot";

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

// Once probable de analiticafantasy (segunda fuente), por jugador y día, con su estado y el motivo.
export const lineupsAf = pgTable(
  "lineups_af",
  {
    playerId: text("player_id").notNull(),
    day: date("day").notNull(),
    afId: text("af_id").notNull(),
    starter: boolean("starter").notNull(),
    prob: integer("prob"),
    status: text("status"), // doubt | injury | sanction
    info: text("info"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
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
    // Puntos esperados por partido en los próximos, y el detalle de cada uno (modelo xP)
    xp: real("xp"),
    xpNext: jsonb("xp_next").$type<{ week: number; teamId: string; home: boolean; pts: number; goalsFor: number; goalsAgainst: number; label: "fácil" | "normal" | "difícil" }[]>().notNull().default([]),
    pStart: real("p_start"),
    // Cada fuente de onces probables y el motivo de duda/lesión/sanción si lo hay
    startSources: jsonb("start_sources").$type<{ source: string; starter: boolean; prob: number }[]>().notNull().default([]),
    statusInfo: text("status_info"),
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

// Plan del día (solo para ti): acciones recomendadas por liga. La web enseña el último.
export const espiaPlans = pgTable("espia_plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"), // de quién es el plan (null = planes de antes de los usuarios)
  leagueId: text("league_id").notNull(),
  leagueName: text("league_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  scoreDay: date("score_day"),
  myMoney: bigint("my_money", { mode: "number" }).notNull(),
  acciones: jsonb("acciones").$type<{ tipo: string; prioridad: number; jugador?: string; playerId?: string; texto: string; titulo?: string; detalle?: string; key?: string; hecho?: boolean; pendiente?: string }[]>().notNull(),
  closeAt: timestamp("close_at", { withTimezone: true }), // cierre del mercado de la próxima jornada
  lineup: jsonb("lineup").$type<LineupSnapshot>(),
  liga: jsonb("liga").$type<LigaSnapshot>(),
});

// Movimientos del plan que marcaste como hechos en la web (botón "Hecho"). Valen 48 h.
export const espiaDone = pgTable(
  "espia_done",
  {
    leagueId: text("league_id").notNull(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.key] })],
);

// ---------- Usuarios (servicio para varias ligas) ----------

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  telegramId: text("telegram_id").unique(), // también es su chat privado con el bot
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }), // última vez que abrió la web (se apunta cada 30 min como mucho)
});

// Sesión de LaLiga de cada usuario: el refresh token, cifrado (SESSION_KEY). Nunca la contraseña.
export const laligaSessions = pgTable("laliga_sessions", {
  userId: integer("user_id").primaryKey(),
  refreshEnc: text("refresh_enc").notNull(),
  redirect: text("redirect").notNull(), // con qué dirección de vuelta se inició (hace falta para renovar)
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  lastError: text("last_error"),
});

// Inicios de sesión a medias (PKCE): caducan a los 15 min
export const loginAttempts = pgTable("login_attempts", {
  state: text("state").primaryKey(),
  verifier: text("verifier").notNull(),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// Ligas que sigue el Espía. groupOwnerId: la sesión con la que se lee para el grupo de Telegram.
export const leagues = pgTable("leagues", {
  leagueId: text("league_id").primaryKey(),
  name: text("name").notNull(),
  groupChatId: text("group_chat_id"),
  groupOwnerId: integer("group_owner_id"),
  active: boolean("active").notNull().default(true),
  // Ajustes del grupo (los cambia quien lo activó): enseñar el dinero estimado y avisar de subidas de cláusula
  showMoney: boolean("show_money").notNull().default(false),
  showRaises: boolean("show_raises").notNull().default(false),
  // Liga Premium (de pago): hay capitán, banquillo y más formaciones. Lo detecta el Espía o lo marca un miembro en Cuenta
  premium: boolean("premium").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// Quién está en qué liga y si quiere su plan privado
export const memberships = pgTable(
  "memberships",
  {
    userId: integer("user_id").notNull(),
    leagueId: text("league_id").notNull(),
    plan: boolean("plan").notNull().default(true),
    dinero: boolean("dinero").notNull().default(true), // modo dinero: especular y vender a los que van a bajar
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.leagueId] })],
);

// Preguntas al chat por usuario y día (cada pregunta cuesta dinero de la API de Anthropic)
export const chatUsage = pgTable(
  "chat_usage",
  {
    userId: integer("user_id").notNull(),
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

// Opiniones que mandan los usuarios por el bot (/opinion). Le llegan al administrador por Telegram.
export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// Lo que hace cada usuario (para Administración): visitas a la web, Hecho, preguntas, Actualizar plan.
// Se borra a los 30 días.
export const activity = pgTable("activity", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  kind: text("kind").notNull(), // visita | hecho | pregunta | actualizar
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// Entrar en la web o en la app con un toque: la página crea un código, el bot lo confirma y la página
// (que va preguntando) recibe la sesión. Caduca a los 10 minutos y sirve una sola vez.
export const loginCodes = pgTable("login_codes", {
  code: text("code").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  telegramId: text("telegram_id"),
  name: text("name"),
  usedAt: timestamp("used_at", { withTimezone: true }),
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
