"""Re-sync all unsynced fixtures with automatic retry on rate limits.
Also rebuilds the position cache if needed."""
import os, sys, json, time, subprocess, urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
REST_URL = f"{SUPABASE_URL}/rest/v1"
SB_HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}

BATCH = int(os.environ.get("BATCH", "10"))
PAUSE_BETWEEN = 15
PAUSE_ON_BLOCK = 600
RECALC_EVERY = 3

def count_unsynced():
    req = urllib.request.Request(
        f"{REST_URL}/fixtures?id=gte.20000000&stats_synced=eq.false&select=id&limit=1000",
        headers=SB_HEADERS,
    )
    with urllib.request.urlopen(req) as resp:
        return len(json.loads(resp.read()))

def run_prefetch():
    """Try to rebuild position cache if it's empty or small."""
    try:
        with open("position_cache.json") as f:
            cache = json.load(f)
        if len(cache) > 100:
            return True
    except (FileNotFoundError, json.JSONDecodeError):
        pass

    print("Position cache needs rebuilding, running prefetch...")
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    result = subprocess.run(
        [sys.executable, "prefetch_positions.py"],
        capture_output=True, text=True, env=env, timeout=3600,
    )
    print(result.stdout, end="")
    return "BLOCKED" not in result.stdout

def run_recalc():
    """Run recalc-scores Edge Function."""
    try:
        body = json.dumps({"season": 2026}).encode()
        req = urllib.request.Request(
            f"{SUPABASE_URL}/functions/v1/recalc-scores",
            data=body,
            headers={
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
        print(f"  recalc-scores: {data.get('scores_computed', 0)} scores")
    except Exception as e:
        print(f"  recalc-scores error: {e}")

# Try prefetch first
run_prefetch()

remaining = count_unsynced()
print(f"Starting resync: {remaining} fixtures remaining")
total_synced = 0
batches_since_recalc = 0

while remaining > 0:
    env = {
        **os.environ,
        "SKIP_DISCOVER": "1",
        "STATS_BATCH": str(BATCH),
        "FETCH_DELAY": "3.0",
        "PYTHONUNBUFFERED": "1",
    }
    result = subprocess.run(
        [sys.executable, "sync.py"],
        capture_output=True, text=True, env=env, timeout=1800,
    )

    output = result.stdout
    print(output, end="")

    blocked = "BLOCKED" in output or "BLOCKED" in result.stderr
    try:
        last_close = output.rfind("}")
        last_open = output.rfind("{", 0, last_close) if last_close >= 0 else -1
        report = json.loads(output[last_open:last_close + 1]) if last_open >= 0 else {}
        synced = report.get("fixtures_synced", 0)
    except (json.JSONDecodeError, IndexError, ValueError):
        synced = 0

    total_synced += synced
    remaining = count_unsynced()
    print(f"--- Progress: {total_synced} synced, {remaining} remaining ---")

    if synced > 0:
        batches_since_recalc += 1
        if batches_since_recalc >= RECALC_EVERY:
            run_recalc()
            batches_since_recalc = 0

    if blocked:
        print(f"Blocked, waiting {PAUSE_ON_BLOCK}s...")
        time.sleep(PAUSE_ON_BLOCK)
    elif synced == 0:
        print(f"No progress, waiting {PAUSE_ON_BLOCK}s...")
        time.sleep(PAUSE_ON_BLOCK)
    else:
        print(f"Pausing {PAUSE_BETWEEN}s between batches...")
        time.sleep(PAUSE_BETWEEN)

# Final recalc
run_recalc()
print(f"Done! Total synced: {total_synced}")
