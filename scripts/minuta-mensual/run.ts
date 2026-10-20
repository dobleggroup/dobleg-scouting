/**
 * Genera la minuta mensual en HTML (la misma lógica que la vista "Resumen del
 * mes" de Rendimiento individual).
 *   npx vite-node scripts/minuta-mensual/run.ts -- 2026-09 salida.html
 * Sin mes = el mes anterior al de hoy. Corre con la service key en
 * VITE_SUPABASE_ANON_KEY (ver scripts/secrets.bat) y FOOTBALL_API_KEY.
 */
import fs from 'fs'
import Papa from 'papaparse'
import { loadMinuta } from '@/features/minuta/loadMinuta'
import { buildReport, shiftMonth, type CoachMonth } from '@/features/minuta/analyze'
import { renderMinutaEmail } from '@/features/minuta/emailHtml'

const INTERNAL_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSneBjGlw2I3SyXV-uw1V8Cs_O4lbiQw39melKEZJNhunpshakPrn7AZQBN2L8N9Yw_HA-EeVOt3qvf/pub?gid=1060061197&single=true&output=csv'

/** Tabla de posiciones: 1 pedido a API-Football por DT con club (la cuota es compartida). */
async function standing(league: number, season: number, team: number): Promise<CoachMonth['standing']> {
  const key = process.env.FOOTBALL_API_KEY
  if (!key) return null
  const r = await fetch(`https://v3.football.api-sports.io/standings?league=${league}&season=${season}`, { headers: { 'x-apisports-key': key } })
  const j = await r.json() as any
  for (const g of j.response?.[0]?.league?.standings ?? []) for (const t of g) {
    if (t.team?.id === team) return { rank: t.rank, group: t.group, points: t.points, played: t.all?.played ?? 0, description: t.description ?? null, groupSize: g.length }
  }
  return null
}

const args = process.argv.slice(2).filter(a => a !== '--')
const today = new Date()
const month = args[0] ?? shiftMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`, -1)
const out = args[1] ?? `scripts/minuta-mensual/minuta-${month}.html`

let internalRows: Array<Record<string, string>> = []
try {
  internalRows = Papa.parse<Record<string, string>>(await (await fetch(INTERNAL_CSV)).text(), { header: true, skipEmptyLines: true }).data
} catch { /* sin planilla: queda la posición de Wyscout */ }

const report = buildReport(await loadMinuta(month, { internalRows, standing }))
const html = renderMinutaEmail(report)
fs.writeFileSync(out, html, 'utf8')
console.log(`${out} · ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB · ${report.title}`)
