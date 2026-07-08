# Radar Chart Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a radar chart to external scouting player detail pages showing player metrics vs position-league averages, with a league dropdown to compare across leagues.

**Architecture:** Pre-compute position metric averages in `recalc-scores` → store in `position_metric_averages` table → frontend fetches pre-computed averages → `MetricsRadarChart` component renders Recharts RadarChart with player values vs averages, normalized to 0-100.

**Tech Stack:** Supabase (table + edge function), React, Recharts RadarChart, TypeScript

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/functions/recalc-scores/index.ts` | Modify | Add metric averaging computation + upsert to `position_metric_averages` |
| `src/types/scoring.ts` | Modify | Add `PositionMetricAverages` interface |
| `src/constants/radarMetrics.ts` | Create | Define which metrics to display per position (labels, keys, compute fns) |
| `src/services/playerStatsService.ts` | Modify | Add `fetchPositionMetricAverages()` |
| `src/hooks/usePlayerStats.ts` | Modify | Add `usePositionMetricAverages()` hook |
| `src/components/charts/MetricsRadarChart.tsx` | Create | Recharts radar with player vs avg overlay + league dropdown |
| `src/components/players/SupabasePlayerDetail.tsx` | Modify | Wire up radar chart below evolution chart |

---

### Task 1: Create Supabase table

**Files:**
- Run SQL in Supabase SQL Editor (dashboard)

- [ ] **Step 1: Create `position_metric_averages` table**

Run this SQL in the Supabase SQL Editor at https://supabase.com/dashboard:

```sql
CREATE TABLE IF NOT EXISTS position_metric_averages (
  position text NOT NULL,
  league_id integer NOT NULL REFERENCES leagues(id),
  season integer NOT NULL,
  tackles_p90 real DEFAULT 0,
  interceptions_p90 real DEFAULT 0,
  blocks_p90 real DEFAULT 0,
  duels_won_pct real DEFAULT 0,
  passes_accuracy real DEFAULT 0,
  passes_key_p90 real DEFAULT 0,
  passes_total_p90 real DEFAULT 0,
  dribbles_success_p90 real DEFAULT 0,
  dribbles_pct real DEFAULT 0,
  shots_on_p90 real DEFAULT 0,
  shots_pct real DEFAULT 0,
  goals_p90 real DEFAULT 0,
  assists_p90 real DEFAULT 0,
  rating_avg real DEFAULT 0,
  fouls_drawn_p90 real DEFAULT 0,
  saves_p90 real DEFAULT 0,
  goals_conceded_p90 real DEFAULT 0,
  penalty_saved_avg real DEFAULT 0,
  clean_sheet_pct real DEFAULT 0,
  player_count integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (position, league_id, season)
);

