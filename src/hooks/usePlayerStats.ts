import { useState, useEffect } from 'react';
import {
  fetchPlayersList,
  fetchPlayerDetail,
  fetchPositionAverages,
  fetchPositionMetricAverages,
  fetchLeagues,
  fetchDistinctAgents,
  fetchPlayerMatchHistory,
  fetchScoreLookup,
  type ScoreLookupEntry,
} from '@/services/playerStatsService';
import type { PlayerWithScore, PlayerMatchStat, PositionAverage, PositionMetricAverages, LeagueInfo, Position } from '@/types/scoring';

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
