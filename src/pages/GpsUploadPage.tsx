import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAgencyPlayers } from '@/services/agencyPlayersService'
import { useGpsCatalog } from '@/features/gps/useGpsCatalog'
import { fetchGpsEntries, saveGpsEntries, distinctValues } from '@/services/gpsService'
import MatchContextForm from '@/features/gps/components/MatchContextForm'
import MetricValueInputs from '@/features/gps/components/MetricValueInputs'
import GpsDropzone from '@/features/gps/components/GpsDropzone'
import ParseReviewPanel from '@/features/gps/components/ParseReviewPanel'
import RecentGpsUploads from '@/features/gps/components/RecentGpsUploads'
import MetricCatalogManager from '@/features/gps/components/MetricCatalogManager'
import { mergeCompetitions } from '@/features/gps/competitions'
import { parseGpsPdf, GpsParseError } from '@/features/gps/parser/parsePdf'
import { parseGpsXlsx } from '@/features/gps/parser/parseXlsx'
import pdfWorkerSrc from '@/lib/pdf/pdfWorker'
import { EMPTY_MATCH_CONTEXT, type MatchContextValue, type GpsEntryRow, type GpsParseResult } from '@/features/gps/types'
import HistoryReviewPanel from '@/features/gps/components/HistoryReviewPanel'
import { extractHtmlTable } from '@/features/gps/parser/extractHtmlTable'
import { buildHistoryTable } from '@/features/gps/parser/buildHistoryTable'
import type { HistoryParseResult } from '@/features/gps/types'
import { useLanguage } from '@/context/LanguageContext'

type Tab = 'auto' | 'historial' | 'manual'

