import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';
import {
  SOFASCORE_TOURNAMENTS,
  sofascoreTeamId,
  sofascorePlayerId,
  sofascoreFixtureId,
  sofascoreTeamLogo,
  sofascorePlayerPhoto,
  fetchCurrentSeason,
  fetchPastEvents,
  fetchEventLineups,
  fetchEventIncidents,
} from '../_shared/sofascore.ts';
import type { SofascoreLineupPlayer, SofascoreIncident } from '../_shared/sofascore.ts';
import { mapGridToPosition, parseFormationLines } from '../_shared/position-mapper.ts';
import { calculateMatchScore } from '../_shared/scoring.ts';
import type { PlayerMatchRow, Position } from '../_shared/types.ts';

const STATS_BATCH = 5;

function buildSyntheticGrid(outfieldIndex: number, formation: string): string | null {
  const lines = parseFormationLines(formation);
  let cumulative = 0;
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineSize = lines[lineIdx];
    if (outfieldIndex < cumulative + lineSize) {
      const col = outfieldIndex - cumulative + 1;
      const row = lineIdx + 2;
      return `${row}:${col}`;
    }
    cumulative += lineSize;
  }
  return null;
}

function sofascoreFallbackPosition(pos: string): Position | null {
  switch (pos?.toUpperCase()) {
    case 'G': return 'ARQ';
    case 'D': return 'CB';
    case 'M': return 'VC';
    case 'F': return 'DEL';
    default: return null;
  }
}

function hasDetailedStats(players: SofascoreLineupPlayer[]): boolean {
  const starter = players.find(p => !p.substitute && p.statistics);
  return (starter?.statistics?.minutesPlayed ?? 0) > 0;
}

function extractCards(incidents: SofascoreIncident[]): Map<number, { yellow: number; red: number }> {
  const cards = new Map<number, { yellow: number; red: number }>();
  for (const inc of incidents) {
    if (inc.incidentType === 'card' && inc.player?.id) {
      if (!cards.has(inc.player.id)) cards.set(inc.player.id, { yellow: 0, red: 0 });
      const entry = cards.get(inc.player.id)!;
      if (inc.incidentClass === 'yellow') entry.yellow++;
      else if (inc.incidentClass === 'red' || inc.incidentClass === 'yellowRed') entry.red++;
    }
  }
  return cards;
}

function mapPlayerStats(
  p: SofascoreLineupPlayer,
  fixtureId: number,
  teamId: number,
  position: Position | null,
  formation: string | null,
  grid: string | null,
  cards: { yellow: number; red: number } | undefined,
): PlayerMatchRow {
  const s = p.statistics;
  return {
    player_id: sofascorePlayerId(p.player.id),
    fixture_id: fixtureId,
    team_id: teamId,
    detected_position: position,
    formation,
    grid_position: grid,
    minutes: s.minutesPlayed ?? 0,
    rating: s.rating ?? null,
    is_substitute: p.substitute,
    goals: s.goals ?? 0,
    assists: s.goalAssist ?? 0,
    shots_total: (s.onTargetScoringAttempt ?? 0) + (s.shotOffTarget ?? 0),
    shots_on: s.onTargetScoringAttempt ?? 0,
    passes_total: s.totalPass ?? 0,
    passes_key: s.keyPass ?? 0,
    passes_accuracy: (s.totalPass ?? 0) > 0
      ? Math.round(((s.accuratePass ?? 0) / s.totalPass!) * 100 * 100) / 100
      : 0,
    tackles: s.totalTackle ?? 0,
    blocks: s.blockedScoringAttempt ?? 0,
    interceptions: s.interceptionWon ?? 0,
    duels_total: (s.duelWon ?? 0) + (s.duelLost ?? 0),
    duels_won: s.duelWon ?? 0,
    dribbles_attempted: s.totalContest ?? 0,
    dribbles_success: s.wonContest ?? 0,
    fouls_drawn: s.wasFouled ?? 0,
    fouls_committed: s.fouls ?? 0,
    yellow_cards: cards?.yellow ?? 0,
    red_cards: cards?.red ?? 0,
    penalty_won: 0,
    penalty_scored: 0,
    penalty_missed: 0,
    penalty_saved: 0,
    saves: s.saves ?? 0,
    goals_conceded: 0,
    match_score: null,
  };
}

