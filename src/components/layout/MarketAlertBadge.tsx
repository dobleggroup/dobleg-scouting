import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchClubNeeds, fetchNegotiations, fetchTeamMembers } from '@/services/marketService'
import { computeAlerts, type AlertableItem } from '@/utils/marketAlerts'
import { NEGOTIATION_STATUS_LABEL_KEY, NEGOTIATION_STATUS_COLOR, NEED_STATUS_LABEL_KEY, NEED_STATUS_COLOR } from '@/components/market/marketLabels'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import type { ClubNeed, Negotiation } from '@/types/market'
import { fetchNotifications, markAllNotificationsRead, type AppNotification } from '@/services/notificationsService'

interface AlertEntry {
  kind: 'negotiation' | 'need'
  id: number
  urgency: 'vencido' | 'proximo'
  title: string
  subtitle: string
  dueDate: string
  statusLabelKey: string
  statusColor: string
  assignedToName: string | null
}

// Vive en el Navbar, montado en TODAS las paginas de la app — sin cache, cada
// navegacion dispararia 3 queries a Supabase solo para el numerito de la
// campanita. Cache en memoria de 60s.
let cached: { entries: AlertEntry[]; timestamp: number } | null = null
const CACHE_TTL_MS = 60_000

/**
 * Una alerta acá es "sigue vencido/próximo hoy", no un evento puntual — así
 * que "leído" no significa "descartar para siempre" (mañana, si sigue sin
 * resolverse, tiene sentido que vuelva a molestar). Se marca "vista" por
 * fecha: la clave incluye `dueDate`, así que si la fecha no cambió ya se
 * vio, pero si se pospuso (o es una alerta nueva) vuelve a contar como no
 * leída. Guardado en localStorage — es por dispositivo, no hace falta que
 * sincronice entre el celu y la compu para esto.
 */
const SEEN_STORAGE_KEY = 'mercado_alertas_vistas'

function notifTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function entryKey(e: Pick<AlertEntry, 'kind' | 'id' | 'dueDate'>): string {
  return `${e.kind}-${e.id}-${e.dueDate}`
}

function loadSeenKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveSeenKeys(keys: Set<string>) {
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...keys]))
  } catch {
    // localStorage puede fallar (modo privado, cuota) — no es crítico acá.
  }
}

function buildEntries(negotiations: Negotiation[], needs: ClubNeed[], meMemberId: number | null): AlertEntry[] {
  const items: AlertableItem[] = [
    ...needs.map(n => ({ id: n.id, kind: 'need' as const, status: n.status, assigned_to_id: n.assigned_to_id, next_followup_date: n.next_followup_date })),
    ...negotiations.map(n => ({ id: n.id, kind: 'negotiation' as const, status: n.status, assigned_to_id: n.assigned_to_id, next_followup_date: n.next_followup_date })),
  ]
  const alerts = computeAlerts(items, new Date())
  const mine = meMemberId != null ? alerts.filter(a => a.assigned_to_id === meMemberId) : alerts
  return mine.map(a => {
    if (a.kind === 'negotiation') {
      const n = negotiations.find(x => x.id === a.id)
      return {
        kind: 'negotiation' as const,
        id: a.id,
        urgency: a.urgency,
        title: n?.player_name ?? `#${a.id}`,
        subtitle: [n?.current_team_name, n?.team_name].filter(Boolean).join(' → ') || '',
        dueDate: a.next_followup_date ?? '',
        statusLabelKey: n ? NEGOTIATION_STATUS_LABEL_KEY[n.status] : '',
        statusColor: n ? NEGOTIATION_STATUS_COLOR[n.status] : '',
        assignedToName: n?.assigned_to_name ?? null,
      }
    }
    const need = needs.find(x => x.id === a.id)
    return {
      kind: 'need' as const,
      id: a.id,
      urgency: a.urgency,
      title: need?.position_label ?? `#${a.id}`,
      subtitle: need?.team_name ?? '',
      dueDate: a.next_followup_date ?? '',
      statusLabelKey: need ? NEED_STATUS_LABEL_KEY[need.status] : '',
      statusColor: need ? NEED_STATUS_COLOR[need.status] : '',
      assignedToName: need?.assigned_to_name ?? null,
    }
  })
}

