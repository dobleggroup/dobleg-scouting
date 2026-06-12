# Pertenencia dinámica a Doble G — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir marcar/desmarcar a un jugador como parte de Doble G desde su ficha (externo e interno), persistido en Supabase, de modo que aparezca automáticamente en Dashboard, Home, Calendario, scoring e Interno; con resolución best-effort de su equipo (API-Football) y carga manual de próximos partidos cuando la API no los trae.

**Architecture:** Modelo híbrido — los 41 jugadores actuales quedan hardcodeados como `BASE_AGENCY_PLAYERS` (fallback resiliente); una tabla `agency_players` en Supabase guarda **altas y bajas**. Un servicio fusiona `base − bajas + altas` en un cache de módulo que los 9 consumidores leen de forma síncrona vía las funciones helper existentes (sin cambiar su lógica). `DataContext` carga el overlay al iniciar, expone la lista a React y fusiona los agregados en `internal`. Una tabla `agency_manual_fixtures` cubre el calendario cuando no hay datos de API.

**Tech Stack:** React 18 + TypeScript, Vite 7, Supabase JS, Tailwind. Tests con Vitest (se agrega en Task 1) solo para la lógica pura del servicio; el resto se verifica con `npm run build` (typecheck) + uso manual.

---

## Estructura de archivos

**Crear:**
- `vitest.config.ts` — config de tests (Task 1)
- `supabase/migrations/20260612_agency_players.sql` — tabla de altas/bajas (Task 2)
- `supabase/migrations/20260612_agency_manual_fixtures.sql` — fixtures manuales (Task 11)
- `src/services/agencyPlayersService.ts` — overlay Supabase + fusión + cache + add/remove (Task 3-4)
- `src/services/agencyPlayersService.test.ts` — tests de fusión/matching (Task 3-4)
- `src/services/agencyManualFixturesService.ts` — CRUD fixtures manuales (Task 11)
- `src/components/agency/DobleGWidget.tsx` — botón/sello agregar/quitar (Task 8)
- `src/components/agency/ManualFixturesEditor.tsx` — alerta + form de partidos a mano (Task 12)

**Modificar:**
- `src/constants/agencyPlayers.ts` — renombrar constante a `BASE_AGENCY_PLAYERS`, helpers leen del cache dinámico (Task 5)
- `src/types/index.ts` — `agencyPlayers` + `refreshAgencyPlayers` en `AppData` (Task 6)
- `src/types/footballApi.ts` — campo `source` en `AgencyFixture` (Task 11)
- `src/context/DataContext.tsx` — cargar overlay, exponer, fusionar en `internal` (Task 6-7)
- `src/services/footballApiService.ts` — exportar `resolvePlayerTeam`, fusionar fixtures manuales (Task 9, 13)
- `src/pages/PlayerDetailPage.tsx` — montar `DobleGWidget` + `ManualFixturesEditor` (Task 10, 12)

---

## Phase 0 — Tooling

### Task 1: Agregar Vitest para la lógica pura

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts + devDependencies)

- [ ] **Step 1: Instalar Vitest**

```bash
npm install -D vitest@^2.1.0
```

- [ ] **Step 2: Crear `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Agregar script de test a `package.json`**

En `"scripts"`, agregar:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Smoke test — crear `src/services/__smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
describe('vitest', () => { it('runs', () => { expect(1 + 1).toBe(2) }) })
```

- [ ] **Step 5: Correr y verificar**

Run: `npm test`
Expected: PASS (1 test). Luego borrar el smoke: `rm src/services/__smoke.test.ts`

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for pure-logic unit tests"
```

---

## Phase 1 — Capa de datos (fuente de verdad dinámica)

### Task 2: Migración de la tabla `agency_players`

**Files:**
- Create: `supabase/migrations/20260612_agency_players.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Altas y bajas de jugadores Doble G hechas desde la app (overlay sobre BASE_AGENCY_PLAYERS).
CREATE TABLE IF NOT EXISTS agency_players (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('add', 'remove')),
  -- identidad (player_key = nombre normalizado NFD lower, sin acentos ni puntos)
  player_key    TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL,
  short_name    TEXT,
  api_player_id INTEGER,
  supabase_player_id INTEGER REFERENCES players(id),
  -- datos de portfolio (para kind='add')
  image         TEXT,
  contract_end  TEXT,
  market_value  TEXT,
  team          TEXT,
  api_team_id   INTEGER,
  is_reserve    BOOLEAN NOT NULL DEFAULT false,
  -- auditoría
  added_by      UUID,
  added_by_name TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agency_players_kind ON agency_players(kind);
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Aplicar vía el SQL editor de Supabase o la CLI (`supabase db push`). Verificar que la tabla exista con `select * from agency_players;` (0 filas).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260612_agency_players.sql
git commit -m "feat: agency_players table for dynamic Doble G membership"
```

---

### Task 3: `agencyPlayersService` — fusión y matching (TDD)

**Files:**
- Create: `src/services/agencyPlayersService.ts`
- Test: `src/services/agencyPlayersService.test.ts`

El matching de identidad usa una clave normalizada idéntica a la del resto de la app (NFD,
lower, sin acentos ni puntos).

- [ ] **Step 1: Escribir el test de fusión y matching**

