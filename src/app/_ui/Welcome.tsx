// Bienvenida en Hoy: los 3 pasos para empezar, con su check. Se va sola cuando están hechos
// (el del grupo es opcional: se puede quitar con "Ahora no").
import { and, eq, isNotNull } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";
import { getDb } from "@/db";
import { laligaSessions, leagues, memberships } from "@/db/schema";
import { WELCOME_COOKIE } from "./welcome-cookie";
import Dismiss from "./WelcomeDismiss";

type Step = { title: string; text: string; done: boolean; cta?: { label: string; href: string; external?: boolean } };

export default async function Welcome({ userId }: { userId: number }) {
  const db = await getDb();
  const [session] = await db.select().from(laligaSessions).where(eq(laligaSessions.userId, userId));
  const mine = await db.select({ plan: memberships.plan }).from(memberships).where(eq(memberships.userId, userId));
  const [group] = await db.select({ id: leagues.leagueId }).from(memberships)
    .innerJoin(leagues, eq(leagues.leagueId, memberships.leagueId))
    .where(and(eq(memberships.userId, userId), isNotNull(leagues.groupChatId))).limit(1);
  const bot = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");

  const connected = !!session && !session.lastError;
  const steps: Step[] = [
    {
      title: session?.lastError ? "Vuelve a conectar tu LaLiga" : "Conecta tu LaLiga",
      text: session?.lastError ? "Tu sesión ha caducado. Entra otra vez y sigues como estabas." : "Entras en la página de LaLiga y el Espía puede leer tus ligas. Solo lee: nunca ficha ni vende.",
      done: connected,
      cta: { label: "Conectar", href: "/conectar" },
    },
    {
      title: "Elige tus ligas",
      text: "Activa el plan en las ligas que quieras. Te llega aquí y por Telegram a las 9:00 y a las 18:00.",
      done: connected && mine.some((m) => m.plan),
      cta: connected ? { label: "Ver mis ligas", href: "/conectar#ligas" } : undefined,
    },
    {
      title: "Mete el Espía en el grupo",
      text: "Opcional. Cuenta en el grupo de tu liga los fichajes, ventas y cláusulas, y un resumen cada mañana.",
      done: !!group,
      cta: bot && connected ? { label: "Añadir a un grupo", href: `https://t.me/${bot}?startgroup=espia`, external: true } : undefined,
    },
  ];

  const required = steps[0].done && steps[1].done;
  const dismissed = (await cookies()).get(WELCOME_COOKIE)?.value === "fuera";
  if (steps.every((s) => s.done) || (required && dismissed)) return null;
  const current = steps.findIndex((s) => !s.done);
  const count = steps.filter((s) => s.done).length;

  return (
    <section className="welcome" aria-labelledby="bienvenida">
      <div className="welcome-head">
        <h2 id="bienvenida">{count === 0 ? "Empieza en 3 pasos" : "Ya casi está"}</h2>
        <span className="small">{count} de 3</span>
      </div>
      <div className="welcome-bar" aria-hidden="true"><span style={{ width: `${(count / 3) * 100}%` }} /></div>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={i} className={s.done ? "step done" : i === current ? "step now" : "step"}>
            <span className="num" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
            <div>
              <h3>{s.title}{s.done && <span className="sr-only"> (hecho)</span>}</h3>
              {!s.done && <p>{s.text}</p>}
              {!s.done && i === current && s.cta && (
                s.cta.external
                  ? <a className="primary" href={s.cta.href} target="_blank" rel="noreferrer">{s.cta.label}</a>
                  : <Link className="primary" href={s.cta.href}>{s.cta.label}</Link>
              )}
              {!s.done && i === current && i === 2 && <Dismiss />}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
