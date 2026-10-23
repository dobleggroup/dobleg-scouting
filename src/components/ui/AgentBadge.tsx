// Representación del jugador: es el dato más importante para la agencia, así
// que se muestra siempre y distingue "no tiene" de "no sabemos".
// Los valores vienen de Transfermarkt ('no agent', 'Relatives', o el nombre).
import { useLanguage } from '@/context/LanguageContext'

export type AgentKind = 'ours' | 'agent' | 'none' | 'family' | 'unknown'

const OUR_AGENCY = 'Doble G Sports Group'

export function agentKind(agent: string | null | undefined): AgentKind {
  const a = agent?.trim().toLowerCase() ?? ''
  if (!a) return 'unknown'
  if (a === 'no agent' || a === 'without agent' || a === 'sin representante') return 'none'
  if (a === 'relatives' || a === 'family' || a === 'familiar') return 'family'
  if (a === OUR_AGENCY.toLowerCase()) return 'ours'
  return 'agent'
}

export function AgentBadge({ agent, className = '' }: { agent: string | null | undefined; className?: string }) {
  const { t } = useLanguage()
  const kind = agentKind(agent)
  const pill = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap'
  switch (kind) {
    case 'none':
      return (
        <span className={`${pill} bg-brand-green/10 text-brand-green ring-1 ring-brand-green/30 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-brand-green" />
          {t('agente.sinRepresentante')}
        </span>
      )
    case 'family':
      return <span className={`${pill} bg-amber-500/10 text-amber-600 dark:text-amber-400 ${className}`}>{t('agente.familiar')}</span>
    case 'ours':
      return <span className={`${pill} bg-blue-500/10 text-blue-600 dark:text-blue-400 ${className}`}>Doble G</span>
    case 'unknown':
      return <span className={`text-xs text-apple-gray-400 ${className}`}>{t('agente.sinDato')}</span>
    default:
      return (
        <span className={`text-sm text-apple-gray-700 dark:text-apple-gray-200 truncate ${className}`} title={agent ?? ''}>
          {agent}
        </span>
      )
  }
}
