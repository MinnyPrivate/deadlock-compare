"""Fit length-aware hero norms on standard matches outside all three evaluation sets (stdlib only)."""
import argparse
import bisect
import csv
import gzip
import json
import math
import zipfile
from pathlib import Path

from length_data import ROOT, matches, split

# Eight duration buckets: <20, 20-25, 25-30, 30-35, 35-40, 40-45, 45-50, 50+ minutes.
EDGES = [1200, 1500, 1800, 2100, 2400, 2700, 3000]
MIN_ROWS = 150
FINAL_STATS = [
    "kills", "assists", "deaths", "souls", "valve_souls", "objective_damage",
    "dmg_and_ally_heal", "player_damage", "ally_heal", "heal_prevented",
    "barriers", "damage_per_death", "mitigated", "trooper_souls", "neutral_souls",
    "snapshot_souls", "denies",
]
LATE_STATS = ["late_player_damage", "late_scoreboard_assists"]
FIXED_STATS = ["at900_player_damage", "at900_assists"]
STATS = FINAL_STATS + LATE_STATS + FIXED_STATS
SUMMARY_STATS = {"kills", "deaths", "assists", "souls", "objective_damage", "dmg_and_ally_heal"}
INDEX = {s: i for i, s in enumerate(STATS)}


def write_json(path, value):
    path.write_text(
        json.dumps(value, separators=(",", ":"), allow_nan=False) + "\n",
        encoding="utf8",
        newline="\n",
    )


def snapshot_rows(data):
    """Stream individual player snapshot objects from mvp_snaps.zip without loading whole files."""
    decoder = json.JSONDecoder()
    with zipfile.ZipFile(data / "mvp_snaps.zip") as archive:
        for name in sorted(archive.namelist()):
            with archive.open(name) as src:
                buf = ""
                while block := src.read(1024 * 1024):
                    buf += block.decode("ascii")
                    pos = 0
                    while pos < len(buf):
                        if buf[pos] in " \n\r\t[],":
                            pos += 1
                            continue
                        try:
                            obj, pos = decoder.raw_decode(buf, pos)
                        except json.JSONDecodeError:
                            break
                        yield obj
                    buf = buf[pos:]
                if buf.strip(" \n\r\t],"):
                    raise ValueError(f"Incomplete snapshot record in {name}")


def moments_only(values):
    n = len(values)
    mean = sum(values) / n
    var = sum((x - mean) ** 2 for x in values) / (n - 1)
    return [round(mean, 7), round(math.sqrt(var), 7)]


