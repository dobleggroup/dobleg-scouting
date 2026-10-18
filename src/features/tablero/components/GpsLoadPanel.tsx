import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import { agencyKey } from '@/services/agencyPlayersService'
import type { GpsEntryRow } from '@/features/gps/types'
import { fmtDate } from './Panel'

const GPS_METRICS: { key: string; label: string; unit: string; decimals: number }[] = [
  { key: 'distancia_total', label: 'Distancia', unit: ' m', decimals: 0 },
  { key: 'hsr', label: 'Alta velocidad', unit: ' m', decimals: 0 },
  { key: 'sprints', label: 'Sprints', unit: '', decimals: 0 },
  { key: 'vel_max', label: 'Vel. máx.', unit: ' km/h', decimals: 1 },
]

/** Cambios de menos de 5% contra su promedio se muestran como "en su nivel". */
const SAME_BAND = 5

export interface GpsComparison {
  playerName: string
  last: GpsEntryRow
  previousCount: number
  metrics: { key: string; label: string; unit: string; decimals: number; value: number; avg: number; pct: number }[]
}

/** Último partido con GPS de cada jugador contra el promedio de sus partidos anteriores. */
export function compareLastGps(entries: GpsEntryRow[]): GpsComparison[] {
  const byPlayer = new Map<string, GpsEntryRow[]>()
  for (const e of entries) {
    const list = byPlayer.get(e.player_key) ?? []
    list.push(e)
    byPlayer.set(e.player_key, list)
  }
  const out: GpsComparison[] = []
  for (const list of byPlayer.values()) {
    if (list.length < 2) continue
    const sorted = [...list].sort((a, b) => a.match_date.localeCompare(b.match_date))
    const last = sorted[sorted.length - 1]
    const prev = sorted.slice(0, -1)
    const metrics = GPS_METRICS.flatMap(m => {
      const value = last.metrics?.[m.key]
      const vals = prev.map(e => e.metrics?.[m.key]).filter((v): v is number => v != null && v > 0)
      if (value == null || value <= 0 || vals.length === 0) return []
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length
      return [{ ...m, value, avg, pct: ((value - avg) / avg) * 100 }]
    })
    if (metrics.length) out.push({ playerName: last.player_name, last, previousCount: prev.length, metrics })
  }
  return out.sort((a, b) => b.last.match_date.localeCompare(a.last.match_date))
}

export default function GpsLoadPanel({ comparisons }: { comparisons: GpsComparison[] }) {
  const navigate = useNavigate()
  const photos = useMemo(() => new Map(AGENCY_PLAYERS.map(p => [agencyKey(p.fullName), p.image])), [])

  return (
    <div className="grid md:grid-cols-2 gap-3">
      {comparisons.map(c => (
        <div key={c.last.id} className="min-w-0 rounded-apple bg-apple-gray-50 dark:bg-apple-gray-700/30 p-3.5">
          <button
            onClick={() => navigate(`/jugador/${encodeURIComponent(c.playerName)}?source=interno`)}
            className="flex items-center gap-2.5 mb-3 text-left group w-full"
          >
            <PlayerPhoto src={photos.get(c.last.player_key) ?? null} name={c.playerName} size="sm" rounded="full" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate group-hover:text-brand-green transition-colors">{c.playerName}</p>
              <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 truncate">
                {fmtDate(`${c.last.match_date}T12:00:00Z`)}{c.last.rival && ` · vs. ${c.last.rival}`}{c.last.minutos ? ` · ${c.last.minutos}'` : ''} · contra sus {c.previousCount} {c.previousCount === 1 ? 'partido anterior' : 'partidos anteriores'}
              </p>
            </div>
          </button>
          <div className="grid grid-cols-2 gap-2">
            {c.metrics.map(m => {
              const same = Math.abs(m.pct) < SAME_BAND
              return (
                <div key={m.key} className="bg-white dark:bg-apple-gray-800 rounded-lg px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-apple-gray-400 dark:text-apple-gray-500">{m.label}</p>
                  <p className="text-sm font-bold text-apple-gray-900 dark:text-white tabular-nums">
                    {m.decimals ? m.value.toFixed(m.decimals) : Math.round(m.value).toLocaleString('es-AR')}{m.unit}
                  </p>
                  <p className={`text-[10px] font-semibold tabular-nums ${
                    same ? 'text-apple-gray-400 dark:text-apple-gray-500'
                      : m.pct > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                  }`}>
                    {same ? '= en su nivel' : `${m.pct > 0 ? '▲' : '▼'} ${Math.abs(Math.round(m.pct))}% vs. su promedio`}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
