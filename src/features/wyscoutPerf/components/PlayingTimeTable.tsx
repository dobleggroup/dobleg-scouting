import { monthLabel } from '../periods'
import type { MonthPlay } from '../participation'

const COLS: Array<{ key: keyof MonthPlay; label: string; hint?: string }> = [
  { key: 'teamMatches', label: 'Partidos del equipo' },
  { key: 'played', label: 'Jugó' },
  { key: 'starts', label: 'Titular' },
  { key: 'subs', label: 'Entró de suplente' },
  { key: 'notPlayed', label: 'No jugó', hint: 'Partidos de su equipo en los que no entró: en el banco, no convocado o lesionado' },
  { key: 'minutes', label: 'Minutos' },
]

const sum = (rows: MonthPlay[], k: keyof MonthPlay) => rows.reduce((s, r) => s + (r[k] as number), 0)

/**
 * Cuánto juega, mes a mes (el más nuevo arriba): partidos de su equipo, cuántos
 * jugó, de titular o de suplente, cuántos no jugó y minutos. Sale de
 * API-Football y Sofascore.
 */
export default function PlayingTimeTable({ months }: { months: MonthPlay[] | undefined }) {
  if (!months?.length) {
    return (
      <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
        No figura en los partidos de API-Football ni de Sofascore (por ejemplo, si juega en Reserva). Sus minutos salen de Wyscout.
      </p>
    )
  }
  const shown = months.slice(-12).reverse()
  const last3 = months.slice(-3)
  const cell = (r: MonthPlay, k: keyof MonthPlay) => {
    const v = r[k] as number
    if (k === 'minutes') return v ? `${v.toLocaleString('es-AR')}'` : '—'
    return r.teamMatches || r.played ? String(v) : '—'
  }
  const total = (rows: MonthPlay[], k: keyof MonthPlay) => (k === 'minutes' ? `${sum(rows, k).toLocaleString('es-AR')}'` : String(sum(rows, k)))

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[520px] text-sm tabular-nums">
        <thead>
          <tr className="text-2xs uppercase tracking-wide text-apple-gray-400 dark:text-apple-gray-500">
            <th className="text-left font-medium py-2 px-1">Mes</th>
            {COLS.map(c => <th key={c.key} title={c.hint} className="text-right font-medium py-2 px-1">{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
          {shown.map(r => (
            <tr key={r.month} className="text-apple-gray-700 dark:text-apple-gray-200">
              <td className="py-1.5 px-1 capitalize">{monthLabel(r.month)}</td>
              {COLS.map(c => (
                <td key={c.key} className={`py-1.5 px-1 text-right ${c.key === 'starts' && r.starts ? 'font-semibold text-brand-green' : ''} ${c.key === 'notPlayed' && r.notPlayed ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                  {cell(r, c.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-apple-gray-200 dark:border-apple-gray-700 font-semibold text-apple-gray-800 dark:text-white">
          <tr>
            <td className="py-2 px-1">Últimos 3 meses</td>
            {COLS.map(c => <td key={c.key} className="py-2 px-1 text-right">{total(last3, c.key)}</td>)}
          </tr>
          <tr>
            <td className="py-1 px-1">Últimos 12 meses</td>
            {COLS.map(c => <td key={c.key} className="py-1 px-1 text-right">{total(months.slice(-12), c.key)}</td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
