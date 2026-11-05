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
- Borrar un usuario para probar el alta: `npm run usuario:borrar` (lista) y `-- <id> --si`. `npm run empezar-de-cero` borra a TODOS

## Datos útiles de la API

- Posiciones: 1 POR, 2 DEF, 3 MED, 4 DEL, 5 ENT.
- Estados: ok, injured, doubtful, suspended, out_of_league.
- Estadísticas por jornada: `{ stat: [valor, puntos] }`.
- `market-value` trae el valor diario de toda la temporada. Su fecha es medianoche de Madrid: guardar solo el día.
- Las pujas del día en curso están incompletas: usar las del día anterior.
- futbolfantasy: slugs de jugador pierden la letra inicial con tilde ("ngel-fortuno"). No fiarse solo del slug.

## Hoja de ruta

1. Datos (hecho)
2. Motor de la Nota Fantasy (hecho): `src/lib/nota/engine.ts`, pesos y umbrales en `CONFIG`. Base: puntos esperados (xP) de los 2 próximos partidos (`xp.ts`): titularidad, puntos fijos, parte de los goles del equipo y portería, con la fuerza de cada equipo (`teams.ts`, Poisson que parte del valor de la plantilla) y el valor de mercado como punto de partida de cada jugador. Desglose de puntos en `breakdown.ts`. No mirar jornadas futuras al validar
3. Onces probables (hecho): `src/lib/onces/`. Dos fuentes, futbolfantasy y analiticafantasy (`analitica.ts`, tabla `lineups_af`), juntadas en `combine.ts` (media; avisa si no coinciden). Alias a mano en `aliases.ts` (`PLAYER_ALIASES` / `AF_ALIASES`). Se refrescan a las 05:45 y a las 16:30. El plan avisa si un titular de tu once está en disputa (30 puntos o más) y tienes recambio (`lineupDisputes`). Qué fuente acierta más: `npm run aciertos` (`aciertos.ts`, titular = más de 45 min); ajustar el peso de cada fuente solo tras varias jornadas
4. LLM como voz (hecho): `src/lib/chat/`. El control de cifras de `guard.ts` no se quita
5. Lectura de capturas (hecho): `src/lib/captura/`. La visión solo lee nombres; las cifras, de la base de datos
6. Validación de la nota (hecho): `npm run validar` (`src/lib/nota/validate.ts`), incluye xP frente a la media reciente y la de la temporada. Ajustar pesos solo con muchos datos. Nov 2026 (jornadas 4-11): xP falla 3,4 pts por 2 jornadas frente a 3,6 de la media reciente; orden 0,61 frente a 0,59. Pendiente: Understat y ClubElo (bloqueados o caídos desde fuera en nov 2026)
7. Espía (hecho): `src/lib/espia/`. Dinero estimado y subidas de cláusula: los activa el dueño del grupo en Cuenta (`leagues.show_money` / `show_raises`); en modo antiguo, `ESPIA_DINERO` / `ESPIA_SUBIDAS`
7b. Plan con puntos esperados (hecho): `src/lib/plan/impact.ts`. Cada decisión se mide por lo que cambia tu mejor once en pts por jornada: pujar/clausular si lo mejora (`PLAN.minGain`, `clauseMinGain`; clausulazos por pts por millón), proteger primero a quien más perderías (`protectMinLoss`), vender solo a quien no aporta (`sellMaxLoss`). Sin once calculado, como antes con la nota. Capitán solo en ligas Premium (`leagues.premium`: lo enciende el Espía si la API lo dice, o un miembro en Cuenta)
7c. Modo dinero (hecho, activado por defecto; se quita en Cuenta: `memberships.dinero`): el valor esperado en 7 días repite el cambio de ayer frenándose un 5 % al día (`projectValue`, `CONFIG.valueDamp`). Probado sin mirar el futuro: a 7 días falla un 5,6 % (antes 7,0 %); especular ganó un 19 % de media con un 7 % de compras en pérdida. El plan puja para especular aparte de las pujas para jugar (`PLAN.maxSpec`) y vende a los que van a bajar un 5 % o más si no sostienen tu once (`sellDrop`)
7d. Cuánto acertamos (hecho): `/aciertos` (`src/lib/aciertos.ts`). Cada consejo de los planes del usuario desde su primer plan (fichar, vender, proteger), su valor a 7 días frente al mercado, sus puntos y si le hizo caso (por su plantilla en los planes siguientes); y su once esperado frente al real
8. Meta (hecho): `src/lib/meta/manual.ts`. Reglas con fuente; lo no oficial va con `verificar`
9. Servicio con usuarios (hecho, gratis): todo desde el bot, sin pasar por la web. `/start` da el botón de LaLiga (vuelta por jwt.ms + PKCE, sesión cifrada con `SESSION_KEY`); al meter el bot en un grupo se activa con las ligas de quien lo mete (`src/lib/grupo-activar.ts`). La web es opcional (`/web`); sin entrar, `/login` es la portada con el vídeo. Beta: `MAX_USUARIOS` (`src/lib/plazas.ts`), `/opinion` (tabla `feedback`) y parte diario al admin con el resumen (`src/lib/admin.ts`). Pendiente: cobro con Telegram Stars y servidor propio

## Usuarios

- Tablas: `users`, `laliga_sessions` (refresh token cifrado, nunca contraseñas), `leagues` (grupo y dueño), `memberships` (plan privado sí/no).
- El Espía recorre `leagues` activas; cada plan usa la sesión de su usuario (dinero real). Si `leagues` está vacía, usa `ESPIA_LIGAS` (modo antiguo).
- Una sesión de LaLiga solo se renueva desde GitHub Actions (las pasadas van de una en una): la web solo la crea.
