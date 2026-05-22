"""
Sofascore sync: fetches match data from Sofascore API using curl_cffi
(Chrome TLS impersonation) and inserts into Supabase.

Run: python sync.py
Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
Optional: DISCOVER_PAGES (default 3), STATS_BATCH (default 5)
"""

import os
import sys
import json
import time
import bisect
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from curl_cffi import requests as cffi_requests

# ─── Config ──────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
DISCOVER_PAGES = int(os.environ.get("DISCOVER_PAGES", "3"))
STATS_BATCH = int(os.environ.get("STATS_BATCH", "5"))

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    sys.exit(1)

REST_URL = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def sb_select(table, params=""):
    url = f"{REST_URL}/{table}?{params}"
    req = urllib.request.Request(url, headers=SB_HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def sb_upsert(table, data, on_conflict="id", ignore_duplicates=False):
    url = f"{REST_URL}/{table}?on_conflict={on_conflict}"
    headers = {**SB_HEADERS, "Prefer": "resolution=merge-duplicates"}
    if ignore_duplicates:
        headers["Prefer"] = "resolution=ignore-duplicates"
    body = json.dumps(data if isinstance(data, list) else [data]).encode()
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except urllib.error.HTTPError:
        return 0


def sb_update(table, data, filter_str):
    url = f"{REST_URL}/{table}?{filter_str}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=SB_HEADERS, method="PATCH")
    with urllib.request.urlopen(req) as resp:
        return resp.status


def sb_insert(table, data):
    url = f"{REST_URL}/{table}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=SB_HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except urllib.error.HTTPError:
        return 0

TOURNAMENTS = {131: 703, 268: 278}
ID_OFFSET = 20_000_000
FETCH_DELAY = 2.0

last_fetch = 0.0


def sofa_id(raw_id):
    return raw_id + ID_OFFSET


def raw_id(sofa_id_val):
    return sofa_id_val - ID_OFFSET


# ─── Sofascore API ───────────────────────────────────────────
def sofa_fetch(path):
    global last_fetch
    elapsed = time.time() - last_fetch
    if elapsed < FETCH_DELAY:
        time.sleep(FETCH_DELAY - elapsed)

    url = f"https://api.sofascore.com/api/v1{path}"
    r = cffi_requests.get(url, impersonate="chrome")
    last_fetch = time.time()

    if r.status_code == 403:
        raise Exception("SOFASCORE_BLOCKED")
    if r.status_code == 404:
        raise Exception("SOFASCORE_NOT_FOUND")
    if r.status_code != 200:
        raise Exception(f"Sofascore HTTP {r.status_code}")

    return r.json()


# ─── Position mapping ────────────────────────────────────────
def parse_formation_lines(formation):
    return [int(x) for x in formation.split("-")]


def assign_line_roles(lines):
    if len(lines) == 3:
        return ["DEF", "MID", "ATK"]
    if len(lines) == 4:
        l1, l2, l3, l4 = lines
        if l1 >= 4 and l2 <= 2 and l3 >= 3 and l4 <= 1:
            return ["DEF", "MID_DEF", "MID_ATK", "ATK"]
        if l1 >= 4 and l2 == 1 and l3 >= 4 and l4 <= 1:
            return ["DEF", "MID_DEF", "MID_ATK", "ATK"]
        if l1 >= 3 and l2 >= 3 and l3 <= 2 and l4 >= 2:
            return ["DEF", "MID", "MID_ATK", "ATK"]
        return ["DEF", "MID_DEF", "MID_ATK", "ATK"]
    roles = ["DEF"]
    for _ in range(1, len(lines) - 1):
        roles.append("MID")
    roles.append("ATK")
    return roles


def map_grid_to_position(formation, grid):
    if not formation or not grid:
        return None
    row_str, col_str = grid.split(":")
    row, col = int(row_str), int(col_str)
    if row == 1:
        return "ARQ"

    lines = parse_formation_lines(formation)
    roles = assign_line_roles(lines)
    line_idx = row - 2
    if line_idx < 0 or line_idx >= len(roles):
        return None

    role = roles[line_idx]
    line_size = lines[line_idx]
    cols = list(range(1, line_size + 1))
    s = sorted(cols)
    n = len(s)
    def_line_size = lines[0]

    if role == "DEF":
        if n == 3:
            return "CB"
        if col == s[0]:
            return "LI"
        if col == s[-1]:
            return "LD"
        return "CB"
    elif role == "MID":
        if n == 5 and def_line_size == 3:
            if col == s[0]:
                return "LI"
            if col == s[-1]:
                return "LD"
            if col == s[n // 2]:
                return "VC"
            return "VI"
        if n <= 2:
            return "VC"
        if n == 3:
            return "VC" if col == s[1] else "VI"
        if n == 4:
            return "VI" if col in (s[0], s[-1]) else "VC"
        return "VC" if col == s[n // 2] else "VI"
    elif role == "MID_DEF":
        if n <= 2:
            return "VC"
        return "VC" if col == s[n // 2] else "VI"
    elif role == "MID_ATK":
        if n <= 2:
            return "VI"
        if col in (s[0], s[-1]):
            return "EXT"
        return "VI"
    elif role == "ATK":
        if n <= 2:
            return "DEL"
        if col in (s[0], s[-1]):
            return "EXT"
        return "DEL"
    return None


def build_synthetic_grid(outfield_index, formation):
    lines = parse_formation_lines(formation)
    cumulative = 0
    for line_idx, line_size in enumerate(lines):
        if outfield_index < cumulative + line_size:
            return f"{line_idx + 2}:{outfield_index - cumulative + 1}"
        cumulative += line_size
    return None


def fallback_position(pos):
    m = {"G": "ARQ", "D": "CB", "M": "VC", "F": "DEL"}
    return m.get((pos or "").upper())


# ─── Scoring ─────────────────────────────────────────────────
def per90(value, minutes):
    return (value / minutes) * 90 if minutes > 0 else 0


def pct(num, den):
    return (num / den) * 100 if den > 0 else 0


SCORING_WEIGHTS = {
    "ARQ": [
        ("saves_p90", 35, lambda r: per90(r["saves"], r["minutes"]), False),
        ("gc_p90", 25, lambda r: per90(r["goals_conceded"], r["minutes"]), True),
        ("rating", 20, lambda r: r.get("rating") or 0, False),
        ("pen_saved", 10, lambda r: r["penalty_saved"], False),
        ("clean", 10, lambda r: 100 if r["goals_conceded"] == 0 else 0, False),
    ],
    "CB": [
        ("duels_pct", 28, lambda r: pct(r["duels_won"], r["duels_total"]), False),
        ("tackles", 15, lambda r: per90(r["tackles"], r["minutes"]), False),
        ("int", 15, lambda r: per90(r["interceptions"], r["minutes"]), False),
        ("blocks", 12, lambda r: per90(r["blocks"], r["minutes"]), False),
        ("pass_acc", 12, lambda r: r["passes_accuracy"], False),
        ("rating", 10, lambda r: r.get("rating") or 0, False),
        ("passes", 8, lambda r: per90(r["passes_total"], r["minutes"]), False),
    ],
    "LD": [
        ("duels_pct", 19, lambda r: pct(r["duels_won"], r["duels_total"]), False),
        ("kp", 14, lambda r: per90(r["passes_key"], r["minutes"]), False),
        ("drib", 12, lambda r: per90(r["dribbles_success"], r["minutes"]), False),
        ("ast", 12, lambda r: per90(r["assists"], r["minutes"]), False),
        ("tackles", 10, lambda r: per90(r["tackles"], r["minutes"]), False),
        ("pass_acc", 10, lambda r: r["passes_accuracy"], False),
        ("int", 8, lambda r: per90(r["interceptions"], r["minutes"]), False),
        ("rating", 8, lambda r: r.get("rating") or 0, False),
        ("drib_pct", 7, lambda r: pct(r["dribbles_success"], r["dribbles_attempted"]), False),
    ],
    "LI": [
        ("duels_pct", 19, lambda r: pct(r["duels_won"], r["duels_total"]), False),
        ("kp", 14, lambda r: per90(r["passes_key"], r["minutes"]), False),
        ("drib", 12, lambda r: per90(r["dribbles_success"], r["minutes"]), False),
        ("ast", 12, lambda r: per90(r["assists"], r["minutes"]), False),
        ("tackles", 10, lambda r: per90(r["tackles"], r["minutes"]), False),
        ("pass_acc", 10, lambda r: r["passes_accuracy"], False),
        ("int", 8, lambda r: per90(r["interceptions"], r["minutes"]), False),
        ("rating", 8, lambda r: r.get("rating") or 0, False),
        ("drib_pct", 7, lambda r: pct(r["dribbles_success"], r["dribbles_attempted"]), False),
    ],
    "VC": [
        ("tackles", 19, lambda r: per90(r["tackles"], r["minutes"]), False),
        ("duels_pct", 16, lambda r: pct(r["duels_won"], r["duels_total"]), False),
        ("int", 14, lambda r: per90(r["interceptions"], r["minutes"]), False),
        ("pass_acc", 14, lambda r: r["passes_accuracy"], False),
        ("passes", 10, lambda r: per90(r["passes_total"], r["minutes"]), False),
        ("blocks", 8, lambda r: per90(r["blocks"], r["minutes"]), False),
        ("rating", 8, lambda r: r.get("rating") or 0, False),
        ("kp", 6, lambda r: per90(r["passes_key"], r["minutes"]), False),
        ("pass_acc2", 5, lambda r: r["passes_accuracy"], False),
    ],
    "VI": [
        ("duels_pct", 16, lambda r: pct(r["duels_won"], r["duels_total"]), False),
        ("kp", 14, lambda r: per90(r["passes_key"], r["minutes"]), False),
        ("drib", 12, lambda r: per90(r["dribbles_success"], r["minutes"]), False),
        ("ast", 10, lambda r: per90(r["assists"], r["minutes"]), False),
        ("goals", 10, lambda r: per90(r["goals"], r["minutes"]), False),
        ("pass_acc", 10, lambda r: r["passes_accuracy"], False),
        ("shots_on", 8, lambda r: per90(r["shots_on"], r["minutes"]), False),
        ("rating", 8, lambda r: r.get("rating") or 0, False),
        ("tackles", 6, lambda r: per90(r["tackles"], r["minutes"]), False),
        ("drib_pct", 6, lambda r: pct(r["dribbles_success"], r["dribbles_attempted"]), False),
    ],
    "EXT": [
        ("drib", 17, lambda r: per90(r["dribbles_success"], r["minutes"]), False),
        ("goals", 15, lambda r: per90(r["goals"], r["minutes"]), False),
        ("ast", 14, lambda r: per90(r["assists"], r["minutes"]), False),
        ("kp", 12, lambda r: per90(r["passes_key"], r["minutes"]), False),
        ("shots_on", 10, lambda r: per90(r["shots_on"], r["minutes"]), False),
        ("duels_pct", 10, lambda r: pct(r["duels_won"], r["duels_total"]), False),
        ("drib_pct", 8, lambda r: pct(r["dribbles_success"], r["dribbles_attempted"]), False),
        ("rating", 8, lambda r: r.get("rating") or 0, False),
        ("fouls_drawn", 6, lambda r: per90(r["fouls_drawn"], r["minutes"]), False),
    ],
    "DEL": [
        ("goals", 30, lambda r: per90(r["goals"], r["minutes"]), False),
        ("shots_on", 12, lambda r: per90(r["shots_on"], r["minutes"]), False),
        ("ast", 10, lambda r: per90(r["assists"], r["minutes"]), False),
        ("shots_pct", 8, lambda r: pct(r["shots_on"], r["shots_total"]), False),
        ("kp", 8, lambda r: per90(r["passes_key"], r["minutes"]), False),
        ("duels_pct", 8, lambda r: pct(r["duels_won"], r["duels_total"]), False),
        ("rating", 8, lambda r: r.get("rating") or 0, False),
        ("drib", 6, lambda r: per90(r["dribbles_success"], r["minutes"]), False),
        ("pen_scored", 5, lambda r: r["penalty_scored"], False),
        ("fouls_drawn", 5, lambda r: per90(r["fouls_drawn"], r["minutes"]), False),
    ],
}


def rank_normalize(value, sorted_asc):
    n = len(sorted_asc)
    if n <= 1:
        return 50
    pass  # bisect imported at top
    below = bisect.bisect_left(sorted_asc, value)
    below_or_eq = bisect.bisect_right(sorted_asc, value)
    equal = below_or_eq - below
    rank = below + (equal - 1) / 2
    return min(100, max(0, (rank / (n - 1)) * 100))


def calculate_match_score(row, peers):
    if row["minutes"] < 10:
        return None
    pos = row.get("detected_position")
    if not pos or pos not in SCORING_WEIGHTS:
        return None

    weights = SCORING_WEIGHTS[pos]
    all_rows = [row] + [p for p in peers if p.get("detected_position") == pos and p["minutes"] >= 10]

    if len(all_rows) <= 1:
        rating = row.get("rating") or 5.0
        return round(min(10, max(1, rating)) * 10) / 10

    score_raw = 0
    for _, weight, source_fn, inverse in weights:
        values = [source_fn(r) for r in all_rows]
        if inverse:
            values = [-v for v in values]
        sorted_vals = sorted(values)
        player_val = -source_fn(row) if inverse else source_fn(row)
        score_raw += rank_normalize(player_val, sorted_vals) * (weight / 100)

    return round((1 + (score_raw * 9) / 100) * 10) / 10


# ─── Stats mapping ───────────────────────────────────────────
def map_player_stats(p, fixture_id, team_id, position, formation, grid, cards):
    s = p.get("statistics", {})
    total_pass = s.get("totalPass", 0)
    accurate_pass = s.get("accuratePass", 0)
    pass_acc = round((accurate_pass / total_pass) * 100 * 100) / 100 if total_pass > 0 else 0

    return {
        "player_id": sofa_id(p["player"]["id"]),
        "fixture_id": fixture_id,
        "team_id": team_id,
        "detected_position": position,
        "formation": formation,
        "grid_position": grid,
        "minutes": s.get("minutesPlayed", 0),
        "rating": s.get("rating"),
        "is_substitute": p.get("substitute", False),
        "goals": s.get("goals", 0),
        "assists": s.get("goalAssist", 0),
        "shots_total": (s.get("onTargetScoringAttempt", 0) or 0) + (s.get("shotOffTarget", 0) or 0),
        "shots_on": s.get("onTargetScoringAttempt", 0) or 0,
        "passes_total": total_pass,
        "passes_key": s.get("keyPass", 0) or 0,
        "passes_accuracy": pass_acc,
        "tackles": s.get("totalTackle", 0) or 0,
        "blocks": s.get("blockedScoringAttempt", 0) or 0,
        "interceptions": s.get("interceptionWon", 0) or 0,
        "duels_total": (s.get("duelWon", 0) or 0) + (s.get("duelLost", 0) or 0),
        "duels_won": s.get("duelWon", 0) or 0,
        "dribbles_attempted": s.get("totalContest", 0) or 0,
        "dribbles_success": s.get("wonContest", 0) or 0,
        "fouls_drawn": s.get("wasFouled", 0) or 0,
        "fouls_committed": s.get("fouls", 0) or 0,
        "yellow_cards": (cards or {}).get("yellow", 0),
        "red_cards": (cards or {}).get("red", 0),
        "penalty_won": 0,
        "penalty_scored": 0,
        "penalty_missed": 0,
        "penalty_saved": 0,
        "saves": s.get("saves", 0) or 0,
        "goals_conceded": 0,
        "match_score": None,
    }


def upsert_player(p, team_id):
    sb_upsert("players", {
        "id": sofa_id(p["player"]["id"]),
        "name": p["player"]["name"],
        "photo": f"https://api.sofascore.com/api/v1/player/{p['player']['id']}/image",
        "current_team_id": team_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })


# ─── Main ────────────────────────────────────────────────────
def main():
    print(f"sync-sofascore starting (pages={DISCOVER_PAGES}, batch={STATS_BATCH})")

    results = {"fixtures_discovered": 0, "fixtures_synced": 0, "players_inserted": 0, "errors": []}

    leagues = sb_select("leagues", "select=id,season&source=eq.sofascore&has_player_stats=eq.true")
    print(f"Leagues found: {len(leagues)}")

    if not leagues:
        print("No Sofascore leagues configured")
        return

    # ── Phase 1: discover finished events ──
    for league in leagues:
        tid = TOURNAMENTS.get(league["id"])
        if not tid:
            continue

        try:
            seasons_data = sofa_fetch(f"/unique-tournament/{tid}/seasons")
            season = next((s for s in seasons_data["seasons"] if s["year"] == str(league["season"])), None)
            if not season:
                results["errors"].append(f"No {league['season']} season for tournament {tid}")
                continue

            for pg in range(DISCOVER_PAGES):
                try:
                    data = sofa_fetch(f"/unique-tournament/{tid}/season/{season['id']}/events/last/{pg}")
                    finished = [e for e in data["events"] if e["status"]["type"] == "finished"]

                    for event in finished:
                        fx_id = sofa_id(event["id"])
                        home_id = sofa_id(event["homeTeam"]["id"])
                        away_id = sofa_id(event["awayTeam"]["id"])

                        sb_upsert("teams", [
                            {"id": home_id, "name": event["homeTeam"]["name"],
                             "logo": f"https://api.sofascore.com/api/v1/team/{event['homeTeam']['id']}/image",
                             "league_id": league["id"]},
                            {"id": away_id, "name": event["awayTeam"]["name"],
                             "logo": f"https://api.sofascore.com/api/v1/team/{event['awayTeam']['id']}/image",
                             "league_id": league["id"]},
                        ])

                        sb_upsert("fixtures", {
                            "id": fx_id,
                            "league_id": league["id"],
                            "season": league["season"],
                            "date": datetime.fromtimestamp(event["startTimestamp"], tz=timezone.utc).isoformat(),
                            "home_team_id": home_id,
                            "away_team_id": away_id,
                            "score_home": event["homeScore"]["current"],
                            "score_away": event["awayScore"]["current"],
                            "stats_synced": False,
                        }, ignore_duplicates=True)
                        results["fixtures_discovered"] += 1

                    if not data.get("hasNextPage"):
                        break
                except Exception as e:
                    if str(e) == "SOFASCORE_NOT_FOUND":
                        break
                    raise

            print(f"  League {league['id']}: discovered events")
        except Exception as e:
            results["errors"].append(f"League {league['id']} discovery: {e}")
            if str(e) == "SOFASCORE_BLOCKED":
                break

    # ── Phase 2: sync stats for unsynced fixtures ──
    league_ids = [str(l["id"]) for l in leagues]
    lid_filter = urllib.parse.quote(f"({','.join(league_ids)})")
    unsynced = sb_select("fixtures",
        f"select=id,league_id,season,home_team_id,away_team_id,score_home,score_away"
        f"&stats_synced=eq.false&league_id=in.{lid_filter}"
        f"&order=date.desc&limit={STATS_BATCH}")

    if not unsynced:
        print("No unsynced fixtures")
    else:
        print(f"Processing {len(unsynced)} unsynced fixtures...")

        for fixture in unsynced:
            try:
                event_id = raw_id(fixture["id"])

                try:
                    lineups = sofa_fetch(f"/event/{event_id}/lineups")
                except Exception:
                    continue

                if not lineups.get("confirmed"):
                    continue

                def has_stats(players):
                    starter = next((p for p in players if not p.get("substitute") and p.get("statistics")), None)
                    return (starter or {}).get("statistics", {}).get("minutesPlayed", 0) > 0

                if not has_stats(lineups["home"]["players"]) and not has_stats(lineups["away"]["players"]):
                    continue

                card_map = {}
                try:
                    inc_data = sofa_fetch(f"/event/{event_id}/incidents")
                    for inc in inc_data.get("incidents", []):
                        if inc.get("incidentType") == "card" and inc.get("player", {}).get("id"):
                            pid = inc["player"]["id"]
                            if pid not in card_map:
                                card_map[pid] = {"yellow": 0, "red": 0}
                            if inc.get("incidentClass") == "yellow":
                                card_map[pid]["yellow"] += 1
                            elif inc.get("incidentClass") in ("red", "yellowRed"):
                                card_map[pid]["red"] += 1
                except Exception:
                    pass

                all_rows = []

                for side in ("home", "away"):
                    team_data = lineups[side]
                    formation = team_data.get("formation")
                    team_id = fixture["home_team_id"] if side == "home" else fixture["away_team_id"]

                    pos_order = {"G": 0, "D": 1, "M": 2, "F": 3}
                    starters = [p for p in team_data["players"] if not p.get("substitute")]
                    subs = [p for p in team_data["players"] if p.get("substitute")]

                    gk = [p for p in starters if p.get("position") == "G"]
                    outfield = sorted(
                        [p for p in starters if p.get("position") != "G"],
                        key=lambda p: pos_order.get(p.get("position", ""), 4),
                    )

                    for p in gk:
                        if not p.get("statistics") or (p["statistics"].get("minutesPlayed", 0) or 0) == 0:
                            continue
                        upsert_player(p, team_id)
                        row = map_player_stats(p, fixture["id"], team_id, "ARQ", formation, "1:1", card_map.get(p["player"]["id"]))
                        row["goals_conceded"] = fixture["score_away"] or 0 if side == "home" else fixture["score_home"] or 0
                        all_rows.append(row)

                    for i, p in enumerate(outfield):
                        if not p.get("statistics") or (p["statistics"].get("minutesPlayed", 0) or 0) == 0:
                            continue
                        position = None
                        grid = None
                        if formation:
                            grid = build_synthetic_grid(i, formation)
                            position = map_grid_to_position(formation, grid) if grid else None
                        if not position:
                            position = fallback_position(p.get("position"))
                        upsert_player(p, team_id)
                        all_rows.append(map_player_stats(p, fixture["id"], team_id, position, formation, grid, card_map.get(p["player"]["id"])))

                    for p in subs:
                        if not p.get("statistics") or (p["statistics"].get("minutesPlayed", 0) or 0) == 0:
                            continue
                        position = fallback_position(p.get("position"))
                        upsert_player(p, team_id)
                        all_rows.append(map_player_stats(p, fixture["id"], team_id, position, formation, None, card_map.get(p["player"]["id"])))

                for row in all_rows:
                    peers = [r for r in all_rows if r["player_id"] != row["player_id"]]
                    row["match_score"] = calculate_match_score(row, peers)

                if all_rows:
                    seen = {}
                    for r in all_rows:
                        seen[f"{r['player_id']}_{r['fixture_id']}"] = r
                    deduped = list(seen.values())
                    sb_upsert("player_match_stats", deduped, on_conflict="player_id,fixture_id")
                    results["players_inserted"] += len(deduped)

                sb_update("fixtures", {"stats_synced": True}, f"id=eq.{fixture['id']}")
                results["fixtures_synced"] += 1
                print(f"  Fixture {fixture['id']}: {len(all_rows)} players")

            except Exception as e:
                results["errors"].append(f"Fixture {fixture['id']}: {e}")
                if str(e) == "SOFASCORE_BLOCKED":
                    break

    sb_insert("sync_log", {
        "function_name": "sync-sofascore-py",
        "status": "error" if results["errors"] else "success",
        "error_message": "; ".join(results["errors"]) if results["errors"] else None,
        "fixtures_processed": results["fixtures_synced"],
    })

    print(json.dumps(results, indent=2))
    if results["errors"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