ALTER TABLE position_metric_averages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON position_metric_averages FOR SELECT USING (true);
CREATE POLICY "Allow service write" ON position_metric_averages FOR ALL USING (true);
```

---

### Task 2: Add metric computation to recalc-scores

**Files:**
- Modify: `supabase/functions/recalc-scores/index.ts` (after the player_season_scores upsert loop, ~line 116)

The existing code already loads `allStats` for each league with fields `player_id, detected_position, team_id, match_score, rating, goals, assists, fixture_id`. We need to expand the select to include all metrics, then compute position averages.

- [ ] **Step 1: Expand the player_match_stats select**

In `supabase/functions/recalc-scores/index.ts`, find the query at ~line 60:

```typescript
.select('player_id, detected_position, team_id, match_score, rating, goals, assists, fixture_id')
```

Replace with:

```typescript
.select('player_id, detected_position, team_id, match_score, rating, goals, assists, fixture_id, minutes, tackles, interceptions, blocks, duels_total, duels_won, passes_accuracy, passes_key, passes_total, dribbles_success, dribbles_attempted, shots_on, shots_total, fouls_drawn, saves, goals_conceded, penalty_saved')
```

- [ ] **Step 2: Add metric averaging after the upsert loop**

After the `if (upsertRows.length > 0)` block (~line 116), and before the closing `}` of the `for (const league of leaguesForSeason)` loop, add:

```typescript
        // Compute position metric averages for this league
        const posMetrics = new Map<string, any[]>();
        for (const s of allStats) {
          if (s.minutes < 10) continue;
          const pos = s.detected_position;
          if (!posMetrics.has(pos)) posMetrics.set(pos, []);
          posMetrics.get(pos)!.push(s);
        }

        const metricRows = [];
        for (const [pos, rows] of posMetrics) {
          const n = rows.length;
          const p90 = (field: string) => {
            const vals = rows.filter((r: any) => r.minutes > 0).map((r: any) => ((r[field] ?? 0) / r.minutes) * 90);
            return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0;
          };
          const avg = (field: string) => {
            const vals = rows.map((r: any) => r[field] ?? 0).filter((v: number) => v > 0);
            return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0;
          };
          const pct = (num: string, den: string) => {
            const totN = rows.reduce((s: number, r: any) => s + (r[num] ?? 0), 0);
            const totD = rows.reduce((s: number, r: any) => s + (r[den] ?? 0), 0);
            return totD > 0 ? (totN / totD) * 100 : 0;
          };

          metricRows.push({
            position: pos,
            league_id: league.id,
            season,
            tackles_p90: Math.round(p90('tackles') * 100) / 100,
            interceptions_p90: Math.round(p90('interceptions') * 100) / 100,
            blocks_p90: Math.round(p90('blocks') * 100) / 100,
            duels_won_pct: Math.round(pct('duels_won', 'duels_total') * 100) / 100,
            passes_accuracy: Math.round(avg('passes_accuracy') * 100) / 100,
            passes_key_p90: Math.round(p90('passes_key') * 100) / 100,
            passes_total_p90: Math.round(p90('passes_total') * 100) / 100,
            dribbles_success_p90: Math.round(p90('dribbles_success') * 100) / 100,
            dribbles_pct: Math.round(pct('dribbles_success', 'dribbles_attempted') * 100) / 100,
            shots_on_p90: Math.round(p90('shots_on') * 100) / 100,
            shots_pct: Math.round(pct('shots_on', 'shots_total') * 100) / 100,
            goals_p90: Math.round(p90('goals') * 100) / 100,
            assists_p90: Math.round(p90('assists') * 100) / 100,
            rating_avg: Math.round(avg('rating') * 100) / 100,
            fouls_drawn_p90: Math.round(p90('fouls_drawn') * 100) / 100,
            saves_p90: Math.round(p90('saves') * 100) / 100,
            goals_conceded_p90: Math.round(p90('goals_conceded') * 100) / 100,
            penalty_saved_avg: Math.round(avg('penalty_saved') * 100) / 100,
            clean_sheet_pct: Math.round((rows.filter((r: any) => r.goals_conceded === 0).length / n) * 10000) / 100,
            player_count: n,
            updated_at: new Date().toISOString(),
          });
        }

        if (metricRows.length > 0) {
          await supabase.from('position_metric_averages').upsert(
            metricRows,
            { onConflict: 'position,league_id,season' }
          );
        }
```

- [ ] **Step 3: Deploy and run recalc-scores**

```bash
supabase functions deploy recalc-scores
```

Then trigger it:

```powershell
$body = '{"season": 2026}'
$headers = @{ "Authorization" = "Bearer <SERVICE_KEY>"; "Content-Type" = "application/json" }
Invoke-RestMethod -Uri "https://qgwmxjjumauortbwvivu.supabase.co/functions/v1/recalc-scores" -Method Post -Body $body -Headers $headers
```

Verify data exists:

```powershell
Invoke-RestMethod -Uri "https://qgwmxjjumauortbwvivu.supabase.co/rest/v1/position_metric_averages?select=*&limit=5" -Headers @{ "apikey" = "<KEY>"; "Authorization" = "Bearer <KEY>" }
```

---

### Task 3: Add TypeScript types

**Files:**
- Modify: `src/types/scoring.ts`

- [ ] **Step 1: Add PositionMetricAverages interface**

Add at the end of `src/types/scoring.ts`:

```typescript
export interface PositionMetricAverages {
  position: Position;
  league_id: number;
  season: number;
  tackles_p90: number;
  interceptions_p90: number;
  blocks_p90: number;
  duels_won_pct: number;
  passes_accuracy: number;
  passes_key_p90: number;
  passes_total_p90: number;
  dribbles_success_p90: number;
  dribbles_pct: number;
  shots_on_p90: number;
  shots_pct: number;
  goals_p90: number;
  assists_p90: number;
  rating_avg: number;
  fouls_drawn_p90: number;
  saves_p90: number;
  goals_conceded_p90: number;
  penalty_saved_avg: number;
  clean_sheet_pct: number;
  player_count: number;
}
```

---

### Task 4: Create radar metrics config

**Files:**
- Create: `src/constants/radarMetrics.ts`

- [ ] **Step 1: Define metrics per position**

Create `src/constants/radarMetrics.ts` with the metric definitions matching the scoring weights in `sync.py`. Each metric has: a `key` (matching `PositionMetricAverages` field), a `label` (short display name), and a `computePlayer` function that takes a `PlayerMatchStat[]` array and returns the player's average.

```typescript
import type { PlayerMatchStat, Position, PositionMetricAverages } from '@/types/scoring';

