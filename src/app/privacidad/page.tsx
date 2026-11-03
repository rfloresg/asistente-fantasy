// Privacidad: qué guardamos, para qué y cómo borrarlo. Pública (se ve sin entrar).
import Link from "next/link";

export const metadata = { title: "Privacidad · Asistente Fantasy" };

export default function Privacidad() {
  return (
    <main className="prose" style={{ maxWidth: 680 }}>
      <h1>Privacidad</h1>
      <p className="lead">Qué guarda el Asistente Fantasy, para qué lo usa y cómo borrarlo. Sin letra pequeña.</p>

      <h2>Lo que guardamos</h2>
      <ul>
        <li><b>Tu Telegram:</b> tu nombre y tu número de usuario. Sirve para que entres sin contraseña y para mandarte el plan por privado.</li>
        <li><b>Tu sesión de LaLiga:</b> el permiso que te da LaLiga al entrar, guardado cifrado. <b>Nunca vemos ni guardamos tu contraseña</b>: la escribes en la página de LaLiga, no aquí.</li>
        <li><b>Tus ligas y tus planes:</b> qué ligas sigues, los planes que te hacemos y los movimientos que marcas como hechos.</li>
        <li><b>Cuántas preguntas haces al día</b> en Pregunta, para el límite diario. Las preguntas no se guardan.</li>
      </ul>

      <h2>Lo que hacemos con tu sesión de LaLiga</h2>
      <p>Solo leer: tu plantilla, tu dinero, el mercado y la actividad de tus ligas. <b>Nunca ficha, vende, puja ni cambia nada</b> en tu equipo. Eso lo haces tú en la app de LaLiga.</p>
      <p>Cada vez que se usa, LaLiga da un permiso nuevo y el anterior deja de valer. Si dejas de usar el servicio, caduca solo a los 90 días.</p>

      <h2>Quién ve qué</h2>
      <ul>
        <li><b>Tu plan</b> solo lo ves tú, en la web y en tu chat privado con el bot.</li>
        <li><b>En el grupo de Telegram</b> el Espía cuenta lo que ya ve cualquiera de la liga en la app: fichajes, ventas, cláusulas y puntos.</li>
        <li><b>El dinero estimado</b> de cada mánager y las <b>subidas de cláusula</b> solo salen en el grupo si quien activó el Espía lo enciende. Son cálculos a partir de la actividad pública, no tu saldo real.</li>
      </ul>

      <h2>Con quién se comparte</h2>
      <p>Con nadie para vender ni para publicidad. Para funcionar usamos estos servicios:</p>
      <ul>
        <li><b>Telegram</b>, para los mensajes.</li>
        <li><b>Vercel</b> (la web), <b>Neon</b> (la base de datos) y <b>GitHub</b> (las tareas que leen LaLiga cada 30 minutos).</li>
        <li><b>Anthropic</b> (Claude), que redacta las respuestas de Pregunta y lee los nombres de las capturas que subes. Le llega tu pregunta y los datos de jugadores que hacen falta para contestarla.</li>
      </ul>

      <h2>Borrarlo todo</h2>
      <p>En <Link href="/conectar">Cuenta</Link>, abajo del todo, pulsa <b>Borrar mi cuenta</b>. Se borran tu sesión de LaLiga, tus planes, lo que marcaste como hecho y tus ligas, en el momento. Si el Espía leía un grupo con tu cuenta, pasa a otro miembro conectado; si no hay nadie, deja de publicar en ese grupo.</p>

      <h2>Aviso</h2>
      <p className="muted">El Asistente Fantasy es un proyecto personal. No tiene relación con LaLiga ni con LaLiga Fantasy, y usa su app de la misma forma que tú.</p>

      <p style={{ marginTop: 32 }}><Link href="/">Volver</Link></p>
    </main>
  );
}
