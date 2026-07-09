import { useState, useEffect } from 'react'
import { usePDFBuilder, type PDFElement } from '@/context/PDFBuilderContext'

// Constructor de PDF deshabilitado por ahora (pedido: sacar el PDF de toda la
// plataforma). Poné true para reactivar TODOS los botones del constructor.
const PDF_BUILDER_ENABLED = false

interface AddToReportButtonProps {
  type: PDFElement['type']
  title: string
  description?: string
  captureId?: string
  data?: unknown
  source: string
  className?: string
  variant?: 'button' | 'icon' | 'compact' | 'menu-item' | 'rail'
  players?: string[]
  size?: 'small' | 'medium' | 'large' | 'full'
}

export default function AddToReportButton({
  type,
  title,
  description,
  captureId,
  data,
  source,
  className = '',
  variant = 'button',
  players,
  size,
}: AddToReportButtonProps) {
  const { addElement } = usePDFBuilder()
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)

  if (!PDF_BUILDER_ENABLED) return null

  const handleAdd = async () => {
    setAdding(true)

    let thumbnail: string | undefined

    // Try to capture a thumbnail if captureId is provided
    if (captureId) {
      const el = document.getElementById(captureId)
      if (el) {
        try {
          const { default: html2canvas } = await import('html2canvas')
          const canvas = await html2canvas(el, {
            scale: 0.4, // Lower scale for thumbnail
            useCORS: true,
            allowTaint: true,
            logging: false,
            backgroundColor: '#1c1c1e',
          })
          thumbnail = canvas.toDataURL('image/jpeg', 0.5)
        } catch (e) {
          console.warn('[AddToReport] Could not capture thumbnail:', e)
        }
      }
    }

    addElement({
      type,
      title,
      description,
      captureId,
      data,
      thumbnail,
      source,
      players,
      size,
    })

    setAdding(false)
    setAdded(true)

    // Reset "added" state after animation
    setTimeout(() => setAdded(false), 2500)
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={handleAdd}
        disabled={adding}
        className={`p-2 rounded-lg transition-all ${
          added
            ? 'bg-brand-green text-black'
            : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 hover:text-brand-green hover:bg-brand-green/10'
        } ${className}`}
        title="Agregar al informe PDF"
      >
        {adding ? (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : added ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
      </button>
    )
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={handleAdd}
        disabled={adding}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
          added
            ? 'bg-brand-green text-black'
            : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 hover:text-brand-green hover:bg-brand-green/10'
        } ${className}`}
      >
        {adding ? (
          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : added ? (
          <>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Agregado
          </>
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Al PDF
          </>
        )}
      </button>
    )
  }

  if (variant === 'rail') {
    return (
      <button
        onClick={handleAdd}
        disabled={adding}
        className={`relative w-full flex items-center gap-2.5 px-2.5 xl:px-3 py-2 xl:py-2.5 rounded-lg text-left transition-all duration-200 group ${
          added
            ? 'text-brand-green'
            : 'text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 hover:text-apple-gray-700 dark:hover:text-apple-gray-200'
        } ${className}`}
        aria-label="Agregar al informe PDF"
      >
        {adding ? (
          <div className="w-4 h-4 shrink-0 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg
            className={`w-4 h-4 shrink-0 transition-colors ${added ? 'text-brand-green' : 'text-apple-gray-400 group-hover:text-brand-green'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={added ? 'M5 13l4 4L19 7' : 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'} />
          </svg>
        )}
        <span className="hidden xl:inline text-xs font-medium whitespace-nowrap">{added ? 'En el informe' : 'Agregar al informe'}</span>
        <span className="text-2xs font-medium md:hidden whitespace-nowrap">{added ? 'En informe' : 'Al informe'}</span>
        <span className="absolute left-full ml-2 px-2 py-1 bg-apple-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 xl:hidden hidden md:block whitespace-nowrap z-50 pointer-events-none">
          Agregar al informe PDF
        </span>
      </button>
    )
  }

  if (variant === 'menu-item') {
    return (
      <button
        onClick={handleAdd}
        disabled={adding}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
          added
            ? 'bg-brand-green/10 text-brand-green'
            : 'text-apple-gray-700 dark:text-apple-gray-300 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800'
        } ${className}`}
      >
        {adding ? (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : added ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
        {added ? 'Agregado al informe' : 'Agregar al informe PDF'}
      </button>
    )
  }

  // Default button variant
  return (
    <button
      onClick={handleAdd}
      disabled={adding}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
        added
          ? 'bg-brand-green text-black'
          : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 hover:text-brand-green hover:bg-brand-green/10 border border-apple-gray-200 dark:border-apple-gray-700'
      } ${className}`}
    >
      {adding ? (
        <>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Agregando...
        </>
      ) : added ? (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Agregado
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5.586a1 1 0 01.293-.707l5.414-5.414a1 1 0 01.707-.293H17a2 2 0 012 2v14a2 2 0 01-2 2z" />
          </svg>
          Agregar al informe
        </>
      )}
    </button>
  )
}

