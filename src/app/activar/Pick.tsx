"use client";

import { useState } from "react";
import { Spinner } from "../_ui/Refresh";

export default function Pick({ chat, sig, leagues }: { chat: string; sig: string; leagues: { id: string; name: string }[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function pick(id: string, name: string) {
    setBusy(id);
    setMsg(null);
    const res = await fetch("/api/activar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat, sig, leagueId: id }) });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    setMsg(res.ok ? { ok: true, text: `Hecho: el Espía ya está en el grupo con ${name}. Mira Telegram.` } : { ok: false, text: body.error ?? "No se pudo activar" });
  }
  return (
    <>
      <ul className="rule">
        {leagues.map((l) => (
          <li key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <b>{l.name}</b>
            <button type="button" className="primary with-spin" style={{ marginTop: 0 }} disabled={!!busy} onClick={() => pick(l.id, l.name)}>
              {busy === l.id ? <><Spinner /> Activando</> : "Es esta"}
            </button>
          </li>
        ))}
      </ul>
      {msg && <p className={msg.ok ? "up" : "bad"} role="status" style={{ fontWeight: 600 }}>{msg.text}</p>}
    </>
  );
}
