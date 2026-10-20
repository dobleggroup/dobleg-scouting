/** Aviso corto: los datos de Wyscout se cargan una vez por mes y quedan al día el 6. */
export default function MonthlyUpdateNote({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-medium bg-apple-gray-100 text-apple-gray-600 dark:bg-apple-gray-800 dark:text-apple-gray-300 ${className}`}>
      <svg className="w-3.5 h-3.5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      Estos datos se actualizan el 6 de cada mes
    </span>
  )
}
