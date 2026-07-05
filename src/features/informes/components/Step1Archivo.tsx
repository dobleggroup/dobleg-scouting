import { useMemo, useRef, useState } from 'react'
import { parseInformeFile } from '@/features/informes/parseFile'
import { newInformeId } from '@/features/informes/informesStore'
import type { ParsedFile, Informe, InformeContent, Row } from '@/features/informes/types'
import { usePlayersList } from '@/hooks/usePlayerStats'
import type { PlayerWithScore } from '@/types/scoring'
import { displayPosition } from '@/types/scoring'
import { normalizeForSearch } from '@/lib/search'

// ─── Detección de columnas ────────────────────────────────────────────────

const NAME_KEYS = ['jugador', 'player', 'nombre', 'name']
const CLUB_KEYS = ['club', 'equipo', 'team']
const POSICION_KEYS = ['posicion', 'position', 'pos']
const EDAD_KEYS = ['edad', 'age']
const NACIONALIDAD_KEYS = ['nacionalidad', 'nationality', 'pais', 'nac']

function findHeader(headers: string[], keys: string[]): string | null {
  for (const h of headers) {
    if (keys.includes(normalizeForSearch(h))) return h
  }
  return null
}

/** Primera columna cuyo valor de muestra es texto (no numérico) — fallback para la columna de nombre. */
function firstTextHeader(headers: string[], rows: Row[]): string | null {
  for (const h of headers) {
    const sample = rows.find(r => r[h] !== '' && r[h] != null)
    if (sample && typeof sample[h] === 'string') return h
  }
  return headers[0] ?? null
}

function cellStr(row: Row | undefined, header: string | null): string {
  if (!row || !header) return ''
  const v = row[header]
  return v == null || v === '' ? '' : String(v)
}

interface DetectedColumns {
  nombre: string | null
  club: string | null
  posicion: string | null
  edad: string | null
  nacionalidad: string | null
}

function detectColumns(headers: string[], rows: Row[]): DetectedColumns {
  return {
    nombre: findHeader(headers, NAME_KEYS) ?? firstTextHeader(headers, rows),
    club: findHeader(headers, CLUB_KEYS),
    posicion: findHeader(headers, POSICION_KEYS),
    edad: findHeader(headers, EDAD_KEYS),
    nacionalidad: findHeader(headers, NACIONALIDAD_KEYS),
  }
}

function autoFillFromRow(content: InformeContent, row: Row | undefined, cols: DetectedColumns): InformeContent {
  return {
    ...content,
    nombre: cellStr(row, cols.nombre),
    club: cellStr(row, cols.club),
    posicion: cellStr(row, cols.posicion),
    edad: cellStr(row, cols.edad),
    nacionalidad: cellStr(row, cols.nacionalidad),
  }
}

const EMPTY_CONTENT: InformeContent = {
  nombre: '', club: '', posicion: '', rol: '',
  edad: '', nacionalidad: '', liga: '', contrato: '', valorMercado: '',
  hideMainStats: false,
  rating: '', pj: '', minutos: '', goles: '', asistencias: '',
  lecturaAutor: '', lecturaTexto: '',
  videoUrl: '', transfermarktUrl: '', representante: '',
  ultimos5: [],
  hideComparables: false,
  comparables: [],
  comparaciones: '',
}

function buildInforme(parsed: ParsedFile): Informe {
  const cols = detectColumns(parsed.headers, parsed.rows)
  const now = new Date().toISOString()
  return {
    id: newInformeId(),
    createdAt: now,
    updatedAt: now,
    contextoComparacion: '',
    fotoDataUrl: null,
    protagonistIndex: 0,
    comparePlayerIndices: [],
    headers: parsed.headers,
    rows: parsed.rows,
    columnMap: {},
    charts: { radar: [], bar: [], numbers: [], scatters: [] },
    content: autoFillFromRow(EMPTY_CONTENT, parsed.rows[0], cols),
  }
}

// ─── Resize de foto ───────────────────────────────────────────────────────

async function resizePhoto(file: File, max = 400): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result as string)
    fr.onerror = () => rej(fr.error ?? new Error('No se pudo leer la imagen'))
    fr.onabort = () => rej(new Error('Lectura de imagen cancelada'))
    fr.readAsDataURL(file)
  })
  const img = new Image(); img.src = dataUrl; await img.decode()
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = img.width * scale; canvas.height = img.height * scale
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

