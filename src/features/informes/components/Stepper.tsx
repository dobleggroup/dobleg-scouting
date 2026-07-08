const STEPS = ['1. Excel', '2. Métricas', '3. Contenido', '4. Preview']

export default function Stepper({ step, setStep }: { step: number; setStep: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between border-b border-apple-gray-200 dark:border-apple-gray-800 pb-3">
      {STEPS.map((label, i) => (
        <button key={label} onClick={() => setStep(i)}
          className={`text-xs font-semibold uppercase tracking-wide transition-colors ${
            i === step ? 'text-brand-green' : 'text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-300'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}
