const STEPS = ['1. Excel', '2. Métricas', '3. Contenido', '4. Preview']

export default function Stepper({ step, setStep }: { step: number; setStep: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-apple-gray-200 dark:border-apple-gray-800 pb-3">
      {STEPS.map((label, i) => (
        <button key={label} onClick={() => setStep(i)}
          className={`flex-1 whitespace-nowrap px-2 py-1.5 rounded-lg text-center text-2xs sm:text-xs font-semibold uppercase tracking-wide transition-colors ${
            i === step
              ? 'bg-brand-green/10 text-brand-green'
              : 'text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-300 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}
