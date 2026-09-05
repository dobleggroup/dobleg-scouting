# Alertas de Debutantes U20 en LATAM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una pantalla `/debutantes` (en `primer-appcloud` e `independiente-platform`) que lista, sin repetir a nadie, a cada jugador de 20 años o menos que jugó por primera vez en su vida en una de las 14 competencias trackeadas de LATAM — construida sobre el sync de datos que ya existe, sin llamar de nuevo a la API para detectarlo.

**Architecture:** Se suman Perú y Venezuela a `leagues` y se activa `has_player_stats` en Libertadores/Sudamericana — el sync horario/10-min ya existente (`sync-fixtures`, `sync-player-stats`) las toma solas. Una función SQL nueva (`detect_debut_alerts()`, sin llamar a ninguna API) escanea `player_match_stats` + `players.birth_date` una vez al día vía `pg_cron` y llena `debut_alerts` (una fila por jugador, para siempre). Cada plataforma agrega un servicio + una página de sólo lectura sobre esa tabla, linkeando a la ficha de jugador que ya existe.

**Tech Stack:** Supabase (Postgres + pg_cron + Edge Functions ya existentes), React 18 + TypeScript, Vitest (mock de `@/lib/supabase`).

**Spec:** `docs/superpowers/specs/2026-09-05-alertas-debutantes-latam-design.md`

## Global Constraints

- Dos repos: `primer-appcloud` y `independiente-platform`, mismo proyecto Supabase (`qgwmxjjumauortbwvivu`).
- **No pushear a `origin/main` en ninguno de los dos repos al terminar** — el usuario pidió explícitamente acumular cambios sin gastar otro build de Netlify. Mergear a `main` localmente sí, pushear no (queda para cuando el usuario lo pida).
- No se toca la columna `tier` de `leagues` — está inconsistente hoy (Uruguay Primera División = 5, Argentina Primera Nacional = 6, la mayoría = 4 default) y no se usa para nada relacionado a esta feature; el criterio de "cuenta para debut" es exclusivamente la columna nueva `track_debuts`.
- El cron `detect-debut-alerts-daily` NO se activa hasta confirmar que el backfill histórico de las 4 competencias nuevas/reactivadas terminó de procesarse (Task 7) — activarlo antes puede generar falsos positivos (alguien marcado como "debutante" porque su partido viejo todavía no se sincronizó).
- Las migraciones SQL se aplican a mano en el SQL Editor de Supabase (sin `service_role` disponible desde acá) — cada task de migración termina pidiéndole al usuario que la corra y confirme.
- Las llamadas a Edge Functions (`backfill-season`) SÍ se pueden hacer directo desde acá vía `curl` con la `anon key` de `.env.local` (mismo patrón de autenticación que ya usan los cron jobs existentes, confirmado en `supabase/migrations/20260521204103_setup_pg_cron.sql`).

---

### Task 1: Migración — ligas, `debut_alerts`, función de detección

**Files:**
- Create: `supabase/migrations/20260905_a_debut_alerts.sql`

**Interfaces:**
- Produces: columna `leagues.track_debuts`, tabla `public.debut_alerts`, función `public.detect_debut_alerts()` — consumidos por el cron (Task 8) y por `debutAlertsService.ts` (Tasks 3 y 5).
- Consumes: nada — aditivo sobre `leagues`, `players`, `fixtures`, `player_match_stats` ya existentes.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260905_a_debut_alerts.sql
--
-- Alertas de debutantes U20 en LATAM. Reusa el sync de fixtures/player_match_stats
-- ya existente (pg_cron cada hora/10min) -- esto solo suma 2 ligas nuevas, activa
-- estadisticas en 2 competencias continentales, y agrega la deteccion (pura SQL,
-- sin llamar a ninguna API). Ver docs/superpowers/specs/2026-09-05-alertas-debutantes-latam-design.md.

alter table public.leagues add column if not exists track_debuts boolean not null default false;

-- Ligas locales de LATAM ya trackeadas: se marcan para que cuenten como debut.
update public.leagues set track_debuts = true
where id in (128, 131, 344, 71, 265, 239, 242, 262, 252, 268);

