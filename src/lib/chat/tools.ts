// Herramientas de solo lectura que el LLM puede usar. Todas leen de la base de datos.
// Las cifras salen ya formateadas para que el modelo no tenga que calcular nada.

import type Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, max, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { players, playerScores, teams } from "@/db/schema";
import { CONFIG } from "@/lib/nota/engine";
import { reasons } from "@/lib/nota/explain";
import { norm } from "@/lib/onces/match";
import { ACTION, money, n1, pct, POS, STATUS } from "@/lib/format";
import { market, playerCard, scoresFor, teamNames } from "@/lib/queries";

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "buscar_jugador",
    description: "Busca jugadores por nombre (sirve un trozo, sin tildes). Devuelve id, equipo, posición, valor y nota.",
    input_schema: {
      type: "object",
      properties: { nombre: { type: "string", description: "Nombre o parte del nombre" } },
      required: ["nombre"],
    },
  },
  {
    name: "ficha_jugador",
    description:
      "Datos completos de un jugador por id: nota y desglose, motivos, valor, tendencia, forma, minutos, % de titular, rivales, valor esperado y pujas máximas.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "varios_jugadores",
    description: "Nota, recomendación, valor, tendencia, forma, % de titular y pujas de varios jugadores a la vez (hasta 30 ids). Úsala para analizar una plantilla o una lista.",
    input_schema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" }, maxItems: 30 } },
      required: ["ids"],
    },
  },
  {
    name: "mercado",
    description:
      "Lista de jugadores con su nota de hoy. Filtra por posición, acción recomendada y precio máximo. Para buscar chollos, fichajes o qué vender.",
    input_schema: {
      type: "object",
      properties: {
        posicion: { type: "string", enum: ["POR", "DEF", "MED", "DEL", "ENT"] },
        accion: { type: "string", enum: ["fichar", "mantener", "vender"] },
        precio_max_millones: { type: "number" },
        orden: { type: "string", enum: ["nota", "forma", "tendencia", "valor"] },
        limite: { type: "integer", minimum: 1, maximum: 15 },
      },
    },
  },
];

type Input = Record<string, unknown>;

async function buscarJugador({ nombre }: Input) {
  const q = norm(String(nombre ?? ""));
  if (!q) return { error: "Falta el nombre" };
  const db = await getDb();
  const [{ d }] = await db.select({ d: max(playerScores.day) }).from(playerScores);
  const rows = await db
    .select({ id: players.id, nickname: players.nickname, pos: players.positionId, status: players.status, team: teams.shortName, nota: playerScores.nota, value: playerScores.value })
    .from(players)
    .leftJoin(teams, eq(teams.id, players.teamId))
    .leftJoin(playerScores, and(eq(playerScores.playerId, players.id), eq(playerScores.day, d ?? "")))
    .where(ne(players.status, "out_of_league"))
    .orderBy(desc(players.marketValue));
  const hits = rows.filter((r) => norm(r.nickname).includes(q)).slice(0, 8);
  return {
    resultados: hits.map((r) => ({
      id: r.id,
      jugador: r.nickname,
      equipo: r.team,
      posicion: POS[r.pos],
      estado: STATUS[r.status] ?? "Disponible",
      valor: money(r.value),
      nota: r.nota,
    })),
  };
}

