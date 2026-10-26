// supabase/functions/check-api-quota/index.ts
//
// El cupo diario de API-Football se comparte con otras plataformas y el 18 y 19/10 se
// agotó a media tarde (el Inicio se quedó sin partidos). Cada hora se mira cuánto se usó
// (/status no descuenta del cupo) y, pasado el 80 %, se avisa a data_health_recipients
// una vez por día. El aviso dice cuánto fue nuestro (api_football_usage, cada consulta
// de las funciones suma ahí) y cuánto del resto (la app y las otras plataformas).

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';

const API_KEY = Deno.env.get('API_FOOTBALL_KEY')!;
const BASE_URL = Deno.env.get('API_FOOTBALL_BASE_URL') || 'https://v3.football.api-sports.io';
const ALERT_AT = 0.8;

const SOURCE_LABEL: Record<string, string> = {
  'sync-fixtures': 'partidos',
  'sync-player-stats': 'estadísticas',
  'fill-nationality': 'nacionalidades',
  'tm-rematch': 'revisión de Transfermarkt',
  'enrich-player': 'fichas pedidas desde la app',
  'backfill-season': 'carga de temporadas',
  'verify-leagues': 'revisión de ligas',
};

const fmt = (n: number) => n.toLocaleString('es-AR');

serve(async () => {
  const supabase = getSupabaseAdmin();
  try {
    const res = await fetch(new URL('/status', BASE_URL).toString(), { headers: { 'x-apisports-key': API_KEY } });
    const json = await res.json();
    const req = json?.response?.requests as { current?: number; limit_day?: number } | undefined;
    // Con el cupo agotado /status contesta con `errors` y sin números.
    const exhausted = !req && JSON.stringify(json?.errors ?? '').includes('request limit');
    const used = exhausted ? 1 : req?.current && req?.limit_day ? req.current / req.limit_day : null;
    if (used == null) throw new Error(`Respuesta inesperada de /status: ${JSON.stringify(json).slice(0, 200)}`);

    const today = new Date().toISOString().split('T')[0]; // el cupo vuelve a cero a las 00:00 UTC
    const { data: usage } = await supabase.from('api_football_usage').select('source, calls').eq('day', today);
    const ours = (usage ?? []).reduce((s: number, r: any) => s + r.calls, 0);
    const detail = (usage ?? [])
      .sort((a: any, b: any) => b.calls - a.calls)
      .map((r: any) => `${SOURCE_LABEL[r.source] ?? r.source} ${fmt(r.calls)}`)
      .join(', ');
    const split = req?.current
      ? ` Nuestros procesos usaron ${fmt(ours)}${detail ? ` (${detail})` : ''}; las otras ${fmt(Math.max(req.current - ours, 0))} son de la app y de las otras plataformas que comparten el cupo.`
      : '';

    let sent = 0;
    if (used >= ALERT_AT) {
      const pct = Math.round(used * 100);
      const msg = exhausted
        ? `API-Football: se terminó el cupo de consultas del día. El Inicio y los partidos nuevos vuelven a las 21:00.${ours ? ` Nuestros procesos usaron ${fmt(ours)}${detail ? ` (${detail})` : ''}.` : ''}`
        : `API-Football: ya se usó el ${pct}% del cupo del día (${fmt(req!.current!)} de ${fmt(req!.limit_day!)}).${split} Lo que puede esperar (nacionalidades, revisiones) ya está en pausa hasta las 21:00; los partidos y las estadísticas siguen hasta el 95%.`;
      const { data: recipients } = await supabase.from('data_health_recipients').select('user_id');
      const since = new Date(Date.now() - 20 * 3600000).toISOString();
      for (const r of recipients ?? []) {
        const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
          .eq('user_id', r.user_id).eq('type', 'data_health:api-quota').gte('created_at', since);
        if (count) continue;
        await supabase.from('notifications').insert({ user_id: r.user_id, club_id: 'dobleg', type: 'data_health:api-quota', message: msg, link: null });
        sent++;
      }
    }

    await supabase.from('sync_log').insert({
      function_name: 'check-api-quota', status: 'success', fixtures_processed: 0,
      error_message: `uso ${Math.round(used * 100)}%${req ? ` (${req.current}/${req.limit_day})` : ''}, nuestro ${ours}${sent ? `, avisos ${sent}` : ''}`,
    });
    return new Response(JSON.stringify({ used, sent }), { status: 200 });
  } catch (err) {
    await supabase.from('sync_log').insert({ function_name: 'check-api-quota', status: 'error', error_message: (err as Error).message });
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
