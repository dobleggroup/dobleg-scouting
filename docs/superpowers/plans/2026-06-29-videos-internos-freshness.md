# Videos de internos + indicador de frescura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir cargar/ver/editar videos de YouTube por jugador interno en una pestaña "Videos", con un indicador de frescura (🟢<4m · 🟡4–7m · 🔴>7m · ⚪ sin video) y un filtro de frescura en la lista de internos.

**Architecture:** Tabla nueva `player_videos` en Supabase (los internos vienen de un CSV read-only, así que la escritura va a Supabase, igual que `agency_players`). Un servicio `playerVideosService.ts` con las funciones puras (parseo de URL de YouTube, cálculo de frescura) y el CRUD. `DataContext` carga todos los videos una vez y expone un mapa de frescura por jugador. Una pestaña `Videos` (solo internos) en `PlayerDetailPage`, y un badge + filtro en la lista de internos.

**Tech Stack:** React 18 + TypeScript, Vite 7, Tailwind CSS, Supabase JS client (`@/lib/supabase`).

## Global Constraints

- **Identidad del jugador:** usar `agencyKey(nombre)` de `src/services/agencyPlayersService.ts` como `player_key` (NFD, lower, sin acentos ni puntos, espacios colapsados). NO inventar otra normalización.
- **Solo internos:** la pestaña Videos, el badge y el filtro aplican únicamente al scouting interno. No tocar externo ni seguimiento.
- **Umbrales de frescura (exactos):** efectiva = `material_date ?? upload_date`; meses = `monthsBetween(efectiva, hoy)`; 🟢 `< 4`, 🟡 `4..7` (inclusive), 🔴 `> 7`; sin videos = `'none'` (⚪).
- **Cliente Supabase:** `import { supabase } from '@/lib/supabase'`. Patrón de servicio/errores: calcar `agencyPlayersService.ts` (log de error + return de fallback, nunca throw).
- **RLS:** lectura pública + escritura para `authenticated`, igual que `agency_players` (ver `supabase/migrations/20260615_agency_rls.sql`).
- **Sin test runner:** verificación = `npm run build` (tsc + vite) en verde + chequeo manual en `npm run dev`. Para funciones puras, una verificación con `node -e`. La migración SQL se aplica a mano en Supabase (no la corre el build).
- **Commits frecuentes**, uno por tarea.

---

## File Structure

- **Create:** `supabase/migrations/20260629_player_videos.sql` — tabla + índice + RLS.
- **Create:** `src/types/videos.ts` — `PlayerVideo`, `VideoFreshness`.
- **Create:** `src/services/playerVideosService.ts` — funciones puras (parseo, frescura) + CRUD.
- **Create:** `src/components/videos/AddVideoModal.tsx` — modal de alta/edición de un video.
- **Create:** `src/components/videos/VideosTab.tsx` — galería de videos del jugador + alta/edición/borrado.
- **Modify:** `src/context/DataContext.tsx` — cargar videos + exponer mapa de frescura.
- **Modify:** `src/pages/PlayerDetailPage.tsx` — tab `Videos` (solo internos) + render de `VideosTab`.
- **Modify:** `src/components/players/PlayerTable.tsx` — badge de frescura (internos).
- **Modify:** `src/components/filters/FilterSidebar.tsx` — sección de filtro de frescura.
- **Modify:** `src/pages/InternalScoutingPage.tsx` — `FilterState` + `applyFilters` + persistencia.

---

### Task 1: Migración Supabase + tipos

**Files:**
- Create: `supabase/migrations/20260629_player_videos.sql`
- Create: `src/types/videos.ts`

**Interfaces:**
- Produces: tabla `player_videos`; tipos `PlayerVideo`, `VideoFreshness`.

- [ ] **Step 1:** Crear `supabase/migrations/20260629_player_videos.sql` con:

