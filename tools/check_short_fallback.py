"""Hold-out proof for Problem 1: old per-minute rate fallback vs new pooled-shape fallback."""
import argparse
import bisect
import json
import math
import sys
from pathlib import Path

from length_data import ROOT, split
import build_length_norms as bln


def mean_sd(values):
    n = len(values)
    m = sum(values) / n
    var = sum((x - m) ** 2 for x in values) / (n - 1) if n > 1 else 0.0
    return m, math.sqrt(var)


def cutoffs(values):
    ordered = sorted(values)
    n = len(ordered)
    return [ordered[(p * n + 99) // 100 - 1] for p in range(1, 100)]


def pooled_shape_cutoffs(hero_all_cuts, pool_all_cuts, pool_b_cuts, hero_rel):
    out = []
    for p in range(99):
        val = (
            hero_all_cuts[p] * (pool_b_cuts[p] / pool_all_cuts[p])
            if pool_all_cuts[p] > 0
            else pool_b_cuts[p] * hero_rel
        )
        if out and val < out[-1]:
            val = out[-1]
        out.append(val)
    return out


def main(data_dir):
    train, ranked, check, held = split(data_dir)
    heroes, durations, cols = bln.dataset(data_dir, train)
    bins = [bisect.bisect_right(bln.EDGES, d) for d in durations]

    b0_durs = [d for d, b in zip(durations, bins) if b == 0]
    b7_durs = [d for d, b in zip(durations, bins) if b == 7]
    centers = [
        round(sum(b0_durs) / len(b0_durs), 2),
        1350, 1650, 1950, 2250, 2550, 2850,
        round(sum(b7_durs) / len(b7_durs), 2),
    ]

    by_hero = {}
    for i, h in enumerate(heroes):
        by_hero.setdefault(h, []).append(i)
    hero_ids = sorted(by_hero)

    stats = [
        "kills", "assists", "deaths", "souls", "valve_souls",
        "objective_damage", "player_damage", "dmg_and_ally_heal",
    ]
    summary_stats = ["kills", "assists", "deaths", "souls", "objective_damage", "dmg_and_ally_heal"]

    report = {
        "trainMatches": len(train),
        "trainRows": len(heroes),
        "centers": centers,
        "pooledCheckB0": {},
        "holdout": {},
        "cutoffCalibration": {},
        "monotonicity": {},
    }

    # 1. Pooled "all heroes" real b0 vs old fallback
    for stat in stats:
        j = bln.INDEX[stat]
        col = cols[j]
        real_b0 = [col[i] for i in range(len(heroes)) if bins[i] == 0]
        rates = [col[i] / (durations[i] / 60.0) for i in range(len(heroes))]
        m_real, sd_real = mean_sd(real_b0)
        m_rate, sd_rate = mean_sd(rates)
        old_m = m_rate * (centers[0] / 60.0)
        old_sd = sd_rate * (centers[0] / 60.0)
        report["pooledCheckB0"][stat] = {
            "n": len(real_b0),
            "realMean": round(m_real, 2),
            "oldFallbackMean": round(old_m, 2),
            "oldMeanErrorPct": round((old_m - m_real) / m_real * 100, 1),
            "realSd": round(sd_real, 2),
            "oldFallbackSd": round(old_sd, 2),
            "oldSdErrorPct": round((old_sd - sd_real) / sd_real * 100, 1),
        }

    # 2. Hold-out MAPE (leave-one-hero-out for the pooled shape) across buckets 0 (<20) and 1 (20-25)
    for b_idx, b_label in [(0, "lt20"), (1, "20_25"), (7, "50plus")]:
        c_min = centers[b_idx] / 60.0
        counts_b = {h: sum(1 for i in by_hero[h] if bins[i] == b_idx) for h in hero_ids}
        if b_idx == 0:
            groups = {
                "n_ge_150": [h for h in hero_ids if counts_b[h] >= 150],
                "n_ge_100": [h for h in hero_ids if counts_b[h] >= 100],
                "all_44": hero_ids,
            }
        elif b_idx == 1:
            groups = {
                "real_ge_150": [h for h in hero_ids if counts_b[h] >= 150],
                "thin_lt_150": [h for h in hero_ids if counts_b[h] < 150],
                "all_44": hero_ids,
            }
        else:
            groups = {
                "real_ge_150": [h for h in hero_ids if counts_b[h] >= 150],
                "thin_lt_150": [h for h in hero_ids if counts_b[h] < 150],
            }

        report["holdout"][b_label] = {}
        for g_name, g_heroes in groups.items():
            g_out = {"heroes": len(g_heroes), "minRowsInBucket": min(counts_b[h] for h in g_heroes), "maxRowsInBucket": max(counts_b[h] for h in g_heroes), "stats": {}}
            for stat in stats:
                j = bln.INDEX[stat]
                col = cols[j]
                all_n = len(heroes)
                all_sum = sum(col)
                all_sum2 = sum(x * x for x in col)
                b_vals_all = [col[i] for i in range(len(heroes)) if bins[i] == b_idx]
                b_n = len(b_vals_all)
                b_sum = sum(b_vals_all)
                b_sum2 = sum(x * x for x in b_vals_all)

                old_m_err, new_m_err = [], []
                old_m_bias, new_m_bias = [], []
                old_sd_err, new_sd_err = [], []

                for h in g_heroes:
                    idxs = by_hero[h]
                    h_vals = [col[i] for i in idxs]
                    h_b = [col[i] for i in idxs if bins[i] == b_idx]
                    h_rates = [col[i] / (durations[i] / 60.0) for i in idxs]

                    real_m, real_sd = mean_sd(h_b)
                    h_all_m, h_all_sd = mean_sd(h_vals)
                    h_rate_m, h_rate_sd = mean_sd(h_rates)

                    # Leave-one-hero-out pooled curve so the tested hero never leaks into the pooled shape
                    pa_n = all_n - len(h_vals)
                    pa_m = (all_sum - sum(h_vals)) / pa_n
                    pa_sd = math.sqrt((all_sum2 - sum(x * x for x in h_vals) - pa_n * pa_m * pa_m) / (pa_n - 1))

                    pb_n = b_n - len(h_b)
                    pb_m = (b_sum - sum(h_b)) / pb_n
                    pb_sd = math.sqrt((b_sum2 - sum(x * x for x in h_b) - pb_n * pb_m * pb_m) / (pb_n - 1))

                    old_m = h_rate_m * c_min
                    old_sd = h_rate_sd * c_min
                    new_m = h_all_m * (pb_m / pa_m)
                    new_sd = h_all_sd * (pb_sd / pa_sd)

                    old_m_err.append(abs(old_m - real_m) / real_m * 100)
                    new_m_err.append(abs(new_m - real_m) / real_m * 100)
                    old_m_bias.append((old_m - real_m) / real_m * 100)
                    new_m_bias.append((new_m - real_m) / real_m * 100)
                    old_sd_err.append(abs(old_sd - real_sd) / real_sd * 100)
                    new_sd_err.append(abs(new_sd - real_sd) / real_sd * 100)

                avg = lambda arr: round(sum(arr) / len(arr), 1)
                g_out["stats"][stat] = {
                    "oldMeanMape": avg(old_m_err),
                    "newMeanMape": avg(new_m_err),
                    "oldMeanBias": avg(old_m_bias),
                    "newMeanBias": avg(new_m_bias),
                    "oldSdMape": avg(old_sd_err),
                    "newSdMape": avg(new_sd_err),
                }
            report["holdout"][b_label][g_name] = g_out

    # 3. Percentile cutoff hold-out accuracy and calibration (LOHO)
    eval_ps = [9, 24, 49, 74, 89, 94, 98]
    for b_idx, b_label, min_n in [(0, "lt20_ge100", 100), (1, "20_25_ge150", 150), (1, "20_25_thin", -1)]:
        c_min = centers[b_idx] / 60.0
        counts_b = {h: sum(1 for i in by_hero[h] if bins[i] == b_idx) for h in hero_ids}
        if min_n > 0:
            g_heroes = [h for h in hero_ids if counts_b[h] >= min_n]
        else:
            g_heroes = [h for h in hero_ids if counts_b[h] < 150]
        cal_out = {"heroes": len(g_heroes), "stats": {}}
        for stat in summary_stats:
            j = bln.INDEX[stat]
            col = cols[j]
            old_p50, new_p50 = [], []
            old_7pt, new_7pt = [], []
            old_t5, new_t5, old_b25, new_b25 = [], [], [], []
            for h in g_heroes:
                idxs = by_hero[h]
                h_set = set(idxs)
                h_vals = [col[i] for i in idxs]
                h_b = [col[i] for i in idxs if bins[i] == b_idx]
                h_rates = [col[i] / (durations[i] / 60.0) for i in idxs]

                # Leave-one-hero-out pooled cutoffs
                p_all_vals = [col[i] for i in range(len(heroes)) if i not in h_set]
                p_b_vals = [col[i] for i in range(len(heroes)) if bins[i] == b_idx and i not in h_set]
                p_all_m = sum(p_all_vals) / len(p_all_vals)
                p_all_c = cutoffs(p_all_vals)
                p_b_c = cutoffs(p_b_vals)

                h_m = sum(h_vals) / len(h_vals)
                h_all_c = cutoffs(h_vals)
                h_rate_c = cutoffs(h_rates)
                real_c = cutoffs(h_b)
                real_m = sum(h_b) / len(h_b)

                old_c = [v * c_min for v in h_rate_c]
                new_c = pooled_shape_cutoffs(h_all_c, p_all_c, p_b_c, h_m / p_all_m)

                old_p50.append(abs(old_c[49] - real_c[49]) / real_m * 100)
                new_p50.append(abs(new_c[49] - real_c[49]) / real_m * 100)
                old_7pt.append(sum(abs(old_c[p] - real_c[p]) for p in eval_ps) / len(eval_ps) / real_m * 100)
                new_7pt.append(sum(abs(new_c[p] - real_c[p]) for p in eval_ps) / len(eval_ps) / real_m * 100)

                n_b = len(h_b)
                old_t5.append(sum(1 for v in h_b if v > old_c[94]) / n_b * 100)
                new_t5.append(sum(1 for v in h_b if v > new_c[94]) / n_b * 100)
                old_b25.append(sum(1 for v in h_b if v < old_c[24]) / n_b * 100)
                new_b25.append(sum(1 for v in h_b if v < new_c[24]) / n_b * 100)
            avg = lambda arr: round(sum(arr) / len(arr), 1)
            cal_out["stats"][stat] = {
                "oldP50ErrPct": avg(old_p50),
                "newP50ErrPct": avg(new_p50),
                "old7PtErrPct": avg(old_7pt),
                "new7PtErrPct": avg(new_7pt),
                "oldTop5RatePct": avg(old_t5),
                "newTop5RatePct": avg(new_t5),
                "oldBot25RatePct": avg(old_b25),
                "newBot25RatePct": avg(new_b25),
            }
        report["cutoffCalibration"][b_label] = cal_out

    # 4. Monotonicity check on generated length_norms.json
    norms = json.loads((ROOT / "tools/data/length_norms.json").read_text(encoding="utf8"))
    for stat in stats:
        pool = norms["heroes"]["all"][stat]
        drops = []
        for h in hero_ids:
            row = norms["heroes"][str(h)][stat]
            means = [
                row["b"][k][0] if row["b"][k] else row["all"][0] * (pool["b"][k][0] / pool["all"][0])
                for k in range(8)
            ]
            for k in range(7):
                if means[k + 1] < means[k]:
                    drops.append([h, k, round(means[k], 2), round(means[k + 1], 2)])
        report["monotonicity"][stat] = {"drops": len(drops), "details": drops[:10]}

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", type=Path)
    main(parser.parse_args().data)
