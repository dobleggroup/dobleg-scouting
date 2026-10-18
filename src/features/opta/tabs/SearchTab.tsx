import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Slider from 'rc-slider'
import 'rc-slider/assets/index.css'
import EmptyState from '@/components/ui/EmptyState'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import MobileFilterPanel, { MobileFilterButton } from '@/components/filters/MobileFilterPanel'
import { normalizeName } from '@/utils/scoring'
import { POOL_OF, type AppPos, type GroupCode, type OptaLeague, type OptaPlayer } from '../data'
import {
  CATEGORY_LABEL, fmt, GROUP_PROFILE, METRICS, metric, monthsLeft, POS_LABEL, POS_ORDER, POS_SHORT, profileScore,
  type Category, type PercentileIndex,
} from '../metrics'
import { Card, DgBadge, PctPill, TeamDot } from '../components/ui'
import Scatter from '../components/Scatter'

const PAGE_SIZE = 50
const STORAGE_KEY = 'opta-buscador-filtros'


interface Cond { key: string; min: number }
interface Filters {
  search: string
  positions: AppPos[]
  team: string
  minMinutes: number
  minScore: number
  age: [number, number]
  contractMonths: number
  foot: '' | 'left' | 'right'
  origin: '' | 'arg' | 'ext'
  onlyDg: boolean
  conds: Cond[]
}
const DEFAULTS: Filters = {
  search: '', positions: [], team: '', minMinutes: 450, minScore: 0, age: [16, 40], contractMonths: 0, foot: '', origin: '', onlyDg: false, conds: [],
}

/** Perfiles de búsqueda listos: puesto + percentiles mínimos. */
const PRESETS: Array<{ label: string; help: string; positions: AppPos[]; conds: Cond[] }> = [
  { label: 'Delantero goleador', help: 'Genera muchas chances (xG) y patea seguido', positions: ['DEL'], conds: [{ key: 'npxg', min: 75 }, { key: 'shots', min: 60 }] },
  { label: 'Extremo que encara', help: 'Gana mano a mano y lleva la pelota hacia adelante', positions: ['EXT'], conds: [{ key: 'dribbles', min: 75 }, { key: 'progCarries', min: 65 }] },
  { label: 'Volante interno creativo', help: 'Crea chances para los compañeros', positions: ['VI'], conds: [{ key: 'xa', min: 75 }, { key: 'keyPasses', min: 70 }] },
  { label: 'Volante central recuperador', help: 'Recupera mucho y gana duelos', positions: ['VC'], conds: [{ key: 'recoveries', min: 70 }, { key: 'tacklesWon', min: 65 }] },
  { label: 'Volante que hace jugar', help: 'Mucho pase y pases progresivos', positions: ['VC', 'VI'], conds: [{ key: 'passes', min: 70 }, { key: 'progPasses', min: 70 }] },
  { label: 'Lateral ofensivo', help: 'Centra y genera desde el costado', positions: ['LD', 'LI'], conds: [{ key: 'xa', min: 70 }, { key: 'progCarries', min: 60 }] },
  { label: 'Central que sale jugando', help: 'Pases progresivos y buena precisión', positions: ['CB'], conds: [{ key: 'progPasses', min: 70 }, { key: 'passPct', min: 60 }] },
  { label: 'Central que gana duelos', help: 'Gana por arriba y en el uno contra uno', positions: ['CB'], conds: [{ key: 'aerialPct', min: 70 }, { key: 'duelPct', min: 65 }] },
  { label: 'Arquero atajador', help: 'Ataja más de lo esperado', positions: ['ARQ'], conds: [{ key: 'goalsPrevented', min: 70 }] },
]

const SLIDER_STYLES = {
  track: { backgroundColor: '#22c55e', height: 4 },
  rail: { backgroundColor: '#e5e7eb', height: 4 },
  handle: { backgroundColor: '#fff', borderColor: '#22c55e', borderWidth: 2, width: 16, height: 16, marginTop: -6, opacity: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' },
}

function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      // La versión anterior guardaba grupos de Opta en vez de posiciones: se descartan.
      return { ...DEFAULTS, ...saved, positions: Array.isArray(saved.positions) ? saved.positions : [] }
    }
  } catch { /* sin storage */ }
  return DEFAULTS
}

