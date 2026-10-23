"""One-off backfill: nationality for players sourced from Sofascore
(20,000,000 <= id < 99,000,000) that don't have it yet. Fetched from the
player's OWN profile on Sofascore (`country.name`) — never inferred from
name/club (ver saneamiento de datos: `nationality` estaba vacío en el 100%
de los jugadores porque ningún pipeline llamaba al endpoint de perfil
completo). Also fills `birth_date` if it's missing, same source, same rule
(only fills nulls, never overwrites an existing value).

Uses curl_cffi (impersonate=chrome) because Sofascore blocks plain
fetch/requests by TLS fingerprint — same reason scripts/sync-sofascore/sync.py
runs local instead of as a Supabase edge function. See the note in
supabase/functions/_shared/sofascore.ts for the API-Football-only edge
function version of this same backfill.

Resumable: re-running just picks up whatever `nationality is null` remains
(interrupting and restarting doesn't lose progress or double-write).

Run: python backfill_nationality_sofascore.py [--limit N]
Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
"""
import os
import sys
import json
import time
import argparse
import urllib.request
import urllib.error
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sync-sofascore"))
import sync as sofa_sync  # noqa: E402  (fetch con fallback a Chrome)

# La consola de Windows no siempre soporta UTF-8 (nombres con tildes/etc.
# tiraban UnicodeEncodeError y mataban el batch a mitad de camino — el PATCH
# ya se había guardado bien, solo fallaba el print).
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
REST_URL = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}

ID_OFFSET = 20_000_000
FETCH_DELAY = float(os.environ.get("FETCH_DELAY", "2.0"))
last_fetch = 0.0


def sb_select(table, params):
    req = urllib.request.Request(f"{REST_URL}/{table}?{params}", headers=SB_HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def sb_select_all(table, params, page_size=1000):
    # PostgREST corta en 1000 filas por default sin paginar — sin esto el
    # batch procesaba solo el primer millar y quedaba "terminado" en falso.
    out = []
    offset = 0
    while True:
        page = sb_select(table, f"{params}&limit={page_size}&offset={offset}")
        out.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return out


def sb_patch(table, pid, data):
    req = urllib.request.Request(
        f"{REST_URL}/{table}?id=eq.{pid}", data=json.dumps(data).encode(),
        headers=SB_HEADERS, method="PATCH",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        print(f"    PATCH failed {e.code}: {e.read().decode(errors='replace')[:200]}")
        return 0


def sofa_player_profile(raw_id):
    # Desde 2026-09-24 Sofascore responde 403 a pedidos sin navegador: se usa el
    # mismo fetch que el sync (sync.py), que pasa a un Chrome real con el perfil
    # desbloqueado (desbloquear-sofascore.bat) cuando hace falta.
    try:
        data = sofa_sync.sofa_fetch(f"/player/{raw_id}")
    except Exception as e:
        if "SOFASCORE_BLOCKED" in str(e):
            print("Sofascore bloqueado: correr scripts/sync-sofascore/desbloquear-sofascore.bat y volver a correr esto")
            raise SystemExit(1)
        return None
    p = data.get("player", {})
    nationality = (p.get("country") or {}).get("name")
    ts = p.get("dateOfBirthTimestamp")
    birth_date = datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d") if ts else None
    return {"nationality": nationality, "birth_date": birth_date}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="Process at most N players (for testing)")
    args = parser.parse_args()

    players = sb_select_all(
        "players",
        f"select=id,name,birth_date&nationality=is.null&id=gte.{ID_OFFSET}&id=lt.99000000&order=id",
    )
    if args.limit:
        players = players[: args.limit]

    print(f"{len(players)} jugadores de Sofascore sin nacionalidad. Delay entre pedidos: {FETCH_DELAY}s")
    print(f"Tiempo estimado: ~{len(players) * FETCH_DELAY / 60:.0f} min\n")

    stats = {"filled": 0, "no_data": 0, "errors": 0}
    for i, p in enumerate(players, 1):
        raw_id = p["id"] - ID_OFFSET
        try:
            profile = sofa_player_profile(raw_id)
        except Exception as e:
            print(f"[{i}/{len(players)}] {p['name']} (id={p['id']}) ... error: {e}")
            stats["errors"] += 1
            continue

        if not profile or not profile["nationality"]:
            print(f"[{i}/{len(players)}] {p['name']} (id={p['id']}) ... sin dato en Sofascore")
            stats["no_data"] += 1
            continue

        patch = {"nationality": profile["nationality"]}
        if profile["birth_date"] and not p.get("birth_date"):
            patch["birth_date"] = profile["birth_date"]

        sb_patch("players", p["id"], patch)
        print(f"[{i}/{len(players)}] {p['name']} (id={p['id']}) ... {patch}")
        stats["filled"] += 1

    print(f"\n{json.dumps(stats, indent=2)}")


if __name__ == "__main__":
    main()
