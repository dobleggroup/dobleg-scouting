import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  fetchManualFixtures, addManualFixture, deleteManualFixture, type ManualFixtureRow,
} from '@/services/agencyManualFixturesService'

export default function ManualFixturesEditor({ playerName }: { playerName: string }) {
  const { user, userDisplayName } = useAuth()
  const [rows, setRows] = useState<ManualFixtureRow[]>([])
  const [date, setDate] = useState('')
  const [opponent, setOpponent] = useState('')
  const [isHome, setIsHome] = useState(true)
  const [competition, setCompetition] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = () => fetchManualFixtures(playerName).then(setRows)
  useEffect(() => { reload() }, [playerName])

  const name = userDisplayName || user?.email?.split('@')[0] || 'Scout'

  const handleAdd = async () => {
    if (!date || !opponent.trim() || !user) return
    setBusy(true)
    const ok = await addManualFixture(
      { playerName, matchDate: date, opponent: opponent.trim(), isHome, competition: competition.trim() || undefined },
      user.id, name,
    )
    if (ok) { setDate(''); setOpponent(''); setCompetition(''); setIsHome(true); await reload() }
    setBusy(false)
  }

  const handleDelete = async (id: number) => { await deleteManualFixture(id); await reload() }

  return (
    <div className="card-apple p-4 space-y-3 border border-amber-500/30">
      <div className="flex items-start gap-2">
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" /></svg>
        <p className="text-sm text-apple-gray-600 dark:text-apple-gray-300">
          La API no trae los partidos de este jugador. Agregá sus próximos partidos a mano.
        </p>
      </div>

      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map(r => (
            <li key={r.id} className="flex items-center justify-between text-sm bg-apple-gray-50 dark:bg-apple-gray-800/50 rounded-lg px-3 py-2">
              <span className="text-apple-gray-700 dark:text-apple-gray-300">
                {r.match_date} · {r.is_home ? 'vs' : '@'} {r.opponent}{r.competition ? ` · ${r.competition}` : ''}
              </span>
              <button onClick={() => handleDelete(r.id)} className="text-xs text-red-500 hover:text-red-600">Quitar</button>
            </li>
          ))}
        </ul>
      )}

      {user && (
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="col-span-1 px-3 py-2 rounded-lg text-sm bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700" />
          <select value={isHome ? 'home' : 'away'} onChange={e => setIsHome(e.target.value === 'home')}
            className="col-span-1 px-3 py-2 rounded-lg text-sm bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700">
            <option value="home">Local</option>
            <option value="away">Visitante</option>
          </select>
          <input placeholder="Rival" value={opponent} onChange={e => setOpponent(e.target.value)}
            className="col-span-1 px-3 py-2 rounded-lg text-sm bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700" />
          <input placeholder="Competencia (opcional)" value={competition} onChange={e => setCompetition(e.target.value)}
            className="col-span-1 px-3 py-2 rounded-lg text-sm bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700" />
          <button onClick={handleAdd} disabled={busy || !date || !opponent.trim()}
            className="col-span-2 py-2 rounded-lg text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-colors">
            {busy ? 'Guardando…' : 'Agregar partido'}
          </button>
        </div>
      )}
    </div>
  )
}