-- Copa Libertadores / Sudamericana: ya existen en `leagues` pero sin estadisticas
-- de jugador activas -- se activan para que el sync de siempre empiece a traer
-- minutos jugados ahi tambien.
update public.leagues set has_player_stats = true, track_debuts = true
where id in (13, 11);

-- Peru y Venezuela: nuevas, confirmadas en API-Football con historial completo
-- desde 2023 (lineups + estadisticas de jugador).
insert into public.leagues (id, name, country, season, has_player_stats, track_debuts)
values
  (281, 'Primera Division', 'Peru', 2026, true, true),
  (299, 'Primera Division', 'Venezuela', 2026, true, true)
on conflict (id) do update set has_player_stats = true, track_debuts = true;

create table public.debut_alerts (
  player_id     integer primary key references public.players(id),
  fixture_id    integer not null references public.fixtures(id),
  league_id     integer not null references public.leagues(id),
  age_at_debut  integer not null,
  minutes       integer not null,
  debut_date    date not null,
  created_at    timestamptz not null default now()
);

alter table public.debut_alerts enable row level security;

create policy "read_debut_alerts" on public.debut_alerts
  for select to authenticated using (true);

create or replace function public.detect_debut_alerts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.debut_alerts (player_id, fixture_id, league_id, age_at_debut, minutes, debut_date)
  select distinct on (pms.player_id)
    pms.player_id,
    pms.fixture_id,
    f.league_id,
    extract(year from age(f.date, p.birth_date))::int,
    pms.minutes,
    f.date::date
  from public.player_match_stats pms
  join public.fixtures f on f.id = pms.fixture_id
  join public.leagues l on l.id = f.league_id and l.track_debuts
  join public.players p on p.id = pms.player_id and p.birth_date is not null
  where pms.minutes > 0
    and extract(year from age(f.date, p.birth_date)) <= 20
    and not exists (
      select 1 from public.debut_alerts da where da.player_id = pms.player_id
    )
    and not exists (
      select 1
      from public.player_match_stats pms2
      join public.fixtures f2 on f2.id = pms2.fixture_id
      join public.leagues l2 on l2.id = f2.league_id and l2.track_debuts
      where pms2.player_id = pms.player_id
        and pms2.minutes > 0
        and f2.date < f.date
    )
  order by pms.player_id, f.date asc
  on conflict (player_id) do nothing;
end;
$$;
```

Nota: el `cron.schedule` de `detect_debut_alerts()` NO va en esta migración — se agrega recién en el Task 8, después de confirmar el backfill (Task 7).

- [ ] **Step 2: Pedirle al usuario que la corra en el SQL Editor de Supabase**

- [ ] **Step 3: Verificar — pedirle que corra esto y comparta el resultado**

```sql
select id, name, country, has_player_stats, track_debuts from public.leagues
where id in (128,131,344,71,265,239,242,262,252,268,281,299,13,11)
order by country;
```

Expected: 14 filas, todas con `track_debuts = true`; las 12 que ya tenían `has_player_stats` en `true` lo siguen teniendo, y 281/299/13/11 ahora también en `true`.

- [ ] **Step 4: Commit (NO pushear)**

```bash
git add supabase/migrations/20260905_a_debut_alerts.sql
git commit -m "feat(debutantes): migracion de leagues.track_debuts + debut_alerts + detect_debut_alerts()"
```

---

### Task 2: Backfill histórico de las 4 competencias nuevas/reactivadas

**Files:** ninguno — task operativa, sin código.

**Interfaces:**
- Consumes: Edge Function `backfill-season` ya existente (`supabase/functions/backfill-season/index.ts`); `leagues.has_player_stats = true` (Task 1, ya aplicado en Supabase).
- Produces: `fixtures`/`player_match_stats` poblados para Perú, Venezuela, Libertadores, Sudamericana — consumido por la verificación del Task 7 y por `detect_debut_alerts()`.

- [ ] **Step 1: Confirmar que el Task 1 ya se aplicó en la base viva** (no tiene sentido backfillear ligas que todavía no existen en `leagues`).

- [ ] **Step 2: Llamar `backfill-season` para cada temporada de Perú y Venezuela (2023-2026)**

```bash
A=".env.local"  # en la raiz de primer-appcloud
url=$(grep VITE_SUPABASE_URL "$A" | cut -d= -f2 | tr -d '\r')
key=$(grep VITE_SUPABASE_ANON_KEY "$A" | cut -d= -f2 | tr -d '\r')

