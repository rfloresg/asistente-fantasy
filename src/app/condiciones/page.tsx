// Condiciones de uso. Pública (se ve sin entrar).
import Link from "next/link";

export const metadata = { title: "Condiciones · Asistente Fantasy" };

export default function Condiciones() {
  return (
    <main className="prose" style={{ maxWidth: 680 }}>
      <h1>Condiciones de uso</h1>
      <p className="lead">Cortas y claras. Al conectar tu cuenta aceptas esto.</p>

      <h2>Qué es</h2>
      <p>Un asistente gratuito, en beta, que lee tus ligas de LaLiga Fantasy y te propone qué hacer: fichar, vender, proteger, a quién alinear. <b>No es una app oficial</b> y no tiene relación con LaLiga ni con LaLiga Fantasy.</p>

      <h2>Son consejos, decides tú</h2>
      <p>El asistente nunca ficha, puja, vende ni cambia nada en tu equipo: eso lo haces tú en la app de LaLiga. Sus consejos salen de cálculos con datos públicos y pueden fallar (lesiones de última hora, onces que cambian, mercados que se mueven). En <Link href="/aciertos">Cuánto acertamos</Link> ves cómo le va. No nos hacemos responsables de lo que pase en tu liga por seguirlos.</p>

      <h2>Tu cuenta de LaLiga</h2>
      <p>Para leer tus ligas usamos tu sesión de LaLiga igual que la usa su app, solo para leer. LaLiga no ofrece una forma oficial de hacerlo, así que <b>lo usas bajo tu responsabilidad</b>: si LaLiga cambiara sus normas o su app, el servicio podría dejar de funcionar. Puedes desconectar y borrar tu cuenta cuando quieras (Cuenta o /borrarme en el bot).</p>

      <h2>La beta</h2>
      <ul>
        <li>Es gratis y las plazas son limitadas. Si está llena, te apuntamos a la lista de espera.</li>
        <li>Puede fallar, cambiar o cerrarse. Si cerramos, borramos los datos.</li>
        <li>Pregunta tiene un número de preguntas al día por persona.</li>
      </ul>

      <h2>Uso razonable</h2>
      <p>No intentes saturar el servicio, colarte en cuentas de otros ni usarlo para molestar a nadie de tu liga. Si pasa, podemos cerrar tu acceso.</p>

      <p>Qué datos guardamos y cómo borrarlos: <Link href="/privacidad">Privacidad</Link>.</p>
      <p style={{ marginTop: 32 }}><Link href="/">Volver</Link></p>
    </main>
  );
}
