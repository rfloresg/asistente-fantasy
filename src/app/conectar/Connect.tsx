"use client";

// Conectar con LaLiga desde la web: abrir el login oficial y pegar la dirección a la que llegas.
// En el móvil se recomienda hacerlo desde el bot (/conectar), que es más cómodo.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "../_ui/Refresh";

export default function Connect({ connected, bot }: { connected: boolean; bot?: string }) {
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function start() {
    setMsg(null);
    const tab = window.open("about:blank", "_blank"); // antes de esperar, para que el navegador no la bloquee
    const res = await fetch("/api/laliga/start", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.url) {
      tab?.close();
      setMsg({ ok: false, text: body.error ?? "No se pudo empezar" });
      return;
    }
    if (tab) tab.location.href = body.url;
    else window.location.href = body.url;
    setOpened(true);
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
    if (!res.ok) return setMsg({ ok: false, text: body.error ?? `No se pudo conectar (error ${res.status})` });
    const ligas = (body.leagues ?? []).map((l: { name: string }) => l.name).join(", ") || "ninguna";
    const caduca = body.sessionHours && body.sessionHours < 72 ? ` Ojo: LaLiga dice que esta sesión caduca en ${body.sessionHours} horas.` : "";
    setMsg({ ok: true, text: `¡Conectado! Tus ligas: ${ligas}. Tu primer plan llega en un minuto.${caduca}` });
    setOpened(false);
    setPasted("");
    router.refresh();
  }

  return (
    <div className="connect">
      {bot && (
        <div className="tip">
          <b>¿Estás en el móvil?</b> Es más fácil desde Telegram: abre el bot, escribe <code>/conectar</code> y sigue los pasos.
          <div><a className="primary" href={`https://t.me/${bot}?start=conectar`} style={{ display: "inline-block", textDecoration: "none" }}>Conectar desde Telegram</a></div>
        </div>
      )}

      <ol className="guide">
        <li>
          <span className="num" aria-hidden="true">1</span>
          <div>
            <h3>Entra con tu cuenta de LaLiga</h3>
            <p>Se abre el inicio de sesión oficial de LaLiga en otra pestaña. Entra como siempre: tu contraseña se queda en LaLiga.</p>
            <button type="button" className="primary" onClick={start}>{connected ? "Volver a conectar" : "Entrar en LaLiga"}</button>
          </div>
        </li>
        <li>
          <span className="num" aria-hidden="true">2</span>
          <div>
            <h3>Llegarás a una página en blanco</h3>
            <p>Es una página de Microsoft (jwt.ms) y es normal que esté vacía: lo que importa es su dirección, que lleva tu código.</p>
            <div className="mock" aria-hidden="true">
              <div className="mock-bar"><span className="mock-url">jwt.ms/?state=…&amp;code=…</span></div>
              <div className="mock-page">jwt.ms</div>
            </div>
          </div>
        </li>
        <li>
          <span className="num" aria-hidden="true">3</span>
          <div>
            <h3>Copia su dirección y pégala aquí</h3>
            <p>Toca la barra de direcciones de esa página, copia todo y vuelve a esta pestaña.</p>
            <label htmlFor="pasted" className="small">Dirección de la página en blanco</label>
            <div className="paste-row">
              <input id="pasted" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://jwt.ms/?state=…&code=…" autoComplete="off" />
              <button type="button" className="chip" onClick={paste}>Pegar</button>
            </div>
            <button type="button" className="primary with-spin" onClick={finish} disabled={busy || !pasted.includes("code=")}>
              {busy ? <><Spinner /> Conectando</> : "Terminar"}
            </button>
            {opened && !pasted && <p className="small" style={{ marginTop: 8 }}>Te esperamos aquí cuando tengas la dirección.</p>}
          </div>
        </li>
      </ol>
      {msg && <p className={`notice ${msg.ok ? "ok" : "ko"}`} role="status">{msg.text}</p>}
      <p className="small" style={{ marginTop: 16 }}>🔒 Solo guardamos la sesión, cifrada. Nunca tu contraseña. El Espía solo lee: nunca ficha, vende ni toca nada.</p>
    </div>
  );
}
