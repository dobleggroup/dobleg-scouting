# Transfermarkt Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Transfermarkt data in the player detail page, track market value history for Doble G players in Supabase, and auto-enrich new players via Edge Function + DB trigger + weekly cron.

**Architecture:** Feature 1 is pure frontend (data already arrives from `fetchPlayerDetail`). Feature 2 adds a `market_value_history` table, a service function, a hook, and wires the existing `MarketValueChart` into `SupabasePlayerDetail`. Feature 3 creates a Supabase Edge Function porting `enrich.py` logic to Deno/TypeScript, with a DB trigger for new players and a pg_cron job for weekly refresh.

**Tech Stack:** React 18, TypeScript, Supabase (Edge Functions / Deno, pg_cron, pg_net), Recharts, Tailwind CSS

---

### Task 1: Show Transfermarkt data in SupabasePlayerDetail sidebar

**Files:**
- Modify: `src/components/players/SupabasePlayerDetail.tsx:98-120`

The data (`market_value_eur`, `contract_end_date`, `agent`, `transfermarkt_url`) already arrives from `fetchPlayerDetail()` → `PlayerProfile` type. We just need to render it.

- [ ] **Step 1: Add market profile section after info pills**

In `src/components/players/SupabasePlayerDetail.tsx`, after the closing `</div>` of the info pills block (line 120) and before the `{/* Score gauge */}` comment (line 122), add:

```tsx
              {/* Market profile */}
              {(player.market_value_eur || player.contract_end_date || player.agent) && (
                <div className="border-t border-apple-gray-100 dark:border-apple-gray-800 pt-3 mt-1 space-y-2">
                  {player.market_value_eur && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-apple-gray-500">Valor de mercado</span>
                      {player.transfermarkt_url ? (
                        <a
                          href={player.transfermarkt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-bold text-brand-green hover:underline"
                        >
                          €{formatMarketValue(player.market_value_eur)}
                        </a>
                      ) : (
                        <span className="text-sm font-bold text-brand-green">
                          €{formatMarketValue(player.market_value_eur)}
                        </span>
                      )}
                    </div>
                  )}
                  {player.contract_end_date && (() => {
                    const months = Math.round(
                      (new Date(player.contract_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44)
                    )
                    const color = months > 18
                      ? 'text-emerald-500 bg-emerald-500/10'
                      : months > 6
                        ? 'text-amber-500 bg-amber-500/10'
                        : 'text-red-500 bg-red-500/10'
                    const label = months <= 0
                      ? 'Vencido'
                      : `${months} mes${months !== 1 ? 'es' : ''}`
                    return (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-apple-gray-500">Contrato</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${color}`}>
                          {label}
                        </span>
                      </div>
                    )
                  })()}
                  {player.agent && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-apple-gray-500">Agente</span>
                      <span className="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300 text-right max-w-[60%] truncate" title={player.agent}>
                        {player.agent}
                      </span>
                    </div>
                  )}
                </div>
              )}
