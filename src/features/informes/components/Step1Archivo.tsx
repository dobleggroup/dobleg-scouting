import { useEffect, useMemo, useRef, useState } from 'react'
import { parseInformeFile } from '@/features/informes/parseFile'
import { newInformeId } from '@/features/informes/informesStore'
import type { ParsedFile, Informe, InformeContent, ComparisonProfile, Row } from '@/features/informes/types'
import { EMPTY_COMPARISON_PROFILE } from '@/features/informes/types'
import { usePlayersList } from '@/hooks/usePlayerStats'
import { fetchConfirmedTransfermarktIds } from '@/services/playerStatsService'
import { dedupePlayers } from '@/features/informes/dedupePlayers'
import type { PlayerWithScore } from '@/types/scoring'
import { displayPosition } from '@/types/scoring'
import { normalizeForSearch } from '@/lib/search'
import { useCurrency } from '@/context/CurrencyContext'
import { formatMarketValueInCurrency } from '@/utils/scoring'
import { useLanguage } from '@/context/LanguageContext'

// ─── Detección de columnas ────────────────────────────────────────────────

const NAME_KEYS = ['jugador', 'player', 'nombre', 'name']
const CLUB_KEYS = ['club', 'equipo', 'team']
const POSICION_KEYS = ['posicion', 'position', 'pos', 'posicion especifica']
const EDAD_KEYS = ['edad', 'age']
const NACIONALIDAD_KEYS = ['nacionalidad', 'nationality', 'pais', 'nac']
// Estos 4 sí suelen venir tal cual en un export de Wyscout (ver "Partidos
// jugados"/"Minutos jugados"/"Goles"/"Asistencias"), a diferencia de
// liga/contrato/valor de mercado/rating que no trae y quedan manuales o por DB.
const PJ_KEYS = ['partidos jugados', 'pj', 'matches', 'matches played', 'apps', 'appearances']
const MINUTOS_KEYS = ['minutos jugados', 'minutos', 'minutes', 'minutes played', 'min']
const GOLES_KEYS = ['goles', 'goals']
const ASISTENCIAS_KEYS = ['asistencias', 'assists']
const ALTURA_KEYS = ['altura', 'height']
const PIE_KEYS = ['pie', 'foot', 'preferred foot']

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
  pj: string | null
  minutos: string | null
  goles: string | null
  asistencias: string | null
  altura: string | null
  pie: string | null
}

function detectColumns(headers: string[], rows: Row[]): DetectedColumns {
  return {
    nombre: findHeader(headers, NAME_KEYS) ?? firstTextHeader(headers, rows),
    club: findHeader(headers, CLUB_KEYS),
    posicion: findHeader(headers, POSICION_KEYS),
    edad: findHeader(headers, EDAD_KEYS),
    nacionalidad: findHeader(headers, NACIONALIDAD_KEYS),
    pj: findHeader(headers, PJ_KEYS),
    minutos: findHeader(headers, MINUTOS_KEYS),
    goles: findHeader(headers, GOLES_KEYS),
    asistencias: findHeader(headers, ASISTENCIAS_KEYS),
    altura: findHeader(headers, ALTURA_KEYS),
    pie: findHeader(headers, PIE_KEYS),
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
    pj: cellStr(row, cols.pj),
    minutos: cellStr(row, cols.minutos),
    goles: cellStr(row, cols.goles),
    asistencias: cellStr(row, cols.asistencias),
    altura: cellStr(row, cols.altura),
    pie: cellStr(row, cols.pie),
  }
}