for season in 2023 2024 2025 2026; do
  curl -s -X POST "$url/functions/v1/backfill-season" \
    -H "Authorization: Bearer $key" -H "Content-Type: application/json" \
    -d "{\"league_id\": 281, \"season\": $season}"
  echo
  curl -s -X POST "$url/functions/v1/backfill-season" \
    -H "Authorization: Bearer $key" -H "Content-Type: application/json" \
    -d "{\"league_id\": 299, \"season\": $season}"
  echo
done
```

Expected: cada llamado responde `{"message":"Backfilled N fixtures...","total":N}`. Son 8 llamados en total (2 ligas x 4 temporadas).

- [ ] **Step 3: Llamar `backfill-season` para Libertadores y Sudamericana (temporada 2026, la única con `has_player_stats` recién activado)**

```bash
curl -s -X POST "$url/functions/v1/backfill-season" \
  -H "Authorization: Bearer $key" -H "Content-Type: application/json" \
  -d '{"league_id": 13, "season": 2026}'
echo
curl -s -X POST "$url/functions/v1/backfill-season" \
  -H "Authorization: Bearer $key" -H "Content-Type: application/json" \
  -d '{"league_id": 11, "season": 2026}'
```

- [ ] **Step 4: Avisarle al usuario que el procesamiento de minutos por jugador (`player_match_stats`) lo hace el cron `sync-player-stats-10min` ya existente, de a poco — puede tardar un rato en terminar de procesar todos los fixtures nuevos.** No hay commit en este task (no genera archivos).

---

### Task 3: `debutAlertsService.ts` — primer-appcloud

**Files:**
- Create: `src/services/debutAlertsService.ts`
- Test: `src/services/debutAlertsService.test.ts`

**Interfaces:**
- Consumes: tabla `debut_alerts` (Task 1), `players`, `teams`, `leagues` (ya existentes).
- Produces: `fetchDebutAlerts(): Promise<DebutAlert[]>` — consumido por `DebutantesPage.tsx` (Task 4).

- [ ] **Step 1: Escribir el test (falla primero)**

```ts
// src/services/debutAlertsService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}))

import { fetchDebutAlerts } from './debutAlertsService'

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  builder.select = vi.fn(self)
  builder.order = vi.fn(() => Promise.resolve(result))
  builder.in = vi.fn(() => Promise.resolve(result))
  return builder
}

beforeEach(() => {
  mockFrom.mockReset()
})

describe('fetchDebutAlerts', () => {
  it('arma un DebutAlert por cada fila, cruzando jugador/equipo/liga', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'debut_alerts') {
        return chain({
          data: [{ player_id: 1, league_id: 128, age_at_debut: 17, minutes: 23, debut_date: '2026-08-01' }],
          error: null,
        })
      }
      if (table === 'players') {
        return chain({
          data: [{ id: 1, name: 'Juan Perez', photo: 'foto.png', primary_position: 'DEL', current_team_id: 50 }],
          error: null,
        })
      }
      if (table === 'teams') {
        return chain({ data: [{ id: 50, name: 'Boca Juniors', logo: 'boca.png' }], error: null })
      }
      if (table === 'leagues') {
        return chain({ data: [{ id: 128, name: 'Liga Profesional' }], error: null })
      }
      return chain({ data: [], error: null })
    })

    const result = await fetchDebutAlerts()

    expect(result).toEqual([{
      playerId: 1,
      playerName: 'Juan Perez',
      photo: 'foto.png',
      position: 'DEL',
      teamName: 'Boca Juniors',
      teamLogo: 'boca.png',
      leagueName: 'Liga Profesional',
      ageAtDebut: 17,
      minutes: 23,
      debutDate: '2026-08-01',
    }])
  })

  it('devuelve array vacio si no hay debutantes', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }))
    expect(await fetchDebutAlerts()).toEqual([])
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/services/debutAlertsService.test.ts`
Expected: FAIL — el archivo todavía no existe.

- [ ] **Step 3: Implementar el servicio**

```ts
// src/services/debutAlertsService.ts
import { supabase } from '@/lib/supabase'

