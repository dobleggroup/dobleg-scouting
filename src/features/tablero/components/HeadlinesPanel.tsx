import { useNavigate } from 'react-router-dom'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import type { Headline, HeadlineKind } from '../tableroHeadlines'
import { fmtDate } from './Panel'

const ICON: Record<HeadlineKind, { path: string; tone: string }> = {
  goals: {
    path: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-13l3 2.2-1.1 3.6h-3.8L9 10.2 12 8z',
    tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  streak: {
    path: 'M13 10V3L4 14h7v7l9-11h-7z',
    tone: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  best: {
    path: 'M11.05 2.93c.3-.92 1.6-.92 1.9 0l1.52 4.67a1 1 0 00.95.69h4.91c.97 0 1.37 1.24.59 1.81l-3.98 2.89a1 1 0 00-.36 1.12l1.52 4.67c.3.92-.75 1.69-1.54 1.12l-3.97-2.89a1 1 0 00-1.18 0l-3.97 2.89c-.79.57-1.84-.2-1.54-1.12l1.52-4.67a1 1 0 00-.36-1.12L2.83 10.1c-.78-.57-.38-1.81.59-1.81h4.91a1 1 0 00.95-.69l1.52-4.67z',
    tone: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  },
  return: {
    path: 'M4 4v5h.58m15.36 2A8 8 0 004.58 9m0 0H9m11 11v-5h-.58m0 0a8 8 0 01-15.36-2m15.36 2H15',
    tone: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  },
  benched: {
    path: 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
    tone: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  },
}

function contribution(goals: number, assists: number): string {
  const parts: string[] = []
  if (goals) parts.push(goals === 1 ? '1 gol' : `${goals} goles`)
  if (assists) parts.push(assists === 1 ? '1 asistencia' : `${assists} asistencias`)
  return parts.join(' y ')
}

function sentence(h: Headline, rival: (id: number | null) => string): string {
  const a = h.app
  const vs = a ? `${a.isHome ? 'vs.' : 'en cancha de'} ${rival(a.rivalId)}` : ''
  const result = a && a.goalsFor != null && a.goalsAgainst != null ? ` (${a.goalsFor}-${a.goalsAgainst})` : ''
  switch (h.kind) {
    case 'goals':
      return `${contribution(a!.goals, a!.assists)} ${vs}${result}${a!.rating != null ? `, con rating ${a!.rating.toFixed(1)}` : ''}.`
    case 'best':
      return `La mejor actuación de la semana: rating ${h.value.toFixed(1)} ${vs}${result}.`
    case 'streak':
      return `Lleva ${h.value} partidos seguidos con gol o asistencia.`
    case 'return':
      return `Volvió a jugar después de ${h.value} días: ${a!.minutes}' ${vs}.`
    case 'benched':
      return 'Esta semana no jugó, y venía de titular en sus últimos 3 partidos.'
  }
}

export default function HeadlinesPanel({ headlines, rival }: { headlines: Headline[]; rival: (id: number | null) => string }) {
  const navigate = useNavigate()
  if (headlines.length === 0) {
    return (
      <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-6">
        Semana tranquila: ninguno de nuestros jugadores tuvo una novedad marcada.
      </p>
    )
  }
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {headlines.map((h, i) => {
        const photo = AGENCY_PLAYERS.find(p => p.fullName === h.fullName)?.image ?? null
        return (
          <button
            key={`${h.kind}-${h.fullName}-${i}`}
            onClick={() => navigate(`/jugador/${encodeURIComponent(h.fullName)}?source=interno`)}
            className="min-w-0 flex items-start gap-3 p-3.5 rounded-apple bg-apple-gray-50 dark:bg-apple-gray-700/30 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700/50 transition-colors text-left animate-slide-up"
            style={{ animationDelay: `${i * 70}ms`, animationFillMode: 'backwards' }}
          >
            <div className="relative flex-shrink-0">
              <PlayerPhoto src={photo} name={h.fullName} size="md" rounded="full" />
              <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-apple-gray-50 dark:ring-apple-gray-800 ${ICON[h.kind].tone}`}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON[h.kind].path} />
                </svg>
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-apple-gray-900 dark:text-white truncate">{h.fullName}</p>
              <p className="text-xs text-apple-gray-600 dark:text-apple-gray-300 leading-snug mt-0.5">{sentence(h, rival)}</p>
              {h.app && <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 mt-1">{fmtDate(h.app.date)}</p>}
            </div>
          </button>
        )
      })}
    </div>
  )
}
