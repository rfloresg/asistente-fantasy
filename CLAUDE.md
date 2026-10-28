# Asistente Fantasy

Asistente para LaLiga Fantasy. Next.js 15 + TypeScript, Drizzle, Postgres (PGlite en local).

## Reglas

- **Simple primero.** Nada de DDD, hexagonal ni CQRS. Funciones y módulos pequeños. Añadir capas solo cuando duela no tenerlas.
- **El LLM nunca escribe cifras.** Valores, puntos, notas y pujas salen del código y de la base de datos. El LLM solo explica.
- **API no oficial.** Todo acceso a LaLiga pasa por `src/lib/laliga/client.ts`. Peticiones educadas: concurrencia baja y reintentos con espera.
- **Parser puro y testeado.** Si la forma de la API cambia, actualizar `tests/fixtures` con respuestas reales y el parser.
- Textos de la interfaz en español.

## Comandos

- `npm run ingest`, `npm run onces` y luego `npm run score` (apaga `npm run dev` si usas PGlite)
- `npm test`, `npm run typecheck`, `npm run lint`
- Cambio de esquema: editar `src/db/schema.ts` y luego `npm run db:generate`

## Datos útiles de la API

- Posiciones: 1 POR, 2 DEF, 3 MED, 4 DEL, 5 ENT.
- Estados: ok, injured, doubtful, suspended, out_of_league.
- Estadísticas por jornada: `{ stat: [valor, puntos] }`.
- `market-value` trae el valor diario de toda la temporada. Su fecha es medianoche de Madrid: guardar solo el día.
- Las pujas del día en curso están incompletas: usar las del día anterior.
- futbolfantasy: slugs de jugador pierden la letra inicial con tilde ("ngel-fortuno"). No fiarse solo del slug.

## Hoja de ruta

1. Datos (hecho)
2. Motor de la Nota Fantasy (hecho): `src/lib/nota/engine.ts`, pesos y umbrales en `CONFIG`
3. Onces probables (hecho): `src/lib/onces/`. Pendiente: contrastar estado con otra fuente
4. LLM como voz (hecho): `src/lib/chat/`. El control de cifras de `guard.ts` no se quita
5. Lectura de capturas (hecho): `src/lib/captura/`. La visión solo lee nombres; las cifras, de la base de datos
6. Validación de la nota con el histórico
