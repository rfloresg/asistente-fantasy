// Repartir las ligas del Espía entre varias pasadas a la vez sin romper sesiones de LaLiga:
// la sesión de un usuario se renueva en cada uso, así que todas las ligas que comparten usuario
// (el que lee la liga o alguien con plan) van siempre a la misma pasada. Estable: grupo → su usuario
// más bajo, módulo el número de pasadas (no cambia de pasada aunque entren ligas nuevas).

export interface ShardTarget { leagueId: string; reader: number | null; planUsers: { userId: number | null }[] }

export function shardOf<T extends ShardTarget>(targets: T[], n: number): Map<T, number> {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const add = (x: number) => { if (!parent.has(x)) parent.set(x, x); };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb)); // la raíz es siempre el id más bajo
  };
  const usersOf = (t: T) => [t.reader, ...t.planUsers.map((u) => u.userId)].map((u) => u ?? 0); // 0 = modo antiguo
  for (const t of targets) {
    const us = usersOf(t);
    us.forEach(add);
    us.slice(1).forEach((u) => union(us[0], u));
  }
  return new Map(targets.map((t) => [t, find(usersOf(t)[0]) % n]));
}

// "1/4" → { i: 1, n: 4 }; sin valor o mal escrito → una sola pasada
export function parseShard(s: string | undefined): { i: number; n: number } {
  const m = /^(\d+)\/(\d+)$/.exec(s?.trim() ?? "");
  const i = Number(m?.[1]), n = Number(m?.[2]);
  return m && n > 0 && i < n ? { i, n } : { i: 0, n: 1 };
}