export default function MarketAlertBadge() {
  const { user, userDisplayName, loading: authLoading } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [entries, setEntries] = useState<AlertEntry[]>(cached?.entries ?? [])
  const [notifs, setNotifs] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [seenKeys, setSeenKeys] = useState<Set<string>>(() => loadSeenKeys())
  const ref = useRef<HTMLDivElement>(null)

  const load = (force = false) => {
    fetchNotifications().then(setNotifs)
    if (!force && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setEntries(cached.entries)
      return
    }
    setLoading(true)
    Promise.all([fetchClubNeeds(), fetchNegotiations(), fetchTeamMembers()])
      .then(([needs, negotiations, members]) => {
        const me = members.find(m => m.user_id === user?.id)
          ?? members.find(m => m.name.toLowerCase() === (userDisplayName || '').toLowerCase())
        const result = buildEntries(negotiations, needs, me?.id ?? null)
        cached = { entries: result, timestamp: Date.now() }
        setEntries(result)
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }

  // Esperar a que termine de resolver la sesión: si se dispara con
  // `user` todavía null, `me` no matchea a nadie y `buildEntries` no filtra
  // por responsable — el numerito arranca mostrando las alertas de TODA la
  // agencia y un instante después "salta" al número correcto (propio) en
  // cuanto el login termina de cargar. Esperar acá evita ese salto.
  useEffect(() => {
    if (authLoading) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, userDisplayName])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // Abrir la campanita = "las vi". No se descartan del listado (siguen
  // vencidas/próximas hasta que se resuelvan), solo dejan de contar como
  // nuevas — ver la nota en `entryKey`. Se re-marca cada vez que `entries`
  // cambia mientras está abierta (por el reload forzado al abrir), así lo
  // recién cargado también queda visto antes de cerrar el panel.
  useEffect(() => {
    if (!open || entries.length === 0) return
    setSeenKeys(prev => {
      const next = new Set(prev)
      for (const e of entries) next.add(entryKey(e))
      saveSeenKeys(next)
      return next
    })
  }, [open, entries])

  const handleToggle = async () => {
    if (!open) {
      load(true)
      const unreadIds = notifs.filter(n => !n.read).map(n => n.id)
      if (unreadIds.length > 0) {
        await markAllNotificationsRead(unreadIds)
        setNotifs(prev => prev.map(n => ({ ...n, read: true })))
      }
    }
    setOpen(o => !o)
  }

  const handleSelect = (entry: AlertEntry) => {
    setOpen(false)
    navigate(`/mercado?highlight=${entry.kind}-${entry.id}`)
  }

  const handleSelectNotif = (n: AppNotification) => {
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  const count = entries.filter(e => !seenKeys.has(entryKey(e))).length + notifs.filter(n => !n.read).length

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleToggle}
        aria-label={t('mercado.alertas')}
        className="relative p-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-all duration-200 ease-apple group"
      >
        <svg className="w-5 h-5 text-apple-gray-600 dark:text-apple-gray-300 group-hover:text-apple-gray-800 dark:group-hover:text-white transition-colors" viewBox="0 0 24 24" fill="none">
          <path d="M6 8a6 6 0 1 1 12 0v4.2c0 .6.2 1.2.6 1.7l1 1.2c.6.8 0 1.9-1 1.9H5.4c-1 0-1.6-1.1-1-1.9l1-1.2c.4-.5.6-1.1.6-1.7V8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M9.5 20a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-2xs font-bold flex items-center justify-center">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-apple-gray-800 rounded-xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700 py-1.5 animate-scale-in origin-top-right z-50">
          {notifs.length > 0 && (
            <>
              <p className="px-3.5 py-1.5 text-2xs font-semibold text-apple-gray-400 uppercase tracking-wider">{t('notif.titulo')}</p>
              {notifs.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleSelectNotif(n)}
                  className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/60 transition-colors"
                >
                  {!n.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-green flex-shrink-0" />}
                  <div className={`min-w-0 flex-1 ${n.read ? 'ml-4' : ''}`}>
                    <p className={`text-sm ${n.read ? 'text-apple-gray-500 dark:text-apple-gray-400' : 'font-semibold text-apple-gray-900 dark:text-white'}`}>
                      {n.message}
                    </p>
                    <p className="text-2xs text-apple-gray-400 mt-0.5">{notifTimeAgo(n.created_at)}</p>
                  </div>
                </button>
              ))}
              <div className="my-1 border-t border-apple-gray-100 dark:border-apple-gray-700" />
            </>
          )}
          <p className="px-3.5 py-1.5 text-2xs font-semibold text-apple-gray-400 uppercase tracking-wider">{t('mercado.alertas')}</p>
          {loading ? (
            <p className="px-3.5 py-3 text-sm text-apple-gray-400">{t('mercado.cargando')}</p>
          ) : entries.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-apple-gray-400">{t('mercado.sinAlertas')}</p>
          ) : (
            entries.map(entry => {
              const unread = !seenKeys.has(entryKey(entry))
              return (
              <button
                key={`${entry.kind}-${entry.id}`}
                onClick={() => handleSelect(entry)}
                className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/60 transition-colors"
              >
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${entry.urgency === 'vencido' ? 'bg-red-500' : 'bg-amber-500'}`} />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-sm truncate ${unread ? 'font-semibold text-apple-gray-900 dark:text-white' : 'font-medium text-apple-gray-500 dark:text-apple-gray-400'}`}>{entry.title}</p>
                    {unread && <span className="w-1.5 h-1.5 rounded-full bg-brand-green flex-shrink-0" title={t('mercado.noLeida')} />}
                    {entry.statusLabelKey && (
                      <span className={`px-1.5 py-0.5 rounded text-2xs font-semibold flex-shrink-0 ${entry.statusColor}`}>
                        {t(entry.statusLabelKey)}
                      </span>
                    )}
                  </div>
                  {entry.subtitle && <p className="text-2xs text-apple-gray-400 truncate">{entry.subtitle}</p>}
                  <p className="text-2xs text-apple-gray-400 truncate">
                    {entry.assignedToName || t('mercado.sinAsignar')}
                    {' · '}
                    <span className={entry.urgency === 'vencido' ? 'text-red-500 font-medium' : 'text-amber-500 font-medium'}>
                      {t(entry.urgency === 'vencido' ? 'mercado.urgenciaVencido' : 'mercado.urgenciaProximo')}
                    </span>
                  </p>
                </div>
                <span className="text-2xs text-apple-gray-400 flex-shrink-0 tabular-nums">{entry.dueDate}</span>
              </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
