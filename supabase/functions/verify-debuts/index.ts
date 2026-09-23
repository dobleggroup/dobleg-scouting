// Confirma las alertas de debutantes contra la página de debuts de Transfermarkt.
//
// detect_debut_alerts solo conoce los partidos que cargamos: si un chico debutó antes de
// que empezáramos a cargar su liga, o en otra liga, o en una copa, para nosotros "debuta"
// más tarde. Cada alerta nueva nace 'pending' y la app no la muestra hasta que esta
// función la pasa a:
//   confirmed  Transfermarkt no tiene un debut profesional anterior.
//   adjusted   Tiene uno hasta 30 días antes (copa, partido sin cargar): se corrige la fecha.
//   rejected   Ya había debutado antes: la alerta era falsa y queda oculta para siempre.
//   no_tm      El jugador no tiene ficha de Transfermarkt vinculada: queda nuestro dato.
// Si Transfermarkt no responde, la alerta sigue 'pending' y se reintenta en la próxima vuelta.
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { getSupabaseAdmin } from '../_shared/supabase-client.ts'
import { judgeDebut, parseTmDebuts } from '../_shared/tm-debuts.ts'

const WEB_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
}
const DEFAULT_LIMIT = 40
const DELAY_MS = 700

type Supabase = ReturnType<typeof getSupabaseAdmin>

/** transfermarkt_id del jugador o, si no lo tiene, de cualquier mellizo de su grupo canónico. */
async function resolveTmId(supabase: Supabase, playerId: number): Promise<number | null> {
  const { data: p } = await supabase
    .from('players').select('id, canonical_id, transfermarkt_id').eq('id', playerId).maybeSingle()
  if (!p) return null
  if (p.transfermarkt_id) return p.transfermarkt_id
  const gid = p.canonical_id ?? p.id
  const { data: twins } = await supabase
    .from('players').select('transfermarkt_id')
    .or(`id.eq.${gid},canonical_id.eq.${gid}`)
    .not('transfermarkt_id', 'is', null)
    .limit(1)
  return twins?.[0]?.transfermarkt_id ?? null
}

async function fetchDebutsPage(tmId: number): Promise<string | null> {
  try {
    const res = await fetch(`https://www.transfermarkt.com/x/debuets/spieler/${tmId}`, { headers: WEB_HEADERS })
    if (!res.ok) return null
    const html = await res.text()
    // Página válida de jugador aunque no tenga debuts: trae el encabezado del perfil.
    return html.includes('data-header') || html.includes('responsive-table') ? html : null
  } catch {
    return null
  }
}

serve(async (req) => {
  const supabase = getSupabaseAdmin()
  let body: { limit?: number } = {}
  try { body = await req.json() } catch { /* body vacío */ }
  const limit = Math.min(Math.max(body.limit ?? DEFAULT_LIMIT, 1), 150)

  const { data: pending, error } = await supabase
    .from('debut_alerts')
    .select('player_id, debut_date')
    .eq('verification', 'pending')
    .order('debut_date', { ascending: false })
    .limit(limit)
  if (error) {
    await supabase.from('sync_log').insert({ function_name: 'verify-debuts', status: 'error', error_message: error.message })
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const counts = { confirmed: 0, adjusted: 0, rejected: 0, no_tm: 0, retry: 0 }
  for (const alert of pending ?? []) {
    const tmId = await resolveTmId(supabase, alert.player_id)
    const now = new Date().toISOString()
    if (!tmId) {
      await supabase.from('debut_alerts').update({ verification: 'no_tm', verified_at: now }).eq('player_id', alert.player_id)
      counts.no_tm++
      continue
    }
    const html = await fetchDebutsPage(tmId)
    await new Promise(r => setTimeout(r, DELAY_MS))
    if (!html) { counts.retry++; continue }

    const verdict = judgeDebut(alert.debut_date, parseTmDebuts(html))
    const patch: Record<string, unknown> = { verification: verdict.status, tm_debut_date: verdict.tmDebut, verified_at: now }
    if (verdict.status === 'adjusted') {
      patch.our_debut_date = alert.debut_date
      patch.debut_date = verdict.tmDebut
    }
    await supabase.from('debut_alerts').update(patch).eq('player_id', alert.player_id)
    counts[verdict.status]++
  }

  const processed = (pending?.length ?? 0) - counts.retry
  await supabase.from('sync_log').insert({
    function_name: 'verify-debuts',
    status: counts.retry > 0 && processed === 0 ? 'error' : 'success',
    fixtures_processed: processed,
    ...(counts.retry > 0 ? { error_message: `${counts.retry} sin respuesta de Transfermarkt, se reintentan` } : {}),
  })
  return new Response(JSON.stringify({ pending: pending?.length ?? 0, ...counts }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