```sql
-- Videos de YouTube por jugador interno (cargados desde la app). Read-side de la
-- ficha y de la lista de internos. Identidad = player_key (= agencyKey del nombre).
CREATE TABLE IF NOT EXISTS player_videos (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_key    TEXT NOT NULL,
  youtube_url   TEXT NOT NULL,
  video_id      TEXT,
  title         TEXT,
  upload_date   TIMESTAMPTZ NOT NULL DEFAULT now(),
  material_date DATE,
  added_by      UUID,
  added_by_name TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_videos_player_key ON player_videos(player_key);

-- RLS: lectura pública + escritura para authenticated (igual que agency_players)
ALTER TABLE public.player_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_player_videos" ON public.player_videos;
CREATE POLICY "read_player_videos" ON public.player_videos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "write_player_videos" ON public.player_videos;
CREATE POLICY "write_player_videos" ON public.player_videos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

- [ ] **Step 2:** Crear `src/types/videos.ts`:

```ts
export type VideoFreshness = 'green' | 'amber' | 'red' | 'none'

export interface PlayerVideo {
  id: number
  player_key: string
  youtube_url: string
  video_id: string | null
  title: string | null
  upload_date: string          // ISO timestamp (default now())
  material_date: string | null // 'YYYY-MM-DD' u null
  added_by: string | null
  added_by_name: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 3: Build** — `npm run build` → compila sin errores de TypeScript (los tipos nuevos no rompen nada; el .sql no lo toca el build).

- [ ] **Step 4: Aplicar la migración en Supabase** — Pegar el contenido de `20260629_player_videos.sql` en el SQL Editor del proyecto Supabase (o `supabase db push` si está el CLI conectado) y ejecutarlo. Confirmar que la tabla `player_videos` existe con RLS activado. (Sin esto, el CRUD de las próximas tareas devolverá errores controlados.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260629_player_videos.sql src/types/videos.ts
git commit -m "feat(videos): tabla player_videos (Supabase + RLS) y tipos"
```

---

### Task 2: Servicio playerVideosService (funciones puras + CRUD)

**Files:**
- Create: `src/services/playerVideosService.ts`

**Interfaces:**
- Consumes: `supabase` (`@/lib/supabase`), `agencyKey` (`@/services/agencyPlayersService`), `monthsBetween` (`@/utils/scoring`), `PlayerVideo`/`VideoFreshness` (`@/types/videos`).
- Produces: `playerVideoKey(name): string`, `parseYouTubeId(url): string|null`, `videoEffectiveDate(v): Date`, `freshnessFromMonths(months): VideoFreshness`, `computePlayerFreshness(videos): VideoFreshness`, `fetchAllPlayerVideos(): Promise<PlayerVideo[]>`, `addPlayerVideo(input, userId?, userName?): Promise<boolean>`, `updatePlayerVideo(id, patch): Promise<boolean>`, `deletePlayerVideo(id): Promise<boolean>`, y el tipo `AddVideoInput`.

- [ ] **Step 1:** Antes de escribir, confirmar la firma de `monthsBetween` en `src/utils/scoring.ts` — es `monthsBetween(from: Date, to: Date): number` y devuelve `(to.getFullYear()-from.getFullYear())*12 + (to.getMonth()-from.getMonth())`. Si la firma difiere, ajustar el uso y reportarlo.

- [ ] **Step 2:** Crear `src/services/playerVideosService.ts`:

```ts
import { supabase } from '@/lib/supabase'
import { agencyKey } from '@/services/agencyPlayersService'
import { monthsBetween } from '@/utils/scoring'
import type { PlayerVideo, VideoFreshness } from '@/types/videos'

/** Clave de identidad del jugador (misma normalización que la agencia). */
export const playerVideoKey = agencyKey

const YT_PATTERNS: RegExp[] = [
  /[?&]v=([A-Za-z0-9_-]{11})/,            // watch?v=ID
  /youtu\.be\/([A-Za-z0-9_-]{11})/,       // youtu.be/ID
  /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/, // /shorts/ID
  /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,  // /embed/ID
]

/** Extrae el id de 11 chars de una URL de YouTube. null si no matchea. */
export function parseYouTubeId(url: string): string | null {
  if (!url) return null
  for (const re of YT_PATTERNS) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

/** Fecha que manda para la frescura: material_date si existe, si no upload_date. */
export function videoEffectiveDate(v: PlayerVideo): Date {
  return new Date(v.material_date || v.upload_date)
}

export function freshnessFromMonths(months: number): Exclude<VideoFreshness, 'none'> {
  if (months < 4) return 'green'
  if (months <= 7) return 'amber'
  return 'red'
}

/** Frescura del jugador = la del video más reciente (mayor fecha efectiva). */
export function computePlayerFreshness(videos: PlayerVideo[]): VideoFreshness {
  if (!videos || videos.length === 0) return 'none'
  const newest = videos.reduce((a, b) =>
    videoEffectiveDate(b).getTime() > videoEffectiveDate(a).getTime() ? b : a
  )
  const months = monthsBetween(videoEffectiveDate(newest), new Date())
  return freshnessFromMonths(months)
}

// ─── Datos ──────────────────────────────────────────────────────────────────────

export async function fetchAllPlayerVideos(): Promise<PlayerVideo[]> {
  const { data, error } = await supabase
    .from('player_videos')
    .select('*')
    .order('material_date', { ascending: false, nullsFirst: false })
  if (error || !data) {
    console.error('fetchAllPlayerVideos error:', error)
    return []
  }
  return data as PlayerVideo[]
}

export interface AddVideoInput {
  playerName: string
  youtubeUrl: string
  title?: string | null
  materialDate?: string | null // 'YYYY-MM-DD'
}

export async function addPlayerVideo(
  input: AddVideoInput,
  userId?: string,
  userName?: string,
): Promise<boolean> {
  const { error } = await supabase.from('player_videos').insert({
    player_key: playerVideoKey(input.playerName),
    youtube_url: input.youtubeUrl,
    video_id: parseYouTubeId(input.youtubeUrl),
    title: input.title ?? null,
    material_date: input.materialDate ?? null,
    added_by: userId ?? null,
    added_by_name: userName ?? null,
  })
  if (error) { console.error('addPlayerVideo error:', error); return false }
  return true
}

export async function updatePlayerVideo(
  id: number,
  patch: { title?: string | null; materialDate?: string | null; youtubeUrl?: string },
): Promise<boolean> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) upd.title = patch.title
  if (patch.materialDate !== undefined) upd.material_date = patch.materialDate
  if (patch.youtubeUrl !== undefined) {
    upd.youtube_url = patch.youtubeUrl
    upd.video_id = parseYouTubeId(patch.youtubeUrl)
  }
  const { error } = await supabase.from('player_videos').update(upd).eq('id', id)
  if (error) { console.error('updatePlayerVideo error:', error); return false }
  return true
}

export async function deletePlayerVideo(id: number): Promise<boolean> {
  const { error } = await supabase.from('player_videos').delete().eq('id', id)
  if (error) { console.error('deletePlayerVideo error:', error); return false }
  return true
}
```

- [ ] **Step 3: Build** — `npm run build` → sin errores de TypeScript.

- [ ] **Step 4: Sanity check de las funciones puras** — verificar `parseYouTubeId` y la frescura con un one-off (no se commitea):

Run:
```bash
node -e "const id='dQw4w9WgXcQ'; const u=['https://www.youtube.com/watch?v='+id,'https://youtu.be/'+id,'https://www.youtube.com/shorts/'+id,'https://www.youtube.com/embed/'+id,'https://example.com/no']; const re=[/[?&]v=([A-Za-z0-9_-]{11})/,/youtu\.be\/([A-Za-z0-9_-]{11})/,/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,/youtube\.com\/embed\/([A-Za-z0-9_-]{11})/]; const p=s=>{for(const r of re){const m=s.match(r); if(m)return m[1];} return null;}; console.log(u.map(p));"
```
Expected: `[ 'dQw4w9WgXcQ', 'dQw4w9WgXcQ', 'dQw4w9WgXcQ', 'dQw4w9WgXcQ', null ]`

- [ ] **Step 5: Commit**

```bash
git add src/services/playerVideosService.ts
git commit -m "feat(videos): playerVideosService (parseo YouTube, frescura, CRUD)"
```

---

### Task 3: DataContext carga videos + mapa de frescura

**Files:**
- Modify: `src/context/DataContext.tsx`

**Interfaces:**
- Consumes: `fetchAllPlayerVideos`, `computePlayerFreshness`, `playerVideoKey` (`@/services/playerVideosService`), `PlayerVideo`/`VideoFreshness` (`@/types/videos`).
- Produces (en el value del contexto): `playerVideos: PlayerVideo[]`, `refreshPlayerVideos(): Promise<void>`, `videoFreshnessByKey: Map<string, VideoFreshness>`. (Acceso vía `useData()`.)

- [ ] **Step 1:** Leer `DataContext.tsx` y localizar cómo se exponen `agencyPlayers` y `refreshAgencyPlayers` (estado + carga en `loadAllData`/mount + inclusión en el objeto `value` del provider + en el tipo del contexto). Replicar ESE patrón para videos. Reportar las líneas relevantes.

- [ ] **Step 2:** Agregar el estado y la carga, calcando el patrón de `agencyPlayers`:

```tsx
// imports
import { fetchAllPlayerVideos, computePlayerFreshness, playerVideoKey } from '@/services/playerVideosService'
import type { PlayerVideo, VideoFreshness } from '@/types/videos'

// estado dentro del provider
const [playerVideos, setPlayerVideos] = useState<PlayerVideo[]>([])

const refreshPlayerVideos = useCallback(async () => {
  setPlayerVideos(await fetchAllPlayerVideos())
}, [])
```

Cargar `refreshPlayerVideos()` donde se cargan los otros datos de Supabase (junto a `loadAgencyPlayers()` / en el `useEffect` de montaje). Si `agencyPlayers` se carga con un patrón distinto (p. ej. un `loadAllData`), seguir ese mismo.

- [ ] **Step 3:** Derivar el mapa de frescura por clave (memoizado):

```tsx
const videoFreshnessByKey = useMemo(() => {
  const byKey = new Map<string, PlayerVideo[]>()
  for (const v of playerVideos) {
    const arr = byKey.get(v.player_key) ?? []
    arr.push(v)
    byKey.set(v.player_key, arr)
  }
  const out = new Map<string, VideoFreshness>()
  for (const [key, vids] of byKey) out.set(key, computePlayerFreshness(vids))
  return out
}, [playerVideos])
```

(Una clave ausente en el mapa = jugador sin videos = `'none'`.)

- [ ] **Step 4:** Incluir `playerVideos`, `refreshPlayerVideos` y `videoFreshnessByKey` en el objeto `value` del provider y en la interfaz del tipo del contexto (donde están `agencyPlayers`/`refreshAgencyPlayers`). Importar `useMemo`/`useCallback` si no estaban.

- [ ] **Step 5: Build** — `npm run build` → sin errores. Verificar que `useData()` expone los tres nuevos campos (TypeScript no se queja al usarlos en tareas siguientes).

- [ ] **Step 6: Commit**

```bash
git add src/context/DataContext.tsx
git commit -m "feat(videos): DataContext carga videos y expone mapa de frescura"
```

---

### Task 4: Pestaña Videos (solo internos) + modal de alta

**Files:**
- Create: `src/components/videos/AddVideoModal.tsx`
- Create: `src/components/videos/VideosTab.tsx`
- Modify: `src/pages/PlayerDetailPage.tsx` (tabsConfig + render del tab)

**Interfaces:**
- Consumes: `useData()` (`playerVideos`, `refreshPlayerVideos`), `useAuth()` (`user`, `userDisplayName`), `playerVideoKey`, `addPlayerVideo`, `updatePlayerVideo`, `deletePlayerVideo`, `parseYouTubeId`, `videoEffectiveDate`, `freshnessFromMonths`, `monthsBetween`, `EnrichedPlayer`.
- Produces: `<VideosTab player={player} />`, `<AddVideoModal ... />`; entrada `Videos` en `tabsConfig`.

- [ ] **Step 1:** Crear `src/components/videos/AddVideoModal.tsx`:

```tsx
import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { addPlayerVideo, updatePlayerVideo, parseYouTubeId } from '@/services/playerVideosService'
import type { PlayerVideo } from '@/types/videos'

interface Props {
  playerName: string
  existing?: PlayerVideo | null
  onClose: () => void
  onSaved: () => void
}

export default function AddVideoModal({ playerName, existing, onClose, onSaved }: Props) {
  const { user, userDisplayName } = useAuth()
  const [url, setUrl] = useState(existing?.youtube_url ?? '')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [materialDate, setMaterialDate] = useState(existing?.material_date ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const videoId = parseYouTubeId(url)

  const handleSave = async () => {
    if (!url.trim()) { setError('Pegá un link de YouTube.'); return }
    if (!videoId) { setError('No reconozco ese link de YouTube.'); return }
    setBusy(true); setError('')
    const name = userDisplayName || user?.email?.split('@')[0] || 'Scout'
    const ok = existing
      ? await updatePlayerVideo(existing.id, {
          youtubeUrl: url.trim(),
          title: title.trim() || null,
          materialDate: materialDate || null,
        })
      : await addPlayerVideo(
          { playerName, youtubeUrl: url.trim(), title: title.trim() || null, materialDate: materialDate || null },
          user?.id, name,
        )
    setBusy(false)
    if (ok) { onSaved(); onClose() } else { setError('No se pudo guardar. Intentá de nuevo.') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-apple-gray-900 rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 className="font-semibold text-apple-gray-800 dark:text-white">{existing ? 'Editar video' : 'Agregar video'}</h3>

        <div className="space-y-1">
          <label className="text-xs font-medium text-apple-gray-500">Link de YouTube</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://youtu.be/..."
            className="w-full px-3 py-2 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 text-sm border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-green/40" />
          {videoId && (
            <img src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} alt="" className="mt-2 w-full rounded-lg" />
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-apple-gray-500">Título (opcional)</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: vs Boca - resumen"
            className="w-full px-3 py-2 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 text-sm border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-green/40" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-apple-gray-500">Fecha del material (opcional)</label>
          <input type="date" value={materialDate ?? ''} onChange={e => setMaterialDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 text-sm border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-green/40" />
          <p className="text-2xs text-apple-gray-400">Fecha del último partido/material del video. Si la dejás vacía, se usa la fecha de carga para la frescura.</p>
        </div>

        {error && <p className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} disabled={busy}
            className="flex-1 py-2 rounded-lg text-sm text-apple-gray-600 dark:text-apple-gray-300 bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={busy}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-brand-green hover:bg-brand-green/90 disabled:opacity-50 transition-colors flex items-center justify-center">
            {busy ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2:** Antes de escribir `VideosTab`, confirmar el import del hook de auth: en `DobleGWidget.tsx` es `import { useAuth } from '@/context/AuthContext'` y `import { useData } from '@/context/DataContext'`. Usar los mismos.

- [ ] **Step 3:** Crear `src/components/videos/VideosTab.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { useData } from '@/context/DataContext'
import { playerVideoKey, deletePlayerVideo, videoEffectiveDate, freshnessFromMonths } from '@/services/playerVideosService'
import { monthsBetween } from '@/utils/scoring'
import type { EnrichedPlayer } from '@/types'
import type { PlayerVideo, VideoFreshness } from '@/types/videos'
import AddVideoModal from './AddVideoModal'

const DOT: Record<VideoFreshness, string> = {
  green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500', none: 'bg-apple-gray-300',
}
const LABEL: Record<VideoFreshness, string> = {
  green: 'Actualizado', amber: 'Necesita atención', red: 'Desactualizado', none: 'Sin video',
}

function freshnessOf(v: PlayerVideo): VideoFreshness {
  return freshnessFromMonths(monthsBetween(videoEffectiveDate(v), new Date()))
}

export default function VideosTab({ player }: { player: EnrichedPlayer }) {
  const { playerVideos, refreshPlayerVideos } = useData()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PlayerVideo | null>(null)

  const key = playerVideoKey(player.Jugador)
  const videos = useMemo(
    () => playerVideos
      .filter(v => v.player_key === key)
      .sort((a, b) => videoEffectiveDate(b).getTime() - videoEffectiveDate(a).getTime()),
    [playerVideos, key],
  )

  const openAdd = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (v: PlayerVideo) => { setEditing(v); setModalOpen(true) }
  const handleDelete = async (v: PlayerVideo) => {
    if (!confirm('¿Eliminar este video?')) return
    if (await deletePlayerVideo(v.id)) await refreshPlayerVideos()
  }

  return (
    <div className="space-y-4 animate-fade-in" id="tab-content-videos">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-apple-gray-800 dark:text-white">Videos</h2>
        <button onClick={openAdd}
          className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-brand-green hover:bg-brand-green/90 transition-colors">
          + Agregar video
        </button>
      </div>

      {videos.length === 0 ? (
        <div className="text-center py-12 text-apple-gray-400">
          <p className="text-sm">Todavía no hay videos cargados para este jugador.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {videos.map(v => {
            const fr = freshnessOf(v)
            return (
              <div key={v.id} className="card-apple overflow-hidden">
                <a href={v.youtube_url} target="_blank" rel="noopener noreferrer" className="block relative">
                  {v.video_id
                    ? <img src={`https://img.youtube.com/vi/${v.video_id}/hqdefault.jpg`} alt="" className="w-full aspect-video object-cover" />
                    : <div className="w-full aspect-video bg-apple-gray-100 dark:bg-apple-gray-800" />}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  </span>
                </a>
                <div className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${DOT[fr]}`} />
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400">{LABEL[fr]}</span>
                  </div>
                  {v.title && <p className="text-sm font-medium text-apple-gray-800 dark:text-white">{v.title}</p>}
                  <p className="text-2xs text-apple-gray-400">
                    {v.material_date ? `Material: ${v.material_date}` : `Cargado: ${new Date(v.upload_date).toLocaleDateString()}`}
                  </p>
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => openEdit(v)} className="text-xs text-apple-gray-500 hover:text-brand-green transition-colors">Editar</button>
                    <button onClick={() => handleDelete(v)} className="text-xs text-red-500 hover:text-red-600 transition-colors">Eliminar</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <AddVideoModal
          playerName={player.Jugador}
          existing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={refreshPlayerVideos}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4:** En `PlayerDetailPage.tsx`, agregar la entrada `Videos` a `tabsConfig` con `internal: true` (así solo aparece para internos, igual que las otras tabs internas). Usar un ícono de video:

```tsx
{ id: 'Videos', label: 'Videos', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', internal: true },
```

Colocarla en el orden que tenga sentido (p. ej. después de `Coaching` o tras `Métricas`). El filtrado `tabs = source === 'interno' ? tabsConfig : tabsConfig.filter(t => !t.internal)` ya existe y la deja solo para internos sin cambios extra.

- [ ] **Step 5:** En `PlayerDetailPage.tsx`, importar `VideosTab` (`import VideosTab from '@/components/videos/VideosTab'`) y renderizarlo en el área de contenido de tabs, junto a los otros `activeTab === '...' && (...)`:

```tsx
{activeTab === 'Videos' && <VideosTab player={player} />}
```

- [ ] **Step 6: Build** — `npm run build` → sin errores.

- [ ] **Step 7: Chequeo visual** — `npm run dev`, abrir una ficha **interna**: aparece la tab `Videos` en el rail. Agregar un video (pegar un link de YouTube → se ve el thumbnail de preview; opcional fecha del material) → se guarda y aparece en la galería con su badge de frescura. Editar y eliminar funcionan. En una ficha de externo/no-agencia, la tab Videos NO aparece. (Requiere la migración de Task 1 aplicada.)

- [ ] **Step 8: Commit**

```bash
git add src/components/videos/AddVideoModal.tsx src/components/videos/VideosTab.tsx src/pages/PlayerDetailPage.tsx
git commit -m "feat(videos): pestaña Videos (internos) + modal de alta/edición"
```

---

### Task 5: Badge de frescura + filtro en la lista de internos

**Files:**
- Modify: `src/components/players/PlayerTable.tsx`
- Modify: `src/components/filters/FilterSidebar.tsx`
- Modify: `src/pages/InternalScoutingPage.tsx`

**Interfaces:**
- Consumes: `useData()` (`videoFreshnessByKey`), `playerVideoKey`, `VideoFreshness`.
- Produces: badge de frescura en la fila de internos; `FilterState.videoFreshness: VideoFreshness[]`; sección de filtro; integración en `applyFilters`.

- [ ] **Step 1:** Leer `PlayerTable.tsx` para ver cómo recibe los jugadores y si distingue contexto interno (probablemente un prop `source` o similar). Si la tabla se usa tanto en externo como interno, el badge debe mostrarse **solo cuando el contexto es interno** (usar el prop que ya exista; si no hay, agregar un prop opcional `showVideoFreshness?: boolean` y pasarlo `true` desde `InternalScoutingPage` solamente). Reportar qué encontraste.

- [ ] **Step 2:** En `PlayerTable.tsx`, obtener el mapa y renderizar el badge en cada fila (solo en modo interno). El badge es un puntito de color con tooltip:

```tsx
// import
import { useData } from '@/context/DataContext'
import { playerVideoKey } from '@/services/playerVideosService'
import type { VideoFreshness } from '@/types/videos'

const FRESH_DOT: Record<VideoFreshness, string> = {
  green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500', none: 'bg-apple-gray-300 dark:bg-apple-gray-600',
}
const FRESH_LABEL: Record<VideoFreshness, string> = {
  green: 'Video actualizado', amber: 'Video necesita atención', red: 'Video desactualizado', none: 'Sin video',
}

// dentro del componente:
const { videoFreshnessByKey } = useData()
// por fila (jugador p):
const fr: VideoFreshness = videoFreshnessByKey.get(playerVideoKey(p.Jugador)) ?? 'none'
// render (donde corresponda en la fila, p. ej. junto al nombre o en una celda nueva):
<span title={FRESH_LABEL[fr]} className={`inline-block w-2.5 h-2.5 rounded-full ${FRESH_DOT[fr]}`} />
```

Ubicar el badge de forma consistente con el diseño de la fila (celda nueva al inicio/fin, o junto al nombre). Mantenerlo discreto.

- [ ] **Step 3:** Leer `InternalScoutingPage.tsx`: localizar el tipo `FilterState`, el estado inicial de filtros, `applyFilters()`, y la persistencia en `sessionStorage` (clave `internal_scouting_filters`). Reportar la forma de `FilterState`.

- [ ] **Step 4:** Agregar `videoFreshness: VideoFreshness[]` a `FilterState` (y a su valor inicial vacío `[]`). En `applyFilters()`, después de los demás filtros, agregar:

```tsx
// requiere el mapa de frescura disponible en la página (traerlo con useData())
if (filters.videoFreshness.length > 0) {
  result = result.filter(p => filters.videoFreshness.includes(
    videoFreshnessByKey.get(playerVideoKey(p.Jugador)) ?? 'none'
  ))
}
```

Importar `useData` (para `videoFreshnessByKey`), `playerVideoKey` y `VideoFreshness` en la página. Asegurar que `videoFreshnessByKey` esté en las dependencias del `useMemo`/recálculo de la lista filtrada (igual que los otros filtros). La persistencia en sessionStorage funciona sin cambios si `videoFreshness` es parte de `FilterState` serializable (es un array de strings).

- [ ] **Step 5:** En `FilterSidebar.tsx`, leer cómo está hecha una sección existente con checkboxes (p. ej. Posiciones o Pie). Agregar una sección "Frescura de video" (solo se muestra en el sidebar del scouting interno — si `FilterSidebar` se comparte con externo, gatearla con el mismo prop/condición que ya distinga interno) con 4 checkboxes que togglean `filters.videoFreshness`:

```tsx
// opciones
const VIDEO_FRESHNESS_OPTIONS: { value: VideoFreshness; label: string; dot: string }[] = [
  { value: 'green', label: 'Actualizado (<4m)', dot: 'bg-green-500' },
  { value: 'amber', label: 'Necesita atención (4–7m)', dot: 'bg-amber-500' },
  { value: 'red', label: 'Desactualizado (>7m)', dot: 'bg-red-500' },
  { value: 'none', label: 'Sin video', dot: 'bg-apple-gray-300' },
]
```

Cada checkbox togglea el valor en `filters.videoFreshness` siguiendo el mismo handler que usan las otras secciones de checkboxes (agregar/quitar del array y llamar al `onChange`/setter existente). Mostrar el puntito de color junto al label.

- [ ] **Step 6: Build** — `npm run build` → sin errores.

- [ ] **Step 7: Chequeo visual** — `npm run dev`, ir a Scouting Interno: cada jugador muestra el puntito de frescura (⚪ para los que no tienen video todavía). El filtro "Frescura de video" en el sidebar filtra la lista (p. ej. tildar "Sin video" muestra solo los que faltan cargar; "Desactualizado" los rojos). El filtro persiste al recargar (sessionStorage). En externo NO aparece ni el badge ni el filtro.

- [ ] **Step 8: Commit**

```bash
git add src/components/players/PlayerTable.tsx src/components/filters/FilterSidebar.tsx src/pages/InternalScoutingPage.tsx
git commit -m "feat(videos): badge de frescura + filtro en la lista de internos"
```

---

## Self-Review (cobertura del spec)

- Tabla `player_videos` (Supabase, RLS, player_key, upload/material date) → Task 1. ✓
- Servicio CRUD + parseo YouTube + cálculo de frescura (material ?? upload; <4/4–7/>7; none) → Task 2. ✓
- Carga de videos + mapa de frescura por jugador → Task 3. ✓
- Pestaña Videos solo internos (galería, thumbnail, embed/link, alta con URL+fecha material+título, editar/borrar) → Task 4. ✓
- Frescura a nivel jugador = video más reciente → Task 2 (`computePlayerFreshness`) + Task 3 (mapa). ✓
- Badge en la lista + filtro Verde/Amarillo/Rojo/Sin video, solo internos, persistido → Task 5. ✓
- Solo internos (tab, badge, filtro) → Tasks 4 (tab `internal:true`) y 5 (gating en tabla/sidebar). ✓
- Migración debe aplicarse en Supabase → Task 1 Step 4 (explícito). ✓

**Dependencia entre tareas:** 1 → 2 → 3 → {4, 5}. Tasks 4 y 5 ambas dependen de 3; pueden ir en cualquier orden entre sí, pero ejecutarlas secuencialmente (no en paralelo) porque ambas tocan archivos compartidos vía `useData()`.
