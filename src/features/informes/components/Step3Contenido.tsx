import type { InformeContent, MatchRow, Comparable } from '@/features/informes/types'

// ─── Helpers ────────────────────────────────────────────────────────────────

const EMPTY_MATCH: MatchRow = { rival: '', resultado: '', rating: '', minutos: '' }
const EMPTY_COMPARABLE: Comparable = { jugador: '', club: '', rating: '', delta: '' }

/** Devuelve exactamente 5 filas para render, completando con filas vacías. */
function padMatches(rows: MatchRow[]): MatchRow[] {
  const out = [...rows]
  while (out.length < 5) out.push({ ...EMPTY_MATCH })
  return out.slice(0, 5)
}

/** Al menos 3 filas vacías para arrancar si no hay comparables cargados. */
function displayComparables(rows: Comparable[]): Comparable[] {
  return rows.length > 0 ? rows : [{ ...EMPTY_COMPARABLE }, { ...EMPTY_COMPARABLE }, { ...EMPTY_COMPARABLE }]
}

// ─── UI primitives ──────────────────────────────────────────────────────────

const cardClass = 'rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5'
const labelClass = 'block text-xs uppercase tracking-wide text-apple-gray-500 dark:text-apple-gray-400 mb-1'
const inputClass = 'w-full px-3 py-2 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-900 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red text-sm'
const smallInputClass = 'w-full px-2 py-1.5 rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-900 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red text-xs'

interface FieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

function Field({ label, value, onChange, placeholder }: FieldProps) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  )
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-apple-gray-700 dark:text-apple-gray-200 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="rounded border-apple-gray-300 dark:border-apple-gray-600 text-brand-red focus:ring-brand-red/40"
      />
      {label}
    </label>
  )
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface Step3ContenidoProps {
  content: InformeContent
  onChange: (content: InformeContent) => void
  onBack: () => void
  onNext: () => void
}

