import { supabase } from '@/lib/supabase';
import type {
  PlayerWithScore,
  PlayerMatchStat,
  PlayerSeasonScore,
  PositionAverage,
  PositionMetricAverages,
  Position,
  LeagueInfo,
  RecentFormPlayer,
} from '@/types/scoring';

/**
 * Temporada(s) vigente(s) a incluir por defecto en las consultas de stats/scores.
 *
 * Las ligas de calendario europeo (ago-may: Primeira Liga, Bundesliga, Premier
 * League, etc.) numeran la temporada por el año en que arrancó — la 2025/26 es
 * `season = 2025` en `leagues` — mientras que las de calendario anual (Sudamérica,
 * MLS) usan el año en curso (`season = 2026`). No existe un único "año vigente" que
 * sirva para ambas convenciones a la vez.
 *
 * Antes esta función intentaba adivinar cuál de las dos aplicaba según el mes y
 * colapsaba a un solo año cuando coincidían — en agosto 2026 devolvía sólo [2026],
 * dejando afuera TODA fila de una liga europea (todavía en season=2025 porque la
 * 2026/27 recién arranca) y de cualquier otra que no haya rotado. Eso vaciaba el
 * score de jugadores en ligas enteras, no un caso puntual. Devolver siempre los dos
 * últimos años cubre ambas convenciones sin depender de en qué mes cambia cada una;
 * el resto del pipeline (dedup por partidos jugados / equipo) ya sabe quedarse con
 * la fila más representativa entre las que traiga.
 */
export function currentSeasons(): number[] {
  const year = new Date().getFullYear();
  return [year - 1, year];
}