```ts
import { describe, it, expect } from 'vitest'
import { agencyKey, mergeAgencyPlayers, type AgencyOverlayRow } from './agencyPlayersService'
import type { AgencyPlayer } from '@/constants/agencyPlayers'

const BASE: AgencyPlayer[] = [
  { shortName: 'G. Prestianni', fullName: 'Gianluca Prestianni', image: null, contractEnd: null, marketValue: '€12.00m', team: 'Benfica', apiTeamId: 211, isReserve: false },
  { shortName: 'J. Paradela', fullName: 'José Paradela', image: null, contractEnd: null, marketValue: '€9.00m', team: 'Cruz Azul', apiTeamId: 2295, isReserve: false },
]

describe('agencyKey', () => {
  it('normaliza acentos, puntos y mayúsculas', () => {
    expect(agencyKey('José Paradela')).toBe('jose paradela')
    expect(agencyKey('G. Prestianni')).toBe('g prestianni')
  })
})

describe('mergeAgencyPlayers', () => {
  it('devuelve la base cuando no hay overlay', () => {
    expect(mergeAgencyPlayers(BASE, [])).toHaveLength(2)
  })

  it('agrega un jugador nuevo (kind=add)', () => {
    const overlay: AgencyOverlayRow[] = [{
      kind: 'add', player_key: agencyKey('Santiago Cartagena'), full_name: 'Santiago Cartagena',
      short_name: 'S. Cartagena', api_player_id: 21015257, supabase_player_id: null,
      image: null, contract_end: null, market_value: null, team: 'Deportivo Maldonado',
      api_team_id: 2370, is_reserve: false,
    }]
    const merged = mergeAgencyPlayers(BASE, overlay)
    expect(merged).toHaveLength(3)
    expect(merged.find(p => p.fullName === 'Santiago Cartagena')?.apiTeamId).toBe(2370)
  })

  it('quita un jugador de la base (kind=remove)', () => {
    const overlay: AgencyOverlayRow[] = [{
      kind: 'remove', player_key: agencyKey('José Paradela'), full_name: 'José Paradela',
      short_name: null, api_player_id: null, supabase_player_id: null, image: null,
      contract_end: null, market_value: null, team: null, api_team_id: null, is_reserve: false,
    }]
    const merged = mergeAgencyPlayers(BASE, overlay)
    expect(merged).toHaveLength(1)
    expect(merged.find(p => p.fullName === 'José Paradela')).toBeUndefined()
  })

  it('no duplica si el agregado ya está en la base', () => {
    const overlay: AgencyOverlayRow[] = [{
      kind: 'add', player_key: agencyKey('Gianluca Prestianni'), full_name: 'Gianluca Prestianni',
      short_name: 'G. Prestianni', api_player_id: null, supabase_player_id: null, image: null,
      contract_end: null, market_value: '€15.00m', team: 'Benfica', api_team_id: 211, is_reserve: false,
    }]
    const merged = mergeAgencyPlayers(BASE, overlay)
    expect(merged).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npm test -- agencyPlayersService`
Expected: FAIL — no existe el módulo / exports.

- [ ] **Step 3: Implementar la lógica pura en `agencyPlayersService.ts`**

```ts
import { supabase } from '@/lib/supabase'
import { BASE_AGENCY_PLAYERS, type AgencyPlayer } from '@/constants/agencyPlayers'

export interface AgencyOverlayRow {
  kind: 'add' | 'remove'
  player_key: string
  full_name: string
  short_name: string | null
  api_player_id: number | null
  supabase_player_id: number | null
  image: string | null
  contract_end: string | null
  market_value: string | null
  team: string | null
  api_team_id: number | null
  is_reserve: boolean
}

/** Clave de identidad: NFD, lower, sin acentos ni puntos, espacios colapsados. */
export function agencyKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
}

function rowToAgencyPlayer(r: AgencyOverlayRow): AgencyPlayer {
  return {
    shortName: r.short_name || r.full_name,
    fullName: r.full_name,
    image: r.image,
    contractEnd: r.contract_end,
    marketValue: r.market_value,
    team: r.team || '',
    apiTeamId: r.api_team_id,
    isReserve: r.is_reserve,
  }
}

/** Fusiona base − bajas + altas. De-dup por clave de nombre. */
export function mergeAgencyPlayers(base: AgencyPlayer[], overlay: AgencyOverlayRow[]): AgencyPlayer[] {
  const removed = new Set(overlay.filter(r => r.kind === 'remove').map(r => r.player_key))
  const result = base.filter(p => !removed.has(agencyKey(p.fullName)))
  const present = new Set(result.map(p => agencyKey(p.fullName)))
  for (const r of overlay) {
    if (r.kind !== 'add') continue
    if (present.has(r.player_key)) continue
    result.push(rowToAgencyPlayer(r))
    present.add(r.player_key)
  }
  return result
}

// ─── Runtime cache (lectura síncrona para consumidores no-React) ───────────────
let _cache: AgencyPlayer[] = [...BASE_AGENCY_PLAYERS]

export function getAgencyPlayers(): AgencyPlayer[] {
  return _cache
}

/** Carga el overlay de Supabase y actualiza el cache. Si falla, deja la base. */
export async function loadAgencyPlayers(): Promise<AgencyPlayer[]> {
  const { data, error } = await supabase.from('agency_players').select('*')
  if (error || !data) {
    console.error('Error loading agency_players overlay:', error)
    _cache = [...BASE_AGENCY_PLAYERS]
    return _cache
  }
  _cache = mergeAgencyPlayers(BASE_AGENCY_PLAYERS, data as AgencyOverlayRow[])
  return _cache
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npm test -- agencyPlayersService`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/services/agencyPlayersService.ts src/services/agencyPlayersService.test.ts
git commit -m "feat: agencyPlayersService merge + matching (base - removals + additions)"
```

---

### Task 4: `isAgencyPlayer`, `addAgencyPlayer`, `removeAgencyPlayer` (TDD para el matcher)

**Files:**
- Modify: `src/services/agencyPlayersService.ts`
- Test: `src/services/agencyPlayersService.test.ts`

- [ ] **Step 1: Agregar test del matcher al test existente**

Agregar al final de `agencyPlayersService.test.ts`:

```ts
import { matchAgency } from './agencyPlayersService'