// ─── FLOATING BUTTON FOR NAVBAR ───────────────────────────────────────────────

export function PDFBuilderFloatingButton() {
  const { openBuilder, elementCount, showAddedNotification, lastAddedElement } = usePDFBuilder()
  const [pulse, setPulse] = useState(false)

  // Pulse animation when element is added
  useEffect(() => {
    if (showAddedNotification) {
      setPulse(true)
      const timer = setTimeout(() => setPulse(false), 600)
      return () => clearTimeout(timer)
    }
  }, [showAddedNotification])

  if (!PDF_BUILDER_ENABLED) return null

  return (
    <div className="relative">
      <button
        onClick={openBuilder}
        className={`relative flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
          elementCount > 0
            ? 'bg-brand-green/10 text-brand-green border border-brand-green/30 hover:bg-brand-green/20'
            : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-300 border border-apple-gray-200 dark:border-apple-gray-700 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700'
        } ${pulse ? 'scale-110' : ''}`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="hidden sm:inline">PDF</span>
        {elementCount > 0 && (
          <span className={`absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1.5 rounded-full bg-brand-green text-black text-xs font-bold flex items-center justify-center shadow-lg transition-transform ${pulse ? 'scale-125' : ''}`}>
            {elementCount}
          </span>
        )}
      </button>
    </div>
  )
}

// ─── GLOBAL TOAST NOTIFICATION ────────────────────────────────────────────────

export function PDFAddedToast() {
  const { showAddedNotification, lastAddedElement, openBuilder } = usePDFBuilder()

  if (!PDF_BUILDER_ENABLED) return null
  if (!showAddedNotification || !lastAddedElement) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="flex items-center gap-3 px-4 py-3 bg-apple-gray-900 dark:bg-white text-white dark:text-apple-gray-900 rounded-xl shadow-2xl border border-apple-gray-700 dark:border-apple-gray-200">
        <div className="w-8 h-8 rounded-lg bg-brand-green/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{lastAddedElement.title}</p>
          <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500">Agregado al informe</p>
        </div>
        <button
          onClick={openBuilder}
          className="px-3 py-1.5 text-xs font-medium text-brand-green hover:bg-brand-green/10 rounded-lg transition-colors"
        >
          Ver informe
        </button>
      </div>
    </div>
  )
}

// ─── QUICK CAPTURE BUTTON ─────────────────────────────────────────────────────
// Use this for quick single-element PDF export

interface QuickCaptureButtonProps {
  captureId: string
  title: string
  className?: string
}

export function QuickCaptureButton({ captureId, title, className = '' }: QuickCaptureButtonProps) {
  const [exporting, setExporting] = useState(false)

  const handleQuickExport = async () => {
    setExporting(true)
    try {
      const { quickExportElement } = await import('@/utils/smartPdfExport')
      await quickExportElement(captureId, title, 'light')
    } catch (e) {
      console.error('Quick export failed:', e)
    }
    setExporting(false)
  }

  return (
    <button
      onClick={handleQuickExport}
      disabled={exporting}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors ${className}`}
    >
      {exporting ? (
        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )}
      PDF rapido
    </button>
  )
}
