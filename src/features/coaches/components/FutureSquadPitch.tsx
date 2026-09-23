import { useState } from 'react'
import { FORMATIONS, FORMATION_SHORT_LABEL_OVERRIDES } from '@/constants/formations'
import type { FutureSquadSlot } from '@/services/futureSquadService'
import type { CandidateVisuals } from '@/services/coachService'
import type { SquadPlayer } from '@/services/footballApiService'
import { useLanguage } from '@/context/LanguageContext'

/** Opciones 2 a 6 debajo del titular: cada una un poco más chica y tenue que la anterior. */
const ALTERNATE_TEXT = ['text-[11px]', 'text-[10px]', 'text-[9.5px]', 'text-[9px]', 'text-[8.5px]']

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function FutureSquadPitch({
  formationType,
  slots,
  squad,
  ownTeamCrest,
  candidateVisuals,
  onSlotClick,
  onRemoveSlot,
  onDropSquadPlayer,
}: {
  formationType: string
  slots: FutureSquadSlot[]
  squad: SquadPlayer[]
  ownTeamCrest: string | null
  candidateVisuals: Record<number, CandidateVisuals>
  onSlotClick: (slotKey: string) => void
  onRemoveSlot: (slotKey: string) => void
  onDropSquadPlayer: (slotKey: string, playerId: number) => void
}) {
  const { t } = useLanguage()
  const currentFormation = FORMATIONS[formationType] ?? FORMATIONS['4-3-3']
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)

  return (
    <div className="bg-gradient-to-b from-emerald-600 to-emerald-700 rounded-2xl p-4 sm:p-6 relative aspect-[2/3] w-full shadow-2xl overflow-hidden">
      {/* Lineas de campo -- mismo dibujo que /formacion y la pizarra tactica */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 130" preserveAspectRatio="none">
        <rect x="2" y="2" width="96" height="126" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
        <circle cx="50" cy="65" r="12" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
        <circle cx="50" cy="65" r="1" fill="rgba(255,255,255,0.5)" />
        <line x1="2" y1="65" x2="98" y2="65" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
        <rect x="20" y="2" width="60" height="20" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
        <rect x="30" y="2" width="40" height="8" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
        <rect x="20" y="108" width="60" height="20" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
        <rect x="30" y="120" width="40" height="8" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
        <path d="M 2 6 Q 2 2 6 2" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
        <path d="M 94 2 Q 98 2 98 6" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
        <path d="M 2 124 Q 2 128 6 128" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
        <path d="M 94 128 Q 98 128 98 124" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
      </svg>

      {currentFormation.positions.map(pos => {
        const slot = slots.find(s => s.slotKey === pos.key)
        const occupied = !!slot && slot.source !== null
        const isCandidate = slot?.source === 'candidate'
        const isDragOver = dragOverSlot === pos.key

        const squadPlayer = !isCandidate && occupied ? squad.find(p => p.id === slot!.playerId) : undefined
        const candidateVisual = isCandidate && occupied ? candidateVisuals[Number(slot!.playerId)] : undefined
        const photo = squadPlayer?.photo ?? candidateVisual?.photo ?? null
        const crest = isCandidate ? candidateVisual?.teamLogo ?? null : ownTeamCrest

        const label = occupied
          ? isCandidate
            ? slot!.playerName!.split(' ').slice(-1)[0]
            : String(slot!.playerNumber ?? slot!.playerName!.split(' ').slice(-1)[0])
          : FORMATION_SHORT_LABEL_OVERRIDES[formationType]?.[pos.key] ?? pos.key

        return (
          <div
            key={pos.key}
            className="absolute -translate-x-1/2 -translate-y-6 sm:-translate-y-8 flex flex-col items-center"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            onDragOver={e => {
              e.preventDefault()
              setDragOverSlot(pos.key)
            }}
            onDragLeave={() => setDragOverSlot(prev => (prev === pos.key ? null : prev))}
            onDrop={e => {
              e.preventDefault()
              setDragOverSlot(null)
              const raw = e.dataTransfer.getData('text/plain')
              const playerId = raw ? Number(raw) : NaN
              if (!Number.isNaN(playerId)) onDropSquadPlayer(pos.key, playerId)
            }}
          >
            {/* Avatar: circulo de foto + badges, todos anclados a ESTE tamano fijo (no al
                div padre, que tambien contiene el nombre debajo -- eso hacia que los badges
                "bottom" quedaran calculados contra el borde inferior del nombre y lo taparan). */}
            <div className="relative w-12 h-12 sm:w-16 sm:h-16">
              <button
                type="button"
                onClick={() => onSlotClick(pos.key)}
                className={`w-full h-full rounded-full flex items-center justify-center shadow-xl transition-all overflow-hidden ${
                  occupied
                    ? 'bg-apple-gray-100'
                    : `bg-white/15 border-2 border-dashed text-white/80 hover:bg-white/25 hover:border-white/70 ${
                        isDragOver ? 'border-brand-green bg-white/30 scale-110' : 'border-white/50'
                      }`
                } ${occupied && isDragOver ? 'ring-4 ring-brand-green' : ''} ${isCandidate ? 'ring-2 ring-sky-400' : ''}`}
              >
                {occupied ? (
                  photo ? (
                    <img src={photo} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-apple-gray-500">{initialsOf(slot!.playerName!)}</span>
                  )
                ) : (
                  <span className="text-sm font-semibold">{label}</span>
                )}
              </button>

              {/* Dorsal: solo jugadores de plantel, con numero real. */}
              {occupied && !isCandidate && slot!.playerNumber != null && (
                <span className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-apple-gray-900 text-white text-2xs font-bold flex items-center justify-center shadow-md ring-2 ring-white/80">
                  {slot!.playerNumber}
                </span>
              )}

              {/* Escudo del club -- PNG con fondo transparente, con sombra propia para que se
                  despegue de la foto de perfil detras. */}
              {occupied && crest && (
                <img
                  src={crest}
                  alt=""
                  className="absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
                />
              )}

              {occupied && (
                <button
                  type="button"
                  onClick={() => onRemoveSlot(pos.key)}
                  aria-label={isCandidate ? t('futureSquadPitch.quitar') : t('futureSquadPitch.darDeBaja')}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {occupied && (
              <p className="mt-1 flex items-center justify-center gap-1 whitespace-nowrap text-xs font-semibold text-white drop-shadow">
                {slot!.playerName!.split(' ').slice(-1)[0]}
                {isCandidate && slot!.rating !== null && (
                  <span className="px-1 rounded bg-sky-500/90 text-white text-[10px] font-bold tabular-nums">{slot!.rating!.toFixed(1)}</span>
                )}
              </p>
            )}
            {occupied && (slot!.alternates?.length ?? 0) > 0 && (
              <div className="mt-0.5 px-1.5 py-0.5 rounded-md bg-black/25 flex flex-col items-center">
                {slot!.alternates!.map((alt, i) => (
                  <p
                    key={`${alt.source}-${alt.playerId}`}
                    className={`${ALTERNATE_TEXT[i] ?? ALTERNATE_TEXT[ALTERNATE_TEXT.length - 1]} leading-tight whitespace-nowrap font-medium ${alt.source === 'candidate' ? 'text-sky-200' : 'text-white'}`}
                    style={{ opacity: 0.92 - i * 0.12 }}
                  >
                    {alt.playerName.split(' ').slice(-1)[0]}
                  </p>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
