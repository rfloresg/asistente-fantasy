// Manual del meta de LaLiga Fantasy: reglas del juego y cómo juegan los pros, con fuentes.
// Lo consulta el chat (herramienta "meta") y lo aplican el Espía y la nota.
// Si una regla cambia, se corrige aquí. "verificar" = sale de guías, no del reglamento oficial.

export interface Fuente {
  nombre: string;
  url: string;
}

export interface Tema {
  id: string;
  titulo: string;
  reglas: { texto: string; verificar?: boolean }[];
  consejos: string[];
  fuentes: Fuente[];
}

const F = {
  tracker: { nombre: "Guía LALIGA Fantasy 2026/27 (Fantasy Market Tracker)", url: "https://fantasy-market-tracker.netlify.app/guias/laliga-fantasy/" },
  laligaNovedades: { nombre: "LaLiga: novedades de LaLiga Fantasy 25/26", url: "https://www.laliga.com/noticias/laliga-fantasy-25-26-llega-cargada-de-novedades-tras-el-exito-de-la-ultima-temporada" },
  laligaBlindaje: { nombre: "LaLiga: llega el doble blindaje", url: "https://www.laliga.com/noticias/el-doble-blindaje-llega-a-laliga-fantasy" },
  jpValor: { nombre: "JornadaPerfecta: interpretar el valor de mercado", url: "https://www.jornadaperfecta.com/blog/interpretar-valor-mercado-fantasy/" },
  jpParon: { nombre: "JornadaPerfecta: cláusulas en el parón", url: "https://www.jornadaperfecta.com/blog/laliga-fantasy-clausulas-paron-septiembre-26/" },
  afParon: { nombre: "AsesoríasFantasy: el mercado durante el parón", url: "https://asesoriasfantasy.com/mercado-fantasy-durante-el-paron-por-que-ahora-bajan-tus-jugadores/" },
  afClausulas: { nombre: "AsesoríasFantasy: estrategias de clausulazos", url: "https://asesoriasfantasy.com/estrategias-de-clausulazos-en-biwenger-y-fantasy-laliga-2025-26/" },
  afGuia: { nombre: "AsesoríasFantasy: guía LaLiga Fantasy 2026/27", url: "https://asesoriasfantasy.com/guia-fantasy-laliga-2026-27-consejos-trucos-y-estrategias-para-dominar-tu-liga/" },
  comuniate: { nombre: "Comuniate: trucos para una temporada perfecta", url: "https://www.comuniate.com/noticias/3048/trucos-para-lograr-una-temporada-perfecta" },
} satisfies Record<string, Fuente>;