```

- [ ] **Step 2: Add formatMarketValue helper at top of file**

After the `getAge` function (line 23), add:

```tsx
function formatMarketValue(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000
    return `${m >= 10 ? m.toFixed(0) : m.toFixed(1)}M`
  }
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return String(value)
}
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`
Navigate to a player that has Transfermarkt data (e.g., from ExternalScoutingPage click a player).
Verify: market value, contract badge, and agent appear in sidebar. If no TM data, the section is hidden.

- [ ] **Step 4: Commit**

```bash
git add src/components/players/SupabasePlayerDetail.tsx
git commit -m "feat: show Transfermarkt data (market value, contract, agent) in player detail sidebar"
```

---

### Task 2: Create market_value_history table migration

**Files:**
- Create: `supabase/migrations/20260528_market_value_history.sql`

- [ ] **Step 1: Write migration**

```sql
CREATE TABLE IF NOT EXISTS market_value_history (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  value_eur INTEGER NOT NULL,
  club_name TEXT,
  UNIQUE(player_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_mvh_player ON market_value_history(player_id);
CREATE INDEX IF NOT EXISTS idx_mvh_date ON market_value_history(recorded_at);
```

- [ ] **Step 2: Apply migration to Supabase**

Run from Supabase dashboard SQL Editor or via CLI:
```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260528_market_value_history.sql
git commit -m "feat: add market_value_history table for tracking market value over time"
```

---

### Task 3: Backfill market_value_history from TM API

**Files:**
- Create: `scripts/backfill-market-value-history.mjs`

This script takes the DG player list (with TM IDs) from the existing `scrape-market-values.mjs`, fetches market value history from TM API, and writes directly to Supabase instead of CSV.

- [ ] **Step 1: Write backfill script**

```javascript
/**
 * Backfill market_value_history in Supabase from Transfermarkt API.
 * Only for Doble G agency players.
 *
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/backfill-market-value-history.mjs
 */

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const TM_API_BASE = 'https://tmapi-alpha.transfermarkt.technology'
const DELAY_MS = 800

const API_HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.transfermarkt.es',
  'Referer': 'https://www.transfermarkt.es/',
}

const SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates',
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function sbQuery(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { ...SB_HEADERS, 'Prefer': 'return=representation' },
  })
  if (!res.ok) throw new Error(`Supabase GET ${path}: ${res.status}`)
  return res.json()
}

