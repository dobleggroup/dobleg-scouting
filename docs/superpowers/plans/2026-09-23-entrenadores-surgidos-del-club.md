# Entrenadores — Surgidos del club por partido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tarjeta en la pestaña Resumen de un DT (Nicolás Domingo / Temperley) que muestra cuántos jugadores surgidos del club usó en cada partido de su ciclo, respaldada por la carrera enriquecida de cada jugador del plantel.

**Architecture:** Un script Python enriquece el plantel desde Transfermarkt (perfil, debuts, pases) + API-Football (vincula el id de jugador) y guarda una fila por jugador en `club_squad_careers` con el veredicto `homegrown`. En el front, un módulo puro reconstruye los minutos de cada jugador por partido (alineación + cambios + rojas de API-Football), un servicio junta partidos del ciclo + carreras, y una tarjeta Recharts los muestra.

**Tech Stack:** Python 3 stdlib (urllib, csv, unittest), Supabase (Postgres + RLS), React 18 + TypeScript, Recharts, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-entrenadores-surgidos-del-club-design.md`

## Global Constraints

- "Surgido del club" = su **primer club profesional** fue Temperley (TM club id **14542**). Juveniles en otro club no importan. Temperley II = **77897**, Temperley Sub-20 = **22597** (familia del club, no cuentan como "otro club").
- Ciclo de Domingo: **2026-01-01** en adelante (API-Football dice 2026-07-01: incorrecto). Cuentan todos los partidos oficiales (Primera Nacional + Copa Argentina): hoy **31**.
- API-Football: Temperley = team **454**, Domingo = coach **28899**. Evento `subst`: `player` = sale, `assist` = entra.
- `club_id` es `text` (`'dobleg'`), RLS `club_id = public.current_club_id()`; el script (service key) manda `club_id` explícito.
- Nunca pisar `homegrown_override` desde el script.
- Nada se escribe en Supabase sin que el usuario haya revisado el CSV del dry-run.
- UI: estética, prolija, sin errores, fácil, creativa y **con el estilo de la app** (superficies `bg-white dark:bg-apple-gray-800/60`, `rounded-apple-lg`, `border-apple-gray-200/60 dark:border-apple-gray-700/40`, `shadow-apple dark:shadow-apple-dark`, acento `brand-green`, franja superior `h-1 bg-brand-green`). Cargar las skills `frontend-design` y `dataviz` antes de escribir la tarjeta. Verificar claro/oscuro y mobile.
- Textos vía `t()`; claves nuevas en **es, en, it** (el resto cae a es por el fallback de `LanguageContext`).
- Secrets: nunca en archivos commiteados; `SUPABASE_SERVICE_KEY` y `FOOTBALL_API_KEY` por env (`scripts/secrets.bat` ya existe y no se commitea).

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260923_a_club_squad_careers.sql` | `agency_coaches.tenure_start` + tabla `club_squad_careers` + RLS |
| `src/constants/agencyCoaches.ts` / `src/services/agencyCoachesService.ts` | exponer `tenureStart` |
| `scripts/enrich-transfermarkt/squad_careers_lib.py` | funciones puras: parseo de debuts/perfil, pases, regla homegrown, vínculo con API |
| `scripts/enrich-transfermarkt/tests/test_squad_careers_lib.py` + `tests/fixtures/*.html` | tests unittest con HTML real |
| `scripts/enrich-transfermarkt/enrich_squad_careers.py` | I/O: TM + API-Football + CSV de revisión + upsert |
| `scripts/enrich-transfermarkt/input/temperley_squad.txt` | links TM del plantel |
| `src/features/coaches/homegrown/homegrownMatchUsage.ts` (+ test, + `__fixtures__/`) | cálculo puro de uso por partido y resumen |
| `src/services/squadCareersService.ts` | leer `club_squad_careers` |
| `src/services/homegrownUsageService.ts` | armar partidos del ciclo (fixtures + lineups + eventos) |
| `src/features/coaches/components/CoachHomegrownUsageCard.tsx` | la tarjeta |
| `src/features/coaches/components/CoachSummaryTab.tsx` | renderizar la tarjeta |
| `src/constants/translations.ts` | claves `coachDetail.homegrown*` |
| Eliminar: `src/features/coaches/wyscoutReport/homegrownUsage.ts`, `homegrownUsage.test.ts`, `homegrownPlayers.ts` | mecanismo viejo basado en PDF |

---

### Task 1: Migración + `tenureStart` en `AgencyCoach`

**Files:**
- Create: `supabase/migrations/20260923_a_club_squad_careers.sql`
- Modify: `src/constants/agencyCoaches.ts` (interface `AgencyCoach`)
- Modify: `src/services/agencyCoachesService.ts` (`AgencyCoachRow`, `mapRow`)
- Test: `src/services/agencyCoachesService.test.ts`

**Interfaces:**
- Produces: `AgencyCoach.tenureStart?: string | null` (ISO `YYYY-MM-DD`); tabla `club_squad_careers` con las columnas de abajo (Task 3 escribe, Task 5 lee).

- [ ] **Step 1: Test que falla** — en `agencyCoachesService.test.ts`, dentro de `describe('listAgencyCoaches')`, agregar:

```ts
  it('mapea tenure_start a tenureStart (null si falta)', async () => {
    mockFrom.mockReturnValue(chain({
      data: [
        { key: 'domingo', full_name: 'Nicolás Domingo', photo_url: null, status: 'activo', club: 'Temperley',
          api_team_id: 454, reserve_api_team_id: null, league_api_id: 129, league_name: 'Primera Nacional',
          league_season: 2026, coach_api_id: 28899, relationship: 'propio', tenure_start: '2026-01-01' },
        { key: 'stillitano', full_name: 'Leandro Stillitano', photo_url: null, status: 'sin_club', club: null,
          api_team_id: null, reserve_api_team_id: null, league_api_id: null, league_name: null,
          league_season: null, coach_api_id: 19200, relationship: 'propio' },
      ],
      error: null,
    }))
    const coaches = await listAgencyCoaches()
    expect(coaches?.[0].tenureStart).toBe('2026-01-01')
    expect(coaches?.[1].tenureStart).toBeNull()
  })
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/services/agencyCoachesService.test.ts`
Expected: FAIL (`tenureStart` es `undefined`).

- [ ] **Step 3: Implementar**

`src/constants/agencyCoaches.ts` — agregar al final de la interface:

```ts
  /** Fecha (YYYY-MM-DD) en que el DT asumió en su club actual. Null = usar la de API-Football. */
  tenureStart?: string | null
```

`src/services/agencyCoachesService.ts` — en `AgencyCoachRow` agregar `tenure_start?: string | null` y en `mapRow` agregar `tenureStart: row.tenure_start ?? null,`.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/services/agencyCoachesService.test.ts`
Expected: PASS (todos, incluidos los existentes; si algún test existente compara el objeto completo con `toEqual`, agregarle `tenureStart: null`).

- [ ] **Step 5: Escribir la migración** `supabase/migrations/20260923_a_club_squad_careers.sql`:

```sql
-- Surgidos del club (spec 2026-09-23): inicio del ciclo del DT + carrera enriquecida del plantel.

ALTER TABLE public.agency_coaches ADD COLUMN IF NOT EXISTS tenure_start DATE;
-- API-Football dice 2026-07-01, pero Domingo dirigió todos los partidos de 2026 (confirmado por el usuario).
UPDATE public.agency_coaches SET tenure_start = '2026-01-01' WHERE key = 'domingo' AND tenure_start IS NULL;

CREATE TABLE IF NOT EXISTS public.club_squad_careers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id TEXT NOT NULL DEFAULT public.current_club_id(),
  team_api_id INT NOT NULL,
  squad TEXT NOT NULL CHECK (squad = ANY (ARRAY['primera', 'reserva'])),
  tm_player_id INT NOT NULL,
  api_player_id INT,
  full_name TEXT NOT NULL,
  short_name TEXT,
  position TEXT,
  birth_date DATE,
  nationality TEXT,
  height_cm INT,
  foot TEXT,
  photo_url TEXT,
  market_value_eur INT,
  contract_until DATE,
  joined_at DATE,
  joined_from TEXT,
  youth_clubs TEXT[] NOT NULL DEFAULT '{}',
  first_pro_club_tm_id INT,
  first_pro_club_name TEXT,
  pro_debut_date DATE,
  pro_debut_club TEXT,
  pro_debut_club_tm_id INT,
  pro_debut_competition TEXT,
  pro_debut_opponent TEXT,
  pro_debut_coach TEXT,
  transfer_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  homegrown_auto BOOLEAN NOT NULL DEFAULT false,
  homegrown_reason TEXT,
  homegrown_override BOOLEAN,
  sources JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, tm_player_id)
);

CREATE INDEX IF NOT EXISTS club_squad_careers_team_idx ON public.club_squad_careers(club_id, team_api_id);

ALTER TABLE public.club_squad_careers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_club_squad_careers" ON public.club_squad_careers;
CREATE POLICY "read_club_squad_careers" ON public.club_squad_careers
  FOR SELECT TO authenticated USING (club_id = public.current_club_id());
DROP POLICY IF EXISTS "write_club_squad_careers" ON public.club_squad_careers;
CREATE POLICY "write_club_squad_careers" ON public.club_squad_careers
  FOR ALL TO authenticated USING (club_id = public.current_club_id()) WITH CHECK (club_id = public.current_club_id());
```

- [ ] **Step 6: Aplicar la migración**

Run: `npx supabase db push` (el proyecto ya está linkeado: `supabase/.temp/linked-project.json`). Si pide confirmación o falla por migraciones remotas desfasadas, **frenar y avisar al usuario** (no usar `--include-all` ni reparar historial sin permiso); alternativa: pegar el SQL en el SQL editor del dashboard.
Verificar: `curl "$VITE_SUPABASE_URL/rest/v1/club_squad_careers?select=id&limit=1" -H "apikey: $K"` → `[]` (200, tabla existe; RLS oculta filas a anon).

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit -p .` → sin errores.

```bash
git add supabase/migrations/20260923_a_club_squad_careers.sql src/constants/agencyCoaches.ts src/services/agencyCoachesService.ts src/services/agencyCoachesService.test.ts
git commit -m "feat(entrenadores): tenure_start del DT y tabla club_squad_careers"
```

---

### Task 2: Librería Python pura (debuts, perfil, pases, regla, vínculo API)