export async function fetchPlayersList(filters: {
  positions?: Position[];
  league_id?: number;
  team_id?: number;
  min_score?: number;
  min_age?: number;
  max_age?: number;
  min_matches?: number;
  min_market_value?: number;
  max_market_value?: number;
  max_contract_months?: number;
  agents?: string[];
  search?: string;
  season?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ players: PlayerWithScore[]; count: number }> {
  const seasons = filters.season ? [filters.season] : currentSeasons();
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 50;

  // El colapso a 1 fila por jugador (sobre las múltiples filas posición/temporada/liga
  // de player_season_scores) se hace en el RPC fetch_players_list ANTES de paginar.
  // Así el contador es de JUGADORES únicos y un jugador no reaparece en varias páginas.
  const { data, error } = await supabase.rpc('fetch_players_list', {
    p_seasons: seasons,
    p_positions: filters.positions?.length ? filters.positions : null,
    p_league_id: filters.league_id ?? null,
    p_team_id: filters.team_id ?? null,
    p_min_score: filters.min_score ?? null,
    p_min_matches: filters.min_matches ?? null,
    p_min_age: filters.min_age ?? null,
    p_max_age: filters.max_age ?? null,
    p_min_market_value: filters.min_market_value ?? null,
    p_max_market_value: filters.max_market_value ?? null,
    p_max_contract_months: filters.max_contract_months ?? null,
    p_agents: filters.agents?.length ? filters.agents : null,
    p_search: filters.search ?? null,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw error;

  const result = (data ?? { count: 0, players: [] }) as {
    count: number;
    players: PlayerWithScore[];
  };
  return { players: result.players ?? [], count: result.count ?? 0 };
}

/**
 * `fetchPlayerDetail` trae las ultimas 2 temporadas (`currentSeasons()`) para no
 * perder jugadores de ligas con convencion de temporada distinta (ver el comentario
 * de `currentSeasons`) -- pero eso significa que un jugador con datos en ambas puede
 * traer 2 filas para la MISMA posicion (una por temporada). Sin deduplicar, "Score
 * por posicion" las mostraba como si fueran posiciones distintas (dos filas "EXT"
 * sin ninguna marca de que son anos distintos, indistinguible de un bug de
 * fragmentacion real) y el score principal de la ficha elegia la primera fila que
 * encontraba `.find()`, sin garantia de que fuera la temporada mas reciente.
 * Se queda con la fila de la temporada mas nueva para cada posicion.
 */
export function dedupeSeasonScoresByPosition(scores: PlayerSeasonScore[]): PlayerSeasonScore[] {
  const bestByPosition = new Map<string, PlayerSeasonScore>();
  for (const s of scores) {
    const existing = bestByPosition.get(s.position);
    if (!existing || s.season > existing.season) bestByPosition.set(s.position, s);
  }
  return [...bestByPosition.values()];
}

export async function fetchPlayerDetail(playerId: number, season?: number): Promise<{
  player: PlayerWithScore;
  matches: PlayerMatchStat[];
  allSeasonScores: PlayerSeasonScore[];
} | null> {
  const seasons = season ? [season] : currentSeasons();

  const [playerRes, scoresRes, matchesRes] = await Promise.all([
    supabase.from('players').select(`
      *, team:teams(id, name, logo, league_id)
    `).eq('id', playerId).single(),

    supabase.from('player_season_scores').select('*')
      .eq('player_id', playerId).in('season', seasons),

    supabase.from('player_match_stats').select(`
      *,
      fixture:fixtures(
        id, date, home_team_id, away_team_id, score_home, score_away, league_id,
        home_team:teams!fixtures_home_team_id_fkey(name),
        away_team:teams!fixtures_away_team_id_fkey(name)
      )
    `)
      .eq('player_id', playerId)
      .order('fixture(date)', { ascending: true }),
  ]);

  if (playerRes.error || !playerRes.data) return null;

  const seasonScores = dedupeSeasonScoresByPosition(scoresRes.data ?? []);
  const primaryScore = seasonScores.find(
    (s: any) => s.position === playerRes.data.primary_position
  );

  return {
    player: {
      ...playerRes.data,
      season_scores: seasonScores,
      primary_score: primaryScore?.avg_rating ?? null,
      primary_percentile: primaryScore?.percentile ?? null,
    },
    matches: matchesRes.data ?? [],
    allSeasonScores: seasonScores,
  };
}

export async function fetchPositionAverages(
  season?: number
): Promise<PositionAverage[]> {
  const seasons = season ? [season] : currentSeasons();

  const { data, error } = await supabase
    .from('player_season_scores')
    .select('position, league_id, avg_rating')
    .in('season', seasons)
    .not('avg_rating', 'is', null);

  if (error) throw error;

  const groups = new Map<string, { scores: number[]; league_id: number; position: string }>();
  for (const row of data ?? []) {
    const key = `${row.position}|${row.league_id}`;
    if (!groups.has(key)) groups.set(key, { scores: [], league_id: row.league_id, position: row.position });
    groups.get(key)!.scores.push(row.avg_rating);
  }

  return Array.from(groups.values()).map(g => ({
    position: g.position as Position,
    league_id: g.league_id,
    avg_score: Math.round((g.scores.reduce((a, b) => a + b, 0) / g.scores.length) * 10) / 10,
    player_count: g.scores.length,
  }));
}

export interface AgencyLiveDataRow {
  name: string;
  market_value_eur: number | null;
  transfermarkt_url: string | null;
  birth_date: string | null;
  nationality: string | null;
}

/**
 * Valor de mercado y link de Transfermarkt vivos de todo el roster Doble G, tal
 * cual los tiene `players` (refrescados semanalmente desde Transfermarkt por el
 * cron de `enrich-player`). Se filtra por `agent = 'Doble G Sports Group'` — mismo
 * campo, seteado por ese mismo enrich, que ya se usa en la auditoría de roster
 * para cruzar altas. Sirve para pisar el valor de mercado y el link de
 * Transfermarkt cargados a mano en el Sheet/`agencyPlayers.ts` de Scouting
 * Interno, que nadie vuelve a actualizar (o directamente nunca se cargó, caso
 * real: Rodrigo Schlegel sin fila en el Sheet legacy, ficha sin link a
 * Transfermarkt pese a que Supabase ya lo tiene).
 */
export async function fetchAgencyLiveData(): Promise<AgencyLiveDataRow[]> {
  const { data, error } = await supabase
    .from('players')
    .select('name, market_value_eur, transfermarkt_url, birth_date, nationality')
    .eq('agent', 'Doble G Sports Group');

  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    name: r.name as string,
    market_value_eur: typeof r.market_value_eur === 'number' && r.market_value_eur > 0 ? r.market_value_eur : null,
    transfermarkt_url: r.transfermarkt_url || null,
    birth_date: r.birth_date || null,
    nationality: r.nationality || null,
  }));
}

export async function fetchDistinctAgents(): Promise<string[]> {
  const { data, error } = await supabase
    .from('players')
    .select('agent')
    .not('agent', 'is', null)
    .order('agent');

  if (error) throw error;
  const unique = [...new Set((data ?? []).map((r: any) => r.agent as string).filter(Boolean))];
  return unique;
}

