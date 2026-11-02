// Lo que la web enseña de cada liga. Lo guarda el Espía junto al plan (npm run espia plan),
// así la web no tiene que llamar a LaLiga con tu sesión.

export interface LigaSnapshot {
  myTeamId: string;
  standing: { teamId: string; manager: string; position: number; previous?: number; points: number; teamValue?: number; money?: number }[];
  activity: { at: string; text: string }[]; // últimos movimientos (HTML con <b>, nombres escapados)
  unlocks: { player: string; manager: string; at: string; clause?: number }[]; // cláusulas que se liberan en 24 h
  injuries: { player: string; manager: string; status: string }[];
  squad?: { id: string; clause?: number; lockedUntil?: string; shielded?: boolean }[]; // tu plantilla
  market?: { id: string; price: number; bids?: number; seller?: string }[]; // en venta en la liga
}

export interface LineupSnapshot {
  formation: string;
  expected: number;
  captainId: string | null;
  starters: { id: string; name: string; positionId: number; expected: number; startProb: number | null; status: string; nota: number | null; hole: boolean }[];
  out: { id: string; name: string }[];
}
