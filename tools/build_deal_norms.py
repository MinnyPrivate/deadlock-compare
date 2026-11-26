#!/usr/bin/env python3
"""Builds the stat norm tables the card dealer grades against (data/deal-norms/).

Pure Python stdlib. Reads real finished matches from the deadlock-api SQL endpoint (no key needed, 2 requests a
minute per IP) and writes one file per hero plus index.json.

  python tools/build_deal_norms.py --days 14 --out data/deal-norms

Each stat gets cutoffs at a fixed percentile grid (PGRID), in three kinds of set:
  length stats (damage, souls, kills ...): hero x 8 match-length buckets, with and without the player's rank band,
      plus a per-minute set over all lengths (used when a length bucket is too thin, or to extrapolate).
  fixed stats (souls at 9:00) and rate stats (accuracy): hero, with and without the rank band. Length does not move them.
Cutoffs are the real observed values (quantile_disc), so integer stats such as kills and deaths keep their ties.
The card engine (deal/norms.js) applies the tail rule: Common to Epic need 150 games in the set, Legendary 1,000 and
Mythical 10,000, and it widens to a bigger set when a set is too small.
"""
import argparse, json, os, sys, time, urllib.parse, urllib.request, datetime

PGRID = [0.001, 0.0025, 0.005, 0.01, 0.02, 0.05, 0.10, 0.15, 0.25, 0.32, 0.40, 0.50, 0.60, 0.68, 0.75, 0.85, 0.90,
         0.95, 0.98, 0.99, 0.995, 0.9975, 0.999]
BUCKET_EDGES = [1200, 1500, 1800, 2100, 2400, 2700, 3000]       # seconds: <20, 20-25, ... 45-50, 50+ minutes
BUCKET_CENTERS = [922.74, 1350, 1650, 1950, 2250, 2550, 2850, 3292.63]  # same as the length-aware hero norms
BAND_EDGES = [50, 80, 100]  # badge < 50 Low (Initiate..Sentinel), < 80 Mid, < 100 High, else Top (Ascendant, Eternus)

# id: (sql expression, scale)  scale: length = grows with match length, fixed = taken at a fixed clock time, rate = a ratio
STATS = {
    "hero_damage": ('"stats.player_damage"[-1]', "length"),
    "kills": ("kills", "length"),
    "assists": ("assists", "length"),
    "deaths": ("deaths", "length"),
    "healing": ('COALESCE("stats.teammate_healing"[-1],0) + COALESCE("stats.teammate_barriering"[-1],0)', "length"),
    "mitigated": ('"stats.damage_mitigated"[-1]', "length"),
    "souls": ("net_worth", "length"),
    "souls9": ('"stats.net_worth"[list_position("stats.time_stamp_s", 540)]', "fixed"),
    "souls_lost": ('"stats.gold_death_loss"[-1]', "length"),
    "obj_damage": ('"stats.boss_damage"[-1]', "length"),
    "accuracy": ('CASE WHEN "stats.shots_hit"[-1] + "stats.shots_missed"[-1] >= 50 THEN "stats.shots_hit"[-1]::DOUBLE / ("stats.shots_hit"[-1] + "stats.shots_missed"[-1]) END', "rate"),
    "last_hits": ("last_hits", "length"),
    # not cards themselves: used by Jokers
    "output": ('"stats.player_damage"[-1] + COALESCE("stats.teammate_healing"[-1],0)', "length"),
    "takedowns": ("kills + assists", "length"),
    # held card (Slippery) waits for the damage-taken fix; the norms are ready for it
    "damage_taken": ('"stats.player_damage_taken"[-1]', "length"),
}

def sql(q, timeout=600):
    url = "https://api.deadlock-api.com/v1/sql?" + urllib.parse.urlencode({"query": q})
    for attempt in range(10):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "postmortem-deal-norms"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:300]
            if e.code == 429:
                try: wait = json.loads(body)["error"]["next_request_in"]
                except Exception: wait = 30
                print(f"  rate limited, waiting {wait + 2}s", file=sys.stderr)
                time.sleep(wait + 2)
                continue
            if e.code in (502, 504):
                raise TimeoutError(f"HTTP {e.code}")
            if e.code == 400 and "Out of Memory" in body:
                raise TimeoutError("server out of memory")
            raise RuntimeError(f"HTTP {e.code}: {body}")
    raise RuntimeError("rate limited too long")

def next_version(old, now):
    """norm_version is the build date plus a counter: 2026-11-26.1, then .2 for a rebuild on the same day. A new version means every card
    dealt from now on says so, and cards dealt before keep theirs. Rebuild (with --since the patch date) after a big economy patch."""
    day = f"{now:%Y-%m-%d}"
    if old and old.startswith(day + "."):
        return f"{day}.{int(old.split('.')[1]) + 1}"
    return f"{day}.1"