async function sbUpsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase POST ${table}: ${res.status} ${text.slice(0, 200)}`)
  }
}

async function getMarketValueHistory(tmId) {
  const res = await fetch(`${TM_API_BASE}/player/${tmId}/market-value-history`, {
    headers: API_HEADERS,
  })
  if (!res.ok) throw new Error(`TM API: ${res.status}`)
  const data = await res.json()
  return data?.data?.history || []
}

const clubCache = {}
async function getClubName(clubId) {
  if (!clubId) return null
  if (clubCache[clubId]) return clubCache[clubId]
  try {
    const res = await fetch(`${TM_API_BASE}/club/${clubId}`, { headers: API_HEADERS })
    if (!res.ok) return null
    const data = await res.json()
    const name = data?.data?.name || null
    clubCache[clubId] = name
    return name
  } catch { return null }
}

async function main() {
  // Get all players that have a transfermarkt_id
  const players = await sbQuery(
    'players?select=id,name,transfermarkt_id&transfermarkt_id=not.is.null'
  )

  // Get DG player IDs (players tracked by the agency - those with specific TM IDs)
  // We identify DG players by their transfermarkt_id being in our known list
  const DG_TM_IDS = new Set([
    639152, 621370, 697408, 636784, 1046802, 992527, 728262, 1101427,
    249794, 843537, 1221014, 579977, 535028, 538538, 1000674, 1029299,
    1322847, 625203, 1110143, 1377439, 1069809, 441408, 437962, 1027280,
    742512, 1341520, 890130, 642757, 983999, 1001697, 1198161,
  ])

  const dgPlayers = players.filter(p => DG_TM_IDS.has(p.transfermarkt_id))
  console.log(`\nFound ${dgPlayers.length} Doble G players with TM IDs\n`)

  let totalRows = 0
  const results = { success: [], failed: [], noData: [] }

  for (let i = 0; i < dgPlayers.length; i++) {
    const player = dgPlayers[i]
    process.stdout.write(`[${i + 1}/${dgPlayers.length}] ${player.name} (TM#${player.transfermarkt_id}) ... `)

    try {
      const history = await getMarketValueHistory(player.transfermarkt_id)

      if (history.length === 0) {
        console.log('no data')
        results.noData.push(player.name)
        await sleep(DELAY_MS)
        continue
      }

      // Resolve club names
      const clubIds = [...new Set(history.map(h => h.clubId).filter(Boolean))]
      for (const cid of clubIds) {
        await getClubName(cid)
        await sleep(100)
      }

      // Build rows for upsert
      const rows = history
        .filter(entry => entry.marketValue?.value > 0 && entry.marketValue?.determined)
        .map(entry => ({
          player_id: player.id,
          recorded_at: entry.marketValue.determined,
          value_eur: entry.marketValue.value,
          club_name: clubCache[entry.clubId] || null,
        }))

      if (rows.length > 0) {
        // Upsert in chunks of 100
        for (let j = 0; j < rows.length; j += 100) {
          await sbUpsert('market_value_history', rows.slice(j, j + 100))
        }
        totalRows += rows.length
        console.log(`${rows.length} entries`)
        results.success.push(`${player.name} (${rows.length})`)
      } else {
        console.log('no valid entries')
        results.noData.push(player.name)
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
      results.failed.push(player.name)
    }

    await sleep(DELAY_MS)
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Done! ${totalRows} total rows inserted/updated`)
  console.log(`Success: ${results.success.length} | No data: ${results.noData.length} | Failed: ${results.failed.length}`)
  if (results.failed.length > 0) console.log(`Failed: ${results.failed.join(', ')}`)
}

main().catch(console.error)
```

- [ ] **Step 2: Run the backfill**

```bash
SUPABASE_URL=https://qgwmxjjumauortbwvivu.supabase.co SUPABASE_SERVICE_KEY=<key> node scripts/backfill-market-value-history.mjs
```

Verify in Supabase dashboard that `market_value_history` has rows.

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-market-value-history.mjs
git commit -m "feat: backfill script for market_value_history from Transfermarkt API"
```

---

### Task 4: Add service + hook for market value history

**Files:**
- Modify: `src/services/playerStatsService.ts` (add `fetchMarketValueHistory`)
- Modify: `src/hooks/usePlayerStats.ts` (add `useMarketValueHistory`)

- [ ] **Step 1: Add fetchMarketValueHistory to service**

At the end of `src/services/playerStatsService.ts`, before the last export, add:

```typescript
export interface MarketValueHistoryRow {
  player_id: number;
  recorded_at: string;
  value_eur: number;
  club_name: string | null;
}

export async function fetchMarketValueHistory(
  playerId: number
): Promise<MarketValueHistoryRow[]> {
  const { data, error } = await supabase
    .from('market_value_history')
    .select('player_id, recorded_at, value_eur, club_name')
    .eq('player_id', playerId)
    .order('recorded_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 2: Add useMarketValueHistory hook**

At the end of `src/hooks/usePlayerStats.ts`, add:

```typescript
import { fetchMarketValueHistory, type MarketValueHistoryRow } from '@/services/playerStatsService';

// (add to existing imports at top of file)

export function useMarketValueHistory(playerId: number | null) {
  const [data, setData] = useState<MarketValueHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!playerId) return;
    const key = `mvh-${playerId}`;
    const cached = getCached<MarketValueHistoryRow[]>(key, 60);
    if (cached) { setData(cached); return; }

    let cancelled = false;
    setLoading(true);
    fetchMarketValueHistory(playerId).then(rows => {
      if (cancelled) return;
      setData(rows);
      setCache(key, rows);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [playerId]);

  return { data, loading };
}
```

Note: `fetchMarketValueHistory` and `MarketValueHistoryRow` must be added to the existing import from `@/services/playerStatsService` at the top of the file.

- [ ] **Step 3: Commit**

```bash
git add src/services/playerStatsService.ts src/hooks/usePlayerStats.ts
git commit -m "feat: add service + hook for market value history from Supabase"
```

---

### Task 5: Wire MarketValueChart into SupabasePlayerDetail

**Files:**
- Modify: `src/components/players/SupabasePlayerDetail.tsx`

The existing `MarketValueChart` component expects `MarketValueHistoryEntry` from `src/types/index.ts` with fields `{ Jugador, idTM, fecha: Date, valor, equipo, edad }`. We'll adapt the Supabase rows to that shape.

- [ ] **Step 1: Add imports and hook call**

At the top of `src/components/players/SupabasePlayerDetail.tsx`, add to imports:

```typescript
import MarketValueChart from '@/components/charts/MarketValueChart'
import { useMarketValueHistory } from '@/hooks/usePlayerStats'
import type { MarketValueHistoryEntry } from '@/types'
```

Inside the `SupabasePlayerDetail` component, after the `const { matches } = ...` line (around line 37), add:

```typescript
  const { data: mvHistory } = useMarketValueHistory(playerId)

  const marketValueData = useMemo<MarketValueHistoryEntry[]>(() => {
    if (!data || mvHistory.length === 0) return []
    return mvHistory.map(row => ({
      Jugador: data.player.name,
      idTM: String(data.player.transfermarkt_id ?? ''),
      fecha: new Date(row.recorded_at),
      valor: row.value_eur,
      equipo: row.club_name ?? '',
      edad: 0,
    }))
  }, [data, mvHistory])
```

- [ ] **Step 2: Add the chart in the right column**

In the right content area (`lg:col-span-8`), before the match history table (before `{/* Match history table */}`), add:

```tsx
          {/* Market value evolution (only if history exists = DG player) */}
          {marketValueData.length > 0 && (
            <div className="card-apple p-5">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                <div>
                  <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">
                    Evolución valor de mercado
                  </h3>
                  <p className="text-xs text-apple-gray-400">
                    Historial según Transfermarkt
                  </p>
                </div>
              </div>
              <MarketValueChart data={marketValueData} playerName={player.name} />
            </div>
          )}
```

- [ ] **Step 3: Add useMemo to imports if not already present**

Verify `useMemo` is in the React import at line 1. It should already be: `import { useState, useMemo, useEffect, useCallback } from 'react'`. If not, add it.

- [ ] **Step 4: Verify in browser**

Navigate to a DG player's detail page. Verify market value chart appears. Navigate to a non-DG player — chart should not appear.

- [ ] **Step 5: Commit**

```bash
git add src/components/players/SupabasePlayerDetail.tsx
git commit -m "feat: show market value history chart in player detail for DG players"
```

---

### Task 6: Create the enrich-player Edge Function

**Files:**
- Create: `supabase/functions/enrich-player/index.ts`

This ports the logic from `scripts/enrich-transfermarkt/enrich.py` to Deno/TypeScript for Supabase Edge Functions.

- [ ] **Step 1: Write the Edge Function**

```typescript
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';

const TM_API_BASE = 'https://tmapi-alpha.transfermarkt.technology';
const TM_HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.transfermarkt.es',
  'Referer': 'https://www.transfermarkt.es/',
};
const WEB_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

const DG_TM_IDS = new Set([
  639152, 621370, 697408, 636784, 1046802, 992527, 728262, 1101427,
  249794, 843537, 1221014, 579977, 535028, 538538, 1000674, 1029299,
  1322847, 625203, 1110143, 1377439, 1069809, 441408, 437962, 1027280,
  742512, 1341520, 890130, 642757, 983999, 1001697, 1198161,
]);

function norm(s: string): string {
  return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function parseMarketValueText(text: string): number | null {
  if (!text) return null;
  const m = text.replace(/\xa0/g, ' ').trim().match(/€([\d,.]+)\s*(m|k|bn)?/i);
  if (!m) return null;
  const num = parseFloat(m[1].replace(',', '.'));
  if (isNaN(num)) return null;
  const suffix = (m[2] || '').toLowerCase();
  if (suffix === 'm') return Math.round(num * 1_000_000);
  if (suffix === 'k') return Math.round(num * 1_000);
  if (suffix === 'bn') return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

async function fetchUrl(url: string, headers: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function searchTmHtml(name: string): Promise<Array<{
  tm_id: number; name: string; club: string; market_value_text: string;
}>> {
  const encoded = encodeURIComponent(name);
  const url = `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encoded}&Spieler_page=1`;
  const html = await fetchUrl(url, WEB_HEADERS);
  if (!html) return [];

  const results: Array<{ tm_id: number; name: string; club: string; market_value_text: string }> = [];
  const rowRegex = /<tr class="(?:odd|even)">\s*<td><table class="inline-table">([\s\S]*?)<\/table><\/td>([\s\S]*?)<\/tr>/g;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const inlineTable = match[1];
    const restCols = match[2];

    const tmIdM = inlineTable.match(/profil\/spieler\/(\d+)/);
    const nameM = inlineTable.match(/class="hauptlink"><a[^>]*title="([^"]*)"/);
    if (!tmIdM || !nameM) continue;

    const clubMatches = [...inlineTable.matchAll(/<a[^>]*title="([^"]*)"[^>]*href="[^"]*startseite\/verein/g)];
    const mvM = restCols.match(/class="rechts hauptlink">([\s\S]*?)<\/td>/);
    const mvText = mvM ? mvM[1].replace(/<[^>]+>/g, '').trim() : '';

    results.push({
      tm_id: parseInt(tmIdM[1]),
      name: nameM[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"'),
      club: clubMatches.length > 0 ? clubMatches[0][1].replace(/&amp;/g, '&') : '',
      market_value_text: mvText,
    });
  }
  return results;
}

function matchPlayer(
  results: Array<{ tm_id: number; name: string; club: string; market_value_text: string }>,
  playerName: string,
  teamName?: string | null,
): typeof results[0] | null {
  const target = norm(playerName);
  const targetParts = target.split(/\s+/);
  const targetLast = targetParts[targetParts.length - 1] || '';
  const teamNorm = teamName ? norm(teamName) : '';

  let best: typeof results[0] | null = null;
  let bestScore = -1;

  for (const r of results) {
    const rNorm = norm(r.name);
    const rParts = rNorm.split(/\s+/);
    const rLast = rParts[rParts.length - 1] || '';

    let score = 0;
    if (rNorm === target) score += 10;
    else if (rLast === targetLast) {
      score += 5;
      if (rParts[0]?.[0] === targetParts[0]?.[0]) score += 2;
    }
    if (score === 0) continue;

    if (teamNorm) {
      const rTeam = norm(r.club);
      if (teamNorm.includes(rTeam) || rTeam.includes(teamNorm)) score += 3;
    }

    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

interface TmProfile {
  [key: string]: any;
}

async function tmProfile(tmId: number): Promise<TmProfile | null> {
  const raw = await fetchUrl(`${TM_API_BASE}/player/${tmId}`, TM_HEADERS);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data.data ?? data;
  } catch { return null; }
}

function extractBirthDate(profile: TmProfile): string | null {
  const ld = profile.lifeDates ?? {};
  const dob = ld.dateOfBirth ?? profile.dateOfBirth ?? profile.birthDate;
  if (dob && typeof dob === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dob)) return dob.slice(0, 10);
  return null;
}

function extractContractEnd(profile: TmProfile): string | null {
  const attrs = profile.attributes ?? {};
  const val = attrs.contractUntil ?? profile.contractEndDate ?? profile.contractExpiryDate;
  if (val && typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
  return null;
}

function extractAgent(profile: TmProfile): string | null {
  const attrs = profile.attributes ?? {};
  const agency = attrs.consultantAgency;
  if (agency && typeof agency === 'object') return agency.name ?? null;
  const agent = profile.agent ?? profile.playerAgent;
  if (agent && typeof agent === 'object') return agent.name ?? agent.agentName ?? null;
  if (agent && typeof agent === 'string' && agent.trim()) return agent.trim();
  return null;
}

function extractMarketValue(profile: TmProfile): number | null {
  const mv = profile.marketValueDetails;
  if (mv && typeof mv === 'object') {
    const current = mv.current;
    if (current && typeof current === 'object' && current.value) return Math.round(current.value);
  }
  const mv2 = profile.marketValue ?? profile.currentMarketValue;
  if (typeof mv2 === 'number') return Math.round(mv2);
  return null;
}

function buildTmUrl(profile: TmProfile, tmId: number): string {
  const rel = profile.relativeUrl ?? profile.url ?? profile.profileUrl;
  if (rel && typeof rel === 'string') {
    return rel.startsWith('http') ? rel : `https://www.transfermarkt.com${rel}`;
  }
  const slug = (profile.name ?? 'player').toLowerCase().replace(/\s+/g, '-');
  return `https://www.transfermarkt.com/${slug}/profil/spieler/${tmId}`;
}

async function enrichSingle(supabase: ReturnType<typeof getSupabaseAdmin>, playerId: number) {
  const { data: player } = await supabase
    .from('players')
    .select('id, name, current_team_id, transfermarkt_id, market_value_eur, birth_date')
    .eq('id', playerId)
    .single();

  if (!player) return { error: 'Player not found' };

  let teamName: string | null = null;
  if (player.current_team_id) {
    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', player.current_team_id)
      .single();
    teamName = team?.name ?? null;
  }

  let tmId = player.transfermarkt_id;
  let mvFromSearch: number | null = null;

  if (!tmId) {
    let results = await searchTmHtml(player.name);
    if (results.length === 0) {
      const parts = player.name.split(' ');
      if (parts.length > 1) results = await searchTmHtml(parts[parts.length - 1]);
    }
    const matched = results.length > 0 ? matchPlayer(results, player.name, teamName) : null;
    if (!matched) return { status: 'not_found', player: player.name };
    tmId = matched.tm_id;
    mvFromSearch = parseMarketValueText(matched.market_value_text);
  }

  const profile = await tmProfile(tmId);
  const patch: Record<string, any> = { transfermarkt_id: tmId };

  if (profile) {
    const mv = extractMarketValue(profile);
    patch.market_value_eur = mv ?? mvFromSearch;
    const contractEnd = extractContractEnd(profile);
    if (contractEnd) patch.contract_end_date = contractEnd;
    const agent = extractAgent(profile);
    if (agent) patch.agent = agent;
    const birthDate = extractBirthDate(profile);
    if (birthDate && !player.birth_date) patch.birth_date = birthDate;
    patch.transfermarkt_url = buildTmUrl(profile, tmId);
  } else {
    if (mvFromSearch) patch.market_value_eur = mvFromSearch;
    patch.transfermarkt_url = `https://www.transfermarkt.com/x/profil/spieler/${tmId}`;
  }

  await supabase.from('players').update(patch).eq('id', playerId);

  return { status: 'enriched', player: player.name, fields: Object.keys(patch) };
}

async function refreshAll(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data: players } = await supabase
    .from('players')
    .select('id, name, transfermarkt_id, current_team_id')
    .not('transfermarkt_id', 'is', null);

  if (!players || players.length === 0) return { status: 'no_players' };

  const results = { updated: 0, errors: 0, history_inserted: 0 };
  const today = new Date().toISOString().split('T')[0];

  for (const player of players) {
    try {
      const profile = await tmProfile(player.transfermarkt_id);
      if (!profile) { results.errors++; continue; }

      const mv = extractMarketValue(profile);
      const contractEnd = extractContractEnd(profile);
      const agent = extractAgent(profile);

      const patch: Record<string, any> = {};
      if (mv !== null) patch.market_value_eur = mv;
      if (contractEnd) patch.contract_end_date = contractEnd;
      if (agent) patch.agent = agent;

      if (Object.keys(patch).length > 0) {
        await supabase.from('players').update(patch).eq('id', player.id);
        results.updated++;
      }

      // Track market value history for DG players
      if (mv !== null && DG_TM_IDS.has(player.transfermarkt_id)) {
        let clubName: string | null = null;
        if (player.current_team_id) {
          const { data: team } = await supabase
            .from('teams').select('name').eq('id', player.current_team_id).single();
          clubName = team?.name ?? null;
        }
        await supabase.from('market_value_history').upsert({
          player_id: player.id,
          recorded_at: today,
          value_eur: mv,
          club_name: clubName,
        }, { onConflict: 'player_id,recorded_at' });
        results.history_inserted++;
      }

      // Rate limit: 500ms between TM API calls
      await new Promise(r => setTimeout(r, 500));
    } catch {
      results.errors++;
    }
  }

  return { status: 'done', ...results };
}

