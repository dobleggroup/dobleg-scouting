// src/features/coaches/components/RosterTable.tsx
// Plantel del DT como lista con columnas ordenables, mismo lenguaje visual que la tabla de
// jugadores de Scout Externo (components/players/PlayerTable): card-apple, encabezados chicos
// en mayúscula, filas con hover verde y tarjetas en mobile.
import { useMemo, useState } from 'react'
import type { SquadPlayer } from '@/services/footballApiService'
import type { SquadPlayerProfile } from '@/services/coachService'
import type { SquadCareer } from '@/services/squadCareersService'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { useLanguage } from '@/context/LanguageContext'

/** Nuestras posiciones, en el orden en que se lee un plantel (de arquero a delantero). */
export const OUR_POSITIONS = ['ARQ', 'LD', 'CB', 'LI', 'VC', 'VI', 'EXT', 'DEL'] as const
export type OurPosition = (typeof OUR_POSITIONS)[number]

const POSITION_LABEL_KEY: Record<OurPosition, string> = {
  ARQ: 'teamRoster.posArquero',
  LD: 'teamRoster.posLateralDerecho',
  CB: 'teamRoster.posDefensorCentral',
  LI: 'teamRoster.posLateralIzquierdo',
  VC: 'teamRoster.posVolanteCentral',
  VI: 'teamRoster.posVolanteInterno',
  EXT: 'teamRoster.posExtremo',
  DEL: 'teamRoster.posDelantero',
}

/** Posición de Transfermarkt (castellano) o grupo genérico de API-Football -> la nuestra. */
const TM_TO_OURS: Record<string, OurPosition> = {
  'portero': 'ARQ',
  'lateral derecho': 'LD',
  'defensa central': 'CB', 'defensa': 'CB',
  'lateral izquierdo': 'LI',
  'pivote': 'VC', 'mediocentro': 'VC', 'centrocampista': 'VC', 'mediocentro defensivo': 'VC',
  'mediocentro ofensivo': 'VI', 'mediapunta': 'VI', 'interior derecho': 'VI', 'interior izquierdo': 'VI',
  'extremo derecho': 'EXT', 'extremo izquierdo': 'EXT', 'extremo': 'EXT',
  'delantero centro': 'DEL', 'delantero': 'DEL', 'segundo delantero': 'DEL',
}
const API_GROUP_TO_OURS: Record<string, OurPosition> = { Goalkeeper: 'ARQ', Defender: 'CB', Midfielder: 'VC', Attacker: 'DEL' }

export function resolveOurPosition(profilePosition: string | null | undefined, careerPosition: string | null | undefined, apiGroup: string | null | undefined): OurPosition | null {
  if (profilePosition && (OUR_POSITIONS as readonly string[]).includes(profilePosition)) return profilePosition as OurPosition
  if (careerPosition) {
    const mapped = TM_TO_OURS[careerPosition.trim().toLowerCase()]
    if (mapped) return mapped
  }
  return apiGroup ? API_GROUP_TO_OURS[apiGroup] ?? null : null
}

export interface RosterRow {
  player: SquadPlayer
  stats?: { minutes: number; matches: number }
  profile?: SquadPlayerProfile
  career?: SquadCareer
  /** null = fila no clickeable. */
  onOpen: (() => void) | null
  busy: boolean
}

type SortKey = 'position' | 'name' | 'age' | 'height' | 'value' | 'contract' | 'minutes'

function monthsUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44))
}

/** "275 mil €" / "1,2 M€": como lo muestra Transfermarkt en castellano. */
function formatMarketValue(eur: number): string {
  if (eur >= 1_000_000) return `${(eur / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M€`
  return `${Math.round(eur / 1000)} mil €`
}

interface Derived {
  row: RosterRow
  position: OurPosition | null
  age: number | null
  heightCm: number | null
  foot: string | null
  value: number | null
  contractEnd: string | null
  agent: string | null
  nationality: string | null
  homegrown: boolean
}

