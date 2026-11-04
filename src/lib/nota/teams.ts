// Fuerza de cada equipo: un modelo de goles (Poisson) con ataque y defensa por equipo y ventaja de jugar en casa.
// Parte de lo que vale su plantilla (el Barça es fuerte aunque encaje goles) y se ajusta con los resultados
// de la temporada, pesando más los partidos recientes. Función pura.
//
// Goles esperados del local:     media · casa · ataque(local) · defensa(visitante)
// Goles esperados del visitante: media / casa · ataque(visitante) · defensa(local)
// ataque > 1 marca más de lo normal; defensa > 1 encaja más de lo normal.

export interface TeamMatch {
  week: number;
  date: Date;
  localId: string;
  visitorId: string;
  state: number;
  localScore: number | null;
  visitorScore: number | null;
}

export interface Fixture {
  week: number;
  teamId: string; // rival
  home: boolean;
  goalsFor: number; // goles esperados de este equipo
  goalsAgainst: number; // goles esperados en contra
}

export interface TeamModel {
  mu: number; // goles por equipo y partido en la liga
  home: number; // ventaja de casa (multiplica en casa y divide fuera)
  ratings: Map<string, { att: number; def: number }>;
  next: Map<string, Fixture[]>; // próximos partidos de cada equipo, por fecha
  played: Map<string, { week: number; goalsFor: number; goalsAgainst: number }[]>; // por jornada
  doneWeeks: Set<number>; // jornadas ya jugadas a esa fecha (para no mirar el futuro al validar)
}

export const TEAM = {
  halfLifeDays: 120, // un partido de hace 4 meses pesa la mitad
  priorMatches: 4, // partidos "de su nivel según la plantilla" que se suman a los reales
  valueSlope: 0.2, // cuánto separa la plantilla: e^(0,2·z), z = valor de plantilla tipificado
  nextMatches: 2,
};

const FINISHED = 7;
const DAY = 864e5;

const madridEnd = (asOf: string) => {
  const d = new Date(`${asOf}T00:00:00+01:00`);
  return new Date(d.getTime() + DAY);
};

