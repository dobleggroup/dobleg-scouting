import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { usePlayerMatchHistory, useMarketValueHistory } from '@/hooks/usePlayerStats'
import { usePlayerInjuries } from '@/hooks/usePlayerApiData'
import { normalizeForSearch } from '@/lib/search'
import type { Position } from '@/types/scoring'
import type { Informe } from './types'
import type { LinePoint } from './chartSvg'

export interface PhysicalTile { label: string; value: string; zero: boolean }

export interface Continuity {
  matches: number
  starts: number
  minutes: number
  last5Played: number
  last5Total: number
  last10Played: number
  last10Total: number
}

export interface InjuryRow { type: string; start: string; end: string | null }

export interface InformeEnrichment {
  isInternal: boolean
  hasPhysical: boolean
  physicalTiles: PhysicalTile[]
  physicalMatches: number
  physicalEvolution: LinePoint[]
  levelEvolution: LinePoint[]
  levelByMatch: LinePoint[]
  levelByWeek: LinePoint[]
  levelByMonth: LinePoint[]
  marketEvolution: LinePoint[]
  continuity: Continuity | null
  injuries: InjuryRow[]
  loading: boolean
}

const EMPTY: InformeEnrichment = {
  isInternal: false,
  hasPhysical: false,
  physicalTiles: [],
  physicalMatches: 0,
  physicalEvolution: [],
  levelEvolution: [],
  levelByMatch: [],
  levelByWeek: [],
  levelByMonth: [],
  marketEvolution: [],
  continuity: null,
  injuries: [],
  loading: false,
}

