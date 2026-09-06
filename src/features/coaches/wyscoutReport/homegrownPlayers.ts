// src/features/coaches/wyscoutReport/homegrownPlayers.ts

/** Jugadores surgidos de inferiores de cada club, por coach_key. Vacio hasta que
 *  el usuario mande la lista -- una vez completo, el grafico de uso por partido
 *  (homegrownUsage.ts) se activa solo, sin tocar nada mas. */
export const HOMEGROWN_PLAYERS_BY_COACH: Record<string, string[]> = {}
