// src/features/coaches/components/CoachWyscoutReportPanel.tsx
import { useState } from 'react'
import VideoAnalysisPitch from './VideoAnalysisPitch'
import { computeWyscoutInsights } from '@/features/coaches/wyscoutReport/wyscoutReportInsights'
import type { WyscoutReportData, WyscoutZoneGrid } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'
import { useTheme } from '@/context/ThemeContext'

// Rampa validada (Sección 11 del spec) contra las superficies reales de la app
// (bg-white #FFFFFF en claro, bg-apple-gray-800 #0E0E10 en oscuro) con un script
// de contraste WCAG. Valores copiados tal cual -- no re-derivar.
const ZONE_RAMP_LIGHT = ['#EAFBF1', '#BEF2D3', '#7FE0A8', '#3FBF77', '#16803D']
const ZONE_RAMP_DARK = ['#0F2A1C', '#134A2C', '#1B7A43', '#22C55E', '#79F2AB']
// texto oscuro (apple-gray-900) en los pasos 0-3 claro / 0-2 oscuro; texto claro en el resto.
const DARK_TEXT_STEPS_LIGHT = new Set([0, 1, 2, 3])
const DARK_TEXT_STEPS_DARK = new Set([0, 1, 2])

function rampStep(pct: number, allPcts: number[]): number {
  const max = Math.max(...allPcts, 1)
  return Math.min(4, Math.floor((pct / max) * 5))
}

const ZONE_CATEGORY_LABEL: Record<string, string> = {
  recuperaciones: 'Recuperaciones',
  perdidas: 'Pérdidas de balón',
  faltas: 'Faltas cometidas',
}

/** Los nombres de categoría de eventos vienen crudos del PDF ("Duelos defensivos
 *  ganados en el propio tercio del campo") o son un fallback indexado cuando el
 *  parser no pudo emparejar un título real ("ataque 1") -- acá solo se acortan
 *  para mostrar, no se toca el dato. */
function shortEventCategoryLabel(category: string): string {
  const withoutZone = category.replace(/\s+en el (propio tercio del campo|último tercio)$/i, '')
  const indexedFallback = withoutZone.match(/^([a-záéíóúñ]+)\s+(\d+)$/i)
  if (indexedFallback) {
    const [, base, n] = indexedFallback
    return `${base[0].toUpperCase()}${base.slice(1)} (zona ${n})`
  }
  const capitalized = withoutZone.charAt(0).toUpperCase() + withoutZone.slice(1)
  return capitalized.length > 32 ? `${capitalized.slice(0, 31)}…` : capitalized
}

