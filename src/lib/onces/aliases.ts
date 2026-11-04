// Emparejados a mano cuando el automático falla: id de futbolfantasy -> id de LaLiga Fantasy.
// El id de futbolfantasy sale en el log de `npm run onces` ("sin emparejar").
export const PLAYER_ALIASES: Record<string, string> = {
  "11683": "2621", // Gorrotxategi -> Gorrotxa (RSO)
  "5565": "3102", // Vinicius -> Vini Jr. (RMA)
};

// Lo mismo para Analítica Fantasy (sus ids son otros).
export const AF_ALIASES: Record<string, string> = {
  "287654": "2621", // Jon Gorrotxategi -> Gorrotxa (RSO)
};