describe('matchAgency', () => {
  const list: AgencyPlayer[] = [
    { shortName: 'G. Prestianni', fullName: 'Gianluca Prestianni', image: null, contractEnd: null, marketValue: null, team: 'Benfica', apiTeamId: 211, isReserve: false },
  ]
  it('matchea por nombre completo normalizado', () => {
    expect(matchAgency(list, { name: 'Gianluca Prestianni' })).toBe(true)
  })
  it('matchea por nombre abreviado', () => {
    expect(matchAgency(list, { name: 'G. Prestianni' })).toBe(true)
  })
  it('no matchea a un jugador ajeno', () => {
    expect(matchAgency(list, { name: 'Lionel Messi' })).toBe(false)
  })
})
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npm test -- agencyPlayersService`
Expected: FAIL — `matchAgency` no existe.

- [ ] **Step 3: Implementar matcher + mutaciones en `agencyPlayersService.ts`**

Agregar:

```ts
/** True si `target` (por nombre o apiId) está en la lista Doble G provista. */
export function matchAgency(
  list: AgencyPlayer[],
  target: { name: string; apiPlayerId?: number | null },
): boolean {
  const key = agencyKey(target.name)
  return list.some(p =>
    agencyKey(p.fullName) === key || agencyKey(p.shortName) === key
  )
}

export interface AddAgencyInput {
  fullName: string
  shortName?: string | null
  apiPlayerId?: number | null
  supabasePlayerId?: number | null
  image?: string | null
  contractEnd?: string | null
  marketValue?: string | null
  team?: string | null
  apiTeamId?: number | null
  isReserve?: boolean
}

export async function addAgencyPlayer(
  input: AddAgencyInput,
  userId?: string,
  userName?: string,
): Promise<boolean> {
  const { error } = await supabase.from('agency_players').upsert({
    kind: 'add',
    player_key: agencyKey(input.fullName),
    full_name: input.fullName,
    short_name: input.shortName ?? null,
    api_player_id: input.apiPlayerId ?? null,
    supabase_player_id: input.supabasePlayerId ?? null,
    image: input.image ?? null,
    contract_end: input.contractEnd ?? null,
    market_value: input.marketValue ?? null,
    team: input.team ?? null,
    api_team_id: input.apiTeamId ?? null,
    is_reserve: input.isReserve ?? false,
    added_by: userId ?? null,
    added_by_name: userName ?? null,
  }, { onConflict: 'player_key' })
  if (error) { console.error('addAgencyPlayer error:', error); return false }
  await loadAgencyPlayers()
  return true
}

/**
 * Quita a un jugador de Doble G. Para los 41 base inserta una fila kind='remove'
 * (tapa la base). Para un agregado, también lo deja como 'remove' (idempotente).
 */
export async function removeAgencyPlayer(
  fullName: string,
  userId?: string,
  userName?: string,
): Promise<boolean> {
  const { error } = await supabase.from('agency_players').upsert({
    kind: 'remove',
    player_key: agencyKey(fullName),
    full_name: fullName,
    is_reserve: false,
    added_by: userId ?? null,
    added_by_name: userName ?? null,
  }, { onConflict: 'player_key' })
  if (error) { console.error('removeAgencyPlayer error:', error); return false }
  await loadAgencyPlayers()
  return true
}
```

- [ ] **Step 4: Correr (debe pasar)**

Run: `npm test -- agencyPlayersService`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/agencyPlayersService.ts src/services/agencyPlayersService.test.ts
git commit -m "feat: agency add/remove mutations + matchAgency helper"
```

---

### Task 5: Helpers de `agencyPlayers.ts` leen del cache dinámico

**Files:**
- Modify: `src/constants/agencyPlayers.ts`

Objetivo: renombrar la constante a `BASE_AGENCY_PLAYERS` y que las 5 funciones helper operen
sobre `getAgencyPlayers()` (cache fusionado). Mantener un alias `AGENCY_PLAYERS` que devuelva
el cache, para no romper imports existentes que lo usan como lista de lectura.

- [ ] **Step 1: Renombrar la constante**

En `src/constants/agencyPlayers.ts`, cambiar la declaración:

```ts
export const BASE_AGENCY_PLAYERS: AgencyPlayer[] = [
  // ... (los 41 jugadores, sin cambios) ...
]
```

- [ ] **Step 2: Agregar el accessor dinámico al final del archivo**

Importar el cache de forma perezosa para evitar ciclo de import (el servicio importa este
archivo). Usar un getter que lee el cache vía una función inyectada en runtime:

```ts
// Cache dinámico: lo setea agencyPlayersService al cargar el overlay.
let _runtime: AgencyPlayer[] = BASE_AGENCY_PLAYERS

/** Llamado por agencyPlayersService.loadAgencyPlayers() tras fusionar. */
export function _setRuntimeAgencyPlayers(list: AgencyPlayer[]) {
  _runtime = list
}

/** Lista Doble G vigente (base + overlay). Síncrono. */
export function getAgencyPlayersList(): AgencyPlayer[] {
  return _runtime
}

/** Alias de lectura para consumidores existentes que iteran la lista. */
export const AGENCY_PLAYERS = new Proxy([] as AgencyPlayer[], {
  get(_t, prop) { return Reflect.get(_runtime, prop, _runtime) },
})
```

