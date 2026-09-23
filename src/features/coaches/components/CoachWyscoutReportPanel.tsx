// src/features/coaches/components/CoachWyscoutReportPanel.tsx
import { useState } from 'react'
import { FormationPitch, ZoneHeatPitch } from './WyscoutPitches'
import type { WyscoutReportData, WyscoutZoneGrid } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'

const ZONE_CATEGORY_LABEL: Record<string, string> = {
  recuperaciones: 'Recuperaciones',
  perdidas: 'Pérdidas de balón',
  faltas: 'Faltas cometidas',
}

/** "POSESIÓN DEL BALÓN, %" -> "Posesión del balón (%)": el PDF trae las etiquetas en mayúsculas. */
function prettyStatLabel(label: string): string {
  const pct = /,\s*%$/.test(label)
  const base = label.replace(/,\s*%$/, '').toLowerCase()
  const text = base === 'xg' ? 'xG' : base.charAt(0).toUpperCase() + base.slice(1)
  return pct ? `${text} (%)` : text
}

function fmtStat(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">{title}</h3>
      {description && <p className="text-2xs text-apple-gray-400 mt-0.5">{description}</p>}
    </div>
  )
}

function FormationCard({ formation }: { formation: WyscoutReportData['formations'][number] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-apple-gray-50 dark:bg-apple-gray-900/40 rounded-apple-lg p-3 sm:p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xl font-bold tracking-tight text-apple-gray-800 dark:text-white tabular-nums">{formation.scheme}</p>
        <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">
          <span className="font-semibold text-brand-green tabular-nums">{formation.usagePct}%</span> del tiempo
        </p>
      </div>
      <FormationPitch players={formation.averagePositions} />
      {formation.teamStats.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 bg-white dark:bg-apple-gray-800/60 border border-apple-gray-200/70 dark:border-apple-gray-700/50 hover:border-brand-green/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 transition-colors"
          >
            {open ? 'Ocultar estadísticas' : 'Ver estadísticas con este esquema'}
            <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>
          {open && (
            <div className="mt-2 space-y-2.5 px-1 animate-fade-in">
              <div className="flex justify-between text-2xs font-medium text-apple-gray-400">
                <span>Nosotros</span>
                <span>Rival</span>
              </div>
              {formation.teamStats.map(s => {
                const total = Math.abs(s.own) + Math.abs(s.rival)
                const ownPct = total > 0 ? (Math.abs(s.own) / total) * 100 : 50
                return (
                  <div key={s.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="tabular-nums font-semibold text-apple-gray-800 dark:text-white w-12">{fmtStat(s.own)}</span>
                      <span className="text-apple-gray-500 dark:text-apple-gray-400 text-center flex-1 px-2 truncate">{prettyStatLabel(s.label)}</span>
                      <span className="tabular-nums text-apple-gray-500 dark:text-apple-gray-400 w-12 text-right">{fmtStat(s.rival)}</span>
                    </div>
                    <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
                      <div className="bg-brand-green rounded-l-full" style={{ width: `${ownPct}%` }} />
                      <div className="bg-apple-gray-300 dark:bg-apple-gray-600 rounded-r-full flex-1" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ZoneGridCard({ grid }: { grid: WyscoutZoneGrid }) {
  return (
    <div className="bg-apple-gray-50 dark:bg-apple-gray-900/40 rounded-apple-lg p-3 sm:p-4">
      <p className="text-sm font-semibold text-apple-gray-800 dark:text-white mb-2.5">{ZONE_CATEGORY_LABEL[grid.category] ?? grid.category}</p>
      <ZoneHeatPitch cells={grid.cells} />
      <div className="flex items-center justify-between mt-2 text-2xs text-apple-gray-400">
        <span>Arco propio</span>
        <span className="flex items-center gap-1">
          Ataque
          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.64l-3.72-3.72a.75.75 0 111.06-1.06l5 5a.75.75 0 010 1.06l-5 5a.75.75 0 11-1.06-1.06l3.72-3.72H3.75A.75.75 0 013 10z" clipRule="evenodd" />
          </svg>
        </span>
      </div>
    </div>
  )
}

export default function CoachWyscoutReportPanel({ report }: { report: WyscoutReportData }) {
  return (
    <div className="space-y-6 mt-6">
      {report.formations.length > 0 && (
        <div>
          <SectionTitle title="Formaciones usadas" description="Posición media de cada jugador según el informe de Wyscout" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {report.formations.map(f => <FormationCard key={f.scheme} formation={f} />)}
          </div>
        </div>
      )}

      {report.zoneGrids.length > 0 && (
        <div>
          <SectionTitle title="Dónde pasan las cosas" description="Porcentaje de cada acción por zona de la cancha. Cuanto más clara la zona, más acciones hubo ahí." />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            {report.zoneGrids.map(g => <ZoneGridCard key={g.category} grid={g} />)}
          </div>
        </div>
      )}
    </div>
  )
}
