import { useEffect, useMemo, useState } from 'react'
import MatchContextForm from './MatchContextForm'
import { MINUTES_KEY } from '../parser/mapColumns'
import { saveGpsEntries } from '@/services/gpsService'
import { suggestFixture } from '../fixtureLookup'
import { EMPTY_MATCH_CONTEXT, type MatchContextValue, type GpsMetric, type GpsParseResult } from '../types'
import type { AgencyPlayer } from '@/constants/agencyPlayers'
import type { useGpsCatalog } from '../useGpsCatalog'

interface Props {
  result: GpsParseResult
  fileName: string
  metrics: GpsMetric[]
  roster: AgencyPlayer[]
  rivals: string[]
  competitions: string[]
  teams: string[]
  addMetric: ReturnType<typeof useGpsCatalog>['addMetric']
  learnAlias: ReturnType<typeof useGpsCatalog>['learnAlias']
  onSaved: () => Promise<void>
  onCancel: () => void
}

const IGNORE = '__ignorar__'

export default function ParseReviewPanel({
  result, fileName, metrics, roster, rivals, competitions, teams,
  addMetric, learnAlias, onSaved, onCancel,
}: Props) {
  // Contexto del partido: prefill con lo inferido, el equipo con el club del primer
  // jugador detectado (más confiable que el encabezado del PDF).
  const firstPlayer = result.players[0]?.candidates[0]
  const [context, setContext] = useState<MatchContextValue>({
    ...EMPTY_MATCH_CONTEXT,
    matchDate: result.context.matchDate ?? '',
    rival: result.context.rival ?? '',
    resultado: result.context.resultado ?? '',
    equipo: roster.find(p => p.fullName === firstPlayer)?.team ?? '',
  })

  // El informe trae rival y resultado pero no la fecha: se busca el partido en el
  // fixture del club del jugador y se completan fecha, competencia y minutos (sólo
  // los campos que siguen vacíos).
  useEffect(() => {
    const player = roster.find(p => p.fullName === firstPlayer)
    const { rival, resultado, matchDate } = result.context
    if (matchDate || !rival || !resultado || !player?.apiTeamId) return
    let alive = true
    suggestFixture({ teamId: player.apiTeamId, rival, resultado, player }).then(s => {
      if (!alive || !s) return
      setContext(prev => ({
        ...prev,
        matchDate: prev.matchDate || s.matchDate,
        competencia: prev.competencia || s.competencia || '',
        minutos: prev.minutos || (s.minutos != null ? String(s.minutos) : ''),
      }))
    }).catch(() => { /* sin sugerencia: se completa a mano */ })
    return () => { alive = false }
  }, [result, roster, firstPlayer])

  // Mapeo por índice de columna: key de métrica, MINUTES_KEY o IGNORE.
  const [mapping, setMapping] = useState<Record<number, string>>(() =>
    Object.fromEntries(result.columns.map(c => [c.index, c.metricKey ?? IGNORE])))

  // Selección y desambiguación por jugador detectado. Las filas sin match
  // (candidates: []) arrancan destildadas y sin asignar: el usuario decide si son de
  // la agencia y a quién corresponden.
  const [selected, setSelected] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(result.players.map((p, i) => [i, p.candidates.length > 0])))
  const [chosen, setChosen] = useState<Record<number, string>>(() =>
    Object.fromEntries(result.players.map((p, i) => [i, p.candidates[0] ?? ''])))

  const sortedRoster = useMemo(
    () => [...roster].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')),
    [roster],
  )

  const assign = (i: number, fullName: string) => {
    setChosen(prev => ({ ...prev, [i]: fullName }))
    setSelected(prev => ({ ...prev, [i]: fullName !== '' }))
  }

  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'conflict'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const unmappedCount = result.columns.filter(c => c.index > 0 && mapping[c.index] === IGNORE).length
  const selectedCount = Object.values(selected).filter(Boolean).length
  const canSave = selectedCount > 0 && Boolean(context.matchDate)

  const metricByKey = useMemo(() => new Map(metrics.map(m => [m.key, m])), [metrics])

  // Una fila sin match pasa a la lista de arriba en cuanto se le asigna un jugador.
  const resolvedIdx = result.players.map((_, i) => i).filter(i => chosen[i] !== '')
  const unresolvedIdx = result.players.map((_, i) => i).filter(i => chosen[i] === '')

  /**
   * El equipo se prefillea con el club que figura en el roster, que puede estar
   * desactualizado (un préstamo, por ejemplo). Si el PDF nombra otro equipo, se avisa
   * en vez de pisar el valor: el nombre del PDF suele venir abreviado.
   */
  const equipoMismatch = useMemo(() => {
    const fromPdf = result.context.teamText?.trim()
    if (!fromPdf || !context.equipo) return null
    const simplify = (s: string) => s.toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
    const pdf = simplify(fromPdf)
    const current = simplify(context.equipo)
    if (!pdf || pdf.includes(current) || current.includes(pdf)) return null
    // Comparte alguna palabra larga (Estudiantes, Gimnasia): se considera el mismo club.
    const words = fromPdf.split(/\s+/).filter(w => w.length >= 5).map(simplify)
    if (words.some(w => w && current.includes(w))) return null
    return fromPdf
  }, [result.context.teamText, context.equipo])

  const changeMapping = async (index: number, value: string) => {
    if (value === '__nueva__') {
      const header = result.columns[index].header
      const created = await addMetric({ label: header, unit: '', decimals: 0, category: 'otro' })
      if (created) setMapping(prev => ({ ...prev, [index]: created.key }))
      return
    }
    setMapping(prev => ({ ...prev, [index]: value }))
  }

  const save = async (replace = false) => {
    setSaving(true)
    setStatus(null)

    const entries = result.players.flatMap((p, i) => {
      if (!selected[i]) return []
      const metricsPayload: Record<string, number> = {}
      let minutos: number | null = context.minutos === '' ? null : Number(context.minutos)

      for (const col of result.columns) {
        if (col.index === 0) continue
        const target = mapping[col.index]
        const value = p.values[col.index]
        if (target === IGNORE || value === null || value === undefined) continue
        if (target === MINUTES_KEY) { minutos = value; continue }
        metricsPayload[target] = value
      }

      return [{
        playerName: chosen[i],
        matchDate: context.matchDate,
        equipo: context.equipo || null,
        rival: context.rival || null,
        competencia: context.competencia || null,
        resultado: context.resultado || null,
        minutos,
        metrics: metricsPayload,
        source: 'pdf' as const,
        fileName,
      }]
    })

    const saveResult = await saveGpsEntries(entries, { replace })

    // Lo que el usuario mapeó a mano queda aprendido para el próximo PDF igual.
    if (!saveResult.error) {
      const source = result.context.teamText ?? fileName
      await Promise.all(result.columns
        .filter(c => c.role === 'unmapped' && mapping[c.index] && mapping[c.index] !== IGNORE && mapping[c.index] !== MINUTES_KEY)
        .map(c => learnAlias(mapping[c.index], c.header, source)))
    }

    setSaving(false)

    if (saveResult.error) { setStatus({ kind: 'error', text: `No se pudo guardar: ${saveResult.error}` }); return }
    if (saveResult.conflicts.length > 0) {
      setStatus({ kind: 'conflict', text: `Ya hay cargas de ${saveResult.conflicts.join(', ')} para el ${context.matchDate}.` })
      return
    }
    setStatus({ kind: 'ok', text: `Se guardaron ${saveResult.saved} carga(s).` })
    await onSaved()
    onCancel()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-apple-gray-800 dark:text-white">Revisá antes de guardar</h2>
          <p className="text-xs text-apple-gray-400 truncate">{fileName}</p>
        </div>
        <button onClick={onCancel} className="shrink-0 text-sm text-apple-gray-500 underline">Elegir otro archivo</button>
      </div>

      <MatchContextForm
        value={context} onChange={setContext} hidePlayer
        roster={roster} rivals={rivals} competitions={competitions} teams={teams}
        equipoHint={equipoMismatch}
      />

      {/* ── Mapeo de columnas ── */}
      <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-5 shadow-apple dark:shadow-apple-dark">
        <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">Columnas del PDF</h3>
        <p className="text-xs text-apple-gray-400 mt-0.5 mb-4">
          {unmappedCount === 0
            ? 'Reconocí todas las columnas.'
            : `Faltan ${unmappedCount} por resolver. Lo que elijas queda aprendido para la próxima.`}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {result.columns.filter(c => c.index > 0).map(col => {
            const value = mapping[col.index]
            const known = col.role !== 'unmapped'
            return (
              <div key={col.index} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: known ? '#22C55E' : '#F59E0B' }} />
                <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300 w-32 shrink-0 truncate" title={col.header}>
                  {col.header}
                </span>
                <select
                  className="flex-1 min-w-0 px-2 py-2 rounded-apple border border-apple-gray-200 dark:border-apple-gray-600 bg-white dark:bg-apple-gray-700 text-sm"
                  value={value}
                  onChange={e => void changeMapping(col.index, e.target.value)}
                >
                  <option value={IGNORE}>Ignorar esta columna</option>
                  <option value={MINUTES_KEY}>Minutos jugados</option>
                  <option value="__nueva__">+ Crear métrica "{col.header}"</option>
                  {metrics.filter(m => m.is_active).map(m => (
                    <option key={m.key} value={m.key}>{m.label}{m.unit ? ` (${m.unit})` : ''}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Jugadores detectados ── */}
      <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-5 shadow-apple dark:shadow-apple-dark">
        <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">
          Jugadores Doble G en el archivo ({resolvedIdx.length})
        </h3>
        <p className="text-xs text-apple-gray-400 mt-0.5 mb-4">Destildá los que no quieras cargar.</p>

        {result.players.length === 0 && (
          <p className="text-sm text-apple-gray-500">No encontré ninguna tabla con nombres en este archivo.</p>
        )}

        <div className="space-y-3">
          {resolvedIdx.map(i => {
            const p = result.players[i]
            return (
              <div key={i} className="rounded-apple border border-apple-gray-100 dark:border-apple-gray-700 p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="checkbox" id={`p-${i}`} checked={selected[i]}
                    onChange={e => setSelected(prev => ({ ...prev, [i]: e.target.checked }))}
                    className="w-5 h-5 accent-brand-green"
                  />
                  <label htmlFor={`p-${i}`} className="text-sm font-medium text-apple-gray-800 dark:text-white">
                    {p.rawName}
                  </label>
                  {p.candidates.length === 1 ? (
                    <span className="text-xs text-apple-gray-500">→ {p.candidates[0]}</span>
                  ) : (
                    <select
                      className="px-2 py-1.5 rounded-apple border border-amber-400 bg-white dark:bg-apple-gray-700 text-xs"
                      value={chosen[i]}
                      onChange={e => setChosen(prev => ({ ...prev, [i]: e.target.value }))}
                    >
                      {p.candidates.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {result.columns.filter(c => c.index > 0).map(col => {
                    const target = mapping[col.index]
                    const value = p.values[col.index]
                    if (target === IGNORE || value === null || value === undefined) return null
                    const metric = metricByKey.get(target)
                    const name = target === MINUTES_KEY ? 'Minutos' : metric?.label ?? col.header
                    return (
                      <div key={col.index} className="rounded-apple bg-apple-gray-50 dark:bg-apple-gray-700/40 px-2.5 py-2">
                        <div className="text-2xs text-apple-gray-400 truncate" title={name}>{name}</div>
                        <div className="text-sm font-semibold text-apple-gray-800 dark:text-white tabular-nums">
                          {value}{metric?.unit ? <span className="text-2xs font-normal text-apple-gray-400 ml-0.5">{metric.unit}</span> : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Filas sin match: puede haber más jugadores Doble G que el matching no reconoció ── */}
      {unresolvedIdx.length > 0 && (
        <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-5 shadow-apple dark:shadow-apple-dark">
          <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">
            Otros nombres en la tabla ({unresolvedIdx.length})
          </h3>
          <p className="text-xs text-apple-gray-400 mt-0.5 mb-4">
            No los reconocí contra el roster. Si alguno es de la agencia, asignalo acá.
          </p>

          <div className="space-y-2">
            {unresolvedIdx.map(i => {
              const p = result.players[i]
              return (
                <div key={i} className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300 w-32 shrink-0 truncate" title={p.rawName}>
                    {p.rawName}
                  </span>
                  <select
                    className="px-2 py-1.5 rounded-apple border border-apple-gray-200 dark:border-apple-gray-600 bg-white dark:bg-apple-gray-700 text-xs"
                    value={chosen[i]}
                    onChange={e => assign(i, e.target.value)}
                  >
                    <option value="">No es de la agencia</option>
                    {sortedRoster.map(rp => <option key={rp.fullName} value={rp.fullName}>{rp.fullName}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {status && (
        <div className={`rounded-apple px-4 py-3 text-sm ${
          status.kind === 'ok' ? 'bg-brand-green/10 text-brand-green' : 'bg-red-500/10 text-red-500'
        }`}>
          <span>{status.text}</span>
          {status.kind === 'conflict' && (
            <button onClick={() => void save(true)} className="ml-3 underline font-medium">Reemplazar</button>
          )}
        </div>
      )}

      <div className="sticky bottom-20 sm:bottom-0 sm:static">
        <button
          onClick={() => void save(false)}
          disabled={!canSave || saving}
          className="w-full sm:w-auto px-6 py-3 rounded-apple bg-brand-green text-white font-medium disabled:opacity-40"
        >
          {saving ? 'Guardando…' : `Guardar ${selectedCount} carga(s)`}
        </button>
        {!context.matchDate && (
          <p className="text-xs text-apple-gray-400 mt-2">Completá la fecha del partido para poder guardar.</p>
        )}
      </div>
    </div>
  )
}