**Files:**
- Create: `scripts/enrich-transfermarkt/squad_careers_lib.py`
- Create: `scripts/enrich-transfermarkt/tests/__init__.py` (vacío)
- Create: `scripts/enrich-transfermarkt/tests/test_squad_careers_lib.py`
- Create: `scripts/enrich-transfermarkt/tests/fixtures/{pacheco_debuts,morrone_debuts,richarte_debuts,angelini_profile}.html`

**Interfaces:**
- Produces (Task 3 los usa):
  - `parse_debuts(page_html: str) -> list[dict]` — cada dict: `section, competition, club_tm_id:int, club_name, date:'YYYY-MM-DD', opponent, coach`
  - `pick_pro_debut(debuts) -> dict | None`
  - `parse_profile_html(page_html: str) -> dict` — `nationality, position, foot, joined_at, contract_until` (fechas ISO o None)
  - `normalize_transfers(raw_history: dict, club_names: dict[str,str]) -> list[dict]` — `date, from_id, from_name, to_id, to_name, type`, ordenado por fecha
  - `youth_clubs(transfers) -> list[str]`
  - `classify_homegrown(debut, transfers, home_id=14542, home_family=frozenset({14542,77897,22597})) -> tuple[bool, str, bool]` = `(homegrown, reason, needs_review)`
  - `link_api_player(tm_full_name: str, api_players: dict[int,str]) -> tuple[int|None, str]` — confianza `'exact' | 'surname-only' | 'ambiguous' | 'none'`
  - `norm(s) -> str`

- [ ] **Step 1: Guardar fixtures HTML reales**

```bash
cd scripts/enrich-transfermarkt && mkdir -p tests/fixtures && touch tests/__init__.py
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
curl -s -A "$UA" https://www.transfermarkt.es/oswaldo-pacheco/debuets/spieler/1160434 -o tests/fixtures/pacheco_debuts.html; sleep 1
curl -s -A "$UA" https://www.transfermarkt.es/lisandro-morrone/debuets/spieler/1129363 -o tests/fixtures/morrone_debuts.html; sleep 1
curl -s -A "$UA" https://www.transfermarkt.es/lucas-richarte/debuets/spieler/1257767 -o tests/fixtures/richarte_debuts.html; sleep 1
curl -s -A "$UA" https://www.transfermarkt.es/lucas-angelini/profil/spieler/971407 -o tests/fixtures/angelini_profile.html
```

Verificar que cada archivo pese > 50 KB.

- [ ] **Step 2: Tests que fallan** — `tests/test_squad_careers_lib.py`:

```python
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import squad_careers_lib as lib

FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
def read(name):
    with open(os.path.join(FIX, name), encoding="utf-8", errors="replace") as f:
        return f.read()


class ParseDebuts(unittest.TestCase):
    def test_pacheco_debuto_en_liniers(self):
        debut = lib.pick_pro_debut(lib.parse_debuts(read("pacheco_debuts.html")))
        self.assertEqual(debut["date"], "2025-02-09")
        self.assertEqual(debut["club_tm_id"], 98564)
        self.assertEqual(debut["coach"], "Diego Herrero")

    def test_morrone_ignora_viareggio_juvenil(self):
        debuts = lib.parse_debuts(read("morrone_debuts.html"))
        self.assertTrue(any("Viareggio" in d["competition"] for d in debuts))
        debut = lib.pick_pro_debut(debuts)
        self.assertEqual(debut["date"], "2026-04-25")
        self.assertEqual(debut["club_tm_id"], 14542)
        self.assertIn("Domingo", debut["coach"])
        self.assertIn("Patronato", debut["opponent"])

    def test_richarte_debut_primera_nacional(self):
        debut = lib.pick_pro_debut(lib.parse_debuts(read("richarte_debuts.html")))
        self.assertEqual(debut["date"], "2024-04-21")
        self.assertEqual(debut["competition"], "Primera Nacional")
        self.assertIn("Col", debut["opponent"])

    def test_sin_tabla(self):
        self.assertEqual(lib.parse_debuts("<html></html>"), [])
        self.assertIsNone(lib.pick_pro_debut([]))


class ParseProfile(unittest.TestCase):
    def test_angelini(self):
        p = lib.parse_profile_html(read("angelini_profile.html"))
        self.assertEqual(p["nationality"], "Argentina")
        self.assertEqual(p["position"], "Lateral izquierdo")
        self.assertEqual(p["foot"], "Izquierdo")
        self.assertEqual(p["joined_at"], "2023-01-01")
        self.assertEqual(p["contract_until"], "2026-12-31")


RAW_HISTORY = {"history": {"terminated": [
    {"transferSource": {"clubId": "97767"}, "transferDestination": {"clubId": "77897"},
     "details": {"date": "2025-01-01T00:00:00+01:00"}, "typeDetails": {"type": "TRANSFER"}},
    {"transferSource": {"clubId": "77897"}, "transferDestination": {"clubId": "14542"},
     "details": {"date": "2026-01-01T00:00:00+01:00"}, "typeDetails": {"type": "INTERNAL_TRANSFER"}},
], "pending": []}}
NAMES = {"97767": "Don Torcuato Youth", "77897": "CA Temperley II", "14542": "CA Temperley", "19529": "CSD Merlo"}


class Transfers(unittest.TestCase):
    def test_normaliza_y_ordena(self):
        t = lib.normalize_transfers(RAW_HISTORY, NAMES)
        self.assertEqual([x["date"] for x in t], ["2025-01-01", "2026-01-01"])
        self.assertEqual(t[0]["from_name"], "Don Torcuato Youth")

    def test_youth_clubs(self):
        self.assertEqual(lib.youth_clubs(lib.normalize_transfers(RAW_HISTORY, NAMES)), ["Don Torcuato Youth", "CA Temperley II"])


class Classify(unittest.TestCase):
    def debut(self, club_id, name="X"):
        return {"club_tm_id": club_id, "club_name": name, "date": "2024-04-21",
                "opponent": "CA Colón", "competition": "Primera Nacional", "coach": "Mariano Campodónico"}

    def test_debut_en_temperley(self):
        ok, reason, review = lib.classify_homegrown(self.debut(14542, "CA Temperley"), [])
        self.assertTrue(ok); self.assertFalse(review)
        self.assertIn("21/04/2024", reason); self.assertIn("CA Temperley", reason)

    def test_debut_en_otro_club(self):
        ok, reason, review = lib.classify_homegrown(self.debut(98564, "CSD Liniers"), [])
        self.assertFalse(ok); self.assertIn("CSD Liniers", reason)

    def test_sin_debut_solo_juveniles_antes(self):
        ok, reason, review = lib.classify_homegrown(None, lib.normalize_transfers(RAW_HISTORY, NAMES))
        self.assertTrue(ok); self.assertTrue(review); self.assertIn("inferido", reason)

    def test_sin_debut_con_club_senior_antes(self):
        raw = {"history": {"terminated": [
            {"transferSource": {"clubId": "19529"}, "transferDestination": {"clubId": "14542"},
             "details": {"date": "2025-01-05T00:00:00+01:00"}, "typeDetails": {"type": "TRANSFER"}}], "pending": []}}
        ok, reason, review = lib.classify_homegrown(None, lib.normalize_transfers(raw, NAMES))
        self.assertFalse(ok); self.assertTrue(review); self.assertIn("CSD Merlo", reason)


class LinkApi(unittest.TestCase):
    API = {1: "V. Diaz", 2: "F. Diaz", 3: "J. Diaz", 4: "D. Trebotic", 5: "R. E. Quiroga", 6: "V. Aguinagalde"}

    def test_inicial_desambigua(self):
        self.assertEqual(lib.link_api_player("Franco Díaz", self.API), (2, "exact"))
        self.assertEqual(lib.link_api_player("Jonathan Díaz", self.API), (3, "exact"))

    def test_segunda_inicial(self):
        self.assertEqual(lib.link_api_player("Elías Quiroga", self.API), (5, "exact"))

    def test_apellido_unico_sin_inicial(self):
        self.assertEqual(lib.link_api_player("León Trebotic", self.API), (4, "surname-only"))

    def test_acentos_y_enie(self):
        self.assertEqual(lib.link_api_player("Valentín Aguiñagalde", self.API), (6, "exact"))

    def test_ambiguo_y_ninguno(self):
        self.assertEqual(lib.link_api_player("Juan Díaz", {1: "V. Diaz", 2: "F. Diaz"}), (None, "ambiguous"))
        self.assertEqual(lib.link_api_player("Nadie Nunca", self.API), (None, "none"))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Correr y ver que falla**

Run: `python -m unittest discover -s scripts/enrich-transfermarkt/tests -v`
Expected: FAIL/ERROR `ModuleNotFoundError: squad_careers_lib`.

- [ ] **Step 4: Implementar** `scripts/enrich-transfermarkt/squad_careers_lib.py`:

```python
"""Funciones puras para enriquecer la carrera del plantel (spec 2026-09-23).
Sin I/O: el script enrich_squad_careers.py hace los requests y llama acá."""
import re
from html import unescape
from unicodedata import normalize as unicode_normalize

YOUTH_COMPETITION_RE = re.compile(r"juvenil|youth|junior|sub[- ]?\d{2}|\bu-?\d{2}\b|reserva|primavera|viareggio", re.I)
YOUTH_CLUB_RE = re.compile(r"\bII\b|\bIII\b|youth|juvenil|reserva|\bu-?\d{2}\b|sub[- ]?\d{2}", re.I)
# TM usa ids especiales para "Sin club" (515), "Desconocido" (75) y "Retirado" (123).
NON_CLUB_IDS = {"0", "75", "123", "515", ""}


def norm(s):
    return unicode_normalize("NFD", s or "").encode("ascii", "ignore").decode().lower().strip()


def _text(fragment):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def _iso(ddmmyyyy):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", ddmmyyyy or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def _ddmmyyyy(iso):
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


def parse_debuts(page_html):
    start = page_html.find("<table")
    if start < 0:
        return []
    table = page_html[start:page_html.find("</table>", start)]
    section, out = "", []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S):
        if 'colspan="7"' in tr:
            section = _text(tr)
            continue
        # La 1ra <td> de TM no cierra: el regex la une con la del nombre de competición,
        # así que las celdas quedan [competición, club, fecha, encuentro, entrenador, edad].
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if len(tds) < 6:
            continue
        club = re.search(r'title="([^"]+)"[^>]*href="[^"]*/verein/(\d+)', tds[1])
        date = _iso(_text(tds[2]))
        if not club or not date:
            continue
        club_id = int(club.group(2))
        opponent = ""
        for name, cid in re.findall(r'title="([^"]+)"[^>]*href="[^"]*/verein/(\d+)', tds[3]):
            if int(cid) != club_id:
                opponent = unescape(name)
                break
        out.append({
            "section": section,
            "competition": _text(tds[0]),
            "club_tm_id": club_id,
            "club_name": unescape(club.group(1)),
            "date": date,
            "opponent": opponent,
            "coach": _text(tds[4]),
        })
    return out


