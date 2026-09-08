import { useEffect, useMemo, useState } from 'react'
import { useData } from '@/context/DataContext'
import { useAgencyClassifications } from '@/hooks/useAgencyClassifications'
import {
  agencyPlayerKey,
  fetchClassificationHistorySince,
  type AgencyClass,
} from '@/services/agencyClassificationService'
import { CLASS_DOT_COLOR } from '@/constants/agencyClassification'

const MOVEMENT_WINDOW_DAYS = 90

function StatCard({ label, value, subtitle, dot }: { label: string; value: number; subtitle: string; dot?: string }) {
  return (
    <div className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-4 hover:border-brand-green/40 hover:-translate-y-0.5 transition-all">
      <div className="flex items-center gap-1.5 mb-1">
        {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
        <p className="text-2xs font-semibold text-apple-gray-400 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-bold text-apple-gray-800 dark:text-white">{value}</p>
      <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">{subtitle}</p>
    </div>
  )
}

/**
 * "¿Está creciendo la agencia en Clase A o no?" — distribución actual del
 * plantel por clase + movimiento neto de los últimos 90 días (cuántos
 * entraron a Clase A vs. cuántos salieron), calculado desde el historial de
 * cambios en vez de reconstruir snapshots del pasado.
 */
export default function AgencyClassificationInsights() {
  const { agencyPlayers } = useData()
  const { classifications, loading } = useAgencyClassifications()
  const [movement, setMovement] = useState<{ into: number; out: number } | null>(null)

  useEffect(() => {
    const since = new Date(Date.now() - MOVEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
    fetchClassificationHistorySince(since)
      .then(rows => {
        const into = rows.filter(r => r.new_class === 'A').length
        const out = rows.filter(r => r.previous_class === 'A' && r.new_class !== 'A').length
        setMovement({ into, out })
      })
      .catch(() => setMovement(null))
  }, [])

  const counts = useMemo(() => {
    const result: Record<AgencyClass | 'none', number> = { A: 0, B: 0, C: 0, none: 0 }
    for (const p of agencyPlayers) {
      const cls = classifications.get(agencyPlayerKey(p.fullName))
      result[cls ?? 'none']++
    }
    return result
  }, [agencyPlayers, classifications])

  if (loading || agencyPlayers.length === 0) return null

  const netA = movement ? movement.into - movement.out : null
  const classified = counts.A + counts.B + counts.C
  const pctA = classified > 0 ? Math.round((counts.A / classified) * 100) : 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      <StatCard label="Clase A" value={counts.A} subtitle={classified > 0 ? `${pctA}% del plantel clasificado` : 'Sin clasificar todavía'} dot={CLASS_DOT_COLOR.A} />
      <StatCard label="Clase B" value={counts.B} subtitle="Jugadores en desarrollo" dot={CLASS_DOT_COLOR.B} />
      <StatCard label="Clase C" value={counts.C} subtitle="Jugadores en formación" dot={CLASS_DOT_COLOR.C} />
      <div className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-4 hover:border-brand-green/40 hover:-translate-y-0.5 transition-all">
        <p className="text-2xs font-semibold text-apple-gray-400 uppercase tracking-wider mb-1">Movimiento Clase A (90 días)</p>
        {netA === null ? (
          <p className="text-sm text-apple-gray-400 mt-1">Sin datos</p>
        ) : netA === 0 && movement!.into === 0 ? (
          <p className="text-sm text-apple-gray-500 mt-1">Sin cambios en el período</p>
        ) : (
          <p className={`text-2xl font-bold mt-0.5 ${netA > 0 ? 'text-emerald-600 dark:text-emerald-400' : netA < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-apple-gray-600 dark:text-apple-gray-300'}`}>
            {netA > 0 ? '+' : ''}{netA}
          </p>
        )}
        {movement && (movement.into > 0 || movement.out > 0) && (
          <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            {movement.into} entraron · {movement.out} salieron
          </p>
        )}
      </div>
      {counts.none > 0 && (
        <p className="col-span-2 lg:col-span-4 text-xs text-apple-gray-400">
          {counts.none} jugador{counts.none !== 1 ? 'es' : ''} de la agencia sin clasificar todavía —{' '}
          <a href="/clasificacion-interna" className="text-brand-green hover:text-emerald-600 font-medium">clasificarlos</a>.
        </p>
      )}
    </div>
  )
}
