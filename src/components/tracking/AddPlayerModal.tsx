import { useState, useRef, useCallback, useEffect } from 'react'
import { addScoutPlayer, uploadScoutPlayerFile, type NewScoutPlayer } from '@/services/scoutPlayersService'
import { useAuth } from '@/context/AuthContext'

const POSITIONS = [
  'Arquero', 'Lateral derecho', 'Defensor central', 'Lateral izquierdo',
  'Volante central', 'Volante interno', 'Extremo', 'Delantero',
]

const ROLES = [
  'Arquero', 'Defensor central clásico', 'Defensor central iniciador',
  'Lateral ofensivo', 'Lateral defensivo', 'Lateral completo',
  'Volante central posicional', 'Volante central defensivo',
  'Volante interno mixto', 'Volante interno ofensivo (Enganche)',
  'Extremo desequilibrante', 'Extremo finalizador',
  'Mediapunta / Segunda punta', 'Delantero de área',
  'Delantero completo / móvil',
]

const DETECTION_SOURCES = [
  'Análisis de datos', 'Observación en vivo', 'Video', 'Red de contactos',
  'Agente', 'Reporte scout', 'Red social', 'Otro',
]

const NATIONALITIES = [
  'Argentina', 'Uruguay', 'Brasil', 'Colombia', 'Chile', 'Paraguay', 'Ecuador',
  'Bolivia', 'Perú', 'Venezuela', 'México', 'España', 'Portugal', 'Otra',
]

