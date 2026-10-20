// supabase/functions/check-api-quota/index.ts
//
// El cupo diario de API-Football se comparte con otras plataformas y el 18 y 19/10 se
// agotó a media tarde (el Inicio se quedó sin partidos). Cada hora se mira cuánto se usó
// (/status no descuenta del cupo) y, pasado el 80 %, se avisa a data_health_recipients
// una vez por día.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';

const API_KEY = Deno.env.get('API_FOOTBALL_KEY')!;
const BASE_URL = Deno.env.get('API_FOOTBALL_BASE_URL') || 'https://v3.football.api-sports.io';
const ALERT_AT = 0.8;

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

    let sent = 0;
    if (used >= ALERT_AT) {
      const pct = Math.round(used * 100);
      const msg = exhausted
        ? 'API-Football: se terminó el cupo de consultas del día. El Inicio y los partidos nuevos vuelven a las 21:00.'
        : `API-Football: ya se usó el ${pct}% del cupo del día (${req!.current} de ${req!.limit_day}). Si se termina, el Inicio se queda sin partidos hasta las 21:00.`;
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
      error_message: `uso ${Math.round(used * 100)}%${req ? ` (${req.current}/${req.limit_day})` : ''}${sent ? `, avisos ${sent}` : ''}`,
    });
    return new Response(JSON.stringify({ used, sent }), { status: 200 });
  } catch (err) {
    await supabase.from('sync_log').insert({ function_name: 'check-api-quota', status: 'error', error_message: (err as Error).message });
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
