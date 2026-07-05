import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { MetricStat, ChartAssignments, ScatterAssignment } from '@/features/informes/types'
import { normalizeForSearch } from '@/lib/search'

// Colores de comparación del radar (deben coincidir con COMPARE_COLORS en chartData.ts)
const COMPARE_COLORS = ['#F5C451', '#38BDF8']

export interface ComparePlayerOption { idx: number; name: string }

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatValue(stat: MetricStat): string {
  if (stat.value == null) return '—'
  return stat.def.unit === '%' ? stat.value.toFixed(0) : stat.value.toFixed(2)
}

function dotClass(color: MetricStat['color']): string {
  switch (color) {
    case 'green': return 'bg-brand-green'
    case 'amber': return 'bg-amber-400'
    case 'red': return 'bg-brand-red'
    default: return 'bg-apple-gray-400'
  }
}

function labelFor(stats: MetricStat[], key: string): string {
  return stats.find(s => s.def.key === key)?.def.label ?? key
}

// ─── Chip group (radar / bar / numbers) ────────────────────────────────────

interface ChipGroupProps {
  title: string
  hint?: string
  stats: MetricStat[]
  selected: string[]
  onChange: (keys: string[]) => void
  children?: ReactNode
}

function ChipGroup({ title, hint, stats, selected, onChange, children }: ChipGroupProps) {
  const available = stats.filter(s => !selected.includes(s.def.key))

  function add(key: string) {
    if (!key || selected.includes(key)) return
    onChange([...selected, key])
  }
  function remove(key: string) {
    onChange(selected.filter(k => k !== key))
  }

  return (
    <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-apple-gray-900 dark:text-white">{title}</h3>
        {hint && <span className="text-xs text-apple-gray-400 dark:text-apple-gray-500">{hint}</span>}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selected.map(key => (
            <span
              key={key}
              className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-brand-red/10 border border-brand-red/25 text-xs font-medium text-brand-red"
            >
              {labelFor(stats, key)}
              <button
                type="button"
                onClick={() => remove(key)}
                className="text-brand-red/50 hover:text-brand-red transition-colors ml-0.5"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
      <select
        value=""
        onChange={e => add(e.target.value)}
        disabled={available.length === 0}
        className="w-full px-3 py-2 rounded-xl text-xs border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red font-medium disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <option value="">+ Agregar</option>
        {available.map(s => (
          <option key={s.def.key} value={s.def.key}>{s.def.label}</option>
        ))}
      </select>
      {children}
    </div>
  )
}

// ─── Comparación de jugadores (radar) ──────────────────────────────────────

interface CompareSelectorProps {
  players: ComparePlayerOption[]
  compareIndices: number[]
  onChange: (idxs: number[]) => void
}

function CompareSelector({ players, compareIndices, onChange }: CompareSelectorProps) {
  const selected = compareIndices
    .map(idx => players.find(p => p.idx === idx))
    .filter((p): p is ComparePlayerOption => !!p)
  const available = players.filter(p => !compareIndices.includes(p.idx))
  const maxReached = compareIndices.length >= 2

  function add(idx: number) {
    if (maxReached || compareIndices.includes(idx)) return
    onChange([...compareIndices, idx])
  }
  function remove(idx: number) {
    onChange(compareIndices.filter(i => i !== idx))
  }

  return (
    <div className="mt-4 pt-4 border-t border-apple-gray-100 dark:border-apple-gray-800">
      <span className="block text-xs font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-2">
        Comparar con (hasta 2 jugadores)
      </span>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selected.map((p, i) => (
            <span
              key={p.idx}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-xs font-medium text-apple-gray-700 dark:text-apple-gray-200"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: COMPARE_COLORS[i] }}
              />
              {p.name || `Fila ${p.idx + 1}`}
              <button
                type="button"
                onClick={() => remove(p.idx)}
                className="text-apple-gray-400 hover:text-brand-green transition-colors ml-0.5"
                aria-label="Quitar comparación"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
      <select
        value=""
        onChange={e => { if (e.target.value) add(Number(e.target.value)) }}
        disabled={maxReached || available.length === 0}
        className="w-full px-3 py-2 rounded-xl text-xs border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green font-medium disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <option value="">+ Agregar</option>
        {available.map(p => (
          <option key={p.idx} value={p.idx}>{p.name || `Fila ${p.idx + 1}`}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Scatter section ────────────────────────────────────────────────────────

interface ScatterSectionProps {
  stats: MetricStat[]
  scatters: ScatterAssignment[]
  onChange: (scatters: ScatterAssignment[]) => void
}

function ScatterSection({ stats, scatters, onChange }: ScatterSectionProps) {
  function update(idx: number, patch: Partial<ScatterAssignment>) {
    onChange(scatters.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }
  function updateMin(idx: number, field: 'xMin' | 'yMin', raw: string) {
    onChange(scatters.map((s, i) => {
      if (i !== idx) return s
      const next = { ...s }
      if (raw.trim() === '') {
        delete next[field]
      } else {
        const num = Number(raw)
        if (!Number.isNaN(num)) next[field] = num
      }
      return next
    }))
  }
  function remove(idx: number) {
    onChange(scatters.filter((_, i) => i !== idx))
  }
  function add() {
    const keys = stats.map(s => s.def.key)
    onChange([...scatters, { xKey: keys[0] ?? '', yKey: keys[1] ?? keys[0] ?? '', caption: '' }])
  }

  return (
    <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
      <h3 className="text-sm font-semibold text-apple-gray-900 dark:text-white mb-3">Scatter Plots</h3>
      {scatters.length === 0 && (
        <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 italic mb-3">
          Sin scatter plots todavía.
        </p>
      )}
      <div className="space-y-3">
        {scatters.map((sc, idx) => (
          <div key={idx} className="rounded-xl border border-apple-gray-100 dark:border-apple-gray-800 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400">Gráfico {idx + 1}</span>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="text-apple-gray-400 hover:text-brand-red transition-colors"
                aria-label="Quitar scatter plot"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-apple-gray-400 dark:text-apple-gray-500 mb-1">Eje X</label>
                <select
                  value={sc.xKey}
                  onChange={e => update(idx, { xKey: e.target.value })}
                  className="w-full px-2 py-1.5 rounded-lg text-xs border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red"
                >
                  {stats.map(s => (
                    <option key={s.def.key} value={s.def.key}>{s.def.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-apple-gray-400 dark:text-apple-gray-500 mb-1">Eje Y</label>
                <select
                  value={sc.yKey}
                  onChange={e => update(idx, { yKey: e.target.value })}
                  className="w-full px-2 py-1.5 rounded-lg text-xs border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red"
                >
                  {stats.map(s => (
                    <option key={s.def.key} value={s.def.key}>{s.def.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-apple-gray-400 dark:text-apple-gray-500 mb-1">X mín</label>
                <input
                  type="number"
                  value={sc.xMin ?? ''}
                  onChange={e => updateMin(idx, 'xMin', e.target.value)}
                  placeholder="auto"
                  className="w-full px-2 py-1.5 rounded-lg text-xs border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
                />
              </div>
              <div>
                <label className="block text-[11px] text-apple-gray-400 dark:text-apple-gray-500 mb-1">Y mín</label>
                <input
                  type="number"
                  value={sc.yMin ?? ''}
                  onChange={e => updateMin(idx, 'yMin', e.target.value)}
                  placeholder="auto"
                  className="w-full px-2 py-1.5 rounded-lg text-xs border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-apple-gray-400 dark:text-apple-gray-500 mb-1">Caption</label>
              <input
                type="text"
                value={sc.caption}
                onChange={e => update(idx, { caption: e.target.value })}
                placeholder="Ej: Volumen vs precisión"
                className="w-full px-2 py-1.5 rounded-lg text-xs border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red"
              />
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        disabled={stats.length === 0}
        className="mt-3 w-full py-2 rounded-xl text-xs font-medium border-2 border-dashed border-apple-gray-300 dark:border-apple-gray-600 text-apple-gray-500 dark:text-apple-gray-400 hover:border-brand-red hover:text-brand-red transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        + Agregar scatter plot
      </button>
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

interface Step2MetricasProps {
  stats: MetricStat[]
  charts: ChartAssignments
  onChangeCharts: (charts: ChartAssignments) => void
  players: ComparePlayerOption[]
  compareIndices: number[]
  onChangeCompare: (idxs: number[]) => void
  onBack: () => void
  onNext: () => void
}

export default function Step2Metricas({
  stats,
  charts,
  onChangeCharts,
  players,
  compareIndices,
  onChangeCompare,
  onBack,
  onNext,
}: Step2MetricasProps) {
  const [query, setQuery] = useState('')

  const filteredStats = useMemo(() => {
    const q = normalizeForSearch(query.trim())
    if (!q) return stats
    return stats.filter(s => normalizeForSearch(s.def.label).includes(q))
  }, [stats, query])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── Izquierda: lista de métricas ── */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
          <h2 className="text-sm font-semibold text-apple-gray-900 dark:text-white mb-3">Métricas</h2>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar métrica..."
            disabled={stats.length === 0}
            className="w-full px-3 py-2.5 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-900 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red text-sm disabled:opacity-50 mb-3"
          />

          {stats.length === 0 ? (
            <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
              Subí un archivo en el paso 1 para ver las métricas detectadas.
            </p>
          ) : (
            <>
              <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-apple-gray-100 dark:border-apple-gray-800 divide-y divide-apple-gray-100 dark:divide-apple-gray-800">
                {filteredStats.map(stat => (
                  <div
                    key={stat.def.key}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotClass(stat.color)}`} />
                      <span className="text-sm text-apple-gray-900 dark:text-white truncate">{stat.def.label}</span>
                    </div>
                    <span className="text-sm font-medium text-apple-gray-600 dark:text-apple-gray-300 flex-shrink-0">
                      {formatValue(stat)}
                    </span>
                  </div>
                ))}
                {filteredStats.length === 0 && (
                  <p className="px-3 py-3 text-xs text-apple-gray-400 dark:text-apple-gray-500">Sin resultados</p>
                )}
              </div>
              <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-3">
                🟢 SOBRE PROM · 🟡 EN PROM · 🔴 BAJO
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Derecha: asignación a gráficos ── */}
      <div className="space-y-4">
        <ChipGroup
          title="Radar"
          hint="recomendado 5–9"
          stats={stats}
          selected={charts.radar}
          onChange={keys => onChangeCharts({ ...charts, radar: keys })}
        >
          <CompareSelector
            players={players}
            compareIndices={compareIndices}
            onChange={onChangeCompare}
          />
        </ChipGroup>
        <ChipGroup
          title="Barras comparativas"
          stats={stats}
          selected={charts.bar}
          onChange={keys => onChangeCharts({ ...charts, bar: keys })}
        />
        <ScatterSection
          stats={stats}
          scatters={charts.scatters}
          onChange={scatters => onChangeCharts({ ...charts, scatters })}
        />
        <ChipGroup
          title="Solo número + ranking"
          stats={stats}
          selected={charts.numbers}
          onChange={keys => onChangeCharts({ ...charts, numbers: keys })}
        />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 px-4 py-3 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 text-sm font-semibold hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors"
          >
            ← Volver
          </button>
          <button
            type="button"
            disabled={stats.length === 0}
            onClick={onNext}
            className="flex-1 px-4 py-3 rounded-xl bg-brand-red text-white text-sm font-semibold hover:bg-brand-red/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  )
}
