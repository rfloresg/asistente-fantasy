"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "../_ui/Refresh";

export default function LeagueRow({ id, name, plan, group }: { id: string; name: string; plan: boolean; group: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function act(action: string) {
    if (action === "dejar" && !window.confirm(`¿Dejar de seguir ${name}? Se quitan su plan y sus avisos.`)) return;
    setBusy(action);
    await fetch("/api/membership", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leagueId: id, action }) });
    setBusy(null);
    router.refresh();
  }
  return (
    <li style={{ padding: "14px 0" }}>
      <b>{name}</b>
      <div className="small">{plan ? "Plan privado activado" : "Sin plan privado"}{group ? " · Espía en el grupo" : ""}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <button type="button" className="chip with-spin" disabled={!!busy} onClick={() => act(plan ? "plan-off" : "plan-on")}>
          {busy?.startsWith("plan") && <Spinner />}{plan ? "Quitar plan" : "Activar plan"}
        </button>
        <button type="button" className="chip with-spin" disabled={!!busy} onClick={() => act("dejar")}>
          {busy === "dejar" && <Spinner />}Dejar de seguir
        </button>
      </div>
    </li>
  );
}
