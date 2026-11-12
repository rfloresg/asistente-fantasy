// Amigos en la misma liga: si dos usuarios de la app juegan en la misma liga, el plan de cada uno
// no debe mandarles a los dos a por el mismo jugador (se pisan y suben el precio entre ellos).
// Lo que ya tiene un amigo en su último plan pasa al final de la cola del tuyo; si aun así sale, se avisa.

import type { Accion } from "./plan";

export const FRIENDS_WINDOW_H = 20; // planes de los amigos de las últimas 20 h

export interface FriendPlan { name: string; acciones: Accion[] }

// Jugador → nombre del amigo que ya va a por él (pujar o clausular)
export function friendClaims(plans: FriendPlan[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of plans) {
    for (const a of p.acciones) {
      if ((a.tipo === "pujar" || a.tipo === "clausulazo") && a.playerId && !out.has(a.playerId)) out.set(a.playerId, p.name);
    }
  }
  return out;
}

export const friendNote = (name: string) => ` Ojo: ${name} también lo tiene en su plan; si vais los dos, os pisáis. Habladlo.`;
