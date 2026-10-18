import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import { DAY_MS, type Appearance } from '../tableroData'
import { raceFrames, RACE_METRICS, type RaceMetric } from '../tableroInsights'
import { Segmented } from './Panel'

const TOP = 10
const ROW = 40
const FRAME_MS = 260

const FRAME_DATE = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const frameLabel = (key: string) => FRAME_DATE.format(new Date(`${key}T12:00:00Z`)).replace('.', '')

/**
 * "Carrera" de la temporada: un cuadro por semana con lo acumulado por cada
 * jugador; las barras se reordenan solas a medida que alguien pasa a otro.
 * Se reproduce sola la primera vez que el panel aparece en pantalla.
 */
export default function SeasonRace({ apps, now }: { apps: Appearance[]; now: number }) {
  const navigate = useNavigate()
  const [metric, setMetric] = useState<RaceMetric>('contributions')
  const frames = useMemo(() => raceFrames(apps, metric, now - 365 * DAY_MS, now), [apps, metric, now])
  const [idx, setIdx] = useState(frames.length - 1)
  const [playing, setPlaying] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const autoplayed = useRef(false)

  useEffect(() => { setIdx(frames.length - 1); setPlaying(false) }, [frames])

  // Arranca solo la primera vez que se ve (si el usuario no prefiere menos movimiento).
  useEffect(() => {
    const el = boxRef.current
    if (!el || autoplayed.current || frames.length < 2) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const obs = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting) && !autoplayed.current) {
        autoplayed.current = true
        setIdx(0)
        setPlaying(true)
      }
    }, { threshold: 0.5 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [frames.length])

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setIdx(i => Math.min(i + 1, frames.length - 1)), FRAME_MS)
    return () => window.clearInterval(id)
  }, [playing, frames.length])

  useEffect(() => {
    if (playing && idx >= frames.length - 1) setPlaying(false)
  }, [playing, idx, frames.length])

  const frame = frames[Math.min(idx, frames.length - 1)]
  const ranking = useMemo(
    () => [...(frame?.totals ?? new Map<string, number>())].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    [frame],
  )
  const shown = ranking.slice(0, TOP)
  const max = Math.max(1, shown[0]?.[1] ?? 1)
  // Todos los que alguna vez entran al top se dibujan siempre (afuera = invisibles):
  // así al entrar o salir del top la barra se desliza en vez de aparecer de golpe.
  const everyone = useMemo(() => {
    const names = new Set<string>()
    for (const f of frames) {
      [...f.totals].sort((a, b) => b[1] - a[1]).slice(0, TOP).forEach(([n, v]) => { if (v > 0) names.add(n) })
    }
    return [...names]
  }, [frames])
  const photos = useMemo(() => new Map(AGENCY_PLAYERS.map(p => [p.fullName, p.image])), [])
  const unit = metric === 'minutes' ? "'" : ''
  const atEnd = idx >= frames.length - 1

  const toggle = () => {
    if (playing) { setPlaying(false); return }
    if (atEnd) setIdx(0)
    setPlaying(true)
  }

  return (
    <div ref={boxRef}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Segmented
          label="Dato de la carrera"
          value={metric}
          onChange={setMetric}
          options={RACE_METRICS.map(m => ({ id: m.id, label: m.label }))}
        />
        <div className="flex items-center gap-3 flex-1 min-w-[220px] sm:max-w-md">
          <button
            onClick={toggle}
            aria-label={playing ? 'Pausar' : 'Reproducir'}
            className="w-9 h-9 rounded-full bg-brand-green text-apple-gray-900 flex items-center justify-center flex-shrink-0 shadow-apple hover:scale-105 active:scale-95 transition-transform"
          >
            {playing ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : atEnd ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            ) : (
              <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5v13a1 1 0 001.5.86l11-6.5a1 1 0 000-1.72l-11-6.5A1 1 0 007 5.5z" /></svg>
            )}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            value={idx}
            onChange={e => { setPlaying(false); setIdx(Number(e.target.value)) }}
            aria-label="Semana"
            className="flex-1"
          />
        </div>
      </div>

      <div className="relative rounded-apple bg-apple-gray-50 dark:bg-apple-gray-700/20 p-3 sm:p-4 pb-12 sm:pb-16 overflow-hidden">
        {/* Fecha del cuadro, grande de fondo */}
        <div className="absolute right-4 bottom-2 text-right pointer-events-none select-none">
          <p className="text-3xl sm:text-5xl font-extrabold tracking-tight text-apple-gray-200 dark:text-apple-gray-600/50 tabular-nums">
            {frame ? frameLabel(frame.dayKey) : ''}
          </p>
        </div>

        {everyone.length === 0 ? (
          <div className="flex items-center justify-center text-sm text-apple-gray-400 dark:text-apple-gray-500" style={{ height: TOP * ROW }}>
            No hay partidos con datos en el último año.
          </div>
        ) : (
          <div className="relative" style={{ height: TOP * ROW }}>
            {everyone.map(name => {
              const rank = shown.findIndex(([n]) => n === name)
              const value = frame?.totals.get(name) ?? 0
              const visible = rank !== -1
              return (
                <button
                  key={name}
                  onClick={() => navigate(`/jugador/${encodeURIComponent(name)}?source=interno`)}
                  tabIndex={visible ? 0 : -1}
                  aria-hidden={!visible}
                  className="absolute left-0 right-0 flex items-center gap-2.5 text-left group"
                  style={{
                    height: ROW - 6,
                    transform: `translateY(${(visible ? rank : TOP) * ROW}px)`,
                    opacity: visible ? 1 : 0,
                    transition: `transform ${FRAME_MS}ms linear, opacity ${FRAME_MS}ms linear`,
                  }}
                >
                  <span className="w-5 text-2xs font-bold text-apple-gray-400 dark:text-apple-gray-500 tabular-nums text-right">{visible ? rank + 1 : ''}</span>
                  <PlayerPhoto src={photos.get(name) ?? null} name={name} size="sm" rounded="full" />
                  <span className="w-24 sm:w-40 text-xs font-semibold text-apple-gray-800 dark:text-white truncate group-hover:text-brand-green transition-colors">
                    {name}
                  </span>
                  <div className="flex-1 min-w-0 h-full py-1.5">
                    <div
                      className={`h-full rounded-r-md ${rank === 0 ? 'bg-brand-green' : 'bg-brand-green/45 group-hover:bg-brand-green/70'}`}
                      style={{ width: `${Math.max(1.5, (value / max) * 100)}%`, transition: `width ${FRAME_MS}ms linear` }}
                    />
                  </div>
                  <span className="w-14 text-right text-sm font-extrabold tabular-nums text-apple-gray-900 dark:text-white">
                    {value.toLocaleString('es-AR')}{unit}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