export async function fetchLeagues(): Promise<LeagueInfo[]> {
  const { data, error } = await supabase
    .from('leagues')
    .select('*')
    .eq('has_player_stats', true)
    .order('tier', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export interface TeamInfo {
  id: number;
  name: string;
  logo: string | null;
  league_id: number;
}

/**
 * Normaliza un nombre de club para detectar el mismo club duplicado dos veces
 * en `teams` — una fila de API-Football (id < 20000000) y otra de Sofascore
 * (id >= 20000000, a veces con un prefijo tipo "CA "/"CD " que la otra fuente
 * no usa, ej. "Independiente" vs "CA Independiente"). Saca acentos, mayúsculas
 * y prefijos de tipo de club común en Sudamérica.
 */
export function normalizeTeamName(name: string): string {
  const noAccents = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return noAccents
    .toLowerCase()
    .replace(/^(ca|cd|cf|ac|sd|csd|cs)\s+/i, '')
    .trim();
}

/**
 * `normalizeTeamName` sólo saca prefijos comunes ("CA "/"CD "...) — no
 * alcanza para casos como "CA Talleres" (API-Football) vs "Talleres Cordoba"
 * (Sofascore agrega la ciudad como sufijo para desambiguar, en vez de un
 * prefijo). Match real si son iguales o si uno es el otro más una palabra
 * extra al final (prefijo por palabras completas, no substring a ciegas —
 * "river" no debe matchear "riverside").
 */
function sameClub(a: string, b: string): boolean {
  if (a === b) return true;
  return a.startsWith(b + ' ') || b.startsWith(a + ' ');
}

/**
 * Un mismo club real puede tener dos filas en `teams` (API-Football y
 * Sofascore, mismo problema que los jugadores duplicados — ver dedup por
 * transfermarkt_id en fetch_players_list). Sin deduplicar, el selector de
 * club en Scout Externo dejaba elegir la copia de Sofascore, que trae menos
 * partidos sincronizados (jugadores recién debutados ausentes) y puede traer
 * un score distinto al de la ficha (identidad de jugador distinta) — mismo
 * problema para cualquier buscador de club libre por nombre, no sólo por
 * liga (ver `searchMarketTeams` en `marketService.ts`).
 *
 * Nunca se compara entre países distintos (un mismo nombre en dos países es
 * casi seguro dos clubes reales distintos, ej. "River Plate" en Argentina y
 * en Uruguay) — dentro del mismo país, dos nombres "emparentados" por
 * `sameClub` son casi con certeza el mismo club real duplicado por fuente.
 * Gana el id de API-Football (< 20000000) cuando hay un empate real.
 *
 * Agrupa por PAÍS, no por `league_id` exacto: un mismo club real puede tener
 * dos filas con `league_id` distinto si un proveedor lo asoció a la liga
 * doméstica y el otro a una copa nacional (mismo país) — agrupar por
 * `league_id` a secas dejaba pasar ese caso sin deduplicar (caso real:
 * "River Plate" con `league_id` de Liga Profesional en una fila y de Copa
 * Argentina en la otra, ambas Argentina — `searchMarketTeams` en Mercado
 * mostraba el club dos veces). Si no se provee `country` (llamadas que ya
 * vienen acotadas a una sola liga, como `fetchTeamsByLeague`), se cae al
 * agrupamiento por `league_id` de siempre — no cambia nada para esos casos.
 */
export function dedupeTeamsByName<T extends { id: number; name: string; league_id?: number | null; country?: string | null }>(teams: T[]): T[] {
  const byLeague = new Map<string, T[]>();
  for (const team of teams) {
    const groupKey = team.country != null ? `c:${team.country}` : `l:${team.league_id ?? ''}`;
    if (!byLeague.has(groupKey)) byLeague.set(groupKey, []);
    byLeague.get(groupKey)!.push(team);
  }

  const result: T[] = [];
  for (const group of byLeague.values()) {
    const kept: { team: T; norm: string }[] = [];
    for (const team of group) {
      const norm = normalizeTeamName(team.name);
      const matchIdx = kept.findIndex(k => sameClub(k.norm, norm));
      if (matchIdx === -1) {
        kept.push({ team, norm });
      } else if (kept[matchIdx].team.id >= 20000000 && team.id < 20000000) {
        kept[matchIdx] = { team, norm };
      }
    }
    result.push(...kept.map(k => k.team));
  }
  return result;
}

export async function fetchTeamsByLeague(leagueId: number): Promise<TeamInfo[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, logo, league_id')
    .eq('league_id', leagueId)
    .order('name');

  if (error) throw error;
  return dedupeTeamsByName(data ?? []).sort((a, b) => a.name.localeCompare(b.name));
}

export interface ScoreLookupEntry {
  player_id: number;
  name: string;
  score: number;
  position: Position;
  percentile: number | null;
  matches_played: number;
  team_name: string | null;
  team_logo: string | null;
  birth_date: string | null;
}

export interface ScoreLookupRow {
  player_id: number;
  name: string;
  current_team_id: number | null;
  transfermarkt_id: number | null;
  birth_date: string | null;
  team_name: string | null;
  team_logo: string | null;
  score: number;
  position: Position;
  /**
   * Posición declarada del jugador (`players.primary_position`), independiente
   * de la temporada — se usa para elegir qué fila de temporada representa al
   * jugador cuando tiene fragmentos en más de una posición (ver
   * `isNewerRepresentative`). Sin esto, una fila reciente con pocos partidos
   * en una posición ocasional le ganaba a la temporada real del jugador solo
   * por ser más nueva (caso real: José Paradela — 6.3 de 3 partidos como EXT
   * en 2026 tapaba su 7.0 real de 34 partidos como VI en 2025, su posición
   * de siempre — la ficha sí mostraba el 7.0 porque busca por posición
   * primaria, no solo por temporada más nueva).
   */
  primary_position: Position | null;
  percentile: number | null;
  matches_played: number;
  season: number;
  /**
   * Si `transfermarkt_id` está VALIDADO (mismo nombre normalizado + misma
   * fecha de nacimiento contra las demás filas que comparten ese id — ver
   * `player_identities`/`player_external_ids`, `confidence='confirmed'`, del
   * saneamiento de datos). Default `true` cuando no se especifica —
   * compatibilidad con los tests existentes, que ya representan casos reales
   * confirmados (Paradela, Vera, etc.). En producción `fetchScoreLookup`
   * SIEMPRE lo calcula explícito, nunca queda "sin especificar".
   *
   * La auditoría de saneamiento encontró 103 grupos donde el mismo
   * `transfermarkt_id` está mal asignado a dos personas reales distintas
   * (match automático de Transfermarkt sin piso de confianza suficiente —
   * ver `enrich.py`/`enrich-player`). Antes de este campo, esos 103 casos se
   * fusionaban en vivo acá mismo: dos jugadores distintos terminaban
   * mostrando un solo score mezclado en ficha/dashboard/comparación.
   */
  transfermarkt_id_confirmed?: boolean;
}

/**
 * Identidad real de la persona, no de la fila: mismo criterio que `dedupePlayers()`
 * en Informes (transfermarkt_id si lo tiene y está confirmado — ver
 * `transfermarkt_id_confirmed` — si no, nombre + fecha de nacimiento). Dos filas con
 * el mismo id de Transfermarkt CONFIRMADO son la misma persona (API-Football y
 * Sofascore duplicando al mismo jugador, o un fragmento de 1 partido detectado en
 * otra posición). Un transfermarkt_id sin confirmar NUNCA se usa para agrupar — mejor
 * tratar dos filas como personas distintas por error que fusionar dos personas reales
 * distintas por error (ver nota en `transfermarkt_id_confirmed`). Sin ninguno de los
 * dos datos, cada fila queda como su propia identidad — no se fusiona a ciegas sólo
 * por compartir nombre.
 */
function identityKey(row: ScoreLookupRow): string {
  const norm = (s: string) =>
    s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (row.transfermarkt_id && row.transfermarkt_id_confirmed !== false) return `tm:${row.transfermarkt_id}`;
  if (row.birth_date) return `nb:${norm(row.name)}|${row.birth_date}`;
  return `row:${row.player_id}`;
}

/**
 * Arma el mapa nombre→score.
 *
 * 1) Agrupa las filas por identidad REAL (no por nombre): así un jugador duplicado
 *    entre API-Football y Sofascore, o con un fragmento de 1 partido mal detectado en
 *    otra posición, siempre se resuelve dentro de su propio grupo — gana quien jugó
 *    más partidos ahí adentro (caso real: José Paradela mostraba 4.2, el score de un
 *    fragmento de 1 partido, en vez de su 6.5 real de 31 partidos; ambas filas son la
 *    misma persona vía transfermarkt_id).
 * 2) Recién ahí arma el mapa por nombre. Si dos identidades REALES distintas
 *    comparten nombre (dos personas de verdad, no un duplicado), el jugador de la
 *    agencia con `apiTeamId` conocido desempata por equipo (caso real: "Julián López"
 *    de Defensa y Justicia vs. otro "Julián López" de una liga menor — con
 *    transfermarkt_id o fecha de nacimiento ya quedan en grupos separados solos; esto
 *    es sólo el resguardo final para cuando ninguno de los dos datos está disponible).
 */
export function buildScoreLookup(
  rows: ScoreLookupRow[],
  agencyPlayers: { fullName: string; shortName: string; apiTeamId: number | null }[],
): Map<string, ScoreLookupEntry> {
  const norm = (s: string) =>
    s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const toEntry = (row: ScoreLookupRow): ScoreLookupEntry => ({
    player_id: row.player_id,
    name: row.name,
    score: row.score,
    position: row.position,
    percentile: row.percentile,
    matches_played: row.matches_played,
    team_name: row.team_name,
    team_logo: row.team_logo,
    birth_date: row.birth_date,
  });

  // Equipo actual conocido por jugador de agencia (usado en el paso 1 de abajo).
  const apiTeamIdByName = new Map<string, number>();
  for (const ap of agencyPlayers) {
    if (ap.apiTeamId) apiTeamIdByName.set(norm(ap.fullName), ap.apiTeamId);
  }

  // Paso 1: una fila representante por identidad real. Por defecto gana la temporada
  // más nueva (mismo criterio que `dedupeSeasonScoresByPosition` para la ficha
  // individual) y, dentro de la misma temporada, la de más partidos jugados — salvo
  // que el jugador sea de agencia con equipo actual conocido: ahí gana la fila de ESE
  // equipo aunque tenga menos partidos o sea de una temporada más vieja. Sin el
  // desempate por equipo, un jugador recién transferido queda tapado por su equipo
  // viejo indefinidamente: el equipo nuevo casi siempre tiene menos partidos
  // acumulados que el viejo apenas después de un traspaso (caso real: Mauricio Vera a
  // Bhayangkara FC — 2 partidos/score 6.8 — tapado por Nacional en Sofascore — 4
  // partidos/score 3.9 — porque el paso 1 descartaba la fila de Bhayangkara antes de
  // que el desempate por equipo del paso 2 llegara a verla).
  //
  // Sin el desempate por temporada, dos filas del MISMO jugador/equipo en años
  // distintos (nada que ver con un traspaso) se resolvían por partidos jugados nomás
  // — y la ficha individual (`dedupeSeasonScoresByPosition`) sí prioriza la temporada
  // más nueva, así que la lista y la ficha podían mostrar scores distintos para la
  // misma persona (caso real: Julián López con 9 partidos/score 5.0 en 2025 pero sólo
  // 6 partidos/score 4.8 en 2026 — la lista mostraba el 5.0 viejo, la ficha el 4.8
  // correcto).
  const isNewerRepresentative = (row: ScoreLookupRow, existing: ScoreLookupRow): boolean => {
    // Primero, la posición: una fila que coincide con la posición declarada del
    // jugador (`primary_position`) siempre gana, sin importar la temporada — evita
    // que un fragmento reciente de pocos partidos en una posición ocasional tape
    // la temporada real del jugador solo por ser más nueva (ver nota en
    // `ScoreLookupRow.primary_position`). Sólo si ambas coinciden o ninguna
    // coincide se cae al criterio de temporada/partidos de siempre.
    const rowIsPrimary = row.primary_position != null && row.position === row.primary_position;
    const existingIsPrimary = existing.primary_position != null && existing.position === existing.primary_position;
    if (rowIsPrimary !== existingIsPrimary) return rowIsPrimary;
    return row.season !== existing.season ? row.season > existing.season : row.matches_played > existing.matches_played;
  };

  const byIdentity = new Map<string, ScoreLookupRow>();
  for (const row of rows) {
    if (!row.name) continue;
    const key = identityKey(row);
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, row);
      continue;
    }
    const knownTeamId = apiTeamIdByName.get(norm(row.name));
    const rowMatchesTeam = knownTeamId != null && row.current_team_id === knownTeamId;
    const existingMatchesTeam = knownTeamId != null && existing.current_team_id === knownTeamId;
    if (rowMatchesTeam && !existingMatchesTeam) {
      byIdentity.set(key, row);
    } else if (!(existingMatchesTeam && !rowMatchesTeam) && isNewerRepresentative(row, existing)) {
      byIdentity.set(key, row);
    }
  }
  const representatives = Array.from(byIdentity.values());

  // Paso 2: por nombre, entre las identidades representantes (no entre filas sueltas).
  const map = new Map<string, ScoreLookupEntry>();
  const winnerRow = new Map<string, ScoreLookupRow>();
  for (const row of representatives) {
    const key = norm(row.name);
    const existing = winnerRow.get(key);
    if (!existing || row.matches_played > existing.matches_played) {
      winnerRow.set(key, row);
      map.set(key, toEntry(row));
    }
  }

  // Desempate por equipo: sólo entre identidades reales distintas que comparten
  // nombre (ver punto 2 del comentario de arriba). Si el ganador ya es del equipo de
  // la agencia se lo respeta tal cual.
  const bestByMatches = (candidates: ScoreLookupRow[]): ScoreLookupRow =>
    candidates.reduce((best, r) => (r.matches_played > best.matches_played ? r : best));

  for (const ap of agencyPlayers) {
    const fullKey = norm(ap.fullName);
    if (ap.apiTeamId) {
      const currentWinner = winnerRow.get(fullKey);
      if (!currentWinner || currentWinner.current_team_id !== ap.apiTeamId) {
        const teamRows = representatives.filter(r => norm(r.name) === fullKey && r.current_team_id === ap.apiTeamId);
        if (teamRows.length > 0) {
          const best = bestByMatches(teamRows);
          winnerRow.set(fullKey, best);
          map.set(fullKey, toEntry(best));
        }
      }
    }
    const shortKey = norm(ap.shortName);
    const entry = map.get(fullKey);
    if (entry && shortKey !== fullKey) {
      map.set(shortKey, entry);
    }
  }

  return map;
}

