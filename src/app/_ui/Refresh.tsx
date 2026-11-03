"use client";

// Botones que piden un plan nuevo y recargan la página cuando llega (tarda 1-2 minutos):
// "Actualizar plan" y "Hecho" en cada movimiento.

import { useRouter } from "next/navigation";
import { useState } from "react";

type State = "idle" | "busy" | "error";

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
      setTimeout(poll, 10_000);
    };
    setTimeout(poll, 30_000);
  }
  return { state, msg, run };
}

export default function Refresh({ since, leagueId }: { since: string | null; leagueId?: string }) {
  const { state, msg, run } = useReplan(since, leagueId);
  return (
    <div className="refresh">
      <button type="button" className="primary" onClick={() => run("/api/actualizar")} disabled={state === "busy"} style={{ marginTop: 0 }}>
        {state === "busy" ? "Actualizando…" : "Actualizar plan"}
      </button>
      {state === "busy" && <p className="small" role="status" style={{ margin: "8px 0 0" }}>Calculando tu plan con los datos de ahora. Tarda uno o dos minutos.</p>}
      {msg && <p className="bad" role="status" style={{ margin: "8px 0 0" }}>{msg}</p>}
    </div>
  );
}

export function DoneButton({ since, leagueId, k }: { since: string; leagueId: string; k: string }) {
  const { state, msg, run } = useReplan(since, leagueId);
  return (
    <span className="done-btn">
      <button type="button" className="chip" disabled={state === "busy"} onClick={() => run("/api/hecho", { leagueId, key: k })}>
        {state === "busy" ? "Comprobando…" : "Hecho"}
      </button>
      {msg && <span className="bad" role="status" style={{ fontSize: 13 }}>{msg}</span>}
    </span>
  );
}