function derive(row: RosterRow): Derived {
  const { player, profile, career } = row
  return {
    row,
    position: resolveOurPosition(profile?.primary_position, career?.position, player.position),
    age: player.age ?? null,
    heightCm: career?.heightCm ?? null,
    foot: career?.foot ?? null,
    value: profile?.market_value_eur ?? career?.marketValueEur ?? null,
    contractEnd: profile?.contract_end_date ?? career?.contractUntil ?? null,
    agent: profile?.agent ?? career?.agent ?? null,
    nationality: career?.nationality ?? null,
    homegrown: career?.homegrown ?? false,
  }
}

function compare(a: Derived, b: Derived, key: SortKey): number {
  const nullsLast = (x: number | string | null, y: number | string | null, cmp: number) =>
    x === null && y === null ? 0 : x === null ? 1 : y === null ? -1 : cmp
  switch (key) {
    case 'position': {
      const pa = a.position ? OUR_POSITIONS.indexOf(a.position) : 99
      const pb = b.position ? OUR_POSITIONS.indexOf(b.position) : 99
      return pa - pb || (a.age ?? 99) - (b.age ?? 99)
    }
    case 'name': return a.row.player.name.localeCompare(b.row.player.name)
    case 'age': return nullsLast(a.age, b.age, (a.age ?? 0) - (b.age ?? 0))
    case 'height': return nullsLast(a.heightCm, b.heightCm, (b.heightCm ?? 0) - (a.heightCm ?? 0))
    case 'value': return nullsLast(a.value, b.value, (b.value ?? 0) - (a.value ?? 0))
    case 'contract': return nullsLast(a.contractEnd, b.contractEnd, (a.contractEnd ?? '').localeCompare(b.contractEnd ?? ''))
    case 'minutes': return (b.row.stats?.minutes ?? -1) - (a.row.stats?.minutes ?? -1)
  }
}

function ContractBadge({ iso }: { iso: string }) {
  const { t } = useLanguage()
  const months = monthsUntil(iso)
  const color = months > 18
    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
    : months > 6
      ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
      : 'text-red-500 bg-red-500/10'
  const date = new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
  return (
    <span className={`inline-flex items-center text-2xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${color}`}
      title={months <= 0 ? t('teamRoster.contratoVencido') : t(months === 1 ? 'teamRoster.contratoUnMes' : 'teamRoster.contratoVariosMeses').replace('{count}', String(months))}>
      {date}
    </span>
  )
}

function HomegrownBadge() {
  const { t } = useLanguage()
  return (
    <span className="inline-flex items-center text-2xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-brand-green/10 text-brand-green">
      {t('teamRoster.surgidoClub')}
    </span>
  )
}

const DASH = <span className="text-apple-gray-300 dark:text-apple-gray-600">—</span>

