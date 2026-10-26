import { useMemo } from 'react'
import type { AgencyPlayer } from '@/constants/agencyPlayers'
import type { MatchContextValue } from '../types'
import RequiredMark from '@/components/ui/RequiredMark'

interface Props {
  value: MatchContextValue
  onChange: (next: MatchContextValue) => void
  roster: AgencyPlayer[]
  rivals: string[]
  competitions: string[]
  teams: string[]
  /** En la carga automática el jugador viene del PDF y no se elige acá. */
  hidePlayer?: boolean
  /** Equipo que dice el PDF, para avisar cuando no coincide con el prefill. */
  equipoHint?: string | null
}

const field = 'w-full px-3 py-2.5 rounded-apple border border-apple-gray-200 dark:border-apple-gray-600 ' +
  'bg-white dark:bg-apple-gray-700 text-apple-gray-800 dark:text-white text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-green/40'

const label = 'block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1.5'

const hintClass = 'text-2xs text-apple-gray-400 mt-1'

export default function MatchContextForm({
  value, onChange, roster, rivals, competitions, teams, hidePlayer, equipoHint,
}: Props) {
  const set = <K extends keyof MatchContextValue>(key: K, v: MatchContextValue[K]) =>
    onChange({ ...value, [key]: v })

  const sortedRoster = useMemo(
    () => [...roster].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')),
    [roster],
  )

  // Al elegir jugador se propone su club actual, que igual se puede pisar.
  const onPickPlayer = (fullName: string) => {
    const player = roster.find(p => p.fullName === fullName)
    onChange({ ...value, playerName: fullName, equipo: value.equipo || player?.team || '' })
  }

  return (
    <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-5 shadow-apple dark:shadow-apple-dark">
      <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white mb-4">Partido</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {!hidePlayer && (
          <div className="sm:col-span-2 lg:col-span-1">
            <label className={label} htmlFor="gps-jugador">Jugador<RequiredMark /></label>
            <select
              id="gps-jugador"
              className={field}
              value={value.playerName}
              onChange={e => onPickPlayer(e.target.value)}
            >
              <option value="">Elegí un jugador</option>
              {sortedRoster.map(p => (
                <option key={p.fullName} value={p.fullName}>{p.fullName}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={label} htmlFor="gps-fecha">Fecha del partido<RequiredMark /></label>
          <input id="gps-fecha" type="date" className={field}
            value={value.matchDate} onChange={e => set('matchDate', e.target.value)} />
        </div>

        <div>
          <label className={label} htmlFor="gps-equipo">Equipo</label>
          <input id="gps-equipo" list="gps-teams" className={field} placeholder="Estudiantes Río Cuarto"
            value={value.equipo} onChange={e => set('equipo', e.target.value)} />
          <datalist id="gps-teams">{teams.map(t => <option key={t} value={t} />)}</datalist>
          {equipoHint
            ? <p className="text-2xs text-amber-500 mt-1">El PDF dice «{equipoHint}»: verificá el equipo.</p>
            : <p className={hintClass}>Escribí uno nuevo si no está en la lista.</p>}
        </div>

        <div>
          <label className={label} htmlFor="gps-rival">Rival</label>
          <input id="gps-rival" list="gps-rivals" className={field} placeholder="Tigre"
            value={value.rival} onChange={e => set('rival', e.target.value)} />
          <datalist id="gps-rivals">{rivals.map(r => <option key={r} value={r} />)}</datalist>
          <p className={hintClass}>Escribí uno nuevo si no está en la lista.</p>
        </div>

        <div>
          <label className={label} htmlFor="gps-competencia">Competencia</label>
          <input id="gps-competencia" list="gps-comps" className={field} placeholder="Primera Nacional"
            value={value.competencia} onChange={e => set('competencia', e.target.value)} />
          <datalist id="gps-comps">{competitions.map(c => <option key={c} value={c} />)}</datalist>
          <p className={hintClass}>Escribí una nueva si no está en la lista (ej. LPF Clausura 2026).</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:col-span-2 lg:col-span-1">
          <div>
            <label className={label} htmlFor="gps-resultado">Resultado</label>
            <input id="gps-resultado" className={field} placeholder="2-1"
              value={value.resultado} onChange={e => set('resultado', e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="gps-minutos">Minutos</label>
            <input id="gps-minutos" type="number" inputMode="numeric" className={field} placeholder="90"
              value={value.minutos} onChange={e => set('minutos', e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  )
}
