// src/features/coaches/wyscoutReport/homegrownPlayers.ts

/** Jugadores surgidos de inferiores de cada club, por coach_key. Vacio hasta que
 *  el usuario mande la lista -- completarla es NECESARIO pero no SUFICIENTE
 *  para que el grafico de uso por partido (homegrownUsage.ts) aparezca: hoy
 *  nada fuera de sus propios tests importa `homegrownUsage.ts` ni este
 *  record, asi que ademas de la lista falta cablear el panel (recibir
 *  `coach` como prop y renderizar el grafico) -- trabajo futuro, Task 22 del
 *  plan. */
export const HOMEGROWN_PLAYERS_BY_COACH: Record<string, string[]> = {}
