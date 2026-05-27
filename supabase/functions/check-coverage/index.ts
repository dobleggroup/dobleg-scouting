import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const API_KEY = Deno.env.get('API_FOOTBALL_KEY')!;
const BASE_URL = Deno.env.get('API_FOOTBALL_BASE_URL') || 'https://v3.football.api-sports.io';

serve(async (req) => {
  const { fixture_id } = await req.json().catch(() => ({ fixture_id: 1499427 }));

  const playersRes = await fetch(`${BASE_URL}/fixtures/players?fixture=${fixture_id}`, {
    headers: { 'x-apisports-key': API_KEY },
  });
  const playersData = await playersRes.json();

  const lineupsRes = await fetch(`${BASE_URL}/fixtures/lineups?fixture=${fixture_id}`, {
    headers: { 'x-apisports-key': API_KEY },
  });
  const lineupsData = await lineupsRes.json();

  return new Response(JSON.stringify({
    fixture_id,
    players_results: playersData.results ?? 0,
    lineups_results: lineupsData.results ?? 0,
    players_sample: playersData.response?.[0]?.players?.slice(0, 2) ?? null,
    lineups_sample: lineupsData.response?.[0]?.formation ?? null,
  }, null, 2), { status: 200 });
});
