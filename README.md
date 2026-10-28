# Asistente Fantasy

Asistente para LaLiga Fantasy: analiza tu plantilla y el mercado y te dice qué vender, qué fichar y cuánto pujar. Las cifras salen de datos reales, nunca del LLM.

Estado: **fase 1, datos**. La ingesta diaria guarda jugadores, histórico de valor (con pujas), estadísticas por jornada y calendario. La Nota Fantasy llega en la fase 2.

## Arrancar en local

```bash
npm install
npm run ingest   # ~1 min. La primera vez rellena toda la temporada
npm run dev      # http://localhost:3000
```

Sin `DATABASE_URL` usa PGlite, un Postgres embebido en `./.data`. Solo admite un proceso a la vez: **para la ingesta, apaga `npm run dev`**.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run ingest` | Descarga y guarda los datos. Se puede repetir sin duplicar |
| `npm test` | Tests del parser con respuestas reales de la API |
| `npm run db:generate` | Genera una migración tras cambiar `src/db/schema.ts` |
| `npm run typecheck` | Comprueba tipos |

Opciones de la ingesta: `INGEST_LIMIT=20` (solo 20 jugadores, para probar) e `INGEST_CONCURRENCY=4`.

## Ingesta diaria automática

1. Crea una base Postgres gratuita (Neon o Supabase) y copia su URL de conexión.
2. Sube el repo a GitHub.
3. En el repo: Settings → Secrets and variables → Actions → nuevo secreto `DATABASE_URL`.
4. El workflow `.github/workflows/ingest.yml` se ejecuta cada día a las 05:45 (hora de Madrid en invierno). También se puede lanzar a mano desde la pestaña Actions.

Para usar esa misma base en local, pon la URL en `.env` como `DATABASE_URL=...`.

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

## Estructura

```
scripts/ingest.ts        ingesta diaria
src/lib/laliga/          cliente de la API, tipos y parser
src/db/                  esquema (Drizzle) y conexión
src/lib/queries.ts       consultas para la web
src/app/                 web (Next.js)
tests/                   tests con respuestas reales en tests/fixtures
drizzle/                 migraciones SQL
```