/**
 * IDs de Transfermarkt validados por nombre+fecha de nacimiento (ver
 * `player_identities`, `confidence='confirmed'`, del saneamiento de datos) —
 * usar para no confiar en un `transfermarkt_id` compartido por error entre
 * dos personas reales distintas (107 casos detectados en la auditoría).
 * Compartido entre `fetchScoreLookup` y `dedupePlayers` (Informes).
 */
export async function fetchConfirmedTransfermarktIds(): Promise<Set<number>> {
  const { data } = await supabase
    .from('player_external_ids')
    .select('external_id, player_identity:player_identities!inner(confidence)')
    .eq('source', 'transfermarkt')
    .eq('player_identity.confidence', 'confirmed');
  return new Set((data ?? []).map((r: any) => r.external_id as number));
}

export async function fetchScoreLookup(
  season?: number
): Promise<Map<string, ScoreLookupEntry>> {
  const seasons = season ? [season] : currentSeasons();

  const PAGE_SIZE = 1000;
  let allRows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('player_season_scores')
      .select(`
        player_id, position, avg_rating, percentile, matches_played, season,
        player:players!inner(name, current_team_id, transfermarkt_id, birth_date, primary_position, team:teams(name, logo))
      `)
      .in('season', seasons)
      .not('avg_rating', 'is', null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const rows = data ?? [];
    allRows = allRows.concat(rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const confirmedTmIds = await fetchConfirmedTransfermarktIds();

  const rows: ScoreLookupRow[] = allRows.map(row => {
    const tmId = ((row as any).player?.transfermarkt_id as number | null) ?? null;
    return {
      player_id: row.player_id,
      name: (row as any).player?.name as string,
      current_team_id: ((row as any).player?.current_team_id as number | null) ?? null,
      transfermarkt_id: tmId,
      transfermarkt_id_confirmed: tmId != null ? confirmedTmIds.has(tmId) : undefined,
      birth_date: ((row as any).player?.birth_date as string | null) ?? null,
      team_name: ((row as any).player?.team?.name as string | null) ?? null,
      team_logo: ((row as any).player?.team?.logo as string | null) ?? null,
      score: row.avg_rating,
      position: row.position as Position,
      primary_position: ((row as any).player?.primary_position as Position | null) ?? null,
      percentile: row.percentile,
      matches_played: row.matches_played,
      season: row.season,
    };
  });

  const { AGENCY_PLAYERS } = await import('@/constants/agencyPlayers');
  return buildScoreLookup(rows, AGENCY_PLAYERS);
}

export async function fetchPlayerMatchHistory(
  playerId: number,
  position?: Position,
): Promise<PlayerMatchStat[]> {
  let query = supabase
    .from('player_match_stats')
    .select(`
      *,
      fixture:fixtures(
        id, date, home_team_id, away_team_id, score_home, score_away, league_id,
        home_team:teams!fixtures_home_team_id_fkey(name),
        away_team:teams!fixtures_away_team_id_fkey(name)
      )
    `)
    .eq('player_id', playerId)
    .not('rating', 'is', null);

  if (position) query = query.eq('detected_position', position);

  query = query.order('fixture(date)', { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchPositionMetricAverages(
  season?: number
): Promise<PositionMetricAverages[]> {
  const seasons = season ? [season] : currentSeasons();

  const { data, error } = await supabase
    .from('position_metric_averages')
    .select('*')
    .in('season', seasons);

  if (error) throw error;
  return data ?? [];
}

export async function fetchRecentForm(opts: {
  windowMonths: number;
  minMatches?: number;
  fallbackMonths?: number;
  fallbackLimit?: number;
  cheapMaxValue?: number | null;
  contractMaxMonths?: number | null;
  positions?: string[];
  limit?: number;
}): Promise<RecentFormPlayer[]> {
  const { data, error } = await supabase.rpc('fetch_recent_form', {
    p_window_months: opts.windowMonths,
    p_min_matches: opts.minMatches ?? 3,
    p_fallback_months: opts.fallbackMonths ?? 6,
    p_fallback_limit: opts.fallbackLimit ?? 5,
    p_cheap_max_value: opts.cheapMaxValue ?? null,
    p_contract_max_months: opts.contractMaxMonths ?? null,
    p_positions: opts.positions?.length ? opts.positions : null,
    p_limit: opts.limit ?? 200,
  });
  if (error) throw error;
  return (data ?? []) as RecentFormPlayer[];
}

export interface MarketValueHistoryRow {
  player_id: number;
  recorded_at: string;
  value_eur: number;
  club_name: string | null;
}

export async function fetchMarketValueHistory(
  playerId: number
): Promise<MarketValueHistoryRow[]> {
  const { data, error } = await supabase
    .from('market_value_history')
    .select('player_id, recorded_at, value_eur, club_name')
    .eq('player_id', playerId)
    .order('recorded_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ── Jugadores duplicados (API-Football vs Sofascore) ──────────────────────────
// La base tiene el mismo jugador cargado dos veces: la fila de API-Football (foto
// media.api-sports.io) y la de Sofascore (foto api.sofascore.com). La de Sofascore
// tiene muchos menos partidos y su id NO existe en API-Football, así que traspasos
// y lesiones vuelven vacíos. Para todo lo que se lee por id conviene la de
// API-Football; se resuelve el "gemelo" por transfermarkt_id o por nombre+fecha.

export function isApiFootballPlayer(p: { photo?: string | null }): boolean {
  return (p.photo ?? '').includes('media.api-sports.io');
}

// Fecha del partido más reciente cargado para un jugador, o null si no tiene
// ninguno. Se usa para decidir entre las filas "gemelas" API-Football/Sofascore
// de abajo -- ver por qué en el comentario de `resolvePreferredPlayerId`.
async function latestMatchDate(playerId: number): Promise<string | null> {
  const { data } = await supabase
    .from('player_match_stats')
    .select('fixture:fixtures(date)')
    .eq('player_id', playerId)
    .order('fixture(date)', { ascending: false })
    .limit(1);
  const row = data?.[0] as { fixture?: { date: string } | { date: string }[] } | undefined;
  const fixture = Array.isArray(row?.fixture) ? row?.fixture[0] : row?.fixture;
  return fixture?.date ?? null;
}

const preferredIdCache = new Map<number, number>();

export async function resolvePreferredPlayerId(playerId: number): Promise<number> {
  const cached = preferredIdCache.get(playerId);
  if (cached != null) return cached;

  const { data: me } = await supabase
    .from('players')
    .select('id, name, birth_date, transfermarkt_id, photo')
    .eq('id', playerId)
    .maybeSingle();

  let resolved = playerId;

  if (me && !isApiFootballPlayer(me)) {
    let query = supabase.from('players').select('id, photo');
    if (me.transfermarkt_id) {
      query = query.eq('transfermarkt_id', me.transfermarkt_id);
    } else if (me.name && me.birth_date) {
      query = query.eq('name', me.name).eq('birth_date', me.birth_date);
    } else {
      query = query.eq('id', playerId); // sin forma de identificarlo: se queda como está
    }
    const { data: twins } = await query;
    const twin = (twins ?? []).find(t => t.id !== playerId && isApiFootballPlayer(t));
    if (twin) {
      // Antes esto siempre saltaba a la fila de API-Football. Cuando esa fila
      // no sigue al día (el jugador se transfirió y API-Football se quedó con
      // el club viejo), terminaba mostrando un club/liga que ya no es real —
      // caso real: Nahuel Arena se fue a CA Cerro (Uruguay) y la ficha lo
      // mostraba en Independ. Rivadavia porque esa fila de API-Football no
      // tenía partidos desde mayo, mientras Sofascore ya tenía agosto. Ahora
      // sólo se prefiere API-Football si no está más desactualizada.
      const [meLatest, twinLatest] = await Promise.all([
        latestMatchDate(playerId),
        latestMatchDate(twin.id),
      ]);
      if (!meLatest || (twinLatest && twinLatest >= meLatest)) {
        resolved = twin.id;
      }
    }
  }

  preferredIdCache.set(playerId, resolved);
  return resolved;
}

// ── Informes / pestaña Impacto ────────────────────────────────────────────────
// fetchPlayerMatchHistory filtra por posición detectada y por rating no nulo,
// lo que subcuenta partidos. Para contar continuidad hacen falta todas las filas.

export async function fetchPlayerAllMatches(playerId: number): Promise<PlayerMatchStat[]> {
  const { data, error } = await supabase
    .from('player_match_stats')
    .select(`
      *,
      fixture:fixtures(
        id, date, home_team_id, away_team_id, score_home, score_away, league_id,
        home_team:teams!fixtures_home_team_id_fkey(name),
        away_team:teams!fixtures_away_team_id_fkey(name)
      )
    `)
    .eq('player_id', playerId)
    .order('fixture(date)', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export interface TeamFixtureRow {
  id: number;
  date: string;
  league_id: number;
  home_team_id: number;
  away_team_id: number;
  score_home: number | null;
  score_away: number | null;
}

export async function fetchTeamFixtures(
  teamId: number,
  fromISO: string,
  toISO?: string,
): Promise<TeamFixtureRow[]> {
  let query = supabase
    .from('fixtures')
    .select('id, date, league_id, home_team_id, away_team_id, score_home, score_away')
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .gte('date', fromISO)
    .order('date', { ascending: true });

  if (toISO) query = query.lte('date', `${toISO}T23:59:59`);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export interface SquadStatRow {
  player_id: number;
  team_id: number;
  minutes: number;
  goals: number;
  assists: number;
  shots_total: number;
  shots_on: number;
  passes_total: number;
  passes_key: number;
  passes_accuracy: number | null;
  tackles: number;
  interceptions: number;
  duels_won: number;
  duels_total: number;
  dribbles_success: number;
  dribbles_attempted: number;
  rating: number | null;
  detected_position: string | null;
  fixture_id: number;
  player?: { name: string } | null;
  fixture?: { date: string } | null;
}

const SQUAD_STAT_COLUMNS = `
  player_id, team_id, fixture_id, minutes, goals, assists,
  shots_total, shots_on, passes_total, passes_key, passes_accuracy,
  tackles, interceptions, duels_won, duels_total, dribbles_success, dribbles_attempted,
  rating, detected_position,
  player:players(name),
  fixture:fixtures!inner(date)
`;

// PostgREST corta en 1000 filas. Un plantel de una temporada ya anda por las 900
// y el corte es silencioso: los rankings del informe saldrían con datos a medias.
// Por eso se pagina hasta traer todo.
const SQUAD_PAGE = 1000;

/**
 * Pagina un select de `player_match_stats` hasta traer todo. Antes esto pedía
 * cada página en serie (`await` una por una dentro de un `for`) — el `.in()`
 * de ~30 equipos a un año del Home eran 20-40 round-trips seguidos, y era la
 * carga más lenta de esa pantalla (ver reporte de "tarda muchísimo"). Ahora
 * la primera página pide el total con `count: 'exact'` (mismo round-trip, sin
 * costo extra) y el resto de las páginas se piden todas juntas con
 * `Promise.all` en vez de una atrás de la otra.
 */
async function fetchAllSquadStatPages(
  buildPage: (page: number, withCount: boolean) => PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
    count?: number | null;
  }>,
): Promise<SquadStatRow[]> {
  const first = await buildPage(0, true);
  if (first.error) throw first.error;
  const firstRows = (first.data ?? []) as unknown as SquadStatRow[];
  const total = first.count ?? firstRows.length;
  const totalPages = Math.max(1, Math.ceil(total / SQUAD_PAGE));
  if (totalPages <= 1) return firstRows;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => buildPage(i + 1, false)),
  );
  for (const r of rest) if (r.error) throw r.error;

  return [firstRows, ...rest.map(r => (r.data ?? []) as unknown as SquadStatRow[])].flat();
}

export async function fetchSquadMatchStats(
  teamId: number,
  fromISO: string,
  toISO?: string,
): Promise<SquadStatRow[]> {
  return fetchAllSquadStatPages((page, withCount) => {
    let query = supabase
      .from('player_match_stats')
      .select(SQUAD_STAT_COLUMNS, withCount ? { count: 'exact' } : undefined)
      .eq('team_id', teamId)
      .gte('fixture.date', fromISO)
      .order('fixture_id', { ascending: true })
      .range(page * SQUAD_PAGE, (page + 1) * SQUAD_PAGE - 1);

    if (toISO) query = query.lte('fixture.date', `${toISO}T23:59:59`);
    return query;
  });
}

/**
 * Igual que `fetchSquadMatchStats` pero para varios equipos en una sola tanda
 * de queries (`.in('team_id', ...)`) en vez de una por equipo. La agencia
 * tiene jugadores en ~30 equipos distintos — pedirle a Supabase 30 queries en
 * paralelo (`Promise.all` de `fetchSquadMatchStats`) satura el pool de
 * conexiones y cada una termina esperando su turno; una sola query con `in`
 * evita esa cola. Usado por `fetchAgencyPerformanceRows` (Home).
 */
export async function fetchMultiTeamMatchStats(
  teamIds: number[],
  fromISO: string,
  toISO?: string,
): Promise<SquadStatRow[]> {
  if (teamIds.length === 0) return [];

  return fetchAllSquadStatPages((page, withCount) => {
    let query = supabase
      .from('player_match_stats')
      .select(SQUAD_STAT_COLUMNS, withCount ? { count: 'exact' } : undefined)
      .in('team_id', teamIds)
      .gte('fixture.date', fromISO)
      .order('fixture_id', { ascending: true })
      .range(page * SQUAD_PAGE, (page + 1) * SQUAD_PAGE - 1);

    if (toISO) query = query.lte('fixture.date', `${toISO}T23:59:59`);
    return query;
  });
}