> Nota: El `Proxy` permite que `AGENCY_PLAYERS.filter(...)`, `.find(...)`, `.map(...)` y
> `for...of` sigan funcionando leyendo siempre el cache vigente, sin tocar los 9 consumidores.

- [ ] **Step 3: Las 5 helpers leen de `_runtime`**

Cambiar cada función para iterar `_runtime` en vez de la constante vieja:

```ts
export function getUniqueTeamIds(): number[] {
  const ids = new Set<number>()
  for (const p of _runtime) {
    if (p.apiTeamId && !p.isReserve) ids.add(p.apiTeamId)
  }
  return Array.from(ids)
}

export function getPlayersByTeamId(teamId: number): AgencyPlayer[] {
  return _runtime.filter(p => p.apiTeamId === teamId)
}

export function getTotalPortfolioValue(): number {
  let total = 0
  for (const p of _runtime) {
    if (!p.marketValue) continue
    const raw = p.marketValue.replace('€', '').trim()
    if (raw.endsWith('m')) total += parseFloat(raw) * 1_000_000
    else if (raw.endsWith('k')) total += parseFloat(raw) * 1_000
  }
  return total
}

export function getExpiringContracts(monthsThreshold = 8): AgencyPlayer[] {
  const now = new Date()
  return _runtime.filter(p => {
    if (!p.contractEnd) return false
    const [d, m, y] = p.contractEnd.split('/')
    const end = new Date(+y, +m - 1, +d)
    const diff = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)
    return diff > 0 && diff <= monthsThreshold
  })
}

export function getUniqueLeagues(): number {
  const teams = new Set(_runtime.map(p => p.team))
  return teams.size
}
```

`formatPortfolioValue` queda igual (no itera la lista).

- [ ] **Step 4: Conectar el cache del servicio al accessor**

En `src/services/agencyPlayersService.ts`, dentro de `loadAgencyPlayers()`, después de setear
`_cache`, propagar al constants module. Agregar el import y la llamada:

```ts
import { BASE_AGENCY_PLAYERS, _setRuntimeAgencyPlayers, type AgencyPlayer } from '@/constants/agencyPlayers'
// ...
// al final de loadAgencyPlayers(), antes de `return _cache`:
  _setRuntimeAgencyPlayers(_cache)
```

Y en el fallback de error, también `_setRuntimeAgencyPlayers(_cache)` antes de `return`.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: compila sin errores de tipos. (Si algún consumidor importaba el tipo
`AgencyPlayer`, sigue exportado igual.)

- [ ] **Step 6: Commit**

```bash
git add src/constants/agencyPlayers.ts src/services/agencyPlayersService.ts
git commit -m "refactor: agency helpers read dynamic runtime list (base + overlay)"
```

---

## Phase 2 — Wiring en DataContext

### Task 6: Exponer `agencyPlayers` + `refreshAgencyPlayers` y cargar el overlay

**Files:**
- Modify: `src/types/index.ts` (AppData)
- Modify: `src/context/DataContext.tsx`

- [ ] **Step 1: Extender `AppData`**

En `src/types/index.ts`, dentro de `export interface AppData { ... }`, agregar:

```ts
  agencyPlayers: import('@/constants/agencyPlayers').AgencyPlayer[]
  refreshAgencyPlayers: () => Promise<void>
```

- [ ] **Step 2: Estado inicial en DataProvider**

En `DataContext.tsx`, en el `useState<AppData>` inicial, agregar al objeto:

```ts
    agencyPlayers: [],
    refreshAgencyPlayers: async () => {},
```

- [ ] **Step 3: Importar el servicio**

Al tope de `DataContext.tsx`:

```ts
import { loadAgencyPlayers } from '@/services/agencyPlayersService'
import { getAgencyPlayersList } from '@/constants/agencyPlayers'
```

- [ ] **Step 4: Cargar el overlay dentro del efecto, antes de fusionar internal**

En el `.then(raw => { ... })`, **al comienzo del callback** (antes de construir mapas), cargar
el overlay y esperar a que el cache esté listo:

```ts
        // Cargar overlay Doble G (altas/bajas) antes de derivar internal
        await loadAgencyPlayers()
        if (cancelled) return
```

> El callback `.then(raw => {...})` debe pasar a `.then(async raw => {...})` para permitir el `await`.

- [ ] **Step 5: Definir `refreshAgencyPlayers` y guardarlo en estado**

Dentro de `DataProvider`, antes del `useEffect`, definir un callback que re-cargue el overlay y
re-derive `internal` desde una base guardada (ver Task 7 para la base). Por ahora, declarar la
función y un ref para la base internal:

```ts
  const baseInternalRef = useRef<EnrichedPlayer[]>([])
  const externalRef = useRef<EnrichedPlayer[]>([])

  const refreshAgencyPlayers = useCallback(async () => {
    await loadAgencyPlayers()
    const agencyPlayers = getAgencyPlayersList()
    setData(prev => ({
      ...prev,
      agencyPlayers,
      internal: mergeAgencyIntoInternal(baseInternalRef.current, externalRef.current, agencyPlayers),
    }))
  }, [])
```

Agregar imports `useRef, useCallback` desde React y `mergeAgencyIntoInternal` (se crea en Task 7).

- [ ] **Step 6: Pasar `agencyPlayers` y `refreshAgencyPlayers` en el `setData` final**

En el `setData({...})` del efecto, agregar:

