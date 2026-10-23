"""Revisión de perfil de jugadores de Sofascore marcados con `profile_recheck`
(desvinculados de un Transfermarkt equivocado, ver migración 20261023_n): la
fecha de nacimiento y la nacionalidad se vuelven a leer de Sofascore, pisando
lo que haya (pudo venir de otra persona), y se baja la marca.

Usa el mismo fetch que el sync (sync.py), que pasa a un Chrome real cuando
Sofascore bloquea los pedidos directos.

Run: python recheck_profile_sofascore.py
Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
"""
import os
import sys
import json
import urllib.request
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sync-sofascore"))
import sync as sofa_sync  # noqa: E402

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
REST_URL = f"{SUPABASE_URL}/rest/v1"
HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}
ID_OFFSET = 20_000_000


def sb(method, path, body=None):
    req = urllib.request.Request(f"{REST_URL}/{path}", data=json.dumps(body).encode() if body is not None else None,
                                 headers=HEADERS, method=method)
    with urllib.request.urlopen(req) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def main():
    players = sb("GET", "players?select=id,name&profile_recheck=eq.true&id=gte.20000000&id=lt.99000000&limit=1000")
    print(f"{len(players)} jugadores de Sofascore para revisar")
    fixed = 0
    for i, p in enumerate(players, 1):
        patch = {"profile_recheck": False}
        try:
            data = sofa_sync.sofa_fetch(f"/player/{p['id'] - ID_OFFSET}")
            info = data.get("player", {})
            ts = info.get("dateOfBirthTimestamp")
            if ts:
                patch["birth_date"] = datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d")
            country = (info.get("country") or {}).get("name")
            if country:
                patch["nationality"] = country
        except Exception as e:
            if "SOFASCORE_BLOCKED" in str(e):
                print("Sofascore bloqueado: correr scripts/sync-sofascore/desbloquear-sofascore.bat y volver a correr esto")
                raise SystemExit(1)
            print(f"[{i}] {p['name']}: sin dato ({e})")
        sb("PATCH", f"players?id=eq.{p['id']}", patch)
        if "birth_date" in patch:
            fixed += 1
        print(f"[{i}/{len(players)}] {p['name']} -> {patch}", flush=True)
    print(f"listo: {fixed} con fecha corregida")


if __name__ == "__main__":
    main()
