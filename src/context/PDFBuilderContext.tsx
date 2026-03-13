import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type PDFTheme = 'light' | 'dark'

export type PDFElementType =
  | 'player-card'
  | 'radar'
  | 'scatter'
  | 'table'
  | 'comparison'
  | 'detector'
  | 'custom-chart'
  | 'text'
  | 'section-header'
  | 'metrics-table'
  | 'evolution-chart'
  | 'page-break'

export interface PDFElement {
  id: string
  type: PDFElementType
  title: string
  description?: string
  captureId?: string // DOM element ID to capture
  data?: unknown // Any associated data
  thumbnail?: string // Base64 preview
  createdAt: Date
  source: string // Page where it was added from
  size?: 'small' | 'medium' | 'large' | 'full' // Layout size hint
  players?: string[] // Player names for context
}

// Template presets for quick report creation
export interface PDFTemplate {
  id: string
  name: string
  description: string
  icon: string
  sections: Array<{
    type: PDFElementType
    autoCapture?: boolean
    captureSelector?: string
  }>
}

export interface PDFBuilderState {
  elements: PDFElement[]
  theme: PDFTheme
  reportTitle: string
  reportSubtitle: string
  includeDate: boolean
  includeLogo: boolean
  includeCover: boolean
  includeTableOfContents: boolean
  includePageNumbers: boolean
  authorName: string
}

// Predefined templates
export const PDF_TEMPLATES: PDFTemplate[] = [
  {
    id: 'quick-report',
    name: 'Informe Rapido',
    description: 'Exporta los elementos seleccionados directamente',
    icon: 'bolt',
    sections: [],
  },
  {
    id: 'player-analysis',
    name: 'Analisis de Jugador',
    description: 'Ficha completa con radar, metricas y evolucion',
    icon: 'user',
    sections: [
      { type: 'player-card' },
      { type: 'radar' },
      { type: 'metrics-table' },
      { type: 'evolution-chart' },
    ],
  },
  {
    id: 'scouting-report',
    name: 'Informe Scout Completo',
    description: 'Reporte profesional con todos los elementos',
    icon: 'document',
    sections: [
      { type: 'section-header' },
      { type: 'player-card' },
      { type: 'radar' },
      { type: 'comparison' },
      { type: 'scatter' },
      { type: 'detector' },
    ],
  },
  {
    id: 'talent-detection',
    name: 'Deteccion de Talentos',
    description: 'Analisis de oportunidades y jugadores destacados',
    icon: 'sparkles',
    sections: [
      { type: 'detector' },
      { type: 'scatter' },
      { type: 'table' },
    ],
  },
]

interface PDFBuilderContextType {
  state: PDFBuilderState
  // Element management
  addElement: (element: Omit<PDFElement, 'id' | 'createdAt'>) => void
  removeElement: (id: string) => void
  clearElements: () => void
  reorderElements: (fromIndex: number, toIndex: number) => void
  updateElement: (id: string, updates: Partial<PDFElement>) => void
  duplicateElement: (id: string) => void
  // Settings
  setTheme: (theme: PDFTheme) => void
  setReportTitle: (title: string) => void
  setReportSubtitle: (subtitle: string) => void
  setIncludeDate: (include: boolean) => void
  setIncludeLogo: (include: boolean) => void
  setIncludeCover: (include: boolean) => void
  setIncludeTableOfContents: (include: boolean) => void
  setIncludePageNumbers: (include: boolean) => void
  setAuthorName: (name: string) => void
  // Templates
  applyTemplate: (templateId: string) => void
  // UI state
  isBuilderOpen: boolean
  openBuilder: () => void
  closeBuilder: () => void
  toggleBuilder: () => void
  // Notifications
  showAddedNotification: boolean
  lastAddedElement: PDFElement | null
  // Count for badge
  elementCount: number
}

const PDFBuilderContext = createContext<PDFBuilderContextType | null>(null)

// ─── PROVIDER ─────────────────────────────────────────────────────────────────