interface AddPlayerModalProps {
  isOpen: boolean
  onClose: () => void
  defaultList?: 'datos' | 'scouts_gg' | 'both'
  onSuccess?: () => void
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-brand-green normal-case font-normal">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 transition-all text-sm"
const selectCls = `${inputCls} cursor-pointer`

export default function AddPlayerModal({ isOpen, onClose, defaultList = 'scouts_gg', onSuccess }: AddPlayerModalProps) {
  const { user, userDisplayName } = useAuth()

  // Required
  const [fullName, setFullName] = useState('')

  // Identity
  const [club, setClub] = useState('')
  const [liga, setLiga] = useState('')
  const [edad, setEdad] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [posicion, setPosicion] = useState('')
  const [rol, setRol] = useState('')
  const [nacionalidad, setNacionalidad] = useState('')

  // Physical
  const [altura, setAltura] = useState('')
  const [pie, setPie] = useState<'' | 'derecho' | 'izquierdo' | 'ambos'>('')

  // Commercial / Contacts
  const [transfermarktUrl, setTransfermarktUrl] = useState('')
  const [agente, setAgente] = useState('')
  const [videoUrl, setVideoUrl] = useState('')

  // Scout notes
  const [comentario, setComentario] = useState('')
  const [prioridad, setPrioridad] = useState<'alta' | 'normal' | 'baja'>('normal')
  const [fuenteDeteccion, setFuenteDeteccion] = useState('')

  // List selection
  const [addToDatos, setAddToDatos] = useState(defaultList === 'datos' || defaultList === 'both')
  const [addToScoutsGG, setAddToScoutsGG] = useState(defaultList === 'scouts_gg' || defaultList === 'both')

  // File upload
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // State
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState<'identity' | 'physical' | 'contacts' | 'scout'>('identity')

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setFullName(''); setClub(''); setLiga(''); setEdad(''); setFechaNacimiento('')
      setPosicion(''); setRol(''); setNacionalidad(''); setAltura(''); setPie('')
      setTransfermarktUrl(''); setAgente(''); setVideoUrl(''); setComentario('')
      setPrioridad('normal'); setFuenteDeteccion(''); setPendingFiles([])
      setError(''); setActiveSection('identity')
      setAddToDatos(defaultList === 'datos' || defaultList === 'both')
      setAddToScoutsGG(defaultList === 'scouts_gg' || defaultList === 'both')
    }
  }, [isOpen, defaultList])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv')
    )
    setPendingFiles(prev => [...prev, ...files])
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setPendingFiles(prev => [...prev, ...files])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) { setError('Debes iniciar sesión'); return }
    if (!fullName.trim()) { setError('El nombre y apellido son obligatorios'); return }
    if (!addToDatos && !addToScoutsGG) { setError('Seleccioná al menos una lista'); return }

    setSubmitting(true)
    setError('')

    const list: 'datos' | 'scouts_gg' | 'both' =
      addToDatos && addToScoutsGG ? 'both' : addToDatos ? 'datos' : 'scouts_gg'

    const playerData: NewScoutPlayer = {
      full_name: fullName.trim(),
      ...(club && { club }),
      ...(liga && { liga }),
      ...(edad && { edad: parseInt(edad) }),
      ...(fechaNacimiento && { fecha_nacimiento: fechaNacimiento }),
      ...(posicion && { posicion }),
      ...(rol && { rol }),
      ...(nacionalidad && { nacionalidad }),
      ...(altura && { altura: parseInt(altura) }),
      ...(pie && { pie }),
      ...(transfermarktUrl && { transfermarkt_url: transfermarktUrl }),
      ...(agente && { agente }),
      ...(comentario && { comentario }),
      prioridad,
      ...(fuenteDeteccion && { fuente_deteccion: fuenteDeteccion }),
      ...(videoUrl && { video_url: videoUrl }),
    }

    const result = await addScoutPlayer(playerData, list, user.id, userDisplayName)

    if (!result) {
      setError('Error al agregar el jugador. Verificá tu conexión.')
      setSubmitting(false)
      return
    }

    // Upload files if any
    if (pendingFiles.length > 0) {
      for (const file of pendingFiles) {
        await uploadScoutPlayerFile(result.id, file, userDisplayName)
      }
    }

    setSubmitting(false)
    onSuccess?.()
    onClose()
  }

  if (!isOpen) return null

  const sections = [
    { key: 'identity', label: 'Identidad' },
    { key: 'physical', label: 'Físico' },
    { key: 'contacts', label: 'Contactos' },
    { key: 'scout', label: 'Scout' },
  ] as const

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-apple-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-apple-gray-200 dark:border-apple-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-apple-gray-200 dark:border-apple-gray-800 bg-gradient-to-r from-brand-green/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-green/15 flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-apple-gray-900 dark:text-white">Agregar Jugador</h2>
              <p className="text-xs text-apple-gray-500">Completá la ficha del jugador</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors">
            <svg className="w-5 h-5 text-apple-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex border-b border-apple-gray-200 dark:border-apple-gray-800 px-6 bg-apple-gray-50/50 dark:bg-apple-gray-800/30">
          {sections.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => setActiveSection(s.key)}
              className={`px-4 py-3 text-xs font-semibold transition-all border-b-2 whitespace-nowrap ${
                activeSection === s.key
                  ? 'border-brand-green text-brand-green'
                  : 'border-transparent text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

            {/* Always visible: full_name */}
            <div className="bg-brand-green/5 border border-brand-green/20 rounded-xl p-4">
              <Field label="Nombre y Apellido" required>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className={inputCls}
                  required
                />
              </Field>
            </div>

            {/* IDENTITY SECTION */}
            {activeSection === 'identity' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Club actual">
                    <input type="text" value={club} onChange={e => setClub(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Liga">
                    <input type="text" value={liga} onChange={e => setLiga(e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Posición">
                    <select value={posicion} onChange={e => setPosicion(e.target.value)} className={selectCls}>
                      <option value="">Sin especificar</option>
                      {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </Field>
                  <Field label="Rol específico">
                    <select value={rol} onChange={e => setRol(e.target.value)} className={selectCls}>
                      <option value="">Sin especificar</option>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Edad">
                    <input type="number" min={14} max={45} value={edad} onChange={e => setEdad(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Fecha de nacimiento">
                    <input type="date" value={fechaNacimiento} onChange={e => setFechaNacimiento(e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <Field label="Nacionalidad">
                  <select value={nacionalidad} onChange={e => setNacionalidad(e.target.value)} className={selectCls}>
                    <option value="">Sin especificar</option>
                    {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
              </div>
            )}

            {/* PHYSICAL SECTION */}
            {activeSection === 'physical' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Altura (cm)">
                    <input type="number" min={150} max={220} value={altura} onChange={e => setAltura(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Pie dominante">
                    <select value={pie} onChange={e => setPie(e.target.value as typeof pie)} className={selectCls}>
                      <option value="">Sin especificar</option>
                      <option value="derecho">Derecho</option>
                      <option value="izquierdo">Izquierdo</option>
                      <option value="ambos">Ambos</option>
                    </select>
                  </Field>
                </div>
                <div className="rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800/50 border border-apple-gray-200 dark:border-apple-gray-700 p-4">
                  <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">
                    Los datos físicos detallados (GPS, velocidad, distancia) se cargan automáticamente desde las hojas de datos cuando el jugador está en la base de datos.
                  </p>
                </div>
              </div>
            )}

            {/* CONTACTS SECTION */}
            {activeSection === 'contacts' && (
              <div className="space-y-4">
                <Field label="Link Transfermarkt">
                  <input type="url" value={transfermarktUrl} onChange={e => setTransfermarktUrl(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Agente / Representante">
                  <input type="text" value={agente} onChange={e => setAgente(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Link de video / Wyscout">
                  <input type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} className={inputCls} />
                </Field>
              </div>
            )}

            {/* SCOUT SECTION */}
            {activeSection === 'scout' && (
              <div className="space-y-4">
                {/* Priority */}
                <Field label="Prioridad">
                  <div className="flex gap-2">
                    {([['alta', 'Alta', 'bg-rose-500/10 text-rose-500 border-rose-500/30'], ['normal', 'Normal', 'bg-blue-500/10 text-blue-500 border-blue-500/30'], ['baja', 'Baja', 'bg-apple-gray-200 text-apple-gray-500 border-apple-gray-300 dark:bg-apple-gray-700 dark:text-apple-gray-400 dark:border-apple-gray-600']] as const).map(([val, lbl, cls]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setPrioridad(val)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                          prioridad === val
                            ? cls + ' ring-2 ring-offset-1 ring-current dark:ring-offset-apple-gray-900'
                            : 'bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-500 border-apple-gray-200 dark:border-apple-gray-700 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Fuente de detección">
                  <select value={fuenteDeteccion} onChange={e => setFuenteDeteccion(e.target.value)} className={selectCls}>
                    <option value="">Sin especificar</option>
                    {DETECTION_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>

                <Field label="Comentario del scout">
                  <textarea
                    value={comentario}
                    onChange={e => setComentario(e.target.value)}
                    rows={4}
                    className={inputCls + ' resize-none'}
                  />
                </Field>

                {/* File upload */}
                <Field label="Archivos (Excel, CSV)">
                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                      isDragging
                        ? 'border-brand-green bg-brand-green/5 scale-[1.01]'
                        : 'border-apple-gray-300 dark:border-apple-gray-700 hover:border-brand-green/50 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50'
                    }`}
                  >
                    <input ref={fileInputRef} type="file" multiple accept=".xlsx,.xls,.csv" onChange={handleFileInput} className="hidden" />
                    <svg className="w-8 h-8 mx-auto mb-2 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm text-apple-gray-500">Arrastrá archivos o <span className="text-brand-green font-medium">hacé clic para seleccionar</span></p>
                    <p className="text-xs text-apple-gray-400 mt-1">.xlsx, .xls, .csv</p>
                  </div>
                  {pendingFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {pendingFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2 bg-brand-green/5 border border-brand-green/20 rounded-lg">
                          <span className="text-xs text-apple-gray-700 dark:text-apple-gray-300 truncate">{f.name}</span>
                          <button type="button" onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))} className="text-apple-gray-400 hover:text-red-500 ml-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Field>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-apple-gray-200 dark:border-apple-gray-800 bg-apple-gray-50/50 dark:bg-apple-gray-800/30 space-y-3">
            {/* List selector */}
            <div>
              <p className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider mb-2">Agregar a lista:</p>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setAddToDatos(!addToDatos)}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${
                      addToDatos ? 'bg-brand-green border-brand-green' : 'border-apple-gray-300 dark:border-apple-gray-600'
                    }`}
                  >
                    {addToDatos && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300">Lista de Datos</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setAddToScoutsGG(!addToScoutsGG)}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${
                      addToScoutsGG ? 'bg-brand-green border-brand-green' : 'border-apple-gray-300 dark:border-apple-gray-600'
                    }`}
                  >
                    {addToScoutsGG && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300">Seguimiento Scouts GG</span>
                </label>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || !fullName.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand-green text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Agregar Jugador
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
