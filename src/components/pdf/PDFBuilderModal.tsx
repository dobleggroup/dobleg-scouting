import { useState } from 'react'
import { usePDFBuilder, type PDFElement, type PDFTheme, PDF_TEMPLATES } from '@/context/PDFBuilderContext'
import { generateSmartReport } from '@/utils/smartPdfExport'

// ─── ELEMENT TYPE ICONS ───────────────────────────────────────────────────────

const TYPE_ICONS: Record<PDFElement['type'], JSX.Element> = {
  'player-card': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  'radar': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <circle cx="12" cy="12" r="9" strokeWidth={2} />
      <circle cx="12" cy="12" r="5" strokeWidth={2} />
      <line x1="12" y1="3" x2="12" y2="21" strokeWidth={2} />
    </svg>
  ),
  'scatter': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <circle cx="8" cy="8" r="2" strokeWidth={2} />
      <circle cx="16" cy="12" r="2" strokeWidth={2} />
      <circle cx="10" cy="16" r="2" strokeWidth={2} />
      <circle cx="18" cy="6" r="2" strokeWidth={2} />
    </svg>
  ),
  'table': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  'comparison': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
    </svg>
  ),
  'detector': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  'custom-chart': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
    </svg>
  ),
  'text': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  'section-header': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h10M7 16h10" />
    </svg>
  ),
  'metrics-table': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  'evolution-chart': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  'page-break': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16M4 6h16M4 18h16" />
    </svg>
  ),
}

const TYPE_LABELS: Record<PDFElement['type'], string> = {
  'player-card': 'Ficha de jugador',
  'radar': 'Grafico radar',
  'scatter': 'Grafico de dispersion',
  'table': 'Tabla',
  'comparison': 'Comparacion',
  'detector': 'Detector de talentos',
  'custom-chart': 'Grafico personalizado',
  'text': 'Texto',
  'section-header': 'Encabezado',
  'metrics-table': 'Tabla de metricas',
  'evolution-chart': 'Grafico de evolucion',
  'page-break': 'Salto de pagina',
}

const TEMPLATE_ICONS: Record<string, JSX.Element> = {
  bolt: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  user: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  document: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  sparkles: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
}

// ─── ELEMENT CARD ─────────────────────────────────────────────────────────────

