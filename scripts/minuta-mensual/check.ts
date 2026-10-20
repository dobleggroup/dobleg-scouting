/**
 * Chequeo del día 5 (un día antes del envío): ¿está todo cargado para la minuta?
 *   npx vite-node scripts/minuta-mensual/check.ts -- 2026-09 [--avisar]
 * Revisa partidos sin estadísticas, Wyscout pendiente, jugadores sin ninguna
 * fuente y que las tareas automáticas (API-Football, Sofascore, Transfermarkt)
 * hayan corrido. Con --avisar deja el resumen en las notificaciones de la
 * plataforma de los que reciben los avisos de salud de datos.
 */
import { supabase } from '@/lib/supabase'
import { loadMinuta } from '@/features/minuta/loadMinuta'
import { buildReport, monthName, shiftMonth } from '@/features/minuta/analyze'

const args = process.argv.slice(2).filter(a => a !== '--')
const notify = args.includes('--avisar')
const today = new Date()
const month = args.find(a => /^\d{4}-\d{2}$/.test(a)) ?? shiftMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`, -1)
const from = `${month}-01`, to = `${shiftMonth(month, 1)}-01`

const data = await loadMinuta(month, { coaches: false })
const report = buildReport(data)
const problems: string[] = []

// 1) Partidos jugados del mes que todavía no tienen estadísticas.
const teamIds = [...new Set(data.teamFixtures.map(f => f.teamId))]
const { data: pending } = await supabase.from('fixtures')
  .select('id, date, home_team_id, away_team_id, stats_synced, score_home')
  .gte('date', from).lt('date', to).lt('date', new Date(Date.now() - 6 * 3600e3).toISOString())
  .or(`home_team_id.in.(${teamIds.join(',')}),away_team_id.in.(${teamIds.join(',')})`)
  .or('stats_synced.eq.false,score_home.is.null')
if (pending?.length) {
  const names = [...new Set(pending.flatMap(f => [f.home_team_id, f.away_team_id]).filter(id => teamIds.includes(id)).map(id => data.teamNames.get(id) ?? String(id)))]
  problems.push(`${pending.length} partidos de ${monthName(month)} sin estadísticas cargadas (${names.slice(0, 8).join(', ')}${names.length > 8 ? '…' : ''}).`)
}

// 2) Jugaron en el mes (según API/Sofascore) y no tienen Wyscout del mes.
const noWy = report.players.filter(p => p.sources.partidos && p.nums.matches > 0 && !p.sources.wyscout)
if (noWy.length) problems.push(`Falta cargar Wyscout de ${noWy.length}: ${noWy.map(p => p.name).join(', ')}.`)

// 3) Sin ninguna fuente.
if (report.coverage.none.length) problems.push(`Sin ninguna fuente en el mes (${report.coverage.none.length}): ${report.coverage.none.map(p => `${p.name} (${p.club})`).join(', ')}.`)

// 4) Tareas automáticas: la última corrida buena de cada una.
const JOBS: Array<[string, string, number]> = [
  ['sync-fixtures', 'Partidos de API-Football', 6],
  ['sync-player-stats', 'Estadísticas de API-Football', 12],
  ['sync-sofascore-py', 'Sofascore', 12],
  ['recalc-scores', 'Recálculo de ratings', 24],
]
for (const [fn, label, hours] of JOBS) {
  const { data: last } = await supabase.from('sync_log').select('created_at').eq('function_name', fn).eq('status', 'success')
    .order('created_at', { ascending: false }).limit(1)
  const at = last?.[0]?.created_at
  if (!at || Date.now() - Date.parse(at) > hours * 3600e3) problems.push(`${label}: no corre bien desde ${at ? new Date(at).toLocaleString('es-AR') : 'hace mucho'}.`)
}
const { data: tm } = await supabase.from('market_value_history').select('recorded_at').order('recorded_at', { ascending: false }).limit(1)
if (!tm?.[0] || Date.now() - Date.parse(tm[0].recorded_at) > 8 * 86400e3) problems.push(`Transfermarkt: último valor guardado el ${tm?.[0]?.recorded_at ?? '—'}.`)

const head = `Minuta de ${monthName(month)}: ${problems.length ? `${problems.length} cosas para completar antes del envío` : 'todo cargado, lista para enviar'}.`
console.log([head, ...problems.map(p => `- ${p}`)].join('\n'))

if (notify) {
  const { data: rec } = await supabase.from('data_health_recipients').select('user_id')
  for (const r of rec ?? []) {
    await supabase.from('notifications').insert({
      user_id: r.user_id, club_id: 'dobleg', type: `minuta:check:${month}`,
      message: [head, ...problems].join(' '), link: '/carga-wyscout',
    })
  }
}
