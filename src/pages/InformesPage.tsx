import { useState, useMemo, useEffect } from 'react'
import Stepper from '@/features/informes/components/Stepper'
import Step1Archivo from '@/features/informes/components/Step1Archivo'
import Step2Metricas from '@/features/informes/components/Step2Metricas'
import Step3Contenido from '@/features/informes/components/Step3Contenido'
import Step4Preview from '@/features/informes/components/Step4Preview'
import InformesList from '@/features/informes/components/InformesList'
import type { ParsedFile, Informe, MetricStat } from '@/features/informes/types'
import { buildColumnMap } from '@/features/informes/metricRegistry'
import { buildMatrix, computeStats } from '@/features/informes/computeStats'
import { saveInforme, loadInforme } from '@/features/informes/informesStore'
import { getRowName } from '@/features/informes/chartData'

type View = 'list' | 'wizard'
type SaveFeedback = { type: 'success' | 'error'; message: string }

export default function InformesPage() {
  const [view, setView] = useState<View>('list')
  const [step, setStep] = useState(0)
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [informe, setInforme] = useState<Informe | null>(null)
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null)

  const derived = useMemo(() => {
    if (!parsed) return null
    const { columnMap, defs } = buildColumnMap(parsed.headers, parsed.rows)
    const { defs: allDefs, matrix } = buildMatrix(parsed, columnMap, defs)
    return { columnMap, defs: allDefs, matrix }
  }, [parsed])

  const stats: MetricStat[] = useMemo(() => {
    if (!parsed || !derived || !informe) return []
    return computeStats(derived.defs, derived.matrix, informe.protagonistIndex)
  }, [parsed, derived, informe])

  const comparePlayers = useMemo(() => {
    if (!informe) return []
    return informe.rows
      .map((_, idx) => idx)
      .filter(idx => idx !== informe.protagonistIndex)
      .map(idx => ({ idx, name: getRowName(informe, idx) }))
  }, [informe])

  // Confirmación/error transitorio de guardado: se limpia solo a los pocos segundos.
  useEffect(() => {
    if (!saveFeedback) return
    const timer = setTimeout(() => setSaveFeedback(null), 3000)
    return () => clearTimeout(timer)
  }, [saveFeedback])

  // No hay autosave: el informe vive en memoria mientras se edita y solo se persiste
  // en "Mis informes" cuando el usuario pulsa "Guardar" (handleSave). Así la lista contiene
  // únicamente los informes que el usuario eligió conservar para retomar más tarde.

  const handleSave = () => {
    if (!informe) return
    const now = new Date().toISOString()
    const toSave: Informe = { ...informe, createdAt: informe.createdAt || now, updatedAt: now }
    try {
      saveInforme(toSave)
      setInforme(toSave)
      setSaveFeedback({ type: 'success', message: 'Guardado ✓' })
    } catch (e) {
      setSaveFeedback({
        type: 'error',
        message: e instanceof Error ? e.message : 'No se pudo guardar el informe.',
      })
    }
  }

  const handleNew = () => {
    setParsed(null)
    setInforme(null)
    setStep(0)
    setSaveFeedback(null)
    setView('wizard')
  }

  const handleOpen = (id: string) => {
    const inf = loadInforme(id)
    if (!inf) return
    setInforme(inf)
    setParsed({ headers: inf.headers, rows: inf.rows })
    setStep(3)
    setSaveFeedback(null)
    setView('wizard')
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-apple-gray-900 dark:text-white tracking-tight">Informes</h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">
            Subí un archivo de métricas y armá un informe profesional del jugador.
          </p>
        </div>
        {view === 'wizard' && (
          <button
            type="button"
            onClick={() => setView('list')}
            className="px-4 py-2.5 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 text-sm font-semibold hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors flex-shrink-0"
          >
            ← Mis informes
          </button>
        )}
      </div>

      {view === 'list' ? (
        <InformesList onOpen={handleOpen} onNew={handleNew} />
      ) : (
        <>
          {saveFeedback && (
            <div
              className={`text-sm font-medium px-4 py-2.5 rounded-xl ${
                saveFeedback.type === 'success'
                  ? 'bg-brand-green/10 text-brand-green'
                  : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'
              }`}
            >
              {saveFeedback.message}
            </div>
          )}
          <Stepper step={step} setStep={setStep} />
          {step === 0 && (
            <Step1Archivo
              parsed={parsed}
              informe={informe}
              onParsed={(p, i) => { setParsed(p); setInforme(i) }}
              onChange={setInforme}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && informe && (
            <Step2Metricas
              stats={stats}
              charts={informe.charts}
              onChangeCharts={c => setInforme({ ...informe, charts: c })}
              players={comparePlayers}
              compareIndices={informe.comparePlayerIndices ?? []}
              onChangeCompare={idxs => setInforme({ ...informe, comparePlayerIndices: idxs })}
              matrix={derived?.matrix ?? {}}
              dbPlayerName={informe.dbPlayerName}
              evolutionCharts={informe.evolutionCharts ?? []}
              onChangeEvolutionCharts={keys => setInforme({ ...informe, evolutionCharts: keys })}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && informe && (
            <Step3Contenido
              content={informe.content}
              onChange={(c) => setInforme({ ...informe, content: c })}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && informe && derived && (
            <Step4Preview
              informe={informe}
              stats={stats}
              matrix={derived.matrix}
              defs={derived.defs}
              onBack={() => setStep(2)}
              onSave={handleSave}
              onChange={setInforme}
            />
          )}
        </>
      )}
    </div>
  )
}