serve(async (req) => {
  const supabase = getSupabaseAdmin();
  let body: { mode?: string; player_id?: number } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }

  const mode = body.mode ?? 'single';

  if (mode === 'single' && body.player_id) {
    const result = await enrichSingle(supabase, body.player_id);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (mode === 'refresh') {
    const result = await refreshAll(supabase);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Invalid mode or missing player_id' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/enrich-player/index.ts
git commit -m "feat: enrich-player Edge Function (single + refresh modes)"
```

---

### Task 7: Add DB trigger + pg_cron for auto-enrichment

**Files:**
- Create: `supabase/migrations/20260528_enrich_trigger_and_cron.sql`

This migration adds the AFTER INSERT trigger on `players` and the weekly cron job, using the same pattern as the existing `20260521204103_setup_pg_cron.sql`.

- [ ] **Step 1: Write migration**

Note: uses the same Supabase URL and anon key pattern as the existing cron jobs in `20260521204103_setup_pg_cron.sql`.

```sql
-- Trigger: enrich new players via Edge Function
CREATE OR REPLACE FUNCTION enrich_new_player() RETURNS trigger AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://qgwmxjjumauortbwvivu.supabase.co/functions/v1/enrich-player',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnd214amp1bWF1b3J0Ynd2aXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODI4ODAsImV4cCI6MjA4ODY1ODg4MH0.sDJ6P9bOa-VrjpxZgD_umuIPFiGsonVs0bQtzdYw37E"}'::jsonb,
    body := jsonb_build_object('mode', 'single', 'player_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enrich_new_player
  AFTER INSERT ON players
  FOR EACH ROW
  EXECUTE FUNCTION enrich_new_player();

-- Cron: weekly refresh of TM data (Sundays 3am UTC)
SELECT cron.schedule(
  'refresh-transfermarkt-weekly',
  '0 3 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://qgwmxjjumauortbwvivu.supabase.co/functions/v1/enrich-player',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnd214amp1bWF1b3J0Ynd2aXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODI4ODAsImV4cCI6MjA4ODY1ODg4MH0.sDJ6P9bOa-VrjpxZgD_umuIPFiGsonVs0bQtzdYw37E"}'::jsonb,
    body := '{"mode": "refresh"}'::jsonb
  );
  $$
);
```

- [ ] **Step 2: Apply migration**

Run from Supabase dashboard SQL Editor or:
```bash
npx supabase db push
```

- [ ] **Step 3: Deploy Edge Function**

```bash
npx supabase functions deploy enrich-player --no-verify-jwt
```

The `--no-verify-jwt` flag allows the function to be called from pg_cron/pg_net without JWT verification (it uses the anon key in headers for auth).

- [ ] **Step 4: Test the trigger**

Insert a test player via Supabase dashboard SQL editor or API. Check that `transfermarkt_id`, `market_value_eur`, etc. get populated within a few seconds.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528_enrich_trigger_and_cron.sql
git commit -m "feat: DB trigger + weekly cron for auto Transfermarkt enrichment"
```

---

### Task 8: Final verification

- [ ] **Step 1: Verify player detail shows TM data**

Open `npm run dev`, navigate to ExternalScoutingPage, click a player with TM data. Verify sidebar shows market value, contract badge, and agent.

- [ ] **Step 2: Verify market value chart for DG player**

Navigate to a Doble G player (e.g., Gianluca Prestianni). Verify the market value evolution chart appears in the right column.

- [ ] **Step 3: Verify chart hidden for non-DG player**

Navigate to a non-DG player. Verify no market value chart section appears.

- [ ] **Step 4: Verify auto-enrichment trigger**

Check Supabase Edge Function logs for `enrich-player` invocations after a player INSERT.

- [ ] **Step 5: Final commit with all changes**

If any unstaged fixes remain:
```bash
git add -A
git commit -m "chore: final adjustments for Transfermarkt enrichment features"
```
