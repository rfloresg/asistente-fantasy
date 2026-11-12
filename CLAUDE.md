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
3. Onces probables (hecho): `src/lib/onces/`. Dos fuentes, futbolfantasy y analiticafantasy (`analitica.ts`, tabla `lineups_af`), juntadas en `combine.ts` (manda futbolfantasy y analiticafantasy cubre lo que falte: la media acertó menos en las jornadas 11-12; avisa si no coinciden). Alias a mano en `aliases.ts` (`PLAYER_ALIASES` / `AF_ALIASES`). Se refrescan a las 05:45 y a las 16:30. El plan avisa si un titular de tu once está en disputa (30 puntos o más) y tienes recambio (`lineupDisputes`). Qué fuente acierta más: `npm run aciertos` (`aciertos.ts`, titular = más de 45 min); ajustar el peso de cada fuente solo tras varias jornadas
4. LLM como voz (hecho): `src/lib/chat/`. El control de cifras de `guard.ts` no se quita
5. Lectura de capturas (hecho): `src/lib/captura/`. La visión solo lee nombres; las cifras, de la base de datos
6. Validación de la nota (hecho): `npm run validar` (`src/lib/nota/validate.ts`), incluye xP frente a la media reciente y la de la temporada. Ajustar pesos solo con muchos datos. Nov 2026 (jornadas 4-11): xP falla 3,4 pts por 2 jornadas frente a 3,6 de la media reciente; orden 0,61 frente a 0,59. Pendiente: Understat y ClubElo (bloqueados o caídos desde fuera en nov 2026)
7. Espía (hecho): `src/lib/espia/`. Dinero estimado y subidas de cláusula: los activa el dueño del grupo en Cuenta (`leagues.show_money` / `show_raises`); en modo antiguo, `ESPIA_DINERO` / `ESPIA_SUBIDAS`
7b. Plan con puntos esperados (hecho): `src/lib/plan/impact.ts`. Cada decisión se mide por lo que cambia tu mejor once en pts por jornada: pujar/clausular si lo mejora (`PLAN.minGain`, `clauseMinGain`; clausulazos por pts por millón), proteger primero a quien más perderías (`protectMinLoss`), vender solo a quien no aporta (`sellMaxLoss`). Sin once calculado, como antes con la nota. Capitán solo en ligas Premium (`leagues.premium`: lo enciende el Espía si la API lo dice, o un miembro en Cuenta)
7c. Modo dinero (hecho, activado por defecto; se quita en Cuenta: `memberships.dinero`): el valor esperado en 7 días repite el cambio de ayer frenándose un 5 % al día (`projectValue`, `CONFIG.valueDamp`). Probado sin mirar el futuro: a 7 días falla un 5,6 % (antes 7,0 %); especular ganó un 19 % de media con un 7 % de compras en pérdida. El plan puja para especular aparte de las pujas para jugar (`PLAN.maxSpec`) y vende a los que van a bajar un 5 % o más si no sostienen tu once (`sellDrop`)
7e. Plan según el momento (hecho): `marketPhase()` en `src/lib/meta/calendario.ts` (jornada por su bloque principal: los aplazados no esconden un parón) da la fase: tras-jornada, semana, previa, cerrado, jornada, parón inicio/mitad/final. El plan especula más o menos según `PHASE_SPEC` (medido con la 26/27: en el parón de septiembre, comprar a los que suben al principio dio +50 % hasta la vuelta y en los últimos 4 días -3 %; con la jornada en juego, 1 de cada 6 compras pierde), no propone mercado con el mercado cerrado, abre con un aviso del momento (`PHASE_TIPS`) y propone poner a la venta a los que no alineas (la liga ofrece entre -10 % y +10 %; decides tú). Guía: tema `momentos` y `paron` del manual. Revisar `PHASE_SPEC` tras cada parón con más datos
7f. Puja justa y hora del mercado (hecho): tope para jugar = el de la nota o, si mejora tu once, valor + puntos que te devuelve en 8 jornadas a 100.000 €/punto (`playCap`, máx. +50 %). `src/lib/plan/puja-justa.ts` aprende de los fichajes del mercado de la liga (actividad tipo 1, 90 días; sobreprecio frente al valor de ese día) y puja para superar 3 de cada 4 fichajes parecidos (9 de 10 si ya tiene pujas) de los rivales que pueden pagarlo, sin pasar del más rico ni de tu tope; con menos de 6 fichajes parecidos, como antes (+5 % / +12 %). `npm run espia preview` enseña lo que paga de más cada rival. `mercado-hora.ts`: la hora a la que se renueva el mercado de cada liga (caducidad de los jugadores sin vendedor); el plan la dice y el Espía (modo eventos) avisa en privado hora y media antes si quedan pujas del último plan
7g. Ofertas recibidas (hecho): en el mercado, tus jugadores a la venta salen como `marketPlayerTeam` con `numberOfOffers`; el detalle, en `/league/{liga}/playerTeam/{playerTeamId}/offer` (`liga.offers`, `parseOffers`; rutas vistas en el cliente abierto LaLigaApp). El plan dice «acepta» si pasa un 3 % del valor y no es clave en tu once (o al valor si va a bajar), y por uno clave solo avisa si pasa un 15 %. Nunca acepta solo: decides tú
7h. Tu semana (hecho): `src/lib/semana.ts`; tras cada jornada (entre 6 h y 4 días después del último partido del bloque) el Espía en modo plan manda a cada usuario puntos y puesto de la jornada (`standing/{jornada}`), puesto en la general, valor de su plantilla en 7 días, el once recomendado (esperado y real) y el mejor y el peor consejo. Una vez por jornada (`espia_events` "semana:<j>:<usuario>")
7i. Avisos en el móvil (hecho): `src/lib/push.ts` (`pushToUser`): Web Push (VAPID) para la app instalada desde la web y Firebase (HTTP v1, JWT firmado a mano) para la app de Android; tabla `push_devices`; `/api/push` (guardar, quitar, probar); botón `ActivarAvisos` en Cuenta y en Hoy. El Espía avisa con el plan, el aviso de pujas y Tu semana, aunque el usuario no tenga Telegram. Llaves: `movil/README.md`
7d. Cuánto acertamos (hecho): `/aciertos` (`src/lib/aciertos.ts`). Cada consejo de los planes del usuario desde su primer plan (fichar, vender, proteger), su valor a 7 días frente al mercado, sus puntos y si le hizo caso (por su plantilla en los planes siguientes); y su once esperado frente al real
8. Meta (hecho): `src/lib/meta/manual.ts`. Reglas con fuente; lo no oficial va con `verificar`
9. Servicio con usuarios (hecho, gratis): todo desde el bot, sin pasar por la web. `/start` da el botón de LaLiga (vuelta por jwt.ms + PKCE, sesión cifrada con `SESSION_KEY`); al meter el bot en un grupo se activa con las ligas de quien lo mete (`src/lib/grupo-activar.ts`). La web es opcional; sin entrar, `/login` es la portada con el vídeo. Entrar en la web o en la app instalada: «Entrar con Telegram» (`src/lib/login-code.ts`, tabla `login_codes`): la página pide un código, abre el bot con `/start entrar_<código>`, el bot pregunta «¿Eres tú?» y la página, que va preguntando, recibe la sesión (sirve en la app instalada del iPhone, que no comparte sesión con Safari). Sesión de un año que se renueva al entrar. App: es la web instalable (`manifest.ts`, `sw.js`); botón «Instala la app» en Hoy y en la portada (`InstalarApp.tsx`); el plan de Telegram lleva «Abrir en la app». App de Android de verdad: `movil/` (Capacitor, abre la web; el navegador lleva `AsistenteFantasyApp`), la fabrica `.github/workflows/android.yml` firmada con la llave de los secretos (`movil/README.md`) y la deja en `public/app/`; se descarga en `/descargar` (pública) o con `/app` en el bot. Dentro de la app, `ActualizarApp` avisa si `public/app/version.json` es más nuevo que su versión y abre la descarga en Chrome (enlace http://: Capacitor abre fuera lo que no es su origen). La web se actualiza sola; reinstalar solo hace falta si cambia `movil/`. iPhone: no hay descarga fuera de la App Store, se instala desde Safari. Beta: `MAX_USUARIOS` (`src/lib/plazas.ts`), `/opinion` (tabla `feedback`) y parte diario al admin con el resumen (`src/lib/admin.ts`). Pendiente: cobro con Telegram Stars y servidor propio

## Usuarios

- Tablas: `users`, `laliga_sessions` (refresh token cifrado, nunca contraseñas), `leagues` (grupo y dueño), `memberships` (plan privado sí/no).
- El Espía recorre `leagues` activas; cada plan usa la sesión de su usuario (dinero real). Si `leagues` está vacía, usa `ESPIA_LIGAS` (modo antiguo).
- Una sesión de LaLiga solo se renueva desde GitHub Actions (las pasadas van de una en una): la web solo la crea.