```ts
          agencyPlayers: getAgencyPlayersList(),
          refreshAgencyPlayers,
```

- [ ] **Step 7: Typecheck**

Run: `npm run build`
Expected: compila (puede fallar hasta completar Task 7 por `mergeAgencyIntoInternal`; si es así, hacer Task 7 antes del build y commitear juntos).

- [ ] **Step 8: Commit (junto con Task 7)**

---

### Task 7: Fusionar jugadores Doble G agregados en `internal`

**Files:**
- Modify: `src/context/DataContext.tsx`

Un jugador Doble G agregado desde la app (ej. Cartagena, hoy externo) debe aparecer en Interno.
Se reusa su ficha enriquecida de `external` si existe; si no, se construye una mínima a partir
de los datos del portfolio.

- [ ] **Step 1: Escribir `mergeAgencyIntoInternal` en `DataContext.tsx`**

Agregar (a nivel módulo, junto a las otras funciones helper):

```ts
import { getAgencyPlayersList } from '@/constants/agencyPlayers'
import type { AgencyPlayer } from '@/constants/agencyPlayers'

// Construye un EnrichedPlayer mínimo a partir de un AgencyPlayer (cuando no está en external)
function agencyToEnriched(a: AgencyPlayer): EnrichedPlayer {
  const marketValueRaw = parseMarketValue(a.marketValue ?? '')
  return {
    Jugador: a.fullName,
    Liga: '',
    Equipo: a.team,
    'Posición': '',
    Edad: '',
    'País de nacimiento': '',
    Pie: '', Altura: '',
    'Valor de mercado (Transfermarkt)': a.marketValue ?? '',
    'Vencimiento contrato': a.contractEnd ?? '',
    'Partidos jugados': '', 'Minutos jugados': '',
    Goles: '', xG: '', Asistencias: '', xA: '',
    'Posición específica': '',
    id: '',
    Transfermkt: '',
    Representante: '',
    Imagen: a.image ?? '',
    ggScore: null,
    ggScorePercentile: null,
    source: 'interno',
    contractStatus: 'ok',
    monthsRemaining: null,
    marketValueFormatted: formatMarketValue(marketValueRaw),
    marketValueRaw,
    minutesPlayed: 0,
    ageNum: 0,
  }
}

/** internal base + jugadores Doble G agregados que no estén ya en internal. */
export function mergeAgencyIntoInternal(
  baseInternal: EnrichedPlayer[],
  external: EnrichedPlayer[],
  agencyPlayers: AgencyPlayer[],
): EnrichedPlayer[] {
  const present = new Set(baseInternal.map(p => normalizeName(p.Jugador)))
  const extByName = new Map(external.map(p => [normalizeName(p.Jugador), p]))
  const additions: EnrichedPlayer[] = []
  for (const a of agencyPlayers) {
    const key = normalizeName(a.fullName)
    if (present.has(key)) continue
    const fromExternal = extByName.get(key)
    additions.push(fromExternal ? { ...fromExternal, source: 'interno' } : agencyToEnriched(a))
    present.add(key)
  }
  return [...baseInternal, ...additions]
}
```

> `normalizeName`, `parseMarketValue`, `formatMarketValue` ya están importados en DataContext.

- [ ] **Step 2: Usar la fusión en el efecto inicial**

En el efecto, después de calcular `internal` (la versión actual derivada del CSV), guardar la
base en los refs y aplicar la fusión:

```ts
        baseInternalRef.current = internal
        externalRef.current = external
        const agencyPlayers = getAgencyPlayersList()
        const internalMerged = mergeAgencyIntoInternal(internal, external, agencyPlayers)
```

Y en el `setData({...})`, usar `internal: internalMerged` (en vez de `internal`) y
`agencyPlayers`.

- [ ] **Step 3: Typecheck + correr tests existentes**

Run: `npm run build && npm test`
Expected: compila; tests del servicio siguen verdes.

- [ ] **Step 4: Commit (Task 6 + 7 juntas)**

```bash
git add src/types/index.ts src/context/DataContext.tsx
git commit -m "feat: load Doble G overlay in DataContext, expose list + refresh, merge into internal"
```

---

## Phase 3 — Resolución de equipo (API-Football)

### Task 8: `resolvePlayerTeam` en footballApiService

**Files:**
- Modify: `src/services/footballApiService.ts`

- [ ] **Step 1: Exportar una función que resuelve el equipo actual por apiPlayerId**

Agregar al final de `footballApiService.ts` (reusa `apiFetch`, que ya existe en el módulo):

```ts
export interface ResolvedTeam { teamId: number; teamName: string }

/** Resuelve el equipo actual de un jugador por su id API-Football (best-effort). */
export async function resolvePlayerTeam(apiPlayerId: number): Promise<ResolvedTeam | null> {
  if (!API_KEY) return null
  const season = String(new Date().getFullYear())
  try {
    const res = await apiFetch<any[]>('/players', { id: String(apiPlayerId), season })
    const stats = res.response?.[0]?.statistics
    if (!stats || stats.length === 0) return null
    // Tomar el equipo con más minutos / el primero con team.id
    const withTeam = stats.find((s: any) => s?.team?.id)
    if (!withTeam) return null
    return { teamId: withTeam.team.id, teamName: withTeam.team.name }
  } catch (e) {
    console.error('resolvePlayerTeam error:', e)
    return null
  }
}
```

> `apiFetch` está definido arriba en el mismo archivo; `API_KEY` también. No requiere export nuevo de esos.

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: compila.

- [ ] **Step 3: Commit**

