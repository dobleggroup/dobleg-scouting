import { useState, useMemo } from 'react'
import Stepper from '@/features/informes/components/Stepper'
import Step1Archivo from '@/features/informes/components/Step1Archivo'
import Step2Metricas from '@/features/informes/components/Step2Metricas'
import Step3Contenido from '@/features/informes/components/Step3Contenido'
import Step4Preview from '@/features/informes/components/Step4Preview'
import type { ParsedFile, Informe, MetricStat } from '@/features/informes/types'
import { buildColumnMap } from '@/features/informes/metricRegistry'
import { buildMatrix, computeStats } from '@/features/informes/computeStats'

export default function InformesPage() {
  const [step, setStep] = useState(0)
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [informe, setInforme] = useState<Informe | null>(null)

  const updateInforme = (patch: Partial<Informe>) => {
    setInforme(prev => (prev ? { ...prev, ...patch } : prev))
  }

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

  const handleSave = () => { console.log('save', informe) }
  const handleExport = () => { console.log('export') }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-apple-gray-900 dark:text-white tracking-tight">Informes</h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">
          Subí un archivo de métricas y armá un informe profesional del jugador.
        </p>
      </div>
      <Stepper step={step} setStep={setStep} />
      {/* Pasos: se completan en Tasks 8-11 */}
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
          onExport={handleExport}
        />
      )}
    </div>
  )
}