export function teamModel(matches: TeamMatch[], asOf: string, squadValue: Map<string, number>): TeamModel {
  const end = madridEnd(asOf);
  const start = new Date(end.getTime() - DAY);
  const done = matches.filter((m) => m.state === FINISHED && m.date < end && m.localScore !== null && m.visitorScore !== null);
  const ids = new Set<string>();
  for (const m of matches) { ids.add(m.localId); ids.add(m.visitorId); }

  // Media de goles y ventaja de casa (con un poco de prior para empezar la temporada)
  const w = (m: TeamMatch) => 0.5 ** ((end.getTime() - m.date.getTime()) / DAY / TEAM.halfLifeDays);
  let sw = 0, hg = 0, ag = 0;
  for (const m of done) { const x = w(m); sw += x; hg += x * m.localScore!; ag += x * m.visitorScore!; }
  const mu = (hg + ag + 2.6 * 10) / (2 * sw + 20); // ~1,3 goles por equipo si no hay datos
  const home = Math.min(1.3, Math.max(1, Math.sqrt((hg + 1.4 * 10) / (ag + 1.15 * 10))));

  // Prior de cada equipo según el valor de su plantilla (tipificado en log)
  const logs = [...ids].map((id) => Math.log(Math.max(1, squadValue.get(id) ?? 0)));
  const known = logs.filter((x) => x > 0);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
  const sd = known.length > 1 ? Math.sqrt(known.reduce((a, b) => a + (b - avg) ** 2, 0) / known.length) || 1 : 1;
  const prior = new Map<string, number>();
  for (const id of ids) {
    const v = squadValue.get(id);
    const z = v && v > 1 ? (Math.log(v) - avg) / sd : 0;
    prior.set(id, Math.exp(TEAM.valueSlope * Math.max(-2.5, Math.min(2.5, z))));
  }

  const att = new Map<string, number>(), def = new Map<string, number>();
  for (const id of ids) { att.set(id, prior.get(id)!); def.set(id, 1 / prior.get(id)!); }
  const K = TEAM.priorMatches;
  for (let it = 0; it < 40; it++) {
    const na = new Map<string, [number, number]>(), nd = new Map<string, [number, number]>();
    for (const id of ids) { na.set(id, [K * mu * prior.get(id)!, K * mu]); nd.set(id, [K * mu / prior.get(id)!, K * mu]); }
    for (const m of done) {
      const x = w(m);
      const L = m.localId, V = m.visitorId;
      // ataque: goles marcados / goles que "tocaban" contra esa defensa
      na.get(L)![0] += x * m.localScore!; na.get(L)![1] += x * mu * home * def.get(V)!;
      na.get(V)![0] += x * m.visitorScore!; na.get(V)![1] += x * (mu / home) * def.get(L)!;
      // defensa: goles encajados / los que "tocaban" contra ese ataque
      nd.get(L)![0] += x * m.visitorScore!; nd.get(L)![1] += x * (mu / home) * att.get(V)!;
      nd.get(V)![0] += x * m.localScore!; nd.get(V)![1] += x * mu * home * att.get(L)!;
    }
    for (const id of ids) { att.set(id, na.get(id)![0] / na.get(id)![1]); def.set(id, nd.get(id)![0] / nd.get(id)![1]); }
    // media geométrica 1 para que "1" sea un equipo normal
    const g = (m: Map<string, number>) => Math.exp([...m.values()].reduce((s, v) => s + Math.log(v), 0) / m.size);
    const ga = g(att), gd = g(def);
    for (const id of ids) { att.set(id, att.get(id)! / ga); def.set(id, def.get(id)! / gd); }
  }

  const ratings = new Map<string, { att: number; def: number }>();
  for (const id of ids) ratings.set(id, { att: att.get(id)!, def: def.get(id)! });

  const next = new Map<string, Fixture[]>();
  const played = new Map<string, { week: number; goalsFor: number; goalsAgainst: number }[]>();
  for (const id of ids) { next.set(id, []); played.set(id, []); }
  // Los que vienen después de esa fecha (aunque hoy ya se hayan jugado: así se valida sin mirar el futuro)
  const isDone = new Set(done);
  const upcoming = matches.filter((m) => m.date >= start && !isDone.has(m)).sort((a, b) => +a.date - +b.date);
  for (const m of upcoming) {
    const hFor = mu * home * att.get(m.localId)! * def.get(m.visitorId)!;
    const aFor = (mu / home) * att.get(m.visitorId)! * def.get(m.localId)!;
    next.get(m.localId)!.push({ week: m.week, teamId: m.visitorId, home: true, goalsFor: hFor, goalsAgainst: aFor });
    next.get(m.visitorId)!.push({ week: m.week, teamId: m.localId, home: false, goalsFor: aFor, goalsAgainst: hFor });
  }
  for (const [id, l] of next) next.set(id, l.slice(0, TEAM.nextMatches));
  for (const m of done) {
    played.get(m.localId)!.push({ week: m.week, goalsFor: m.localScore!, goalsAgainst: m.visitorScore! });
    played.get(m.visitorId)!.push({ week: m.week, goalsFor: m.visitorScore!, goalsAgainst: m.localScore! });
  }
  const doneWeeks = new Set(done.map((m) => m.week));
  return { mu, home, ratings, next, played, doneWeeks };
}

// Goles esperados de un equipo contra un rival medio, en campo neutral (para medir cuánto ayuda el calendario)
export const neutral = (t: TeamModel, id: string) => {
  const r = t.ratings.get(id) ?? { att: 1, def: 1 };
  return { goalsFor: t.mu * r.att, goalsAgainst: t.mu * r.def };
};
