import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';
import { fetchCurrentSeason, fetchFinishedFixtures, fetchTeamCountry } from '../_shared/api-football.ts';

serve(async (req) => {
  const supabase = getSupabaseAdmin();
  const results = { processed: 0, inserted: 0, errors: [] as string[], seasonChanges: [] as string[] };

  let leagueIds: number[] | undefined;
  let fromDateOverride: string | undefined;
  let checkSeasons = new Date().getUTCHours() === 6; // una vez por día alcanza
  try {
    const body = await req.json().catch(() => ({}));
    if (body.league_ids && Array.isArray(body.league_ids)) {
      leagueIds = body.league_ids;
    }
    if (body.from_date && typeof body.from_date === 'string') {
      fromDateOverride = body.from_date;
    }
    if (body.check_seasons === true) checkSeasons = true;
  } catch { /* empty body is fine */ }

  try {
    let query = supabase
      .from('leagues')
      .select('id, season, last_synced_at, has_player_stats, is_cup, parent_league_id')
      .neq('source', 'sofascore')
      .order('id');

    if (leagueIds) {
      query = query.in('id', leagueIds);
    }

    const { data: leagues } = await query;

    if (!leagues || leagues.length === 0) {
      return new Response(JSON.stringify({ message: 'No leagues configured' }), { status: 200 });
    }

    const today = new Date().toISOString().split('T')[0];

    // Liga "de casa" por país (solo si el país tiene una única liga con estadísticas),
    // para ubicar a un equipo que solo aparece en una copa.
    const { data: domestic } = await supabase
      .from('leagues').select('id, country').eq('has_player_stats', true).eq('is_cup', false);
    const leagueByCountry = new Map<string, number | null>();
    for (const l of domestic ?? []) {
      leagueByCountry.set(l.country, leagueByCountry.has(l.country) ? null : l.id);
    }
    const checkedTeams = new Set<number>();

    for (const league of leagues) {
      try {
        // Se vuelve a mirar desde 3 días antes de la última pasada: un partido nocturno
        // sudamericano termina pasada la medianoche UTC con fecha del día anterior, y
        // arrancando desde el día de la última pasada quedaba afuera para siempre (faltaban
        // decenas de partidos por liga). Los que ya están no se tocan (ignoreDuplicates).
        // Una liga recién agregada (sin pasadas) arranca desde el inicio de su temporada.
        const OVERLAP_DAYS = 3;
        let fromDate = fromDateOverride
          ?? (league.last_synced_at
            ? new Date(new Date(league.last_synced_at).getTime() - OVERLAP_DAYS * 86400000).toISOString().split('T')[0]
            : null);
        if (!fromDate) {
          const current = await fetchCurrentSeason(league.id);
          fromDate = current?.start ?? `${league.season}-01-01`;
        }

        // La temporada de cada liga se cargaba a mano y las europeas quedaron en 2025
        // cuando arrancó la 2026/27 (sin partidos nuevos desde julio). Si API-Football
        // marca una temporada más nueva, se pasa a esa y se trae desde su inicio.
        let season = league.season;
        let seasonFrom = fromDate;
        if (checkSeasons) {
          const current = await fetchCurrentSeason(league.id);
          if (current && current.year > league.season) {
            season = current.year;
            seasonFrom = fromDateOverride ?? current.start;
            await supabase.from('leagues').update({ season }).eq('id', league.id);
            results.seasonChanges.push(`${league.id}: ${league.season} -> ${season}`);
          }
        }

        const fixtures = await fetchFinishedFixtures(league.id, season, seasonFrom, today);

        for (const f of fixtures) {
          const { error } = await supabase.from('fixtures').upsert({
            id: f.fixture.id,
            league_id: league.id,
            season,
            date: f.fixture.date,
            home_team_id: f.teams.home.id,
            away_team_id: f.teams.away.id,
            score_home: f.goals.home,
            score_away: f.goals.away,
            stats_synced: false,
          }, { onConflict: 'id', ignoreDuplicates: true }); // no volver a pedir stats ya cargadas

          if (!error) results.inserted++;

          // Una copa (Libertadores, Sudamericana...) no es la liga del equipo: sus partidos
          // cuentan para las estadísticas del jugador, pero no le cambian la liga. Un torneo
          // con liga madre (Apertura de Paraguay) asigna los equipos a la madre.
          const teamLeagueId = league.parent_league_id ?? league.id;
          if (league.has_player_stats && !league.is_cup) {
            await supabase.from('teams').upsert([
              { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo, league_id: teamLeagueId },
              { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo, league_id: teamLeagueId },
            ], { onConflict: 'id' });
          } else {
            await supabase.from('teams').upsert([
              { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
              { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo },
            ], { onConflict: 'id', ignoreDuplicates: true });
            if (league.is_cup) {
              for (const team of [f.teams.home, f.teams.away]) {
                if (checkedTeams.has(team.id)) continue;
                checkedTeams.add(team.id);
                const { data: row } = await supabase.from('teams').select('league_id').eq('id', team.id).single();
                if (row?.league_id != null) continue;
                const country = await fetchTeamCountry(team.id);
                const home = country ? leagueByCountry.get(country) : null;
                if (home != null) {
                  await supabase.from('teams').update({ league_id: home }).eq('id', team.id);
                }
              }
            }
          }
        }

        await supabase.from('leagues').update({ last_synced_at: new Date().toISOString() })
          .eq('id', league.id);

        results.processed++;
      } catch (err) {
        const msg = `League ${league.id}: ${(err as Error).message}`;
        results.errors.push(msg);
        if ((err as Error).message === 'RATE_LIMITED') break;
      }
    }

    await supabase.from('sync_log').insert({
      function_name: 'sync-fixtures',
      status: results.errors.length > 0 ? 'error' : 'success',
      error_message: results.errors.length > 0 ? results.errors.join('; ') : null,
      fixtures_processed: results.inserted,
    });

    return new Response(JSON.stringify(results), { status: 200 });
  } catch (err) {
    await supabase.from('sync_log').insert({
      function_name: 'sync-fixtures',
      status: 'error',
      error_message: (err as Error).message,
    });
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
