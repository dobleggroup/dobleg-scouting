"""
Enrich Supabase players with Transfermarkt data (market value, contract end, agent, TM URL).

Strategy:
  1. Search TM website HTML (schnellsuche) -> extract TM ID, name, club, market value
  2. Fetch /player/{tmId} from TM internal API -> get contract end, agent, etc.
  3. Patch Supabase players table

Run:  python enrich.py
Env:  SUPABASE_URL, SUPABASE_SERVICE_KEY
Optional: BATCH_SIZE (default 50), DELAY_MS (default 1000), ONLY_MISSING (default 1)
"""

import os
import sys
import json
import time
import re
import urllib.request
import urllib.parse
from datetime import datetime
from unicodedata import normalize as unicode_normalize
from html import unescape as html_unescape

# ─── Config ──────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "50"))
DELAY_MS = int(os.environ.get("DELAY_MS", "1000"))
ONLY_MISSING = os.environ.get("ONLY_MISSING", "1") == "1"

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    sys.exit(1)

REST_URL = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

TM_API_BASE = "https://tmapi-alpha.transfermarkt.technology"
TM_HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.transfermarkt.es",
    "Referer": "https://www.transfermarkt.es/",
}

WEB_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}

# ─── Supabase helpers ────────────────────────────────────────

def sb_select(table, params=""):
    url = f"{REST_URL}/{table}?{params}"
    headers = {**SB_HEADERS, "Prefer": "return=representation"}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def sb_select_all(table, params="", order_col="id"):
    all_rows = []
    offset = 0
    page_size = 1000
    while True:
        sep = "&" if params else ""
        page_params = f"{params}{sep}order={order_col}&offset={offset}&limit={page_size}"
        rows = sb_select(table, page_params)
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return all_rows


def sb_patch(table, player_id, data):
    url = f"{REST_URL}/{table}?id=eq.{player_id}"
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=SB_HEADERS, method="PATCH")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        print(f"  PATCH error {e.code}: {e.read().decode()[:200]}")
        return 0


# ─── Transfermarkt helpers ───────────────────────────────────

def norm(s):
    s = unicode_normalize("NFD", s.lower().strip())
    return re.sub(r"[̀-ͯ]", "", s)


def fetch_url(url, headers, timeout=15):
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8")
    except Exception:
        return None


def search_tm_html(name):
    """Search Transfermarkt website HTML and extract player rows."""
    encoded = urllib.parse.quote(name)
    url = f"https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query={encoded}&Spieler_page=1"
    html = fetch_url(url, WEB_HEADERS)
    if not html:
        return []

    results = []
    rows = re.findall(
        r'<tr class="(?:odd|even)">\s*<td><table class="inline-table">(.*?)</table></td>'
        r'(.*?)</tr>',
        html, re.DOTALL
    )

    for inline_table, rest_cols in rows:
        tm_id_m = re.search(r'profil/spieler/(\d+)', inline_table)
        name_m = re.search(r'class="hauptlink"><a[^>]*title="([^"]*)"', inline_table)
        club_m = re.findall(r'<a[^>]*title="([^"]*)"[^>]*href="[^"]*startseite/verein', inline_table)
        mv_m = re.search(r'class="rechts hauptlink">(.*?)</td>', rest_cols, re.DOTALL)

        if not tm_id_m or not name_m:
            continue

        market_value_text = ""
        if mv_m:
            market_value_text = re.sub(r'<[^>]+>', '', mv_m.group(1)).strip()

        results.append({
            "tm_id": int(tm_id_m.group(1)),
            "name": html_unescape(name_m.group(1)),
            "club": html_unescape(club_m[0]) if club_m else "",
            "market_value_text": market_value_text,
        })

    return results


def parse_market_value_text(text):
    """Parse '€15.00m', '€500k', etc. into EUR integer."""
    if not text:
        return None
    text = text.replace("\xa0", " ").strip()
    m = re.match(r"€([\d,.]+)\s*(m|k|bn)?", text, re.IGNORECASE)
    if not m:
        return None
    num_str = m.group(1).replace(",", ".")
    try:
        num = float(num_str)
    except ValueError:
        return None
    suffix = (m.group(2) or "").lower()
    if suffix == "m":
        return int(num * 1_000_000)
    elif suffix == "k":
        return int(num * 1_000)
    elif suffix == "bn":
        return int(num * 1_000_000_000)
    return int(num)


def tm_profile(tm_id):
    """Fetch profile from TM internal API."""
    url = f"{TM_API_BASE}/player/{tm_id}"
    raw = fetch_url(url, TM_HEADERS)
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return data.get("data", data)
    except json.JSONDecodeError:
        return None


