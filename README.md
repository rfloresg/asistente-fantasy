# Asistente Fantasy

Asistente para LaLiga Fantasy: analiza tu plantilla y el mercado y te dice qué vender, qué fichar y cuánto pujar. Las cifras salen de datos reales, nunca del LLM.

Estado: **fase 5, capturas**. La ingesta diaria guarda jugadores, histórico de valor (con pujas), estadísticas por jornada y calendario. Lee los onces probables de futbolfantasy y calcula la nota de cada jugador, con su recomendación y puja máxima.

## Arrancar en local

```bash
npm install
npm run ingest   # ~1 min. La primera vez rellena toda la temporada
npm run onces    # onces probables de futbolfantasy (~40 s)
npm run score    # calcula la Nota Fantasy del día
npm run dev      # http://localhost:3000
```

Sin `DATABASE_URL` usa PGlite, un Postgres embebido en `./.data`. Solo admite un proceso a la vez: **para la ingesta, apaga `npm run dev`**.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run ingest` | Descarga y guarda los datos. Se puede repetir sin duplicar |
| `npm run onces` | Onces probables de hoy. Avisa de titulares que no sabe emparejar |
| `npm run score` | Calcula la nota del último día. `SCORE_DAYS=30` recalcula también días anteriores |
| `npm run validar` | ¿Acierta la nota? Compara cada nota con lo que pasó después y sugiere pesos |
| `npm test` | Tests del parser con respuestas reales de la API |
| `npm run db:generate` | Genera una migración tras cambiar `src/db/schema.ts` |
| `npm run typecheck` | Comprueba tipos |

Opciones de la ingesta: `INGEST_LIMIT=20` (solo 20 jugadores, para probar) e `INGEST_CONCURRENCY=4`.

## Ingesta diaria automática

1. Crea una base Postgres gratuita (Neon o Supabase) y copia su URL de conexión.
2. Sube el repo a GitHub.
3. En el repo: Settings → Secrets and variables → Actions → nuevo secreto `DATABASE_URL`.
4. El workflow `.github/workflows/ingest.yml` se ejecuta cada día a las 05:45 (hora de Madrid en invierno): ingesta, onces y nota. Si futbolfantasy falla, la nota se calcula igual, solo con minutos. También se puede lanzar a mano desde la pestaña Actions.

Para usar esa misma base en local, pon la URL en `.env` como `DATABASE_URL=...`.

## Web en internet (Vercel)

1. Entra en vercel.com con tu cuenta de GitHub y pulsa Add New → Project → importa el repo.
2. En Environment Variables añade `DATABASE_URL`, `ANTHROPIC_API_KEY` y `APP_PASSWORD` (la contraseña para entrar).
3. Deploy. Corre en Frankfurt (`vercel.json`), junto a la base de Neon.

Con `APP_PASSWORD` definida, toda la web y la API piden contraseña (cookie de 90 días). Las capturas se comprimen en el navegador antes de subirlas: Vercel no acepta más de 4,5 MB.

## La web

En producción: **https://asistente-fantasy.vercel.app** (siempre la última versión; las direcciones con un código en medio son despliegues antiguos).

Una sola app, con selector de liga arriba (se recuerda en una cookie):

| Página | Qué enseña |
| --- | --- |
| `/` Hoy | Tu plan por prioridad (proteger, clausular, pujar, vender) y tu once dibujado en el campo con capitán, huecos y dudas |
| `/liga` | Clasificación con el dinero estimado, últimos movimientos, cláusulas que se liberan y bajas |
| `/mercado` | Todos los jugadores con su nota, con filtros |
| `/plantilla` | Analizar una captura de tu plantilla o del mercado de tu liga |
| `/chat` | Preguntas al asistente (consulta el plan, la nota y el manual del meta) |

La página Liga y las listas de Plantilla se refrescan cada 30 minutos con la pasada del Espía; el dinero estimado y el plan, a las 9:00 y a las 18:00. Hoy y Liga salen de lo que guarda `npm run espia plan` en `espia_plans` (columnas `lineup` y `liga`), así la web nunca usa tu sesión de LaLiga. Estilo: campo de fútbol (césped, cal) y tarjetas de árbitro por tipo de acción; letra Archivo, estrecha en los títulos. En el móvil la navegación va abajo.

## Nota Fantasy

Nota de 0 a 100 por jugador. Cada factor es el percentil del jugador dentro de su posición.

| Factor | Qué mide | Peso |
| --- | --- | --- |
| Forma | Puntos por partido en los últimos 5 de su equipo | 30 % |
| Tendencia | Ritmo diario de subida del valor (3 y 7 días) | 30 % |
| Pts por millón | Puntos por partido en la temporada / valor en millones | 10 % |
| Minutos | Mitad minutos en los últimos 5, mitad % de ser titular (once probable) | 25 % |
| Calendario | Goles que se esperan en los 2 próximos partidos según el puesto: en contra para porteros y defensas, a favor para delanteros, mitad y mitad en medios (casa o fuera cuenta) | 5 % |
| Riesgo | Lesión −25, sanción −20, duda −10 | resta |

- **Fichar:** nota de 70 o más, al menos 4 pts por partido, 50 % o más de ser titular (si hay once) y sin lesión ni sanción.
- **Vender:** nota menor de 40 y bajando de valor, o lesionado y bajando.
- **Valor esperado:** valor actual proyectado 7 días con su ritmo diario (tope ±8 % al día).
- **Puja máx. para especular:** valor esperado menos un 5 % de margen. Si no supera el valor actual, no compensa.
- **Puja máx. para jugar:** hasta un 30 % sobre el valor, según la nota (desde 60).

Pesos ajustados con `npm run validar` sobre 60 días: la nota acierta (correlación 0,41 con el valor a 7 días y 0,49 con los puntos de las 2 jornadas siguientes; los de "fichar" subieron un 13 % de media y los de "vender" bajaron casi un 10 %). El calendario apenas acertaba y pesa poco.

Todo se ajusta en `CONFIG`, en `src/lib/nota/engine.ts`. La nota mide si conviene comprar a ese precio, no quién es el mejor: para eso, ordena por forma.

## De dónde salen los datos

API no oficial de LaLiga Fantasy (`fantasy-api.llt-services.com/api`). Todos los endpoints que usamos son públicos, sin login:

| Endpoint | Datos |
| --- | --- |
| `/v3/teams-master` | Equipos |
| `/v1/competition/1/players` | Jugadores: valor, puntos, media, estado |
| `/v1/competition/1/player/{id}` | Estadísticas por jornada (minutos, goles, paradas...) |
| `/v1/competition/1/player/{id}/market-value` | Valor diario de toda la temporada y nº de pujas |
| `/v1/competition/1/calendar?weekNumber=N` | Partidos por jornada |
| `/v1/competition/1/week/current` | Jornada actual |

Es una API no oficial: puede cambiar sin aviso. Si la ingesta falla en más del 10 % de jugadores, termina con error y queda registrado en la tabla `ingest_runs`. Las condiciones de LaLiga Fantasy solo permiten uso privado y no comercial.

## Chat con IA

En `/chat` puedes preguntar en lenguaje normal ("¿qué delantero ficho con 5 M?"). Claude consulta tres herramientas de solo lectura (`src/lib/chat/tools.ts`): buscar jugador, ficha de jugador y mercado. Luego explica con esos datos.

- **No inventa cifras:** `src/lib/chat/guard.ts` comprueba que cada número de la respuesta sale de las herramientas o de tu pregunta. Si no, le pide reescribir una vez; si insiste, la web lo marca en rojo.
- **Necesita** `ANTHROPIC_API_KEY` en `.env`. Modelo por defecto: `claude-haiku-5-5` (el más barato). Cámbialo con `ASISTENTE_MODEL`.
- Como mucho 6 consultas a herramientas por pregunta y 10 mensajes de historial, para que cada pregunta cueste poco.

## Mi plantilla y mercado de mi liga

En `/plantilla` subes una captura de tu equipo (o, en `/plantilla?tipo=mercado`, de los jugadores en venta de tu liga) y te dice qué vender, qué mantener y por quién pujar.

1. Claude con visión lee solo los nombres, el equipo y la posición (`src/lib/captura/read.ts`). Nunca lee cifras.
2. `src/lib/captura/match.ts` empareja cada nombre con un jugador real. Si hay dudas ("Williams"), te deja elegir; si no lo encuentra, puedes buscarlo.
3. El análisis sale de la base de datos: nota, consejo, valor, tendencia, titularidad y valor esperado o puja máxima.
4. La lista se guarda en tu navegador (localStorage): al volver, la verás con los datos del día sin subir nada.
5. "Pídele al asistente que lo analice" abre el chat con tu plantilla ya escrita.

## Sesión de tu liga (para el Espía)

Para leer tu liga (actividad, clasificación, plantillas) hace falta tu sesión de LaLiga, solo lectura.

1. `npx playwright install chromium` (una vez; no hace falta si tienes Chrome).
2. `npm run liga:login`: se abre el login oficial de LaLiga. Entra con email (Google puede bloquear navegadores automatizados). El script no ve tu contraseña: solo captura el código de vuelta y guarda la sesión en la base de datos (tabla `app_secrets`).
3. `npm run liga:probe`: guarda las respuestas en `liga-probe/` (no se sube a git) y muestra su estructura. `LIGA_INDEX=1` si tienes varias ligas.

La sesión se renueva sola en cada uso (`src/lib/laliga/auth.ts`). Si caduca, repite el paso 2.

## El Espía (Telegram)

Bot para el grupo de Telegram de tu liga. Publica fichajes, ventas, cláusulas y blindajes al momento, y un resumen cada mañana (clasificación, gasto en 24 h, bajas en las plantillas y lo mejor del mercado con su nota). Solo lee: nunca toca la liga.

1. Haz antes `npm run liga:login` (sesión de LaLiga).
2. Crea el bot en Telegram con @BotFather (`/newbot`), mételo en el grupo y escribe `/start` en el grupo.
3. En `.env`: `TELEGRAM_BOT_TOKEN=...` y `LIGA_ID=...` (sale en `npm run liga:probe`). Luego `npm run telegram:chat` te da el ID del grupo para `TELEGRAM_CHAT_ID`.
4. `npm run espia preview`: muestra en la terminal lo que publicaría, sin enviar nada.

Varias ligas: `ESPIA_LIGAS=018477470:-5110647810,018218984:-100...` (id de liga:id del grupo, separados por comas). El mismo bot sirve para todos los grupos.

5. En GitHub, secretos `TELEGRAM_BOT_TOKEN` y `ESPIA_LIGAS` (o `LIGA_ID` + `TELEGRAM_CHAT_ID` para una sola liga). El workflow `espia.yml` mira la liga cada 30 min (07:00 a 01:00) y manda el resumen a las 09:00.

Para dejar una liga: quítala de `ESPIA_LIGAS` (en `.env` y en el secreto de GitHub) y ejecuta `npm run liga:olvidar <id>`, que borra sus planes, avisos y cláusulas guardados.

La primera vez no publica el historial: solo un mensaje de "Espía activado". Las actividades ya avisadas se guardan en `espia_events`.

### Espía v2

- **Cláusulas:** avisa cuando se libera la cláusula de un jugador (🔓) y, con la variable `ESPIA_SUBIDAS=1`, cuando alguien la sube (🔒). Las subidas se detectan comparando las cláusulas de cada pasada (tablas `espia_clauses` y `espia_raises`).
- **Dinero estimado** en el resumen (con la variable `ESPIA_DINERO=1`): 100 M iniciales + toda la actividad - subidas de cláusula detectadas (cuestan la mitad de lo que suben). El tuyo es el real. Las subidas anteriores a activarlo no se ven: para los rivales es un máximo.
- **Puntos desde el último resumen**, cobros de la jornada y cláusulas que se liberan en 24 h.
- **Avisos del meta:** cierre del mercado (4 h antes) y parón.
- `ESPIA_DINERO` y `ESPIA_SUBIDAS` son variables de GitHub (Settings → Secrets and variables → Actions → Variables). En `npm run espia preview` se ve todo siempre.

## Tu plan del día

`npm run espia plan` mira tu plantilla, el mercado de la liga y los equipos rivales y te dice qué hacer, por prioridad (`src/lib/plan/plan.ts`):

1. **Saldo:** si estás en negativo, a quién vender antes del cierre (en negativo no se puntúa).
2. **Proteger:** tus mejores jugadores con la cláusula abierta y al alcance del rival más rico. Si subirla cuesta poco (hasta el 25 % de tu dinero), cuánto subirla; si no, blindarlo.
3. **Clausulazos:** jugadores de rivales con nota de fichar, cláusula abierta y sin blindaje, que puedes pagar y que no superan tu puja máxima.
4. **Pujas:** jugadores del mercado de tu liga que compensan, con la puja sugerida (valor +5 %, o +12 % si ya hay pujas, sin pasar de tu tope).
5. **Vender:** nota baja y bajando, o lesionado.
6. **Alineación y capitán** (`src/lib/plan/lineup.ts`): el once que más puntos espera entre las formaciones sin Premium. Puntos esperados = forma × probabilidad de ser titular (once probable) × estado (lesionado o sancionado 0, en duda la mitad). Capitán: el de más puntos esperados. Avisa de dudas y de a quién no alinear.

**Actualizar plan:** el botón de la portada lanza el workflow en modo plan y recarga la página cuando llega (1-2 minutos). Necesita en Vercel la variable `GITHUB_DISPATCH_TOKEN`: un token de GitHub (fine-grained, solo este repo) con permiso **Actions: Read and write**.

**Recordatorio:** 4 horas antes del cierre del mercado te llega en privado el plan recién calculado, con lo que te queda por hacer (una vez por jornada).

Es **solo para ti**: se envía al chat privado `ESPIA_PLAN_CHAT` (abre el bot en privado, escríbele `/start` y saca el ID con `npm run telegram:chat`), nunca al grupo. Se genera a las 9:00 y a las 18:00, se guarda en `espia_plans` y se ve en `/plan` de la web. El chat también lo consulta (herramienta `plan_del_dia`). Umbrales en `PLAN`.

## El meta (cómo juegan los pros)

`src/lib/meta/manual.ts`: reglas del juego y estrategia (dinero, puntuación, mercado, especular, cláusulas, parones, alineación), cada tema con sus fuentes. Lo marcado `verificar` sale de guías, no del reglamento oficial. El chat lo consulta con la herramienta `meta`; el Espía usa `src/lib/meta/calendario.ts` para los avisos de cierre y parón.

## Onces probables

`scripts/onces.ts` lee la página de cada equipo en futbolfantasy.com (su robots.txt lo permite), una vez al día y con pausa de 1,5 s entre páginas. De cada jugador saca si es titular y su probabilidad.

Los nombres no coinciden con los de LaLiga ("M. Dituro" vs "Dituro", "Diaby" vs "Bambo"), así que `src/lib/onces/match.ts` empareja por nombre y slug, dentro del mismo equipo, y no empareja si hay dudas. Si un titular no se empareja, el log lo dice: añádelo a `src/lib/onces/aliases.ts`.

## Estructura

```
scripts/ingest.ts        ingesta diaria
scripts/score.ts         cálculo diario de la nota
src/lib/nota/            motor de la nota y motivos en texto
scripts/onces.ts         onces probables diarios
src/lib/onces/           parser de futbolfantasy, emparejado y alias
src/lib/laliga/          cliente de la API, tipos y parser
src/db/                  esquema (Drizzle) y conexión
src/lib/queries.ts       consultas para la web
src/lib/chat/            herramientas, control de cifras y bucle con Claude
src/lib/captura/         lectura de capturas y emparejado de nombres
src/lib/espia/           lectura de la liga, mensajes, dinero y Telegram
src/lib/meta/            manual del meta y avisos de calendario
scripts/espia.ts         avisos, resumen diario y vista previa
src/app/                 web (Next.js)
tests/                   tests con respuestas reales en tests/fixtures
drizzle/                 migraciones SQL
```