/** Métricas por defecto del gráfico según el puesto elegido. */
const SCATTER_DEFAULT: Record<GroupCode | 'all', [string, string]> = {
  all: ['npxg', 'xa'], GK: ['savePct', 'goalsPrevented'], CB: ['progPasses', 'aerialPct'], FB: ['progPasses', 'tacklesWon'],
  VC: ['progPasses', 'recoveries'], VI: ['xa', 'progPasses'], EXT: ['dribbles', 'xa'], ST: ['npxg', 'goals'],
}

export default function SearchTab({ league, idx, dg }: { league: OptaLeague; idx: PercentileIndex; dg: Map<string, unknown> }) {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<Filters>(loadFilters)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'score', dir: -1 })
  const [cat, setCat] = useState<Category | 'perfil'>('perfil')
  const [selected, setSelected] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [sx, setSx] = useState<string | null>(null)
  const [sy, setSy] = useState<string | null>(null)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)) } catch { /* sin storage */ }
    setPage(0)
  }, [filters])

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters(f => ({ ...f, [k]: v }))
  // Si todas las posiciones elegidas son del mismo grupo (ej. LD + LI), se usan sus métricas clave.
  const groupsSel = [...new Set(filters.positions.map(p => POOL_OF[p]))]
  const singleGroup = groupsSel.length === 1 ? groupsSel[0] : null

  const filtered = useMemo(() => {
    const words = normalizeName(filters.search).split(/\s+/).filter(Boolean)
    return league.players.filter(p => {
      if (p.minutes < filters.minMinutes) return false
      if (filters.positions.length && !filters.positions.includes(p.pos)) return false
      if (filters.team && p.teamId !== filters.team) return false
      if (p.age !== null && (p.age < filters.age[0] || p.age > filters.age[1])) return false
      if (filters.onlyDg && !dg.has(p.id)) return false
      if (filters.foot && p.foot !== filters.foot) return false
      if (filters.origin === 'arg' && p.nat !== 'Argentina') return false
      if (filters.origin === 'ext' && (!p.nat || p.nat === 'Argentina')) return false
      if (filters.contractMonths) {
        const ml = monthsLeft(p.contractEnd)
        if (ml === null || ml > filters.contractMonths) return false
      }
      if (filters.minScore && (profileScore(p, idx) ?? 0) < filters.minScore) return false
      for (const c of filters.conds) if ((idx.pct(p, c.key) ?? -1) < c.min) return false
      if (words.length) {
        const hay = normalizeName(`${p.fullName ?? ''} ${p.name} ${league.teamById.get(p.teamId ?? '')?.name ?? ''}`)
        if (!words.every(w => hay.includes(w))) return false
      }
      return true
    })
  }, [league, filters, idx, dg])

  const columns = useMemo(() => {
    const condKeys = filters.conds.map(c => c.key)
    if (cat !== 'perfil') return METRICS.filter(m => m.category === cat)
    const base = singleGroup ? GROUP_PROFILE[singleGroup].slice(0, 6) : ['goals', 'npxg', 'xa', 'progPasses', 'dribbles', 'recoveries']
    return [...new Set([...condKeys, ...base])].slice(0, 7).map(metric)
  }, [cat, singleGroup, filters.conds])

  const sorted = useMemo(() => {
    const val = (p: OptaPlayer): number => {
      if (sort.key === 'score') return profileScore(p, idx) ?? -1
      if (sort.key === 'minutes') return p.minutes
      if (sort.key === 'age') return p.age ?? 99
      if (sort.key === 'contract') return monthsLeft(p.contractEnd) ?? 999
      const v = metric(sort.key).value(p)
      return v === null ? (sort.dir === -1 ? -Infinity : Infinity) : v
    }
    return [...filtered].sort((a, b) => (val(a) - val(b)) * sort.dir)
  }, [filtered, sort, idx])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const rows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const toggleSort = (key: string, lowerIsBetter = false) => setSort(s => s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: lowerIsBetter ? 1 : -1 })
  const toggleSelect = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : s.length >= 3 ? s : [...s, id])

  const activeCount = [
    filters.positions.length > 0, filters.team, filters.minMinutes !== DEFAULTS.minMinutes, filters.minScore, filters.age[0] !== 16 || filters.age[1] !== 40,
    filters.contractMonths, filters.foot, filters.origin, filters.onlyDg, filters.conds.length > 0,
  ].filter(Boolean).length

  const [dx, dy] = SCATTER_DEFAULT[singleGroup ?? 'all']
  const mx = metric(sx ?? dx), my = metric(sy ?? dy)
  const scatterPts = filtered
    .filter(p => !(mx.minVolume && mx.minVolume(p) < (mx.minVolumeValue ?? 0)) && !(my.minVolume && my.minVolume(p) < (my.minVolumeValue ?? 0)))
    .map(p => ({ p, x: mx.value(p), y: my.value(p) }))
    .filter((d): d is { p: OptaPlayer; x: number; y: number } => d.x !== null && d.y !== null)
    .map(({ p, x, y }) => ({ id: p.id, name: p.name, team: league.teamById.get(p.teamId ?? '')?.short ?? '', x, y, dg: dg.has(p.id), focus: selected.includes(p.id) }))

  const filterControls = (
    <FilterControls league={league} filters={filters} set={set} setFilters={setFilters} activeCount={activeCount} />
  )

  return (
    <div>
      {/* Encabezado + búsqueda, como Scout Externo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
          <b className="text-apple-gray-800 dark:text-white">{sorted.length.toLocaleString('es-AR')}</b> jugadores
          {filters.positions.length > 0 && <span> · {filters.positions.map(p => POS_LABEL[p]).join(', ')}</span>}
          {filters.conds.length > 0 && <span> · {filters.conds.length} {filters.conds.length === 1 ? 'condición' : 'condiciones'} de métricas</span>}
        </p>
        <div className="relative flex-1 sm:flex-initial sm:max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Buscar jugador o equipo…" value={filters.search} onChange={e => set('search', e.target.value)} className="input-apple pl-9 pr-4 w-full" />
        </div>
      </div>

      {/* Perfiles listos */}
      <div className="mb-4">
        <div className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1.5">Buscar por perfil</div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {PRESETS.map(p => {
            const active = JSON.stringify(filters.conds) === JSON.stringify(p.conds) && JSON.stringify(filters.positions) === JSON.stringify(p.positions)
            return (
              <button
                key={p.label}
                title={p.help}
                onClick={() => setFilters(f => active ? { ...f, positions: [], conds: [] } : { ...f, positions: p.positions, conds: p.conds })}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                  active ? 'bg-brand-green text-white border-brand-green shadow-sm' : 'border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:border-brand-green/60'
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="hidden lg:block">{filterControls}</div>
      {selected.length === 0 && <MobileFilterButton onClick={() => setShowFilters(true)} activeCount={activeCount} />}
      <MobileFilterPanel isOpen={showFilters} onClose={() => setShowFilters(false)} activeCount={activeCount}>
        {filterControls}
        <button onClick={() => setShowFilters(false)} className="mt-6 w-full py-3 rounded-xl text-sm font-semibold text-gray-900 bg-brand-green hover:bg-emerald-500 transition-colors">
          Ver {sorted.length.toLocaleString('es-AR')} resultados
        </button>
      </MobileFilterPanel>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">
          Cada 90 minutos. El número de color es el <b>percentil</b> contra los de su puesto en la liga (100 = el mejor). Tildá hasta 3 para compararlos.
        </p>
        <select value={cat} onChange={e => setCat(e.target.value as Category | 'perfil')} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto" aria-label="Columnas">
          <option value="perfil">Columnas: clave del puesto</option>
          {(Object.keys(CATEGORY_LABEL) as Category[]).map(c => <option key={c} value={c}>Columnas: {CATEGORY_LABEL[c]}</option>)}
        </select>
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="Sin resultados" description="Ningún jugador cumple todos los filtros. Probá bajando algún percentil o los minutos." icon="filter" />
      ) : (
        <>
          {/* Mobile */}
          <div className="block lg:hidden space-y-2">
            {rows.map(p => {
              const score = profileScore(p, idx)
              const team = league.teamById.get(p.teamId ?? '')
              return (
                <div key={p.id} className="card-apple p-3 flex items-center gap-3">
                  <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} className="w-4 h-4 rounded border-apple-gray-300 text-brand-green focus:ring-brand-green/50" aria-label={`Elegir ${p.name}`} />
                  <button onClick={() => navigate(`/opta/jugador/${p.id}`)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                    <PlayerPhoto name={p.name} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate flex items-center gap-1.5">{p.name}{dg.has(p.id) && <DgBadge />}</p>
                      <p className="text-xs text-apple-gray-500 truncate">{team?.short ?? '—'} · {POS_SHORT[p.pos]}{p.age !== null && ` · ${p.age} años`} · {p.minutes}'</p>
                    </div>
                    <PctPill pct={score} size="md" />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Desktop */}
          <div className="hidden lg:block card-apple overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-apple-gray-200 dark:border-apple-gray-700">
                  <th className="w-10 py-3 px-2" />
                  <Th left label="Jugador" />
                  <Th left label="Equipo" />
                  <Th label="Pos" />
                  <Th label="Edad" active={sort.key === 'age'} dir={sort.dir} onClick={() => toggleSort('age', true)} />
                  <Th label="Min" active={sort.key === 'minutes'} dir={sort.dir} onClick={() => toggleSort('minutes')} />
                  <Th label="Contrato" active={sort.key === 'contract'} dir={sort.dir} onClick={() => toggleSort('contract', true)} title="Fin de contrato según Opta" />
                  {columns.map(c => <Th key={c.key} label={c.label} active={sort.key === c.key} dir={sort.dir} onClick={() => toggleSort(c.key, c.lowerIsBetter)} title={c.help} />)}
                  <Th label="Nota" active={sort.key === 'score'} dir={sort.dir} onClick={() => toggleSort('score')} title="Promedio de sus percentiles en las métricas clave de su puesto (0-100)" />
                </tr>
              </thead>
              <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-800">
                {rows.map(p => {
                  const team = league.teamById.get(p.teamId ?? '')
                  const ml = monthsLeft(p.contractEnd)
                  return (
                    <tr key={p.id} onClick={() => navigate(`/opta/jugador/${p.id}`)} className="cursor-pointer hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 transition-colors">
                      <td className="py-2.5 px-2" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} disabled={!selected.includes(p.id) && selected.length >= 3}
                          className="w-4 h-4 rounded border-apple-gray-300 dark:border-apple-gray-600 text-brand-green focus:ring-brand-green/50 disabled:opacity-30" aria-label={`Elegir ${p.name}`} />
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          <PlayerPhoto name={p.name} size="sm" />
                          <span className="text-sm font-medium text-apple-gray-800 dark:text-white truncate max-w-[190px]">{p.name}</span>
                          {dg.has(p.id) && <DgBadge />}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <TeamDot team={team} />
                          <span className="text-sm text-apple-gray-600 dark:text-apple-gray-300 truncate max-w-[130px]">{team?.short ?? '—'}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-apple-gray-100 dark:bg-apple-gray-800 text-xs font-semibold text-apple-gray-600 dark:text-apple-gray-300">{POS_SHORT[p.pos]}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-sm text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">{p.age ?? '—'}</td>
                      <td className="py-2.5 px-3 text-center text-sm text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">{p.minutes}</td>
                      <td className={`py-2.5 px-3 text-center text-sm tabular-nums whitespace-nowrap ${ml !== null && ml <= 6 ? 'text-orange-500 font-semibold' : ml !== null && ml <= 12 ? 'text-amber-500' : 'text-apple-gray-500 dark:text-apple-gray-400'}`}>
                        {p.contractEnd ? `${p.contractEnd.slice(5, 7)}/${p.contractEnd.slice(2, 4)}` : '—'}
                      </td>
                      {columns.map(c => (
                        <td key={c.key} className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="text-sm text-apple-gray-700 dark:text-apple-gray-200 tabular-nums">{fmt(c.value(p), c)}</div>
                          <PctPill pct={idx.pct(p, c.key)} />
                        </td>
                      ))}
                      <td className="py-2.5 px-3 text-center"><PctPill pct={profileScore(p, idx)} size="md" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 px-1">
              <p className="text-xs text-apple-gray-500">Página {page + 1} de {totalPages} · {sorted.length.toLocaleString('es-AR')} jugadores</p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Anterior</button>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Siguiente</button>
              </div>
            </div>
          )}
        </>
      )}

      <Card
        className="mt-6"
        title="Armá tu gráfico"
        subtitle="Elegí dos métricas y mirá a todos los jugadores del buscador. Los tildados se marcan en azul."
        action={
          <div className="flex flex-wrap gap-2">
            <MetricSelect value={mx.key} onChange={setSx} label="Eje horizontal" />
            <MetricSelect value={my.key} onChange={setSy} label="Eje vertical" />
          </div>
        }
      >
        <Scatter points={scatterPts} mx={mx} my={my} />
      </Card>

      {selected.length > 0 && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] lg:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 px-4 sm:px-5 py-3 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <span className="text-sm font-medium text-apple-gray-600 dark:text-apple-gray-300">
            {selected.map(id => league.playerById.get(id)?.name).join(' · ')}
          </span>
          <button
            onClick={() => navigate(`/opta/comparar?ids=${selected.join(',')}`)}
            disabled={selected.length < 2}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            {selected.length < 2 ? 'Elegí otro para comparar' : `Comparar ${selected.length}`}
          </button>
          <button onClick={() => setSelected([])} aria-label="Limpiar selección" className="p-2 rounded-lg text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-300 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}

function Th({ label, left, active, dir, onClick, title }: { label: string; left?: boolean; active?: boolean; dir?: 1 | -1; onClick?: () => void; title?: string }) {
  const cls = `py-3 px-3 text-xs font-semibold uppercase tracking-wider ${left ? 'text-left px-4' : 'text-center'} ${active ? 'text-apple-gray-800 dark:text-white' : 'text-apple-gray-500 dark:text-apple-gray-400'}`
  if (!onClick) return <th className={cls}>{label}</th>
  return (
    <th className={cls} title={title}>
      <button type="button" onClick={onClick} className="uppercase tracking-wider font-semibold hover:text-apple-gray-700 dark:hover:text-apple-gray-200 leading-tight max-w-[7.5rem]">
        {label}{active && <span aria-hidden> {dir === -1 ? '↓' : '↑'}</span>}
      </button>
    </th>
  )
}

function MetricSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto" aria-label={label}>
      {(Object.keys(CATEGORY_LABEL) as Category[]).map(c => (
        <optgroup key={c} label={CATEGORY_LABEL[c]}>
          {METRICS.filter(m => m.category === c).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

function FilterControls({ league, filters, set, setFilters, activeCount }: {
  league: OptaLeague
  filters: Filters
  set: <K extends keyof Filters>(k: K, v: Filters[K]) => void
  setFilters: React.Dispatch<React.SetStateAction<Filters>>
  activeCount: number
}) {
  const [newKey, setNewKey] = useState('')
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {POS_ORDER.map(pos => (
            <button
              key={pos}
              title={POS_LABEL[pos]}
              onClick={() => set('positions', filters.positions.includes(pos) ? filters.positions.filter(x => x !== pos) : [...filters.positions, pos])}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                filters.positions.includes(pos) ? 'bg-brand-green text-white shadow-sm' : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700'
              }`}
            >
              {POS_SHORT[pos]}
            </button>
          ))}
        </div>
        <div className="w-px h-6 bg-apple-gray-200 dark:bg-apple-gray-700 hidden sm:block" />
        <select value={filters.team} onChange={e => set('team', e.target.value)} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
          <option value="">Todos los equipos</option>
          {[...league.teams].sort((a, b) => a.short.localeCompare(b.short, 'es')).map(t => <option key={t.id} value={t.id}>{t.short}</option>)}
        </select>
        <select value={filters.minMinutes} onChange={e => set('minMinutes', Number(e.target.value))} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
          <option value={0}>Sin mínimo de minutos</option>
          <option value={270}>Min. 270' (3 partidos)</option>
          <option value={450}>Min. 450' (5 partidos)</option>
          <option value={900}>Min. 900' (10 partidos)</option>
          <option value={1350}>Min. 1350' (15 partidos)</option>
          <option value={1800}>Min. 1800' (20 partidos)</option>
        </select>
        <select value={filters.minScore} onChange={e => set('minScore', Number(e.target.value))} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
          <option value={0}>Sin nota mínima</option>
          <option value={35}>Nota 35+</option>
          <option value={55}>Nota 55+</option>
          <option value={70}>Nota 70+</option>
          <option value={80}>Nota 80+ (elite)</option>
        </select>
        <select value={filters.contractMonths} onChange={e => set('contractMonths', Number(e.target.value))} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
          <option value={0}>Fin de contrato</option>
          <option value={6}>Vence en 6 meses</option>
          <option value={12}>Vence en 1 año</option>
          <option value={18}>Vence en 18 meses</option>
          <option value={24}>Vence en 2 años</option>
        </select>
        <select value={filters.foot} onChange={e => set('foot', e.target.value as Filters['foot'])} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
          <option value="">Cualquier pie</option>
          <option value="left">Zurdos</option>
          <option value="right">Diestros</option>
        </select>
        <select value={filters.origin} onChange={e => set('origin', e.target.value as Filters['origin'])} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
          <option value="">Toda nacionalidad</option>
          <option value="arg">Argentinos</option>
          <option value="ext">Extranjeros</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 px-1">
          <input type="checkbox" checked={filters.onlyDg} onChange={e => set('onlyDg', e.target.checked)} className="w-4 h-4 rounded border-apple-gray-300 text-brand-green focus:ring-brand-green/50" />
          Solo Doble G
        </label>
        {activeCount > 0 && (
          <button onClick={() => setFilters(f => ({ ...DEFAULTS, search: f.search }))} className="text-xs text-apple-gray-500 hover:text-red-500 transition-colors underline ml-1">Limpiar filtros</button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 mb-4">
        <div className="w-[200px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400">Edad</span>
            <span className="text-xs font-semibold text-apple-gray-700 dark:text-apple-gray-200 tabular-nums">{filters.age[0]} – {filters.age[1]}</span>
          </div>
          <Slider range min={16} max={40} value={filters.age} onChange={v => set('age', v as [number, number])} styles={SLIDER_STYLES} />
        </div>

        {/* Condiciones por métrica: el "super buscador" */}
        <div className="flex flex-wrap items-center gap-2">
          {filters.conds.map((c, i) => {
            const m = metric(c.key)
            return (
              <span key={c.key} className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full bg-brand-green/10 border border-brand-green/30 text-xs text-apple-gray-700 dark:text-apple-gray-200">
                <span className="font-semibold">{m.label}</span>
                <span className="text-apple-gray-500">percentil ≥</span>
                <select
                  value={c.min}
                  onChange={e => set('conds', filters.conds.map((x, j) => j === i ? { ...x, min: Number(e.target.value) } : x))}
                  className="bg-transparent font-bold tabular-nums focus:outline-none"
                  aria-label={`Percentil mínimo de ${m.label}`}
                >
                  {[50, 60, 65, 70, 75, 80, 85, 90, 95].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <button onClick={() => set('conds', filters.conds.filter((_, j) => j !== i))} aria-label={`Quitar ${m.label}`} className="w-5 h-5 rounded-full flex items-center justify-center text-apple-gray-400 hover:text-red-500 hover:bg-white/60 dark:hover:bg-apple-gray-700">×</button>
              </span>
            )
          })}
          {filters.conds.length < 4 && (
            <select
              value={newKey}
              onChange={e => {
                const k = e.target.value
                setNewKey('')
                if (k && !filters.conds.some(c => c.key === k)) set('conds', [...filters.conds, { key: k, min: 70 }])
              }}
              className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto border-dashed"
              aria-label="Agregar condición por métrica"
            >
              <option value="">+ Condición por métrica</option>
              {(Object.keys(CATEGORY_LABEL) as Category[]).map(cat => (
                <optgroup key={cat} label={CATEGORY_LABEL[cat]}>
                  {METRICS.filter(m => m.category === cat && !filters.conds.some(c => c.key === m.key)).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  )
}