def pick_pro_debut(debuts):
    senior = [d for d in debuts if not YOUTH_COMPETITION_RE.search(f"{d['section']} {d['competition']}")]
    return min(senior, key=lambda d: d["date"]) if senior else None


def _label_value(page_html, label):
    i = page_html.find(label)
    if i < 0:
        return None
    for part in re.split(r"<[^>]+>", page_html[i + len(label):i + len(label) + 600]):
        value = unescape(part).replace("\xa0", " ").strip(" :\n\t")
        if value:
            return value
    return None


def parse_profile_html(page_html):
    m = re.search(r'itemprop="nationality"(.*?)</span>', page_html, re.S)
    nationalities = re.findall(r'title="([^"]+)"', m.group(1)) if m else []
    return {
        "nationality": " / ".join(unescape(n) for n in nationalities) or None,
        "position": _label_value(page_html, "Posición:"),
        "foot": _label_value(page_html, "Pie:"),
        "joined_at": _iso(_label_value(page_html, "Fichado:")),
        "contract_until": _iso(_label_value(page_html, "Contrato hasta")),
    }


def normalize_transfers(raw_history, club_names):
    hist = (raw_history or {}).get("history") or {}
    rows = []
    for t in (hist.get("terminated") or []) + (hist.get("pending") or []):
        src = str((t.get("transferSource") or {}).get("clubId") or "")
        dst = str((t.get("transferDestination") or {}).get("clubId") or "")
        date = ((t.get("details") or {}).get("date") or "")[:10]
        if not date:
            continue
        rows.append({
            "date": date,
            "from_id": src, "from_name": club_names.get(src, src),
            "to_id": dst, "to_name": club_names.get(dst, dst),
            "type": (t.get("typeDetails") or {}).get("type") or "",
        })
    return sorted(rows, key=lambda r: r["date"])


def _club_sequence(transfers):
    seq = []
    for t in transfers:
        for cid, name in ((t["from_id"], t["from_name"]), (t["to_id"], t["to_name"])):
            if cid not in NON_CLUB_IDS and (not seq or seq[-1][0] != cid):
                seq.append((cid, name))
    return seq


def youth_clubs(transfers):
    seen = []
    for _, name in _club_sequence(transfers):
        if YOUTH_CLUB_RE.search(name) and name not in seen:
            seen.append(name)
    return seen


def classify_homegrown(debut, transfers, home_id=14542, home_family=frozenset({14542, 77897, 22597})):
    if debut:
        where = f"{debut['club_name']} el {_ddmmyyyy(debut['date'])}"
        detail = f" vs {debut['opponent']}" if debut.get("opponent") else ""
        detail += f" ({debut['competition']}" + (f", DT {debut['coach']})" if debut.get("coach") else ")")
        return (debut["club_tm_id"] == home_id, f"Debutó en {where}{detail}", False)
    for cid, name in _club_sequence(transfers):
        if int(cid) in home_family:
            break
        if not YOUTH_CLUB_RE.search(name):
            return (False, f"Sin debut registrado; jugó en {name} antes de llegar al club", True)
    return (True, "Sin debut profesional registrado; no pasó por otro club senior antes del club (inferido)", True)


def _api_name_parts(api_name):
    tokens = norm(api_name).replace(".", ". ").split()
    initials = [t[0] for t in tokens if t.endswith(".")]
    surname = " ".join(t for t in tokens if not t.endswith("."))
    return initials, surname


def link_api_player(tm_full_name, api_players):
    tm_tokens = norm(tm_full_name).split()
    if not tm_tokens:
        return (None, "none")
    candidates = []
    for api_id, api_name in api_players.items():
        initials, surname = _api_name_parts(api_name)
        n = len(surname.split())
        if surname and n <= len(tm_tokens) and " ".join(tm_tokens[-n:]) == surname:
            candidates.append((api_id, initials))
    if not candidates:
        return (None, "none")
    by_initial = [c for c in candidates if tm_tokens[0][0] in c[1]]
    if len(by_initial) == 1:
        return (by_initial[0][0], "exact")
    if len(candidates) == 1:
        return (candidates[0][0], "surname-only")
    return (None, "ambiguous")
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `python -m unittest discover -s scripts/enrich-transfermarkt/tests -v`
Expected: todos PASS. Si `test_angelini` falla por la etiqueta (TM a veces usa `Posición:` con entidad HTML), ajustar `_label_value` para buscar también la versión `unescape`-ada; no cambiar el test.

- [ ] **Step 6: Commit**

```bash
git add scripts/enrich-transfermarkt/squad_careers_lib.py scripts/enrich-transfermarkt/tests
git commit -m "feat(enrich): libreria de carrera del plantel (debuts, pases, regla surgido del club)"
```

---

### Task 3: Script de enriquecimiento + dry-run + revisión del usuario

**Files:**
- Create: `scripts/enrich-transfermarkt/input/temperley_squad.txt`
- Create: `scripts/enrich-transfermarkt/enrich_squad_careers.py`
- Modify: `.gitignore` (agregar `scripts/enrich-transfermarkt/output/`: hoy no está ignorado)

**Interfaces:**
- Consumes: todo lo de Task 2; tabla `club_squad_careers` (Task 1).
- Produces: filas en `club_squad_careers` para `team_api_id = 454` (solo tras `--apply`).

- [ ] **Step 1: Input** `scripts/enrich-transfermarkt/input/temperley_squad.txt` (formato `squad|url`, `#` = comentario):

```
# Temperley — primer equipo (24)
primera|https://www.transfermarkt.es/ezequiel-mastrolia/profil/spieler/159076
primera|https://www.transfermarkt.es/valentin-diaz/profil/spieler/1230638
primera|https://www.transfermarkt.es/jeronimo-pourtau/profil/spieler/504885
primera|https://www.transfermarkt.es/iago-iriarte/profil/spieler/891771
primera|https://www.transfermarkt.es/valentin-aguinagalde/profil/spieler/1283950
primera|https://www.transfermarkt.es/oswaldo-pacheco/profil/spieler/1160434
primera|https://www.transfermarkt.es/lucas-angelini/profil/spieler/971407
primera|https://www.transfermarkt.es/pedro-souto/profil/spieler/924999
primera|https://www.transfermarkt.es/rodrigo-mazur/profil/spieler/414669
primera|https://www.transfermarkt.es/lorenzo-monti/profil/spieler/732441
primera|https://www.transfermarkt.es/valentino-werro/profil/spieler/1105635
primera|https://www.transfermarkt.es/adrian-arregui/profil/spieler/358016
primera|https://www.transfermarkt.es/franco-diaz/profil/spieler/748060
primera|https://www.transfermarkt.es/geronimo-tomasetti/profil/spieler/697064
primera|https://www.transfermarkt.es/lucas-richarte/profil/spieler/1257767
primera|https://www.transfermarkt.es/luciano-nieto/profil/spieler/87455
primera|https://www.transfermarkt.es/alejandro-melo/profil/spieler/373623
primera|https://www.transfermarkt.es/franco-benitez/profil/spieler/924159
primera|https://www.transfermarkt.es/fernando-brandan/profil/spieler/358014
primera|https://www.transfermarkt.es/julian-carrasco/profil/spieler/1111086
primera|https://www.transfermarkt.es/marcos-echeverria/profil/spieler/1007593
primera|https://www.transfermarkt.es/facundo-kruger/profil/spieler/755666
primera|https://www.transfermarkt.es/gabriel-hauche/profil/spieler/54845
primera|https://www.transfermarkt.es/francisco-silva/profil/spieler/1555462
# Temperley II (10) + Cristopher Nova
reserva|https://www.transfermarkt.es/lisandro-morrone/profil/spieler/1129363
reserva|https://www.transfermarkt.es/matias-calzon/profil/spieler/1310068
reserva|https://www.transfermarkt.es/franco-tirotta/profil/spieler/1567089
reserva|https://www.transfermarkt.es/nicolas-avalos/profil/spieler/1514474
reserva|https://www.transfermarkt.es/rodrigo-stocco/profil/spieler/1307227
reserva|https://www.transfermarkt.es/santiago-grecco/profil/spieler/1339374
reserva|https://www.transfermarkt.es/jonathan-diaz/profil/spieler/1514473
reserva|https://www.transfermarkt.es/elias-quiroga/profil/spieler/1560650
reserva|https://www.transfermarkt.es/leon-trebotic/profil/spieler/1593578
reserva|https://www.transfermarkt.es/bautista-fernandez/profil/spieler/1528956
reserva|https://www.transfermarkt.es/cristopher-nova/profil/spieler/1384314
```

- [ ] **Step 2: Implementar** `scripts/enrich-transfermarkt/enrich_squad_careers.py`:

