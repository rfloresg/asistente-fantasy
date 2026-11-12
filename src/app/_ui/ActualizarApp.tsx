"use client";

// Solo dentro de la app de Android: si hay una versión nueva (public/app/version.json, la deja GitHub
// Actions al fabricarla), avisa con un botón. Android no deja instalar sola una app que no viene de
// Google Play, así que son dos toques: Actualizar e Instalar. Lo demás (la web) ya se actualiza solo.
import { useEffect, useState } from "react";

interface AppInfo { build?: string; version?: string }

export default function ActualizarApp() {
  const [nueva, setNueva] = useState<string | null>(null);

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { App?: { getInfo(): Promise<AppInfo> } } } }).Capacitor;
    if (!cap?.isNativePlatform?.() || !cap.Plugins?.App) return;
    (async () => {
      const [info, latest] = await Promise.all([
        cap.Plugins!.App!.getInfo(),
        fetch("/app/version.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)) as Promise<{ version?: string } | null>,
      ]);
      const mine = Number(info.build);
      const last = Number(latest?.version?.split(".")[1]);
      if (Number.isFinite(mine) && Number.isFinite(last) && last > mine) setNueva(latest!.version!);
    })().catch(() => {});
  }, []);

  if (!nueva) return null;
  return (
    <div className="actualizar" role="status">
      <span>📲 Hay una versión nueva de la app ({nueva}).</span>
      {/* Con http:// (la app es https) Capacitor lo abre en Chrome, que sí descarga e instala */}
      <a className="primary" href={`http://${window.location.host}/app/asistente-fantasy.apk`}>Actualizar</a>
      <span className="small">Se abre Chrome y la descarga. Al terminar, ábrela y pulsa <b>Instalar</b>: se pone encima, sin perder nada.</span>
    </div>
  );
}
