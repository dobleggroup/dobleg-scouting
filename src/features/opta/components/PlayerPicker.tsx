import { useMemo, useRef, useState } from 'react'
import { normalizeName } from '@/utils/scoring'
import type { OptaLeague, OptaPlayer } from '../data'
import { POS_SHORT } from '../metrics'
import { TeamDot } from './ui'

/** Buscador de jugadores de la liga (nombre o equipo). */
export default function PlayerPicker({ league, onPick, exclude = [], placeholder = 'Buscar jugador o equipo…', autoFocus }: {
  league: OptaLeague
  onPick: (p: OptaPlayer) => void
  exclude?: string[]
  placeholder?: string
  autoFocus?: boolean
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => {
    const n = normalizeName(q).trim()
    if (n.length < 2) return []
    const words = n.split(/\s+/)
    return league.players
      .filter(p => !exclude.includes(p.id))
      .filter(p => {
        const hay = normalizeName(`${p.fullName ?? ''} ${p.name} ${league.teamById.get(p.teamId ?? '')?.name ?? ''}`)
        return words.every(w => hay.includes(w))
      })
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 8)
  }, [q, league, exclude])

  const pick = (p: OptaPlayer) => { onPick(p); setQ(''); setOpen(false); setActive(0) }

  return (
    <div className="relative w-full sm:w-80">
      <input
        ref={inputRef}
        value={q}
        autoFocus={autoFocus}
        onChange={e => { setQ(e.target.value); setOpen(true); setActive(0) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
          else if (e.key === 'Enter' && results[active]) { e.preventDefault(); pick(results[active]) }
          else if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-apple text-sm bg-apple-gray-50 dark:bg-apple-gray-700 text-apple-gray-800 dark:text-white border border-apple-gray-200 dark:border-apple-gray-600 focus:ring-2 focus:ring-brand-green focus:outline-none"
        role="combobox"
        aria-expanded={open && results.length > 0}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full max-h-80 overflow-auto rounded-apple bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 shadow-lg py-1" role="listbox">
          {results.map((p, i) => {
            const team = league.teamById.get(p.teamId ?? '')
            return (
              <li key={p.id} role="option" aria-selected={i === active}>
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(p)} onMouseEnter={() => setActive(i)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm ${i === active ? 'bg-apple-gray-100 dark:bg-apple-gray-700' : ''}`}>
                  <TeamDot team={team} />
                  <span className="flex-1 min-w-0 truncate text-apple-gray-800 dark:text-white">{p.name}</span>
                  <span className="text-2xs text-apple-gray-400 shrink-0">{POS_SHORT[p.pos]} · {team?.short ?? ''} · {p.minutes}'</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