serve(async (req) => {
  const supabase = getSupabaseAdmin();
  const results = { fixtures_discovered: 0, fixtures_synced: 0, players_inserted: 0, errors: [] as string[] };

  // Optional: { pages: 10 } for initial backfill (default 3 = ~60 recent events)
  let discoverPages = 3;
  let statsBatch = STATS_BATCH;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.pages) discoverPages = Math.min(body.pages, 30);
    if (body.batch) statsBatch = Math.min(body.batch, 30);
  } catch { /* empty body is fine */ }

  try {
    const { data: leagues } = await supabase
      .from('leagues')
      .select('id, season')
      .eq('source', 'sofascore')
      .eq('has_player_stats', true);

    if (!leagues || leagues.length === 0) {
      return json({ message: 'No Sofascore leagues configured' });
    }

    // ── Phase 1: discover finished events ──────────────────────

    for (const league of leagues) {
      const tournamentId = SOFASCORE_TOURNAMENTS[league.id];
      if (!tournamentId) continue;

      try {
        const season = await fetchCurrentSeason(tournamentId, league.season);
        const events = await fetchPastEvents(tournamentId, season.id, discoverPages);

        for (const event of events) {
          const fxId = sofascoreFixtureId(event.id);
          const homeId = sofascoreTeamId(event.homeTeam.id);
          const awayId = sofascoreTeamId(event.awayTeam.id);

          await supabase.from('teams').upsert([
            { id: homeId, name: event.homeTeam.name, logo: sofascoreTeamLogo(event.homeTeam.id), league_id: league.id },
            { id: awayId, name: event.awayTeam.name, logo: sofascoreTeamLogo(event.awayTeam.id), league_id: league.id },
          ], { onConflict: 'id' });

          const { error } = await supabase.from('fixtures').upsert({
            id: fxId,
            league_id: league.id,
            season: league.season,
            date: new Date(event.startTimestamp * 1000).toISOString(),
            home_team_id: homeId,
            away_team_id: awayId,
            score_home: event.homeScore.current,
            score_away: event.awayScore.current,
            stats_synced: false,
          }, { onConflict: 'id', ignoreDuplicates: true });

          if (!error) results.fixtures_discovered++;
        }
      } catch (err) {
        results.errors.push(`League ${league.id} discovery: ${(err as Error).message}`);
        if ((err as Error).message === 'SOFASCORE_BLOCKED') break;
      }
    }

    // ── Phase 2: sync stats for unsynced fixtures ──────────────

    const leagueIds = leagues.map(l => l.id);
    const { data: unsyncedFixtures } = await supabase
      .from('fixtures')
      .select('id, league_id, season, home_team_id, away_team_id, score_home, score_away')
      .eq('stats_synced', false)
      .in('league_id', leagueIds)
      .order('date', { ascending: false })
      .limit(statsBatch);

    if (!unsyncedFixtures || unsyncedFixtures.length === 0) {
      await logSync(supabase, results);
      return json(results);
    }

    for (const fixture of unsyncedFixtures) {
      try {
        const eventId = fixture.id - 20_000_000;

        let lineups;
        try {
          lineups = await fetchEventLineups(eventId);
        } catch {
          continue;
        }

        if (!lineups.confirmed) continue;
        if (!hasDetailedStats(lineups.home.players) && !hasDetailedStats(lineups.away.players)) continue;

        let cardMap = new Map<number, { yellow: number; red: number }>();
        try {
          const incidents = await fetchEventIncidents(eventId);
          cardMap = extractCards(incidents);
        } catch { /* non-critical */ }

        const allRows: PlayerMatchRow[] = [];

        for (const side of ['home', 'away'] as const) {
          const teamData = lineups[side];
          const formation = teamData.formation ?? null;
          const teamId = side === 'home' ? fixture.home_team_id : fixture.away_team_id;

          // Sort starters: GK first, then D, M, F (formation order)
          const starters = teamData.players.filter((p: SofascoreLineupPlayer) => !p.substitute);
          const subs = teamData.players.filter((p: SofascoreLineupPlayer) => p.substitute);

          const posOrder: Record<string, number> = { G: 0, D: 1, M: 2, F: 3 };
          const gk = starters.filter((p: SofascoreLineupPlayer) => p.position === 'G');
          const outfield = starters
            .filter((p: SofascoreLineupPlayer) => p.position !== 'G')
            .sort((a: SofascoreLineupPlayer, b: SofascoreLineupPlayer) =>
              (posOrder[a.position] ?? 4) - (posOrder[b.position] ?? 4));

          // Process goalkeepers
          for (const p of gk) {
            if (!p.statistics || (p.statistics.minutesPlayed ?? 0) === 0) continue;

            await upsertPlayer(supabase, p, teamId);

            const row = mapPlayerStats(p, fixture.id, teamId, 'ARQ', formation, '1:1', cardMap.get(p.player.id));
            // GK goals_conceded from match score
            row.goals_conceded = side === 'home' ? (fixture.score_away ?? 0) : (fixture.score_home ?? 0);
            allRows.push(row);
          }

          // Process outfield starters with synthetic grids
          for (let i = 0; i < outfield.length; i++) {
            const p = outfield[i];
            if (!p.statistics || (p.statistics.minutesPlayed ?? 0) === 0) continue;

            let position: Position | null = null;
            let grid: string | null = null;

            if (formation) {
              grid = buildSyntheticGrid(i, formation);
              position = grid ? mapGridToPosition(formation, grid) : null;
            }
            if (!position) position = sofascoreFallbackPosition(p.position);

            await upsertPlayer(supabase, p, teamId);
            allRows.push(mapPlayerStats(p, fixture.id, teamId, position, formation, grid, cardMap.get(p.player.id)));
          }

          // Process substitutes (no grid, use fallback position)
          for (const p of subs) {
            if (!p.statistics || (p.statistics.minutesPlayed ?? 0) === 0) continue;

            const position = sofascoreFallbackPosition(p.position);
            await upsertPlayer(supabase, p, teamId);
            allRows.push(mapPlayerStats(p, fixture.id, teamId, position, formation, null, cardMap.get(p.player.id)));
          }
        }

        // Calculate match scores
        for (const row of allRows) {
          const peers = allRows.filter(r => r.player_id !== row.player_id);
          row.match_score = calculateMatchScore(row, peers);
        }

        if (allRows.length > 0) {
          const deduped = [...new Map(allRows.map(r => [`${r.player_id}_${r.fixture_id}`, r])).values()];
          const { error } = await supabase.from('player_match_stats').upsert(
            deduped,
            { onConflict: 'player_id,fixture_id' },
          );
          if (error) throw error;
          results.players_inserted += deduped.length;
        }

        await supabase.from('fixtures').update({ stats_synced: true }).eq('id', fixture.id);
        results.fixtures_synced++;
      } catch (err) {
        const msg = `Fixture ${fixture.id}: ${(err as Error).message}`;
        results.errors.push(msg);
        await supabase.from('sync_log').insert({
          function_name: 'sync-sofascore',
          fixture_id: fixture.id,
          league_id: fixture.league_id,
          status: 'error',
          error_message: (err as Error).message,
        });
        if ((err as Error).message === 'SOFASCORE_BLOCKED') break;
      }
    }

    await logSync(supabase, results);
    return json(results);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

// ─── Helpers ────────────────────────────────────────────────────

async function upsertPlayer(supabase: ReturnType<typeof getSupabaseAdmin>, p: SofascoreLineupPlayer, teamId: number) {
  await supabase.from('players').upsert({
    id: sofascorePlayerId(p.player.id),
    name: p.player.name,
    photo: sofascorePlayerPhoto(p.player.id),
    current_team_id: teamId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
}

async function logSync(supabase: ReturnType<typeof getSupabaseAdmin>, results: { errors: string[]; fixtures_synced: number }) {
  await supabase.from('sync_log').insert({
    function_name: 'sync-sofascore',
    status: results.errors.length > 0 ? 'error' : 'success',
    error_message: results.errors.length > 0 ? results.errors.join('; ') : null,
    fixtures_processed: results.fixtures_synced,
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
