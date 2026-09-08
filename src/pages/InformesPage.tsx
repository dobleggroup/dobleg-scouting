import { useState, useMemo, useEffect } from 'react'
import { useLanguage } from '@/context/LanguageContext'
import Stepper from '@/features/informes/components/Stepper'
import Step1Archivo from '@/features/informes/components/Step1Archivo'
import Step2Metricas from '@/features/informes/components/Step2Metricas'
import Step3Contenido from '@/features/informes/components/Step3Contenido'
import Step4Preview from '@/features/informes/components/Step4Preview'
import ComparisonMetricsStep from '@/features/informes/components/ComparisonMetricsStep'
import ComparisonPreview from '@/features/informes/components/ComparisonPreview'
import InformesList from '@/features/informes/components/InformesList'
import InformeDTWizard from '@/features/informesDT/components/InformeDTWizard'
import type { ParsedFile, Informe, MetricStat } from '@/features/informes/types'
import { buildColumnMap } from '@/features/informes/metricRegistry'
import { buildMatrix, computeStats } from '@/features/informes/computeStats'
import { saveInforme, loadInforme } from '@/features/informes/informesStore'
import { getRowName } from '@/features/informes/chartData'

type View = 'list' | 'wizard'
type SaveFeedback = { type: 'success' | 'error'; message: string }

// Los 3 tipos de informe se presentan como opciones del mismo peso — ninguna es
// "la" default, cada una arma un producto distinto (jugador vs promedio, 1v1, DT).
function NewReportCard({ accent, title, description, onClick }: {
  accent: string
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-4 hover:border-brand-green/40 hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${accent}`} />
        <span className="text-sm font-semibold text-apple-gray-900 dark:text-white">{title}</span>
      </div>
      <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 leading-snug">{description}</p>
    </button>
  )
}

export default function InformesPage() {
  const { t } = useLanguage()
  const [view, setView] = useState<View>('list')
  const [tipoWizard, setTipoWizard] = useState<'jugador' | 'dt' | 'comparacion' | null>(null)
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
      setSaveFeedback({ type: 'success', message: t('informes.guardadoOk') })
    } catch (e) {
      setSaveFeedback({
        type: 'error',
        message: e instanceof Error ? e.message : t('informes.noSePudoGuardar'),
      })
    }
  }

  const handleNew = () => {
    setParsed(null)
    setInforme(null)
    setStep(0)
    setSaveFeedback(null)
    setTipoWizard('jugador')
    setView('wizard')
  }

  const handleNewDT = () => {
    setTipoWizard('dt')
    setView('wizard')
  }

  const handleNewComparacion = () => {
    setParsed(null)
    setInforme(null)
    setStep(0)
    setSaveFeedback(null)
    setTipoWizard('comparacion')
    setView('wizard')
  }

  const handleOpen = (id: string) => {
    const inf = loadInforme(id)
    if (!inf) return
    setInforme(inf)
    setParsed({ headers: inf.headers, rows: inf.rows })
    setStep(3)
    setSaveFeedback(null)
    setTipoWizard('jugador')
    setView('wizard')
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-apple-gray-900 dark:text-white tracking-tight">{t('informes.titulo')}</h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">
            {t('informes.subtitulo')}
          </p>
        </div>
        {view === 'wizard' && (
          <button
            type="button"
            onClick={() => { setView('list'); setTipoWizard(null) }}
            className="px-4 py-2.5 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 text-sm font-semibold hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors flex-shrink-0"
          >
            ← {t('informes.misInformes')}
          </button>
        )}
      </div>

      {view === 'list' ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wide mb-3">
              Nuevo informe
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NewReportCard
                accent="bg-brand-green"
                title="Informe vs Promedios"
                description="Un jugador contra el promedio de su liga o posición."
                onClick={handleNew}
              />
              <NewReportCard
                accent="bg-amber-400"
                title="Comparación 1v1"
                description="Cara a cara entre dos jugadores, con radar y tabla de métricas."
                onClick={handleNewComparacion}
              />
              <NewReportCard
                accent="bg-sky-400"
                title="Informe de DT"
                description="Análisis de un entrenador y su equipo."
                onClick={handleNewDT}
              />
            </div>
          </div>
          <InformesList onOpen={handleOpen} />
        </div>
      ) : tipoWizard === 'dt' ? (
        <InformeDTWizard onExit={() => { setView('list'); setTipoWizard(null) }} />
      ) : tipoWizard === 'comparacion' ? (
        <>
          {step === 0 && (
            <Step1Archivo
              parsed={parsed}
              informe={informe}
              mode="comparacion"
              onParsed={(p, i) => { setParsed(p); setInforme(i) }}
              onChange={setInforme}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && informe && derived && (
            <ComparisonMetricsStep
              defs={derived.defs}
              matrix={derived.matrix}
              idxA={informe.protagonistIndex}
              idxB={(informe.comparePlayerIndices ?? [])[0] ?? -1}
              nameA={getRowName(informe, informe.protagonistIndex) || informe.content.nombre}
              nameB={(informe.comparePlayerIndices ?? [])[0] != null ? getRowName(informe, informe.comparePlayerIndices![0]) : (informe.comparisonB?.nombre ?? '')}
              selected={informe.comparisonMetrics ?? []}
              onChangeSelected={keys => setInforme({ ...informe, comparisonMetrics: keys })}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && informe && derived && (
            <ComparisonPreview
              informe={informe}
              defs={derived.defs}
              matrix={derived.matrix}
              onBack={() => setStep(1)}
              onSave={handleSave}
            />
          )}
        </>
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
              posicion={informe.content.posicion}
              compareLeague={informe.compareLeague ?? ''}
              compareMetrics={informe.compareMetrics ?? []}
              onChangeCompareLeague={v => setInforme({ ...informe, compareLeague: v })}
              onChangeCompareMetrics={keys => setInforme({ ...informe, compareMetrics: keys })}
              dbPlayerName={informe.dbPlayerName}
              evolutionCharts={informe.evolutionCharts ?? []}
              onChangeEvolutionCharts={keys => setInforme({ ...informe, evolutionCharts: keys })}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && informe && (
            <Step3Contenido
              informe={informe}
              content={informe.content}
              onChange={(c) => setInforme({ ...informe, content: c })}
              onChangeInforme={setInforme}
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
