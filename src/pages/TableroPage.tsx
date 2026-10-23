import WyscoutAnalysis from '@/features/wyscoutPerf/components/WyscoutAnalysis'
import MonthlyUpdateNote from '@/features/wyscoutPerf/components/MonthlyUpdateNote'

/**
 * Rendimiento individual: cómo rinde cada jugador de Doble G. El rendimiento
 * sale de Wyscout; partidos, minutos y titularidades, de API-Football y Sofascore.
 */
export default function TableroPage() {
  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-apple-gray-900 dark:text-white">Rendimiento individual</h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
          Cómo rinde cada jugador de Doble G según Wyscout, y cuánto juega: partidos, minutos, titular o suplente.
        </p>
        <MonthlyUpdateNote className="mt-2" />
      </div>
      <WyscoutAnalysis />
    </div>
  )
}