export default function Step3Contenido({ content, onChange, onBack, onNext }: Step3ContenidoProps) {
  const set = <K extends keyof InformeContent>(key: K, value: InformeContent[K]) =>
    onChange({ ...content, [key]: value })

  const matches = padMatches(content.ultimos5)
  function updateMatch(idx: number, patch: Partial<MatchRow>) {
    onChange({ ...content, ultimos5: matches.map((r, i) => (i === idx ? { ...r, ...patch } : r)) })
  }

  const comparables = displayComparables(content.comparables)
  function updateComparable(idx: number, patch: Partial<Comparable>) {
    onChange({ ...content, comparables: comparables.map((r, i) => (i === idx ? { ...r, ...patch } : r)) })
  }
  function addComparable() {
    onChange({ ...content, comparables: [...comparables, { ...EMPTY_COMPARABLE }] })
  }
  function removeComparable(idx: number) {
    onChange({ ...content, comparables: comparables.filter((_, i) => i !== idx) })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Izquierda ── */}
        <div className="space-y-4">
          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-apple-gray-900 dark:text-white mb-3">Datos del jugador</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre" value={content.nombre} onChange={v => set('nombre', v)} />
              <Field label="Club" value={content.club} onChange={v => set('club', v)} />
              <Field label="Posición" value={content.posicion} onChange={v => set('posicion', v)} />
              <Field label="Rol" value={content.rol} onChange={v => set('rol', v)} />
              <Field label="Edad" value={content.edad} onChange={v => set('edad', v)} />
              <Field label="Nacionalidad" value={content.nacionalidad} onChange={v => set('nacionalidad', v)} />
              <Field label="Liga" value={content.liga} onChange={v => set('liga', v)} />
              <Field label="Contrato" value={content.contrato} onChange={v => set('contrato', v)} />
              <div className="col-span-2">
                <Field label="Valor de mercado" value={content.valorMercado} onChange={v => set('valorMercado', v)} />
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-apple-gray-900 dark:text-white">Estadísticas principales</h2>
              <CheckboxField label="Ocultar en el email" checked={content.hideMainStats} onChange={v => set('hideMainStats', v)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Rating" value={content.rating} onChange={v => set('rating', v)} />
              <Field label="PJ" value={content.pj} onChange={v => set('pj', v)} />
              <Field label="Minutos" value={content.minutos} onChange={v => set('minutos', v)} />
              <Field label="Goles" value={content.goles} onChange={v => set('goles', v)} />
              <Field label="Asistencias" value={content.asistencias} onChange={v => set('asistencias', v)} />
            </div>
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-apple-gray-900 dark:text-white mb-3">Links y carrera</h2>
            <div className="space-y-3">
              <Field label="Video (URL de YouTube)" value={content.videoUrl} onChange={v => set('videoUrl', v)} placeholder="https://youtube.com/..." />
              <Field label="Transfermarkt" value={content.transfermarktUrl} onChange={v => set('transfermarktUrl', v)} placeholder="https://transfermarkt.com/..." />
              <Field label="Representante" value={content.representante} onChange={v => set('representante', v)} />
            </div>
          </div>
        </div>

        {/* ── Derecha ── */}
        <div className="space-y-4">
          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-apple-gray-900 dark:text-white mb-3">Lectura táctica</h2>
            <div className="space-y-3">
              <Field label="Autor" value={content.lecturaAutor} onChange={v => set('lecturaAutor', v)} />
              <div>
                <label className={labelClass}>Análisis (soporta markdown: **negrita** y [texto](url))</label>
                <textarea
                  value={content.lecturaTexto}
                  onChange={e => set('lecturaTexto', e.target.value)}
                  rows={5}
                  placeholder="Escribí el análisis táctico..."
                  className={`${inputClass} resize-y`}
                />
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-apple-gray-900 dark:text-white mb-3">Últimos 5 partidos</h2>
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2 px-1">
                <span className={labelClass}>Rival</span>
                <span className={labelClass}>Resultado</span>
                <span className={labelClass}>Rating</span>
                <span className={labelClass}>Minutos</span>
              </div>
              {matches.map((row, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2">
                  <input type="text" value={row.rival} onChange={e => updateMatch(idx, { rival: e.target.value })} className={smallInputClass} />
                  <input type="text" value={row.resultado} onChange={e => updateMatch(idx, { resultado: e.target.value })} className={smallInputClass} />
                  <input type="text" value={row.rating} onChange={e => updateMatch(idx, { rating: e.target.value })} className={smallInputClass} />
                  <input type="text" value={row.minutos} onChange={e => updateMatch(idx, { minutos: e.target.value })} className={smallInputClass} />
                </div>
              ))}
            </div>
          </div>

          <div className={cardClass}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-apple-gray-900 dark:text-white">Comparables</h2>
              <CheckboxField label="Ocultar comparables" checked={content.hideComparables} onChange={v => set('hideComparables', v)} />
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 px-1">
                <span className={labelClass}>Jugador</span>
                <span className={labelClass}>Club</span>
                <span className={labelClass}>Rating</span>
                <span className={labelClass}>Delta</span>
                <span />
              </div>
              {comparables.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center">
                  <input type="text" value={row.jugador} onChange={e => updateComparable(idx, { jugador: e.target.value })} className={smallInputClass} />
                  <input type="text" value={row.club} onChange={e => updateComparable(idx, { club: e.target.value })} className={smallInputClass} />
                  <input type="text" value={row.rating} onChange={e => updateComparable(idx, { rating: e.target.value })} className={smallInputClass} />
                  <input type="text" value={row.delta} onChange={e => updateComparable(idx, { delta: e.target.value })} className={smallInputClass} />
                  <button
                    type="button"
                    onClick={() => removeComparable(idx)}
                    aria-label="Quitar comparable"
                    className="text-apple-gray-400 hover:text-brand-red transition-colors p-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addComparable}
              className="mt-3 w-full py-2 rounded-xl text-xs font-medium border-2 border-dashed border-apple-gray-300 dark:border-apple-gray-600 text-apple-gray-500 dark:text-apple-gray-400 hover:border-brand-red hover:text-brand-red transition-all"
            >
              + Agregar comparable
            </button>
          </div>

          <div className={cardClass}>
            <label className={labelClass}>Comparaciones</label>
            <textarea
              value={content.comparaciones}
              onChange={e => set('comparaciones', e.target.value)}
              rows={4}
              placeholder="Notas de comparación adicionales..."
              className={`${inputClass} resize-y mt-1`}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 px-4 py-3 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 text-sm font-semibold hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors"
        >
          ← Volver
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 px-4 py-3 rounded-xl bg-brand-red text-white text-sm font-semibold hover:bg-brand-red/90 transition-colors"
        >
          Preview del informe →
        </button>
      </div>
    </div>
  )
}
