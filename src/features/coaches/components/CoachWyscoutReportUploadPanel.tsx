import { useState } from 'react'
import GpsDropzone from '@/features/gps/components/GpsDropzone'
import { parseWyscoutReportPdf } from '@/features/coaches/wyscoutReport/parseWyscoutReportPdf'
import type { WyscoutReportData } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'
import { saveWyscoutReport } from '@/services/coachWyscoutReportService'
import type { AgencyCoach } from '@/constants/agencyCoaches'

export default function CoachWyscoutReportUploadPanel({
  coach,
  onSaved,
}: {
  coach: AgencyCoach
  onSaved: () => void
}) {
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ report: WyscoutReportData; warnings: string[]; file: File } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Finding I5 (revisión final del branch): separado del `error` de arriba
  // (que es de PARSEO, mostrado solo en la rama del dropzone) porque un
  // fallo de `handleSave` ocurre mientras el usuario está viendo la rama de
  // preview -- si se reusara `error` acá, nunca se mostraría (esa rama no lo
  // renderiza), dejando al usuario sin ninguna señal visible de que
  // "Guardar informe" falló (p.ej. porque la tabla de Supabase todavía no
  // existe hasta aplicar la migración a mano). Mismo patrón que el sibling
  // `CoachWyscoutUploadPanel`.
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    setParsing(true)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const { report, warnings } = await parseWyscoutReportPdf(buffer, {
        fileName: file.name,
        matchCountWindow: 10,
      })
      if (report.players.length === 0 && report.matches.length === 0) {
        setError('No se pudo leer el informe. Tiene que ser el PDF "Informe del equipo" de Wyscout.')
        return
      }
      setResult({ report, warnings, file })
    } catch {
      setError('No se pudo leer el archivo. Tiene que ser el PDF "Informe del equipo" de Wyscout.')
    } finally {
      setParsing(false)
    }
  }

  const handleSave = async () => {
    if (!result) return
    setSaving(true)
    setSaveError(null)
    try {
      const { success, error: saveErrorMessage } = await saveWyscoutReport(coach.key, result.report, result.warnings, result.file)
      if (!success) {
        setSaveError(saveErrorMessage ?? 'No se pudo guardar el informe.')
        return
      }
      setResult(null)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  if (!result) {
    return (
      <div className="space-y-3">
        {error && (
          <div className="rounded-apple-lg border border-brand-red/40 bg-brand-red/10 px-3 sm:px-4 py-2.5 text-sm text-brand-red">
            {error}
          </div>
        )}
        <GpsDropzone
          onFile={file => void handleFile(file)}
          disabled={parsing}
          accept="application/pdf,.pdf"
          label={parsing ? 'Leyendo el informe…' : 'Arrastrá el PDF "Informe del equipo" de Wyscout'}
          hint="Los últimos 10 partidos de Wyscout, en PDF."
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {saveError && (
        <div className="rounded-apple-lg border border-brand-red/40 bg-brand-red/10 px-3 sm:px-4 py-2.5 text-sm text-brand-red">
          {saveError}
        </div>
      )}
      <div className="bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 px-3 sm:px-4 py-3 text-sm">
        <p className="font-semibold text-apple-gray-800 dark:text-white">
          {result.report.matches.length} partidos · {result.report.players.length} jugadores · {result.report.formations.length} formaciones detectadas
        </p>
        {result.warnings.length > 0 && (
          <ul className="mt-2 text-xs text-amber-500 list-disc list-inside">
            {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="min-h-[40px] px-4 rounded-full bg-brand-green text-apple-gray-900 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar informe'}
        </button>
        <button
          type="button"
          onClick={() => setResult(null)}
          disabled={saving}
          className="text-sm text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