async function fichaJugador({ id }: Input) {
  const card = await playerCard(String(id ?? ""));
  if (!card) return { error: "No existe ese jugador" };
  const names = await teamNames();
  const { player: p, team, score: s, weeks } = card;
  if (!s) return { jugador: p.nickname, equipo: team, error: "Sin nota hoy" };
  return {
    id: p.id,
    jugador: p.nickname,
    equipo: team,
    posicion: POS[p.positionId],
    estado: STATUS[p.status] ?? "Disponible",
    dia_de_los_datos: s.day,
    nota: s.nota,
    recomendacion: ACTION[s.action],
    motivos: reasons(s, p.status, (tid) => names.get(tid) ?? tid).map((r) => `${r.good ? "+" : "-"} ${r.text}`),
    desglose_percentiles: { forma: s.f, tendencia: s.t, puntos_por_millon: s.p, minutos: s.m, calendario: s.c, resta_por_riesgo: s.r },
    valor: money(s.value),
    cambio_valor_3_dias: pct(s.pct3),
    cambio_valor_7_dias: pct(s.pct7),
    forma_pts_por_partido: n1(s.formAvg),
    media_temporada_pts_por_partido: n1(s.seasonAvg),
    minutos_por_partido: s.minutesAvg === null ? "–" : String(Math.round(s.minutesAvg)),
    titular_probable: s.startProb === null ? "sin dato" : `${s.startProb} %`,
    proximos_rivales: s.nextOpponents.map((o) => `${names.get(o.teamId) ?? o.teamId}${o.home ? " (casa)" : " (fuera)"}`),
    [`valor_esperado_en_${CONFIG.holdDays}_dias`]: money(s.expected),
    puja_maxima_para_especular: s.maxBidSpec ? money(s.maxBidSpec) : "no compensa especular",
    puja_maxima_para_jugar: money(s.maxBidPlay),
    ultimas_jornadas: weeks.slice(0, 5).map((w) => `J${w.week}: ${w.points} pts, ${w.minutes} min`),
  };
}

async function mercadoTool(i: Input) {
  const posIdx = POS.indexOf(String(i.posicion ?? ""));
  const { day, rows } = await market(
    {
      pos: posIdx > 0 ? posIdx : undefined,
      action: typeof i.accion === "string" ? i.accion : undefined,
      maxValue: typeof i.precio_max_millones === "number" ? i.precio_max_millones * 1e6 : undefined,
      order: (["nota", "forma", "tendencia", "valor"].includes(String(i.orden)) ? i.orden : "nota") as "nota",
    },
    Math.min(Math.max(Number(i.limite) || 10, 1), 15),
  );
  return {
    dia_de_los_datos: day,
    jugadores: rows.map(({ id, nickname, team, position, status, s }) => ({
      id,
      jugador: nickname,
      equipo: team,
      posicion: POS[position],
      estado: STATUS[status] ?? "Disponible",
      nota: s.nota,
      recomendacion: ACTION[s.action],
      valor: money(s.value),
      cambio_valor_7_dias: pct(s.pct7),
      forma_pts_por_partido: n1(s.formAvg),
      titular_probable: s.startProb === null ? "sin dato" : `${s.startProb} %`,
      puja_maxima_para_jugar: s.action === "fichar" ? money(s.maxBidPlay) : "no recomendado fichar",
    })),
  };
}

async function variosJugadores({ ids }: Input) {
  const list = (Array.isArray(ids) ? ids : []).map(String).slice(0, 30);
  const names = await teamNames();
  const { day, rows } = await scoresFor(list);
  return {
    dia_de_los_datos: day,
    jugadores: rows.map(({ id, nickname, team, position, status, s }) => ({
      id,
      jugador: nickname,
      equipo: team,
      posicion: POS[position],
      estado: STATUS[status] ?? "Disponible",
      ...(s
        ? {
            nota: s.nota,
            recomendacion: ACTION[s.action],
            motivos: reasons(s, status, (tid) => names.get(tid) ?? tid).map((r) => `${r.good ? "+" : "-"} ${r.text}`),
            valor: money(s.value),
            cambio_valor_7_dias: pct(s.pct7),
            forma_pts_por_partido: n1(s.formAvg),
            titular_probable: s.startProb === null ? "sin dato" : `${s.startProb} %`,
            [`valor_esperado_en_${CONFIG.holdDays}_dias`]: money(s.expected),
            puja_maxima_para_jugar: money(s.maxBidPlay),
            puja_maxima_para_especular: s.maxBidSpec ? money(s.maxBidSpec) : "no compensa especular",
          }
        : { nota: "sin nota hoy" }),
    })),
  };
}

export async function runTool(name: string, input: Input): Promise<unknown> {
  switch (name) {
    case "buscar_jugador":
      return buscarJugador(input);
    case "ficha_jugador":
      return fichaJugador(input);
    case "mercado":
      return mercadoTool(input);
    case "varios_jugadores":
      return variosJugadores(input);
    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}