```python
"""
Enriquece la carrera del plantel de un club (spec 2026-09-23 surgidos del club).
Run:  python enrich_squad_careers.py                 (dry-run: solo CSV de revisión)
      python enrich_squad_careers.py --apply         (upsert en club_squad_careers)
Env:  FOOTBALL_API_KEY; con --apply además SUPABASE_URL + SUPABASE_SERVICE_KEY
Opt:  TEAM_API_ID (454), SEASONS ("2026"), SINCE ("2026-01-01"), CLUB_ID ("dobleg"),
      INPUT (input/temperley_squad.txt), DELAY_MS (1200)
"""
import csv, json, os, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone
import squad_careers_lib as lib

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
APPLY = "--apply" in sys.argv
TEAM_API_ID = int(os.environ.get("TEAM_API_ID", "454"))
SEASONS = [s.strip() for s in os.environ.get("SEASONS", "2026").split(",")]
SINCE = os.environ.get("SINCE", "2026-01-01")
CLUB_ID = os.environ.get("CLUB_ID", "dobleg")
INPUT = os.path.join(HERE, os.environ.get("INPUT", "input/temperley_squad.txt"))
DELAY = int(os.environ.get("DELAY_MS", "1200")) / 1000
API_KEY = os.environ.get("FOOTBALL_API_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
FINISHED = {"FT", "AET", "PEN"}

if not API_KEY:
    sys.exit("Falta FOOTBALL_API_KEY")
if APPLY and not (SUPABASE_URL and SUPABASE_KEY):
    sys.exit("--apply necesita SUPABASE_URL y SUPABASE_SERVICE_KEY")


def http(url, headers=None, body=None, method=None):
    req = urllib.request.Request(url, data=body, headers={"User-Agent": UA, **(headers or {})}, method=method)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception as e:  # red/429: reintento con espera creciente
            if attempt == 2:
                raise
            print(f"  reintento {url[:80]}: {e}")
            time.sleep(3 * (attempt + 1))


def tm_json(path):
    time.sleep(DELAY)
    return json.loads(http(f"https://tmapi-alpha.transfermarkt.technology{path}"))["data"]


def tm_html(url):
    time.sleep(DELAY)
    return http(url)


def api(path, params):
    raw = http(f"https://v3.football.api-sports.io{path}?{urllib.parse.urlencode(params)}", {"x-apisports-key": API_KEY})
    return json.loads(raw)["response"]


def read_input():
    rows = []
    with open(INPUT, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            squad, url = line.split("|", 1)
            tm_id = int(re.search(r"/spieler/(\d+)", url).group(1))
            rows.append({"squad": squad, "url": url, "tm_id": tm_id})
    return rows


def api_squad_players():
    """{api_player_id: nombre} de todos los que estuvieron en alguna alineación del ciclo."""
    players = {}
    for season in SEASONS:
        for fx in api("/fixtures", {"team": TEAM_API_ID, "season": season}):
            if fx["fixture"]["status"]["short"] not in FINISHED or fx["fixture"]["date"][:10] < SINCE:
                continue
            for lineup in api("/fixtures/lineups", {"fixture": fx["fixture"]["id"], "team": TEAM_API_ID}):
                for p in lineup["startXI"] + lineup["substitutes"]:
                    players[p["player"]["id"]] = p["player"]["name"]
    return players


def club_names(ids):
    names = {}
    ids = [i for i in sorted(set(ids)) if i not in lib.NON_CLUB_IDS]
    for i in range(0, len(ids), 20):
        query = "&".join(f"ids[]={c}" for c in ids[i:i + 20])
        for club in tm_json(f"/clubs?{query}"):
            names[str(club["id"])] = club["name"]
    return names


def enrich(entry, api_players):
    profile = tm_json(f"/player/{entry['tm_id']}")
    profile_html = lib.parse_profile_html(tm_html(entry["url"]))
    debuts = lib.parse_debuts(tm_html(entry["url"].replace("/profil/", "/debuets/")))
    raw_history = tm_json(f"/transfer/history/player/{entry['tm_id']}")
    hist = raw_history.get("history") or {}
    ids = [str((t.get(k) or {}).get("clubId") or "") for t in (hist.get("terminated") or []) + (hist.get("pending") or [])
           for k in ("transferSource", "transferDestination")]
    transfers = lib.normalize_transfers(raw_history, club_names(ids))
    debut = lib.pick_pro_debut(debuts)
    homegrown, reason, review = lib.classify_homegrown(debut, transfers)
    api_id, confidence = lib.link_api_player(profile["name"], api_players)
    height = (profile.get("attributes") or {}).get("height")
    mv = ((profile.get("marketValueDetails") or {}).get("current") or {}).get("value")
    first_senior = debut or {}
    row = {
        "club_id": CLUB_ID, "team_api_id": TEAM_API_ID, "squad": entry["squad"],
        "tm_player_id": entry["tm_id"], "api_player_id": api_id,
        "full_name": profile["name"], "short_name": profile.get("shortName"),
        "position": profile_html["position"], "birth_date": (profile.get("lifeDates") or {}).get("dateOfBirth"),
        "nationality": profile_html["nationality"], "height_cm": round(height * 100) if height else None,
        "foot": profile_html["foot"], "photo_url": profile.get("portraitUrl"),
        "market_value_eur": mv, "contract_until": profile_html["contract_until"],
        "joined_at": profile_html["joined_at"],
        "joined_from": transfers[-1]["from_name"] if transfers else None,
        "youth_clubs": lib.youth_clubs(transfers),
        "first_pro_club_tm_id": first_senior.get("club_tm_id"), "first_pro_club_name": first_senior.get("club_name"),
        "pro_debut_date": first_senior.get("date"), "pro_debut_club": first_senior.get("club_name"),
        "pro_debut_club_tm_id": first_senior.get("club_tm_id"), "pro_debut_competition": first_senior.get("competition"),
        "pro_debut_opponent": first_senior.get("opponent"), "pro_debut_coach": first_senior.get("coach"),
        "transfer_history": transfers,
        "homegrown_auto": homegrown, "homegrown_reason": reason,
        "sources": {"transfermarkt": entry["url"], "api_link": confidence,
                    "updated": datetime.now(timezone.utc).isoformat()},
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    return row, review, confidence


def upsert(rows):
    body = json.dumps(rows).encode("utf-8")
    http(f"{SUPABASE_URL}/rest/v1/club_squad_careers?on_conflict=club_id,tm_player_id",
         {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=minimal"}, body, "POST")


def main():
    entries = read_input()
    print(f"{len(entries)} jugadores en {os.path.basename(INPUT)}")
    api_players = api_squad_players()
    print(f"{len(api_players)} jugadores distintos en alineaciones API desde {SINCE}")
    rows, report = [], []
    for e in entries:
        try:
            row, review, confidence = enrich(e, api_players)
        except Exception as err:
            print(f"  ERROR {e['url']}: {err}")
            report.append({"jugador": e["url"], "error": str(err)})
            continue
        rows.append(row)
        flag = "REVISAR" if review or confidence != "exact" else ""
        print(f"  {'SI ' if row['homegrown_auto'] else 'no '} {row['full_name']:<24} api={row['api_player_id']} ({confidence}) {flag} — {row['homegrown_reason']}")
        report.append({
            "jugador": row["full_name"], "squad": row["squad"], "surgido_del_club": "SI" if row["homegrown_auto"] else "no",
            "motivo": row["homegrown_reason"], "debut": row["pro_debut_date"] or "", "club_debut": row["pro_debut_club"] or "",
            "dt_debut": row["pro_debut_coach"] or "", "clubes_juveniles": " > ".join(row["youth_clubs"]),
            "api_player_id": row["api_player_id"] or "", "vinculo_api": confidence, "revisar": flag, "error": "",
        })
    linked = {r["api_player_id"] for r in rows if r["api_player_id"]}
    for api_id, name in sorted(api_players.items(), key=lambda kv: kv[1]):
        if api_id not in linked:
            report.append({"jugador": name, "squad": "?", "api_player_id": api_id, "vinculo_api": "SIN FILA TM",
                           "revisar": "REVISAR", "motivo": "Jugó en el ciclo pero no está en el input"})
    out_dir = os.path.join(HERE, "output")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "temperley_careers_review.csv")
    fields = ["jugador", "squad", "surgido_del_club", "motivo", "debut", "club_debut", "dt_debut",
              "clubes_juveniles", "api_player_id", "vinculo_api", "revisar", "error"]
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, restval="")
        w.writeheader()
        w.writerows(report)
    print(f"\nRevisión: {out}")
    if APPLY:
        upsert(rows)
        print(f"Upsert OK: {len(rows)} filas en club_squad_careers")
    else:
        print("Dry-run: no se escribió nada en Supabase (usar --apply)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Correr el dry-run**

Run (PowerShell): `$env:FOOTBALL_API_KEY=(Select-String '^FOOTBALL_API_KEY=' .env.local).Line.Split('=',2)[1]; cd scripts/enrich-transfermarkt; python enrich_squad_careers.py`
Expected: 35 líneas `SI/no …`, sin `ERROR`; CSV en `output/temperley_careers_review.csv`. Controles mínimos que tienen que salir:
- Pacheco → `no` (debut CSD Liniers 09/02/2025).
- Morrone → `SI` (debut Temperley 25/04/2026, DT Nicolás Domingo).
- Richarte → `SI` (debut 21/04/2024 vs Colón).
- Hauche, Brandán, Mastrolía → `no`.
- Ningún jugador del input con `vinculo_api = none` que figure en el listado Wyscout con partidos > 0 (Tirotta y Quiroga tienen 0: `none` es aceptable).
Si algo no cumple, arreglar la librería con un test nuevo en Task 2 antes de seguir.

- [ ] **Step 4: CHECKPOINT: frenar y mostrarle al usuario el CSV** en una tabla corta: surgidos `SI`, `REVISAR` y jugadores `SIN FILA TM`. Esperar su OK o sus correcciones. Las correcciones de veredicto van a `homegrown_override` (Step 6), no se cambia el código.

- [ ] **Step 5: Aplicar**

Run: con `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` de `scripts/secrets.bat` en el entorno: `python enrich_squad_careers.py --apply`
Verificar: `curl "$SUPABASE_URL/rest/v1/club_squad_careers?select=full_name,homegrown_auto&team_api_id=eq.454" -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"` → 35 filas.

- [ ] **Step 6: Overrides del usuario** (solo si pidió alguno), por cada uno:
`curl -X PATCH "$SUPABASE_URL/rest/v1/club_squad_careers?club_id=eq.dobleg&tm_player_id=eq.<ID>" -H "apikey: …" -H "Authorization: Bearer …" -H "Content-Type: application/json" -d '{"homegrown_override": true}'`

- [ ] **Step 7: Commit** (sin CSV ni secrets)

```bash
git add scripts/enrich-transfermarkt/enrich_squad_careers.py scripts/enrich-transfermarkt/input/temperley_squad.txt .gitignore
git commit -m "feat(enrich): script de carrera del plantel de Temperley con dry-run de revision"
```

---

### Task 4: Cálculo puro de uso por partido

**Files:**
- Create: `src/features/coaches/homegrown/homegrownMatchUsage.ts`
- Create: `src/features/coaches/homegrown/homegrownMatchUsage.test.ts`
- Create: `src/features/coaches/homegrown/__fixtures__/fixture-1498827-lineup.json`, `fixture-1498827-events.json`
- Delete: `src/features/coaches/wyscoutReport/homegrownUsage.ts`, `homegrownUsage.test.ts`, `homegrownPlayers.ts`

**Interfaces:**
- Consumes: `AgencyFixture`, `ApiFixtureLineup`, `ApiFixtureEvent` de `@/types/footballApi`.
- Produces:

```ts
export interface MatchInput { fixture: AgencyFixture; lineup: ApiFixtureLineup | null; events: ApiFixtureEvent[] }
export interface PlayerMinutes { apiPlayerId: number; name: string; minutes: number; started: boolean; inAt: number | null; outAt: number | null; sentOff: boolean }
export interface HomegrownMatchUsage {
  fixtureId: number; date: string; rival: string; rivalLogo: string; isHome: boolean
  score: string | null; competition: string; hasData: boolean
  starters: PlayerMinutes[]; subsIn: PlayerMinutes[]; totalMinutes: number; teamMinutes: number
}
export interface HomegrownPlayerTotals { apiPlayerId: number; name: string; appearances: number; starts: number; minutes: number }
export interface HomegrownSummary {
  matches: number; matchesWithData: number; matchesWithAny: number; avgPlayersPerMatch: number
  totalMinutes: number; teamMinutes: number; minutesShare: number; players: HomegrownPlayerTotals[]
}
export function computeMatchMinutes(input: MatchInput, teamId: number): PlayerMinutes[]
export function computeHomegrownUsage(matches: MatchInput[], teamId: number, homegrown: Map<number, string>): HomegrownMatchUsage[]
export function summarizeHomegrownUsage(usage: HomegrownMatchUsage[]): HomegrownSummary
```

(`homegrown` = `api_player_id → nombre para mostrar`.)

- [ ] **Step 1: Guardar datos reales de un partido** (Temperley 3-1 Almagro, 19/09):

```bash
K=$(grep -h "^FOOTBALL_API_KEY" .env.local | cut -d= -f2- | tr -d '\r"')
mkdir -p src/features/coaches/homegrown/__fixtures__
curl -s "https://v3.football.api-sports.io/fixtures/lineups?fixture=1498827" -H "x-apisports-key: $K" | python -c "import json,sys;print(json.dumps([l for l in json.load(sys.stdin)['response'] if l['team']['id']==454][0],ensure_ascii=False,indent=1))" > src/features/coaches/homegrown/__fixtures__/fixture-1498827-lineup.json
curl -s "https://v3.football.api-sports.io/fixtures/events?fixture=1498827" -H "x-apisports-key: $K" | python -c "import json,sys;print(json.dumps(json.load(sys.stdin)['response'],ensure_ascii=False,indent=1))" > src/features/coaches/homegrown/__fixtures__/fixture-1498827-events.json
```

Anotar los `player.id` de Calzón, Richarte y Ávalos del lineup (se usan en el test como `CALZON`, `RICHARTE`, `AVALOS`). Verificado antes: Calzón y Richarte fueron titulares; Ávalos entró al 29' por Arregui.

- [ ] **Step 2: Tests que fallan** — `homegrownMatchUsage.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import lineupJson from './__fixtures__/fixture-1498827-lineup.json'
import eventsJson from './__fixtures__/fixture-1498827-events.json'
import { computeMatchMinutes, computeHomegrownUsage, summarizeHomegrownUsage, type MatchInput } from './homegrownMatchUsage'
import type { AgencyFixture, ApiFixtureEvent, ApiFixtureLineup } from '@/types/footballApi'

const TEAM = 454
const lineup = lineupJson as ApiFixtureLineup
const events = eventsJson as ApiFixtureEvent[]
const idOf = (name: string) => [...lineup.startXI, ...lineup.substitutes].find(p => p.player.name === name)!.player.id
const CALZON = idOf('M. Calzon')
const RICHARTE = idOf('L. Richarte')
const AVALOS = idOf('N. Avalos')
const HAUCHE = idOf('G. Hauche')

function fixture(over: Partial<AgencyFixture> = {}): AgencyFixture {
  return {
    fixtureId: 1498827, date: '2026-09-19T20:00:00-03:00', timestamp: 1790000000, venue: '', city: '',
    status: 'Match Finished', statusShort: 'FT', elapsed: 90, leagueName: 'Primera Nacional', leagueLogo: '',
    leagueCountry: 'Argentina', leagueFlag: null, round: '', isHome: true, players: [],
    homeTeam: { id: TEAM, name: 'Temperley', logo: '' }, awayTeam: { id: 1, name: 'Almagro', logo: 'a.png' },
    goalsHome: 3, goalsAway: 1, ...over,
  }
}
const real: MatchInput = { fixture: fixture(), lineup, events }

function ev(elapsed: number, type: string, detail: string, playerId: number, assistId: number | null = null): ApiFixtureEvent {
  return { time: { elapsed, extra: null }, team: { id: TEAM, name: 'Temperley', logo: '' },
    player: { id: playerId, name: String(playerId) }, assist: { id: assistId, name: assistId ? String(assistId) : null },
    type, detail, comments: null }
}
function tinyLineup(starters: number[], subs: number[]): ApiFixtureLineup {
  const p = (id: number) => ({ player: { id, name: `P${id}`, number: null, pos: null, grid: null } })
  return { team: { id: TEAM, name: 'Temperley', logo: '' }, coach: null, formation: null,
    startXI: starters.map(p), substitutes: subs.map(p) }
}

describe('computeMatchMinutes (datos reales vs Almagro)', () => {
  const mins = computeMatchMinutes(real, TEAM)
  const get = (id: number) => mins.find(m => m.apiPlayerId === id)!
  it('titular que no sale juega 90', () => {
    expect(get(CALZON)).toMatchObject({ started: true, minutes: 90, inAt: null, outAt: null })
  })
  it('ingresado al 29 juega 61', () => {
    expect(get(AVALOS)).toMatchObject({ started: false, inAt: 29, minutes: 61 })
  })
  it('titular sustituido al 72 juega 72', () => {
    expect(get(HAUCHE)).toMatchObject({ started: true, outAt: 72, minutes: 72 })
  })
  it('suplentes que no entraron no aparecen', () => {
    expect(mins.find(m => m.name === 'L. Morrone')).toBeUndefined()
  })
  it('ignora eventos del rival', () => {
    expect(mins.length).toBe(16) // 11 titulares + 5 cambios
  })
})

describe('computeMatchMinutes (casos sintéticos)', () => {
  it('entra y sale', () => {
    const m = computeMatchMinutes({ fixture: fixture(), lineup: tinyLineup([1], [2, 3]),
      events: [ev(46, 'subst', 'Substitution 1', 1, 2), ev(80, 'subst', 'Substitution 2', 2, 3)] }, TEAM)
    expect(m.find(x => x.apiPlayerId === 2)).toMatchObject({ inAt: 46, outAt: 80, minutes: 34 })
  })
  it('roja corta los minutos', () => {
    const m = computeMatchMinutes({ fixture: fixture(), lineup: tinyLineup([1], []),
      events: [ev(60, 'Card', 'Red Card', 1)] }, TEAM)
    expect(m[0]).toMatchObject({ minutes: 60, outAt: 60, sentOff: true })
  })
  it('alargue de Copa: 120 minutos', () => {
    const m = computeMatchMinutes({ fixture: fixture({ statusShort: 'PEN' }), lineup: tinyLineup([1], []), events: [] }, TEAM)
    expect(m[0].minutes).toBe(120)
  })
  it('entra en el descuento: mínimo 1 minuto', () => {
    const m = computeMatchMinutes({ fixture: fixture(), lineup: tinyLineup([1], [2]),
      events: [{ ...ev(90, 'subst', 'Substitution 1', 1, 2), time: { elapsed: 90, extra: 4 } }] }, TEAM)
    expect(m.find(x => x.apiPlayerId === 2)!.minutes).toBe(1)
  })
})

describe('computeHomegrownUsage + summarize', () => {
  const homegrown = new Map([[CALZON, 'Matías Calzón'], [RICHARTE, 'Lucas Richarte'], [AVALOS, 'Nicolás Ávalos']])
  const noData: MatchInput = { fixture: fixture({ fixtureId: 2, isHome: false,
    homeTeam: { id: 9, name: 'Patronato', logo: 'p.png' }, awayTeam: { id: TEAM, name: 'Temperley', logo: '' },
    goalsHome: 0, goalsAway: 0 }), lineup: null, events: [] }
  const usage = computeHomegrownUsage([real, noData], TEAM, homegrown)

  it('separa titulares e ingresados y usa el nombre de la carrera', () => {
    expect(usage[0].starters.map(p => p.name).sort()).toEqual(['Lucas Richarte', 'Matías Calzón'])
    expect(usage[0].subsIn.map(p => p.name)).toEqual(['Nicolás Ávalos'])
    expect(usage[0]).toMatchObject({ rival: 'Almagro', isHome: true, score: '3-1', hasData: true, teamMinutes: 990 })
  })
  it('partido sin alineación queda marcado sin datos', () => {
    expect(usage[1]).toMatchObject({ rival: 'Patronato', hasData: false, starters: [], subsIn: [], score: '0-0' })
  })
  it('resumen solo promedia partidos con datos', () => {
    const s = summarizeHomegrownUsage(usage)
    expect(s).toMatchObject({ matches: 2, matchesWithData: 1, matchesWithAny: 1, avgPlayersPerMatch: 3 })
    expect(s.totalMinutes).toBe(usage[0].totalMinutes)
    expect(s.minutesShare).toBeCloseTo(usage[0].totalMinutes / 990)
    expect(s.players[0]).toMatchObject({ appearances: 1 })
  })
})
```

Si el test "16 minutos" no da 16 porque el partido tuvo menos de 5 cambios o una roja, corregir el número esperado según el JSON guardado (no el código).

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run src/features/coaches/homegrown`
Expected: FAIL (módulo inexistente).

- [ ] **Step 4: Implementar** `homegrownMatchUsage.ts`:

```ts
// src/features/coaches/homegrown/homegrownMatchUsage.ts
import type { AgencyFixture, ApiFixtureEvent, ApiFixtureLineup } from '@/types/footballApi'

export interface MatchInput { fixture: AgencyFixture; lineup: ApiFixtureLineup | null; events: ApiFixtureEvent[] }
export interface PlayerMinutes {
  apiPlayerId: number; name: string; minutes: number; started: boolean
  inAt: number | null; outAt: number | null; sentOff: boolean
}
export interface HomegrownMatchUsage {
  fixtureId: number; date: string; rival: string; rivalLogo: string; isHome: boolean
  score: string | null; competition: string; hasData: boolean
  starters: PlayerMinutes[]; subsIn: PlayerMinutes[]; totalMinutes: number; teamMinutes: number
}
export interface HomegrownPlayerTotals { apiPlayerId: number; name: string; appearances: number; starts: number; minutes: number }
export interface HomegrownSummary {
  matches: number; matchesWithData: number; matchesWithAny: number; avgPlayersPerMatch: number
  totalMinutes: number; teamMinutes: number; minutesShare: number; players: HomegrownPlayerTotals[]
}

