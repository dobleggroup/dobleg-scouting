import { useState, useEffect } from 'react'
import type { EnrichedPlayer } from '@/types'

interface ExportSection {
  id: string
  label: string
  description: string
  available: boolean
  default: boolean
}

interface ExportPDFModalProps {
  isOpen: boolean
  onClose: () => void
  onExport: (sections: string[]) => Promise<void>
  player: EnrichedPlayer
  source: 'externo' | 'interno' | 'seguimiento'
  availableEvolutionCharts?: string[]
  selectedEvolutionCharts?: string[]
}

export default function ExportPDFModal({
  isOpen,
  onClose,
  onExport,
  player,
  source,
  availableEvolutionCharts = [],
  selectedEvolutionCharts = [],
}: ExportPDFModalProps) {
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set())
  const [selectedCharts, setSelectedCharts] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState('')

  // Define available sections based on source
  const sections: ExportSection[] = [
    {
      id: 'header',
      label: 'Ficha del Jugador',
      description: 'Foto, nombre, equipo, edad, posición y Score GG',
      available: true,
      default: true,
    },
    {
      id: 'general',
      label: 'Información General',
      description: 'Datos personales, contrato y resumen',
      available: true,
      default: true,
    },
    {
      id: 'radar',
      label: 'Gráfico Radar',
      description: 'Comparación visual de métricas vs promedio',
      available: true,
      default: true,
    },
    {
      id: 'valor',
      label: 'Valor de Mercado',
      description: 'Evolución histórica del valor según Transfermarkt',
      available: source === 'interno',
      default: source === 'interno',
    },
    {
      id: 'evolution',
      label: 'Gráficos de Evolución',
      description: 'Métricas por partido a lo largo del tiempo',
      available: source === 'interno' && selectedEvolutionCharts.length > 0,
      default: false,
    },
    {
      id: 'metrics',
      label: 'Métricas Detalladas',
      description: 'Todas las estadísticas con percentiles',
      available: true,
      default: false,
    },
    {
      id: 'scout',
      label: 'Evaluación Scout',
      description: 'Puntuaciones subjetivas del scout',
      available: source === 'interno',
      default: source === 'interno',
    },
  ]

  // Initialize selections when modal opens
  useEffect(() => {
    if (isOpen) {
      const defaults = new Set(sections.filter(s => s.available && s.default).map(s => s.id))
      setSelectedSections(defaults)
      setSelectedCharts(new Set(selectedEvolutionCharts))
    }
  }, [isOpen, source])

  const toggleSection = (id: string) => {
    const newSet = new Set(selectedSections)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedSections(newSet)
  }

  const toggleChart = (chart: string) => {
    const newSet = new Set(selectedCharts)
    if (newSet.has(chart)) {
      newSet.delete(chart)
    } else {
      newSet.add(chart)
    }
    setSelectedCharts(newSet)
  }

  const selectAll = () => {
    const all = new Set(sections.filter(s => s.available).map(s => s.id))
    setSelectedSections(all)
    setSelectedCharts(new Set(selectedEvolutionCharts))
  }

  const selectNone = () => {
    setSelectedSections(new Set(['header'])) // Always keep header
    setSelectedCharts(new Set())
  }

  const handleExport = async () => {
    if (selectedSections.size === 0) return

    setExporting(true)
    setExportProgress('Preparando exportación...')

    try {
      // Build export config
      const sectionsToExport = [...selectedSections]
      if (selectedSections.has('evolution') && selectedCharts.size > 0) {
        sectionsToExport.push(...[...selectedCharts].map(c => `chart:${c}`))
      }

      await onExport(sectionsToExport)
      setExportProgress('¡Exportación completada!')
      setTimeout(() => {
        onClose()
        setExporting(false)
        setExportProgress('')
      }, 1000)
    } catch (error) {
      setExportProgress('Error en la exportación')
      setExporting(false)
    }
  }

  if (!isOpen) return null

  const availableSections = sections.filter(s => s.available)
  const selectedCount = selectedSections.size

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-6 py-5 border-b border-apple-gray-200 dark:border-apple-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-apple-gray-800 dark:text-white">
                Exportar a PDF
              </h2>
              <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
                {player.Jugador}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
            >
              <svg className="w-5 h-5 text-apple-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          {/* Quick actions */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
              {selectedCount} sección{selectedCount !== 1 ? 'es' : ''} seleccionada{selectedCount !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="text-xs text-brand-green hover:underline"
              >
                Seleccionar todo
              </button>
              <span className="text-apple-gray-300 dark:text-apple-gray-600">|</span>
              <button
                onClick={selectNone}
                className="text-xs text-apple-gray-500 hover:underline"
              >
                Mínimo
              </button>
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-2">
            {availableSections.map(section => (
              <div key={section.id}>
                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedSections.has(section.id)
                      ? 'border-brand-green bg-brand-green/5'
                      : 'border-apple-gray-200 dark:border-apple-gray-700 hover:border-apple-gray-300 dark:hover:border-apple-gray-600'
                  }`}
                >
                  <div className="pt-0.5">
                    <div
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                        selectedSections.has(section.id)
                          ? 'bg-brand-green border-brand-green'
                          : 'border-apple-gray-300 dark:border-apple-gray-600'
                      }`}
                    >
                      {selectedSections.has(section.id) && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <input
                      type="checkbox"
                      checked={selectedSections.has(section.id)}
                      onChange={() => toggleSection(section.id)}
                      className="sr-only"
                    />
                    <p className="text-sm font-medium text-apple-gray-800 dark:text-white">
                      {section.label}
                    </p>
                    <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
                      {section.description}
                    </p>
                  </div>
                </label>

                {/* Evolution charts sub-options */}
                {section.id === 'evolution' && selectedSections.has('evolution') && selectedEvolutionCharts.length > 0 && (
                  <div className="ml-8 mt-2 p-3 bg-apple-gray-50 dark:bg-apple-gray-900/50 rounded-lg">
                    <p className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-400 mb-2">
                      Gráficos a incluir:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedEvolutionCharts.map(chart => (
                        <button
                          key={chart}
                          onClick={() => toggleChart(chart)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            selectedCharts.has(chart)
                              ? 'bg-brand-green text-black'
                              : 'bg-white dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 border border-apple-gray-200 dark:border-apple-gray-700'
                          }`}
                        >
                          {chart}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-900/50">
          {exporting ? (
            <div className="flex items-center justify-center gap-3 py-2">
              <div className="w-5 h-5 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-apple-gray-600 dark:text-apple-gray-400">
                {exportProgress}
              </span>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 bg-apple-gray-200 dark:bg-apple-gray-700 hover:bg-apple-gray-300 dark:hover:bg-apple-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleExport}
                disabled={selectedCount === 0}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-black bg-brand-green hover:bg-green-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Exportar PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
