import { TeamLogo } from '@/components/ui/PlayerPhoto'
import { useLanguage } from '@/context/LanguageContext'

function ClubShield({ logo, name, freeLabel, size }: { logo: string | null; name: string | null; freeLabel: string; size: string }) {
  if (name) {
    const initials = (
      <div className={`${size} rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center text-2xs font-bold text-apple-gray-500 dark:text-apple-gray-400 flex-shrink-0`}>
        {name.slice(0, 2).toUpperCase()}
      </div>
    )
    // Si el escudo externo no carga, las iniciales en vez de un hueco vacío.
    return logo ? <TeamLogo key={logo} src={logo} className={`${size} drop-shadow-md`} fallback={initials} /> : initials
  }
  return (
    <div
      title={freeLabel}
      className={`${size} rounded-full border-2 border-dashed border-apple-gray-300 dark:border-apple-gray-600 flex items-center justify-center flex-shrink-0`}
    >
      <svg className="w-1/2 h-1/2 text-apple-gray-400 dark:text-apple-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8L5 21" />
      </svg>
    </div>
  )
}

/**
 * Escudo del club actual → flecha → escudo del club destino. Cualquiera de
 * los dos puede faltar (jugador libre / objetivo es dejarlo libre) — en ese
 * caso se muestra un placeholder circular en vez del escudo.
 */
export default function ClubTransferBadge({
  currentLogo,
  currentName,
  targetLogo,
  targetName,
  size = 'w-8 h-8',
}: {
  currentLogo: string | null
  currentName: string | null
  targetLogo: string | null
  targetName: string | null
  size?: string
}) {
  const { t } = useLanguage()
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <ClubShield logo={currentLogo} name={currentName} freeLabel={t('mercado.jugadorLibre')} size={size} />
      <svg className="w-4 h-4 text-apple-gray-400 dark:text-apple-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
      </svg>
      <ClubShield logo={targetLogo} name={targetName} freeLabel={t('mercado.quedaLibre')} size={size} />
    </div>
  )
}
