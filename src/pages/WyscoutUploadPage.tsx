import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAgencyPlayers, agencyKey } from '@/services/agencyPlayersService'
import { parsePlayerStatsFile, type ParsedPlayerStats } from '@/features/wyscoutPerf/parsePlayerStats'
import {
  deleteUpload, fetchUploads, invalidateWyscoutCache, isUploadWindow, previewUpload, saveUpload, uploadedThisMonth,
  type WyscoutUploadRow,
} from '@/services/wyscoutPerfService'
import { normalizeName } from '@/utils/scoring'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

interface Pending {
  /** Identifica el archivo para no sumarlo dos veces a la lista. */
  id: string
  file: File
  parsed: ParsedPlayerStats | null
  fresh: number
  updated: number
  error: string | null
  /** El nombre del archivo no coincide con el jugador elegido. */
  mismatch: boolean
}

const fileId = (f: File) => `${f.name}|${f.size}|${f.lastModified}`
const matchKey = (m: { date: string; label: string }) => `${m.date}|${m.label}`
const firstDate = (p: Pending) => p.parsed?.matches[0]?.date ?? '9999'

function fmtDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y.slice(2)}`
}

/** "J. Paradela" encaja con "José Paradela": mismo apellido y, si hay inicial, misma inicial. */
function nameMatches(fromFile: string | null, fullName: string, shortName: string) {
  if (!fromFile) return true
  const f = normalizeName(fromFile).replace(/\./g, ' ').replace(/\s+/g, ' ').trim()
  const cands = [fullName, shortName].map(n => normalizeName(n).replace(/\./g, ' ').replace(/\s+/g, ' ').trim())
  if (cands.includes(f)) return true
  const fp = f.split(' ')
  const surname = fp[fp.length - 1]
  return cands.some(c => {
    const cp = c.split(' ')
    return cp[cp.length - 1] === surname && (fp.length < 2 || cp[0][0] === fp[0][0])
  })
}

export default function WyscoutUploadPage() {
  const roster = useMemo(
    () => [...getAgencyPlayers()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')),
    [],
  )
  const [uploads, setUploads] = useState<WyscoutUploadRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string>('')
  const [pending, setPending] = useState<Pending[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null)
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    try {
      setUploads(await fetchUploads())
      setLoadError(null)
    } catch (e) {
      setLoadError((e as Error).message)
      setUploads(prev => prev ?? [])
    }
  }, [])
  useEffect(() => { void reload() }, [reload])

  const today = new Date()
  const done = useMemo(() => uploadedThisMonth(uploads ?? []), [uploads])
  const missing = roster.filter(p => !done.has(agencyKey(p.fullName)))
  const loaded = roster.filter(p => done.has(agencyKey(p.fullName)))
  const player = roster.find(p => agencyKey(p.fullName) === selected) ?? null

  // Al entrar, queda elegido el primer pendiente.
  useEffect(() => {
    if (!selected && uploads && missing.length) setSelected(agencyKey(missing[0].fullName))
  }, [uploads]) // eslint-disable-line react-hooks/exhaustive-deps

  const takeFiles = async (files: FileList | File[] | null) => {
    if (!files || !player) return
    setMessage(null)
    const list = [...files].filter(f => /\.xlsx?$/i.test(f.name))
    if (!list.length) {
      setMessage({ tone: 'error', text: 'Solo se pueden cargar archivos Excel (.xlsx) de Wyscout.' })
      return
    }
    // Se suman a los que ya estaban en la lista; el mismo archivo no entra dos veces.
    const already = new Set(pending.map(p => p.id))
    const seen = new Set<string>()
    const toRead = list.filter(f => {
      const id = fileId(f)
      if (already.has(id) || seen.has(id)) return false
      seen.add(id)
      return true
    })
    const repeated = list.length - toRead.length
    if (!toRead.length) {
      setMessage({ tone: 'info', text: repeated === 1 ? 'Ese archivo ya estaba en la lista.' : 'Esos archivos ya estaban en la lista.' })
      return
    }
    setBusy(true)
    const key = agencyKey(player.fullName)
    const out: Pending[] = []
    for (const file of toRead) {
      const id = fileId(file)
      try {
        const parsed = await parsePlayerStatsFile(file)
        const { fresh, updated } = await previewUpload(key, parsed)
        out.push({ id, file, parsed, fresh, updated, error: parsed.matches.length ? null : 'El archivo no tiene partidos.',
          mismatch: !nameMatches(parsed.fileNamePlayer, player.fullName, player.shortName) })
      } catch (e) {
        out.push({ id, file, parsed: null, fresh: 0, updated: 0, error: (e as Error).message, mismatch: false })
      }
    }
    // Ordenados por fecha: las temporadas quedan en orden aunque se arrastren mezcladas.
    setPending(prev => [...prev, ...out].sort((a, b) => firstDate(a).localeCompare(firstDate(b))))
    if (repeated) setMessage({ tone: 'info', text: `${repeated === 1 ? 'Un archivo ya estaba' : `${repeated} archivos ya estaban`} en la lista y no se sumó de nuevo.` })
    setBusy(false)
  }

  const dropOne = (id: string) => { setPending(prev => prev.filter(p => p.id !== id)); setMessage(null) }

  const confirm = async () => {
    if (!player) return
    setBusy(true)
    const key = agencyKey(player.fullName)
    let fresh = 0, updated = 0
    try {
      for (const p of pending) {
        if (!p.parsed || p.error) continue
        const r = await saveUpload(key, player.fullName, p.file.name, p.parsed)
        fresh += r.fresh
        updated += r.updated
        // Lo ya guardado sale de la lista: si algo falla después, reintentar no lo carga dos veces.
        setPending(prev => prev.filter(x => x.id !== p.id))
      }
      invalidateWyscoutCache()
      setMessage({ tone: 'ok', text: `${player.fullName}: ${fresh} partidos nuevos${updated ? ` y ${updated} actualizados` : ''}.` })
      setPending([])
      await reload()
      // Salta al siguiente pendiente.
      const next = missing.find(p => agencyKey(p.fullName) !== key)
      if (next) setSelected(agencyKey(next.fullName))
    } catch (e) {
      const saved = fresh + updated
      setMessage({ tone: 'error', text: `No se pudo guardar: ${(e as Error).message}${saved ? ` (${saved} partidos sí quedaron cargados; los archivos que faltan siguen en la lista)` : ''}` })
      if (saved) { invalidateWyscoutCache(); void reload() }
    } finally {
      setBusy(false)
    }
  }

  const remove = async (u: WyscoutUploadRow) => {
    if (!window.confirm(`¿Borrar la carga de ${u.player_name} (${u.file_name ?? 'archivo'})? Se borran los partidos que entraron con ella.`)) return
    try {
      await deleteUpload(u.id)
      invalidateWyscoutCache()
      await reload()
    } catch (e) {
      setMessage({ tone: 'error', text: `No se pudo borrar: ${(e as Error).message}` })
    }
  }

  const valid = pending.filter(p => p.parsed && !p.error)
  // Un partido que aparece en dos archivos se carga una sola vez.
  const uniqueMatches = new Set(valid.flatMap(p => p.parsed!.matches.map(matchKey))).size
  const range = valid.flatMap(p => p.parsed!.matches.map(m => m.date)).sort()

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 sm:pb-10 space-y-5 animate-fade-in">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold text-apple-gray-800 dark:text-white">Carga de Wyscout</h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">
          Subí los Excel "Player stats" de cada jugador. Se cargan a principio de mes y alimentan{' '}
          <Link to="/rendimiento-individual" className="text-brand-green hover:underline">Rendimiento individual</Link>.
        </p>
      </header>

      {uploads && missing.length > 0 && isUploadWindow(today) && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-apple-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
          <span className="text-lg leading-none">⏰</span>
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <span className="font-semibold">Faltan cargar los datos de {MONTHS[today.getMonth()]}</span> de {missing.length} de {roster.length} jugadores.
            <div className="text-xs mt-0.5 text-amber-700/80 dark:text-amber-300/80">
              {missing.slice(0, 8).map(p => p.shortName).join(', ')}{missing.length > 8 ? ` y ${missing.length - 8} más` : ''}.
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="px-4 py-3 rounded-apple-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
          No se pudo leer el historial de cargas: {loadError}
        </div>
      )}

      <section className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-5 space-y-4">
        {/* 1. Jugador */}
        <div>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <label htmlFor="wy-player" className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-200">1. Elegí el jugador</label>
            {uploads && (
              <span className={`text-2xs font-medium px-2 py-0.5 rounded-full ${missing.length ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'}`}>
                {missing.length ? `Faltan ${missing.length} de ${roster.length} este mes` : 'Todos cargados este mes ✓'}
              </span>
            )}
          </div>
          <select
            id="wy-player"
            value={selected}
            onChange={e => { setSelected(e.target.value); setPending([]); setMessage(null) }}
            disabled={busy || !uploads}
            className="w-full sm:w-96 px-3 py-2.5 rounded-apple text-sm bg-apple-gray-50 dark:bg-apple-gray-700 text-apple-gray-800 dark:text-white border border-apple-gray-200 dark:border-apple-gray-600 focus:ring-2 focus:ring-brand-green focus:outline-none"
          >
            {!uploads && <option>Cargando jugadores…</option>}
            {missing.length > 0 && (
              <optgroup label={`Sin cargar en ${MONTHS[today.getMonth()]} (${missing.length})`}>
                {missing.map(p => <option key={p.fullName} value={agencyKey(p.fullName)}>{p.fullName}{p.team ? ` · ${p.team}` : ''}</option>)}
              </optgroup>
            )}
            {loaded.length > 0 && (
              <optgroup label={`Ya cargados este mes (${loaded.length})`}>
                {loaded.map(p => <option key={p.fullName} value={agencyKey(p.fullName)}>✓ {p.fullName}{p.team ? ` · ${p.team}` : ''}</option>)}
              </optgroup>
            )}
          </select>
        </div>

        {/* 2. Archivos */}
        <div>
          <div className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-200 mb-1.5">2. Arrastrá sus archivos</div>
          <div
            onDragOver={e => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); if (!busy) void takeFiles(e.dataTransfer.files) }}
            className={`rounded-apple-xl border-2 border-dashed transition-colors ${over ? 'border-brand-green bg-brand-green/5' : 'border-apple-gray-200 dark:border-apple-gray-600'} ${busy || !player ? 'opacity-50' : ''}`}
          >
            <button type="button" disabled={busy || !player} onClick={() => inputRef.current?.click()} className={`w-full px-6 text-center ${pending.length ? 'py-6' : 'py-10'}`}>
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center">
                <svg className="w-6 h-6 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                </svg>
              </div>
              <div className="text-sm font-medium text-apple-gray-800 dark:text-white">
                {busy ? 'Leyendo…' : !player ? 'Primero elegí un jugador'
                  : pending.length ? `Sumá más archivos de ${player.shortName}: arrastralos o tocá acá`
                  : `Arrastrá los Excel de ${player.shortName} o tocá para elegirlos`}
              </div>
              <div className="text-xs text-apple-gray-400 mt-1">Podés sumar varios, de a uno o todos juntos (por ejemplo, una temporada por archivo). Si un partido ya estaba, se actualiza; no se duplica.</div>
            </button>
            <input ref={inputRef} type="file" multiple accept=".xlsx,.xls" className="hidden"
              onChange={e => { void takeFiles(e.target.files); e.target.value = '' }} />
          </div>
        </div>

        {/* 3. Resumen */}
        {pending.length > 0 && player && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-200">3. Revisá y cargá</div>
              <span className="text-xs text-apple-gray-400">{pending.length} {pending.length === 1 ? 'archivo' : 'archivos'}</span>
            </div>
            <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50 rounded-apple border border-apple-gray-100 dark:border-apple-gray-700/50">
              {pending.map(p => (
                <li key={p.id} className="px-3 py-2.5 text-sm">
                  <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                    <span className="font-medium text-apple-gray-800 dark:text-white truncate max-w-full">{p.file.name}</span>
                    {p.parsed && !p.error && (
                      <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400">
                        {p.parsed.matches.length} partidos · {fmtDate(p.parsed.matches[0].date)} → {fmtDate(p.parsed.matches[p.parsed.matches.length - 1].date)} ·{' '}
                        <span className="text-emerald-600 dark:text-emerald-400">{p.fresh} nuevos</span>
                        {p.updated > 0 && <> · <span className="text-sky-600 dark:text-sky-400">{p.updated} se actualizan</span></>}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => dropOne(p.id)}
                    disabled={busy}
                    aria-label={`Sacar ${p.file.name} de la lista`}
                    title="Sacar de la lista"
                    className="shrink-0 -mr-1 w-6 h-6 rounded-full flex items-center justify-center text-apple-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-40 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                  </div>
                  {p.error && <div className="text-xs text-red-600 dark:text-red-400 mt-1">{p.error}</div>}
                  {!p.error && p.parsed && p.parsed.duplicates.length > 0 && (
                    <div className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-1">
                      {p.parsed.duplicates.length === 1
                        ? `El archivo traía repetido el partido ${p.parsed.duplicates[0].label.replace(/\s+\d+:\d+$/, '')} del ${fmtDate(p.parsed.duplicates[0].date)}: se carga una sola vez.`
                        : `El archivo traía ${p.parsed.duplicates.length} partidos repetidos: cada uno se carga una sola vez.`}
                    </div>
                  )}
                  {p.mismatch && (
                    <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                      ⚠️ El archivo dice "{p.parsed?.fileNamePlayer}" y elegiste a {player.fullName}. Revisá que sea el jugador correcto.
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={confirm}
                disabled={busy || valid.length === 0}
                className="px-5 py-2.5 rounded-apple text-sm font-semibold text-white bg-brand-green hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {busy ? 'Cargando…' : `Cargar ${uniqueMatches} partidos de ${player.shortName}`}
              </button>
              <button onClick={() => { setPending([]); setMessage(null) }} disabled={busy} className="text-sm text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300">{pending.length > 1 ? 'Vaciar lista' : 'Cancelar'}</button>
              {range.length > 0 && <span className="text-xs text-apple-gray-400">Del {fmtDate(range[0])} al {fmtDate(range[range.length - 1])}</span>}
            </div>
          </div>
        )}

        {message && (
          <div className={`px-3 py-2.5 rounded-apple text-sm ${message.tone === 'ok' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : message.tone === 'info' ? 'bg-apple-gray-50 dark:bg-apple-gray-700/40 text-apple-gray-600 dark:text-apple-gray-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
            {message.tone === 'ok' ? '✓ ' : ''}{message.text}
          </div>
        )}
      </section>

      {/* Historial */}
      <section className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-5">
        <h2 className="text-base font-semibold text-apple-gray-800 dark:text-white mb-3">Últimas cargas</h2>
        {uploads === null ? (
          <div className="h-24 rounded-apple bg-apple-gray-100 dark:bg-apple-gray-700/40 animate-pulse" />
        ) : uploads.length === 0 ? (
          <p className="text-sm text-apple-gray-400">Todavía no se cargó ningún archivo.</p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-2xs uppercase tracking-wide text-apple-gray-400">
                  <th className="py-2 pr-3 font-medium">Jugador</th>
                  <th className="py-2 pr-3 font-medium">Partidos</th>
                  <th className="py-2 pr-3 font-medium hidden sm:table-cell">Período</th>
                  <th className="py-2 pr-3 font-medium hidden md:table-cell">Cargó</th>
                  <th className="py-2 pr-3 font-medium">Cuándo</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
                {uploads.slice(0, 40).map(u => (
                  <tr key={u.id}>
                    <td className="py-2 pr-3 font-medium text-apple-gray-800 dark:text-white whitespace-nowrap">{u.player_name}</td>
                    <td className="py-2 pr-3 text-apple-gray-600 dark:text-apple-gray-300 whitespace-nowrap">{u.matches_new} nuevos{u.matches_updated ? ` · ${u.matches_updated} act.` : ''}</td>
                    <td className="py-2 pr-3 text-apple-gray-500 dark:text-apple-gray-400 whitespace-nowrap hidden sm:table-cell">{fmtDate(u.date_from)} → {fmtDate(u.date_to)}</td>
                    <td className="py-2 pr-3 text-apple-gray-500 dark:text-apple-gray-400 hidden md:table-cell">{u.uploaded_by_name ?? '—'}</td>
                    <td className="py-2 pr-3 text-apple-gray-500 dark:text-apple-gray-400 whitespace-nowrap">{fmtDate(u.uploaded_at)}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => remove(u)} className="text-xs text-apple-gray-400 hover:text-red-600 dark:hover:text-red-400">Borrar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