def distribution(values, with_cutoffs=False):
    moments = moments_only(values)
    if not with_cutoffs:
        return moments, None
    ordered = sorted(values)
    n = len(ordered)
    cuts = []
    for p in range(1, 100):
        v = ordered[(p * n + 99) // 100 - 1]
        cuts.append(int(v) if float(v).is_integer() else round(float(v), 7))
    return moments, cuts


def dataset(data, train):
    with gzip.open(ROOT / "tools/data/length_farm.csv.gz", "rt", encoding="utf8") as f:
        farm = {
            (int(r["match_id"]), int(r["slot"])): (float(r["trooper_souls"]), float(r["neutral_souls"]))
            for r in csv.DictReader(f)
        }
    n = len(train) * 12
    # Store one list per stat so per-hero filtering stays fast in pure Python.
    cols = [[None] * n for _ in STATS]
    heroes = [0] * n
    durations = [0] * n
    lookup = {}
    for mid, players in matches(data):
        if mid not in train:
            continue
        for p in players:
            key = (mid, p["player_slot"])
            i = len(lookup)
            lookup[key] = i
            heroes[i] = p["hero_id"]
            durations[i] = p["duration_s"]
            accolades = dict(zip(p["accolade_id"] or [], p["accolade_stat_value"] or []))
            lane_s, neut_s = farm.get(key, (None, None))
            vals = (
                float(p["kills"]),
                float(p["assists"]),
                float(p["deaths"]),
                float(p["net_worth"]),
                float(accolades.get(5) or p["net_worth"]),
                float(p["boss_damage"]),
                float(p["player_damage"] + p["teammate_healing"]),
                float(p["player_damage"]),
                float(p["teammate_healing"]),
                float(p["heal_prevented"]),
                float(p["player_barriering"]),
                float(p["player_damage_taken"]) / max(1, p["deaths"]),
                float(p["damage_mitigated"]),
                lane_s,
                neut_s,
            )
            for j, val in enumerate(vals):
                cols[j][i] = val
    missing_farm = sum(1 for v in cols[INDEX["trooper_souls"]] if v is None)
    if len(lookup) != n or len(farm) != n or missing_farm or min(durations) <= 0:
        raise ValueError(f"Training rows or farm totals mismatch: lookup={len(lookup)} n={n} farm={len(farm)} missing={missing_farm}")

    idx_snw = INDEX["snapshot_souls"]
    idx_den = INDEX["denies"]
    idx_at900_pd = INDEX["at900_player_damage"]
    idx_at900_a = INDEX["at900_assists"]
    idx_late_pd = INDEX["late_player_damage"]
    idx_late_a = INDEX["late_scoreboard_assists"]
    idx_ast = INDEX["assists"]

    for p in snapshot_rows(data):
        idx = lookup.get((p["match_id"], p["player_slot"]))
        if idx is None or not p["ts"]:
            continue
        if p["hero_id"] != heroes[idx] or p["duration_s"] != durations[idx]:
            raise ValueError("Snapshot belongs to a different player or match version")
        cols[idx_snw][idx] = float(p["nw"][-1])
        cols[idx_den][idx] = float(p["dn"][-1])
        if 900 in p["ts"]:
            k9 = p["ts"].index(900)
            pd9 = float(p["pd"][k9])
            a9 = float(p["a"][k9])
            cols[idx_at900_pd][idx] = pd9
            cols[idx_at900_a][idx] = a9
            if p["ts"][-1] >= 1200:
                cols[idx_late_pd][idx] = float(p["pd"][-1]) - pd9
                cols[idx_late_a][idx] = max(0.0, cols[idx_ast][idx] - a9)
    return heroes, durations, cols


def build(data):
    train, ranked, check, held = split(data)
    heroes, durations, cols = dataset(data, train)
    bins = [bisect.bisect_right(EDGES, d) for d in durations]

    b0_durs = [d for d, b in zip(durations, bins) if b == 0]
    b7_durs = [d for d, b in zip(durations, bins) if b == 7]
    centers = [
        round(sum(b0_durs) / len(b0_durs), 2),
        1350, 1650, 1950, 2250, 2550, 2850,
        round(sum(b7_durs) / len(b7_durs), 2),
    ]

    meta = {
        "version": "2026-11-24.2",
        "source": f"{len(train):,} standard matches from November 13 and 14, 2026",
        "edges": EDGES,
        "centers": centers,
        "minRows": MIN_ROWS,
        "matches": len(train),
        "stats": STATS,
    }
    table = {**meta, "heroes": {}}
    quantiles = {"version": meta["version"], "source": meta["source"], "heroes": {}}

    by_hero = {}
    for i, h in enumerate(heroes):
        by_hero.setdefault(h, []).append(i)
    hero_groups = [(str(h), by_hero[h]) for h in sorted(by_hero)] + [("all", list(range(len(heroes))))]

    for hkey, indices in hero_groups:
        moments = {}
        cuts = {}
        for j, stat in enumerate(STATS):
            col = cols[j]
            if stat in FIXED_STATS:
                vals = [col[i] for i in indices if col[i] is not None]
                if len(vals) < 2:
                    raise ValueError(f"Not enough rows for fixed stat {hkey} {stat}")
                moments[stat] = {"n": len(vals), "fixed": moments_only(vals)}
                continue

            is_late = stat in LATE_STATS
            want_cuts = stat in SUMMARY_STATS
            buckets = [[] for _ in range(8)]
            all_vals = []
            for i in indices:
                v = col[i]
                if v is None:
                    continue
                d = durations[i]
                mins = (d - 900) / 60.0 if is_late else d / 60.0
                if mins <= 0:
                    continue
                buckets[bins[i]].append(v)
                all_vals.append(v)
            if len(all_vals) < 2:
                raise ValueError(f"No usable all-length rows for {hkey} {stat}")

            all_m, all_c = distribution(all_vals, with_cutoffs=want_cuts)
            counts = [len(b) for b in buckets]
            cells, cut_cells = [], []
            for b_vals in buckets:
                if len(b_vals) < MIN_ROWS:
                    cells.append(None)
                    if want_cuts:
                        cut_cells.append(None)
                else:
                    cm, cc = distribution(b_vals, with_cutoffs=want_cuts)
                    cells.append(cm)
                    if want_cuts:
                        cut_cells.append(cc)
            moments[stat] = {"n": counts, "all": all_m, "b": cells}
            if want_cuts:
                cuts[stat] = {"all": all_c, "b": cut_cells}
        table["heroes"][hkey] = moments
        quantiles["heroes"][hkey] = cuts

    write_json(ROOT / "tools/data/length_norms.json", table)
    write_json(ROOT / "data/hero_percentiles.json", quantiles)
    print(
        f"Fit {len(train)} matches, {len(durations)} player rows, {len(STATS)} stats. "
        f"Excluded {len(ranked)} ranked archive IDs and {len(held)} pipeline holdout IDs "
        f"({len(ranked & held)} overlap). Fixed check: {len(check)}."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", type=Path, help="directory with mvp_rows.zip, mvp_snaps.zip and mvp_matches.zip")
    build(parser.parse_args().data)
