import { useEffect, useRef, useState } from 'react'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { normalizeName } from '@/utils/scoring'
import { POS_GROUP_LABEL, type PosGroup } from '../metrics'
import { CLASS_GROUPS, ClassBadge, type ClassOrNone } from './classes'

export const MAX_COMPARE = 5

export interface PickerPlayer {
  key: string
  name: string
  group: PosGroup | null
  cls: ClassOrNone
}

/**
 * Desplegable para elegir uno o varios jugadores (hasta 5 para comparar).
 * Agrupado por clase de la agencia, con buscador.
 */
export default function PlayerPicker({ players, selected, onChange, photo }: {
  players: PickerPlayer[]
  selected: string[]
  onChange: (keys: string[]) => void
  photo: (key: string) => string | null
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const byKey = new Map(players.map(p => [p.key, p]))
  const toggle = (k: string) => {
    if (selected.includes(k)) onChange(selected.filter(x => x !== k))
    else if (selected.length < MAX_COMPARE) onChange([...selected, k])
  }
  const shown = players.filter(p => !q || normalizeName(p.name).includes(normalizeName(q)))
  const full = selected.length >= MAX_COMPARE

  return (
    <div ref={box} className="relative flex flex-wrap items-center gap-2">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-apple text-sm font-medium bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-800 dark:text-white hover:border-apple-gray-300 dark:hover:border-apple-gray-600 transition-colors"
      >
        <svg className="w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0zm6 2a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        {selected.length === 0 ? 'Toda la agencia' : selected.length === 1 ? 'Cambiar jugador' : `Comparando ${selected.length}`}
        <svg className={`w-3.5 h-3.5 text-apple-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {selected.map(k => {
        const p = byKey.get(k)
        if (!p) return null
        return (
          <span key={k} className="inline-flex items-center gap-1.5 h-8 pl-1 pr-1.5 rounded-full text-xs font-medium bg-brand-green/10 text-apple-gray-800 dark:text-white ring-1 ring-brand-green/30">
            <PlayerPhoto src={photo(k)} name={p.name} size="xs" rounded="full" className="!w-6 !h-6" />
            {p.name}
            <button onClick={() => toggle(k)} aria-label={`Sacar a ${p.name}`} className="w-5 h-5 inline-flex items-center justify-center rounded-full text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10">×</button>
          </span>
        )
      })}
      {selected.length > 0 && (
        <button onClick={() => onChange([])} className="text-xs font-medium text-apple-gray-500 hover:text-apple-gray-800 dark:text-apple-gray-400 dark:hover:text-white">
          Volver a toda la agencia
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full mt-2 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-apple-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 shadow-apple-lg overflow-hidden animate-fade-in">
          <div className="p-2 border-b border-apple-gray-100 dark:border-apple-gray-700">
            <input
              ref={input}
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar jugador…"
              aria-label="Buscar jugador"
              className="w-full px-3 py-2 rounded-apple text-sm bg-apple-gray-50 dark:bg-apple-gray-700/60 border-0 text-apple-gray-800 dark:text-white placeholder:text-apple-gray-400 focus:ring-2 focus:ring-brand-green focus:outline-none"
            />
            <p className="px-1 pt-1.5 text-2xs text-apple-gray-400">
              {full ? `Máximo ${MAX_COMPARE} jugadores para comparar.` : 'Elegí uno para ver su detalle, o varios para compararlos.'}
            </p>
          </div>
          <div role="listbox" aria-multiselectable="true" className="max-h-80 overflow-y-auto py-1">
            {CLASS_GROUPS.map(g => {
              const list = shown.filter(p => (p.cls ?? 'none') === g.id)
              if (!list.length) return null
              return (
                <div key={g.id}>
                  <p className="px-3 pt-2 pb-1 text-2xs font-semibold uppercase tracking-wide text-apple-gray-400">{g.label} · {list.length}</p>
                  {list.map(p => {
                    const on = selected.includes(p.key)
                    const disabled = !on && full
                    return (
                      <button
                        key={p.key}
                        role="option"
                        aria-selected={on}
                        disabled={disabled}
                        onClick={() => toggle(p.key)}
                        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${on ? 'bg-brand-green/10' : 'hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${on ? 'bg-brand-green border-brand-green text-white' : 'border-apple-gray-300 dark:border-apple-gray-600'}`}>
                          {on && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </span>
                        <PlayerPhoto src={photo(p.key)} name={p.name} size="sm" rounded="full" className="!w-7 !h-7" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-apple-gray-800 dark:text-white truncate">{p.name}</span>
                          <span className="block text-2xs text-apple-gray-400">{p.group ? POS_GROUP_LABEL[p.group].one[0].toUpperCase() + POS_GROUP_LABEL[p.group].one.slice(1) : 'Sin posición'}</span>
                        </span>
                        <ClassBadge c={p.cls} size="xs" />
                      </button>
                    )
                  })}
                </div>
              )
            })}
            {!shown.length && <p className="px-3 py-4 text-sm text-apple-gray-400">No hay jugadores con ese nombre.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
