import { useRef, useState } from 'react'

interface Props {
  onFile: (file: File) => void
  disabled?: boolean
  accept?: string
  label?: string
  hint?: string
  /** Texto mientras se procesa (ej. avance del OCR página por página). */
  busyLabel?: string
}

/**
 * Arrastrar o tocar. En la app nativa y en mobile el arrastre no existe, por eso todo
 * el bloque es un botón que abre el selector de archivos del sistema.
 */
export default function GpsDropzone({
  onFile, disabled, accept = 'application/pdf,.pdf',
  label = 'Arrastrá el PDF o tocá para elegirlo',
  hint = 'PDFs de GPS con texto. Las fotos y capturas hay que cargarlas a mano.',
  busyLabel = 'Leyendo el archivo…',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const take = (files: FileList | null) => {
    const file = files?.[0]
    if (file) onFile(file)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); if (!disabled) take(e.dataTransfer.files) }}
      className={`rounded-apple-xl border-2 border-dashed transition-colors ${
        over ? 'border-brand-green bg-brand-green/5' : 'border-apple-gray-200 dark:border-apple-gray-600'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="w-full px-6 py-12 text-center"
      >
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center">
          <svg className="w-7 h-7 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
        </div>
        <div className="text-sm font-medium text-apple-gray-800 dark:text-white">
          {disabled ? busyLabel : label}
        </div>
        <div className="text-xs text-apple-gray-400 mt-1">{hint}</div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => { take(e.target.files); e.target.value = '' }}
      />
    </div>
  )
}
