"use client";

// Conectar con LaLiga en dos pasos: abrir el login oficial y pegar la dirección a la que llegas.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "../_ui/Refresh";

export default function Connect({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function start() {
    setMsg(null);
    // La pestaña se abre antes de pedir la dirección para que el navegador no la bloquee
    const tab = window.open("about:blank", "_blank");
    const res = await fetch("/api/laliga/start", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.url) {
      tab?.close();
      setMsg({ ok: false, text: body.error ?? "No se pudo empezar" });
      return;
    }
    if (tab) tab.location.href = body.url;
    else window.location.href = body.url;
    setStep(2);
  }

  async function paste() {
    try {
      setPasted(await navigator.clipboard.readText());
    } catch {
      setMsg({ ok: false, text: "Tu navegador no deja leer el portapapeles: mantén pulsado el cuadro y pega." });
    }
  }

  async function finish() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/laliga/finish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pasted }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: body.error ?? "No se pudo conectar" });
    const ligas = (body.leagues ?? []).map((l: { name: string }) => l.name).join(", ") || "ninguna";
    const caduca = body.sessionHours ? ` Ojo: LaLiga dice que esta sesión caduca en ${body.sessionHours} horas.` : "";
    setMsg({ ok: true, text: `Conectado. Ligas: ${ligas}.${caduca}` });
    setStep(1);
    setPasted("");
    router.refresh();
  }

  return (
    <div className="connect">
      <ol className="rule steps">
        <li className={step === 1 ? "now" : "done"}>
          <h3>Entra con tu cuenta de LaLiga</h3>
          <p>Se abre el inicio de sesión oficial de LaLiga en otra pestaña. Tu contraseña la escribes allí: aquí nunca la vemos.</p>
          <button type="button" className="primary" onClick={start}>{connected ? "Volver a conectar" : "Conectar con LaLiga"}</button>
        </li>
        <li className={step === 2 ? "now" : ""}>
          <h3>Pega la dirección a la que llegas</h3>
          <p>Al terminar llegarás a una página de Microsoft (jwt.ms). Copia su dirección completa, de la barra del navegador, y pégala aquí.</p>
          {step === 2 && (
            <>
              <label htmlFor="pasted" className="small">Dirección de la página de Microsoft</label>
              <div className="ask" style={{ position: "static", paddingTop: 4 }}>
                <input id="pasted" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://jwt.ms/?code=…" autoComplete="off" />
                <button type="button" className="chip" onClick={paste} style={{ background: "var(--surface)", color: "var(--ink)" }}>Pegar</button>
              </div>
              <button type="button" className="primary with-spin" onClick={finish} disabled={busy || !pasted.includes("code=")}>
                {busy ? <><Spinner /> Conectando</> : "Terminar"}
              </button>
            </>
          )}
        </li>
      </ol>
      {msg && <p className={msg.ok ? "up" : "bad"} role="status" style={{ fontWeight: 600 }}>{msg.text}</p>}
    </div>
  );
}
