// Ficha de jugador: nota, desglose, motivos, pujas, valor y jornadas.

import { notFound } from "next/navigation";
import { CONFIG } from "@/lib/nota/engine";
import { reasons } from "@/lib/nota/explain";
import { money, n1, notaClass, pct, POS, STATUS } from "@/lib/format";
import { currentLeague, latestPlan } from "@/lib/ligas";
import { advice, ownerOf } from "@/lib/propiedad";
import { playerCard, teamNames } from "@/lib/queries";

export const dynamic = "force-dynamic";

const FACTORS = [
  { key: "f", label: "Puntos esperados", w: CONFIG.weights.form },
  { key: "t", label: "Tendencia de valor", w: CONFIG.weights.trend },
  { key: "p", label: "Pts esperados por millón", w: CONFIG.weights.ppm },
  { key: "m", label: "Minutos", w: CONFIG.weights.minutes },
  { key: "c", label: "Calendario", w: CONFIG.weights.calendar },
] as const;

const LABEL_CLASS: Record<string, string> = { fácil: "up", difícil: "down", normal: "muted" };

function ValueChart({ values }: { values: { day: string; value: number }[] }) {
  if (values.length < 2) return null;
  const W = 600, H = 120, pad = 6;
  const vs = values.map((v) => v.value);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const x = (i: number) => pad + (i / (values.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - 2 * pad);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v.value).toFixed(1)}`).join("");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Valor de mercado de los últimos días">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <p className="muted">
        {values[0].day}: {money(values[0].value)} → {values.at(-1)!.day}: {money(values.at(-1)!.value)} · mín. {money(lo)} · máx. {money(hi)}
      </p>
    </div>
  );
}

export default async function Player({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { current, user } = await currentLeague();
  const [card, names, plan] = await Promise.all([playerCard(id), teamNames(), current ? latestPlan(current.id, user?.id) : null]);
  if (!card) notFound();
  const { player: p, team, score: s, values, weeks } = card;
  const why = s ? reasons(s, p.status, (tid) => names.get(tid) ?? tid) : [];

  return (
    <main>
      <div className="head" style={{ marginTop: 12 }}>
        {s && <span className={`${notaClass(s.nota)} big`}>{s.nota}</span>}
        <div>
          <h1>{p.nickname}</h1>
          <div className="muted">
            {team} · {POS[p.positionId]} · {p.points} pts ({n1(p.averagePoints)} de media)
            {STATUS[p.status] && <> · <span className="bad">{STATUS[p.status]}</span></>}
          </div>
        </div>
      </div>

      {!s ? (
        <p className="muted">Sin nota para este jugador.</p>
      ) : (
        <>
          <div className="grid">
            <div className="card"><div className="k">Recomendación{plan?.liga?.owners ? ` en ${plan.leagueName}` : ""}</div><div className="v">{advice(ownerOf(plan?.liga, id), s.action, plan?.acciones ?? [], id).label}</div></div>
            <div className="card"><div className="k">Pts esperados por partido</div><div className="v">{s.xp === null ? "–" : n1(s.xp)}</div></div>
            <div className="card"><div className="k">Titular probable</div><div className="v">{s.startProb !== null ? `${s.startProb} %` : s.pStart !== null ? `${Math.round(s.pStart * 100)} %` : "Sin dato"}</div>{s.startProb === null && s.pStart !== null && <div className="small">por sus últimos minutos</div>}</div>
            <div className="card"><div className="k">Valor hoy</div><div className="v">{money(s.value)}</div></div>
            <div className="card"><div className="k">Esperado en {CONFIG.holdDays} días</div><div className="v">{money(s.expected)}</div></div>
            <div className="card"><div className="k">Puja máx. para especular</div><div className="v">{s.maxBidSpec ? money(s.maxBidSpec) : "No compensa"}</div></div>
            <div className="card"><div className="k">Puja máx. para jugar</div><div className="v">{money(s.maxBidPlay)}</div></div>
          </div>

          {s.xpNext.length > 0 && (
            <>
              <h2>Próximos partidos</h2>
              <ul className="rule fixtures">
                {s.xpNext.map((m) => (
                  <li key={m.week}>
                    <div>
                      <b>J{m.week} · {names.get(m.teamId) ?? m.teamId}</b> <span className="muted">{m.home ? "en casa" : "fuera"}</span>
                      <div className="small">Goles esperados: {n1(m.goalsFor)} a favor, {n1(m.goalsAgainst)} en contra</div>
                    </div>
                    <div className="fx-right">
                      <span className="fx-pts">{n1(m.pts)} <span className="small">pts</span></span>
                      <span className={`fx-label ${LABEL_CLASS[m.label]}`}>{m.label}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="small">
                Puntos esperados con su probabilidad de ser titular ({s.pStart === null ? "–" : `${Math.round(s.pStart * 100)} %`}), lo que suma por jugar, su parte de los goles de su equipo y la portería, según la fuerza de cada rival.
              </p>
            </>
          )}

          <h2>Por qué esta nota</h2>
          {why.length ? (
            <ul className="reasons">
              {why.map((r) => <li key={r.text} className={r.good ? "good" : "bad"}>{r.text}</li>)}
            </ul>
          ) : (
            <p className="muted">Nada destaca: está en la media de su posición en todo.</p>
          )}

          <h2>Desglose</h2>
          {FACTORS.filter((f) => f.w > 0).map((f) => (
            <div className="bar" key={f.key}>
              <span>{f.label} <span className="muted">{Math.round(f.w * 100)} %</span></span>
              <div className="track"><div className="fill" style={{ width: `${s[f.key]}%` }} /></div>
              <span className="n">{s[f.key]}</span>
            </div>
          ))}
          {s.r > 0 && <p className="bad">Riesgo: −{s.r}</p>}
          <p className="muted">
            Percentil dentro de su posición (100 = el mejor). Valor: {pct(s.pct3)} en 3 días, {pct(s.pct7)} en 7.
            Rivales: {s.nextOpponents.map((o) => `${names.get(o.teamId) ?? o.teamId}${o.home ? "" : " (fuera)"}`).join(", ") || "–"}.
          </p>
        </>
      )}

      <h2>Valor de mercado</h2>
      <ValueChart values={values} />

      <h2>Jornadas</h2>
      <div className="wrap">
        <table>
          <thead><tr><th>Jornada</th><th className="n">Puntos</th><th className="n">Minutos</th></tr></thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week}><td>{w.week}</td><td className="n">{w.points}</td><td className="n">{w.minutes}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