export function PDFBuilderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PDFBuilderState>({
    elements: [],
    theme: 'light',
    reportTitle: 'Informe Scout',
    reportSubtitle: 'Doble G Sports Group',
    includeDate: true,
    includeLogo: true,
    includeCover: true,
    includeTableOfContents: false,
    includePageNumbers: true,
    authorName: '',
  })
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [showAddedNotification, setShowAddedNotification] = useState(false)
  const [lastAddedElement, setLastAddedElement] = useState<PDFElement | null>(null)

  const addElement = useCallback((element: Omit<PDFElement, 'id' | 'createdAt'>) => {
    const newElement: PDFElement = {
      ...element,
      id: `pdf-el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date(),
    }
    setState(prev => ({
      ...prev,
      elements: [...prev.elements, newElement],
    }))
    // Show notification
    setLastAddedElement(newElement)
    setShowAddedNotification(true)
    setTimeout(() => setShowAddedNotification(false), 2500)
  }, [])

  const removeElement = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      elements: prev.elements.filter(el => el.id !== id),
    }))
  }, [])

  const clearElements = useCallback(() => {
    setState(prev => ({ ...prev, elements: [] }))
  }, [])

  const reorderElements = useCallback((fromIndex: number, toIndex: number) => {
    setState(prev => {
      const newElements = [...prev.elements]
      const [moved] = newElements.splice(fromIndex, 1)
      newElements.splice(toIndex, 0, moved)
      return { ...prev, elements: newElements }
    })
  }, [])

  const updateElement = useCallback((id: string, updates: Partial<PDFElement>) => {
    setState(prev => ({
      ...prev,
      elements: prev.elements.map(el =>
        el.id === id ? { ...el, ...updates } : el
      ),
    }))
  }, [])

  const duplicateElement = useCallback((id: string) => {
    setState(prev => {
      const element = prev.elements.find(el => el.id === id)
      if (!element) return prev
      const newElement: PDFElement = {
        ...element,
        id: `pdf-el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: `${element.title} (copia)`,
        createdAt: new Date(),
      }
      const index = prev.elements.findIndex(el => el.id === id)
      const newElements = [...prev.elements]
      newElements.splice(index + 1, 0, newElement)
      return { ...prev, elements: newElements }
    })
  }, [])

  const setTheme = useCallback((theme: PDFTheme) => {
    setState(prev => ({ ...prev, theme }))
  }, [])

  const setReportTitle = useCallback((reportTitle: string) => {
    setState(prev => ({ ...prev, reportTitle }))
  }, [])

  const setReportSubtitle = useCallback((reportSubtitle: string) => {
    setState(prev => ({ ...prev, reportSubtitle }))
  }, [])

  const setIncludeDate = useCallback((includeDate: boolean) => {
    setState(prev => ({ ...prev, includeDate }))
  }, [])

  const setIncludeLogo = useCallback((includeLogo: boolean) => {
    setState(prev => ({ ...prev, includeLogo }))
  }, [])

  const setIncludeCover = useCallback((includeCover: boolean) => {
    setState(prev => ({ ...prev, includeCover }))
  }, [])

  const setIncludeTableOfContents = useCallback((includeTableOfContents: boolean) => {
    setState(prev => ({ ...prev, includeTableOfContents }))
  }, [])

  const setIncludePageNumbers = useCallback((includePageNumbers: boolean) => {
    setState(prev => ({ ...prev, includePageNumbers }))
  }, [])

  const setAuthorName = useCallback((authorName: string) => {
    setState(prev => ({ ...prev, authorName }))
  }, [])

  const applyTemplate = useCallback((templateId: string) => {
    const template = PDF_TEMPLATES.find(t => t.id === templateId)
    if (!template) return
    // Templates just set initial settings, actual content comes from user adding elements
    if (template.id === 'quick-report') {
      setState(prev => ({ ...prev, includeCover: false, includeTableOfContents: false }))
    } else if (template.id === 'scouting-report') {
      setState(prev => ({
        ...prev,
        includeCover: true,
        includeTableOfContents: true,
        reportTitle: 'Informe de Scouting',
      }))
    } else if (template.id === 'talent-detection') {
      setState(prev => ({
        ...prev,
        includeCover: true,
        reportTitle: 'Deteccion de Talentos',
        reportSubtitle: 'Analisis de Oportunidades',
      }))
    }
  }, [])

  const openBuilder = useCallback(() => setIsBuilderOpen(true), [])
  const closeBuilder = useCallback(() => setIsBuilderOpen(false), [])
  const toggleBuilder = useCallback(() => setIsBuilderOpen(prev => !prev), [])

  return (
    <PDFBuilderContext.Provider
      value={{
        state,
        addElement,
        removeElement,
        clearElements,
        reorderElements,
        updateElement,
        duplicateElement,
        setTheme,
        setReportTitle,
        setReportSubtitle,
        setIncludeDate,
        setIncludeLogo,
        setIncludeCover,
        setIncludeTableOfContents,
        setIncludePageNumbers,
        setAuthorName,
        applyTemplate,
        isBuilderOpen,
        openBuilder,
        closeBuilder,
        toggleBuilder,
        showAddedNotification,
        lastAddedElement,
        elementCount: state.elements.length,
      }}
    >
      {children}
    </PDFBuilderContext.Provider>
  )
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export function usePDFBuilder() {
  const context = useContext(PDFBuilderContext)
  if (!context) {
    throw new Error('usePDFBuilder must be used within a PDFBuilderProvider')
  }
  return context
}