/** Ficha del jugador 2 (modo Comparación 1v1) desde su fila del archivo. */
function buildComparisonProfile(row: Row | undefined, cols: DetectedColumns): ComparisonProfile {
  return {
    ...EMPTY_COMPARISON_PROFILE,
    nombre: cellStr(row, cols.nombre),
    club: cellStr(row, cols.club),
    posicion: cellStr(row, cols.posicion),
    edad: cellStr(row, cols.edad),
    nacionalidad: cellStr(row, cols.nacionalidad),
    pj: cellStr(row, cols.pj),
    minutos: cellStr(row, cols.minutos),
    goles: cellStr(row, cols.goles),
    asistencias: cellStr(row, cols.asistencias),
    altura: cellStr(row, cols.altura),
    pie: cellStr(row, cols.pie),
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

function buildInforme(parsed: ParsedFile, mode?: 'comparacion'): Informe {
  const cols = detectColumns(parsed.headers, parsed.rows)
  const now = new Date().toISOString()
  // Modo Comparación 1v1: la fila 0 es Jugador 1 y la primera fila distinta es
  // Jugador 2, así el archivo de 2 filas (el caso típico) ya llega armado.
  const otherIdx = mode === 'comparacion' ? parsed.rows.findIndex((_, idx) => idx !== 0) : -1
  return {
    id: newInformeId(),
    createdAt: now,
    updatedAt: now,
    contextoComparacion: '',
    fotoDataUrl: null,
    modo: mode,
    protagonistIndex: 0,
    comparePlayerIndices: otherIdx >= 0 ? [otherIdx] : [],
    comparisonB: otherIdx >= 0 ? buildComparisonProfile(parsed.rows[otherIdx], cols) : undefined,
    headers: parsed.headers,
    rows: parsed.rows,
    columnMap: {},
    charts: { radar: [], bar: [], numbers: [], scatters: [] },
    // Carrera (contrato/valor + transferencias) sólo tiene sentido con la ficha
    // completa de un jugador — en modo comparación no hay edición de eso, así que
    // la pestaña queda apagada de entrada en vez de mostrar la mitad vacía.
    content: {
      ...autoFillFromRow(EMPTY_CONTENT, parsed.rows[0], cols),
      ...(mode === 'comparacion' ? { hideCarreraTab: true } : {}),
    },
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
  /** 'comparacion' = wizard de Comparación 1v1: al parsear arma el par de
   *  jugadores automático y habilita la selección de rol / búsqueda del jugador 2. */
  mode?: 'comparacion'
  onParsed: (parsed: ParsedFile, informe: Informe) => void
  onChange: (informe: Informe) => void
  onNext: () => void
}

export default function Step1Archivo({ parsed, informe, mode, onParsed, onChange, onNext }: Step1ArchivoProps) {
  const { currency, rate } = useCurrency()
  const { t } = useLanguage()
  const [isDragging, setIsDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoCompBusy, setPhotoCompBusy] = useState(false)
  const [crestBusy, setCrestBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const photoCompInputRef = useRef<HTMLInputElement>(null)
  const crestInputRef = useRef<HTMLInputElement>(null)

  const [dbQuery, setDbQuery] = useState('')
  const [dbApplied, setDbApplied] = useState<{ name: string; parts: string[] } | null>(null)
  const dbFilters = useMemo(
    () => (dbQuery.trim().length >= 2 ? { search: dbQuery.trim(), pageSize: 8 } : { pageSize: 0 }),
    [dbQuery]
  )
  const { players: rawDbPlayers, loading: dbLoading } = usePlayersList(dbFilters)
  // Confirmados por el saneamiento de datos — evita fusionar por error dos
  // personas reales distintas que quedaron con el mismo transfermarkt_id mal
  // asignado. `undefined` mientras carga: dedupePlayers sigue confiando en
  // transfermarkt_id como antes hasta que esto resuelva, no rompe el buscador.
  const [confirmedTmIds, setConfirmedTmIds] = useState<Set<number> | undefined>(undefined)
  useEffect(() => { fetchConfirmedTransfermarktIds().then(setConfirmedTmIds) }, [])
  // El mismo jugador está cargado dos veces (API-Football y Sofascore). Se muestra
  // uno solo y gana el de API-Football: tiene todos los partidos y es el id con el
  // que la API devuelve traspasos y lesiones.
  const dbPlayers = useMemo(() => dedupePlayers(rawDbPlayers, confirmedTmIds), [rawDbPlayers, confirmedTmIds])

  // Búsqueda en la DB para el jugador 2 (modo Comparación 1v1) — mismo mecanismo
  // que la de arriba, en paralelo.
  const [dbQuery2, setDbQuery2] = useState('')
  const [dbApplied2, setDbApplied2] = useState<{ name: string; parts: string[] } | null>(null)
  const dbFilters2 = useMemo(
    () => (dbQuery2.trim().length >= 2 ? { search: dbQuery2.trim(), pageSize: 8 } : { pageSize: 0 }),
    [dbQuery2]
  )
  const { players: rawDbPlayers2, loading: dbLoading2 } = usePlayersList(dbFilters2)
  const dbPlayers2 = useMemo(() => dedupePlayers(rawDbPlayers2, confirmedTmIds), [rawDbPlayers2, confirmedTmIds])

  const cols = useMemo(() => (parsed ? detectColumns(parsed.headers, parsed.rows) : null), [parsed])

  async function handleFile(file: File) {
    setError(null)
    setParsing(true)
    try {
      const result = await parseInformeFile(file)
      if (!result.rows.length) throw new Error(t('informesStep1.errorSinFilas'))
      onParsed(result, buildInforme(result, mode))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('informesStep1.errorLeerArchivo'))
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
      setError(t('informesStep1.errorProcesarFoto'))
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handlePhotoComp(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !informe) return
    setPhotoCompBusy(true)
    try {
      const dataUrl = await resizePhoto(file)
      onChange({ ...informe, fotoComparadoDataUrl: dataUrl })
    } catch {
      setError(t('informesStep1.errorProcesarFoto'))
    } finally {
      setPhotoCompBusy(false)
    }
  }

  async function handleCrest(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !informe) return
    setCrestBusy(true)
    try {
      const dataUrl = await resizePhoto(file, 200)
      onChange({ ...informe, ligaCrestDataUrl: dataUrl })
    } catch {
      setError(t('informesStep1.errorProcesarEscudo'))
    } finally {
      setCrestBusy(false)
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

  /** Modo Comparación 1v1: cada fila puede ser Jugador 1 (protagonista) o
   *  Jugador 2 (comparisonB), nunca las dos — clic reasigna ese rol a la fila. */
  function selectComparisonRole(idx: number, role: 1 | 2) {
    if (!informe || !cols) return
    if (role === 1) {
      if (idx === informe.protagonistIndex) return
      onChange({
        ...informe,
        protagonistIndex: idx,
        comparePlayerIndices: (informe.comparePlayerIndices ?? []).filter(i => i !== idx),
        content: autoFillFromRow(informe.content, informe.rows[idx], cols),
      })
    } else {
      if (idx === informe.protagonistIndex) return // ya es Jugador 1, no puede ser los dos
      if ((informe.comparePlayerIndices ?? [])[0] === idx) return
      onChange({
        ...informe,
        comparePlayerIndices: [idx],
        comparisonB: buildComparisonProfile(informe.rows[idx], cols),
      })
    }
  }

  function selectDbPlayer(p: PlayerWithScore) {
    if (!informe) return
    const age = p.birth_date
      ? Math.floor((Date.now() - new Date(p.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null
    const mv = p.market_value_eur
    // mv === 0 se trata igual que "sin valor" (empty), como en el comportamiento
    // original: formatMarketValueInCurrency devuelve '-' para 0, que quedaría raro
    // en este campo de texto libre.
    const mvFormatted = mv == null || mv === 0 ? '' : formatMarketValueInCurrency(mv, currency, rate)
    const edad = Number.isFinite(age) ? String(age) : ''
    // Rating: autocompletar desde el rating del jugador si el campo está vacío.
    const rating = p.primary_score ?? p.season_scores?.[0]?.avg_rating ?? null
    const ratingFromApi = rating != null ? String(Math.round(rating * 10) / 10) : ''
    onChange({
      ...informe,
      dbPlayerId: p.id,
      dbPlayerName: p.name,
      dbPosition: p.primary_position ?? undefined,
      dbPercentile: p.primary_percentile ?? undefined,
      dbLeagueName: p.league?.name ?? undefined,
      content: {
        ...informe.content,
        club: p.team?.name ?? informe.content.club,
        posicion: p.primary_position ? displayPosition(p.primary_position) : informe.content.posicion,
        edad: edad || informe.content.edad,
        nacionalidad: p.nationality ?? informe.content.nacionalidad,
        // Auto-completa la liga real desde la DB para la 1ra línea "Mejor que X%"
        // (evita el "en —"); no pisa la liga si el usuario ya la escribió.
        liga: informe.content.liga || p.league?.name || '',
        contrato: p.contract_end_date ?? informe.content.contrato,
        valorMercado: mvFormatted || informe.content.valorMercado,
        transfermarktUrl: p.transfermarkt_url ?? informe.content.transfermarktUrl,
        representante: p.agent ?? informe.content.representante,
        rating: informe.content.rating || ratingFromApi,
      },
    })
    // Feedback visible: resumen de lo que se autocompletó (se ve completo en el paso 3).
    const applied: string[] = []
    if (p.team?.name) applied.push(p.team.name)
    if (edad) applied.push(`${edad} ${t('externo.anios')}`)
    if (p.league?.name) applied.push(p.league.name)
    if (p.contract_end_date) applied.push(t('informesStep1.contratoPrefix').replace('{date}', p.contract_end_date))
    if (mvFormatted) applied.push(mvFormatted)
    if (p.agent) applied.push(p.agent)
    setDbApplied({ name: p.name, parts: applied })
    setDbQuery('')
  }

  function selectDbPlayer2(p: PlayerWithScore) {
    if (!informe) return
    const base = informe.comparisonB ?? EMPTY_COMPARISON_PROFILE
    const age = p.birth_date
      ? Math.floor((Date.now() - new Date(p.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null
    const mv = p.market_value_eur
    const mvFormatted = mv == null || mv === 0 ? '' : formatMarketValueInCurrency(mv, currency, rate)
    const edad = Number.isFinite(age) ? String(age) : ''
    const rating = p.primary_score ?? p.season_scores?.[0]?.avg_rating ?? null
    const ratingFromApi = rating != null ? String(Math.round(rating * 10) / 10) : ''
    onChange({
      ...informe,
      comparisonB: {
        ...base,
        club: p.team?.name ?? base.club,
        posicion: p.primary_position ? displayPosition(p.primary_position) : base.posicion,
        edad: edad || base.edad,
        nacionalidad: p.nationality ?? base.nacionalidad,
        liga: base.liga || p.league?.name || '',
        contrato: p.contract_end_date ?? base.contrato,
        valorMercado: mvFormatted || base.valorMercado,
        rating: base.rating || ratingFromApi,
      },
    })
    const applied: string[] = []
    if (p.team?.name) applied.push(p.team.name)
    if (edad) applied.push(`${edad} ${t('externo.anios')}`)
    if (p.league?.name) applied.push(p.league.name)
    if (mvFormatted) applied.push(mvFormatted)
    setDbApplied2({ name: p.name, parts: applied })
    setDbQuery2('')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── Izquierda: archivo, contexto, foto ── */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
          <h2 className="text-sm font-semibold text-apple-gray-900 dark:text-white mb-3">{t('informesStep1.tituloArchivo')}</h2>
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
                ? 'border-brand-green bg-brand-green/5 scale-[1.01]'
                : 'border-apple-gray-300 dark:border-apple-gray-700 hover:border-brand-green/50 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50'
            }`}
          >
            <input ref={fileInputRef} type="file" accept=".xlsx,.csv,.xml" onChange={handleFileInput} className="hidden" />
            <svg className="w-8 h-8 mx-auto mb-2 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
              {t('informesStep1.dropzoneTexto')} <span className="text-brand-green font-medium">{t('informesStep1.dropzoneLink')}</span>
            </p>
            <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-1">.xlsx, .csv, .xml</p>
          </div>

          {parsing && (
            <p className="mt-3 text-xs text-apple-gray-500 dark:text-apple-gray-400 flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
              {t('informesStep1.procesandoArchivo')}
            </p>
          )}
          {error && (
            <p className="mt-3 text-xs text-red-500">{error}</p>
          )}
          {!parsing && !error && parsed && (
            <p className="mt-3 text-xs text-brand-green font-medium">
              {t(parsed.rows.length === 1 ? 'informesStep1.detectadoUno' : 'informesStep1.detectadoVarios').replace('{count}', String(parsed.rows.length))}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
          <label className="block text-sm font-semibold text-apple-gray-900 dark:text-white mb-2">{t('informesStep1.contextoLabel')}</label>
          <input
            type="text"
            disabled={!informe}
            value={informe?.contextoComparacion ?? ''}
            onChange={e => informe && onChange({ ...informe, contextoComparacion: e.target.value })}
            placeholder={t('informesStep1.contextoPlaceholder')}
            className="w-full px-3 py-2.5 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-900 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green text-sm disabled:opacity-50"
          />
        </div>

        <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
          <label className="block text-sm font-semibold text-apple-gray-900 dark:text-white mb-2">{t('informesStep1.fotoLabel')}</label>
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
                {photoBusy ? t('informesStep1.procesando') : t('informesStep1.subirFoto')}
              </button>
              <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-1">{t('informesStep1.fotoHint')}</p>
            </div>
          </div>
        </div>

        {informe?.modo === 'comparacion' && (
          <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
            <label className="block text-sm font-semibold text-apple-gray-900 dark:text-white mb-2">{t('informesStep1.fotoCompLabel')}</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 bg-apple-gray-100 dark:bg-apple-gray-800 flex items-center justify-center">
                {informe.fotoComparadoDataUrl ? (
                  <img src={informe.fotoComparadoDataUrl} alt="Foto del segundo jugador" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-6 h-6 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <input ref={photoCompInputRef} type="file" accept="image/*" onChange={handlePhotoComp} className="hidden" />
                <button
                  type="button"
                  disabled={photoCompBusy}
                  onClick={() => photoCompInputRef.current?.click()}
                  className="px-3 py-2 rounded-xl text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {photoCompBusy ? t('informesStep1.procesando') : t('informesStep1.subirFoto')}
                </button>
                <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-1">{t('informesStep1.fotoCompHint')}</p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
          <label className="block text-sm font-semibold text-apple-gray-900 dark:text-white mb-2">{t('informesStep1.escudoLabel')}</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 bg-apple-gray-100 dark:bg-apple-gray-800 flex items-center justify-center p-2">
              {informe?.ligaCrestDataUrl ? (
                <img src={informe.ligaCrestDataUrl} alt="Escudo de liga" className="w-full h-full object-contain" />
              ) : (
                <svg className="w-6 h-6 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3l7 3v5c0 4-3 7.5-7 8.5-4-1-7-4.5-7-8.5V6l7-3z" />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <input ref={crestInputRef} type="file" accept="image/*" onChange={handleCrest} className="hidden" />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!informe || crestBusy}
                  onClick={() => crestInputRef.current?.click()}
                  className="px-3 py-2 rounded-xl text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {crestBusy ? t('informesStep1.procesando') : t('informesStep1.subirEscudo')}
                </button>
                {informe?.ligaCrestDataUrl && (
                  <button
                    type="button"
                    onClick={() => informe && onChange({ ...informe, ligaCrestDataUrl: undefined })}
                    className="px-3 py-2 rounded-xl text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 hover:text-red-500 transition-colors"
                  >
                    {t('informesStep1.quitar')}
                  </button>
                )}
              </div>
              <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-1">{t('informesStep1.escudoHint')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Derecha: selección de jugador ── */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
          <h2 className="text-sm font-semibold text-apple-gray-900 dark:text-white mb-3">{t('informesStep1.seleccionarJugador')}</h2>
          {!informe ? (
            <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">{t('informesStep1.subirArchivoProtagonista')}</p>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-apple-gray-100 dark:border-apple-gray-800 divide-y divide-apple-gray-100 dark:divide-apple-gray-800">
              {informe.modo === 'comparacion' && (
                <p className="px-3 py-2 text-xs text-apple-gray-400 dark:text-apple-gray-500 bg-apple-gray-50 dark:bg-apple-gray-800/40">
                  Marcá qué fila es cada jugador del cara a cara.
                </p>
              )}
              {informe.rows.map((row, idx) => {
                const isP1 = idx === informe.protagonistIndex
                const isP2 = informe.modo === 'comparacion' && (informe.comparePlayerIndices ?? [])[0] === idx
                return (
                  <div
                    key={idx}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 transition-colors ${
                      isP1 ? 'bg-brand-green/10' : isP2 ? 'bg-amber-400/10' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => { if (informe.modo !== 'comparacion') selectProtagonist(idx) }}
                      className="min-w-0 text-left flex-1"
                    >
                      <p className={`text-sm font-medium truncate ${isP1 ? 'text-brand-green' : isP2 ? 'text-amber-500' : 'text-apple-gray-900 dark:text-white'}`}>
                        {cellStr(row, cols?.nombre ?? null) || t('informesStep1.filaFallback').replace('{n}', String(idx + 1))}
                      </p>
                      <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">
                        {[cellStr(row, cols?.club ?? null), cellStr(row, cols?.posicion ?? null), cellStr(row, cols?.edad ?? null) && `${cellStr(row, cols?.edad ?? null)} ${t('externo.anios')}`]
                          .filter(Boolean).join(' · ')}
                      </p>
                    </button>
                    {informe.modo === 'comparacion' ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => selectComparisonRole(idx, 1)}
                          className={`w-7 h-7 rounded-full text-2xs font-bold flex items-center justify-center transition-colors ${
                            isP1 ? 'bg-brand-green text-white' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400 hover:text-brand-green'
                          }`}
                          aria-label="Marcar como Jugador 1"
                        >
                          1
                        </button>
                        <button
                          type="button"
                          onClick={() => selectComparisonRole(idx, 2)}
                          className={`w-7 h-7 rounded-full text-2xs font-bold flex items-center justify-center transition-colors ${
                            isP2 ? 'bg-amber-400 text-white' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400 hover:text-amber-500'
                          }`}
                          aria-label="Marcar como Jugador 2"
                        >
                          2
                        </button>
                      </div>
                    ) : isP1 && (
                      <svg className="w-4 h-4 text-brand-green flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
          <label className="block text-sm font-semibold text-apple-gray-900 dark:text-white mb-2">{t('informesStep1.buscarLabel')}</label>
          <div className="relative">
            <input
              type="text"
              disabled={!informe}
              value={dbQuery}
              onChange={e => setDbQuery(e.target.value)}
              placeholder={t('informesStep1.buscarPlaceholder')}
              className="w-full px-3 py-2.5 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-900 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green text-sm disabled:opacity-50"
            />
            {dbQuery.trim().length >= 2 && (
              <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                {dbLoading && (
                  <p className="px-4 py-3 text-xs text-apple-gray-500 dark:text-apple-gray-400">{t('informesStep1.buscando')}</p>
                )}
                {!dbLoading && dbPlayers.length === 0 && (
                  <p className="px-4 py-3 text-xs text-apple-gray-500 dark:text-apple-gray-400">{t('informesStep1.sinResultados')}</p>
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

          {dbApplied && (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-brand-green/30 bg-brand-green/5 px-3 py-2.5">
              <svg className="w-4 h-4 text-brand-green flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.7 7.7a1 1 0 00-1.4-1.4L11 12.6l-1.8-1.8a1 1 0 10-1.4 1.4l2.5 2.5a1 1 0 001.4 0l5-5z" clipRule="evenodd" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-brand-green">{t('informesStep1.datosCargadosDe').replace('{name}', dbApplied.name)}</p>
                <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
                  {dbApplied.parts.length ? dbApplied.parts.join(' · ') : t('informesStep1.sinDatosExtra')} · {t('informesStep1.verCompletoPaso3')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDbApplied(null)}
                className="text-apple-gray-400 hover:text-brand-green transition-colors flex-shrink-0"
                aria-label={t('informesStep1.cerrarAviso')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {informe?.modo === 'comparacion' && (
          <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
            <label className="block text-sm font-semibold text-apple-gray-900 dark:text-white mb-2">Buscar Jugador 2 en la base de datos</label>
            <div className="relative">
              <input
                type="text"
                value={dbQuery2}
                onChange={e => setDbQuery2(e.target.value)}
                placeholder={t('informesStep1.buscarPlaceholder')}
                className="w-full px-3 py-2.5 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-900 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green text-sm"
              />
              {dbQuery2.trim().length >= 2 && (
                <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                  {dbLoading2 && (
                    <p className="px-4 py-3 text-xs text-apple-gray-500 dark:text-apple-gray-400">{t('informesStep1.buscando')}</p>
                  )}
                  {!dbLoading2 && dbPlayers2.length === 0 && (
                    <p className="px-4 py-3 text-xs text-apple-gray-500 dark:text-apple-gray-400">{t('informesStep1.sinResultados')}</p>
                  )}
                  {!dbLoading2 && dbPlayers2.map(p => (
                    <button
                      key={p.id}
                      onMouseDown={() => selectDbPlayer2(p)}
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

            {dbApplied2 && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-2.5">
                <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.7 7.7a1 1 0 00-1.4-1.4L11 12.6l-1.8-1.8a1 1 0 10-1.4 1.4l2.5 2.5a1 1 0 001.4 0l5-5z" clipRule="evenodd" />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-amber-500">{t('informesStep1.datosCargadosDe').replace('{name}', dbApplied2.name)}</p>
                  <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
                    {dbApplied2.parts.length ? dbApplied2.parts.join(' · ') : t('informesStep1.sinDatosExtra')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDbApplied2(null)}
                  className="text-apple-gray-400 hover:text-amber-500 transition-colors flex-shrink-0"
                  aria-label={t('informesStep1.cerrarAviso')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={!informe}
          onClick={onNext}
          className="w-full px-4 py-3 rounded-xl bg-brand-green text-white text-sm font-semibold hover:bg-brand-green/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('informesWizard.siguiente')}
        </button>
      </div>
    </div>
  )
}
