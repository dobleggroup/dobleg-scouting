import { useState } from 'react'

interface CopyChartButtonProps {
  targetId: string
  filename?: string
  className?: string
}

/**
 * Captures an element by ID as PNG and copies to clipboard (or downloads as fallback).
 * Works on all charts app-wide — pass the element's id and an optional filename.
 */
export default function CopyChartButton({ targetId, filename = 'grafico', className }: CopyChartButtonProps) {
  const [st, setSt] = useState<'idle' | 'busy' | 'done'>('idle')

  async function handle() {
    const el = document.getElementById(targetId)
    if (!el) return
    setSt('busy')
    try {
      const { default: html2canvas } = await import('html2canvas')
      const isDark = document.documentElement.classList.contains('dark')
      const canvas = await html2canvas(el, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: isDark ? '#111111' : '#ffffff',
        onclone: (doc) => {
          if (isDark) doc.documentElement.classList.add('dark')
          else doc.documentElement.classList.remove('dark')
        },
      })
      canvas.toBlob(async (blob) => {
        if (!blob) { setSt('idle'); return }
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        } catch {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${filename}.png`
          a.click()
          URL.revokeObjectURL(url)
        }
        setSt('done')
        setTimeout(() => setSt('idle'), 2200)
      })
    } catch (e) {
      console.error('CopyChart error:', e)
      setSt('idle')
    }
  }

  return (
    <button
      onClick={handle}
      disabled={st === 'busy'}
      title="Copiar gráfico como PNG (para pegar en Canva u otros)"
      className={className ?? 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors disabled:opacity-40 select-none'}
    >
      {st === 'busy' ? (
        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" strokeWidth="3" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeWidth="3" />
        </svg>
      ) : st === 'done' ? (
        <svg className="w-3.5 h-3.5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )}
      <span>{st === 'busy' ? '...' : st === 'done' ? 'Copiado' : 'Copiar PNG'}</span>
    </button>
  )
}