def sig(x, digits=4):
    if x is None: return None
    if isinstance(x, int) or float(x).is_integer(): return int(x)
    from math import log10, floor
    if x == 0: return 0
    d = digits - int(floor(log10(abs(x)))) - 1
    return round(x, max(d, 0)) if d > 0 else int(round(x))

def build_sql(stats, scale, days, since, hero_lo, hero_hi):
    """One query for several stats of the same scale and a slice of hero ids."""
    bk = ("CASE " + " ".join(f"WHEN duration_s < {e} THEN {i}" for i, e in enumerate(BUCKET_EDGES)) + f" ELSE {len(BUCKET_EDGES)} END")
    band = (f"CASE WHEN player_rank_initial_display_rank IS NULL OR player_rank_initial_display_rank = 0 THEN NULL "
            f"WHEN player_rank_initial_display_rank < {BAND_EDGES[0]} THEN 0 WHEN player_rank_initial_display_rank < {BAND_EDGES[1]} THEN 1 "
            f"WHEN player_rank_initial_display_rank < {BAND_EDGES[2]} THEN 2 ELSE 3 END")
    grid = "[" + ",".join(str(p) for p in PGRID) + "]"
    when = f"start_time > TIMESTAMPTZ '{since}'" if since else f"start_time > now() - INTERVAL {days} DAY"
    xs = ", ".join(f"({STATS[s][0]}) AS x_{s}" for s in stats)
    if scale == "length":
        sets = "GROUPING SETS ((hero_id, bk, band), (hero_id, bk), (hero_id, band), (hero_id))"
        cols = ", ".join(f"quantile_disc(x_{s}, {grid}) AS q_{s}, quantile_disc(x_{s} / (duration_s / 60.0), {grid}) AS pm_{s}, count(x_{s}) AS n_{s}" for s in stats)
    else:
        sets = "GROUPING SETS ((hero_id, band), (hero_id))"
        cols = ", ".join(f"quantile_disc(x_{s}, {grid}) AS q_{s}, count(x_{s}) AS n_{s}" for s in stats)
    return f"""
WITH base AS (
  SELECT hero_id, duration_s, {bk} AS bk, {band} AS band, {xs}
  FROM match_player
  WHERE {when} AND hero_id BETWEEN {hero_lo} AND {hero_hi} AND game_mode = 'Normal' AND match_mode IN ('Ranked', 'Unranked')
    AND duration_s >= 600 AND abandon_match_time_s = 0 AND match_outcome = 'TeamWin' AND NOT COALESCE(not_scored, FALSE)
)
SELECT hero_id, {"bk," if scale == "length" else ""} band, {cols}
FROM base
GROUP BY {sets}
"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--chunks", type=int, default=4)
    ap.add_argument("--since", default="", help="UTC date: start the window here (use the day of a big economy patch)")
    ap.add_argument("--out", default="data/deal-norms")
    ap.add_argument("--cache", default="", help="folder to keep raw query answers in, so a stopped run can resume")
    ap.add_argument("--stats", default="", help="comma list to rebuild only some stats (merges into existing files)")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    only = set(s for s in a.stats.split(",") if s) or set(STATS)
    heroes = {}
    for hp in os.listdir(a.out):
        if hp.startswith("hero_") and hp.endswith(".json") and a.stats:
            h = json.load(open(os.path.join(a.out, hp))); heroes[h["hero_id"]] = h
    t0 = time.time()
    hero_ids = sorted(r["hero_id"] for r in sql(f"SELECT DISTINCT hero_id FROM match_player WHERE start_time > now() - INTERVAL 2 DAY AND game_mode = 'Normal'"))
    per = max(1, round(len(hero_ids) / a.chunks))
    slices = [(hero_ids[i], hero_ids[min(i + per, len(hero_ids)) - 1]) for i in range(0, len(hero_ids), per)]
    slices[-1] = (slices[-1][0], 9999)
    groups = []
    for scale in ("length", "fixed", "rate"):
        names = [s for s in STATS if STATS[s][1] == scale and s in only]
        step = 3 if scale == "length" else 4
        groups += [(scale, names[i:i + step]) for i in range(0, len(names), step)]
    def run_slice(scale, names, ids):
        lo, hi = ids[0], (9999 if ids[-1] == hero_ids[-1] else ids[-1])
        print(f"[{','.join(names)}] heroes {lo}-{hi} ({scale})", flush=True)
        ck = os.path.join(a.cache, f"{scale}_{'-'.join(names)}_{lo}_{hi}_{a.days}.json") if a.cache else None
        if ck and os.path.exists(ck):
            print("   (cached)", flush=True)
            return [(scale, names, json.load(open(ck)))]
        try:
            rows = sql(build_sql(names, scale, a.days, a.since, lo, hi))
            if ck:
                os.makedirs(a.cache, exist_ok=True); json.dump(rows, open(ck, "w"))
        except TimeoutError:
            if len(ids) == 1:
                time.sleep(45)
                return run_slice(scale, names, ids)
            mid = len(ids) // 2
            print("   gateway timeout, splitting", flush=True)
            return run_slice(scale, names, ids[:mid]) + run_slice(scale, names, ids[mid:])
        print(f"   {len(rows)} groups, {time.time() - t0:.0f}s elapsed", flush=True)
        return [(scale, names, rows)]
    results = []
    for scale, names in groups:
        for lo, hi in slices:
            ids = [h for h in hero_ids if lo <= h <= hi]
            results += run_slice(scale, names, ids)
    for scale, names, rows in results:
        if True:
            for r in rows:
                hid = r["hero_id"]
                h = heroes.setdefault(hid, {"hero_id": hid, "n": 0, "stats": {}})
                bk, band = r.get("bk"), r.get("band")
                for stat in names:
                    if r.get(f"q_{stat}") is None: continue  # a hero with no usable rows for this stat (for example no accuracy rows)
                    st = h["stats"].setdefault(stat, {"scale": scale})
                    cell = {"n": r[f"n_{stat}"], "q": [sig(v) for v in r[f"q_{stat}"]]}
                    if scale == "length":
                        if bk is not None and band is not None:
                            st.setdefault("L0", [[None] * (len(BUCKET_EDGES) + 1) for _ in range(4)])[band][bk] = cell
                        elif bk is not None:
                            st.setdefault("L1", [None] * (len(BUCKET_EDGES) + 1))[bk] = cell
                        else:
                            pm = {"n": r[f"n_{stat}"], "q": [sig(v) for v in r[f"pm_{stat}"]]}
                            P = st.setdefault("P", {"all": None, "b": [None] * 4})
                            if band is not None: P["b"][band] = pm
                            else: P["all"] = pm
                    else:
                        C = st.setdefault("C", {"all": None, "b": [None] * 4})
                        if band is not None: C["b"][band] = cell
                        else: C["all"] = cell
    # hero sample size and thin cells: drop cells under 150 rows (the engine widens past them)
    for h in heroes.values():
        for stat, st in h["stats"].items():
            def keep(c): return c if c and c["n"] >= 150 else None
            if "L1" in st: st["L1"] = [keep(c) for c in st["L1"]]
            if "L0" in st: st["L0"] = [[keep(c) for c in row] for row in st["L0"]]
            if "P" in st: st["P"] = {"all": keep(st["P"]["all"]), "b": [keep(c) for c in st["P"]["b"]]}
            if "C" in st: st["C"] = {"all": keep(st["C"]["all"]), "b": [keep(c) for c in st["C"]["b"]]}
        ref = h["stats"].get("kills") or {}
        h["n"] = (ref.get("P") or ref.get("C") or {}).get("all", {"n": 0}) and ((ref.get("P") or ref.get("C") or {}).get("all") or {"n": 0})["n"]
    now = datetime.datetime.now(datetime.timezone.utc)
    start = datetime.datetime.fromisoformat(a.since.replace("Z", "+00:00")) if a.since else now - datetime.timedelta(days=a.days)
    index_path = os.path.join(a.out, "index.json")
    old = json.load(open(index_path)) if os.path.exists(index_path) else {}
    index = {
        "schema": 1,
        "norm_version": next_version(old.get("norm_version"), now),
        "built_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window": {"days": a.days, "since": a.since or None, "start_utc": start.strftime("%Y-%m-%dT%H:%M:%SZ")},
        "source": "deadlock-api SQL, match_player, Normal ranked and unranked, no leavers, 10+ minutes",
        "pgrid": PGRID, "bucket_edges_s": BUCKET_EDGES, "bucket_centers_s": BUCKET_CENTERS, "band_edges": BAND_EDGES,
        "band_names": ["Low", "Mid", "High", "Top"],
        "stats": {k: v[1] for k, v in STATS.items()},
        "heroes": sorted(heroes),
        "calibration": old.get("calibration", {}),
    }
    for hid, h in heroes.items():
        with open(os.path.join(a.out, f"hero_{hid}.json"), "w") as f: json.dump(h, f, separators=(",", ":"))
    with open(index_path, "w") as f: json.dump(index, f, separators=(",", ":"))
    print(f"wrote {len(heroes)} heroes, {time.time() - t0:.0f}s")

if __name__ == "__main__":
    main()