const EXTRA_TIME_STATUSES = new Set(['AET', 'PEN'])
const RED_CARD_DETAILS = new Set(['Red Card', 'Second Yellow card'])

function matchLength(fixture: AgencyFixture): number {
  return EXTRA_TIME_STATUSES.has(fixture.statusShort) ? 120 : 90
}

/** Minutos de cada jugador del equipo que pisó la cancha. API-Football no da minutos
 *  en Primera Nacional: se reconstruyen con titulares + cambios (`player` sale,
 *  `assist` entra) + rojas. El descuento se ignora (se cuenta hasta 90/120). */
export function computeMatchMinutes({ fixture, lineup, events }: MatchInput, teamId: number): PlayerMinutes[] {
  if (!lineup) return []
  const end = matchLength(fixture)
  const names = new Map<number, string>()
  for (const p of [...lineup.startXI, ...lineup.substitutes]) names.set(p.player.id, p.player.name)
  const state = new Map<number, PlayerMinutes>()
  for (const p of lineup.startXI) {
    state.set(p.player.id, { apiPlayerId: p.player.id, name: p.player.name, minutes: 0, started: true, inAt: null, outAt: null, sentOff: false })
  }
  const ours = events
    .filter(e => e.team.id === teamId)
    .sort((a, b) => a.time.elapsed - b.time.elapsed || (a.time.extra ?? 0) - (b.time.extra ?? 0))
  for (const e of ours) {
    const minute = Math.min(e.time.elapsed, end)
    if (e.type === 'subst') {
      const out = e.player.id != null ? state.get(e.player.id) : undefined
      if (out && out.outAt === null) out.outAt = minute
      const inId = e.assist.id
      if (inId != null && !state.has(inId)) {
        state.set(inId, { apiPlayerId: inId, name: names.get(inId) ?? e.assist.name ?? String(inId), minutes: 0, started: false, inAt: minute, outAt: null, sentOff: false })
      }
    } else if (e.type === 'Card' && RED_CARD_DETAILS.has(e.detail) && e.player.id != null) {
      const p = state.get(e.player.id)
      if (p && p.outAt === null) { p.outAt = minute; p.sentOff = true }
    }
  }
  return [...state.values()].map(p => {
    const from = p.started ? 0 : (p.inAt ?? 0)
    const to = p.outAt ?? end
    return { ...p, minutes: p.started ? Math.max(0, to - from) : Math.max(1, to - from) }
  })
}

export function computeHomegrownUsage(matches: MatchInput[], teamId: number, homegrown: Map<number, string>): HomegrownMatchUsage[] {
  return matches.map(m => {
    const { fixture } = m
    const rivalTeam = fixture.isHome ? fixture.awayTeam : fixture.homeTeam
    const minutes = computeMatchMinutes(m, teamId)
      .filter(p => homegrown.has(p.apiPlayerId))
      .map(p => ({ ...p, name: homegrown.get(p.apiPlayerId) ?? p.name }))
      .sort((a, b) => b.minutes - a.minutes)
    const scored = fixture.goalsHome !== null && fixture.goalsAway !== null
    const ownGoals = fixture.isHome ? fixture.goalsHome : fixture.goalsAway
    const rivalGoals = fixture.isHome ? fixture.goalsAway : fixture.goalsHome
    return {
      fixtureId: fixture.fixtureId,
      date: fixture.date,
      rival: rivalTeam.name,
      rivalLogo: rivalTeam.logo,
      isHome: fixture.isHome,
      score: scored ? `${ownGoals}-${rivalGoals}` : null,
      competition: fixture.leagueName,
      hasData: m.lineup !== null,
      starters: minutes.filter(p => p.started),
      subsIn: minutes.filter(p => !p.started),
      totalMinutes: minutes.reduce((s, p) => s + p.minutes, 0),
      teamMinutes: 11 * matchLength(fixture),
    }
  })
}

export function summarizeHomegrownUsage(usage: HomegrownMatchUsage[]): HomegrownSummary {
  const withData = usage.filter(u => u.hasData)
  const totals = new Map<number, HomegrownPlayerTotals>()
  for (const u of withData) {
    for (const p of [...u.starters, ...u.subsIn]) {
      const t = totals.get(p.apiPlayerId) ?? { apiPlayerId: p.apiPlayerId, name: p.name, appearances: 0, starts: 0, minutes: 0 }
      t.appearances += 1
      if (p.started) t.starts += 1
      t.minutes += p.minutes
      totals.set(p.apiPlayerId, t)
    }
  }
  const totalMinutes = withData.reduce((s, u) => s + u.totalMinutes, 0)
  const teamMinutes = withData.reduce((s, u) => s + u.teamMinutes, 0)
  const used = withData.reduce((s, u) => s + u.starters.length + u.subsIn.length, 0)
  return {
    matches: usage.length,
    matchesWithData: withData.length,
    matchesWithAny: withData.filter(u => u.starters.length + u.subsIn.length > 0).length,
    avgPlayersPerMatch: withData.length ? used / withData.length : 0,
    totalMinutes,
    teamMinutes,
    minutesShare: teamMinutes ? totalMinutes / teamMinutes : 0,
    players: [...totals.values()].sort((a, b) => b.minutes - a.minutes),
  }
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx vitest run src/features/coaches/homegrown`
Expected: PASS.

- [ ] **Step 6: Borrar el mecanismo viejo** (verificar primero que nada más lo importa):

Run: `git grep -n "homegrownUsage\|homegrownPlayers\|HOMEGROWN_PLAYERS_BY_COACH" -- src` → solo los 3 archivos a borrar.
Si `docs/` los menciona, está bien (es historial). Luego:
`git rm src/features/coaches/wyscoutReport/homegrownUsage.ts src/features/coaches/wyscoutReport/homegrownUsage.test.ts src/features/coaches/wyscoutReport/homegrownPlayers.ts`
Si `minutesPlayedInMatch` de `parseMatchesSection` queda sin otros usos, **no** borrarlo (fuera de alcance).

- [ ] **Step 7: Suite + typecheck + commit**

Run: `npx vitest run` → todo PASS. `npx tsc --noEmit -p .` → sin errores.

```bash
git add src/features/coaches/homegrown
git commit -m "feat(entrenadores): calculo de surgidos del club por partido desde alineaciones API"
```

---

### Task 5: Servicios (carreras + armado del ciclo)

**Files:**
- Create: `src/services/squadCareersService.ts`
- Create: `src/services/squadCareersService.test.ts`
- Create: `src/services/homegrownUsageService.ts`
- Create: `src/services/homegrownUsageService.test.ts`

**Interfaces:**
- Consumes: `fetchSeasonFixtures(teamId, season)`, `fetchFixtureLineups(fixtureId)`, `fetchFixtureEvents(fixtureId)`, `fetchCoachProfile(key, fullName, apiId)` de `footballApiService`; `isMatchFinished` de `@/utils/coachCalendar`; `computeHomegrownUsage`, `summarizeHomegrownUsage` (Task 4); `AgencyCoach.tenureStart` (Task 1).
- Produces:

```ts
// squadCareersService.ts
export interface TransferEntry { date: string; fromName: string; toName: string; type: string }
export interface SquadCareer {
  tmPlayerId: number; apiPlayerId: number | null; fullName: string; shortName: string | null
  squad: 'primera' | 'reserva'; position: string | null; birthDate: string | null; nationality: string | null
  heightCm: number | null; foot: string | null; photoUrl: string | null; marketValueEur: number | null
  contractUntil: string | null; youthClubs: string[]
  proDebutDate: string | null; proDebutClub: string | null; proDebutCompetition: string | null
  proDebutOpponent: string | null; proDebutCoach: string | null
  transferHistory: TransferEntry[]; homegrown: boolean; homegrownReason: string | null
}
export async function listSquadCareers(teamApiId: number): Promise<SquadCareer[] | null>
// homegrownUsageService.ts
export interface HomegrownUsageResult {
  tenureStart: string
  usage: HomegrownMatchUsage[]
  summary: HomegrownSummary
  careers: SquadCareer[]            // solo homegrown
  debutedWithCoach: SquadCareer[]   // homegrown que debutaron con este DT en su ciclo
}
export function resolveTenureStart(coach: AgencyCoach, apiStart: string | null): string | null
export function debutedWithCoach(careers: SquadCareer[], coachFullName: string, tenureStart: string): SquadCareer[]
export async function loadHomegrownUsage(coach: AgencyCoach): Promise<HomegrownUsageResult | null>
```

- [ ] **Step 1: Tests que fallan**

`squadCareersService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => mockFrom(...a) } }))
import { listSquadCareers } from './squadCareersService'

function chain(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {}
  b.select = vi.fn(() => b)
  b.eq = vi.fn(() => Promise.resolve(result))
  return b
}
const ROW = {
  tm_player_id: 1129363, api_player_id: 555, full_name: 'Lisandro Morrone', short_name: 'L. Morrone',
  squad: 'reserva', position: 'Portero', birth_date: '2005-12-23', nationality: 'Argentina', height_cm: null,
  foot: null, photo_url: null, market_value_eur: 25000, contract_until: null, youth_clubs: ['Don Torcuato Youth'],
  pro_debut_date: '2026-04-25', pro_debut_club: 'CA Temperley', pro_debut_competition: 'Primera Nacional',
  pro_debut_opponent: 'CA Patronato', pro_debut_coach: 'Nicolás Domingo',
  transfer_history: [{ date: '2025-01-01', from_name: 'Don Torcuato Youth', to_name: 'CA Temperley II', type: 'TRANSFER', from_id: '97767', to_id: '77897' }],
  homegrown_auto: false, homegrown_reason: 'x', homegrown_override: true,
}
beforeEach(() => mockFrom.mockReset())

describe('listSquadCareers', () => {
  it('mapea filas y el override gana sobre el auto', async () => {
    mockFrom.mockReturnValue(chain({ data: [ROW], error: null }))
    const [c] = (await listSquadCareers(454))!
    expect(mockFrom).toHaveBeenCalledWith('club_squad_careers')
    expect(c).toMatchObject({ fullName: 'Lisandro Morrone', apiPlayerId: 555, homegrown: true, youthClubs: ['Don Torcuato Youth'] })
    expect(c.transferHistory[0]).toEqual({ date: '2025-01-01', fromName: 'Don Torcuato Youth', toName: 'CA Temperley II', type: 'TRANSFER' })
  })
  it('override null usa el auto', async () => {
    mockFrom.mockReturnValue(chain({ data: [{ ...ROW, homegrown_override: null }], error: null }))
    expect((await listSquadCareers(454))![0].homegrown).toBe(false)
  })
  it('error de Supabase devuelve null', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'boom' } }))
    expect(await listSquadCareers(454)).toBeNull()
  })
})
```

`homegrownUsageService.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveTenureStart, debutedWithCoach } from './homegrownUsageService'
import type { AgencyCoach } from '@/constants/agencyCoaches'
import type { SquadCareer } from './squadCareersService'

