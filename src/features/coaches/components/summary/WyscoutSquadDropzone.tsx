// src/features/coaches/components/summary/WyscoutSquadDropzone.tsx
// Carga del archivo de jugadores de Wyscout: se arrastra o se elige, se muestra
// que se detecto y recien al confirmar se guarda (queda hasta que se suba otro).
import { useRef, useState } from 'react'
import { parseWyscoutSquadFile } from '@/features/coaches/wyscoutSquad/parseWyscoutSquadXlsx'
import { saveSquadStats, type SquadStatsRecord } from '@/services/wyscoutSquadService'
import type { WyscoutSquadData } from '@/features/coaches/wyscoutSquad/wyscoutSquadTypes'

type State =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'preview'; data: WyscoutSquadData; fileName: string }
  | { kind: 'saving'; data: WyscoutSquadData; fileName: string }
  | { kind: 'error'; message: string }

export default function WyscoutSquadDropzone({ coachKey, expectedTeam, onSaved, onCancel, firstTime }: {
  coachKey: string
  expectedTeam: string
  onSaved: (record: SquadStatsRecord) => void
  onCancel?: () => void
  firstTime: boolean
}) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!/\.xlsx$/i.test(file.name)) {
      setState({ kind: 'error', message: 'Tiene que ser el Excel (.xlsx) que exporta Wyscout.' })
      return
    }
    setState({ kind: 'reading' })
    const result = await parseWyscoutSquadFile(file, expectedTeam)
    setState(result.ok ? { kind: 'preview', data: result.data, fileName: file.name } : { kind: 'error', message: result.error })
  }

  async function save() {
    if (state.kind !== 'preview') return
    setState({ ...state, kind: 'saving' })
    const res = await saveSquadStats(coachKey, state.data, state.fileName)
    if (res.success) onSaved(res.record)
    else setState({ kind: 'error', message: res.error })
  }

  if (state.kind === 'preview' || state.kind === 'saving') {
    const cols = state.data.columnsFound.length
    return (
      <div className="rounded-apple-lg border border-brand-green/40 bg-brand-green/5 p-4 sm:p-5">
        <p className="text-sm font-semibold text-apple-gray-800 dark:text-white">Archivo listo para guardar</p>
        <p className="text-sm text-apple-gray-600 dark:text-apple-gray-300 mt-1">
          <b className="tabular-nums">{state.data.players.length}</b> jugadores de <b>{state.data.team}</b> · {cols} datos por jugador
        </p>
        <p className="text-xs text-apple-gray-400 mt-0.5 truncate">{state.fileName}</p>
        <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-3">
          Al guardarlo, reemplaza al archivo anterior para todos los usuarios.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={save}
            disabled={state.kind === 'saving'}
            className="min-h-[40px] px-4 rounded-full bg-brand-green text-apple-gray-900 text-sm font-semibold disabled:opacity-60"
          >
            {state.kind === 'saving' ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => (onCancel ? onCancel() : setState({ kind: 'idle' }))}
            disabled={state.kind === 'saving'}
            className="min-h-[40px] px-4 rounded-full border border-apple-gray-300 dark:border-apple-gray-600 text-sm font-medium text-apple-gray-600 dark:text-apple-gray-300"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
        className={`w-full rounded-apple-lg border-2 border-dashed px-4 ${firstTime ? 'py-10' : 'py-6'} text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 ${
          dragOver
            ? 'border-brand-green bg-brand-green/5'
            : 'border-apple-gray-300 dark:border-apple-gray-600 hover:border-brand-green/60'
        }`}
      >
        <svg className="w-8 h-8 mx-auto text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        <p className="text-sm font-semibold text-apple-gray-800 dark:text-white mt-2">
          {state.kind === 'reading' ? 'Leyendo el archivo…' : 'Arrastrá acá el archivo de Wyscout o tocá para elegirlo'}
        </p>
        <p className="text-xs text-apple-gray-400 mt-1 max-w-md mx-auto">
          En Wyscout, buscá los jugadores del equipo y exportá la lista a Excel (el archivo "Search results").
        </p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={e => { handleFile(e.target.files?.[0]); e.target.value = '' }}
      />
      {state.kind === 'error' && (
        <p role="alert" className="mt-3 text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-lg px-3 py-2">
          {state.message}
        </p>
      )}
      {onCancel && (
        <div className="flex justify-end mt-2">
          <button type="button" onClick={onCancel} className="text-xs font-medium text-apple-gray-500 hover:text-apple-gray-800 dark:hover:text-white min-h-[32px]">
            Cerrar
          </button>
        </div>
      )}
    </div>
  )
}