export interface RadarMetricDef {
  key: keyof PositionMetricAverages;
  label: string;
  computePlayer: (matches: PlayerMatchStat[]) => number;
}

function p90(matches: PlayerMatchStat[], field: keyof PlayerMatchStat): number {
  const valid = matches.filter(m => m.minutes >= 10);
  if (valid.length === 0) return 0;
  const vals = valid.map(m => ((m[field] as number) / m.minutes) * 90);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function avgField(matches: PlayerMatchStat[], field: keyof PlayerMatchStat): number {
  const valid = matches.filter(m => m.minutes >= 10);
  const vals = valid.map(m => m[field] as number).filter(v => v > 0);
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function pctField(matches: PlayerMatchStat[], num: keyof PlayerMatchStat, den: keyof PlayerMatchStat): number {
  const valid = matches.filter(m => m.minutes >= 10);
  const totN = valid.reduce((s, m) => s + (m[num] as number), 0);
  const totD = valid.reduce((s, m) => s + (m[den] as number), 0);
  return totD > 0 ? (totN / totD) * 100 : 0;
}

export const RADAR_METRICS: Record<Position, RadarMetricDef[]> = {
  ARQ: [
    { key: 'saves_p90', label: 'Atajadas', computePlayer: m => p90(m, 'saves') },
    { key: 'goals_conceded_p90', label: 'GC/90', computePlayer: m => p90(m, 'goals_conceded') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
    { key: 'penalty_saved_avg', label: 'Pen atajados', computePlayer: m => avgField(m, 'penalty_saved') },
    { key: 'clean_sheet_pct', label: 'Valla invicta %', computePlayer: m => {
      const valid = m.filter(x => x.minutes >= 10);
      return valid.length > 0 ? (valid.filter(x => x.goals_conceded === 0).length / valid.length) * 100 : 0;
    }},
  ],
  CB: [
    { key: 'duels_won_pct', label: 'Duelos %', computePlayer: m => pctField(m, 'duels_won', 'duels_total') },
    { key: 'tackles_p90', label: 'Tackles', computePlayer: m => p90(m, 'tackles') },
    { key: 'interceptions_p90', label: 'Intercepciones', computePlayer: m => p90(m, 'interceptions') },
    { key: 'blocks_p90', label: 'Bloqueos', computePlayer: m => p90(m, 'blocks') },
    { key: 'passes_accuracy', label: 'Pases %', computePlayer: m => avgField(m, 'passes_accuracy') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
    { key: 'passes_total_p90', label: 'Pases/90', computePlayer: m => p90(m, 'passes_total') },
  ],
  LD: [
    { key: 'duels_won_pct', label: 'Duelos %', computePlayer: m => pctField(m, 'duels_won', 'duels_total') },
    { key: 'passes_key_p90', label: 'Pases clave', computePlayer: m => p90(m, 'passes_key') },
    { key: 'dribbles_success_p90', label: 'Regates', computePlayer: m => p90(m, 'dribbles_success') },
    { key: 'assists_p90', label: 'Asistencias', computePlayer: m => p90(m, 'assists') },
    { key: 'tackles_p90', label: 'Tackles', computePlayer: m => p90(m, 'tackles') },
    { key: 'passes_accuracy', label: 'Pases %', computePlayer: m => avgField(m, 'passes_accuracy') },
    { key: 'interceptions_p90', label: 'Intercepciones', computePlayer: m => p90(m, 'interceptions') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
    { key: 'dribbles_pct', label: 'Regates %', computePlayer: m => pctField(m, 'dribbles_success', 'dribbles_attempted') },
  ],
  LI: [
    { key: 'duels_won_pct', label: 'Duelos %', computePlayer: m => pctField(m, 'duels_won', 'duels_total') },
    { key: 'passes_key_p90', label: 'Pases clave', computePlayer: m => p90(m, 'passes_key') },
    { key: 'dribbles_success_p90', label: 'Regates', computePlayer: m => p90(m, 'dribbles_success') },
    { key: 'assists_p90', label: 'Asistencias', computePlayer: m => p90(m, 'assists') },
    { key: 'tackles_p90', label: 'Tackles', computePlayer: m => p90(m, 'tackles') },
    { key: 'passes_accuracy', label: 'Pases %', computePlayer: m => avgField(m, 'passes_accuracy') },
    { key: 'interceptions_p90', label: 'Intercepciones', computePlayer: m => p90(m, 'interceptions') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
    { key: 'dribbles_pct', label: 'Regates %', computePlayer: m => pctField(m, 'dribbles_success', 'dribbles_attempted') },
  ],
  VC: [
    { key: 'tackles_p90', label: 'Tackles', computePlayer: m => p90(m, 'tackles') },
    { key: 'duels_won_pct', label: 'Duelos %', computePlayer: m => pctField(m, 'duels_won', 'duels_total') },
    { key: 'interceptions_p90', label: 'Intercepciones', computePlayer: m => p90(m, 'interceptions') },
    { key: 'passes_accuracy', label: 'Pases %', computePlayer: m => avgField(m, 'passes_accuracy') },
    { key: 'passes_total_p90', label: 'Pases/90', computePlayer: m => p90(m, 'passes_total') },
    { key: 'blocks_p90', label: 'Bloqueos', computePlayer: m => p90(m, 'blocks') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
    { key: 'passes_key_p90', label: 'Pases clave', computePlayer: m => p90(m, 'passes_key') },
  ],
  VI: [
    { key: 'duels_won_pct', label: 'Duelos %', computePlayer: m => pctField(m, 'duels_won', 'duels_total') },
    { key: 'passes_key_p90', label: 'Pases clave', computePlayer: m => p90(m, 'passes_key') },
    { key: 'dribbles_success_p90', label: 'Regates', computePlayer: m => p90(m, 'dribbles_success') },
    { key: 'assists_p90', label: 'Asistencias', computePlayer: m => p90(m, 'assists') },
    { key: 'goals_p90', label: 'Goles', computePlayer: m => p90(m, 'goals') },
    { key: 'passes_accuracy', label: 'Pases %', computePlayer: m => avgField(m, 'passes_accuracy') },
    { key: 'shots_on_p90', label: 'Tiros al arco', computePlayer: m => p90(m, 'shots_on') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
    { key: 'tackles_p90', label: 'Tackles', computePlayer: m => p90(m, 'tackles') },
    { key: 'dribbles_pct', label: 'Regates %', computePlayer: m => pctField(m, 'dribbles_success', 'dribbles_attempted') },
  ],
  EXT: [
    { key: 'dribbles_success_p90', label: 'Regates', computePlayer: m => p90(m, 'dribbles_success') },
    { key: 'goals_p90', label: 'Goles', computePlayer: m => p90(m, 'goals') },
    { key: 'assists_p90', label: 'Asistencias', computePlayer: m => p90(m, 'assists') },
    { key: 'passes_key_p90', label: 'Pases clave', computePlayer: m => p90(m, 'passes_key') },
    { key: 'shots_on_p90', label: 'Tiros al arco', computePlayer: m => p90(m, 'shots_on') },
    { key: 'duels_won_pct', label: 'Duelos %', computePlayer: m => pctField(m, 'duels_won', 'duels_total') },
    { key: 'dribbles_pct', label: 'Regates %', computePlayer: m => pctField(m, 'dribbles_success', 'dribbles_attempted') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
    { key: 'fouls_drawn_p90', label: 'Faltas recibidas', computePlayer: m => p90(m, 'fouls_drawn') },
  ],
  DEL: [
    { key: 'goals_p90', label: 'Goles', computePlayer: m => p90(m, 'goals') },
    { key: 'shots_on_p90', label: 'Tiros al arco', computePlayer: m => p90(m, 'shots_on') },
    { key: 'assists_p90', label: 'Asistencias', computePlayer: m => p90(m, 'assists') },
    { key: 'shots_pct', label: 'Tiros %', computePlayer: m => pctField(m, 'shots_on', 'shots_total') },
    { key: 'passes_key_p90', label: 'Pases clave', computePlayer: m => p90(m, 'passes_key') },
    { key: 'duels_won_pct', label: 'Duelos %', computePlayer: m => pctField(m, 'duels_won', 'duels_total') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
    { key: 'dribbles_success_p90', label: 'Regates', computePlayer: m => p90(m, 'dribbles_success') },
    { key: 'fouls_drawn_p90', label: 'Faltas recibidas', computePlayer: m => p90(m, 'fouls_drawn') },
  ],
};
```

---

### Task 5: Add service function and hook

**Files:**
- Modify: `src/services/playerStatsService.ts`
- Modify: `src/hooks/usePlayerStats.ts`

- [ ] **Step 1: Add fetchPositionMetricAverages to playerStatsService.ts**

Add at the end of `src/services/playerStatsService.ts`:

```typescript
export async function fetchPositionMetricAverages(
  season?: number
): Promise<PositionMetricAverages[]> {
  const seasons = season ? [season] : currentSeasons();

  const { data, error } = await supabase
    .from('position_metric_averages')
    .select('*')
    .in('season', seasons);

  if (error) throw error;
  return data ?? [];
}
```

Also add `PositionMetricAverages` to the imports at the top:

```typescript
import type {
  PlayerWithScore,
  PlayerMatchStat,
  PlayerSeasonScore,
  PositionAverage,
  PositionMetricAverages,
  Position,
  LeagueInfo,
} from '@/types/scoring';
```

- [ ] **Step 2: Add usePositionMetricAverages hook**

Add to `src/hooks/usePlayerStats.ts`:

```typescript
import {
  fetchPlayersList,
  fetchPlayerDetail,
  fetchPositionAverages,
  fetchPositionMetricAverages,
  fetchLeagues,
  fetchPlayerMatchHistory,
  fetchScoreLookup,
  type ScoreLookupEntry,
} from '@/services/playerStatsService';
import type { PlayerWithScore, PlayerMatchStat, PositionAverage, PositionMetricAverages, LeagueInfo, Position } from '@/types/scoring';
```

Then add the hook function:

```typescript
export function usePositionMetricAverages() {
  const [averages, setAverages] = useState<PositionMetricAverages[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = getCached<PositionMetricAverages[]>('posMetricAvg', 240);
    if (cached) { setAverages(cached); setLoading(false); return; }

    fetchPositionMetricAverages()
      .then(data => { setAverages(data); setCache('posMetricAvg', data); })
      .finally(() => setLoading(false));
  }, []);

  return { metricAverages: averages, loading };
}
```

---

### Task 6: Build MetricsRadarChart component

**Files:**
- Create: `src/components/charts/MetricsRadarChart.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/charts/MetricsRadarChart.tsx`. This component:
- Takes `matches: PlayerMatchStat[]`, `position: Position`, `metricAverages: PositionMetricAverages[]`, `playerLeagueId: number`, `leagues: LeagueInfo[]`
- Computes player metric values from matches using `RADAR_METRICS[position]`
- Shows a dropdown to select comparison league (default = player's league)
- Finds the matching `PositionMetricAverages` row for `position + selectedLeagueId`
- Normalizes both player and average values to 0-100 scale relative to max(playerVal, avgVal, smallEpsilon) so the radar axes are comparable
- Renders a Recharts `RadarChart` with two `Radar` areas: player (green) and average (gray)
- Tooltip shows exact values on hover
- Special handling for `goals_conceded_p90` (inverse: lower is better)

Key implementation details:
- Use `ResponsiveContainer` for responsive sizing
- Green fill (#22c55e at 30% opacity) for player, gray stroke for average
- Labels on each vertex with the metric name
- The dropdown uses the same styling as other dropdowns in the app (dark theme compatible)
- If no metric averages available for selected league-position, show "Sin datos de comparación"

---

### Task 7: Integrate into SupabasePlayerDetail

**Files:**
- Modify: `src/components/players/SupabasePlayerDetail.tsx`

- [ ] **Step 1: Add imports and hooks**

Add to imports:

```typescript
import MetricsRadarChart from '@/components/charts/MetricsRadarChart'
import { usePositionMetricAverages, useLeagues } from '@/hooks/usePlayerStats'
```

Add hooks inside the component (after existing hooks):

```typescript
const { metricAverages } = usePositionMetricAverages()
const leagues = useLeagues()
```

- [ ] **Step 2: Add radar chart section**

In the right content column, after the ScoreEvolutionChart section (~line 198) and before the match history table (~line 200), add:

```tsx
          {/* Metrics radar chart */}
          {matches.length > 0 && activePosition && (
            <div className="card-apple p-5">
              <MetricsRadarChart
                matches={matches}
                position={activePosition}
                metricAverages={metricAverages}
                playerLeagueId={activeScore?.league_id ?? player.team?.league_id ?? 0}
                leagues={leagues}
              />
            </div>
          )}
```

---

### Task 8: Verify

- [ ] **Step 1: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Visual test**

Open http://localhost:5173/scouting, click any player with match stats. Verify:
- Radar chart appears below evolution chart
- Player area (green) shows their metrics
- Average area (gray) shows position-league averages
- League dropdown works and switches the comparison
- Tooltip shows exact values
- Works for all positions (ARQ, CB, LD, LI, VC, VI, EXT, DEL)
