"""
Enriquece la carrera del plantel de un club (spec 2026-09-23 surgidos del club).
Run:  python enrich_squad_careers.py                 (dry-run: solo CSV de revisión)
      python enrich_squad_careers.py --apply         (upsert en club_squad_careers)
Env:  FOOTBALL_API_KEY; con --apply además SUPABASE_URL + SUPABASE_SERVICE_KEY
Opt:  TEAM_API_ID (454), SEASONS ("2026"), SINCE ("2026-01-01"), CLUB_ID ("dobleg"),
      INPUT (input/temperley_squad.txt), DELAY_MS (1200)
"""
import csv, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
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
    # Sin Accept la API interna de TM responde 406 (curl lo manda por defecto, urllib no).
    req = urllib.request.Request(url, data=body, headers={"User-Agent": UA, "Accept": "*/*", **(headers or {})}, method=method)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            # 4xx (salvo 429) no se arregla reintentando: lo decide quien llama.
            if (400 <= e.code < 500 and e.code != 429) or attempt == 2:
                raise
            print(f"  reintento {url[:80]}: {e}")
            time.sleep(3 * (attempt + 1))
        except Exception as e:  # red: reintento con espera creciente
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
    """({id canónico: nombre}, {id canónico: [ids alias]}) de todos los que estuvieron en
    alguna alineación del ciclo. Ver lib.group_api_aliases."""
    players, appearances = {}, []
    for season in SEASONS:
        for fx in api("/fixtures", {"team": TEAM_API_ID, "season": season}):
            date = fx["fixture"]["date"][:10]
            if fx["fixture"]["status"]["short"] not in FINISHED or date < SINCE:
                continue
            for lineup in api("/fixtures/lineups", {"fixture": fx["fixture"]["id"], "team": TEAM_API_ID}):
                ids = set()
                for p in lineup["startXI"] + lineup["substitutes"]:
                    players[p["player"]["id"]] = p["player"]["name"]
                    ids.add(p["player"]["id"])
                appearances.append((date, ids))
    return lib.group_api_aliases(players, appearances)


def club_names(ids):
    names = {}
    ids = [i for i in sorted(set(ids)) if i not in lib.NON_CLUB_IDS]
    for i in range(0, len(ids), 20):
        query = "&".join(f"ids[]={c}" for c in ids[i:i + 20])
        for club in tm_json(f"/clubs?{query}"):
            names[str(club["id"])] = club["name"]
    return names


def enrich(entry, api_players, api_aliases):
    profile = tm_json(f"/player/{entry['tm_id']}")
    profile_html = lib.parse_profile_html(tm_html(entry["url"]))
    debuts = lib.parse_debuts(tm_html(entry["url"].replace("/profil/", "/debuets/")))
    try:
        raw_history = tm_json(f"/transfer/history/player/{entry['tm_id']}")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        raw_history = {}  # TM responde 404 cuando el jugador no tiene ningún pase cargado
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
        "api_player_alias_ids": api_aliases.get(api_id, []) if api_id else [],
        "full_name": profile["name"], "short_name": profile.get("shortName"),
        "position": profile_html["position"], "birth_date": (profile.get("lifeDates") or {}).get("dateOfBirth"),
        "nationality": profile_html["nationality"], "height_cm": round(height * 100) if height else None,
        "foot": profile_html["foot"], "photo_url": profile.get("portraitUrl"),
        "agent": profile_html["agent"], "agent_tm_id": profile_html["agent_tm_id"],
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
    api_players, api_aliases = api_squad_players()
    print(f"{len(api_players)} jugadores distintos en alineaciones API desde {SINCE}")
    rows, report = [], []
    for e in entries:
        try:
            row, review, confidence = enrich(e, api_players, api_aliases)
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
            "api_player_id": " + ".join(str(i) for i in [row["api_player_id"], *row["api_player_alias_ids"]] if i),
            "vinculo_api": confidence, "revisar": flag, "error": "",
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