def extract_contract_end(profile):
    attrs = profile.get("attributes", {})
    val = attrs.get("contractUntil") or profile.get("contractEndDate") or profile.get("contractExpiryDate")
    if val and isinstance(val, str) and re.match(r"\d{4}-\d{2}-\d{2}", val):
        return val[:10]
    if isinstance(val, str):
        for fmt in ("%d/%m/%Y", "%b %d, %Y", "%d.%m.%Y"):
            try:
                return datetime.strptime(val.strip(), fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
    return None


def extract_agent(profile):
    attrs = profile.get("attributes", {})
    agency = attrs.get("consultantAgency")
    if isinstance(agency, dict):
        return agency.get("name")
    agent = profile.get("agent") or profile.get("playerAgent")
    if isinstance(agent, dict):
        return agent.get("name") or agent.get("agentName")
    if isinstance(agent, str) and agent.strip():
        return agent.strip()
    return None


def extract_market_value(profile):
    mv = profile.get("marketValueDetails", {})
    if isinstance(mv, dict):
        current = mv.get("current", {})
        if isinstance(current, dict) and current.get("value"):
            return int(current["value"])
    mv2 = profile.get("marketValue") or profile.get("currentMarketValue")
    if isinstance(mv2, (int, float)):
        return int(mv2)
    return None


def build_tm_url(profile, tm_id):
    rel = profile.get("relativeUrl") or profile.get("url") or profile.get("profileUrl")
    if rel and isinstance(rel, str):
        if rel.startswith("http"):
            return rel
        return f"https://www.transfermarkt.com{rel}"
    name_slug = profile.get("name", "player").lower().replace(" ", "-")
    return f"https://www.transfermarkt.com/{name_slug}/profil/spieler/{tm_id}"


def match_player(results, player_name, team_name=None):
    target = norm(player_name)
    target_parts = target.split()
    target_last = target_parts[-1] if target_parts else ""
    team_norm = norm(team_name) if team_name else ""

    best = None
    best_score = -1

    for r in results:
        r_norm = norm(r["name"])
        r_parts = r_norm.split()
        r_last = r_parts[-1] if r_parts else ""

        score = 0
        if r_norm == target:
            score += 10
        elif r_last == target_last:
            score += 5
            if r_parts and target_parts and r_parts[0][0:1] == target_parts[0][0:1]:
                score += 2

        if score == 0:
            continue

        if team_norm:
            r_team = norm(r["club"])
            if team_norm in r_team or r_team in team_norm:
                score += 3

        if score > best_score:
            best_score = score
            best = r

    return best


# ─── Main ────────────────────────────────────────────────────

def main():
    print(f"\n{'='*60}")
    print("Transfermarkt enrichment for Supabase players")
    print(f"{'='*60}\n")

    print("Loading players from Supabase...")
    params = "select=id,name,birth_date,current_team_id,market_value_eur,transfermarkt_id"
    if ONLY_MISSING:
        params += "&transfermarkt_id=is.null"

    players = sb_select_all("players", params)
    print(f"  {len(players)} players to process\n")

    if not players:
        print("No players to enrich.")
        return

    print("Loading teams...")
    teams = sb_select_all("teams", "select=id,name")
    team_map = {t["id"]: t["name"] for t in teams}
    print(f"  {len(team_map)} teams loaded\n")

    stats = {"found": 0, "not_found": 0, "error": 0, "updated": 0, "profile_ok": 0}

    for i, player in enumerate(players):
        pid = player["id"]
        name = player["name"]
        team_name = team_map.get(player.get("current_team_id"))

        print(f"[{i+1}/{len(players)}] {name}", end="")
        if team_name:
            print(f" ({team_name})", end="")
        print(" ... ", end="", flush=True)

        # Search TM website HTML
        results = search_tm_html(name)
        if not results:
            parts = name.split()
            if len(parts) > 1:
                results = search_tm_html(parts[-1])

        matched = match_player(results, name, team_name) if results else None

        if not matched:
            print("not found")
            stats["not_found"] += 1
            time.sleep(DELAY_MS / 1000)
            continue

        stats["found"] += 1
        tm_id = matched["tm_id"]
        mv_from_search = parse_market_value_text(matched["market_value_text"])

        # Fetch profile for contract + agent
        profile = tm_profile(tm_id)

        update = {"transfermarkt_id": tm_id}

        if profile:
            stats["profile_ok"] += 1
            mv_from_profile = extract_market_value(profile)
            update["market_value_eur"] = mv_from_profile or mv_from_search
            contract_end = extract_contract_end(profile)
            if contract_end:
                update["contract_end_date"] = contract_end
            agent = extract_agent(profile)
            if agent:
                update["agent"] = agent
            update["transfermarkt_url"] = build_tm_url(profile, tm_id)
        else:
            if mv_from_search:
                update["market_value_eur"] = mv_from_search
            update["transfermarkt_url"] = f"https://www.transfermarkt.com/x/profil/spieler/{tm_id}"

        status = sb_patch("players", pid, update)
        if 200 <= status < 300:
            stats["updated"] += 1
            parts_log = []
            mv = update.get("market_value_eur")
            if mv:
                parts_log.append(f"€{mv:,}")
            if update.get("contract_end_date"):
                parts_log.append(f"contract:{update['contract_end_date']}")
            if update.get("agent"):
                parts_log.append(f"agent:{update['agent'][:30]}")
            print(" | ".join(parts_log) if parts_log else f"TM#{tm_id}")
        else:
            stats["error"] += 1
            print(f"update failed (HTTP {status})")

        time.sleep(DELAY_MS / 1000)

    print(f"\n{'='*60}")
    print(f"Done! {stats['found']} found, {stats['not_found']} not found, {stats['error']} errors")
    print(f"Updated: {stats['updated']} players ({stats['profile_ok']} with full profile)")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
