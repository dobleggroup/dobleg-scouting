import { useEffect, useMemo, useState } from 'react'
import MobileSheet from '@/components/ui/MobileSheet'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import TeamSearchSelect from '@/components/market/TeamSearchSelect'
import { useAuth } from '@/context/AuthContext'
import { fuzzyMatch } from '@/lib/search'
import {
  CONTACT_ROLE_LABEL,
  deleteContact,
  fetchContacts,
  saveContact,
  type ContactInput,
  type ContactRole,
  type MarketContact,
} from '@/services/marketNotesService'
import type { MarketTeamChoice } from '@/types/market'

// Agenda de contactos de clubes (directores deportivos, mánagers, presidentes...):
// cuando hay que hablar con un club, acá se ve con quién.

const ROLES = Object.keys(CONTACT_ROLE_LABEL) as ContactRole[]

const EMPTY: ContactInput = {
  full_name: '', role: 'director_deportivo', team_id: null, team_name: null, country: null,
  phone: null, email: null, notes: null, last_contact_date: null,
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function whatsappUrl(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ContactForm({ contact, open, onClose, onSaved, countries }: {
  contact: MarketContact | null
  open: boolean
  onClose: () => void
  onSaved: (c: MarketContact) => void
  countries: string[]
}) {
  const { userDisplayName } = useAuth()
  const [form, setForm] = useState<ContactInput>(EMPTY)
  const [team, setTeam] = useState<MarketTeamChoice | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setSaving(false)
    if (contact) {
      const { id: _id, created_by: _cb, created_by_name: _cbn, created_at: _ca, updated_at: _ua, ...rest } = contact
      setForm(rest)
      setTeam(contact.team_name ? { id: contact.team_id, name: contact.team_name, logo: null } : null)
    } else {
      setForm(EMPTY)
      setTeam(null)
    }
  }, [open, contact])

  const set = <K extends keyof ContactInput>(key: K, value: ContactInput[K]) => setForm(f => ({ ...f, [key]: value }))

  const handleSave = async () => {
    if (!form.full_name.trim() || saving) return
    setSaving(true)
    setError('')
    const saved = await saveContact({ ...form, team_id: team?.id ?? null, team_name: team?.name ?? null }, contact?.id ?? null, userDisplayName || 'Usuario')
    setSaving(false)
    if (!saved) { setError('No se pudo guardar. Probá de nuevo.'); return }
    onSaved(saved)
    onClose()
  }

  const label = 'block text-xs font-medium text-apple-gray-500 mb-1.5'
  return (
    <MobileSheet open={open} onClose={onClose} title={contact ? 'Editar contacto' : 'Nuevo contacto'}>
      <div className="space-y-4 p-4">
        <div>
          <label className={label}>Nombre y apellido *</label>
          <input value={form.full_name} onChange={e => set('full_name', e.target.value)} className="input-apple text-sm w-full" autoFocus />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>Cargo</label>
            <select value={form.role} onChange={e => set('role', e.target.value as ContactRole)} className="input-apple text-sm w-full">
              {ROLES.map(r => <option key={r} value={r}>{CONTACT_ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>País</label>
            <input value={form.country ?? ''} onChange={e => set('country', e.target.value)} list="contact-countries" className="input-apple text-sm w-full" />
            <datalist id="contact-countries">{countries.map(c => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        <div>
          <label className={label}>Club</label>
          <TeamSearchSelect value={team} onChange={setTeam} onCustom={name => setTeam({ id: null, name, logo: null })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>Teléfono / WhatsApp</label>
            <input type="tel" value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} placeholder="+54 9 11 ..." className="input-apple text-sm w-full" />
          </div>
          <div>
            <label className={label}>Email</label>
            <input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} className="input-apple text-sm w-full" />
          </div>
        </div>
        <div>
          <label className={label}>Último contacto</label>
          <input type="date" value={form.last_contact_date ?? ''} onChange={e => set('last_contact_date', e.target.value || null)} min="2000-01-01" max="2100-12-31" className="input-apple text-sm w-full" />
        </div>
        <div>
          <label className={label}>Notas</label>
          <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Cómo llegamos, de qué hablamos, quién lo conoce..." className="input-apple text-sm w-full resize-y" />
        </div>
        {error && <p className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
        <button
          onClick={handleSave}
          disabled={!form.full_name.trim() || saving}
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {saving ? 'Guardando...' : 'Guardar contacto'}
        </button>
      </div>
    </MobileSheet>
  )
}

function ContactLinks({ c }: { c: MarketContact }) {
  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      {c.phone && (
        <>
          <a href={whatsappUrl(c.phone)} target="_blank" rel="noopener noreferrer" title={`WhatsApp ${c.phone}`}
            className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-500/10 transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.2-.4.7-1.3a.4.4 0 000-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.8 11.9 11.9 0 004.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 001.8-1.3 2.3 2.3 0 00.2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>
          </a>
          <a href={`tel:${c.phone}`} title={`Llamar ${c.phone}`} className="p-1.5 rounded-lg text-sky-500 hover:bg-sky-500/10 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
          </a>
        </>
      )}
      {c.email && (
        <a href={`mailto:${c.email}`} title={c.email} className="p-1.5 rounded-lg text-apple-gray-500 hover:text-brand-green hover:bg-brand-green/10 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
        </a>
      )}
    </div>
  )
}

export default function MarketContactsPage() {
  const [contacts, setContacts] = useState<MarketContact[] | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<ContactRole | ''>('')
  const [countryFilter, setCountryFilter] = useState('')
  const [editing, setEditing] = useState<MarketContact | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => { fetchContacts().then(setContacts) }, [])

  const countries = useMemo(
    () => [...new Set((contacts ?? []).map(c => c.country).filter((c): c is string => !!c))].sort(),
    [contacts],
  )

  const filtered = useMemo(() => (contacts ?? []).filter(c => {
    if (roleFilter && c.role !== roleFilter) return false
    if (countryFilter && c.country !== countryFilter) return false
    if (search.trim()) {
      const hay = [c.full_name, c.team_name, c.country, c.notes].filter(Boolean).join(' ')
      if (!fuzzyMatch(search, hay)) return false
    }
    return true
  }), [contacts, search, roleFilter, countryFilter])

  const openNew = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (c: MarketContact) => { setEditing(c); setFormOpen(true) }
  const handleSaved = (c: MarketContact) => setContacts(prev => {
    const list = prev ?? []
    return list.some(x => x.id === c.id) ? list.map(x => x.id === c.id ? c : x) : [c, ...list]
  })
  const handleDelete = async (c: MarketContact) => {
    if (!confirm(`¿Borrar a ${c.full_name} de los contactos?`)) return
    if (await deleteContact(c.id)) setContacts(prev => (prev ?? []).filter(x => x.id !== c.id))
  }

  const hasFilters = !!(search || roleFilter || countryFilter)
  const pill = (active: boolean) => `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
    active
      ? 'bg-apple-gray-800 dark:bg-white text-white dark:text-apple-gray-900 border-apple-gray-800 dark:border-white'
      : 'bg-white dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 border-apple-gray-200 dark:border-apple-gray-700 hover:border-apple-gray-300 dark:hover:border-apple-gray-600'
  }`
  const roleCounts = useMemo(() => {
    const counts: Partial<Record<ContactRole, number>> = {}
    for (const c of contacts ?? []) counts[c.role] = (counts[c.role] ?? 0) + 1
    return counts
  }, [contacts])

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-green to-emerald-600 flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            </div>
            <h1 className="text-2xl font-bold text-apple-gray-900 dark:text-white tracking-tight">Contactos</h1>
          </div>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
            Directores deportivos, mánagers y gente de cada club · {filtered.length} de {contacts?.length ?? 0}
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-green text-white rounded-xl font-semibold text-sm hover:bg-emerald-600 active:scale-95 transition-all shadow-sm shadow-brand-green/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
          Agregar contacto
        </button>
      </div>

      {/* Cargo, como los estados de Seguimiento */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setRoleFilter('')} className={pill(roleFilter === '')}>
          Todos <span className="font-bold opacity-60 tabular-nums">{contacts?.length ?? 0}</span>
        </button>
        {ROLES.filter(r => roleCounts[r]).map(r => (
          <button key={r} onClick={() => setRoleFilter(roleFilter === r ? '' : r)} className={pill(roleFilter === r)}>
            {CONTACT_ROLE_LABEL[r]} <span className="font-bold opacity-60 tabular-nums">{roleCounts[r]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 sm:max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, club, país..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 transition-all"
          />
        </div>
        <div className="flex gap-3">
          <select
            value={countryFilter}
            onChange={e => setCountryFilter(e.target.value)}
            className="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-xl bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm text-apple-gray-700 dark:text-apple-gray-200 focus:outline-none focus:border-brand-green"
          >
            <option value="">Todos los países</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {hasFilters && (
            <button onClick={() => { setSearch(''); setRoleFilter(''); setCountryFilter('') }} className="px-3 py-2.5 rounded-xl text-sm text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300 transition-colors">
              Limpiar
            </button>
          )}
        </div>
      </div>

      {contacts === null ? (
        <LoadingSpinner message="Cargando contactos..." />
      ) : filtered.length === 0 ? (
        contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-brand-green/10 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            </div>
            <h3 className="text-base font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-1">Todavía no hay contactos</h3>
            <p className="text-sm text-apple-gray-500 mb-4 max-w-sm">Cargá a los directores deportivos y la gente de cada club. Cuando haya que hablar con un club, acá se ve con quién.</p>
            <button onClick={openNew} className="px-4 py-2.5 bg-brand-green text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-all">Agregar el primero</button>
          </div>
        ) : (
          <EmptyState title="Sin resultados" description="Probá con otros filtros." icon="filter" />
        )
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden lg:block card-apple overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-apple-gray-200 dark:border-apple-gray-700">
                  {['Contacto', 'Club', 'País', 'Último contacto', 'Notas', ''].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
                {filtered.map(c => (
                  <tr key={c.id} onClick={() => openEdit(c)} className="group hover:bg-brand-green/5 dark:hover:bg-brand-green/10 transition-colors cursor-pointer align-top">
                    <td className="px-3 py-3">
                      <div className="flex items-start gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center flex-shrink-0 text-xs font-bold text-apple-gray-500 dark:text-apple-gray-300">{initials(c.full_name)}</div>
                        <div className="min-w-0">
                          <p className="font-semibold text-apple-gray-900 dark:text-white group-hover:text-brand-green transition-colors">{c.full_name}</p>
                          <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">{CONTACT_ROLE_LABEL[c.role]}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-apple-gray-700 dark:text-apple-gray-300">{c.team_name || '—'}</td>
                    <td className="px-3 py-3 text-apple-gray-600 dark:text-apple-gray-400">{c.country || '—'}</td>
                    <td className="px-3 py-3 text-xs text-apple-gray-600 dark:text-apple-gray-400 whitespace-nowrap">{formatDate(c.last_contact_date)}</td>
                    <td className="px-3 py-3"><p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 line-clamp-2 max-w-[260px]">{c.notes || '—'}</p></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ContactLinks c={c} />
                        <button onClick={e => { e.stopPropagation(); handleDelete(c) }} title="Borrar" className="p-1.5 rounded-lg text-apple-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet */}
          <div className="lg:hidden space-y-2.5">
            {filtered.map(c => (
              <div key={c.id} onClick={() => openEdit(c)} className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-3 cursor-pointer active:scale-[0.99] transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center flex-shrink-0 text-xs font-bold text-apple-gray-500 dark:text-apple-gray-300">{initials(c.full_name)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-apple-gray-900 dark:text-white truncate">{c.full_name}</p>
                    <p className="text-xs text-apple-gray-500 truncate">{[CONTACT_ROLE_LABEL[c.role], c.team_name, c.country].filter(Boolean).join(' · ')}</p>
                    {c.notes && <p className="mt-1 text-xs text-apple-gray-500 dark:text-apple-gray-400 line-clamp-2">{c.notes}</p>}
                  </div>
                  <ContactLinks c={c} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ContactForm contact={editing} open={formOpen} onClose={() => setFormOpen(false)} onSaved={handleSaved} countries={countries} />
    </div>
  )
}