// ─── Props ────────────────────────────────────────────────────────────────

interface Step1ArchivoProps {
  parsed: ParsedFile | null
  informe: Informe | null
  onParsed: (parsed: ParsedFile, informe: Informe) => void
  onChange: (informe: Informe) => void
  onNext: () => void
}

export default function Step1Archivo({ parsed, informe, onParsed, onChange, onNext }: Step1ArchivoProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [dbQuery, setDbQuery] = useState('')
  const dbFilters = useMemo(
    () => (dbQuery.trim().length >= 2 ? { search: dbQuery.trim(), pageSize: 8 } : { pageSize: 0 }),
    [dbQuery]
  )
  const { players: dbPlayers, loading: dbLoading } = usePlayersList(dbFilters)

  const cols = useMemo(() => (parsed ? detectColumns(parsed.headers, parsed.rows) : null), [parsed])

  async function handleFile(file: File) {
    setError(null)
    setParsing(true)
    try {
      const result = await parseInformeFile(file)
      if (!result.rows.length) throw new Error('El archivo no tiene filas de datos.')
      onParsed(result, buildInforme(result))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
    } finally {
      setParsing(false)
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
    e.target.value = ''
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !informe) return
    setPhotoBusy(true)
    try {
      const dataUrl = await resizePhoto(file)
      onChange({ ...informe, fotoDataUrl: dataUrl })
    } catch {
      setError('No se pudo procesar la foto.')
    } finally {
      setPhotoBusy(false)
    }
  }

  function selectProtagonist(idx: number) {
    if (!informe || !cols || idx === informe.protagonistIndex) return
    onChange({
      ...informe,
      protagonistIndex: idx,
      content: autoFillFromRow(informe.content, informe.rows[idx], cols),
    })
  }

  function selectDbPlayer(p: PlayerWithScore) {
    if (!informe) return
    const age = p.birth_date
      ? Math.floor((Date.now() - new Date(p.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null
    const mv = p.market_value_eur
    const mvFormatted = mv == null ? ''
      : mv >= 1_000_000 ? `€${(mv / 1_000_000).toFixed(mv % 1_000_000 === 0 ? 0 : 1)}M`
      : mv >= 1_000 ? `€${(mv / 1_000).toFixed(0)}K`
      : `€${mv}`
    onChange({
      ...informe,
      content: {
        ...informe.content,
        club: p.team?.name ?? informe.content.club,
        posicion: p.primary_position ? displayPosition(p.primary_position) : informe.content.posicion,
        edad: Number.isFinite(age) ? String(age) : informe.content.edad,
        nacionalidad: p.nationality ?? informe.content.nacionalidad,
        liga: p.league?.name ?? informe.content.liga,
        contrato: p.contract_end_date ?? informe.content.contrato,
        valorMercado: mvFormatted || informe.content.valorMercado,
        transfermarktUrl: p.transfermarkt_url ?? informe.content.transfermarktUrl,
        representante: p.agent ?? informe.content.representante,
      },
    })
    setDbQuery('')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── Izquierda: archivo, contexto, foto ── */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
          <h2 className="text-sm font-semibold text-apple-gray-900 dark:text-white mb-3">Archivo de métricas</h2>
          <div
            role="button"
            tabIndex={0}
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-brand-red bg-brand-red/5 scale-[1.01]'
                : 'border-apple-gray-300 dark:border-apple-gray-700 hover:border-brand-red/50 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50'
            }`}
          >
            <input ref={fileInputRef} type="file" accept=".xlsx,.csv,.xml" onChange={handleFileInput} className="hidden" />
            <svg className="w-8 h-8 mx-auto mb-2 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
              Arrastrá el archivo o <span className="text-brand-red font-medium">hacé clic para seleccionar</span>
            </p>
            <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-1">.xlsx, .csv, .xml</p>
          </div>

          {parsing && (
            <p className="mt-3 text-xs text-apple-gray-500 dark:text-apple-gray-400 flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
              Procesando archivo...
            </p>
          )}
          {error && (
            <p className="mt-3 text-xs text-red-500">{error}</p>
          )}
          {!parsing && !error && parsed && (
            <p className="mt-3 text-xs text-brand-green font-medium">
              {parsed.rows.length} jugador{parsed.rows.length === 1 ? '' : 'es'} detectado{parsed.rows.length === 1 ? '' : 's'}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
          <label className="block text-sm font-semibold text-apple-gray-900 dark:text-white mb-2">Contexto de comparación</label>
          <input
            type="text"
            disabled={!informe}
            value={informe?.contextoComparacion ?? ''}
            onChange={e => informe && onChange({ ...informe, contextoComparacion: e.target.value })}
            placeholder="Ej: vs. líneas ofensivas de la misma liga"
            className="w-full px-3 py-2.5 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-900 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red text-sm disabled:opacity-50"
          />
        </div>

        <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
          <label className="block text-sm font-semibold text-apple-gray-900 dark:text-white mb-2">Foto del jugador</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 bg-apple-gray-100 dark:bg-apple-gray-800 flex items-center justify-center">
              {informe?.fotoDataUrl ? (
                <img src={informe.fotoDataUrl} alt="Foto del jugador" className="w-full h-full object-cover" />
              ) : (
                <svg className="w-6 h-6 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
              <button
                type="button"
                disabled={!informe || photoBusy}
                onClick={() => photoInputRef.current?.click()}
                className="px-3 py-2 rounded-xl text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {photoBusy ? 'Procesando...' : 'Subir foto'}
              </button>
              <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-1">Se redimensiona automáticamente</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Derecha: selección de jugador ── */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
          <h2 className="text-sm font-semibold text-apple-gray-900 dark:text-white mb-3">Seleccionar jugador</h2>
          {!informe ? (
            <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">Subí un archivo para elegir el protagonista del informe.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-apple-gray-100 dark:border-apple-gray-800 divide-y divide-apple-gray-100 dark:divide-apple-gray-800">
              {informe.rows.map((row, idx) => (
                <button
                  key={idx}
                  onClick={() => selectProtagonist(idx)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
                    idx === informe.protagonistIndex
                      ? 'bg-brand-red/10'
                      : 'hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/60'
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${idx === informe.protagonistIndex ? 'text-brand-red' : 'text-apple-gray-900 dark:text-white'}`}>
                      {cellStr(row, cols?.nombre ?? null) || `Fila ${idx + 1}`}
                    </p>
                    <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">
                      {[cellStr(row, cols?.club ?? null), cellStr(row, cols?.posicion ?? null), cellStr(row, cols?.edad ?? null) && `${cellStr(row, cols?.edad ?? null)} años`]
                        .filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {idx === informe.protagonistIndex && (
                    <svg className="w-4 h-4 text-brand-red flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
          <label className="block text-sm font-semibold text-apple-gray-900 dark:text-white mb-2">Buscar jugador en la base de datos</label>
          <div className="relative">
            <input
              type="text"
              disabled={!informe}
              value={dbQuery}
              onChange={e => setDbQuery(e.target.value)}
              placeholder="Autocompletar club, posición, edad..."
              className="w-full px-3 py-2.5 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-900 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red text-sm disabled:opacity-50"
            />
            {dbQuery.trim().length >= 2 && (
              <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                {dbLoading && (
                  <p className="px-4 py-3 text-xs text-apple-gray-500 dark:text-apple-gray-400">Buscando...</p>
                )}
                {!dbLoading && dbPlayers.length === 0 && (
                  <p className="px-4 py-3 text-xs text-apple-gray-500 dark:text-apple-gray-400">Sin resultados</p>
                )}
                {!dbLoading && dbPlayers.map(p => (
                  <button
                    key={p.id}
                    onMouseDown={() => selectDbPlayer(p)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/60 transition-colors border-b border-apple-gray-100 dark:border-apple-gray-700/50 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-apple-gray-900 dark:text-white truncate">{p.name}</p>
                      <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">
                        {[p.team?.name, p.primary_position ? displayPosition(p.primary_position) : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={!informe}
          onClick={onNext}
          className="w-full px-4 py-3 rounded-xl bg-brand-red text-white text-sm font-semibold hover:bg-brand-red/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Siguiente →
        </button>
      </div>
    </div>
  )
}
