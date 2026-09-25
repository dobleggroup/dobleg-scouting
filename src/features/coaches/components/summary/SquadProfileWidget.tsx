// src/features/coaches/components/summary/SquadProfileWidget.tsx
import WidgetCard from './WidgetCard'
import { squadProfile } from '@/features/coaches/wyscoutSquad/squadMetrics'
import type { SquadPlayer } from '@/features/coaches/wyscoutSquad/wyscoutSquadTypes'

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-apple-gray-50 dark:bg-apple-gray-900/40 rounded-apple-lg px-3 py-3 text-center">
      <p className="text-lg sm:text-xl font-bold text-apple-gray-800 dark:text-white tabular-nums">{value}</p>
      <p className="text-[10px] font-semibold text-apple-gray-400 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  )
}

const FOOT_LABEL: Record<string, string> = { derecho: 'Derechos', izquierdo: 'Zurdos', ambos: 'Ambidiestros' }

export default function SquadProfileWidget({ players }: { players: SquadPlayer[] }) {
  const prof = squadProfile(players)
  const footTotal = Object.values(prof.foot).reduce((a, b) => a + b, 0)
  const fmt = (v: number | null, unit: string) =>
    v === null ? '—' : `${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })}${unit}`

  return (
    <WidgetCard title="Perfil del plantel" description={`Los ${players.length} jugadores del archivo de Wyscout.`}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Tile label="Jugadores" value={String(players.length)} />
        <Tile label="Edad promedio" value={fmt(prof.avgAge, ' años')} />
        <Tile label="Altura promedio" value={fmt(prof.avgHeight, ' cm')} />
        <Tile label="Doble pasaporte" value={String(prof.dualPassport.length)} />
      </div>
      {Object.keys(prof.foot).length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 mb-2">Pie hábil</p>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
            {Object.entries(prof.foot).sort((a, b) => b[1] - a[1]).map(([foot, n], i) => (
              <div
                key={foot}
                className={i === 0 ? 'bg-brand-green' : i === 1 ? 'bg-apple-gray-400 dark:bg-apple-gray-500' : 'bg-apple-gray-300 dark:bg-apple-gray-600'}
                style={{ width: `${(n / footTotal) * 100}%` }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-apple-gray-500 dark:text-apple-gray-400">
            {Object.entries(prof.foot).sort((a, b) => b[1] - a[1]).map(([foot, n]) => (
              <span key={foot}><b className="text-apple-gray-800 dark:text-white tabular-nums">{n}</b> {FOOT_LABEL[foot] ?? foot}</span>
            ))}
          </div>
        </div>
      )}
      {prof.dualPassport.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 mb-2">Con doble pasaporte</p>
          <ul className="space-y-1.5">
            {prof.dualPassport.map(d => (
              <li key={d.name} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-apple-gray-800 dark:text-white truncate">{d.name}</span>
                <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400 text-right">{d.passports.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </WidgetCard>
  )
}
