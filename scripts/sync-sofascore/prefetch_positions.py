"""Pre-fetch player positions from Sofascore profiles and cache them.

Cache stores raw Sofascore positionsDetailed arrays (e.g. ["MC", "AM"]).
Mapping to our codes (VC, VI, etc.) is done at sync time in sync.py.
"""
import os, sys, json, time
from curl_cffi import requests as cffi_requests

CACHE_FILE = os.path.join(os.path.dirname(__file__), "position_cache.json")
ID_OFFSET = 20_000_000
FETCH_DELAY = 1.5

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    sys.exit(1)

import urllib.request
REST_URL = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

# Load existing cache
try:
    with open(CACHE_FILE, "r") as f:
        cache = {int(k): v for k, v in json.load(f).items()}
except (FileNotFoundError, json.JSONDecodeError):
    cache = {}

print(f"Existing cache: {len(cache)} players")

# Get all unique Sofascore player IDs from DB
all_ids = set()
page = 0
while True:
    url = f"{REST_URL}/players?id=gte.{ID_OFFSET}&select=id&limit=1000&offset={page * 1000}"
    req = urllib.request.Request(url, headers=SB_HEADERS)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    if not data:
        break
    for row in data:
        all_ids.add(row["id"] - ID_OFFSET)
    page += 1

print(f"Players in DB: {len(all_ids)}")

# Find players not yet in cache (or with old format string values)
to_fetch = [pid for pid in all_ids if pid not in cache or (
    cache.get(pid) is not None and not isinstance(cache.get(pid), list)
)]
print(f"To fetch: {len(to_fetch)}")

last_fetch = 0.0
fetched = 0
errors = 0

for raw_id in to_fetch:
    elapsed = time.time() - last_fetch
    if elapsed < FETCH_DELAY:
        time.sleep(FETCH_DELAY - elapsed)

    try:
        url = f"https://api.sofascore.com/api/v1/player/{raw_id}"
        r = cffi_requests.get(url, impersonate="chrome")
        last_fetch = time.time()

        if r.status_code == 403:
            print(f"BLOCKED at player {raw_id} after {fetched} fetches")
            break
        if r.status_code == 404:
            cache[raw_id] = None
            fetched += 1
            continue
        if r.status_code != 200:
            errors += 1
            continue

        data = r.json()
        positions = data.get("player", {}).get("positionsDetailed", [])
        cache[raw_id] = positions if positions else None
        fetched += 1

        if fetched % 50 == 0:
            print(f"  Fetched {fetched}/{len(to_fetch)}")
            with open(CACHE_FILE, "w") as f:
                json.dump({str(k): v for k, v in cache.items()}, f)

    except Exception as e:
        errors += 1
        if "BLOCKED" in str(e):
            print(f"BLOCKED at player {raw_id}")
            break

# Save final cache
with open(CACHE_FILE, "w") as f:
    json.dump({str(k): v for k, v in cache.items()}, f)

print(f"Done: fetched {fetched}, errors {errors}, cache total {len(cache)}")
