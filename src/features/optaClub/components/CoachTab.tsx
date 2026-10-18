import WidgetCard from '@/features/coaches/components/summary/WidgetCard'
import { ageOn, coachRecords, isCup, seasonYear, type ClubPerson, type PlayerSeason } from '../clubData'
import { Note, StatTile, fmtInt, longDate } from './bits'

const INTL_RE = /libertadores|sudamericana|recopa|mundial|club world/i

export default function CoachTab({ coach, photo, clubName }: { coach: ClubPerson; photo: string | null; clubName: string }) {
  const spells = coach.career.filter(s => s.role === 'player' && !s.national)
    .map(s => {
      const rows = s.seasons as PlayerSeason[]
      return {
        ...s,
        apps: rows.reduce((a, r) => a + r[2], 0),
        goals: rows.reduce((a, r) => a + r[4], 0),
        minutes: rows.reduce((a, r) => a + r[3], 0),
        intl: rows.filter(r => INTL_RE.test(r[1])).reduce((a, r) => a + r[2], 0),
      }
    })
    .sort((a, b) => (a.from ?? '').localeCompare(b.from ?? ''))
  const apps = spells.reduce((a, s) => a + s.apps, 0)
  const goals = spells.reduce((a, s) => a + s.goals, 0)
  const intl = spells.reduce((a, s) => a + s.intl, 0)
  const clubs = new Set(spells.map(s => s.team)).size
  const caps = coach.career.filter(s => s.role === 'player' && s.national).reduce((a, s) => a + (s.seasons as PlayerSeason[]).filter(r => !/friendl|amistos/i.test(r[1])).reduce((b, r) => b + r[2], 0), 0)
  const records = coachRecords(coach, null)

  const y0 = Math.min(...spells.map(s => Number((s.from ?? '2004').slice(0, 4))))
  const y1 = Math.max(...spells.map(s => Number((s.to ?? s.from ?? '2024').slice(0, 4)) + 1))
  const span = Math.max(1, y1 - y0)
  const pos = (iso: string | null, fallback: number) => ((iso ? Number(iso.slice(0, 4)) + (Number(iso.slice(5, 7)) - 1) / 12 : fallback) - y0) / span * 100

  // Partidos por año calendario de inicio de temporada, liga y copas por separado.
  const perYear = new Map<number, { league: number; cup: number }>()
  for (const s of spells) for (const r of s.seasons as PlayerSeason[]) {
    const y = seasonYear(r[0])
    const cur = perYear.get(y) ?? { league: 0, cup: 0 }
    if (isCup(r[1])) cur.cup += r[2]; else cur.league += r[2]
    perYear.set(y, cur)
  }
  const years = [...perYear.keys()].sort((a, b) => a - b)
  const maxYear = Math.max(1, ...[...perYear.values()].map(v => v.league + v.cup))

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-5 sm:p-6 flex flex-col sm:flex-row gap-5 sm:items-center">
        {photo && <img src={photo} alt="" className="w-24 h-24 rounded-full object-cover ring-2 ring-brand-green/40 ring-offset-2 dark:ring-offset-apple-gray-800 self-center sm:self-auto" />}
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-apple-gray-800 dark:text-white">{coach.fullName}</h2>
          <p className="text-sm text-apple-gray-600 dark:text-apple-gray-300 mt-1">
            Nació el {longDate(coach.dob)}{coach.birthPlace ? ` en ${coach.birthPlace}` : ''} ({ageOn(coach.dob)} años).
            Como jugador pasó por {clubs} clubes: {fmtInt(apps)} partidos oficiales y {goals} goles según Opta{caps ? `, y ${caps} partidos oficiales con la Selección` : ''}.
            Dirige a {clubName} desde el {longDate(coach.joined ?? null)}.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Partidos como jugador" value={fmtInt(apps)} detail="oficiales, en clubes" />
        <StatTile label="Goles" value={goals} />
        <StatTile label="Copas internacionales" value={intl} detail="partidos de Libertadores y Sudamericana" />
        <StatTile label="Clubes" value={clubs} detail={`${y0} a ${y1 - 1}`} />
      </div>

      {records.length > 0 && (
        <WidgetCard title="Como entrenador" description="Partidos dirigidos según Opta.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-2xs uppercase tracking-wide text-apple-gray-400 border-b border-apple-gray-100 dark:border-apple-gray-700">
                  {['Club', 'Torneo', 'Partidos', 'Ganados', 'Empatados', 'Perdidos', 'Efectividad'].map((h, i) => <th key={h} className={`py-2 px-2 font-semibold ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={`${r.team}${r.season}${r.competition}`} className="border-b border-apple-gray-50 dark:border-apple-gray-700/40 last:border-0">
                    <td className="py-2 px-2 font-medium text-apple-gray-800 dark:text-white">{r.team}</td>
                    <td className="py-2 px-2 text-apple-gray-500 dark:text-apple-gray-400">{r.competition} {r.season}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.played}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.won}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.drawn}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.lost}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-semibold text-brand-green">{r.efficiency}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WidgetCard>
      )}

      <WidgetCard title="Su carrera como jugador" description="Cada barra es su paso por un club, de la fecha en que llegó a la que se fue.">
        <div className="space-y-2">
          {spells.map(s => {
            const left = pos(s.from, y0), right = pos(s.to, y1)
            return (
              <div key={`${s.team}${s.from}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)_5.5rem] sm:grid-cols-[8rem_minmax(0,1fr)_7rem] gap-2 items-center">
                <span className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 truncate">{s.team}</span>
                <div className="relative h-5 rounded bg-apple-gray-50 dark:bg-apple-gray-900/40">
                  <div className="absolute inset-y-0.5 rounded-[4px] bg-brand-green/80" style={{ left: `${left}%`, width: `${Math.max(1.2, right - left)}%` }} title={`${s.from?.slice(0, 4)} a ${s.to?.slice(0, 4) ?? 'hoy'}`} />
                </div>
                <span className="text-xs tabular-nums text-apple-gray-500 dark:text-apple-gray-400 text-right whitespace-nowrap">{s.apps ? `${s.apps} PJ · ${s.goals} G` : 'sin datos'}</span>
              </div>
            )
          })}
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_5.5rem] sm:grid-cols-[8rem_minmax(0,1fr)_7rem] gap-2">
            <span />
            <div className="flex justify-between text-[10px] text-apple-gray-400 tabular-nums"><span>{y0}</span><span>{Math.round((y0 + y1) / 2)}</span><span>{y1}</span></div>
            <span />
          </div>
        </div>
      </WidgetCard>

      <WidgetCard title="Partidos por temporada" description="Verde: liga · gris: copas (nacionales e internacionales).">
        <div className="flex items-end gap-1 h-36">
          {years.map(y => {
            const v = perYear.get(y)!
            return (
              <div key={y} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-[2px]" title={`${y}: ${v.league} de liga, ${v.cup} de copa`}>
                <div className="w-full max-w-[28px] rounded-t-[4px] bg-apple-gray-300 dark:bg-apple-gray-600" style={{ height: `${(v.cup / maxYear) * 100}%` }} />
                <div className={`w-full max-w-[28px] bg-brand-green ${v.cup ? '' : 'rounded-t-[4px]'}`} style={{ height: `${(v.league / maxYear) * 100}%` }} />
                <span className="text-[10px] tabular-nums text-apple-gray-400 mt-1">{String(y).slice(2)}</span>
              </div>
            )
          })}
        </div>
      </WidgetCard>
      <Note>Datos de la carrera de {coach.fullName} en Opta. Opta no registra sus partidos en inferiores ni amistosos.</Note>
    </div>
  )
}
