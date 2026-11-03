"use client";

// Botones que piden un plan nuevo y recargan la página cuando llega (tarda 1-2 minutos):
// "Actualizar plan" y "Hecho" en cada movimiento.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type State = "idle" | "busy" | "error";

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

// Segundos desde que empezó, para enseñar que no se ha quedado parado
export function useElapsed(active: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!active) return setS(0);
    const start = Date.now();
    const t = setInterval(() => setS(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [active]);
  return s;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const stage = (s: number) => (s < 4 ? "Pidiendo el plan…" : s < 25 ? "Preparando el cálculo…" : s < 90 ? "Calculando con tus datos de LaLiga…" : "Casi listo, está tardando un poco más…");

function useReplan(since: string | null, leagueId?: string) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState("");

  async function run(url: string, body?: object) {
    setState("busy");
    setMsg("");
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setState("error");
      setMsg(b.error ?? "No se pudo lanzar");
      return;
    }
    const start = Date.now();
    const poll = async () => {
      // Espera al plan de ESTA liga (el Espía calcula las dos, una detrás de otra)
      const { last } = await fetch(`/api/actualizar${leagueId ? `?liga=${leagueId}` : ""}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ last: null }));
      if (last && (!since || Date.parse(last) > Date.parse(since))) {
        setState("idle");
        router.refresh();
        return;
      }
      if (Date.now() - start > 6 * 60e3) {
        setState("error");
        setMsg("Está tardando más de lo normal. Mira la pestaña Actions de GitHub.");
        return;
      }
      setTimeout(poll, 4_000);
    };
    setTimeout(poll, 12_000);
  }
  return { state, msg, run };
}

export default function Refresh({ since, leagueId }: { since: string | null; leagueId?: string }) {
  const { state, msg, run } = useReplan(since, leagueId);
  const secs = useElapsed(state === "busy");
  return (
    <div className="refresh">
      <button type="button" className="primary with-spin" onClick={() => run("/api/actualizar")} disabled={state === "busy"} style={{ marginTop: 0 }}>
        {state === "busy" ? <><Spinner /> Actualizando · {clock(secs)}</> : "Actualizar plan"}
      </button>
      {state === "busy" && <p className="small" role="status" style={{ margin: "8px 0 0" }}>{stage(secs)}</p>}
      {msg && <p className="bad" role="status" style={{ margin: "8px 0 0" }}>{msg}</p>}
    </div>
  );
}

export function DoneButton({ since, leagueId, k }: { since: string; leagueId: string; k: string }) {
  const { state, msg, run } = useReplan(since, leagueId);
  const secs = useElapsed(state === "busy");
  return (
    <span className="done-btn">
      <button type="button" className="chip with-spin" disabled={state === "busy"} onClick={() => run("/api/hecho", { leagueId, key: k })}>
        {state === "busy" ? <><Spinner /> Comprobando · {clock(secs)}</> : "Hecho"}
      </button>
      {msg && <span className="bad" role="status" style={{ fontSize: 13 }}>{msg}</span>}
    </span>
  );
}
