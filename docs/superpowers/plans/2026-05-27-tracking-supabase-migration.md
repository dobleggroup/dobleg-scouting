# Tracking Lists → Supabase Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect tracking lists (Datos & Scouts GG) directly to the Supabase players DB via `supabase_player_id`, eliminating CSV dependency. Simplify statuses from 9→4, add "Agregar a Seguimiento" from External table, and rewrite MonitoringPage to use Supabase.

**Architecture:** Add `supabase_player_id` column to `scout_players` table linking to `players.id`. Both tracking pages read from `scout_players` joined with `player_season_scores` for Score GG. TrackingWidget already handles the add-to-tracking flow — it needs to pass `supabase_player_id`. ExternalScoutingPage gets selection checkboxes + bulk add. MonitoringPage rewrites from CSV to Supabase.

**Tech Stack:** React 18 + TypeScript, Supabase (PostgreSQL), Tailwind CSS

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/20260527_tracking_supabase_link.sql` | DB migration: add column, remap statuses, clean lists |
| Modify | `src/types/index.ts` | Unify TrackingStatus type, add supabase_player_id to ScoutPlayer |
| Modify | `src/services/scoutPlayersService.ts` | Supabase_player_id in dedup/add/fetch, score join |
| Modify | `src/components/tracking/TrackingWidget.tsx` | Accept and pass supabase_player_id |
| Modify | `src/components/players/SupabasePlayerDetail.tsx` | Pass supabase_player_id to TrackingWidget |
| Modify | `src/pages/ExternalScoutingPage.tsx` | Selection checkboxes + bulk add |
| Modify | `src/pages/ScoutTrackingGGPage.tsx` | 4 statuses, score from supabase_player_id join |
| Modify | `src/pages/MonitoringPage.tsx` | Full rewrite: Supabase-only, no CSV |
| Modify | `src/hooks/useMonitoringStatus.ts` | Unified status config |
| Modify | `src/context/DataContext.tsx` | Remove seguimiento CSV loading |
| Modify | `src/constants/scoring.ts` | Remove seguimiento/seguimientoMetricas URLs |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260527_tracking_supabase_link.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 1. Add supabase_player_id column to scout_players
ALTER TABLE scout_players
  ADD COLUMN IF NOT EXISTS supabase_player_id INTEGER REFERENCES players(id);

CREATE INDEX IF NOT EXISTS idx_scout_players_supabase_id
  ON scout_players(supabase_player_id);

-- 2. Remap GG 9-status values → 4 unified statuses in scout_players_status
UPDATE scout_players_status
  SET status = 'en_seguimiento'
  WHERE status IN ('en_seguimiento_gg', 'pre_seleccionado');

UPDATE scout_players_status
  SET status = 'contactado'
  WHERE status = 'reunion_pactada';

UPDATE scout_players_status
  SET status = 'en_negociacion'
  WHERE status = 'oferta_enviada';

UPDATE scout_players_status
  SET status = 'descartado'
  WHERE status IN ('contratado', 'no_disponible');

-- 3. Auto-match existing scout_players to players table by normalized name
-- This helps link the "descartados" that will remain
UPDATE scout_players sp
  SET supabase_player_id = p.id
  FROM players p
  WHERE sp.supabase_player_id IS NULL
    AND lower(trim(
      regexp_replace(
        normalize(sp.full_name, NFD),
        '[̀-ͯ]', '', 'g'
      )
    )) = lower(trim(
      regexp_replace(
        normalize(p.name, NFD),
        '[̀-ͯ]', '', 'g'
      )
    ));

-- 4. Clear non-descartado players from both lists
-- First, find which scout_players have a "descartado" status in either list
-- Keep those, remove the rest from list membership
WITH descartados AS (
  SELECT DISTINCT player_id
  FROM scout_players_status
  WHERE status = 'descartado'
)
UPDATE scout_players
  SET in_datos_list = CASE
        WHEN id IN (SELECT player_id FROM descartados) THEN in_datos_list
        ELSE false
      END,
      in_scouts_gg_list = CASE
        WHEN id IN (SELECT player_id FROM descartados) THEN in_scouts_gg_list
        ELSE false
      END;
```

- [ ] **Step 2: Apply migration to Supabase**

Run: `npx supabase db push` or apply via Supabase Dashboard SQL editor.

