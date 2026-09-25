// src/features/coaches/components/summary/SummaryToolbar.tsx
export default function SummaryToolbar({ title, subtitle, dataLabel, onExportPdf }: {
  title: string
  subtitle: string
  dataLabel: string
  onExportPdf: () => void
}) {
  return (
    <div className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-apple-gray-800 dark:text-white">{title}</h2>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">{subtitle}</p>
        <p className="text-xs text-apple-gray-400 mt-1">{dataLabel}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onExportPdf}
          className="min-h-[40px] px-4 rounded-full bg-brand-green text-apple-gray-900 text-sm font-semibold transition-transform duration-200 ease-apple hover:-translate-y-0.5"
        >
          Exportar PDF
        </button>
      </div>
    </div>
  )
}