const coach = { key: 'domingo', fullName: 'Nicolás Domingo', tenureStart: '2026-01-01' } as AgencyCoach
const career = (over: Partial<SquadCareer>) => ({ fullName: 'X', proDebutDate: null, proDebutCoach: null, homegrown: true, ...over }) as SquadCareer

describe('resolveTenureStart', () => {
  it('la fecha manual gana sobre la de la API', () => {
    expect(resolveTenureStart(coach, '2026-07-01')).toBe('2026-01-01')
  })
  it('sin fecha manual usa la API', () => {
    expect(resolveTenureStart({ ...coach, tenureStart: null }, '2026-07-01')).toBe('2026-07-01')
  })
  it('sin ninguna devuelve null', () => {
    expect(resolveTenureStart({ ...coach, tenureStart: null }, null)).toBeNull()
  })
})

describe('debutedWithCoach', () => {
  it('matchea el DT del debut sin importar acentos y respeta la fecha', () => {
    const list = [
      career({ fullName: 'Lisandro Morrone', proDebutDate: '2026-04-25', proDebutCoach: 'Nicolas Domingo' }),
      career({ fullName: 'Lucas Richarte', proDebutDate: '2024-04-21', proDebutCoach: 'Mariano Campodónico' }),
      career({ fullName: 'Viejo', proDebutDate: '2019-01-01', proDebutCoach: 'Nicolás Domingo' }),
    ]
    expect(debutedWithCoach(list, 'Nicolás Domingo', '2026-01-01').map(c => c.fullName)).toEqual(['Lisandro Morrone'])
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/services/squadCareersService.test.ts src/services/homegrownUsageService.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar** `src/services/squadCareersService.ts`:

```ts
import { supabase } from '@/lib/supabase'

export interface TransferEntry { date: string; fromName: string; toName: string; type: string }
export interface SquadCareer {
  tmPlayerId: number; apiPlayerId: number | null; fullName: string; shortName: string | null
  squad: 'primera' | 'reserva'; position: string | null; birthDate: string | null; nationality: string | null
  heightCm: number | null; foot: string | null; photoUrl: string | null; marketValueEur: number | null
  contractUntil: string | null; youthClubs: string[]
  proDebutDate: string | null; proDebutClub: string | null; proDebutCompetition: string | null
  proDebutOpponent: string | null; proDebutCoach: string | null
  transferHistory: TransferEntry[]; homegrown: boolean; homegrownReason: string | null
}

interface SquadCareerRow {
  tm_player_id: number; api_player_id: number | null; full_name: string; short_name: string | null
  squad: 'primera' | 'reserva'; position: string | null; birth_date: string | null; nationality: string | null
  height_cm: number | null; foot: string | null; photo_url: string | null; market_value_eur: number | null
  contract_until: string | null; youth_clubs: string[] | null
  pro_debut_date: string | null; pro_debut_club: string | null; pro_debut_competition: string | null
  pro_debut_opponent: string | null; pro_debut_coach: string | null
  transfer_history: { date: string; from_name: string; to_name: string; type: string }[] | null
  homegrown_auto: boolean; homegrown_reason: string | null; homegrown_override: boolean | null
}

function mapRow(r: SquadCareerRow): SquadCareer {
  return {
    tmPlayerId: r.tm_player_id, apiPlayerId: r.api_player_id, fullName: r.full_name, shortName: r.short_name,
    squad: r.squad, position: r.position, birthDate: r.birth_date, nationality: r.nationality,
    heightCm: r.height_cm, foot: r.foot, photoUrl: r.photo_url, marketValueEur: r.market_value_eur,
    contractUntil: r.contract_until, youthClubs: r.youth_clubs ?? [],
    proDebutDate: r.pro_debut_date, proDebutClub: r.pro_debut_club, proDebutCompetition: r.pro_debut_competition,
    proDebutOpponent: r.pro_debut_opponent, proDebutCoach: r.pro_debut_coach,
    transferHistory: (r.transfer_history ?? []).map(t => ({ date: t.date, fromName: t.from_name, toName: t.to_name, type: t.type })),
    homegrown: r.homegrown_override ?? r.homegrown_auto,
    homegrownReason: r.homegrown_reason,
  }
}

/** `null` = falla de Supabase; `[]` = el equipo todavía no tiene plantel enriquecido. */
export async function listSquadCareers(teamApiId: number): Promise<SquadCareer[] | null> {
  const { data, error } = await supabase.from('club_squad_careers').select('*').eq('team_api_id', teamApiId)
  if (error) return null
  return ((data ?? []) as SquadCareerRow[]).map(mapRow)
}
```

`src/services/homegrownUsageService.ts`:

```ts
import type { AgencyCoach } from '@/constants/agencyCoaches'
import { fetchCoachProfile, fetchFixtureEvents, fetchFixtureLineups, fetchSeasonFixtures } from '@/services/footballApiService'
import { isMatchFinished } from '@/utils/coachCalendar'
import { normalizeForSearch } from '@/lib/search'
import { listSquadCareers, type SquadCareer } from '@/services/squadCareersService'
import {
  computeHomegrownUsage, summarizeHomegrownUsage,
  type HomegrownMatchUsage, type HomegrownSummary, type MatchInput,
} from '@/features/coaches/homegrown/homegrownMatchUsage'

export interface HomegrownUsageResult {
  tenureStart: string
  usage: HomegrownMatchUsage[]
  summary: HomegrownSummary
  careers: SquadCareer[]
  debutedWithCoach: SquadCareer[]
}

export function resolveTenureStart(coach: AgencyCoach, apiStart: string | null): string | null {
  return coach.tenureStart ?? apiStart
}

export function debutedWithCoach(careers: SquadCareer[], coachFullName: string, tenureStart: string): SquadCareer[] {
  const target = normalizeForSearch(coachFullName)
  return careers
    .filter(c => c.homegrown && c.proDebutDate && c.proDebutDate >= tenureStart && c.proDebutCoach
      && normalizeForSearch(c.proDebutCoach) === target)
    .sort((a, b) => (a.proDebutDate ?? '').localeCompare(b.proDebutDate ?? ''))
}

/** Lotes chicos para no pegarle 60 requests juntos a la API (cache de 7 días en footballApiService). */
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)))
  return out
}

/** `null` = no se puede mostrar (sin equipo, sin inicio de ciclo, sin plantel enriquecido o error). */
export async function loadHomegrownUsage(coach: AgencyCoach): Promise<HomegrownUsageResult | null> {
  const teamId = coach.apiTeamId
  if (!teamId) return null
  const careers = await listSquadCareers(teamId)
  if (!careers || careers.length === 0) return null

  let apiStart: string | null = null
  if (!coach.tenureStart) {
    const profile = await fetchCoachProfile(coach.key, coach.fullName, coach.coachApiId)
    apiStart = profile?.career.find(c => c.teamId === teamId && c.end === null)?.start ?? null
  }
  const tenureStart = resolveTenureStart(coach, apiStart)
  if (!tenureStart) return null

  const firstSeason = Number(tenureStart.slice(0, 4))
  const lastSeason = new Date().getFullYear()
  const seasons = Array.from({ length: lastSeason - firstSeason + 1 }, (_, i) => firstSeason + i)
  const fixtures = (await Promise.all(seasons.map(s => fetchSeasonFixtures(teamId, s))))
    .flat()
    .filter(f => isMatchFinished(f.statusShort) && f.date.slice(0, 10) >= tenureStart)
    .sort((a, b) => a.timestamp - b.timestamp)
  const unique = [...new Map(fixtures.map(f => [f.fixtureId, f])).values()]

  const matches: MatchInput[] = await inBatches(unique, 6, async fixture => {
    const [lineups, events] = await Promise.all([fetchFixtureLineups(fixture.fixtureId), fetchFixtureEvents(fixture.fixtureId)])
    return { fixture, lineup: lineups.find(l => l.team.id === teamId) ?? null, events }
  })

  const homegrownCareers = careers.filter(c => c.homegrown)
  const homegrown = new Map(homegrownCareers.filter(c => c.apiPlayerId !== null).map(c => [c.apiPlayerId as number, c.fullName]))
  const usage = computeHomegrownUsage(matches, teamId, homegrown)
  return {
    tenureStart,
    usage,
    summary: summarizeHomegrownUsage(usage),
    careers: homegrownCareers,
    debutedWithCoach: debutedWithCoach(homegrownCareers, coach.fullName, tenureStart),
  }
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/services/squadCareersService.test.ts src/services/homegrownUsageService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/squadCareersService.ts src/services/squadCareersService.test.ts src/services/homegrownUsageService.ts src/services/homegrownUsageService.test.ts
git commit -m "feat(entrenadores): servicios de carrera del plantel y uso de surgidos del club en el ciclo del DT"
```

---

### Task 6: Tarjeta "Surgidos del club" en Resumen

**Files:**
- Create: `src/features/coaches/components/CoachHomegrownUsageCard.tsx`
- Modify: `src/features/coaches/components/CoachSummaryTab.tsx` (render debajo de `<CoachSeasonStatsCard coach={coach} />`)
- Modify: `src/constants/translations.ts` (bloques `es`, `en`, `it`)

**Interfaces:**
- Consumes: `loadHomegrownUsage(coach)` → `HomegrownUsageResult | null` (Task 5).
- Produces: `export default function CoachHomegrownUsageCard({ coach }: { coach: AgencyCoach })`.

- [ ] **Step 1: Cargar skills de diseño** — invocar `frontend-design:frontend-design` y `dataviz` y seguirlas (colores con el validador de `dataviz` contra `#FFFFFF` y `#0E0E10`; series: titulares = `brand-green` #22C55E pleno, ingresados = mismo hue más claro; minutos = neutro/secundario validado). Leer `CoachSeasonStatsCard.tsx` y `CoachMatchMetricsEvolution.tsx` para copiar el lenguaje visual y cómo usan Recharts (tooltip, ejes, `ResponsiveContainer`, modo oscuro).

- [ ] **Step 2: Traducciones** — en `translations.ts`, agregar junto a las otras `coachDetail.*` de cada bloque:

es:
```ts
    'coachDetail.homegrownTitulo': "Surgidos del club",
    'coachDetail.homegrownSubtitulo': "Jugadores que debutaron en {club}, partido a partido desde {fecha}",
    'coachDetail.homegrownPromedio': "Por partido",
    'coachDetail.homegrownPartidosCon': "Partidos con canteranos",
    'coachDetail.homegrownMinutos': "Minutos de canteranos",
    'coachDetail.homegrownPctMinutos': "de los minutos del equipo",
    'coachDetail.homegrownDebutaron': "Debutaron con él",
    'coachDetail.homegrownTitulares': "Titulares",
    'coachDetail.homegrownIngresados': "Ingresaron",
    'coachDetail.homegrownMinutosPartido': "Minutos por partido",
    'coachDetail.homegrownSinDatos': "Sin alineación disponible",
    'coachDetail.homegrownJugador': "Jugador",
    'coachDetail.homegrownPJ': "PJ",
    'coachDetail.homegrownTit': "Tit.",
    'coachDetail.homegrownMin': "Min.",
    'coachDetail.homegrownDebut': "Debut",
    'coachDetail.homegrownJuveniles': "Juveniles",
    'coachDetail.homegrownTrayectoria': "Trayectoria",
    'coachDetail.homegrownCargando': "Cargando surgidos del club…",
    'coachDetail.homegrownError': "No se pudieron cargar los partidos. Reintentá en unos minutos.",
```
en:
```ts
    'coachDetail.homegrownTitulo': "Academy graduates",
    'coachDetail.homegrownSubtitulo': "Players who debuted at {club}, match by match since {fecha}",
    'coachDetail.homegrownPromedio': "Per match",
    'coachDetail.homegrownPartidosCon': "Matches with academy players",
    'coachDetail.homegrownMinutos': "Academy minutes",
    'coachDetail.homegrownPctMinutos': "of team minutes",
    'coachDetail.homegrownDebutaron': "Debuted under him",
    'coachDetail.homegrownTitulares': "Starters",
    'coachDetail.homegrownIngresados': "Subbed on",
    'coachDetail.homegrownMinutosPartido': "Minutes per match",
    'coachDetail.homegrownSinDatos': "Lineup not available",
    'coachDetail.homegrownJugador': "Player",
    'coachDetail.homegrownPJ': "Apps",
    'coachDetail.homegrownTit': "Starts",
    'coachDetail.homegrownMin': "Min.",
    'coachDetail.homegrownDebut': "Debut",
    'coachDetail.homegrownJuveniles': "Youth clubs",
    'coachDetail.homegrownTrayectoria': "Career",
    'coachDetail.homegrownCargando': "Loading academy graduates…",
    'coachDetail.homegrownError': "Couldn't load the matches. Try again in a few minutes.",
```
it:
```ts
    'coachDetail.homegrownTitulo': "Cresciuti nel club",
    'coachDetail.homegrownSubtitulo': "Giocatori che hanno esordito con il {club}, partita per partita dal {fecha}",
    'coachDetail.homegrownPromedio': "Per partita",
    'coachDetail.homegrownPartidosCon': "Partite con giovani del vivaio",
    'coachDetail.homegrownMinutos': "Minuti del vivaio",
    'coachDetail.homegrownPctMinutos': "dei minuti della squadra",
    'coachDetail.homegrownDebutaron': "Esordienti con lui",
    'coachDetail.homegrownTitulares': "Titolari",
    'coachDetail.homegrownIngresados': "Entrati",
    'coachDetail.homegrownMinutosPartido': "Minuti per partita",
    'coachDetail.homegrownSinDatos': "Formazione non disponibile",
    'coachDetail.homegrownJugador': "Giocatore",
    'coachDetail.homegrownPJ': "PG",
    'coachDetail.homegrownTit': "Tit.",
    'coachDetail.homegrownMin': "Min.",
    'coachDetail.homegrownDebut': "Esordio",
    'coachDetail.homegrownJuveniles': "Giovanili",
    'coachDetail.homegrownTrayectoria': "Carriera",
    'coachDetail.homegrownCargando': "Caricamento cresciuti nel club…",
    'coachDetail.homegrownError': "Impossibile caricare le partite. Riprova tra qualche minuto.",
```
(`{club}` y `{fecha}` se reemplazan con `.replace()` en el componente.)

- [ ] **Step 3: Implementar la tarjeta** — `CoachHomegrownUsageCard.tsx`, con esta estructura y comportamiento (el pulido visual fino sale de las skills del Step 1):

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AgencyCoach } from '@/constants/agencyCoaches'
import { loadHomegrownUsage, type HomegrownUsageResult } from '@/services/homegrownUsageService'
import type { HomegrownMatchUsage } from '@/features/coaches/homegrown/homegrownMatchUsage'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGE_LOCALES } from '@/constants/translations'

type LoadState = { status: 'loading' } | { status: 'hidden' } | { status: 'error' } | { status: 'ready'; data: HomegrownUsageResult }

export default function CoachHomegrownUsageCard({ coach }: { coach: AgencyCoach }) {
  const { t, language } = useLanguage()
  const locale = LANGUAGE_LOCALES[language]
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [openPlayer, setOpenPlayer] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    loadHomegrownUsage(coach)
      .then(data => { if (active) setState(data ? { status: 'ready', data } : { status: 'hidden' }) })
      .catch(() => { if (active) setState({ status: 'error' }) })
    return () => { active = false }
  }, [coach])

  const rows = useMemo(() => state.status !== 'ready' ? [] : state.data.usage.map((u: HomegrownMatchUsage) => ({
    ...u,
    label: new Date(u.date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }),
    startersCount: u.starters.length,
    subsCount: u.subsIn.length,
  })), [state, locale])

  if (state.status === 'hidden') return null
  if (state.status === 'loading') return <LoadingSpinner message={t('coachDetail.homegrownCargando')} />
  // … 'error': tarjeta con el mensaje coachDetail.homegrownError (no romper el resto de Resumen)
  // … 'ready':
  //   header: título + subtítulo (club = coach.club, fecha = tenureStart formateada con locale)
  //   KPIs (StatTile como en CoachSeasonStatsCard): avgPlayersPerMatch (1 decimal, locale),
  //     matchesWithAny/matchesWithData, totalMinutes (+ minutesShare en %), debutedWithCoach.length
  //     con los nombres como chips debajo (el dato más vendible: destacarlo).
  //   Gráfico 1: BarChart apilado (startersCount + subsCount) por `label`, stackId común,
  //     barras de partidos sin datos (hasData=false) en gris neutro con altura mínima y tooltip
  //     coachDetail.homegrownSinDatos. Eje Y en enteros (allowDecimals={false}).
  //   Gráfico 2: BarChart de totalMinutes con el mismo XAxis (misma altura de eje, syncId
  //     compartido con el gráfico 1 para que el hover se mueva junto).
  //   Tooltip custom (ambos gráficos): rival (+ L/V), resultado, competencia, y la lista de
  //     canteranos con minutos: "Richarte 90'", "Ávalos 61' (entró 29')", roja si sentOff.
  //   Tabla: summary.players con PJ / Tit. / Min.; cada fila clickeable (openPlayer) despliega
  //     la carrera del SquadCareer con el mismo apiPlayerId: debut (fecha, club, rival,
  //     competición, DT), clubes juveniles y pases (fecha · desde → hacia).
  //   Mobile: los gráficos con scroll horizontal interno si hay > 15 partidos
  //     (min-width por barra ~28px) — nunca scroll horizontal de la página.
}
```

Reglas duras: sin `console.log`; sin colores fuera de la paleta validada; dark mode en todo; `key` estables (`fixtureId`, `apiPlayerId`); números con `toLocaleString(locale)`.

- [ ] **Step 4: Montar en Resumen** — en `CoachSummaryTab.tsx`:

```tsx
import CoachHomegrownUsageCard from './CoachHomegrownUsageCard'
// …
      <CoachSeasonStatsCard coach={coach} />
      <CoachHomegrownUsageCard coach={coach} />
