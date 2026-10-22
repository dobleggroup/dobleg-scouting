import { useEffect, useRef, useState } from 'react'
import { searchMarketTeams } from '@/services/marketService'
import { TeamLogo } from '@/components/ui/PlayerPhoto'
import { useLanguage } from '@/context/LanguageContext'
import type { MarketTeamSearchResult } from '@/types/market'

/**
 * Con `onCustom`, si el club no aparece en la lista se puede usar lo escrito
 * tal cual ("Usar «X»") — la lista sale de los clubes que sincronizamos, y a
 * veces el que se necesita no está.
 */
export default function TeamSearchSelect({
  value,
  onChange,
  onCustom,
}: {
  value: { name: string; logo: string | null } | null
  onChange: (team: MarketTeamSearchResult) => void
  onCustom?: (name: string) => void
}) {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MarketTeamSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    let active = true
    searchMarketTeams(query).then(r => { if (active) setResults(r) }).catch(() => { if (active) setResults([]) })
    return () => { active = false }
  }, [query])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        {value && !open ? (
          <button
            type="button"
            onClick={() => { setOpen(true); setQuery('') }}
            className="input-apple text-sm w-full flex items-center gap-2 text-left"
          >
            <TeamLogo src={value.logo} className="w-5 h-5 drop-shadow-md" />
            <span className="truncate">{value.name}</span>
          </button>
        ) : (
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={t('mercado.buscarClub')}
            className="input-apple text-sm w-full"
          />
        )}
      </div>
      {open && (results.length > 0 || (onCustom && query.trim().length >= 2)) && (
        <div className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 shadow-lg">
          {results.map(team => (
            <button
              key={team.id}
              type="button"
              onClick={() => { onChange(team); setOpen(false); setQuery('') }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 transition-colors"
            >
              <TeamLogo src={team.logo} className="w-6 h-6 drop-shadow-md" />
              <span className="text-sm text-apple-gray-800 dark:text-white truncate">{team.name}</span>
            </button>
          ))}
          {onCustom && query.trim().length >= 2 && !results.some(r => r.name.toLowerCase() === query.trim().toLowerCase()) && (
            <button
              type="button"
              onClick={() => { onCustom(query.trim()); setOpen(false); setQuery('') }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left border-t border-apple-gray-100 dark:border-apple-gray-700 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 transition-colors"
            >
              <span className="w-6 h-6 rounded-full border border-dashed border-apple-gray-300 dark:border-apple-gray-600 flex items-center justify-center text-apple-gray-400 text-sm flex-shrink-0">+</span>
              <span className="min-w-0">
                <span className="block text-sm text-apple-gray-800 dark:text-white truncate">{t('mercado.usarClubEscrito').replace('{name}', query.trim())}</span>
                <span className="block text-2xs text-apple-gray-400">{t('mercado.clubNoListado')}</span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
