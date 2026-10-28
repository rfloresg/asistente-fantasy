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

## Nota Fantasy

Nota de 0 a 100 por jugador. Cada factor es el percentil del jugador dentro de su posición.

| Factor | Qué mide | Peso |
| --- | --- | --- |
| Forma | Puntos por partido en los últimos 5 de su equipo | 30 % |
| Tendencia | Ritmo diario de subida del valor (3 y 7 días) | 20 % |
| Pts por millón | Puntos por partido en la temporada / valor en millones | 20 % |
| Minutos | Mitad minutos en los últimos 5, mitad % de ser titular (once probable) | 15 % |
| Calendario | Fuerza de los 3 próximos rivales (jugar fuera suma) | 15 % |
| Riesgo | Lesión −25, sanción −20, duda −10 | resta |

- **Fichar:** nota de 70 o más, al menos 4 pts por partido, 50 % o más de ser titular (si hay once) y sin lesión ni sanción.
- **Vender:** nota menor de 40 y bajando de valor, o lesionado y bajando.
- **Valor esperado:** valor actual proyectado 7 días con su ritmo diario (tope ±8 % al día).
- **Puja máx. para especular:** valor esperado menos un 5 % de margen. Si no supera el valor actual, no compensa.
- **Puja máx. para jugar:** hasta un 30 % sobre el valor, según la nota (desde 60).

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
src/app/                 web (Next.js)
tests/                   tests con respuestas reales en tests/fixtures
drizzle/                 migraciones SQL
```