export const MANUAL: Tema[] = [
  {
    id: "dinero",
    titulo: "Dinero: saldo, premios y deuda",
    reglas: [
      { texto: "Se empieza con 100 M y 14 jugadores aleatorios." },
      { texto: "Cada punto de la jornada da 100.000 € al acabar la jornada." },
      { texto: "Se puede tener saldo negativo hasta un 20 % del valor del equipo.", verificar: true },
      { texto: "Con saldo negativo cuando empieza la jornada no se puntúa.", verificar: true },
    ],
    consejos: [
      "Llega a la jornada con saldo en positivo: endeudarse entre jornadas está bien, empezarla en negativo cuesta todos los puntos.",
      "Los puntos son dinero: un jugador que hace 10 puntos te devuelve 1 M cada jornada.",
      "Calcula el dinero de tus rivales para saber quién puede pujar fuerte o pagar una cláusula (el Espía lo estima).",
    ],
    fuentes: [F.tracker, F.comuniate],
  },
  {
    id: "puntuacion",
    titulo: "Cómo se puntúa",
    reglas: [
      { texto: "Jugar: +1 con menos de 60 minutos, +2 con 60 o más." },
      { texto: "Gol: +6 portero o defensa, +5 centrocampista, +4 delantero. Asistencia: +3.", verificar: true },
      { texto: "Portería a cero (60 minutos o más): +4 portero, +3 defensa, +2 centrocampista, +1 delantero.", verificar: true },
      { texto: "Estadísticas por tramos: tiros a puerta, regates y entradas al área (+1 cada 2), recuperaciones (+1 cada 5), despejes (+1 cada 3); pérdidas restan.", verificar: true },
      { texto: "Puntos DAZN: de 0 a 4 extra por jornada según una valoración del rendimiento, que depende de la posición y los minutos." },
      { texto: "Lesionados y sancionados no puntúan." },
    ],
    consejos: [
      "Los minutos mandan: un titular fijo suma +2 casi seguro y opta a los bonus de estadísticas. Un suplente que entra 20 minutos rara vez puntúa bien.",
      "Defensas y porteros de equipos que encajan poco suman mucho por portería a cero; los centrocampistas con muchas recuperaciones y regates puntúan aunque no marquen.",
      "Los lanzadores de penaltis y faltas suman puntos extra por goles y asistencias.",
    ],
    fuentes: [F.tracker, F.laligaNovedades, F.comuniate],
  },
  {
    id: "mercado",
    titulo: "Mercado y pujas",
    reglas: [
      { texto: "Cada 24 horas salen 12 jugadores nuevos al mercado." },
      { texto: "Las pujas son ciegas: gana la más alta y, si empatan, la primera. La mínima es el valor de mercado." },
      { texto: "Las ofertas entre mánagers duran 3 días y decide el dueño. La liga hace ofertas automáticas entre un -10 % y un +10 % del valor.", verificar: true },
      { texto: "El mercado cierra 24 horas antes de la jornada." },
      { texto: "No hay límite de fichajes: el límite es el saldo y la deuda máxima." },
    ],
    consejos: [
      "Puja según lo que el jugador te devuelve, no según lo que te gusta: pagar un 20 % sobre el valor por un centrocampista que hace 7 puntos por partido es sostenible; por un portero de abajo en racha, no.",
      "El valor lo mueve la demanda de los mánagers, no solo el rendimiento: ficha antes de que la gente se entere (buena racha, hereda minutos por lesión del titular) y no cuando ya ha subido.",
      "Mira cuánto dinero tienen tus rivales antes de pujar: si nadie puede pagar más, no hace falta sobrepujar.",
      "Las ofertas automáticas de la liga sirven para vender rápido al valor; sale más a cuenta vender a otro mánager si alguien lo quiere.",
    ],
    fuentes: [F.tracker, F.jpValor, F.comuniate],
  },
  {
    id: "especular",
    titulo: "Especular: comprar para vender más caro",
    reglas: [
      { texto: "El valor sube con las compras masivas y baja con las ventas masivas." },
    ],
    consejos: [
      "Compra pronto a los que empiezan a subir: según AsesoríasFantasy, los 20 que más suben el tercer día de un parón acabaron por encima de ese valor en 79 de 80 casos.",
      "Busca rebotes: jugadores buenos que vuelven de una lesión larga con el valor en mínimos.",
      "Vende antes de que la comunidad lo hunda: una lesión de más de un mes provoca ventas masivas, así que vende rápido aunque sea algo por debajo del valor.",
      "Los jugadores de equipos con Champions o Europa League pierden valor tras varias suplencias por rotaciones.",
      "No especules con dinero que necesitas para alinear: la jornada se puntúa con saldo positivo.",
    ],
    fuentes: [F.jpValor, F.afParon],
  },
  {
    id: "clausulas",
    titulo: "Cláusulas, clausulazos y blindaje",
    reglas: [
      { texto: "Cláusula inicial: 1 M si el jugador vale menos de 1 M; si no, un porcentaje del valor (las guías dicen 166 % o 66 %).", verificar: true },
      { texto: "Subir la cláusula va 1:2: por cada euro que pagas, la cláusula sube 2." },
      { texto: "Un jugador recién fichado tiene la cláusula bloqueada 2 semanas." },
      { texto: "Las cláusulas cierran con el mercado, 24 horas antes de la jornada." },
      { texto: "Blindaje: protege jugadores con la cláusula abierta durante 24 horas por jornada (48 en Premium). Es gratis viendo un anuncio, con dos blindajes por jornada (doble blindaje)." },
    ],
    consejos: [
      "La ventana de clausulazos más peligrosa es justo antes del cierre del mercado y durante los parones, cuando no hay protección automática.",
      "Apunta cuándo se libera la cláusula de las estrellas de tus rivales (el Espía avisa) y ten el dinero preparado ese día.",
      "Sube la cláusula solo a quien de verdad no quieres perder y a quien alguien puede pagar: cuesta la mitad de lo que sube y ese dinero ya no vuelve.",
      "Usa el blindaje en los momentos de riesgo (último día antes de la jornada o el parón) y en tu jugador más caro con la cláusula abierta.",
      "Si no te importa vender a un jugador, deja la cláusula baja como anzuelo: quien lo quiera, que pague su valor.",
      "Guarda un colchón para responder si te clausulan a alguien clave.",
    ],
    fuentes: [F.tracker, F.laligaBlindaje, F.jpParon, F.afClausulas],
  },
  {
    id: "paron",
    titulo: "Parones de selecciones",
    reglas: [
      { texto: "Sin jornada, el valor solo se mueve por compras y ventas, no por puntos." },
    ],
    consejos: [
      "Al principio del parón suelen subir los jugadores con bombo o los que heredan minutos; en la última semana se frena o baja porque los especuladores venden.",
      "Vende solo lo que compraste para especular y no vas a alinear. A un titular con minutos no lo vendas porque esté en rojo: se recompra caro.",
      "En el parón no hay protección de cláusulas: blinda o sube la cláusula de tus estrellas, o asume el riesgo.",
    ],
    fuentes: [F.afParon, F.jpParon, F.jpValor],
  },
  {
    id: "alineacion",
    titulo: "Alineación y capitán",
    reglas: [
      { texto: "Se alinean 11 en una formación permitida antes de que empiece la jornada; cuenta la última guardada." },
      { texto: "El capitán dobla los puntos de un titular y solo cuenta si juega.", verificar: true },
      { texto: "Premium: banquillo de 4 (uno por posición, solo sustituye en su posición), entrenador, más formaciones y cesiones." },
      { texto: "Máximo 24 jugadores en plantilla.", verificar: true },
    ],
    consejos: [
      "Revisa los onces probables antes de cerrar la alineación: un lesionado o suplente es un cero.",
      "Capitán a quien tenga más suelo y techo esa jornada: titular seguro, en forma y con rival fácil, mejor si tira los penaltis.",
      "No cargues muchos jugadores del mismo equipo y la misma línea, salvo Madrid o Barça, que puntúan aunque pierdan.",
      "Ten recambios baratos y estables en las posiciones que menos puntúan para gastar en las que más.",
      "Ojo a las semanas con Copa y Europa: hay más rotaciones.",
    ],
    fuentes: [F.tracker, F.laligaNovedades, F.comuniate, F.afGuia],
  },
];

export const TEMAS = MANUAL.map((t) => t.id);

// Texto de un tema para el chat. "todo" = índice con los títulos.
export function tema(id: string) {
  if (id === "todo") return { temas: MANUAL.map((t) => ({ id: t.id, titulo: t.titulo })) };
  const t = MANUAL.find((x) => x.id === id);
  if (!t) return { error: `Tema desconocido. Temas: ${TEMAS.join(", ")}` };
  return {
    titulo: t.titulo,
    reglas: t.reglas.map((r) => (r.verificar ? `${r.texto} (según guías; confirmar en la app)` : r.texto)),
    consejos: t.consejos,
    fuentes: t.fuentes.map((f) => f.nombre),
  };
}