export default function RosterTable({ rows }: { rows: RosterRow[] }) {
  const { t } = useLanguage()
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'position', asc: true })
  const derived = useMemo(() => {
    const list = rows.map(derive).sort((a, b) => compare(a, b, sort.key))
    return sort.asc ? list : list.reverse()
  }, [rows, sort])

  // Sin minutos cargados para nadie (clubes sin sync de partidos) la columna sería solo rayas.
  const hasMinutes = rows.some(r => r.stats)
  const posLabel = (p: OurPosition | null) => (p ? t(POSITION_LABEL_KEY[p]) : '—')
  const header = (key: SortKey | null, label: string, align: 'left' | 'center' | 'right' = 'left', cls = '') => {
    const active = key !== null && sort.key === key
    return (
      <th className={`px-3 py-2.5 text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider whitespace-nowrap text-${align} ${cls}`}>
        {key ? (
          <button
            type="button"
            onClick={() => setSort(s => ({ key, asc: s.key === key ? !s.asc : true }))}
            className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-apple-gray-800 dark:hover:text-white ${active ? 'text-brand-green' : ''}`}
          >
            {label}
            {active && <span aria-hidden="true">{sort.asc ? '↑' : '↓'}</span>}
          </button>
        ) : label}
      </th>
    )
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Mobile: tarjetas */}
      <div className="md:hidden space-y-2">
        {derived.map(d => {
          const { player, onOpen } = d.row
          return (
            <button key={player.id} type="button" disabled={!onOpen || d.row.busy} onClick={onOpen ?? undefined}
              className="w-full text-left bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-3 hover:border-brand-green/40 transition-colors disabled:cursor-default">
              <div className="flex items-center gap-2.5">
                <PlayerPhoto src={player.photo} name={player.name} size="md" rounded="full" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-apple-gray-800 dark:text-white truncate">{player.name}</p>
                  <p className="text-xs text-apple-gray-500 truncate">
                    {[posLabel(d.position), d.age != null ? `${d.age} ${t('externo.anios')}` : null, d.nationality].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {d.value != null && <span className="text-xs font-semibold text-brand-green flex-shrink-0">{formatMarketValue(d.value)}</span>}
              </div>
              {(d.homegrown || d.contractEnd || d.agent) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {d.homegrown && <HomegrownBadge />}
                  {d.contractEnd && <ContractBadge iso={d.contractEnd} />}
                  {d.agent && <span className="text-2xs text-apple-gray-500 dark:text-apple-gray-400 truncate">{d.agent}</span>}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Desktop: tabla */}
      <div className="hidden md:block card-apple overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-apple-gray-200/50 dark:border-apple-gray-700/50 bg-apple-gray-50/80 dark:bg-apple-gray-800/50">
                {header(null, '#', 'center', 'w-10')}
                {header('name', t('teamRoster.colJugador'))}
                {header('position', t('teamRoster.colPosicion'))}
                {header('age', t('teamRoster.colEdad'), 'center')}
                {header('height', t('teamRoster.colAltura'), 'center', 'hidden lg:table-cell')}
                {header(null, t('teamRoster.colPie'), 'left', 'hidden lg:table-cell')}
                {header('value', t('teamRoster.colValor'), 'right')}
                {header('contract', t('teamRoster.colContrato'), 'center')}
                {header(null, t('teamRoster.colAgente'), 'left', 'hidden xl:table-cell')}
                {header(null, t('teamRoster.colSurgido'), 'center')}
                {hasMinutes && header('minutes', t('teamRoster.colMinutos'), 'right', 'hidden lg:table-cell')}
              </tr>
            </thead>
            <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-800/50">
              {derived.map(d => {
                const { player, stats, onOpen, busy } = d.row
                return (
                  <tr key={player.id}
                    onClick={onOpen && !busy ? onOpen : undefined}
                    className={`transition-colors duration-150 ${onOpen ? 'hover:bg-brand-green/5 dark:hover:bg-brand-green/10 cursor-pointer' : ''} ${busy ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-2.5 text-center tabular-nums text-apple-gray-400 text-xs">{player.number ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PlayerPhoto src={player.photo} name={player.name} size="sm" rounded="full" />
                        <div className="min-w-0">
                          <p className="font-semibold text-apple-gray-800 dark:text-white truncate">{player.name}</p>
                          {d.nationality && <p className="text-2xs text-apple-gray-400 truncate">{d.nationality}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {d.position && <span className="text-2xs font-bold tabular-nums px-1.5 py-0.5 rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300">{d.position}</span>}
                        <span className="text-apple-gray-700 dark:text-apple-gray-300">{posLabel(d.position)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-apple-gray-700 dark:text-apple-gray-300">{d.age ?? DASH}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-apple-gray-700 dark:text-apple-gray-300 hidden lg:table-cell">
                      {d.heightCm ? `${(d.heightCm / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })} m` : DASH}
                    </td>
                    <td className="px-3 py-2.5 text-apple-gray-700 dark:text-apple-gray-300 hidden lg:table-cell">{d.foot ?? DASH}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-apple-gray-800 dark:text-white whitespace-nowrap">{d.value != null ? formatMarketValue(d.value) : DASH}</td>
                    <td className="px-3 py-2.5 text-center">{d.contractEnd ? <ContractBadge iso={d.contractEnd} /> : DASH}</td>
                    <td className="px-3 py-2.5 text-apple-gray-600 dark:text-apple-gray-400 text-xs max-w-[10rem] truncate hidden xl:table-cell">{d.agent ?? DASH}</td>
                    <td className="px-3 py-2.5 text-center">{d.homegrown ? <HomegrownBadge /> : null}</td>
                    {hasMinutes && <td className="px-3 py-2.5 text-right tabular-nums text-apple-gray-700 dark:text-apple-gray-300 hidden lg:table-cell">{stats ? stats.minutes.toLocaleString('es-AR') : DASH}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