```bash
git add src/services/footballApiService.ts
git commit -m "feat: resolvePlayerTeam (API-Football) for new Doble G additions"
```

---

## Phase 4 — UI del botón

### Task 9: Componente `DobleGWidget`

**Files:**
- Create: `src/components/agency/DobleGWidget.tsx`

Mismo tamaño/estilo que "Agregar a seguimiento" (`px-3 py-2.5 rounded-xl ... transition-all`),
con el logo PNG (`/logo-dark.png` claro, `/logo-light.png` oscuro) y acento ámbar para leer
como acción especial. Estados: cargando / no-DG (botón agregar) / DG (sello + eliminar).

- [ ] **Step 1: Crear el componente**

```tsx
import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { matchAgency, addAgencyPlayer, removeAgencyPlayer } from '@/services/agencyPlayersService'
import { resolvePlayerTeam } from '@/services/footballApiService'
import type { EnrichedPlayer } from '@/types'

interface DobleGWidgetProps {
  player: EnrichedPlayer
  apiPlayerId?: number | null
}

export default function DobleGWidget({ player, apiPlayerId }: DobleGWidgetProps) {
  const { user, userDisplayName } = useAuth()
  const { agencyPlayers, refreshAgencyPlayers } = useData()
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState('')

  const isDG = matchAgency(agencyPlayers, { name: player.Jugador, apiPlayerId })
  const name = userDisplayName || user?.email?.split('@')[0] || 'Scout'

  if (!user) return null

  const handleAdd = async () => {
    setBusy(true); setError('')
    // Best-effort: resolver el equipo (apiTeamId) para que aparezca en el calendario
    let apiTeamId: number | null = null
    let team = player.Equipo || ''
    if (apiPlayerId) {
      const resolved = await resolvePlayerTeam(apiPlayerId)
      if (resolved) { apiTeamId = resolved.teamId; team = resolved.teamName }
    }
    const ok = await addAgencyPlayer({
      fullName: player.Jugador,
      apiPlayerId: apiPlayerId ?? null,
      image: player.Imagen || null,
      contractEnd: player['Vencimiento contrato'] || null,
      marketValue: player['Valor de mercado (Transfermarkt)'] || null,
      team,
      apiTeamId,
    }, user.id, name)
    if (ok) { await refreshAgencyPlayers() } else { setError('No se pudo guardar. Intentá de nuevo.') }
    setBusy(false)
  }

  const handleRemove = async () => {
    setBusy(true); setError('')
    const ok = await removeAgencyPlayer(player.Jugador, user.id, name)
    if (ok) { await refreshAgencyPlayers(); setConfirmRemove(false) }
    else { setError('No se pudo eliminar. Intentá de nuevo.') }
    setBusy(false)
  }

  const Logo = () => (
    <>
      <img src="/logo-dark.png" alt="Doble G" className="w-4 h-4 object-contain dark:hidden" />
      <img src="/logo-light.png" alt="Doble G" className="w-4 h-4 object-contain hidden dark:block" />
    </>
  )

  if (isDG) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <span className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
            <Logo /> Incorporación de Doble G
          </span>
        </div>
        {confirmRemove ? (
          <div className="flex gap-2">
            <button onClick={() => setConfirmRemove(false)} disabled={busy}
              className="flex-1 py-2 rounded-lg text-sm text-apple-gray-600 dark:text-apple-gray-400 bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors">
              Cancelar
            </button>
            <button onClick={handleRemove} disabled={busy}
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center justify-center">
              {busy ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Eliminar'}
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmRemove(true)}
            className="w-full text-xs text-red-500 hover:text-red-600 font-medium transition-colors text-left px-1">
            Eliminar de Doble G
          </button>
        )}
        {error && <p className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button onClick={handleAdd} disabled={busy}
        className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 transition-all disabled:opacity-50">
        <span className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
          <Logo /> Nueva incorporación de Doble G
        </span>
        {busy
          ? <div className="w-4 h-4 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          : <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
      </button>
      {error && <p className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
    </div>
  )
}
```

> Verificar que `useAuth` exponga `user` y `userDisplayName` (lo hace, según `TrackingWidget`).

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: compila.

- [ ] **Step 3: Commit**

```bash
git add src/components/agency/DobleGWidget.tsx
git commit -m "feat: DobleGWidget — add/remove Doble G membership button + badge"
```

---

### Task 10: Montar `DobleGWidget` en la ficha (externo e interno)

**Files:**
- Modify: `src/pages/PlayerDetailPage.tsx`

- [ ] **Step 1: Importar el widget**

Junto a los otros imports de PlayerDetailPage:

```ts
import DobleGWidget from '@/components/agency/DobleGWidget'
```

- [ ] **Step 2: Renderizarlo en la card de acciones**

En el bloque `<div className="card-apple p-4 space-y-2">` (línea ~1311), agregar como primer
hijo (antes del `TrackingWidget`), visible tanto para externo como interno:

```tsx
            <DobleGWidget
              player={player}
              apiPlayerId={apiIdParam ? Number(apiIdParam) : null}
            />
```

> `apiIdParam` ya existe (`searchParams.get('apiId')`, línea 588). `player` está garantizado no-null
> en ese punto del render (el early-return de loading/no encontrado ocurre antes).

- [ ] **Step 3: Verificación manual**