```

- [ ] **Step 5: Build + tests**

Run: `npx tsc --noEmit -p .` → sin errores. `npx vitest run` → todo PASS. `npm run build` → OK.

- [ ] **Step 6: Commit**

```bash
git add src/features/coaches/components/CoachHomegrownUsageCard.tsx src/features/coaches/components/CoachSummaryTab.tsx src/constants/translations.ts
git commit -m "feat(entrenadores): tarjeta de surgidos del club por partido en Resumen del DT"
```

---

### Task 7: Verificación contra datos reales + visual

**Files:** ninguno nuevo (arreglos que surjan van con su test en la task que corresponda).

- [ ] **Step 1: Cruce con Wyscout** — con un script descartable en el scratchpad (no se commitea) que llame a la API igual que el servicio, calcular PJ por jugador surgido en los 31 partidos y comparar con el listado Wyscout de la temporada: Aguiñagalde 28, Souto 19, Richarte 22, Ávalos 11, Calzón 9, Morrone 4, Trebotic 3, J. Díaz 2, F. Silva 2, B. Fernández 2, V. Díaz 1, Tirotta 0, Quiroga 0 (solo los que resulten surgidos). Diferencias de ±1 se explican (Wyscout puede contar partidos no oficiales / la API puede tener un cambio mal cargado) y se reportan al usuario; diferencias mayores se investigan antes de seguir.

- [ ] **Step 2: Correr la app** (`npm run dev`) y abrir `http://localhost:5173/entrenadores/domingo?tab=resumen` con la skill `claude-in-chrome`: revisar la tarjeta en claro, oscuro y a 390px de ancho; hover en el tooltip de un partido (Almagro 19/09: Calzón 90', Richarte, Ávalos 61' (entró 29')); abrir la carrera de Morrone (debut 25/04/2026 vs Patronato, DT Nicolás Domingo); consola sin errores ni warnings de React. Capturas para mostrarle al usuario.

- [ ] **Step 3: Otro DT** — abrir `/entrenadores/stillitano` (sin club): la tarjeta no aparece y Resumen no se rompe.

- [ ] **Step 4: Reporte al usuario** — números clave (promedio por partido, partidos con canteranos, % minutos, quiénes debutaron con Domingo), diferencias con Wyscout y capturas. Recién ahí se da por terminado (`superpowers:verification-before-completion`).