function ZoneGridCard({ grid }: { grid: WyscoutZoneGrid }) {
  // El proyecto no usa el atributo `data-theme` (ver ThemeContext: alterna la
  // clase `.dark` en <html>), así que en vez de inyectar variables CSS por
  // selector de atributo (que acá nunca matchearía) se resuelve la rampa
  // directamente desde el theme real de la app. Mismos 10 hex y misma regla
  // de flip de texto que el brief, solo cambia el mecanismo de entrega.
  const { theme } = useTheme()
  const ramp = theme === 'dark' ? ZONE_RAMP_DARK : ZONE_RAMP_LIGHT
  const darkTextSteps = theme === 'dark' ? DARK_TEXT_STEPS_DARK : DARK_TEXT_STEPS_LIGHT
  const pcts = grid.cells.map(c => c.pct)
  return (
    <div className="bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-4">
      <p className="text-xs font-semibold text-apple-gray-400 uppercase tracking-wide mb-3">{ZONE_CATEGORY_LABEL[grid.category] ?? grid.category}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 9 }, (_, i) => {
          const row = Math.floor(i / 3)
          const col = i % 3
          const cell = grid.cells.find(c => c.row === row && c.col === col)
          const step = cell ? rampStep(cell.pct, pcts) : 0
          const darkText = darkTextSteps.has(step)
          return (
            <div
              key={i}
              className="rounded-lg aspect-square flex flex-col items-center justify-center"
              style={{ backgroundColor: ramp[step] }}
            >
              <span className={`text-sm font-bold ${darkText ? 'text-apple-gray-900' : 'text-white'}`}>
                {cell ? `${cell.pct}%` : '–'}
              </span>
              {cell?.reference != null && (
                <span className={`text-2xs ${darkText ? 'text-apple-gray-700' : 'text-white/80'}`}>{cell.reference}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PlayersTable({ players }: { players: WyscoutReportData['players'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-2xs text-apple-gray-400 uppercase text-left">
            <th className="py-2 pr-3">Jugador</th>
            <th className="py-2 pr-3 text-right">Min</th>
            <th className="py-2 pr-3 text-right">Goles</th>
            <th className="py-2 pr-3 text-right">Asist</th>
            <th className="py-2 pr-3 text-right">TA/TR</th>
          </tr>
        </thead>
        <tbody>
          {[...players].sort((a, b) => b.minutesTotal - a.minutesTotal).map(p => (
            <tr key={p.name} className="border-t border-apple-gray-100 dark:border-apple-gray-700/40">
              <td className="py-2 pr-3 font-medium text-apple-gray-800 dark:text-white">{p.name}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{p.minutesTotal}'</td>
              <td className="py-2 pr-3 text-right tabular-nums">{p.goals}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{p.assists}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{p.yellowCards}/{p.redCards}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FormationCard({ formation }: { formation: WyscoutReportData['formations'][number] }) {
  return (
    <div className="bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold text-apple-gray-800 dark:text-white">{formation.scheme}</p>
        <span className="text-sm font-semibold text-brand-green">{formation.usagePct}%</span>
      </div>
      <VideoAnalysisPitch exact={formation.averagePositions} zones={[]} />
      <div className="space-y-1.5">
        {formation.teamStats.map(s => (
          <div key={s.label} className="flex items-center justify-between text-xs">
            <span className="tabular-nums font-semibold text-brand-green w-10 text-right">{s.own}</span>
            <span className="text-apple-gray-400 flex-1 text-center px-2">{s.label}</span>
            <span className="tabular-nums font-semibold text-apple-gray-400 w-10">{s.rival}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CoachWyscoutReportPanel({ report }: { report: WyscoutReportData }) {
  const insights = computeWyscoutInsights(report)
  const [mapCategory, setMapCategory] = useState(report.eventMaps[0]?.category ?? null)

  return (
    <div className="space-y-6 mt-6">
      <div>
        <p className="text-xs font-semibold text-apple-gray-400 uppercase tracking-wide mb-3">Plantel (Wyscout)</p>
        <PlayersTable players={report.players} />
      </div>

      <div>
        <p className="text-xs font-semibold text-apple-gray-400 uppercase tracking-wide mb-3">Formaciones usadas</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {report.formations.map(f => <FormationCard key={f.scheme} formation={f} />)}
        </div>
      </div>

      {report.zoneGrids.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-apple-gray-400 uppercase tracking-wide mb-3">Mapas de calor por zona</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {report.zoneGrids.map(g => <ZoneGridCard key={g.category} grid={g} />)}
          </div>
        </div>
      )}

      {report.eventMaps.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-apple-gray-400 uppercase tracking-wide mb-3">Mapa de eventos</p>
          <div className="flex gap-2 flex-wrap mb-3">
            {[...new Set(report.eventMaps.map(m => m.category))].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setMapCategory(cat)}
                className={`min-h-[32px] px-3 rounded-full text-xs font-semibold transition-colors ${
                  cat === mapCategory
                    ? 'bg-brand-green text-apple-gray-900'
                    : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200'
                }`}
              >
                {shortEventCategoryLabel(cat)}
              </button>
            ))}
          </div>
          <VideoAnalysisPitch
            exact={report.eventMaps.filter(m => m.category === mapCategory).flatMap(m => m.points)}
            zones={[]}
            dotStyle="heat"
          />
        </div>
      )}

      {report.setPieces.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-apple-gray-400 uppercase tracking-wide mb-3">Balón parado</p>
          <VideoAnalysisPitch exact={report.setPieces.map(sp => sp.point)} zones={[]} half="rival" />
        </div>
      )}

      {insights.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-apple-gray-400 uppercase tracking-wide mb-3">Conclusiones</p>
          <ul className="space-y-2">
            {insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-apple-gray-700 dark:text-apple-gray-300">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-green flex-shrink-0 mt-1.5" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
