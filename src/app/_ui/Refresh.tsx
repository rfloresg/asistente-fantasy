"use client";

// Lanza un plan nuevo y recarga la página cuando llega (tarda 1-2 minutos).

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Refresh({ since }: { since: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function run() {
    setState("busy");
    setMsg("Calculando tu plan con los datos de ahora. Tarda uno o dos minutos.");
    const res = await fetch("/api/actualizar", { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setState("error");
      setMsg(body.error ?? "No se pudo lanzar");
      return;
    }
    const start = Date.now();
    const poll = async () => {
      const { last } = await fetch("/api/actualizar").then((r) => r.json()).catch(() => ({ last: null }));
      if (last && (!since || Date.parse(last) > Date.parse(since))) {
        setState("idle");
        setMsg("");
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

  return (
    <div className="refresh">
      <button type="button" className="primary" onClick={run} disabled={state === "busy"} style={{ marginTop: 0 }}>
        {state === "busy" ? "Actualizando…" : "Actualizar plan"}
      </button>
      {msg && <p className={state === "error" ? "bad" : "small"} role="status" style={{ margin: "8px 0 0" }}>{msg}</p>}
    </div>
  );
}
