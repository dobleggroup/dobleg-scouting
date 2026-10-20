import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAgencyPlayers, agencyKey } from '@/services/agencyPlayersService'
import { fetchUploads, isUploadWindow, uploadedThisMonth } from '@/services/wyscoutPerfService'
import { useMatchMinutes, useWyscoutMonthly } from '../useWyscoutMonthly'
import { diagnoseAll, isConcern, isHot, positionBoard, type Diagnosis } from '../diagnosis'
import { MomentList, PositionBoard } from './DiagnosisViews'
import { ClassBadge, classRank, useClassOf } from './classes'
import MonthlyUpdateNote from './MonthlyUpdateNote'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function Card({ title, to, children }: { title: string; to?: string; children: ReactNode }) {
  return (
    <section className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-apple-gray-800 dark:text-white">{title}</h2>
        {to && <Link to={to} className="text-xs font-medium text-brand-green hover:text-emerald-600 transition-colors flex-shrink-0">Ver todo →</Link>}
      </div>
      {children}
    </section>
  )
}

/** Aviso de principio de mes: faltan cargar los Excel de Wyscout. */
function UploadReminder() {
  const [missing, setMissing] = useState<number | null>(null)
  const total = useMemo(() => getAgencyPlayers().length, [])
  useEffect(() => {
    if (!isUploadWindow()) return
    fetchUploads().then(u => {
      const done = uploadedThisMonth(u)
      setMissing(getAgencyPlayers().filter(p => !done.has(agencyKey(p.fullName))).length)
    }).catch(() => {})
  }, [])
  if (!missing) return null
  return (
    <Link to="/carga-wyscout" className="flex items-center gap-3 px-4 py-3 rounded-apple-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 hover:brightness-95 transition">
      <span className="text-lg leading-none">⏰</span>
      <span className="flex-1 text-sm text-amber-800 dark:text-amber-200">
        <span className="font-semibold">Faltan cargar los datos de Wyscout de {MONTHS[new Date().getMonth()]}</span> de {missing} de {total} jugadores.
      </span>
      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Cargar →</span>
    </Link>
  )
}

/** Sección "Datos internos Wyscout" del Inicio: cómo está cada jugador y lo bueno y lo malo de cada posición. */
export default function HomeRendimientoSection() {
  const { rows, byPlayer, photo, name } = useWyscoutMonthly()
  const navigate = useNavigate()

  const matchMinutes = useMatchMinutes()
  const classOf = useClassOf()
  const diags = useMemo(() => [...diagnoseAll(byPlayer, matchMinutes).values()], [byPlayer, matchMinutes])
  const open = (k: string) => navigate(`/jugador/${encodeURIComponent(name(k))}?source=interno`)
  const moments = useMemo(() => {
    const rank = (k: string) => classRank(classOf(name(k)))
    const item = (d: Diagnosis) => ({ d, name: name(d.key), lead: <ClassBadge c={classOf(name(d.key))} size="xs" /> })
    return {
      hot: diags.filter(isHot).sort((a, b) => rank(a.key) - rank(b.key) || b.score - a.score).map(item),
      concern: diags.filter(isConcern).sort((a, b) => rank(a.key) - rank(b.key) || a.score - b.score).map(item),
      board: positionBoard(diags, k => (3 - rank(k)) * 0.08),
    }
  }, [diags, name, classOf])
  if (rows === null) return <div className="h-40 rounded-apple-lg bg-apple-gray-100 dark:bg-apple-gray-800 animate-pulse" />

  if (rows.length === 0) {
    return (
      <>
        <UploadReminder />
        <Card title="Rendimiento individual">
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
            Todavía no hay datos de Wyscout. Se cargan en <Link to="/carga-wyscout" className="text-brand-green hover:underline">Carga de Wyscout</Link>.
          </p>
        </Card>
      </>
    )
  }

  return (
    <>
      <UploadReminder />
      <MonthlyUpdateNote />

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title={`En su mejor momento · ${moments.hot.length}`} to="/rendimiento-individual">
          <MomentList items={moments.hot.slice(0, 5)} photo={photo} onOpen={open} empty="Nadie se destaca por ahora." />
        </Card>
        <Card title={`Preocupan · ${moments.concern.length}`} to="/rendimiento-individual">
          <MomentList items={moments.concern.slice(0, 5)} photo={photo} onOpen={open} empty="Nadie preocupante por ahora." />
        </Card>
      </div>

      <Card title="Por posición: lo bueno y lo malo" to="/rendimiento-individual">
        <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 -mt-2 mb-4">Solo las métricas que importan en cada puesto. Comparado con los de su posición en la agencia (último año) y con él mismo (últimos 6 meses contra el año anterior).</p>
        <PositionBoard rows={moments.board} name={name} photo={photo} onOpen={open} />
      </Card>
    </>
  )
}
