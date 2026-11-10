// Descargar la app. Android: el .apk que fabrica GitHub Actions (public/app/). iPhone: Apple no deja
// instalar apps de fuera de la App Store, así que se instala desde Safari en la pantalla de inicio.
// Página pública: el enlace se puede pasar por WhatsApp.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Descargar la app · Asistente Fantasy" };
export const dynamic = "force-dynamic";

async function version(): Promise<{ version: string; fecha: string } | null> {
  const base = process.env.APP_URL ?? "https://asistente-fantasy.vercel.app";
  try {
    const r = await fetch(`${base}/app/version.json`, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export default async function Descargar() {
  const v = await version();
  return (
    <main className="descargar">
      <p className="kicker">La app</p>
      <h1>Tu plan, <span className="hl">a un toque</span></h1>
      <p className="lead">Instálala una vez, entra con Telegram y se acuerda de ti. Lo que cambiemos te llega solo, sin actualizar nada.</p>

      <section className="card dl-card" aria-labelledby="android">
        <h2 id="android">Android</h2>
        {v ? (
          <>
            <a className="primary" href="/app/asistente-fantasy.apk" download>Descargar la app ({v.version})</a>
            <ol className="install-steps">
              <li>Pulsa <b>Descargar</b> y abre el archivo cuando termine.</li>
              <li>Si el móvil avisa de «orígenes desconocidos», pulsa <b>Ajustes</b> → <b>Permitir de esta fuente</b> y vuelve atrás. Es normal: la app no viene de Google Play.</li>
              <li>Pulsa <b>Instalar</b>, ábrela y pulsa <b>Entrar con Telegram</b>.</li>
            </ol>
          </>
        ) : (
          <p className="small">La app de Android estará aquí en unos días. Mientras, instálala desde Chrome: menú <b>⋮</b> → <b>Instalar app</b>.</p>
        )}
      </section>

      <section className="card dl-card" aria-labelledby="iphone">
        <h2 id="iphone">iPhone</h2>
        <p className="small">Apple no deja instalar apps descargadas fuera de la App Store, así que en iPhone se instala desde Safari. Queda igual: icono en la pantalla de inicio y a pantalla completa.</p>
        <ol className="install-steps">
          <li>Abre <b>esta página en Safari</b>.</li>
          <li>Pulsa <b>Compartir</b> (el cuadrado con la flecha hacia arriba) → <b>Añadir a pantalla de inicio</b>.</li>
          <li>Ábrela desde el icono AF y pulsa <b>Entrar con Telegram</b>. Solo la primera vez.</li>
        </ol>
      </section>

      <p className="small"><Link href="/">Volver</Link> · <Link href="/privacidad">Privacidad</Link></p>
    </main>
  );
}
