"use client";

// Activar las notificaciones del móvil. En la app de Android (Capacitor) usa Firebase; en la app instalada
// desde la web (iPhone y Android), Web Push. En iPhone solo funciona con la app añadida a la pantalla de inicio.
import { useCallback, useEffect, useState } from "react";

type State = "loading" | "unsupported" | "needs-install" | "off" | "on" | "denied" | "busy" | "error";

interface PushPlugin {
  checkPermissions(): Promise<{ receive: string }>;
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  addListener(ev: string, cb: (x: { value?: string; notification?: { data?: { url?: string } } }) => void): Promise<{ remove(): void }>;
}

const nativePush = (): PushPlugin | null => {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } }).Capacitor;
  return cap?.isNativePlatform?.() && cap.Plugins?.PushNotifications ? (cap.Plugins.PushNotifications as PushPlugin) : null;
};

const save = (body: object) => fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const keyBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

// Registra el token de Firebase (se guarda cada vez: si cambia, queda al día) y abre la ruta al tocar un aviso
async function nativeRegister(p: PushPlugin) {
  await p.addListener("registration", (t) => { if (t.value) save({ kind: "fcm", token: t.value }); });
  await p.addListener("pushNotificationActionPerformed", (a) => {
    const url = a.notification?.data?.url;
    if (url) window.location.href = url;
  });
  await p.register();
}

export default function ActivarAvisos({ vapidKey, compact = false }: { vapidKey: string; compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [tested, setTested] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const p = nativePush();
      if (p) {
        const perm = await p.checkPermissions().catch(() => ({ receive: "prompt" }));
        if (perm.receive === "granted") { await nativeRegister(p).catch(() => {}); setState("on"); }
        else setState(perm.receive === "denied" ? "denied" : "off");
        return;
      }
      if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
        setState(ios && !standalone && vapidKey ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") { setState("denied"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === "granted") { save(sub.toJSON()); setState("on"); } else setState("off");
    })().catch(() => setState("error"));
  }, [vapidKey]);

  const enable = useCallback(async () => {
    setState("busy");
    try {
      const p = nativePush();
      if (p) {
        const perm = await p.requestPermissions();
        if (perm.receive !== "granted") { setState("denied"); return; }
        await nativeRegister(p);
        setState("on");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
      const r = await save(sub.toJSON());
      setState(r.ok ? "on" : "error");
    } catch {
      setState("error");
    }
  }, [vapidKey]);

  const disable = useCallback(async () => {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("error");
    }
  }, []);

  const test = useCallback(async () => {
    setTested("Enviando…");
    const r = await fetch("/api/push", { method: "PUT" }).then((x) => x.json()).catch(() => ({ sent: 0 }));
    setTested(r.sent ? "Enviado: te tiene que llegar en unos segundos." : "No ha llegado a ningún móvil. Prueba a desactivar y activar otra vez.");
  }, []);

  if (state === "loading" || state === "unsupported") return null;
  if (compact && state !== "off" && state !== "needs-install") return null; // en Hoy, solo para invitar a activarlas

  return (
    <div className={`avisos${compact ? " compact" : ""}`}>
      {state === "needs-install" && (
        <p className="small">🔔 Para recibir avisos en el iPhone, primero añade la app a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y ábrela desde el icono.</p>
      )}
      {(state === "off" || state === "busy") && (
        <>
          {!compact && <p className="small">Te avisamos en el móvil del plan, de las pujas antes de que se renueve tu mercado y del resumen de cada jornada.</p>}
          <button type="button" className="install-btn" onClick={enable} disabled={state === "busy"}>
            <span aria-hidden="true">🔔</span>
            <span><b>Activa los avisos</b>{compact && <span className="small"> · el plan y las pujas, en tu móvil</span>}</span>
          </button>
        </>
      )}
      {state === "on" && (
        <div className="avisos-on">
          <p>🔔 <b>Avisos activados</b> en este móvil.</p>
          <div className="row">
            <button type="button" className="chip" onClick={test}>Mandarme uno de prueba</button>
            {!nativePush() && <button type="button" className="chip" onClick={disable}>Desactivar</button>}
          </div>
          {tested && <p className="small" role="status">{tested}</p>}
        </div>
      )}
      {state === "denied" && <p className="small">Los avisos están bloqueados para esta app. Actívalos en los ajustes del móvil (Notificaciones → Fantasy) y vuelve aquí.</p>}
      {state === "error" && <p className="small">No he podido activar los avisos. Vuelve a intentarlo en un rato.</p>}
    </div>
  );
}