export default function GpsUploadPage() {
  const { t } = useLanguage()
  const [tab, setTab] = useState<Tab>('auto')
  const { metrics, lookup, addMetric, learnAlias, reload: reloadCatalog, loading: catalogLoading } = useGpsCatalog()
  const [entries, setEntries] = useState<GpsEntryRow[]>([])

  const roster = useMemo(() => getAgencyPlayers(), [])
  const reloadEntries = useCallback(async () => setEntries(await fetchGpsEntries()), [])
  useEffect(() => { void reloadEntries() }, [reloadEntries])

  const rivals = useMemo(() => distinctValues(entries, 'rival'), [entries])
  const competitions = useMemo(
    () => mergeCompetitions(distinctValues(entries, 'competencia')),
    [entries],
  )
  const teams = useMemo(() => {
    const fromEntries = distinctValues(entries, 'equipo')
    const fromRoster = roster.map(p => p.team).filter(Boolean)
    return [...new Set([...fromEntries, ...fromRoster])].sort((a, b) => a.localeCompare(b, 'es'))
  }, [entries, roster])

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 sm:pb-10 space-y-5">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold text-apple-gray-800 dark:text-white">{t('gps.titulo')}</h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">
          {t('gps.subtitulo')}
        </p>
      </header>

      <div className="flex gap-1 bg-apple-gray-100 dark:bg-apple-gray-700/50 p-1 rounded-apple w-full sm:w-fit">
        {([['auto', t('gps.tabAutomatica')], ['historial', t('gps.tabHistorial')], ['manual', t('gps.tabManual')]] as const).map(([id, text]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === id
                ? 'bg-white dark:bg-apple-gray-800 text-apple-gray-800 dark:text-white shadow-apple dark:shadow-apple-dark'
                : 'text-apple-gray-500 dark:text-apple-gray-400'
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      {catalogLoading ? (
        <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-8 text-center text-sm text-apple-gray-400">
          {t('gps.cargandoMetricas')}
        </div>
      ) : tab === 'manual' ? (
        <ManualTab
          metrics={metrics}
          roster={roster}
          rivals={rivals}
          competitions={competitions}
          teams={teams}
          addMetric={addMetric}
          onSaved={reloadEntries}
        />
      ) : tab === 'historial' ? (
        <HistorialTab
          metrics={metrics} lookup={lookup} roster={roster}
          teams={teams} competitions={competitions}
          addMetric={addMetric} learnAlias={learnAlias} onSaved={reloadEntries}
        />
      ) : (
        <AutoTab
          metrics={metrics}
          lookup={lookup}
          roster={roster}
          rivals={rivals}
          competitions={competitions}
          teams={teams}
          addMetric={addMetric}
          learnAlias={learnAlias}
          onSaved={reloadEntries}
        />
      )}

      <RecentGpsUploads entries={entries} metrics={metrics} onChanged={reloadEntries} />
      {!catalogLoading && <MetricCatalogManager metrics={metrics} onChanged={reloadCatalog} />}
    </div>
  )
}

// ─── Pestaña manual ───────────────────────────────────────────────────────────

function ManualTab({ metrics, roster, rivals, competitions, teams, addMetric, onSaved }: {
  metrics: ReturnType<typeof useGpsCatalog>['metrics']
  roster: ReturnType<typeof getAgencyPlayers>
  rivals: string[]
  competitions: string[]
  teams: string[]
  addMetric: ReturnType<typeof useGpsCatalog>['addMetric']
  onSaved: () => Promise<void>
}) {
  const { t } = useLanguage()
  const [context, setContext] = useState<MatchContextValue>(EMPTY_MATCH_CONTEXT)
  const [values, setValues] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'conflict'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const canSave = Boolean(context.playerName && context.matchDate)

  const save = async (replace = false) => {
    setSaving(true)
    setStatus(null)

    const metricsPayload: Record<string, number> = {}
    for (const [key, raw] of Object.entries(values)) {
      const n = Number(String(raw).replace(',', '.'))
      if (raw !== '' && Number.isFinite(n)) metricsPayload[key] = n
    }

    const result = await saveGpsEntries([{
      playerName: context.playerName,
      matchDate: context.matchDate,
      equipo: context.equipo || null,
      rival: context.rival || null,
      competencia: context.competencia || null,
      resultado: context.resultado || null,
      minutos: context.minutos === '' ? null : Number(context.minutos),
      metrics: metricsPayload,
      source: 'manual',
    }], { replace })

    setSaving(false)

    if (result.error) { setStatus({ kind: 'error', text: t('gps.noSePudoGuardar').replace('{error}', result.error) }); return }
    if (result.conflicts.length > 0) {
      setStatus({ kind: 'conflict', text: t('gps.yaHayCarga').replace('{jugador}', result.conflicts[0]).replace('{fecha}', context.matchDate) })
      return
    }
    setStatus({ kind: 'ok', text: t('gps.guardado').replace('{jugador}', context.playerName).replace('{rival}', context.rival || t('gps.rivalSinCargar')) })
    setContext(EMPTY_MATCH_CONTEXT)
    setValues({})
    await onSaved()
  }

  return (
    <div className="space-y-4">
      <MatchContextForm
        value={context} onChange={setContext}
        roster={roster} rivals={rivals} competitions={competitions} teams={teams}
      />
      <MetricValueInputs metrics={metrics} values={values} onChange={setValues} onAddMetric={addMetric} />

      {status && (
        <div className={`rounded-apple px-4 py-3 text-sm ${
          status.kind === 'ok'
            ? 'bg-brand-green/10 text-brand-green'
            : 'bg-red-500/10 text-red-500'
        }`}>
          <span>{status.text}</span>
          {status.kind === 'conflict' && (
            <button onClick={() => void save(true)} className="ml-3 underline font-medium">
              {t('gps.reemplazarCarga')}
            </button>
          )}
        </div>
      )}

      <div className="sticky bottom-20 sm:bottom-0 sm:static">
        <button
          onClick={() => void save(false)}
          disabled={!canSave || saving}
          className="w-full sm:w-auto px-6 py-3 rounded-apple bg-brand-green text-white font-medium disabled:opacity-40"
        >
          {saving ? t('gps.guardando') : t('gps.guardarCarga')}
        </button>
        {!canSave && (
          <p className="text-xs text-apple-gray-400 mt-2">{t('gps.elegirJugadorFecha')}</p>
        )}
      </div>
    </div>
  )
}

// ─── Pestaña automática ───────────────────────────────────────────────────────

function AutoTab({ metrics, lookup, roster, rivals, competitions, teams, addMetric, learnAlias, onSaved }: {
  metrics: ReturnType<typeof useGpsCatalog>['metrics']
  lookup: ReturnType<typeof useGpsCatalog>['lookup']
  roster: ReturnType<typeof getAgencyPlayers>
  rivals: string[]
  competitions: string[]
  teams: string[]
  addMetric: ReturnType<typeof useGpsCatalog>['addMetric']
  learnAlias: ReturnType<typeof useGpsCatalog>['learnAlias']
  onSaved: () => Promise<void>
}) {
  const { t } = useLanguage()
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GpsParseResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [presetPlayer, setPresetPlayer] = useState('')

  const sortedRoster = useMemo(
    () => [...roster].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')),
    [roster],
  )

  const handleFile = async (file: File) => {
    setParsing(true)
    setError(null)
    setResult(null)
    try {
      const data = await file.arrayBuffer()
      const isExcel = /\.xlsx?$/i.test(file.name)
      const parsed = isExcel
        ? await parseGpsXlsx(data, { roster, lookup })
        : await parseGpsPdf(data, {
            roster, lookup, workerSrc: pdfWorkerSrc,
            presetPlayerName: presetPlayer || undefined,
          })
      setResult(parsed)
      setFileName(file.name)
    } catch (err) {
      setError(err instanceof GpsParseError
        ? err.message
        : t('gps.noPudeLeerArchivo').replace('{error}', (err as Error).message))
    } finally {
      setParsing(false)
    }
  }

  if (result) {
    return (
      <ParseReviewPanel
        result={result} fileName={fileName} metrics={metrics} roster={roster}
        rivals={rivals} competitions={competitions} teams={teams}
        addMetric={addMetric} learnAlias={learnAlias}
        onSaved={onSaved} onCancel={() => setResult(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-5 shadow-apple dark:shadow-apple-dark">
        <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1.5" htmlFor="gps-preset-jugador">
          {t('gps.dePlayerArchivo')}
        </label>
        <select
          id="gps-preset-jugador"
          className="w-full px-3 py-2.5 rounded-apple border border-apple-gray-200 dark:border-apple-gray-600 bg-white dark:bg-apple-gray-700 text-apple-gray-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40"
          value={presetPlayer}
          onChange={e => setPresetPlayer(e.target.value)}
        >
          <option value="">{t('gps.detectarAutomaticamente')}</option>
          {sortedRoster.map(p => (
            <option key={p.fullName} value={p.fullName}>{p.fullName}</option>
          ))}
        </select>
        <p className="text-2xs text-apple-gray-400 mt-1.5">
          {t('gps.necesarioReportesIndividuales')}
        </p>
      </div>

      <GpsDropzone
        onFile={file => void handleFile(file)}
        disabled={parsing}
        accept="application/pdf,.pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        label={t('gps.dropzoneAutoLabel')}
        hint={t('gps.dropzoneAutoHint')}
      />
      {error && (
        <div className="rounded-apple bg-red-500/10 text-red-500 px-4 py-3 text-sm">{error}</div>
      )}
    </div>
  )
}

// ─── Pestaña Historial ─────────────────────────────────────────────────────────

function HistorialTab({ metrics, lookup, roster, teams, competitions, addMetric, learnAlias, onSaved }: {
  metrics: ReturnType<typeof useGpsCatalog>['metrics']
  lookup: ReturnType<typeof useGpsCatalog>['lookup']
  roster: ReturnType<typeof getAgencyPlayers>
  teams: string[]
  competitions: string[]
  addMetric: ReturnType<typeof useGpsCatalog>['addMetric']
  learnAlias: ReturnType<typeof useGpsCatalog>['learnAlias']
  onSaved: () => Promise<void>
}) {
  const { t } = useLanguage()
  const [player, setPlayer] = useState('')
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<HistoryParseResult | null>(null)
  const [fileName, setFileName] = useState('')

  const sortedRoster = useMemo(
    () => [...roster].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')),
    [roster],
  )

  const handleFile = async (file: File) => {
    setParsing(true)
    setError(null)
    setResult(null)
    try {
      const html = await file.text()
      const table = extractHtmlTable(html)
      if (!table) throw new Error(t('gps.noEncontreTabla'))
      setResult(buildHistoryTable(table, lookup))
      setFileName(file.name)
    } catch (err) {
      setError(t('gps.noPudeLeerArchivo').replace('{error}', (err as Error).message))
    } finally {
      setParsing(false)
    }
  }

  if (result) {
    const selectedPlayer = roster.find(p => p.fullName === player)
    return (
      <HistoryReviewPanel
        result={result} playerName={player} fileName={fileName} metrics={metrics}
        teams={teams} competitions={competitions} defaultEquipo={selectedPlayer?.team ?? ''}
        addMetric={addMetric} learnAlias={learnAlias} onSaved={onSaved} onCancel={() => setResult(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-5 shadow-apple dark:shadow-apple-dark">
        <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1.5" htmlFor="gps-hist-jugador">
          {t('gps.dePlayerHistorial')}
        </label>
        <select
          id="gps-hist-jugador"
          className="w-full px-3 py-2.5 rounded-apple border border-apple-gray-200 dark:border-apple-gray-600 bg-white dark:bg-apple-gray-700 text-apple-gray-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40"
          value={player}
          onChange={e => setPlayer(e.target.value)}
        >
          <option value="">{t('gps.elegirJugador')}</option>
          {sortedRoster.map(p => <option key={p.fullName} value={p.fullName}>{p.fullName}</option>)}
        </select>
        <p className="text-2xs text-apple-gray-400 mt-1.5">
          {t('gps.paraArchivosConMuchosPartidos')}
        </p>
      </div>

      <GpsDropzone
        onFile={file => void handleFile(file)}
        disabled={parsing || !player}
        accept=".html,text/html"
        label={t('gps.dropzoneHistLabel')}
        hint={t('gps.dropzoneHistHint')}
      />
      {!player && <p className="text-xs text-apple-gray-400">{t('gps.elegirJugadorAntes')}</p>}
      {error && <div className="rounded-apple bg-red-500/10 text-red-500 px-4 py-3 text-sm">{error}</div>}
    </div>
  )
}
