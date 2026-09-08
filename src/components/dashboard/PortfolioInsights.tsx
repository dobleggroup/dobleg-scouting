import { useMemo } from 'react'
import type { EnrichedPlayer, MarketValueHistoryEntry } from '@/types'
import { formatMarketValueInCurrency } from '@/utils/scoring'
import { useCurrency } from '@/context/CurrencyContext'

export interface PortfolioInsightsData {
  totalValue: number
  topPlayer: { name: string; value: number; share: number } | null
  top3Share: number
  atRiskValue: number
  atRiskCount: number
  biggestMover: { name: string; changePct: number; direction: 'up' | 'down' } | null
}

/**
 * Insights de "a qué le prestaría atención un jefe": no son otro listado de
 * jugadores, son lecturas de riesgo/concentración sobre la cartera entera —
 * cuánto depende el valor total de un solo activo, cuánta plata se cae si
 * vencen contratos, y quién movió más la aguja este período.
 */
export function computePortfolioInsights(
  players: EnrichedPlayer[],
  history: MarketValueHistoryEntry[],
): PortfolioInsightsData {
  const valued = players.filter(p => p.marketValueRaw > 0)
  const totalValue = valued.reduce((sum, p) => sum + p.marketValueRaw, 0)

  const sorted = [...valued].sort((a, b) => b.marketValueRaw - a.marketValueRaw)
  const topPlayer = sorted[0]
    ? { name: sorted[0].Jugador, value: sorted[0].marketValueRaw, share: sorted[0].marketValueRaw / totalValue }
    : null
  const top3Sum = sorted.slice(0, 3).reduce((sum, p) => sum + p.marketValueRaw, 0)
  const top3Share = totalValue > 0 ? top3Sum / totalValue : 0

  const atRisk = players.filter(p => p.contractStatus === 'critical')
  const atRiskValue = atRisk.reduce((sum, p) => sum + p.marketValueRaw, 0)

  const byPlayer = new Map<string, MarketValueHistoryEntry[]>()
  for (const entry of history) {
    if (!byPlayer.has(entry.Jugador)) byPlayer.set(entry.Jugador, [])
    byPlayer.get(entry.Jugador)!.push(entry)
  }
  // Penúltimo snapshot vs el último — "variación del período", no la carrera
  // entera. Comparar contra el primer registro histórico (a veces de años atrás,
  // cuando el jugador recién arrancaba y valía una fracción de hoy) da porcentajes
  // sin sentido para lo que un jefe quiere ver acá: qué se movió últimamente.
  let biggestMover: PortfolioInsightsData['biggestMover'] = null
  let biggestAbsPct = 0
  for (const [name, entries] of byPlayer) {
    if (entries.length < 2) continue
    const chrono = [...entries].sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    const prev = chrono[chrono.length - 2].valor
    const last = chrono[chrono.length - 1].valor
    if (prev <= 0) continue
    const changePct = ((last - prev) / prev) * 100
    if (Math.abs(changePct) > biggestAbsPct) {
      biggestAbsPct = Math.abs(changePct)
      biggestMover = { name, changePct, direction: changePct >= 0 ? 'up' : 'down' }
    }
  }

  return {
    totalValue,
    topPlayer,
    top3Share,
    atRiskValue,
    atRiskCount: atRisk.length,
    biggestMover,
  }
}

function InsightCard({ label, icon, tone, children }: { label: string; icon: React.ReactNode; tone: 'default' | 'warning' | 'up' | 'down'; children: React.ReactNode }) {
  // Antes eran íconos con gradiente multicolor (verde-teal, ámbar-naranja,
  // rosa-rojo) — no es la identidad de la app: acá los íconos siempre son
  // planos, fondo tenue del color semántico + ícono del mismo color (ver
  // QuickAccess/ContractAlertsWidget en Home).
  const toneClasses = {
    default: 'bg-brand-green/10 text-brand-green',
    warning: 'bg-amber-500/10 text-amber-500',
    up: 'bg-brand-green/10 text-brand-green',
    down: 'bg-red-500/10 text-red-500',
  }[tone]

  return (
    <div className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-4 flex items-start gap-3 hover:border-brand-green/40 hover:-translate-y-0.5 transition-all">
      <div className={`w-9 h-9 rounded-lg ${toneClasses} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xs font-semibold text-apple-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
        {children}
      </div>
    </div>
  )
}

const iconClass = 'w-5 h-5'

export default function PortfolioInsights({ players, history }: { players: EnrichedPlayer[]; history: MarketValueHistoryEntry[] }) {
  const { currency, rate } = useCurrency()
  const data = useMemo(() => computePortfolioInsights(players, history), [players, history])

  if (data.totalValue === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      <InsightCard
        label="Concentración"
        tone={data.topPlayer && data.topPlayer.share >= 0.3 ? 'warning' : 'default'}
        icon={<svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>}
      >
        {data.topPlayer ? (
          <p className="text-sm text-apple-gray-700 dark:text-apple-gray-200">
            <span className="font-bold text-apple-gray-800 dark:text-white">{data.topPlayer.name}</span> es el{' '}
            <span className="font-bold text-brand-green">{(data.topPlayer.share * 100).toFixed(0)}%</span> del valor total
          </p>
        ) : (
          <p className="text-sm text-apple-gray-400">Sin datos</p>
        )}
      </InsightCard>

      <InsightCard
        label="Top 3 concentración"
        tone={data.top3Share >= 0.5 ? 'warning' : 'default'}
        icon={<svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
      >
        <p className="text-sm text-apple-gray-700 dark:text-apple-gray-200">
          <span className="font-bold text-brand-green">{(data.top3Share * 100).toFixed(0)}%</span> del valor está en solo 3 jugadores
        </p>
      </InsightCard>

      <InsightCard
        label="Valor en riesgo por contrato"
        tone={data.atRiskCount > 0 ? 'warning' : 'default'}
        icon={<svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
      >
        {data.atRiskCount > 0 ? (
          <p className="text-sm text-apple-gray-700 dark:text-apple-gray-200">
            <span className="font-bold text-amber-600 dark:text-amber-400">{formatMarketValueInCurrency(data.atRiskValue, currency, rate)}</span> en {data.atRiskCount} jugador{data.atRiskCount !== 1 ? 'es' : ''} con contrato venciendo
          </p>
        ) : (
          <p className="text-sm text-apple-gray-500">Sin contratos críticos</p>
        )}
      </InsightCard>

      <InsightCard
        label="Mayor variación del período"
        tone={data.biggestMover?.direction === 'down' ? 'down' : 'up'}
        icon={data.biggestMover?.direction === 'down' ? (
          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>
        ) : (
          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
        )}
      >
        {data.biggestMover ? (
          <p className="text-sm text-apple-gray-700 dark:text-apple-gray-200">
            <span className="font-bold text-apple-gray-800 dark:text-white">{data.biggestMover.name}</span>{' '}
            <span className={`font-bold ${data.biggestMover.direction === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {data.biggestMover.direction === 'up' ? '+' : ''}{data.biggestMover.changePct.toFixed(0)}%
            </span>
          </p>
        ) : (
          <p className="text-sm text-apple-gray-400">Sin historial suficiente</p>
        )}
      </InsightCard>
    </div>
  )
}