function dayMonth(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthYear(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
}

// Clave de agrupación por semana (lunes de esa semana) y por mes.
function weekKey(d: Date): string {
  const day = (d.getDay() + 6) % 7 // 0 = lunes
  const monday = new Date(d)
  monday.setDate(d.getDate() - day)
  return `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`
}
function monthGroupKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`
}

/** Agrupa scores por clave (semana/mes) en orden cronológico y promedia cada grupo. */
function aggregateLevels(
  points: { date: Date; score: number }[],
  keyFn: (d: Date) => string,
  labelFn: (d: Date) => string,
): LinePoint[] {
  const groups = new Map<string, { sum: number; n: number; first: Date }>()
  for (const p of points) {
    const k = keyFn(p.date)
    const g = groups.get(k)
    if (g) { g.sum += p.score; g.n++ }
    else groups.set(k, { sum: p.score, n: 1, first: p.date })
  }
  return Array.from(groups.values()).map(g => ({
    label: labelFn(g.first),
    value: Math.round((g.sum / g.n) * 10) / 10,
  }))
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

function fmtMeters(n: number): string {
  return `${Math.round(n).toLocaleString('es-AR')} m`
}

/**
 * Datos "extra" del jugador para enriquecer el informe. Continuidad, lesiones,
 * evolución de nivel y de valor salen de la DB por id (para cualquier jugador
 * linkeado). El físico (GPS) es exclusivo de internos y se matchea por nombre.
 */
export function useInformeEnrichment(informe: Informe | null): InformeEnrichment {
  const { internal, gpsData, marketValueHistory } = useData()
  const { matches, loading: matchesLoading } = usePlayerMatchHistory(
    informe?.dbPlayerId ?? null,
    (informe?.dbPosition as Position | undefined) ?? undefined,
  )
  const { data: mvRows, loading: mvLoading } = useMarketValueHistory(informe?.dbPlayerId ?? null)
  const { injuries: rawInjuries, loading: injLoading } = usePlayerInjuries(informe?.dbPlayerId ?? null)

  return useMemo<InformeEnrichment>(() => {
    if (!informe) return EMPTY
    const nameKey = normalizeForSearch(informe.dbPlayerName || informe.content.nombre || '')
    if (!nameKey) return EMPTY

    // ── Físico (GPS, por nombre, interno-only) ──
    const gps = gpsData
      .filter(g => normalizeForSearch(g.Jugador) === nameKey)
      .sort((a, b) => a.Fecha.getTime() - b.Fecha.getTime())
    const hasPhysical = gps.length > 0
    const inInternalRoster = internal.some(p => normalizeForSearch(p.Jugador) === nameKey)
    const isInternal = hasPhysical || inInternalRoster

    const tile = (label: string, value: string, raw: number): PhysicalTile => ({ label, value, zero: raw === 0 })
    const physicalTiles: PhysicalTile[] = hasPhysical
      ? [
          tile('Distancia', fmtMeters(avg(gps.map(g => g.Distancia))), avg(gps.map(g => g.Distancia))),
          tile('Mts/min', avg(gps.map(g => g.MetrosPorMin)).toFixed(1), avg(gps.map(g => g.MetrosPorMin))),
          tile('Vel. máx', `${avg(gps.map(g => g.VelMax)).toFixed(1)} km/h`, avg(gps.map(g => g.VelMax))),
          tile('Sprints', avg(gps.map(g => g.Sprints)).toFixed(0), avg(gps.map(g => g.Sprints))),
          tile('HSR', fmtMeters(avg(gps.map(g => g.HSR))), avg(gps.map(g => g.HSR))),
          tile('Player Load', avg(gps.map(g => g.PlayerLoad)).toFixed(0), avg(gps.map(g => g.PlayerLoad))),
        ]
      : []
    const physicalEvolution: LinePoint[] = gps
      .slice(-12)
      .map(g => ({ label: dayMonth(g.Fecha), value: Math.round(g.MetrosPorMin * 10) / 10 }))

    // ── Continuidad + evolución de nivel (match history, por id) ──
    const dated = matches
      .filter(m => m.fixture?.date)
      .sort((a, b) => new Date(a.fixture!.date).getTime() - new Date(b.fixture!.date).getTime())
    const last5 = dated.slice(-5)
    const last10 = dated.slice(-10)
    const continuity: Continuity | null = dated.length
      ? {
          matches: dated.filter(m => (m.minutes ?? 0) > 0).length,
          starts: dated.filter(m => !m.is_substitute && (m.minutes ?? 0) > 0).length,
          minutes: dated.reduce((s, m) => s + (m.minutes ?? 0), 0),
          last5Played: last5.filter(m => (m.minutes ?? 0) > 0).length,
          last5Total: last5.length,
          last10Played: last10.filter(m => (m.minutes ?? 0) > 0).length,
          last10Total: last10.length,
        }
      : null

    // Score por partido (con fecha) para las tres vistas del gráfico de evolución.
    const scored = dated
      .filter(m => m.match_score != null)
      .map(m => ({ date: new Date(m.fixture!.date), score: Math.round((m.match_score ?? 0) * 10) / 10 }))
    const levelByMatch: LinePoint[] = scored.slice(-18).map(s => ({ label: dayMonth(s.date), value: s.score }))
    const levelByWeek: LinePoint[] = aggregateLevels(scored, weekKey, dayMonth).slice(-16)
    const levelByMonth: LinePoint[] = aggregateLevels(scored, monthGroupKey, monthYear).slice(-12)
    const levelEvolution = levelByMatch

    // ── Valor de mercado (Supabase por id; fallback Sheets por nombre) ──
    let marketEvolution: LinePoint[] = mvRows
      .map(r => ({ label: monthYear(new Date(r.recorded_at)), value: Math.round((r.value_eur / 1_000_000) * 100) / 100 }))
    if (marketEvolution.length === 0) {
      marketEvolution = marketValueHistory
        .filter(r => normalizeForSearch(r.Jugador) === nameKey)
        .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
        .map(r => ({ label: monthYear(r.fecha), value: Math.round((r.valor / 1_000_000) * 100) / 100 }))
    }

    const injuries: InjuryRow[] = rawInjuries.map(i => ({ type: i.type, start: i.start, end: i.end }))

    return {
      isInternal,
      hasPhysical,
      physicalTiles,
      physicalMatches: gps.length,
      physicalEvolution,
      levelEvolution,
      levelByMatch,
      levelByWeek,
      levelByMonth,
      marketEvolution,
      continuity,
      injuries,
      loading: matchesLoading || mvLoading || injLoading,
    }
  }, [informe, internal, gpsData, marketValueHistory, matches, mvRows, rawInjuries, matchesLoading, mvLoading, injLoading])
}