function ElementCard({
  element,
  index,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  isFirst,
  isLast,
}: {
  element: PDFElement
  index: number
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const [showActions, setShowActions] = useState(false)

  return (
    <div
      className="group flex items-center gap-3 p-3 bg-apple-gray-50 dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 hover:border-brand-green/50 transition-all"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Order controls */}
      <div className="flex flex-col gap-0.5">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-1 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Mover arriba"
        >
          <svg className="w-3 h-3 text-apple-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="p-1 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Mover abajo"
        >
          <svg className="w-3 h-3 text-apple-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Index badge */}
      <div className="w-6 h-6 rounded-full bg-brand-green/20 text-brand-green flex items-center justify-center text-xs font-bold flex-shrink-0">
        {index + 1}
      </div>

      {/* Thumbnail or icon */}
      {element.thumbnail ? (
        <img src={element.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover bg-white dark:bg-apple-gray-900 flex-shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-apple-gray-200 dark:bg-apple-gray-700 flex items-center justify-center text-apple-gray-500 flex-shrink-0">
          {TYPE_ICONS[element.type]}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">
          {element.title}
        </p>
        <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">
          {TYPE_LABELS[element.type]} • {element.source}
        </p>
      </div>

      {/* Actions */}
      <div className={`flex gap-1 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0'}`}>
        <button
          onClick={onDuplicate}
          className="p-1.5 rounded-lg hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 text-apple-gray-500 hover:text-brand-green transition-colors"
          title="Duplicar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
        <button
          onClick={onRemove}
          className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-apple-gray-500 hover:text-red-500 transition-colors"
          title="Eliminar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── THEME OPTION ─────────────────────────────────────────────────────────────

function ThemeOption({
  theme,
  selected,
  onClick,
  label,
  description,
}: {
  theme: PDFTheme
  selected: boolean
  onClick: () => void
  label: string
  description: string
}) {
  return (
    <button
      onClick={onClick}
      className={`relative p-3 rounded-xl border-2 transition-all text-left ${
        selected
          ? 'border-brand-green bg-brand-green/5'
          : 'border-apple-gray-200 dark:border-apple-gray-700 hover:border-apple-gray-300 dark:hover:border-apple-gray-600'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-14 rounded-lg overflow-hidden flex-shrink-0 ${
          theme === 'light'
            ? 'bg-white border border-apple-gray-200'
            : 'bg-apple-gray-800 border border-apple-gray-700'
        }`}>
          <div className="h-1 bg-brand-green" />
          <div className="p-1.5">
            <div className={`h-1 w-5 rounded mb-1 ${theme === 'light' ? 'bg-apple-gray-300' : 'bg-apple-gray-600'}`} />
            <div className={`h-0.5 w-3 rounded mb-1 ${theme === 'light' ? 'bg-apple-gray-200' : 'bg-apple-gray-700'}`} />
            <div className={`h-2 w-full rounded ${theme === 'light' ? 'bg-apple-gray-100' : 'bg-apple-gray-700'}`} />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-apple-gray-800 dark:text-white">{label}</p>
          <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">{description}</p>
        </div>
      </div>
      {selected && (
        <div className="absolute top-2 right-2 w-4 h-4 bg-brand-green rounded-full flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  )
}

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────

export default function PDFBuilderModal() {
  const {
    state,
    isBuilderOpen,
    closeBuilder,
    removeElement,
    clearElements,
    reorderElements,
    duplicateElement,
    setTheme,
    setReportTitle,
    setReportSubtitle,
    setIncludeDate,
    setIncludeLogo,
    setIncludeCover,
    setIncludePageNumbers,
    setAuthorName,
    applyTemplate,
    addElement,
  } = usePDFBuilder()

  const [activeTab, setActiveTab] = useState<'elements' | 'settings' | 'templates'>('elements')
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState('')
  const [exportPercent, setExportPercent] = useState(0)

  if (!isBuilderOpen) return null

  const handleExport = async () => {
    if (state.elements.length === 0) return

    setExporting(true)
    setExportProgress('Preparando informe...')
    setExportPercent(0)

    try {
      await generateSmartReport({
        elements: state.elements,
        theme: state.theme,
        title: state.reportTitle,
        subtitle: state.reportSubtitle,
        includeDate: state.includeDate,
        includeLogo: state.includeLogo,
        includeCover: state.includeCover,
        includeTableOfContents: false,
        includePageNumbers: state.includePageNumbers,
        authorName: state.authorName,
        onProgress: (msg, percent) => {
          setExportProgress(msg)
          setExportPercent(percent)
        },
      })
      setExportProgress('Listo!')
      setExportPercent(100)
      setTimeout(() => {
        setExporting(false)
        setExportProgress('')
        setExportPercent(0)
        closeBuilder()
      }, 1200)
    } catch (error) {
      console.error('[PDF Builder] Export error:', error)
      setExportProgress('Error al generar el PDF')
      setTimeout(() => {
        setExporting(false)
        setExportProgress('')
        setExportPercent(0)
      }, 2000)
    }
  }

  const handleAddPageBreak = () => {
    addElement({
      type: 'page-break',
      title: 'Salto de pagina',
      source: 'Constructor PDF',
    })
  }

  const handleAddText = () => {
    const title = prompt('Titulo de la seccion:')
    if (!title) return
    const description = prompt('Texto (opcional):')
    addElement({
      type: 'section-header',
      title,
      description: description || undefined,
      source: 'Constructor PDF',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeBuilder}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-apple-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-gradient-to-r from-brand-green/10 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-green/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-apple-gray-800 dark:text-white">
                  Constructor de Informes PDF
                </h2>
                <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
                  {state.elements.length} elemento{state.elements.length !== 1 ? 's' : ''} • {state.theme === 'light' ? 'Modo claro' : 'Modo oscuro'}
                </p>
              </div>
            </div>
            <button
              onClick={closeBuilder}
              className="p-2 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors"
            >
              <svg className="w-5 h-5 text-apple-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-apple-gray-200 dark:border-apple-gray-700 px-6">
          {[
            { id: 'elements', label: 'Contenido', count: state.elements.length },
            { id: 'settings', label: 'Configuracion' },
            { id: 'templates', label: 'Plantillas' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-green text-brand-green'
                  : 'border-transparent text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-brand-green/20 text-brand-green text-xs rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ELEMENTS TAB */}
          {activeTab === 'elements' && (
            <>
              {/* Quick actions */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2">
                  <button
                    onClick={handleAddText}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Agregar texto
                  </button>
                  <button
                    onClick={handleAddPageBreak}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16" />
                    </svg>
                    Salto de pagina
                  </button>
                </div>
                {state.elements.length > 0 && (
                  <button
                    onClick={clearElements}
                    className="text-xs text-red-500 hover:text-red-600 hover:underline"
                  >
                    Limpiar todo
                  </button>
                )}
              </div>

              {/* Elements list */}
              {state.elements.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-apple-gray-100 dark:bg-apple-gray-800 flex items-center justify-center">
                    <svg className="w-10 h-10 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-2">
                    Tu informe esta vacio
                  </h3>
                  <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 max-w-sm mx-auto mb-6">
                    Navega por la app y usa el boton <span className="text-brand-green font-medium">+ Agregar al informe</span> para incluir graficos, tablas o fichas de jugadores.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 text-xs text-apple-gray-400">
                    <span className="px-2 py-1 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg">Dispersion</span>
                    <span className="px-2 py-1 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg">Detector</span>
                    <span className="px-2 py-1 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg">Comparacion</span>
                    <span className="px-2 py-1 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg">Fichas</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {state.elements.map((element, index) => (
                    <ElementCard
                      key={element.id}
                      element={element}
                      index={index}
                      onRemove={() => removeElement(element.id)}
                      onMoveUp={() => index > 0 && reorderElements(index, index - 1)}
                      onMoveDown={() => index < state.elements.length - 1 && reorderElements(index, index + 1)}
                      onDuplicate={() => duplicateElement(element.id)}
                      isFirst={index === 0}
                      isLast={index === state.elements.length - 1}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Title & subtitle */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-400 mb-1.5 block">
                    Titulo del informe
                  </label>
                  <input
                    type="text"
                    value={state.reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm text-apple-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-green/50"
                    placeholder="Titulo del informe"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-400 mb-1.5 block">
                    Subtitulo
                  </label>
                  <input
                    type="text"
                    value={state.reportSubtitle}
                    onChange={(e) => setReportSubtitle(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm text-apple-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-green/50"
                    placeholder="Subtitulo"
                  />
                </div>
              </div>

              {/* Author */}
              <div>
                <label className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-400 mb-1.5 block">
                  Autor (opcional)
                </label>
                <input
                  type="text"
                  value={state.authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm text-apple-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-green/50"
                  placeholder="Nombre del scout / analista"
                />
              </div>

              {/* Theme selector */}
              <div>
                <label className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-400 mb-2 block">
                  Estilo del PDF
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <ThemeOption
                    theme="light"
                    selected={state.theme === 'light'}
                    onClick={() => setTheme('light')}
                    label="Modo Claro"
                    description="Ideal para imprimir"
                  />
                  <ThemeOption
                    theme="dark"
                    selected={state.theme === 'dark'}
                    onClick={() => setTheme('dark')}
                    label="Modo Oscuro"
                    description="Ideal para enviar online"
                  />
                </div>
              </div>

              {/* Options */}
              <div>
                <label className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-400 mb-3 block">
                  Opciones del documento
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'includeCover', label: 'Portada', checked: state.includeCover, onChange: setIncludeCover },
                    { key: 'includeLogo', label: 'Logo de marca', checked: state.includeLogo, onChange: setIncludeLogo },
                    { key: 'includeDate', label: 'Fecha', checked: state.includeDate, onChange: setIncludeDate },
                    { key: 'includePageNumbers', label: 'Numeracion', checked: state.includePageNumbers, onChange: setIncludePageNumbers },
                  ].map(option => (
                    <label
                      key={option.key}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        option.checked
                          ? 'border-brand-green/50 bg-brand-green/5'
                          : 'border-apple-gray-200 dark:border-apple-gray-700 hover:border-apple-gray-300 dark:hover:border-apple-gray-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={option.checked}
                        onChange={(e) => option.onChange(e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                        option.checked
                          ? 'bg-brand-green border-brand-green'
                          : 'border-apple-gray-300 dark:border-apple-gray-600'
                      }`}>
                        {option.checked && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TEMPLATES TAB */}
          {activeTab === 'templates' && (
            <div className="space-y-4">
              <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
                Las plantillas ajustan la configuracion del informe para diferentes casos de uso.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PDF_TEMPLATES.map(template => (
                  <button
                    key={template.id}
                    onClick={() => {
                      applyTemplate(template.id)
                      setActiveTab('settings')
                    }}
                    className="flex items-start gap-3 p-4 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 hover:border-brand-green/50 hover:bg-brand-green/5 transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 flex items-center justify-center text-apple-gray-500 dark:text-apple-gray-400 flex-shrink-0">
                      {TEMPLATE_ICONS[template.icon]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-apple-gray-800 dark:text-white">
                        {template.name}
                      </p>
                      <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
                        {template.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800/50">
          {exporting ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-apple-gray-600 dark:text-apple-gray-400">{exportProgress}</span>
                <span className="text-brand-green font-medium">{exportPercent}%</span>
              </div>
              <div className="w-full h-2 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-green transition-all duration-300"
                  style={{ width: `${exportPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={closeBuilder}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 bg-apple-gray-200 dark:bg-apple-gray-700 hover:bg-apple-gray-300 dark:hover:bg-apple-gray-600 transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={handleExport}
                disabled={state.elements.length === 0}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-black bg-brand-green hover:bg-green-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Generar PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
