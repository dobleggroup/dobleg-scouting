import { useEffect } from 'react'

interface MobileFilterPanelProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  activeCount: number
}

export default function MobileFilterPanel({
  isOpen,
  onClose,
  children,
  activeCount
}: MobileFilterPanelProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-apple-gray-900 rounded-t-3xl shadow-2xl transform transition-transform duration-300 ease-out lg:hidden max-h-[85vh] ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-apple-gray-300 dark:bg-apple-gray-600 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 border-b border-apple-gray-200 dark:border-apple-gray-700">
          <h3 className="text-lg font-semibold text-apple-gray-800 dark:text-white">
            Filtros {activeCount > 0 && <span className="text-brand-green">({activeCount})</span>}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors"
          >
            <svg className="w-5 h-5 text-apple-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(85vh-80px)] p-4">
          {children}
        </div>
      </div>
    </>
  )
}

// Mobile filter FAB button
export function MobileFilterButton({
  onClick,
  activeCount
}: {
  onClick: () => void
  activeCount: number
}) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden fixed above-bottomnav right-6 z-40 flex items-center gap-2 px-5 py-3 bg-brand-green text-gray-900 font-semibold rounded-full shadow-lg shadow-brand-green/30 hover:shadow-xl hover:shadow-brand-green/40 transition-all active:scale-95"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
      Filtros
      {activeCount > 0 && (
        <span className="flex items-center justify-center w-5 h-5 bg-gray-900 text-brand-green text-xs font-bold rounded-full">
          {activeCount}
        </span>
      )}
    </button>
  )
}