Run: `npm run dev`
Abrir la ficha de Cartagena: `/jugador/Santiago%20Cartagena?source=externo&apiId=21015257`.
Esperado: aparece el botón ámbar "Nueva incorporación de Doble G" con el logo, mismo tamaño que
"Agregar a seguimiento". Al tocarlo → cambia a sello "Incorporación de Doble G" + link "Eliminar
de Doble G". Verificar fila en Supabase `agency_players` (kind='add', api_team_id resuelto).
Recargar → el sello persiste. Probar la ficha de un jugador de los 41 (ej. Prestianni) → muestra
el sello automáticamente. Eliminar y volver a agregar funciona.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PlayerDetailPage.tsx
git commit -m "feat: mount DobleGWidget on player detail (external + internal)"
```

---

## Phase 5 — Partidos manuales (fallback de calendario)

### Task 11: Tabla `agency_manual_fixtures` + tipo + servicio

**Files:**
- Create: `supabase/migrations/20260612_agency_manual_fixtures.sql`
- Create: `src/services/agencyManualFixturesService.ts`
- Modify: `src/types/footballApi.ts`

- [ ] **Step 1: Migración**

```sql
-- Próximos partidos cargados a mano para jugadores Doble G sin datos en API-Football.
CREATE TABLE IF NOT EXISTS agency_manual_fixtures (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_key    TEXT NOT NULL,
  player_name   TEXT NOT NULL,
  match_date    DATE NOT NULL,
  opponent      TEXT NOT NULL,
  is_home       BOOLEAN NOT NULL DEFAULT true,
  competition   TEXT,
  venue         TEXT,
  added_by      UUID,
  added_by_name TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agency_manual_fixtures_key ON agency_manual_fixtures(player_key);
```

Aplicar en Supabase y verificar.

- [ ] **Step 2: Agregar `source` a `AgencyFixture`**

En `src/types/footballApi.ts`, en la interfaz `AgencyFixture`, agregar:

```ts
  source?: 'api' | 'manual'
```

- [ ] **Step 3: Servicio CRUD**

Crear `src/services/agencyManualFixturesService.ts`:

```ts
import { supabase } from '@/lib/supabase'
import { agencyKey } from '@/services/agencyPlayersService'
import type { AgencyFixture } from '@/types/footballApi'

export interface ManualFixtureRow {
  id: number
  player_key: string
  player_name: string
  match_date: string
  opponent: string
  is_home: boolean
  competition: string | null
  venue: string | null
}

export async function fetchManualFixtures(playerName?: string): Promise<ManualFixtureRow[]> {
  let q = supabase.from('agency_manual_fixtures').select('*').order('match_date')
  if (playerName) q = q.eq('player_key', agencyKey(playerName))
  const { data, error } = await q
  if (error) { console.error('fetchManualFixtures error:', error); return [] }
  return (data as ManualFixtureRow[]) ?? []
}

export async function addManualFixture(input: {
  playerName: string; matchDate: string; opponent: string; isHome: boolean;
  competition?: string; venue?: string;
}, userId?: string, userName?: string): Promise<boolean> {
  const { error } = await supabase.from('agency_manual_fixtures').insert({
    player_key: agencyKey(input.playerName),
    player_name: input.playerName,
    match_date: input.matchDate,
    opponent: input.opponent,
    is_home: input.isHome,
    competition: input.competition ?? null,
    venue: input.venue ?? null,
    added_by: userId ?? null,
    added_by_name: userName ?? null,
  })
  if (error) { console.error('addManualFixture error:', error); return false }
  return true
}

export async function deleteManualFixture(id: number): Promise<boolean> {
  const { error } = await supabase.from('agency_manual_fixtures').delete().eq('id', id)
  if (error) { console.error('deleteManualFixture error:', error); return false }
  return true
}

/** Convierte filas manuales al shape AgencyFixture para fusionar en el calendario. */
export function manualToAgencyFixtures(rows: ManualFixtureRow[], playerImage?: string | null): AgencyFixture[] {
  return rows.map(r => ({
    fixtureId: -r.id, // negativo para no chocar con ids de API
    date: new Date(r.match_date + 'T00:00:00').toISOString(),
    timestamp: Math.floor(new Date(r.match_date + 'T00:00:00').getTime() / 1000),
    venue: r.venue ?? '',
    city: '',
    status: 'Not Started',
    statusShort: 'NS',
    elapsed: null,
    leagueName: r.competition ?? 'Partido manual',
    leagueLogo: '',
    leagueCountry: '',
    leagueFlag: null,
    round: '',
    homeTeam: { id: 0, name: r.is_home ? r.player_name : r.opponent, logo: '' },
    awayTeam: { id: 0, name: r.is_home ? r.opponent : r.player_name, logo: '' },
    goalsHome: null,
    goalsAway: null,
    isHome: r.is_home,
    players: [{ shortName: r.player_name, fullName: r.player_name, image: playerImage ?? null }],
    source: 'manual',
  }))
}
```

> Si algún campo de `AgencyFixture` difiere del shape de arriba (verificar `src/types/footballApi.ts`),
> ajustar los nombres exactos. El builder debe satisfacer el tipo `AgencyFixture` tal cual está definido.

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: compila. Corregir nombres de campos contra el tipo real `AgencyFixture` si hace falta.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260612_agency_manual_fixtures.sql src/services/agencyManualFixturesService.ts src/types/footballApi.ts
git commit -m "feat: agency_manual_fixtures table + service + AgencyFixture mapper"
```

---

### Task 12: `ManualFixturesEditor` + alerta en la ficha

**Files:**
- Create: `src/components/agency/ManualFixturesEditor.tsx`
- Modify: `src/pages/PlayerDetailPage.tsx`

La alerta + form aparece SOLO cuando: el jugador es Doble G **y** no tiene `apiTeamId` resoluble
(o el equipo no trae fixtures). Criterio simple y robusto para la condición: el jugador es Doble G
y su entrada en `agencyPlayers` no tiene `apiTeamId`.

- [ ] **Step 1: Crear el editor**

```tsx
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
```

- [ ] **Step 2: Montar en la ficha bajo condición**

En `PlayerDetailPage.tsx`, importar:

```ts
import ManualFixturesEditor from '@/components/agency/ManualFixturesEditor'
import { matchAgency } from '@/services/agencyPlayersService'
```

Calcular la condición cerca de donde se usa `agencyPlayers` (traer `agencyPlayers` del
`useData()` destructuring de la línea 590 — agregarlo a esa lista):

```ts
  const dgEntry = agencyPlayers.find(a => normalizeName(a.fullName) === normalizeName(player?.Jugador ?? ''))
  const needsManualFixtures = !!dgEntry && !dgEntry.apiTeamId
```

Renderizar el editor en el sidebar, después de la card de acciones (línea ~1367), envuelto en
la condición:

```tsx
          {needsManualFixtures && <ManualFixturesEditor playerName={player.Jugador} />}
```

- [ ] **Step 3: Verificación manual**

Run: `npm run dev`
Agregar un jugador Doble G cuyo equipo no resuelva apiTeamId (o forzar `api_team_id` NULL en la
fila de Supabase). Esperado: aparece la card ámbar de alerta + form. Cargar un partido → se lista;
quitar funciona. (La fusión en el calendario es Task 13.)

- [ ] **Step 4: Commit**

```bash
git add src/components/agency/ManualFixturesEditor.tsx src/pages/PlayerDetailPage.tsx
git commit -m "feat: manual fixtures alert + editor on Doble G player without API team"
```

---

### Task 13: Fusionar fixtures manuales en el Calendario y Home

**Files:**
- Modify: `src/pages/CalendarPage.tsx`
- Modify: `src/pages/HomePage.tsx`

- [ ] **Step 1: En CalendarPage, traer y fusionar fixtures manuales**

Importar:

```ts
import { fetchManualFixtures, manualToAgencyFixtures } from '@/services/agencyManualFixturesService'
```

Donde se obtienen los `AgencyFixture` de la API (estado/efecto que llama
`fetchAllAgencyFixtures`), tras setear los de API, agregar un efecto que traiga TODOS los
manuales y los concatene al arreglo de fixtures usado para renderizar:

```ts
  const [manualFixtures, setManualFixtures] = useState<AgencyFixture[]>([])
  useEffect(() => {
    fetchManualFixtures().then(rows => setManualFixtures(manualToAgencyFixtures(rows)))
  }, [])
```

Y al construir la lista que se muestra/filtra, usar `[...apiFixtures, ...manualFixtures]` en vez
de solo los de API. (Localizar la variable concreta de fixtures de API en CalendarPage y combinarla;
el filtro por jugador ya opera sobre `players[].fullName`, que el mapper manual completa.)

- [ ] **Step 2: En HomePage, contar partidos manuales en la actividad semanal**

Importar lo mismo y, donde se calcula `weekActivity`/los partidos de la semana a partir de los
`AgencyFixture` de la API, incluir también los manuales de la semana:

```ts
  const [manualFixtures, setManualFixtures] = useState<AgencyFixture[]>([])
  useEffect(() => {
    fetchManualFixtures().then(rows => setManualFixtures(manualToAgencyFixtures(rows)))
  }, [])
```

Combinar `[...apiFixtures, ...manualFixtures]` en el cálculo de actividad de la semana.

- [ ] **Step 3: Typecheck + verificación manual**

Run: `npm run build && npm run dev`
Esperado: compila. El partido manual cargado en Task 12 aparece en el Calendario (en su fecha) y
cuenta para la actividad de la semana en Home si cae dentro de la semana.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CalendarPage.tsx src/pages/HomePage.tsx
git commit -m "feat: merge manual fixtures into Calendar and Home weekly activity"
```

---

## Verificación final

- [ ] **Build limpio:** `npm run build` compila sin errores.
- [ ] **Tests:** `npm test` verde.
- [ ] **Flujo end-to-end (manual):**
  1. Ficha externa de Cartagena → "Nueva incorporación de Doble G" → se agrega, resuelve equipo.
  2. Aparece en Interno (lista) y en el Dashboard/Home (portfolio / actividad).
  3. Si la API no trae sus partidos → alerta + form → cargar partido → aparece en Calendario.
  4. "Eliminar de Doble G" lo saca de todos lados; re-agregar funciona.
  5. Un jugador de los 41 base muestra el sello automático y se puede eliminar.
- [ ] **Resiliencia:** si Supabase `agency_players` falla, la app sigue mostrando los 41 base.

---

## Notas para el implementador

- **No romper los 9 consumidores:** el `Proxy` `AGENCY_PLAYERS` + helpers leyendo `_runtime`
  mantienen la API intacta. No reescribir esos consumidores.
- **Orden de carga:** `loadAgencyPlayers()` debe completar antes de que el Calendario llame a
  `getUniqueTeamIds()`. DataContext lo await-ea al inicio del efecto; el Calendario se monta
  después de que `loading` pasa a false.
- **Claves de identidad:** usar siempre `agencyKey()`/`normalizeName()` — nunca comparar nombres
  crudos. Son equivalentes (NFD, lower, sin acentos); `agencyKey` además saca puntos.
- **Date en runtime:** `new Date()` se usa en el código de la app (permitido); la restricción de
  `Date.now()` aplica solo a scripts de Workflow, no acá.
