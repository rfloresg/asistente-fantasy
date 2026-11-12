"use client";
// ⭐ Seguir a un jugador: te avisamos si sale al mercado de tu liga o se libera su cláusula
import { useState } from "react";

export function Seguir({ playerId, on: initial }: { playerId: string; on: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const toggle = async () => {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/seguir", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerId }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { on?: boolean; error?: string } | null;
    if (r?.ok && j) setOn(!!j.on);
    else setErr(j?.error ?? "No se pudo guardar");
    setBusy(false);
  };
  return (
    <span className="seguir">
      <button type="button" className={on ? "chip seguir-on" : "chip"} onClick={toggle} disabled={busy} aria-pressed={on}
        title={on ? "Dejar de seguir" : "Te avisamos si sale al mercado de tu liga o se libera su cláusula"}>
        {on ? "⭐ Siguiendo" : "☆ Seguir"}
      </button>
      {err && <span className="small bad"> {err}</span>}
    </span>
  );
}
