import { useState, useEffect } from 'react';
import {
  fetchPlayersList,
  fetchPlayerDetail,
  fetchPositionAverages,
  fetchPositionMetricAverages,
  fetchLeagues,
  fetchDistinctAgents,
  fetchPlayerMatchHistory,
  fetchPlayerAllMatches,
  resolvePreferredPlayerId,
  resolveApiFootballTwinId,
  fetchScoreLookup,
  fetchMarketValueHistory,
  fetchRecentForm,
  type ScoreLookupEntry,
  type MarketValueHistoryRow,
} from '@/services/playerStatsService';
import type { PlayerWithScore, PlayerMatchStat, PositionAverage, PositionMetricAverages, LeagueInfo, Position, RecentFormPlayer } from '@/types/scoring';

const cache = new Map<string, { data: any; timestamp: number }>();

function getCached<T>(key: string, staleMins: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > staleMins * 60 * 1000) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

export function usePlayersList(filters: Parameters<typeof fetchPlayersList>[0]) {
  const [players, setPlayers] = useState<PlayerWithScore[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const cached = getCached<{ players: PlayerWithScore[]; count: number }>(
      `list:${filtersKey}`, 60
    );
    if (cached) {
      setPlayers(cached.players);
      setCount(cached.count);
      setLoading(false);
      return;
    }

    fetchPlayersList(filters)
      .then(result => {
        if (cancelled) return;
        setPlayers(result.players);
        setCount(result.count);
        setCache(`list:${filtersKey}`, result);
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [filtersKey]);

  return { players, count, loading, error };
}

export function usePlayerDetail(playerId: number | null) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPlayerDetail>>>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    const cached = getCached<typeof data>(`detail:${playerId}`, 30);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    fetchPlayerDetail(playerId)
      .then(result => {
        if (cancelled) return;
        setData(result);
        setCache(`detail:${playerId}`, result);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [playerId]);

  return { data, loading };
}

export function usePositionAverages() {
  const [averages, setAverages] = useState<PositionAverage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = getCached<PositionAverage[]>('posAvg', 240);
    if (cached) { setAverages(cached); setLoading(false); return; }

    fetchPositionAverages()
      .then(data => { setAverages(data); setCache('posAvg', data); })
      .finally(() => setLoading(false));
  }, []);

  return { averages, loading };
}

export function useAgents() {
  const [agents, setAgents] = useState<string[]>([]);

  useEffect(() => {
    const cached = getCached<string[]>('agents', 240);
    if (cached) { setAgents(cached); return; }

    fetchDistinctAgents().then(data => { setAgents(data); setCache('agents', data); });
  }, []);

  return agents;
}

export function useLeagues() {
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);

  useEffect(() => {
    const cached = getCached<LeagueInfo[]>('leagues', 240);
    if (cached) { setLeagues(cached); return; }

    fetchLeagues().then(data => { setLeagues(data); setCache('leagues', data); });
  }, []);

  return leagues;
}

export function useScoreLookup(): { lookup: Map<string, ScoreLookupEntry>; ready: boolean } {
  const [lookup, setLookup] = useState<Map<string, ScoreLookupEntry>>(new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const cached = getCached<Map<string, ScoreLookupEntry>>('scoreLookup', 60);
    if (cached) { setLookup(cached); setReady(true); return; }

    fetchScoreLookup()
      .then(data => {
        setLookup(data);
        setCache('scoreLookup', data);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  return { lookup, ready };
}

export function usePositionMetricAverages() {
  const [averages, setAverages] = useState<PositionMetricAverages[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = getCached<PositionMetricAverages[]>('posMetricAvg', 240);
    if (cached) { setAverages(cached); setLoading(false); return; }

    fetchPositionMetricAverages()
      .then(data => { setAverages(data); setCache('posMetricAvg', data); })
      .finally(() => setLoading(false));
  }, []);

  return { metricAverages: averages, loading };
}

export function usePlayerMatchHistory(playerId: number | null, position?: Position) {
  const [matches, setMatches] = useState<PlayerMatchStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    fetchPlayerMatchHistory(playerId, position)
      .then(data => { if (!cancelled) setMatches(data); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [playerId, position]);

  return { matches, loading };
}

/**
 * Fila oficial del futbolista (players.canonical_id): la misma que muestran todas las
 * listas. Mientras resuelve devuelve el id original.
 */
/** Id de API-Football del mismo futbolista, para traspasos y lesiones (solo existen en
 *  esa API). null si no tiene fila de API-Football o mientras resuelve. */
export function useApiFootballTwinId(playerId: number | null): number | null {
  const [twin, setTwin] = useState<number | null>(null);

  useEffect(() => {
    setTwin(null);
    if (!playerId) return;
    let cancelled = false;
    resolveApiFootballTwinId(playerId)
      .then(id => { if (!cancelled) setTwin(id); })
      .catch(() => { /* sin gemelo */ });
    return () => { cancelled = true; };
  }, [playerId]);

  return twin;
}

export function usePreferredPlayerId(playerId: number | null): number | null {
  const [resolved, setResolved] = useState<number | null>(playerId);

  useEffect(() => {
    setResolved(playerId);
    if (!playerId) return;
    let cancelled = false;
    resolvePreferredPlayerId(playerId)
      .then(id => { if (!cancelled) setResolved(id); })
      .catch(() => { /* se queda con el original */ });
    return () => { cancelled = true; };
  }, [playerId]);

  return resolved;
}

/**
 * Todos los partidos del jugador, sin filtrar por posición ni por score cargado.
 * `usePlayerMatchHistory` sirve para el scoring (compara dentro de una posición),
 * pero para listar "sus últimos partidos" ese filtro se come partidos reales:
 * los que jugó en otro puesto o los que todavía no tienen Rating calculado.
 */
export function usePlayerAllMatches(playerId: number | null) {
  const [matches, setMatches] = useState<PlayerMatchStat[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!playerId) { setMatches([]); setLoading(false); return; }
    const key = `allMatches:${playerId}`;
    const cached = getCached<PlayerMatchStat[]>(key, 10);
    if (cached) { setMatches(cached); setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    fetchPlayerAllMatches(playerId)
      .then(data => { if (!cancelled) { setMatches(data); setCache(key, data); } })
      .catch(() => { if (!cancelled) setMatches([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [playerId]);

  return { matches, loading };
}

export function useRecentForm(opts: Parameters<typeof fetchRecentForm>[0]) {
  const [players, setPlayers] = useState<RecentFormPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(opts);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchRecentForm(opts)
      .then(p => { if (alive) { setPlayers(p); setError(null); } })
      .catch(e => { if (alive) setError(e.message ?? 'Error'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { players, loading, error };
}

export function useMarketValueHistory(playerId: number | null) {
  const [data, setData] = useState<MarketValueHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!playerId) return;
    const key = `mvh-${playerId}`;
    const cached = getCached<MarketValueHistoryRow[]>(key, 60);
    if (cached) { setData(cached); return; }

    let cancelled = false;
    setLoading(true);
    fetchMarketValueHistory(playerId).then(rows => {
      if (cancelled) return;
      setData(rows);
      setCache(key, rows);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [playerId]);

  return { data, loading };
}
