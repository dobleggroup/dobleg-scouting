import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { FUNCTIONS_BASE } from '@/lib/apiBase'

interface Club { id: string; name: string }
interface FoundUser { id: string; email: string; homeClub: string | null; extraClubIds: string[] }

async function authedFetch(path: string, body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
  return json
}

export default function AdminAccesosPage() {
  const [clubs, setClubs] = useState<Club[]>([])
  const [email, setEmail] = useState('')
  const [found, setFound] = useState<FoundUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newClubId, setNewClubId] = useState('')
  const [newClubName, setNewClubName] = useState('')

  const loadClubs = () => authedFetch('admin-list-clubs').then(r => setClubs(r.clubs)).catch(e => setError(e.message))

  useEffect(() => { loadClubs() }, [])

  const search = async () => {
    setError(null)
    setFound(null)
    try {
      const result = await authedFetch('admin-search-user', { email })
      setFound(result)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const setHomeClub = async (clubId: string) => {
    if (!found) return
    try {
      await authedFetch('admin-set-home-club', { userId: found.id, clubId })
      setFound({ ...found, homeClub: clubId })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const toggleExtraMembership = async (clubId: string, hasIt: boolean) => {
    if (!found) return
    try {
      await authedFetch('admin-set-membership', { userId: found.id, clubId, action: hasIt ? 'remove' : 'add' })
      setFound({
        ...found,
        extraClubIds: hasIt ? found.extraClubIds.filter(c => c !== clubId) : [...found.extraClubIds, clubId],
      })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const createClub = async () => {
    setError(null)
    try {
      await authedFetch('admin-create-club', { id: newClubId, name: newClubName })
      setNewClubId('')
      setNewClubName('')
      loadClubs()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="max-w-screen-md mx-auto px-4 sm:px-6 py-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-apple-gray-900 dark:text-white">Administración de accesos</h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
          "Club de siempre" es la plataforma a la que entra por defecto una cuenta. "Extra" es acceso adicional
          a otro club, sin perder el de siempre (ej. una cuenta de Doble G que también entra a Independiente).
        </p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-apple-gray-500 uppercase tracking-wide">Buscar cuenta</h2>
        <div className="flex gap-2">
          <input
            className="flex-1 border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg px-3 py-2 text-sm bg-transparent"
            placeholder="email@ejemplo.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <button onClick={search} className="px-4 py-2 text-sm font-semibold bg-brand-primary text-white rounded-lg">
            Buscar
          </button>
        </div>

        {found && (
          <div className="card-apple p-4 space-y-4">
            <p className="text-sm font-medium">{found.email}</p>

            <div>
              <p className="text-2xs font-semibold text-apple-gray-500 uppercase tracking-wide mb-2">Club de siempre</p>
              <div className="flex flex-wrap gap-2">
                {clubs.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setHomeClub(c.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                      found.homeClub === c.id
                        ? 'bg-brand-primary text-white border-brand-primary'
                        : 'border-apple-gray-300 text-apple-gray-500'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-2xs font-semibold text-apple-gray-500 uppercase tracking-wide mb-2">Accesos extra</p>
              <div className="flex flex-wrap gap-2">
                {clubs.filter(c => c.id !== found.homeClub).map(c => {
                  const hasIt = found.extraClubIds.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleExtraMembership(c.id, hasIt)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                        hasIt
                          ? 'bg-brand-primary text-white border-brand-primary'
                          : 'border-apple-gray-300 text-apple-gray-500'
                      }`}
                    >
                      {c.name} {hasIt ? '✓' : '+'}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-apple-gray-500 uppercase tracking-wide">Clubes existentes</h2>
        <ul className="text-sm space-y-1">
          {clubs.map(c => (
            <li key={c.id}>{c.name} <span className="text-apple-gray-400">({c.id})</span></li>
          ))}
        </ul>

        <div className="flex gap-2">
          <input
            className="w-32 border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg px-3 py-2 text-sm bg-transparent"
            placeholder="id-slug"
            value={newClubId}
            onChange={e => setNewClubId(e.target.value)}
          />
          <input
            className="flex-1 border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg px-3 py-2 text-sm bg-transparent"
            placeholder="Nombre del club"
            value={newClubName}
            onChange={e => setNewClubName(e.target.value)}
          />
          <button onClick={createClub} className="px-4 py-2 text-sm font-semibold bg-brand-primary text-white rounded-lg">
            Crear club
          </button>
        </div>
      </section>

      <section className="border-t border-apple-gray-200 dark:border-apple-gray-700 pt-6 space-y-3">
        <h2 className="text-sm font-semibold text-apple-gray-500 uppercase tracking-wide">Cómo funciona esta pantalla</h2>
        <div className="text-sm text-apple-gray-600 dark:text-apple-gray-300 space-y-3 leading-relaxed">
          <p>
            Cada plataforma (Doble G, Independiente, y las que vayan sumando) vive en su propia dirección de
            internet, pero todas comparten la misma base de datos y el mismo sistema de logueo. Una cuenta
            (un email) puede tener acceso a una sola plataforma, o a varias — eso se decide acá.
          </p>
          <p>
            <strong>"Club de siempre"</strong> es la plataforma donde esa cuenta entra por defecto. Toda cuenta
            necesita tener uno para poder usar cualquier plataforma — si no tiene ninguno asignado, al loguearse
            le va a aparecer la pantalla de "acceso no autorizado".
          </p>
          <p>
            <strong>"Accesos extra"</strong> es para cuando, ADEMÁS del club de siempre, esa cuenta también
            necesita entrar a otra plataforma — sin perder el acceso a la primera.
          </p>
          <div className="bg-apple-gray-50 dark:bg-apple-gray-800/50 rounded-lg p-3 space-y-2">
            <p className="font-medium text-apple-gray-700 dark:text-apple-gray-200">Ejemplo 1 — alguien de Doble G que también necesita entrar a Independiente:</p>
            <p>
              Es el caso de la cuenta <code className="text-xs">marcoscucho99@gmail.com</code>: club de siempre =
              Doble G Sports Group, y además tiene "Independiente" marcado como acceso extra. Así, con el mismo
              mail y la misma contraseña, entra a las dos plataformas — cada una le muestra sólo lo suyo, nunca
              mezclado.
            </p>
          </div>
          <div className="bg-apple-gray-50 dark:bg-apple-gray-800/50 rounded-lg p-3 space-y-2">
            <p className="font-medium text-apple-gray-700 dark:text-apple-gray-200">Ejemplo 2 — se suma un club nuevo (ej. "Racing"):</p>
            <p>
              1. Abajo, en "Clubes existentes", se crea el club nuevo: id <code className="text-xs">racing</code>,
              nombre "Racing Club". 2. Cuando el primer usuario de Racing tenga su cuenta creada (tiene que haber
              iniciado sesión al menos una vez), se lo busca acá por su email y se le pone "Racing" como club de
              siempre. Con eso ya puede entrar a la plataforma de Racing normalmente.
            </p>
          </div>
          <p className="text-apple-gray-400 text-xs">
            Sólo vos (marcoscucho99@gmail.com) podés ver y usar esta pantalla — a cualquier otra cuenta le
            aparece como una página inexistente.
          </p>
        </div>
      </section>
    </div>
  )
}