export interface DebutAlert {
  playerId: number
  playerName: string
  photo: string | null
  position: string | null
  teamName: string | null
  teamLogo: string | null
  leagueName: string | null
  ageAtDebut: number
  minutes: number
  debutDate: string
}

export async function fetchDebutAlerts(): Promise<DebutAlert[]> {
  const { data: alerts, error } = await supabase
    .from('debut_alerts')
    .select('player_id, league_id, age_at_debut, minutes, debut_date')
    .order('debut_date', { ascending: false })

  if (error || !alerts || alerts.length === 0) return []

  const playerIds = alerts.map(a => a.player_id)
  const leagueIds = [...new Set(alerts.map(a => a.league_id))]

  const { data: players } = await supabase
    .from('players')
    .select('id, name, photo, primary_position, current_team_id')
    .in('id', playerIds)

  const teamIds = [...new Set((players || []).map(p => p.current_team_id).filter((id): id is number => id !== null))]

  const { data: teams } = teamIds.length > 0
    ? await supabase.from('teams').select('id, name, logo').in('id', teamIds)
    : { data: [] as { id: number; name: string; logo: string | null }[] }

  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name')
    .in('id', leagueIds)

  const playerMap = new Map((players || []).map(p => [p.id, p]))
  const teamMap = new Map((teams || []).map(t => [t.id, t]))
  const leagueMap = new Map((leagues || []).map(l => [l.id, l]))

  return alerts.map(a => {
    const player = playerMap.get(a.player_id)
    const team = player?.current_team_id != null ? teamMap.get(player.current_team_id) : undefined
    const league = leagueMap.get(a.league_id)
    return {
      playerId: a.player_id,
      playerName: player?.name ?? 'Desconocido',
      photo: player?.photo ?? null,
      position: player?.primary_position ?? null,
      teamName: team?.name ?? null,
      teamLogo: team?.logo ?? null,
      leagueName: league?.name ?? null,
      ageAtDebut: a.age_at_debut,
      minutes: a.minutes,
      debutDate: a.debut_date,
    }
  })
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/services/debutAlertsService.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit (NO pushear)**

```bash
git add src/services/debutAlertsService.ts src/services/debutAlertsService.test.ts
git commit -m "feat(debutantes): debutAlertsService.fetchDebutAlerts"
```

---

### Task 4: Página `/debutantes` — primer-appcloud

**Files:**
- Create: `src/pages/DebutantesPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Navbar.tsx`
- Modify: `src/constants/translations.ts`

**Interfaces:**
- Consumes: `fetchDebutAlerts()` (Task 3).
- Produces: nada consumido por otra task de este repo.

- [ ] **Step 1: Implementar la página**

```tsx
// src/pages/DebutantesPage.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchDebutAlerts, type DebutAlert } from '@/services/debutAlertsService'

export default function DebutantesPage() {
  const [alerts, setAlerts] = useState<DebutAlert[] | null>(null)
  const navigate = useNavigate()

  useEffect(() => { fetchDebutAlerts().then(setAlerts) }, [])

  const goToPlayer = (a: DebutAlert) => {
    navigate(`/jugador/${encodeURIComponent(a.playerName)}?source=externo&apiId=${a.playerId}`)
  }

  return (
    <div className="max-w-screen-lg mx-auto px-4 sm:px-6 py-6 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-apple-gray-900 dark:text-white">Debutantes</h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
          Jugadores de 20 años o menos que jugaron su primer partido en una primera de LATAM.
        </p>
      </div>

      {alerts === null ? (
        <p className="text-sm text-apple-gray-400">Cargando...</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-apple-gray-400">Todavía no hay debutantes detectados.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {alerts.map(a => (
            <button
              key={a.playerId}
              onClick={() => goToPlayer(a)}
              className="card-apple p-4 text-left hover:shadow-apple-lg transition-shadow"
            >
              <div className="flex items-center gap-3">
                {a.photo ? (
                  <img src={a.photo} alt={a.playerName} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-apple-gray-900 dark:text-white truncate">{a.playerName}</p>
                  <p className="text-xs text-apple-gray-500 truncate">{a.teamName ?? '—'} · {a.leagueName ?? '—'}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-apple-gray-500">
                <span>{a.position ?? '—'} · {a.ageAtDebut} años</span>
                <span>{a.minutes}' · {new Date(a.debutDate).toLocaleDateString('es-AR')}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Agregar las traducciones `nav.debutantes` en los 9 idiomas**

En `src/constants/translations.ts`, agregar la línea `'nav.debutantes': "..."` inmediatamente después de cada una de las 9 líneas `'nav.busquedaTalento': ...` (líneas 382, 1639, 2895, 4151, 5407, 6663, 7919, 9175, 10417 en el archivo actual — verificar el número exacto antes de editar, puede haber corrido si el archivo cambió):

```ts
'nav.debutantes': "Debutantes",       // después de la línea 382 (es)
'nav.debutantes': "Debutants",        // después de la línea 1639 (en)
'nav.debutantes': "Debütanlar",       // después de la línea 2895 (tr)
'nav.debutantes': "Esordienti",       // después de la línea 4151 (it)
'nav.debutantes': "Débutants",        // después de la línea 5407 (fr)
'nav.debutantes': "Debütanten",       // después de la línea 6663 (de)
'nav.debutantes': "المبتدئون",         // después de la línea 7919 (ar)
'nav.debutantes': "新秀",              // después de la línea 9175 (zh)
'nav.debutantes': "デビュー選手",       // después de la línea 10417 (ja)
```

- [ ] **Step 3: Agregar la ruta en `App.tsx`**

Agregar el import lazy junto a los demás:

```tsx
const DebutantesPage = lazy(() => import('@/pages/DebutantesPage'))
```

Agregar la ruta (junto a las demás de "Búsqueda de Talento", ej. cerca de `/oportunidades`):

```tsx
<Route path="/debutantes" element={<DebutantesPage />} />
```

- [ ] **Step 4: Agregar la entrada al menú "Búsqueda de Talento" en `Navbar.tsx`**

En el array `items` de `talentGroup` (línea ~70-77), agregar:

```ts
{ to: '/debutantes', labelKey: 'nav.debutantes', icon: 'star' },
```

- [ ] **Step 5: Verificar que compila y pasan los tests**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores, todos los tests en verde.

- [ ] **Step 6: Commit (NO pushear)**

```bash
git add src/pages/DebutantesPage.tsx src/App.tsx src/components/layout/Navbar.tsx src/constants/translations.ts
git commit -m "feat(debutantes): pantalla /debutantes con lista y link a la ficha de jugador"
```

---

### Task 5: `debutAlertsService.ts` — independiente-platform

**Files** (en `C:\Users\marcos\Desktop\Proyectos Claude\independiente-platform`):
- Create: `src/services/debutAlertsService.ts`
- Test: `src/services/debutAlertsService.test.ts`

- [ ] Repetir exactamente los Steps 1-5 del Task 3 — el código es idéntico (mismas tablas `debut_alerts`/`players`/`teams`/`leagues`, mismo shape, mismo proyecto Supabase).

Commit (NO pushear):
```bash
git add src/services/debutAlertsService.ts src/services/debutAlertsService.test.ts
git commit -m "feat(debutantes): debutAlertsService.fetchDebutAlerts"
```

---

### Task 6: Página `/debutantes` — independiente-platform

**Files** (en `independiente-platform`):
- Create: `src/pages/DebutantesPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Navbar.tsx`
- Modify: `src/constants/translations.ts`

- [ ] **Step 1**: repetir el Step 1 del Task 4 (`DebutantesPage.tsx` idéntico).

- [ ] **Step 2**: agregar `'nav.debutantes'` en los 9 idiomas, después de cada línea `'nav.busquedaTalento'` de este repo (líneas 383, 1650, 2914, 4178, 5442, 6706, 7970, 9234, 10484 — verificar antes de editar) — mismas 9 traducciones del Task 4 Step 2.

- [ ] **Step 3**: agregar el import lazy + la ruta `/debutantes` en `App.tsx` de este repo.

- [ ] **Step 4**: agregar `{ to: '/debutantes', labelKey: 'nav.debutantes', icon: 'star' }` al array `items` de `talentGroup` en `Navbar.tsx` de este repo (línea ~97-107).

- [ ] **Step 5**: `npx tsc --noEmit && npm test` — sin errores, todo en verde.

- [ ] **Step 6**: Commit (NO pushear):
```bash
git add src/pages/DebutantesPage.tsx src/App.tsx src/components/layout/Navbar.tsx src/constants/translations.ts
git commit -m "feat(debutantes): pantalla /debutantes con lista y link a la ficha de jugador"
```

---

### Task 7: Verificación de la lógica de detección antes de activar el cron

**Files:** ninguno.

**Interfaces:**
- Consumes: `detect_debut_alerts()` (Task 1), datos del backfill (Task 2).
- Produces: confirmación de que es seguro activar el cron (Task 8).

- [ ] **Step 1: Confirmar que el backfill terminó de procesarse — pedirle al usuario que corra esto**

```sql
select l.name, l.country, count(*) filter (where f.stats_synced) as procesados, count(*) as total
from public.fixtures f
join public.leagues l on l.id = f.league_id
where f.league_id in (281, 299, 13, 11)
group by l.name, l.country;
```

Expected: `procesados` = `total` (o muy cerca) en las 4 filas — si hay muchos fixtures todavía sin `stats_synced`, esperar a que el cron de 10 minutos siga procesando y volver a correr esta consulta más tarde antes de seguir.

- [ ] **Step 2: Correr `detect_debut_alerts()` una vez a mano y revisar el resultado — pedirle al usuario que corra esto**

```sql
select public.detect_debut_alerts();

select da.*, p.name, p.birth_date, f.date as fecha_partido
from public.debut_alerts da
join public.players p on p.id = da.player_id
join public.fixtures f on f.id = da.fixture_id
order by da.debut_date desc
limit 20;
```

Expected: cada fila tiene sentido (edad calculada coincide con `birth_date` vs `fecha_partido`, nombres reconocibles). Si aparece algo claramente mal (ej. una edad negativa o un jugador conocido que claramente no es un debutante), avisar antes de seguir — puede ser señal de que el backfill de esa liga no terminó.

- [ ] **Step 3: Si todo se ve bien, no hay commit en este task** (task de verificación pura).

---

### Task 8: Activar el cron diario de detección

**Files:**
- Create: `supabase/migrations/20260905_b_debut_alerts_cron.sql`

**Interfaces:**
- Consumes: `detect_debut_alerts()` (Task 1), confirmado seguro por el Task 7.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260905_b_debut_alerts_cron.sql
--
-- Se separa del Task 1 a proposito: este cron solo se activa despues de
-- confirmar (Task 7) que el backfill historico de Peru/Venezuela/Libertadores/
-- Sudamericana ya se proceso -- activarlo antes puede generar falsos positivos.

select cron.schedule(
  'detect-debut-alerts-daily',
  '0 10 * * *',
  $$ select public.detect_debut_alerts(); $$
);
```

- [ ] **Step 2: Pedirle al usuario que la corra en el SQL Editor de Supabase.**

- [ ] **Step 3: Verificar — pedirle que corra esto y comparta el resultado**

```sql
select jobname, schedule, active from cron.job where jobname = 'detect-debut-alerts-daily';
```

Expected: 1 fila, `active = true`, `schedule = '0 10 * * *'`.

- [ ] **Step 4: Commit (NO pushear)**

```bash
git add supabase/migrations/20260905_b_debut_alerts_cron.sql
git commit -m "feat(debutantes): activa el cron diario de deteccion de debutantes"
```

---

## Self-Review

**Cobertura del spec:** ligas nuevas/activadas (Task 1), tabla + función de detección (Task 1), backfill (Task 2), frontend en los dos repos (Tasks 3-6), orden seguro de activación del cron (Tasks 7-8). Sin huecos frente al spec.

**Placeholders:** ninguno — cada task tiene código real y comandos de verificación concretos. Las traducciones de los 9 idiomas están escritas explícitamente, no delegadas.

**Consistencia:** `DebutAlert` (Task 3) → mismo shape consumido en `DebutantesPage.tsx` (Task 4); `fetchDebutAlerts()` → mismo nombre en ambos repos (Tasks 3 y 5); `detect_debut_alerts()` → mismo nombre en la función (Task 1), la verificación (Task 7) y el cron (Task 8).