Verify: In Supabase Dashboard → Table Editor → `scout_players`, confirm `supabase_player_id` column exists. Check `scout_players_status` has no more `en_seguimiento_gg`, `pre_seleccionado`, etc.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260527_tracking_supabase_link.sql
git commit -m "feat: add supabase_player_id to scout_players, unify tracking statuses to 4"
```

---

### Task 2: Unify Types

**Files:**
- Modify: `src/types/index.ts:285-359`

- [ ] **Step 1: Replace status types and add supabase_player_id to ScoutPlayer**

In `src/types/index.ts`, replace the scout tracking types section (lines 285-359):

Replace the `ScoutsGGStatus` type (lines 290-299):
```typescript
// OLD:
export type ScoutsGGStatus =
  | 'en_seguimiento_gg'
  | 'pre_seleccionado'
  | 'contactado'
  | 'reunion_pactada'
  | 'en_negociacion'
  | 'oferta_enviada'
  | 'contratado'
  | 'descartado'
  | 'no_disponible'
```

With:
```typescript
export type TrackingStatus =
  | 'en_seguimiento'
  | 'contactado'
  | 'en_negociacion'
  | 'descartado'

// Legacy aliases — kept for backward compatibility during migration
export type ScoutsGGStatus = TrackingStatus
export type DatosTrackingStatus = TrackingStatus
```

Remove the standalone `DatosTrackingStatus` definition (lines 301-305) since it's now an alias above.

Add `supabase_player_id` to the `ScoutPlayer` interface (after `player_db_source` on line 320):
```typescript
supabase_player_id: number | null   // Link to Supabase players.id (API-Football/Sofascore)
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Fix any type errors that surface from the ScoutsGGStatus change (expect errors in ScoutTrackingGGPage — those will be fixed in Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: unify TrackingStatus type (4 statuses), add supabase_player_id to ScoutPlayer"
```

---

### Task 3: Update scoutPlayersService

**Files:**
- Modify: `src/services/scoutPlayersService.ts`

- [ ] **Step 1: Add supabase_player_id to NewScoutPlayer and update dedup**

In `src/services/scoutPlayersService.ts`, add to `NewScoutPlayer` interface (after line 9):
```typescript
supabase_player_id?: number        // Supabase players.id for direct DB link
```

Update `findExistingScoutPlayer` (line 34-70) to check `supabase_player_id` first:

Before the existing Strategy 1 (line 38), add a new primary strategy:
```typescript
// Strategy 0: match by supabase_player_id (most reliable — direct DB link)
if (player.supabase_player_id) {
  const { data } = await supabase
    .from('scout_players')
    .select('id, in_datos_list, in_scouts_gg_list, player_db_id')
    .eq('supabase_player_id', player.supabase_player_id)
    .maybeSingle()
  if (data) return data
}
```

In `addScoutPlayer` (line 117-137), include `supabase_player_id` in the insert:
```typescript
// In the insert object (line 119-131), add:
supabase_player_id: player.supabase_player_id || null,
```

Also in the update path (line 86-113), backfill `supabase_player_id` if we now have it:
```typescript
// After the player_db_id backfill block (line 100-103), add:
if (player.supabase_player_id && !existing.supabase_player_id) {
  updates.supabase_player_id = player.supabase_player_id
}
```

Note: to make this work, `findExistingScoutPlayer` return type needs `supabase_player_id`:
```typescript
// Update the return select (lines 41, 49, 60) to include supabase_player_id:
.select('id, in_datos_list, in_scouts_gg_list, player_db_id, supabase_player_id')
```

And update the function return type:
```typescript
async function findExistingScoutPlayer(
  player: NewScoutPlayer
): Promise<{ id: string; in_datos_list: boolean; in_scouts_gg_list: boolean; player_db_id: string | null; supabase_player_id: number | null } | null> {
```

- [ ] **Step 2: Add fetchScoutPlayersWithScores function**

Add a new function after `fetchScoutPlayers` (after line 151) that joins score data:

```typescript
export interface ScoutPlayerWithScore extends ScoutPlayer {
  gg_score: number | null
  gg_percentile: number | null
  gg_position: string | null
  gg_matches: number | null
  player_photo: string | null
  team_name: string | null
  team_logo: string | null
}

export async function fetchScoutPlayersWithScores(
  list: 'datos' | 'scouts_gg'
): Promise<ScoutPlayerWithScore[]> {
  const column = list === 'datos' ? 'in_datos_list' : 'in_scouts_gg_list'

  const { data, error } = await supabase
    .from('scout_players')
    .select('*')
    .eq(column, true)
    .order('created_at', { ascending: false })

  if (error) { console.error('Error fetching scout players:', error); return [] }
  const players: ScoutPlayer[] = (data || []).map(p => ({ ...p, files: p.files || [] }))

  // For players with supabase_player_id, fetch their scores in bulk
  const supabaseIds = players
    .map(p => p.supabase_player_id)
    .filter((id): id is number => id !== null)

  let scoreMap = new Map<number, { score: number; percentile: number | null; position: string; matches: number }>()
  let playerInfoMap = new Map<number, { photo: string | null; team_name: string | null; team_logo: string | null }>()

  if (supabaseIds.length > 0) {
    // Fetch scores
    const { data: scores } = await supabase
      .from('player_season_scores')
      .select('player_id, avg_score, percentile, position, matches_played')
      .in('player_id', supabaseIds)
      .not('avg_score', 'is', null)
      .order('matches_played', { ascending: false })

    if (scores) {
      for (const s of scores) {
        if (!scoreMap.has(s.player_id)) {
          scoreMap.set(s.player_id, {
            score: s.avg_score,
            percentile: s.percentile,
            position: s.position,
            matches: s.matches_played,
          })
        }
      }
    }

    // Fetch player info (photo, team)
    const { data: playerInfos } = await supabase
      .from('players')
      .select('id, photo, team:teams(name, logo)')
      .in('id', supabaseIds)

    if (playerInfos) {
      for (const p of playerInfos) {
        const team = p.team as any
        playerInfoMap.set(p.id, {
          photo: p.photo,
          team_name: team?.name ?? null,
          team_logo: team?.logo ?? null,
        })
      }
    }
  }

  return players.map(p => {
    const s = p.supabase_player_id ? scoreMap.get(p.supabase_player_id) : undefined
    const info = p.supabase_player_id ? playerInfoMap.get(p.supabase_player_id) : undefined
    return {
      ...p,
      gg_score: s?.score ?? null,
      gg_percentile: s?.percentile ?? null,
      gg_position: s?.position ?? null,
      gg_matches: s?.matches ?? null,
      player_photo: info?.photo ?? null,
      team_name: info?.team_name ?? p.club,
      team_logo: info?.team_logo ?? null,
    }
  })
}
```

- [ ] **Step 3: Update fetchScoutPlayerRecord to also match by supabase_player_id**

In `fetchScoutPlayerRecord` (around line 354), add a numeric ID parameter and priority match:

```typescript
export async function fetchScoutPlayerRecord(
  playerName: string,
  playerDbId?: string | null,
  supabasePlayerId?: number | null
): Promise<ScoutPlayer | null> {
  // Priority 1: match by supabase_player_id
  if (supabasePlayerId) {
    const { data } = await supabase
      .from('scout_players')
      .select('*')
      .eq('supabase_player_id', supabasePlayerId)
      .maybeSingle()
    if (data) return { ...data, files: data.files || [] }
  }

  // Priority 2: match by player_db_id (existing logic)
  if (playerDbId) {
    const { data } = await supabase
      .from('scout_players')
      .select('*')
      .eq('player_db_id', playerDbId)
      .maybeSingle()
    if (data) return { ...data, files: data.files || [] }
  }

  // Priority 3: match by name (existing logic)
  const { data } = await supabase
    .from('scout_players')
    .select('*')
    .ilike('full_name', playerName.trim())
    .maybeSingle()

  return data ? { ...data, files: data.files || [] } : null
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/services/scoutPlayersService.ts
git commit -m "feat: scoutPlayersService supports supabase_player_id for dedup, add, and score join"
```

---

### Task 4: Update TrackingWidget to pass supabase_player_id

**Files:**
- Modify: `src/components/tracking/TrackingWidget.tsx`
- Modify: `src/components/players/SupabasePlayerDetail.tsx`

- [ ] **Step 1: Add supabasePlayerId prop to TrackingWidget**

In `src/components/tracking/TrackingWidget.tsx`, update the interface (lines 6-11):

```typescript
interface TrackingWidgetProps {
  playerName: string
  playerDbId?: string | null
  playerClub?: string
  playerPosition?: string
  supabasePlayerId?: number | null  // Direct link to players.id
}
```

Update the component signature (line 13):
```typescript
export default function TrackingWidget({ playerName, playerDbId, playerClub, playerPosition, supabasePlayerId }: TrackingWidgetProps) {
```

Update the `fetchScoutPlayerRecord` call (line 24):
```typescript
fetchScoutPlayerRecord(playerName, playerDbId, supabasePlayerId).then(setRecord)
```

Update the dependency array (line 25):
```typescript
}, [playerName, playerDbId, supabasePlayerId])
```

Update `handleSave` to include `supabase_player_id` (line 52-58):
```typescript
const result = await addScoutPlayer(
  {
    full_name: playerName,
    ...(supabasePlayerId && { supabase_player_id: supabasePlayerId }),
    ...(playerDbId && { player_db_id: playerDbId, player_db_source: 'externo' as const }),
    ...(playerClub && { club: playerClub }),
    ...(playerPosition && { posicion: playerPosition }),
  },
  list,
  user.id,
  name
)
```

- [ ] **Step 2: Pass supabasePlayerId from SupabasePlayerDetail**

In `src/components/players/SupabasePlayerDetail.tsx`, update the TrackingWidget usage (around line 196):

```typescript
<TrackingWidget
  playerName={player.name}
  playerDbId={String(player.id)}
  playerClub={player.team?.name || undefined}
  playerPosition={player.primary_position || undefined}
  supabasePlayerId={player.id}
/>
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`

Navigate to an External player's detail page (e.g., `/jugador/SomePlayer?source=externo&apiId=123`). Click "Agregar a seguimiento" → select a list → Confirmar. Check Supabase Dashboard → `scout_players` table → verify `supabase_player_id` is set.

- [ ] **Step 4: Commit**

```bash
git add src/components/tracking/TrackingWidget.tsx src/components/players/SupabasePlayerDetail.tsx
git commit -m "feat: TrackingWidget passes supabase_player_id when adding players to tracking"
```

---

### Task 5: Simplify ScoutTrackingGGPage to 4 statuses

**Files:**
- Modify: `src/pages/ScoutTrackingGGPage.tsx`

- [ ] **Step 1: Replace GG_STATUS_CONFIG with unified 4-status config**

In `src/pages/ScoutTrackingGGPage.tsx`, replace `GG_STATUS_CONFIG` (lines 25-35) with:

```typescript
import type { TrackingStatus } from '@/types'

const TRACKING_STATUS_CONFIG: Record<TrackingStatus, { label: string; color: string; bg: string; dot: string }> = {
  en_seguimiento: { label: 'En Seguimiento', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', dot: 'bg-blue-500' },
  contactado:     { label: 'Contactado',     color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-500' },
  en_negociacion: { label: 'En Negociación', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', dot: 'bg-purple-500' },
  descartado:     { label: 'Descartado',     color: 'text-apple-gray-500', bg: 'bg-apple-gray-200/50 dark:bg-apple-gray-700/50 border-apple-gray-300/30 dark:border-apple-gray-600/30', dot: 'bg-apple-gray-400' },
}
```

- [ ] **Step 2: Remove PRIORITY_CONFIG and priority references**

Remove `PRIORITY_CONFIG` (lines 37-41).

In the table/card rendering, remove:
- Priority border-left classes (search for `border-l-rose`, `border-l-blue`, `border-l-apple-gray`)
- Priority badge display
- Sort by priority logic (search for `prioridad` in the sort function, around line 267-290)

Replace priority sort with just date sort:
```typescript
const sorted = [...filtered].sort((a, b) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
)
```

- [ ] **Step 3: Update StatusDropdown to use 4 statuses**

Replace all `ScoutsGGStatus` references with `TrackingStatus`. The StatusDropdown component (lines 57-145) should iterate over `TRACKING_STATUS_CONFIG` instead of `GG_STATUS_CONFIG`.

Update the `currentStatus` prop type and `onStatusChange` callback:
```typescript
function StatusDropdown({
  playerId,
  currentStatus,
  currentRecord,
  onStatusChange,
  requiresAuth,
}: {
  playerId: string
  currentStatus: TrackingStatus
  currentRecord: ScoutPlayerStatusRecord | undefined
  onStatusChange: (id: string, status: TrackingStatus) => Promise<void>
  requiresAuth: boolean
}) {
```

In the dropdown options rendering, replace:
```typescript
{(Object.entries(TRACKING_STATUS_CONFIG) as [TrackingStatus, typeof TRACKING_STATUS_CONFIG[TrackingStatus]][]).map(([key, cfg]) => (
```

- [ ] **Step 4: Use fetchScoutPlayersWithScores for Score GG column**

Replace the current data loading (around lines 199-212) to use `fetchScoutPlayersWithScores`:

```typescript
import { fetchScoutPlayersWithScores, type ScoutPlayerWithScore } from '@/services/scoutPlayersService'

// In the load function:
const loadData = async () => {
  setLoading(true)
  const [playersData, statusData] = await Promise.all([
    fetchScoutPlayersWithScores('scouts_gg'),
    fetchScoutPlayerStatuses('scouts_gg'),
  ])
  setPlayers(playersData)
  setStatuses(statusData)
  setLoading(false)
}
```

Update the Score GG column to use `player.gg_score` instead of the scoreLookup match:
```typescript
{player.gg_score !== null ? (
  <span className={`inline-block px-2.5 py-1 rounded-lg text-sm font-bold tabular-nums ${getScoreColorClass(player.gg_score, '10')} ${getScoreBgClass(player.gg_score, '10')}`}>
    {player.gg_score.toFixed(1)}
  </span>
) : (
  <span className="text-apple-gray-400 text-sm">—</span>
)}
```

Remove the `useScoreLookup` import and usage.

- [ ] **Step 5: Update player click navigation**

When clicking a player row, if `supabase_player_id` is set, navigate to the Supabase detail page:
```typescript
const handlePlayerClick = (player: ScoutPlayerWithScore) => {
  if (player.supabase_player_id) {
    navigate(`/jugador/${encodeURIComponent(player.full_name)}?source=externo&apiId=${player.supabase_player_id}`)
  }
  // If no supabase link, open FichaManualModal (existing behavior)
}
```

- [ ] **Step 6: Verify in browser**

Run: `npm run dev`

Navigate to `/seguimiento-gg`. Verify:
- Only 4 status options appear in the dropdown
- Score GG column shows real scores for linked players
- No priority badges or borders visible
- Click on a linked player navigates to their detail page

- [ ] **Step 7: Commit**

```bash
git add src/pages/ScoutTrackingGGPage.tsx
git commit -m "feat: ScoutTrackingGGPage uses 4 unified statuses, score from supabase_player_id"
```

---

### Task 6: Rewrite MonitoringPage to use Supabase

**Files:**
- Modify: `src/pages/MonitoringPage.tsx`
- Modify: `src/hooks/useMonitoringStatus.ts`

- [ ] **Step 1: Update useMonitoringStatus hook**

In `src/hooks/useMonitoringStatus.ts`, update `STATUS_CONFIG` (lines 67-88) to use the unified type:

```typescript
import type { TrackingStatus } from '@/types'

export const TRACKING_STATUS_CONFIG: Record<TrackingStatus, { label: string; color: string; bgColor: string }> = {
  en_seguimiento: { label: 'En Seguimiento', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-500/10 border border-blue-500/20' },
  contactado:     { label: 'Contactado',     color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500/10 border border-amber-500/20' },
  en_negociacion: { label: 'En Negociación', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-500/10 border border-purple-500/20' },
  descartado:     { label: 'Descartado',     color: 'text-apple-gray-500', bgColor: 'bg-apple-gray-200/60 border border-apple-gray-300/30 dark:bg-apple-gray-700/50 dark:border-apple-gray-600/30' },
}

// Keep legacy export for any remaining consumers
export const STATUS_CONFIG = TRACKING_STATUS_CONFIG
```

- [ ] **Step 2: Rewrite MonitoringPage data loading**

In `src/pages/MonitoringPage.tsx`, replace the CSV-based data loading with Supabase-only loading. The key changes:

Remove imports:
- `useData` from `@/context/DataContext` (no more CSV dependency)
- `MonitoringPlayer` type
- `useScoreLookup` if still imported
- `normalizeName` if only used for CSV matching

Add imports:
```typescript
import { fetchScoutPlayersWithScores, fetchScoutPlayerStatuses, setScoutPlayerStatus, removeScoutPlayerFromList, type ScoutPlayerWithScore } from '@/services/scoutPlayersService'
import type { TrackingStatus, ScoutPlayerStatusRecord } from '@/types'
import { TRACKING_STATUS_CONFIG } from '@/hooks/useMonitoringStatus'
```

Replace the component's data state:
```typescript
const [players, setPlayers] = useState<ScoutPlayerWithScore[]>([])
const [statuses, setStatuses] = useState<Record<string, ScoutPlayerStatusRecord>>({})
const [loading, setLoading] = useState(true)
```

Replace the data loading effect:
```typescript
const loadData = useCallback(async () => {
  setLoading(true)
  const [playersData, statusData] = await Promise.all([
    fetchScoutPlayersWithScores('datos'),
    fetchScoutPlayerStatuses('datos'),
  ])
  setPlayers(playersData)
  setStatuses(statusData)
  setLoading(false)
}, [])

useEffect(() => { loadData() }, [loadData])
```

- [ ] **Step 3: Remove the CombinedEntry system**

The old MonitoringPage had a `CombinedEntry` type that merged CSV players (`type: 'sheets'`) with manual Supabase players (`type: 'manual'`). Since everything is now from Supabase, remove:
- The `CombinedEntry` type definition (around line 35-37)
- The `manualOnlyPlayers` computation
- The combined list merge logic
- The conditional rendering that checks `entry.type === 'sheets'` vs `entry.type === 'manual'`

Replace with a simple filtered list:
```typescript
const filteredPlayers = useMemo(() => {
  let result = [...players]

  // Filter by status
  if (statusFilter !== 'todos') {
    result = result.filter(p => {
      const s = statuses[p.id]?.status || 'en_seguimiento'
      return s === statusFilter
    })
  }

  // Filter by position
  if (positionFilter) {
    result = result.filter(p => p.posicion === positionFilter || p.gg_position === positionFilter)
  }

  // Search by name
  if (searchQuery) {
    result = result.filter(p => fuzzyMatch(searchQuery, p.full_name))
  }

  return result
}, [players, statuses, statusFilter, positionFilter, searchQuery])
```

- [ ] **Step 4: Update StatusBadge to use TrackingStatus**

Replace `ManagementStatus` references with `TrackingStatus` in the StatusBadge component. Update `DATOS_STATUS_CONFIG` reference to `TRACKING_STATUS_CONFIG`.

- [ ] **Step 5: Update the player row rendering**

Each row now renders from `ScoutPlayerWithScore`:
```typescript
// Name + photo
<div className="flex items-center gap-3">
  <PlayerPhoto src={player.player_photo} name={player.full_name} size="sm" />
  <div>
    <span className="text-sm font-medium text-apple-gray-800 dark:text-white">{player.full_name}</span>
    <p className="text-xs text-apple-gray-400">{player.team_name ?? player.club ?? '—'}</p>
  </div>
</div>

// Score GG
{player.gg_score !== null ? (
  <span className={`inline-block px-2.5 py-1 rounded-lg text-sm font-bold tabular-nums ${getScoreColorClass(player.gg_score, '10')} ${getScoreBgClass(player.gg_score, '10')}`}>
    {player.gg_score.toFixed(1)}
  </span>
) : (
  <span className="text-apple-gray-400 text-sm">—</span>
)}

// Added by
<span className="text-xs text-apple-gray-400">
  {player.added_by_datos_name ?? '—'}
</span>
```

- [ ] **Step 6: Update player click handler**

```typescript
const handlePlayerClick = (player: ScoutPlayerWithScore) => {
  if (player.supabase_player_id) {
    navigate(`/jugador/${encodeURIComponent(player.full_name)}?source=externo&apiId=${player.supabase_player_id}`)
  }
  // No supabase link — no navigation (or show FichaManualModal)
}
```

- [ ] **Step 7: Update status change handler**

```typescript
const handleStatusChange = async (playerId: string, newStatus: TrackingStatus) => {
  if (!user) return
  const name = userDisplayName || user.email?.split('@')[0] || 'Scout'
  const result = await setScoutPlayerStatus(playerId, 'datos', newStatus, user.id, name)
  if (result) {
    setStatuses(prev => ({ ...prev, [playerId]: result }))
  }
}
```

- [ ] **Step 8: Verify in browser**

Run: `npm run dev`

Navigate to `/seguimiento-datos`. Verify:
- Page loads from Supabase (no CSV fetch in Network tab)
- Descartado players appear (migrated from old lists)
- Status dropdown shows 4 options
- Score GG shows for linked players
- Click on linked player navigates to detail page
- Adding/changing status works

- [ ] **Step 9: Commit**

```bash
git add src/pages/MonitoringPage.tsx src/hooks/useMonitoringStatus.ts
git commit -m "feat: MonitoringPage reads from Supabase, no CSV dependency, 4 unified statuses"
```

---

### Task 7: Add selection & bulk add to ExternalScoutingPage

**Files:**
- Modify: `src/pages/ExternalScoutingPage.tsx`

- [ ] **Step 1: Add selection state**

In `src/pages/ExternalScoutingPage.tsx`, add state for selected players (after the existing state declarations, around line 60):

```typescript
const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
const [showTrackingModal, setShowTrackingModal] = useState(false)

const toggleSelect = (id: number, e: React.MouseEvent) => {
  e.stopPropagation()
  setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

const toggleSelectAll = () => {
  if (selectedIds.size === players.length) {
    setSelectedIds(new Set())
  } else {
    setSelectedIds(new Set(players.map(p => p.id)))
  }
}

const selectedPlayers = players.filter(p => selectedIds.has(p.id))
```

- [ ] **Step 2: Add checkbox column to desktop table**

In the desktop table `<thead>` (line 291), add a checkbox header as the first column:
```typescript
<th className="w-10 py-3 px-2">
  <input
    type="checkbox"
    checked={players.length > 0 && selectedIds.size === players.length}
    onChange={toggleSelectAll}
    className="w-4 h-4 rounded border-apple-gray-300 dark:border-apple-gray-600 text-brand-green focus:ring-brand-green/50"
  />
</th>
```

In each table row (inside the `<tr>` around line 309), add a checkbox cell as the first column:
```typescript
<td className="py-2.5 px-2" onClick={e => e.stopPropagation()}>
  <input
    type="checkbox"
    checked={selectedIds.has(player.id)}
    onChange={(e) => toggleSelect(player.id, e as any)}
    className="w-4 h-4 rounded border-apple-gray-300 dark:border-apple-gray-600 text-brand-green focus:ring-brand-green/50"
  />
</td>
```

- [ ] **Step 3: Add floating action bar for bulk add**

After the table div (after line 365), add the floating action bar that appears when items are selected:

```typescript
{selectedIds.size > 0 && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 px-5 py-3 flex items-center gap-4">
    <span className="text-sm font-medium text-apple-gray-600 dark:text-apple-gray-300">
      {selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}
    </span>
    <button
      onClick={() => setShowTrackingModal(true)}
      className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 transition-colors flex items-center gap-2"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      Agregar a seguimiento
    </button>
    <button
      onClick={() => setSelectedIds(new Set())}
      className="p-2 rounded-lg text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-300 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
)}
```

- [ ] **Step 4: Add bulk tracking modal**

Add a simple modal for list selection. At the bottom of the component (before the final closing `</div>`):

```typescript
{showTrackingModal && (
  <BulkTrackingModal
    players={selectedPlayers}
    onClose={() => setShowTrackingModal(false)}
    onSuccess={() => {
      setSelectedIds(new Set())
      setShowTrackingModal(false)
    }}
  />
)}
```

Add the `BulkTrackingModal` component in the same file (before the default export):

```typescript
function BulkTrackingModal({
  players,
  onClose,
  onSuccess,
}: {
  players: PlayerWithScore[]
  onClose: () => void
  onSuccess: () => void
}) {
  const { user, userDisplayName } = useAuth()
  const [list, setList] = useState<'datos' | 'scouts_gg' | 'both'>('datos')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    const name = userDisplayName || user.email?.split('@')[0] || 'Scout'

    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      await addScoutPlayer(
        {
          full_name: p.name,
          supabase_player_id: p.id,
          club: p.team?.name,
          liga: undefined,
          posicion: p.season_scores[0]?.position || p.primary_position || undefined,
          nacionalidad: p.nationality || undefined,
        },
        list,
        user.id,
        name
      )
      setProgress(i + 1)
    }

    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 w-full max-w-sm mx-4 p-5">
        <h3 className="text-lg font-bold text-apple-gray-800 dark:text-white mb-1">
          Agregar a seguimiento
        </h3>
        <p className="text-sm text-apple-gray-500 mb-4">
          {players.length} jugador{players.length > 1 ? 'es' : ''} seleccionado{players.length > 1 ? 's' : ''}
        </p>

        <div className="space-y-2 mb-5">
          {(['datos', 'scouts_gg', 'both'] as const).map(option => (
            <button
              key={option}
              onClick={() => setList(option)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                list === option
                  ? 'border-brand-green bg-brand-green/5'
                  : 'border-apple-gray-200 dark:border-apple-gray-700 hover:border-apple-gray-300 dark:hover:border-apple-gray-600'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                list === option ? 'border-brand-green' : 'border-apple-gray-300 dark:border-apple-gray-600'
              }`}>
                {list === option && <div className="w-2 h-2 rounded-full bg-brand-green" />}
              </div>
              <span className="text-sm font-medium text-apple-gray-800 dark:text-white">
                {option === 'datos' ? 'Lista de Datos' : option === 'scouts_gg' ? 'Scouts GG' : 'Ambas listas'}
              </span>
            </button>
          ))}
        </div>

        {saving && (
          <div className="mb-4">
            <div className="h-1.5 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-green rounded-full transition-all duration-300"
                style={{ width: `${(progress / players.length) * 100}%` }}
              />
            </div>
            <p className="text-xs text-apple-gray-400 mt-1">{progress} de {players.length}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm text-apple-gray-600 dark:text-apple-gray-400 bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

Add necessary imports at the top:
```typescript
import { useAuth } from '@/context/AuthContext'
import { addScoutPlayer } from '@/services/scoutPlayersService'
```

- [ ] **Step 5: Clear selection on filter/page change**

Add an effect to clear selection when filters change:
```typescript
useEffect(() => { setSelectedIds(new Set()) }, [page, filters])
```

- [ ] **Step 6: Verify in browser**

Run: `npm run dev`

Navigate to `/scouting`. Verify:
- Checkboxes appear in table rows
- Select all checkbox works
- Floating bar appears with count
- Click "Agregar a seguimiento" opens modal
- Selecting a list and confirming adds players
- Progress bar updates during bulk add
- Selection clears after success

- [ ] **Step 7: Commit**

```bash
git add src/pages/ExternalScoutingPage.tsx
git commit -m "feat: ExternalScoutingPage selection checkboxes + bulk add to tracking"
```

---

### Task 8: Clean up CSV seguimiento dependency

**Files:**
- Modify: `src/constants/scoring.ts:15-28`
- Modify: `src/context/DataContext.tsx`

- [ ] **Step 1: Remove seguimiento URLs from scoring.ts**

In `src/constants/scoring.ts`, remove the `seguimiento` and `seguimientoMetricas` entries from `SHEET_URLS` (lines 19-20):

```typescript
// Remove these two lines:
seguimiento: buildSheetUrl('/spreadsheets/d/e/2PACX-1vSneBjGlw2I3SyXV-uw1V8Cs_O4lbiQw39melKEZJNhunpshakPrn7AZQBN2L8N9Yw_HA-EeVOt3qvf/pub?gid=1608054850&single=true&output=csv'),
seguimientoMetricas: buildSheetUrl('/spreadsheets/d/e/2PACX-1vSneBjGlw2I3SyXV-uw1V8Cs_O4lbiQw39melKEZJNhunpshakPrn7AZQBN2L8N9Yw_HA-EeVOt3qvf/pub?gid=1167296651&single=true&output=csv'),
```

- [ ] **Step 2: Update DataContext to skip seguimiento CSV**

In `src/context/DataContext.tsx`, in the `loadAllData` function and the processing logic:

- Remove the `raw.monitoring` processing (around lines 1063-1069 — the `linkMonitoringToMetrics` call)
- Set `monitoring: []` in the state instead
- Remove `raw.seguimientoMetrics` reference
- Keep the `monitoring` field in state but always empty (prevents breaking consumers that check `monitoring.length`)

In the `useEffect` where state is set (find where `monitoring` is assigned), change to:
```typescript
monitoring: [],  // No longer loaded from CSV — MonitoringPage reads from Supabase directly
```

- [ ] **Step 3: Check for remaining references to seguimiento CSV**

Search for any remaining imports/uses of `monitoring` from DataContext in pages other than MonitoringPage. The main consumers:
- `PlayerDetailPage.tsx` uses `monitoring` from DataContext for the player selector when `source === 'seguimiento'`. This path is no longer needed — remove the `'seguimiento'` source handling.

In `PlayerDetailPage.tsx`, in the `availablePlayers` memo (around line 602-608), remove the seguimiento case:
```typescript
// Remove:
if (source === 'seguimiento') {
  return monitoring.map(m => m.metricsPlayer).filter(Boolean).sort(...) as EnrichedPlayer[]
}
```

- [ ] **Step 4: Verify TypeScript compiles and app works**

Run: `npx tsc --noEmit`
Run: `npm run dev`

Navigate through the app — verify no pages crash. Specifically check:
- `/seguimiento-datos` (should load from Supabase)
- `/seguimiento-gg` (should load from Supabase)
- `/scouting` (should still work)
- Player detail pages (should still work)

- [ ] **Step 5: Commit**

```bash
git add src/constants/scoring.ts src/context/DataContext.tsx src/pages/PlayerDetailPage.tsx
git commit -m "feat: remove seguimiento CSV dependency, DataContext no longer loads monitoring from Sheets"
```

---

### Task 9: Final cleanup & verification

**Files:**
- Various cleanup across modified files

- [ ] **Step 1: Remove unused imports across all modified files**

Run: `npx tsc --noEmit` and fix any remaining type errors or unused import warnings.

Key things to check:
- `MonitoringPlayer` type — if no longer used anywhere, can be left in types but won't be imported
- `useMonitoringStatus` hook — MonitoringPage should use Supabase directly now; check if the hook is still needed or can be simplified
- `monitoringService.ts` — if MonitoringPage no longer uses it, check if anything else does. The `monitoring_status` table queries may be redundant if everything goes through `scout_players_status`
- `linkMonitoringToMetrics` function in DataContext — remove if no longer called
- `ScoutsGGBadge` component — check if it references old status types
- `LinkPlayerModal` — adapt to search Supabase `players` table instead of DataContext (for edge case: manually link descartados that didn't auto-match). Update the search query to use `supabase.from('players').select('id, name, photo, team:teams(name)').ilike('name', ...)` and call a new `linkScoutPlayerToSupabase(scoutPlayerId, supabasePlayerId)` function.

- [ ] **Step 2: Run full app verification**

Run: `npm run dev`

Test all pages:
1. `/scouting` — External scouting table with checkboxes, bulk add works
2. `/seguimiento-datos` — Loads from Supabase, 4 statuses, Score GG column
3. `/seguimiento-gg` — Loads from Supabase, 4 statuses, Score GG column, files/evaluations
4. `/jugador/SomePlayer?source=externo&apiId=123` — Detail page, TrackingWidget with supabase_player_id
5. Add a player from External → verify appears in tracking list with score
6. Change status in both tracking pages
7. Navigate from tracking list to player detail page

- [ ] **Step 3: Run build**

Run: `npm run build`

Verify no build errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: cleanup unused imports and types from tracking migration"
```
