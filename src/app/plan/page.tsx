// Tu plan del día por liga: lo genera el Espía (npm run espia plan) dos veces al día.

import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { espiaPlans } from "@/db/schema";
import { fmtDate, money } from "@/lib/format";

export const dynamic = "force-dynamic";

const TITLES: Record<string, string> = {
  saldo: "Saldo",
  proteger: "Protege a los tuyos",
  alinear: "Alineación",
  aviso: "Atento",
  clausulazo: "Clausulazos",
  pujar: "Pujas en el mercado",
  vender: "Vender",
};

export default async function PlanPage() {
  const db = await getDb();
  const rows = await db.select().from(espiaPlans).orderBy(desc(espiaPlans.createdAt)).limit(50);
  // El más reciente de cada liga (vienen ordenados del más nuevo al más viejo)
  const byLeague = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!byLeague.has(r.leagueId)) byLeague.set(r.leagueId, r);
  const plans = [...byLeague.values()].sort((a, b) => a.leagueName.localeCompare(b.leagueName));

  return (
    <main>
      <h1>Tu plan del día</h1>
      <div className="nav">
        <Link href="/">Mercado</Link>
        <Link href="/plantilla">Mi plantilla</Link>
        <Link href="/chat">Pregúntale al asistente</Link>
      </div>
      {!plans.length && <p className="muted">Aún no hay plan. Se genera a las 9:00 y a las 18:00, o con <code>npm run espia plan</code>.</p>}
      {plans.map((p) => (
        <section key={p.leagueId} className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>{p.leagueName}</h2>
          <p className="muted">
            {fmtDate(p.createdAt)} · tienes {money(p.myMoney)}
            {p.scoreDay ? ` · notas del ${p.scoreDay}` : ""}
          </p>
          {!p.acciones.length && <p>Nada urgente: tu plantilla está bien y no hay gangas claras.</p>}
          {Object.keys(TITLES).map((t) => {
            const xs = p.acciones.filter((a) => a.tipo === t);
            if (!xs.length) return null;
            return (
              <div key={t}>
                <h3>{TITLES[t]}</h3>
                <ul>
                  {xs.map((a, i) => (
                    <li key={i}>
                      {/* Texto generado por el plan (nombres ya escapados, solo <b>) */}
                      <span style={{ whiteSpace: "pre-line" }} dangerouslySetInnerHTML={{ __html: a.texto }} />
                      {a.playerId && <> · <Link href={`/jugador/${a.playerId}`}>ficha</Link></>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      ))}
      <p className="muted">
        El dinero de los rivales es un máximo (no cuenta subidas de cláusula antiguas). Las cifras salen de la nota y de tu liga; las reglas, del manual del meta.
      </p>
    </main>
  );
}
