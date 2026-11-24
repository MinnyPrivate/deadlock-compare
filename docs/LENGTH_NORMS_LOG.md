# Length-Aware Hero Norms Log

Date: November 24, 2026
Branch: `codex/length-norms` (worktree `C:\Users\zacha\pm-length-norms`, base `origin/main` `88daa51`)
Norm table version: `2026-11-24.1` (18,052 standard matches from November 13 and 14, 2026)

## Summary of what changed

Postmortem now compares every player against what that hero normally does in games of the same match length instead of one flat all-length hero average:

- **Shared duration curve (`PM_SCORE.expected(heroId, stat, durationS, distributions)`)**: Fits 8 duration buckets (`<20`, `20-25`, `25-30`, `30-35`, `35-40`, `40-45`, `45-50`, `50+` minutes; edges `[1200, 1500, 1800, 2100, 2400, 2700, 3000]` seconds; centers `[922.74, 1350, 1650, 1950, 2250, 2550, 2850, 3292.63]` seconds) on 18,052 standard matches (216,624 player rows across all 44 heroes) completely outside all three evaluation sets (0 overlap with Set A, Set B, or Set C).
- **Smooth interpolation**: Between bucket centers, means, SDs, and p1..p99 percentile cutoffs interpolate linearly with no jump at bucket boundaries. Below the shortest bucket center (`922.74 s`) or above the longest (`3292.63 s`), values scale smoothly along the endpoint bucket's per-minute rate.
- **Thin-bucket fallback (`minRows = 150`)**: Whenever a hero/stat/bucket has fewer than 150 rows, `expected()` falls back to that hero's all-length per-minute rate multiplied by match duration (and compares percentiles against the hero's all-length per-minute rate distribution). Why 150: at 150 rows, 1% tail cutoffs have at least 1.5 observations in the tail, standard error of the mean stays under 8.2% of SD, all interior buckets (`25-30` through `45-50` min) have zero fallbacks across all 44 heroes, and only the sparse `<20 min` (306 training matches total), `20-25 min` (597 matches), and 2 rare heroes in `50+ min` trigger the fallback.
- **Pure Python stdlib generator**: `tools/length_data.py`, `tools/build_length_norms.py`, and `tools/build_heronorms_js.py` run with plain Python stdlib (zero third-party dependencies, reproducing NumPy's `default_rng(0)` 25% holdout bit-for-bit). `data/hero_percentiles.json` stores only the 6 Summary/Highlights stats (`1.01 MB`), and `heronorms.js` (`334 KB`) bundles `HERO_TABLE`, `LENGTH_NORMS`, and `SNAP_NORMS`.
- **Fixed-timestamp stats kept unconditioned**: During audit we confirmed that `lanes.js` (`early[tv]` at 3:00..15:00) and `whenHtml` (`early` + duration-interpolated `late_knots_min` in `snap_norms.json`) are already time-indexed and duration-aware. Conditioning fixed-time snapshots on final match duration introduces survivorship bias: in our training data, all-hero `at540_snapshot_souls` falls from `6,191.6` (20-25 min stomps) to `5,898.7` (50+ min games) and `at900_player_damage` falls from `7,556.1` to `7,010.4`. Therefore `lanes.js` and `snap_norms.json` phase scoring stay unconditioned, and Impact's two before-15:00 stats (`at900_player_damage`, `at900_assists`) use fixed 15:00 hero norms while its after-15:00 stats (`late_player_damage`, `late_scoreboard_assists`) scale with match length past 15:00.
- **Applied everywhere**: MVP tab (Valve score size/points/averages/labels, Impact and Raw standard 6v6 hero comparisons, Street Brawl kept lobby-based), Summary percentiles (`summary/percentile.js`), Highlights cards and share card labels (`summary/summary.js`, `summary/share.js`), and Profile match verdicts, survival tags, and footer (`profile.html`, `profile.js`).

## 1. Valve-tab MVP agreement: Before vs After (Sets A, B, and C)

### Baseline reproduction (original `origin/main` `88daa51`)

Before modifying any scoring code, the original `scoring.js` and `tools/data/hero_table.json` from commit `88daa51` were extracted to an isolated scratch folder and evaluated against Set A, Set B, and Set C:

- **Set A** (500 ranked matches in `mvp_matches.zip`): **492 / 500 (98.40%)** same MVP as Valve, **468 / 500 (93.60%)** all three awards in order. This matches the brief's baseline (`98.4%` and `93.6%`) with **0.00 percentage points difference**.
- **Set B** (100 fixed ranked matches): Searched the repo, `Vault`, and `Compare overlay\Data` first; no pre-existing 100-match list existed. Selected 100 ranked matches from Set A with fixed seed `20261124` and saved their IDs to `tools/data/mvp_check_100.txt`. Baseline: **99 / 100** same MVP, **97 / 100** all three awards in order.
- **Set C** (5,865 held-out matches from `mvp_rows.zip` matching `big.py`'s `default_rng(0).random(23968) < 0.25`, 100% excluded from fitting): **4,577 / 4,596 (99.59%)** unranked MVP, **1,253 / 1,269 (98.74%)** ranked MVP, **5,830 / 5,865 (99.40%)** combined MVP.

### Rule 5 finding and Before vs After comparison

Valve's own MVP award formula uses flat all-length hero averages, not match-length-normalized averages. Ranking players by length-aware z-scores reduces Valve MVP agreement across every evaluation set (by 4.6 to 9.2 percentage points on MVP and 15.6 to 33.0 percentage points on all three awards in order), even when testing swap-aware `gradedHero` (`449/500 = 89.80%` MVP on Set A) or mean-only adjustment (`469/500 = 93.80%` MVP on Set A).

Following Rule 5 of the brief, the **Valve tab keeps the flat `hero_table.json` model for ranking and award picks (`picks`)**, while **displayed score size, per-stat points, hero average columns, labels, Highlights cards, Summary percentiles, Impact/Raw scores, and Profile verdicts all use the length-aware hero norms**. The Valve tab footer was updated to state this plainly (`492 of 500 ranked matches; 99 of 100 on the fixed check`).

| Evaluation set | Matches | Before (`88daa51`) MVP | Before All 3 in order | Pure length-aware ranking MVP | Pure length-aware All 3 | After (deployed Rule 5) MVP | After All 3 in order |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Set A (500 ranked, `mvp_matches.zip`) | 500 | 492/500 (98.40%) | 468/500 (93.60%) | 446/500 (89.20%) | 303/500 (60.60%) | **492/500 (98.40%)** | **468/500 (93.60%)** |
| Set B (100 fixed, `mvp_check_100.txt`) | 100 | 99/100 | 97/100 | 88/100 | 62/100 | **99/100** | **97/100** |
| Set C Unranked (held-out) | 4,596 | 4,577/4,596 (99.59%) | 4,492/4,596 (97.74%) | 4,289/4,596 (93.32%) | 3,450/4,596 (75.07%) | **4,577/4,596 (99.59%)** | **4,492/4,596 (97.74%)** |
| Set C Ranked (held-out) | 1,269 | 1,253/1,269 (98.74%) | 1,201/1,269 (94.64%) | 1,119/1,269 (88.18%) | 808/1,269 (63.67%) | **1,253/1,269 (98.74%)** | **1,201/1,269 (94.64%)** |
| Set C Combined (held-out) | 5,865 | 5,830/5,865 (99.40%) | 5,693/5,865 (97.07%) | 5,408/5,865 (92.21%) | 4,258/5,865 (72.60%) | **5,830/5,865 (99.40%)** | **5,693/5,865 (97.07%)** |

Additional pure length-aware diagnostic variants run on the same held-out sets (none tuned on eval sets):

- Length-aware with swap-aware `gradedHero` + tuned z-weights: Set A 449/500 (89.80%) MVP / 330/500 (66.00%) All 3; Set B 86/100 / 66/100; Set C Combined 5,441/5,865 (92.77%) / 4,345/5,865 (74.08%).
- Length-aware mean only (flat `ppu` + `gradedHero`): Set A 469/500 (93.80%) MVP / 390/500 (78.00%) All 3; Set B 91/100 / 81/100; Set C Combined 5,633/5,865 (96.04%) / 4,919/5,865 (83.87%).

Commands run in this session:
- Original baseline (`88daa51`): extracted `scoring.js` and `tools/data/hero_table.json` from git and evaluated via `eval_baseline.py` + `eval_baseline.js`.
- After change: `python -B tools/check_length_mvp.py "C:\Users\zacha\OneDrive\Desktop\Deadlock Mods\Compare overlay\Data\mvp_fit"`.

## 2. Real player examples: Old vs New (11 players across short, typical, and long games)

Captured directly from live Chromium renders of `88daa51` (old) vs working tree (new) via `node tools/check_length_screens.cjs tools/.length-work/examples`. Includes 3 short games (< 22 min, all Set A), 3 typical games (28 to 36 min, all Set A), and 5 long games (> 48 min, including 3 Paige long-game damage cases: `137029881` from Set A held-out, `136966554` 54:16 Top 1% -> Top 25%, and `136934088` 65:23 extreme 171.7k damage+healing).

| Group | Match (Slot) | Hero | Length | Tracked stat (actual) | Old expected & label | New expected & label | Old pct (better%) | New pct (better%) | Old Valve score -> New | Old Highlights card | New Highlights card |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| short | `137019499` (slot 8) | Mirage | 18:29 | `objective_damage` (13.4k) | Avg Mirage: 4,996 (med 99.8) | Avg Mirage in 18 min games: 2,493 (med 1,853.5) [rate fallback] | p99 (better than 99%) | p99 (better than 99%) | -1.71 -> +2.01 | Vs other Mirage games: **Top 1%** (objective damage per minute · 723) | Mirage in 18 min games: **Top 1%** (objective damage · 13.4k) |
| short | `136975905` (slot 12) | Ivy | 20:46 | `deaths` (0) | Avg Calico: 7 (med 5) | Avg Ivy in 21 min games: 4 (med 3.6) [rate fallback] | p99 (better than 98%) | p99 (better than 97%) | +1.80 -> +7.54 | Vs other Ivy games: **Top 5%** (deaths · 0) | Ivy in 21 min games: **Top 1%** (kills · 11) |
| short | `136996376` (slot 3) | Drifter | 21:13 | `kills` (14) | Avg Drifter: 9 (med 8) | Avg Drifter in 21 min games: 6 (med 4.5) | p87 (better than 85%) | p91 (better than 90%) | +1.94 -> +6.75 | Vs other Drifter games: **Top 25%** (kills · 14) | Drifter in 21 min games: **Top 5%** (assists · 16) |
| typical | `136942808` (slot 6) | Bebop | 28:07 | `deaths` (3) | Avg Bebop: 8 (med 8) | Avg Bebop in 28 min games: 7 (med 7) | p91 (better than 88%) | p89 (better than 87%) | +1.12 -> +2.85 | Vs other Bebop games: **Top 25%** (deaths · 3) | Bebop in 28 min games: **Top 25%** (deaths · 3) |
| typical | `136941488` (slot 8) | Wraith | 29:40 | `objective_damage` (36.4k) | Avg Wraith: 12.2k (med 12,651) | Avg Wraith in 30 min games: 10.9k (med 8,204.0) | p97 (better than 96%) | p99 (better than 98%) | +2.30 -> +4.00 | Vs other Wraith games: **Top 5%** (objective damage · 36.4k) | Wraith in 30 min games: **Top 5%** (objective damage · 36.4k) |
| typical | `136942360` (slot 10) | McGinnis | 35:52 | `kills` (9) | Avg McGinnis: 5 (med 3) | Avg McGinnis in 36 min games: 5 (med 4) | p93 (better than 90%) | p89 (better than 88%) | +3.84 -> +5.20 | Vs other McGinnis games: **Top 10%** (kills · 9) | McGinnis in 36 min games: **Top 10%** (assists · 23) |
| long | `137021431` (slot 11) | Lady Geist | 49:31 | `dmg_and_ally_heal` (96.1k) | Avg Lady Geist: 50.1k (med 42,934) | Avg Lady Geist in 50 min games: 77.6k (med 75,610.1) | p98 (better than 97%) | p80 (better than 79%) | +3.80 -> +1.76 | Vs other Lady Geist games: **Top 5%** (damage + healing · 96.1k) | Lady Geist in 50 min games: **Top 25%** (souls · 73.3k) |
| long | `137022588` (slot 4) | Violet | 51:08 | `dmg_and_ally_heal` (79k) | Avg Calico: 33.5k (med 31,991) | Avg Violet in 51 min games: 50.3k (med 47,970.2) | p99 (better than 99%) | p94 (better than 93%) | +4.48 -> +2.60 | Vs other Violet games: **Top 1%** (damage + healing · 79k) | Violet in 51 min games: **Top 5%** (deaths · 3) |
| long | `137029881` (slot 9) | Paige | 51:19 | `dmg_and_ally_heal` (67.3k) | Avg Paige: 34.3k (med 29,537) | Avg Paige in 51 min games: 57.1k (med 55,305.8) | p97 (better than 96%) | p72 (better than 71%) | +2.68 -> +0.05 | Vs other Paige games: **Top 5%** (damage + healing · 67.3k) | Paige in 51 min games: **Bottom 25%** (souls · 56.3k) |
| long | `136966554` (slot 2) | Paige | 54:16 | `dmg_and_ally_heal` (90k) | Avg Paige: 34.3k (med 29,537) | Avg Paige in 54 min games: 62.8k (med 60,230.8) | p99 (better than 99%) | p89 (better than 88%) | +4.25 -> +0.80 | Vs other Paige games: **Top 1%** (damage + healing · 90k) | Paige in 54 min games: **Top 25%** (damage + healing · 90k) |
| long | `136934088` (slot 11) | Paige | 65:23 | `dmg_and_ally_heal` (171.7k) | Avg Paige: 34.3k (med 29,537) | Avg Paige in 65 min games: 76.2k (med 72,976.2) | p99 (better than 99%) | p99 (better than 99%) | +10.46 -> +3.62 | Vs other Paige games: **Top 1%** (damage + healing · 171.7k) | Paige in 65 min games: **Top 1%** (damage + healing · 171.7k) |

Note on pre-game swaps: in `136975905` (Ivy) and `137022588` (Violet), Valve graded those players against Calico after a pre-game hero swap, so the old Valve tab showed `Avg Calico` while Summary used the played hero. New displayed stats always compare against the played hero in games of that length while the Valve award estimate still accounts for pre-game swaps.

### Long-game Paige damage cases in detail

- **Match `136966554` (54:16, slot 2, Paige, 84,897 player damage + 5,110 ally healing = 90,007 total)**:
  - **Old**: `Avg Paige: 34.3k` (median 29,537). Highlights card read `Vs other Paige games` / `Top 1%` / `damage + healing · 90k` (better than 99% of 1,740 ranked Paige games), plus inflated `Top 5%` souls (65,630) and `Top 25%` kills (6). Valve score `+4.25`.
  - **New**: `Avg Paige in 54 min games: 62.8k` (median 60,230.8). Highlights card reads `Paige in 54 min games` / `Top 25%` / `damage + healing · 90k` (better than about 88% at this length, based on 544 and 374 Paige games), and all 5 other stats are now `Typical`. Valve score `+0.80`.
- **Match `137029881` (51:19, Set A held-out, slot 9, Paige, 50,429 player damage + 16,845 ally healing = 67,274 total)**:
  - **Old**: `Avg Paige: 34.3k`. Highlights card read `Vs other Paige games` / `Top 5%` / `damage + healing · 67.3k` (better than 96%), plus `Top 25%` souls (56,336). Valve score `+2.68`.
  - **New**: `Avg Paige in 51 min games: 57.1k` (median 55,305.8). 67.3k damage+healing drops to **Typical** (better than about 71% at this length), while 56,336 souls vs a 65.3k 51-minute average is honestly flagged as `Bottom 25%` (better than 17%). Valve score `+0.05`.
- **Match `136934088` (65:23, slot 11, Paige, 161,631 player damage + 10,112 ally healing = 171,743 total)**:
  - **Old**: `Avg Paige: 34.3k`, `Top 1%` damage+healing, `Top 1%` souls (93,824), Valve score `+10.46`.
  - **New**: `Avg Paige in 65 min games: 76.2k` (extrapolated smoothly above the 54.9 min top center). 171.7k damage+healing legitimately remains `Top 1%` (better than 99% even in 65-minute games), while 93.8k souls drops from `Top 1%` to `Top 25%` (better than 79% vs 85.1k expected) and Valve score drops from `+10.46` to `+3.62`.

### Short-game de-penalization highlights

- **Match `137019499` (18:29, Set A, Mirage slot 8)**: Under old flat averages, Mirage's 3/3/9, 19.8k souls, 13.4k objective damage game scored `-1.71` Valve points because totals were compared against 36-minute averages (and used an abrupt `< 20 min` per-minute switch on Summary). Under length-aware norms (thin-bucket rate fallback from 1,982 Mirage games), `Avg Mirage in 18 min games` expects 3 kills, 6 assists, 14.3k dmg+heal, 2,493 objective damage, and 20.8k souls, lifting Mirage to `+2.01` length-adjusted points.
- **Match `136975905` (20:46, Set A, Ivy slot 12)**: 11/0/13 and 26,384 souls was previously tagged `Bottom 10%` souls (better than 7% vs 40.2k median) and `+1.80` Valve points; now 11 kills in 21 min games is `Top 1%` (better than 99% vs 2.9 expected), souls is typical, and Valve score is `+7.54`.

## 3. Per-hero rows per duration bucket and per-minute fallback cells

Training sample: **18,052 standard matches** (216,624 player rows across 44 heroes; 14,050 Unranked + 4,002 Ranked; 0 overlap with Set A, Set B, or Set C).
Duration buckets: `<20` (<1200 s, center 922.74 s), `20-25` (1350 s), `25-30` (1650 s), `30-35` (1950 s), `35-40` (2250 s), `40-45` (2550 s), `45-50` (2850 s), `50+` (>=3000 s, center 3292.63 s).
Fallback threshold: **`minRows = 150`** rows per hero/stat/bucket.

### 3.1 Full-match stats (15 stats: `kills`, `assists`, `deaths`, `souls`, `valve_souls`, `objective_damage`, `dmg_and_ally_heal`, `player_damage`, `ally_heal`, `heal_prevented`, `barriers`, `damage_per_death`, `mitigated`, `trooper_souls`, `neutral_souls`)

Total hero-buckets using per-minute fallback: **64 / 352** hero-buckets (**960** hero-stat-bucket cells across the 15 stats).
Notice that buckets `25-30`, `30-35`, `35-40`, `40-45`, and `45-50` have **0 fallbacks across all 44 heroes**.

| Hero (ID) | <20 | 20-25 | 25-30 | 30-35 | 35-40 | 40-45 | 45-50 | 50+ | Total | Fallback buckets (<150) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Abrams (6) | 116 | 209 | 704 | 1573 | 1745 | 1104 | 573 | 386 | 6,410 | <20 |
| Apollo (77) | 97 | 181 | 575 | 1249 | 1385 | 895 | 475 | 328 | 5,185 | <20 |
| Baba (88) | 58 | 97 | 299 | 629 | 704 | 432 | 205 | 144 | 2,568 | <20, 20-25, 50+ |
| Bebop (15) | 130 | 236 | 792 | 1756 | 2018 | 1280 | 629 | 453 | 7,294 | <20 |
| Billy (72) | 119 | 250 | 779 | 1716 | 1934 | 1201 | 613 | 457 | 7,069 | <20 |
| Calico (16) | 38 | 127 | 322 | 740 | 784 | 485 | 282 | 193 | 2,971 | <20, 20-25 |
| Celeste (81) | 97 | 180 | 550 | 1161 | 1314 | 852 | 484 | 376 | 5,014 | <20 |
| Deadman Danny (78) | 66 | 133 | 440 | 1010 | 1166 | 728 | 385 | 289 | 4,217 | <20, 20-25 |
| Drifter (64) | 154 | 255 | 812 | 1863 | 2087 | 1290 | 682 | 490 | 7,633 | None |
| Dynamo (11) | 62 | 143 | 456 | 1134 | 1240 | 820 | 409 | 308 | 4,572 | <20, 20-25 |
| Graves (76) | 113 | 242 | 809 | 1708 | 1951 | 1259 | 635 | 522 | 7,239 | <20 |
| Grey Talon (17) | 50 | 110 | 374 | 849 | 1029 | 683 | 367 | 270 | 3,732 | <20, 20-25 |
| Haze (13) | 127 | 257 | 900 | 1951 | 2140 | 1295 | 673 | 455 | 7,798 | <20 |
| Holliday (14) | 70 | 147 | 491 | 1069 | 1175 | 809 | 405 | 284 | 4,450 | <20, 20-25 |
| Infernus (1) | 112 | 196 | 673 | 1453 | 1693 | 1111 | 595 | 403 | 6,236 | <20 |
| Ivy (20) | 66 | 167 | 538 | 1223 | 1234 | 801 | 378 | 271 | 4,678 | <20 |
| Kelvin (12) | 73 | 123 | 408 | 827 | 914 | 588 | 252 | 177 | 3,362 | <20, 20-25 |
| Lady Geist (4) | 129 | 243 | 837 | 1892 | 2153 | 1406 | 746 | 561 | 7,967 | <20 |
| Lash (31) | 99 | 182 | 663 | 1458 | 1712 | 1070 | 541 | 438 | 6,163 | <20 |
| McGinnis (8) | 47 | 105 | 309 | 650 | 701 | 444 | 252 | 202 | 2,710 | <20, 20-25 |
| Mina (63) | 114 | 223 | 712 | 1635 | 1890 | 1300 | 647 | 503 | 7,024 | <20 |
| Mirage (52) | 24 | 53 | 208 | 442 | 548 | 362 | 181 | 164 | 1,982 | <20, 20-25 |
| Mo & Krill (18) | 56 | 85 | 292 | 690 | 758 | 469 | 240 | 163 | 2,753 | <20, 20-25 |
| Nurse Harrow (87) | 78 | 164 | 495 | 1051 | 1192 | 768 | 381 | 278 | 4,407 | <20 |
| Paige (67) | 98 | 163 | 567 | 1353 | 1485 | 964 | 544 | 374 | 5,548 | <20 |
| Paradox (10) | 110 | 215 | 689 | 1522 | 1808 | 1159 | 625 | 436 | 6,564 | <20 |
| Pocket (50) | 54 | 122 | 368 | 907 | 1062 | 672 | 351 | 281 | 3,817 | <20, 20-25 |
| Rat King (84) | 126 | 231 | 685 | 1577 | 1761 | 1211 | 644 | 509 | 6,744 | <20 |
| Rem (79) | 91 | 185 | 658 | 1253 | 1396 | 893 | 468 | 365 | 5,309 | <20 |
| Seven (2) | 102 | 181 | 640 | 1429 | 1645 | 1069 | 554 | 423 | 6,043 | <20 |
| Shiv (19) | 111 | 167 | 615 | 1371 | 1555 | 1070 | 522 | 414 | 5,825 | <20 |
| Silver (80) | 85 | 188 | 597 | 1300 | 1513 | 929 | 470 | 361 | 5,443 | <20 |
| Sinclair (60) | 24 | 72 | 221 | 444 | 567 | 349 | 196 | 137 | 2,010 | <20, 20-25, 50+ |
| Solomon (85) | 26 | 60 | 198 | 458 | 568 | 397 | 212 | 170 | 2,089 | <20, 20-25 |
| The Doorman (69) | 65 | 105 | 295 | 725 | 922 | 612 | 355 | 297 | 3,376 | <20, 20-25 |
| Venator (65) | 141 | 251 | 764 | 1756 | 1908 | 1265 | 640 | 491 | 7,216 | <20 |
| Victor (66) | 69 | 179 | 566 | 1260 | 1441 | 946 | 537 | 335 | 5,333 | <20 |
| Vindicta (3) | 91 | 161 | 569 | 1276 | 1379 | 882 | 452 | 304 | 5,114 | <20 |
| Violet (86) | 61 | 117 | 353 | 783 | 949 | 603 | 306 | 232 | 3,404 | <20, 20-25 |
| Viscous (35) | 50 | 78 | 272 | 684 | 753 | 532 | 270 | 186 | 2,825 | <20, 20-25 |
| Vyper (58) | 46 | 108 | 326 | 686 | 715 | 426 | 220 | 174 | 2,701 | <20, 20-25 |
| Warden (25) | 45 | 113 | 343 | 798 | 831 | 523 | 254 | 206 | 3,113 | <20, 20-25 |
| Wraith (7) | 116 | 214 | 788 | 1598 | 1736 | 1081 | 535 | 373 | 6,441 | <20 |
| Yamato (27) | 66 | 146 | 496 | 1039 | 1147 | 729 | 375 | 277 | 4,275 | <20, 20-25 |

### 3.2 Snapshot-final stats (2 stats: `snapshot_souls`, `denies`) and late-game stats (2 stats: `late_player_damage`, `late_scoreboard_assists`)

Snapshot coverage in `mvp_snaps.zip` is 22,881 of 23,968 matches (~95.5%), and `late_*` stats require `duration >= 1200 s` plus a 15:00 snapshot (so bucket `<20` always has 0 rows for `late_*` and is excluded from `late_*` interpolation). Both groups have identical fallback patterns beyond `<20`, listed completely below.

- **`snapshot_souls`, `denies`**: **104** hero-buckets (**208** cells) under 150 rows.
- **`late_player_damage`, `late_scoreboard_assists`**: bucket `<20` is undefined (`n = 0`, never queried because Impact only splits at `duration >= 1200 s`); across valid buckets `20-25` through `50+`, **60** hero-buckets (**120** cells) fall below 150 rows and use the hero's all-length late per-minute rate.

| Hero (ID) | Snapshot counts (<20 / 20-25 / 25-30 / 30-35 / 35-40 / 40-45 / 45-50 / 50+) | Snapshot fallback buckets (<150) | Late valid fallback buckets (`20-25`..`50+`, <150) |
| --- | --- | --- | --- |
| Abrams (6) | 78 / 129 / 436 / 1023 / 1123 / 681 / 358 / 240 | <20, 20-25 | 20-25 |
| Apollo (77) | 61 / 114 / 366 / 745 / 876 / 557 / 288 / 199 | <20, 20-25 | 20-25 |
| Baba (88) | 41 / 51 / 174 / 415 / 432 / 281 / 142 / 82 | <20, 20-25, 45-50, 50+ | 20-25, 45-50, 50+ |
| Bebop (15) | 88 / 153 / 497 / 1102 / 1258 / 780 / 369 / 284 | <20 | None |
| Billy (72) | 86 / 144 / 493 / 1097 / 1241 / 753 / 407 / 281 | <20, 20-25 | 20-25 |
| Calico (16) | 27 / 79 / 200 / 459 / 492 / 300 / 173 / 126 | <20, 20-25, 50+ | 20-25, 50+ |
| Celeste (81) | 70 / 105 / 342 / 715 / 817 / 522 / 291 / 237 | <20, 20-25 | 20-25 |
| Deadman Danny (78) | 50 / 81 / 269 / 647 / 743 / 448 / 245 / 183 | <20, 20-25 | 20-25 |
| Drifter (64) | 109 / 153 / 503 / 1206 / 1304 / 809 / 427 / 310 | <20 | None |
| Dynamo (11) | 47 / 88 / 291 / 737 / 760 / 506 / 241 / 184 | <20, 20-25 | 20-25 |
| Graves (76) | 79 / 143 / 526 / 1088 / 1248 / 763 / 405 / 319 | <20, 20-25 | 20-25 |
| Grey Talon (17) | 36 / 72 / 231 / 499 / 615 / 419 / 223 / 150 | <20, 20-25 | 20-25 |
| Haze (13) | 86 / 152 / 565 / 1269 / 1338 / 799 / 404 / 270 | <20 | None |
| Holliday (14) | 41 / 88 / 317 / 712 / 733 / 501 / 259 / 188 | <20, 20-25 | 20-25 |
| Infernus (1) | 77 / 127 / 433 / 917 / 1064 / 676 / 353 / 261 | <20, 20-25 | 20-25 |
| Ivy (20) | 42 / 110 / 333 / 810 / 801 / 497 / 230 / 166 | <20, 20-25 | 20-25 |
| Kelvin (12) | 50 / 75 / 254 / 527 / 568 / 363 / 153 / 108 | <20, 20-25, 50+ | 20-25, 50+ |
| Lady Geist (4) | 87 / 147 / 514 / 1175 / 1352 / 867 / 469 / 337 | <20, 20-25 | 20-25 |
| Lash (31) | 71 / 109 / 408 / 903 / 1089 / 653 / 339 / 274 | <20, 20-25 | 20-25 |
| McGinnis (8) | 33 / 65 / 204 / 403 / 445 / 282 / 159 / 121 | <20, 20-25, 50+ | 20-25, 50+ |
| Mina (63) | 80 / 142 / 422 / 1031 / 1192 / 827 / 403 / 307 | <20, 20-25 | 20-25 |
| Mirage (52) | 19 / 33 / 119 / 284 / 351 / 230 / 107 / 97 | <20, 20-25, 25-30, 45-50, 50+ | 20-25, 25-30, 45-50, 50+ |
| Mo & Krill (18) | 38 / 60 / 193 / 426 / 487 / 311 / 154 / 100 | <20, 20-25, 50+ | 20-25, 50+ |
| Nurse Harrow (87) | 57 / 104 / 305 / 675 / 772 / 490 / 252 / 184 | <20, 20-25 | 20-25 |
| Paige (67) | 68 / 102 / 375 / 865 / 943 / 605 / 349 / 231 | <20, 20-25 | 20-25 |
| Paradox (10) | 78 / 139 / 423 / 899 / 1162 / 721 / 375 / 255 | <20, 20-25 | 20-25 |
| Pocket (50) | 37 / 72 / 226 / 581 / 678 / 405 / 218 / 182 | <20, 20-25 | 20-25 |
| Rat King (84) | 92 / 138 / 443 / 994 / 1115 / 782 / 409 / 314 | <20, 20-25 | 20-25 |
| Rem (79) | 62 / 112 / 417 / 818 / 904 / 543 / 282 / 226 | <20, 20-25 | 20-25 |
| Seven (2) | 68 / 105 / 389 / 898 / 1065 / 666 / 346 / 256 | <20, 20-25 | 20-25 |
| Shiv (19) | 81 / 114 / 399 / 865 / 1020 / 661 / 330 / 249 | <20, 20-25 | 20-25 |
| Silver (80) | 57 / 108 / 388 / 836 / 961 / 549 / 299 / 226 | <20, 20-25 | 20-25 |
| Sinclair (60) | 18 / 41 / 136 / 278 / 343 / 216 / 116 / 84 | <20, 20-25, 25-30, 45-50, 50+ | 20-25, 25-30, 45-50, 50+ |
| Solomon (85) | 18 / 30 / 114 / 287 / 367 / 243 / 144 / 102 | <20, 20-25, 25-30, 45-50, 50+ | 20-25, 25-30, 45-50, 50+ |
| The Doorman (69) | 44 / 62 / 177 / 435 / 573 / 378 / 229 / 181 | <20, 20-25 | 20-25 |
| Venator (65) | 103 / 156 / 468 / 1134 / 1209 / 796 / 393 / 306 | <20 | None |
| Victor (66) | 47 / 103 / 356 / 818 / 937 / 593 / 330 / 210 | <20, 20-25 | 20-25 |
| Vindicta (3) | 69 / 88 / 358 / 766 / 884 / 556 / 278 / 191 | <20, 20-25 | 20-25 |
| Violet (86) | 39 / 65 / 228 / 506 / 601 / 388 / 189 / 148 | <20, 20-25, 50+ | 20-25, 50+ |
| Viscous (35) | 30 / 43 / 179 / 447 / 494 / 332 / 164 / 121 | <20, 20-25, 50+ | 20-25, 50+ |
| Vyper (58) | 28 / 79 / 214 / 451 / 454 / 265 / 147 / 107 | <20, 20-25, 45-50, 50+ | 20-25, 45-50, 50+ |
| Warden (25) | 32 / 68 / 226 / 509 / 546 / 330 / 167 / 133 | <20, 20-25, 50+ | 20-25, 50+ |
| Wraith (7) | 77 / 131 / 505 / 985 / 1106 / 662 / 334 / 222 | <20, 20-25 | 20-25 |
| Yamato (27) | 43 / 88 / 320 / 667 / 713 / 466 / 230 / 164 | <20, 20-25 | 20-25 |

### 3.3 Fixed 15:00 stats (2 stats: `at900_player_damage`, `at900_assists`)

Stored as single fixed 15:00 hero norms (`mean`, `sd`) across all training rows with a 15:00 snapshot (minimum hero count: 1,704 rows for Mirage; maximum: 6,845 rows for Lady Geist; 0 fallbacks).

## 4. Sanity checks: Monotonicity with match length

Checked every adjacent pair of bucket centers (`<20` -> `20-25` -> ... -> `50+`, 7 transitions x 44 heroes = 308 hero-transitions per stat):

| Stat | Adjacent drops (out of 308) | Result |
| --- | ---: | --- |
| `assists` | 0 | Strictly rising for all 44 heroes |
| `souls` | 0 | Strictly rising for all 44 heroes |
| `valve_souls` | 0 | Strictly rising for all 44 heroes |
| `dmg_and_ally_heal` | 0 | Strictly rising for all 44 heroes |
| `player_damage` | 0 | Strictly rising for all 44 heroes |
| `kills` | 5 | Tiny noise dips (all within ~1 SE); flagged below |
| `deaths` | 2 | Tiny noise dips (all within ~1 SE); flagged below |
| `objective_damage` | 20 | Late-game plateau from finite map objective HP pool; flagged below |

### Flagged non-monotonic hero/stat transitions and explanations

#### `kills` (5 small dips, all within ~1 standard error)

| Hero | Transition | From mean (n) | To mean (n) | Diff | Combined SE | z-diff | Explanation |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Lady Geist (4) | 25-30 -> 30-35 | 6.19 (837) | 6.14 (1892) | -0.05 | 0.18 | -0.27 | Sampling noise well inside 1 SE |
| Nurse Harrow (87) | 20-25 -> 25-30 | 2.80 (164) | 2.67 (495) | -0.13 | 0.27 | -0.48 | Snowball stomp tempo in 20-25 min games plus small sample noise (n~163) |
| Paige (67) | 20-25 -> 25-30 | 3.67 (163) | 3.40 (567) | -0.27 | 0.29 | -0.95 | Snowball stomp tempo in 20-25 min games plus small sample noise (n~163) |
| Sinclair (60) | 40-45 -> 45-50 | 6.46 (349) | 6.43 (196) | -0.02 | 0.34 | -0.07 | Sampling noise well inside 1 SE |
| Violet (86) | 40-45 -> 45-50 | 7.15 (603) | 7.14 (306) | -0.01 | 0.30 | -0.03 | Sampling noise well inside 1 SE |

#### `deaths` (2 small dips, both within 1 standard error)

| Hero | Transition | From mean (n) | To mean (n) | Diff | Combined SE | z-diff | Explanation |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Mina (63) | 25-30 -> 30-35 | 6.08 (712) | 6.05 (1635) | -0.03 | 0.15 | -0.22 | Sampling noise within 1 SE |
| The Doorman (69) | 25-30 -> 30-35 | 5.52 (295) | 5.36 (725) | -0.16 | 0.23 | -0.71 | Sampling noise within 1 SE |

#### `objective_damage` (20 small dips in late buckets 40+ min)

Map objectives (Guardians, Walkers, Base Guardians, Shrines, Patron) have a fixed total HP pool. Once outer structures fall by ~35 to 40 minutes, longer stalemates do not add proportionally more objective HP, so hero objective damage naturally plateaus (and shows small sampling dips across 40-45 -> 45-50 -> 50+):

| Hero | Transition | From mean (n) | To mean (n) | Diff | z-diff |
| --- | --- | ---: | ---: | ---: | ---: |
| Apollo (77) | 35-40 -> 40-45 | 5,392.5 (1385) | 5,253.0 (895) | -139.5 | -0.78 |
| Apollo (77) | 40-45 -> 45-50 | 5,253.0 (895) | 5,247.8 (475) | -5.2 | -0.02 |
| Baba (88) | 30-35 -> 35-40 | 5,561.0 (629) | 5,500.0 (704) | -61.0 | -0.22 |
| Billy (72) | 35-40 -> 40-45 | 5,939.0 (1934) | 5,836.4 (1201) | -102.6 | -0.56 |
| Calico (16) | 40-45 -> 45-50 | 5,545.7 (485) | 5,475.5 (282) | -70.2 | -0.20 |
| Dynamo (11) | 45-50 -> 50+ | 6,041.6 (409) | 5,703.0 (308) | -338.5 | -1.07 |
| Lash (31) | 40-45 -> 45-50 | 4,933.9 (1070) | 4,924.5 (541) | -9.4 | -0.05 |
| McGinnis (8) | 35-40 -> 40-45 | 6,219.2 (701) | 6,081.2 (444) | -138.0 | -0.45 |
| Mirage (52) | 40-45 -> 45-50 | 5,926.4 (362) | 5,727.7 (181) | -198.7 | -0.44 |
| Nurse Harrow (87) | 25-30 -> 30-35 | 2,017.3 (495) | 2,012.5 (1051) | -4.8 | -0.05 |
| Nurse Harrow (87) | 35-40 -> 40-45 | 2,178.1 (1192) | 2,161.0 (768) | -17.1 | -0.19 |
| Pocket (50) | 40-45 -> 45-50 | 6,299.5 (672) | 6,239.9 (351) | -59.6 | -0.19 |
| Rat King (84) | 45-50 -> 50+ | 8,363.4 (644) | 8,329.9 (509) | -33.5 | -0.10 |
| Silver (80) | 45-50 -> 50+ | 5,395.9 (470) | 5,229.5 (361) | -166.4 | -0.57 |
| Solomon (85) | 35-40 -> 40-45 | 3,779.5 (568) | 3,701.2 (397) | -78.3 | -0.34 |
| Solomon (85) | 45-50 -> 50+ | 4,708.4 (212) | 4,283.9 (170) | -424.5 | -1.11 |
| Victor (66) | 40-45 -> 45-50 | 9,217.2 (946) | 9,108.6 (537) | -108.6 | -0.28 |
| Vindicta (3) | 35-40 -> 40-45 | 7,397.7 (1379) | 7,289.8 (882) | -107.9 | -0.37 |
| Vindicta (3) | 45-50 -> 50+ | 8,029.8 (452) | 7,925.0 (304) | -104.8 | -0.20 |
| Yamato (27) | 35-40 -> 40-45 | 5,614.0 (1147) | 5,532.6 (729) | -81.5 | -0.37 |

## 5. Test suite results

All runnable tests in `test/` pass (verified after the final edit):

1. `node test/score_test.js`: **5 / 5** match fixtures PASS (`136950036`, `136941488`, `137019499`, `137022293`, `137018749`), verifying exact Valve flat scores/points/picks, length-adjusted means/points sums, and untouched Early/Late/Lane phase vectors.
2. `node --test test/summary.test.js test/app-download.test.mjs test/app-download-route.integration.mjs test/fast-match.test.mjs test/prelaunch-audit.test.js` (with `PM_FAST_PLAYWRIGHT`, `PM_AUDIT_CHROME`, `PM_AUDIT_MATCHES`, and `PM_AUDIT_MONDAY` set): **36 passed, 0 failed, 2 skipped**:
   - `test/summary.test.js`: **11 / 11 PASS** (includes new unit tests for `PM_SCORE.expected()` at bucket centers, thin-bucket per-minute fallback, smooth interpolation across the 30:00 bucket edge at `1799.99 / 1800 / 1800.01 s`, extrapolation past the 50+ center, fixed 15:00 vs late scaling, lower-is-better deaths, strict tail ties, unknown heroes, and invalid durations).
   - `test/app-download.test.mjs`: **1 / 1 PASS**.
   - `test/fast-match.test.mjs`: **2 / 2 PASS** (both `website` and `embed` companion preview swaps plus mismatched upload fallback).
   - `test/prelaunch-audit.test.js`: **22 / 22 PASS** (including the full 20-match corpus + Monday `136949669` K/D check: 180 Summary portraits, 575 graphs, 5,100 Matchups pairs, 620 MVP rows).
   - `test/app-download-route.integration.mjs`: **2 skipped** (requires a local Wrangler dev server via `PM_DOWNLOAD_TEST_ORIGIN`; Wrangler is not installed locally).
3. Live Chromium smoke check across MVP Valve/Impact/Raw tabs and `profile.html` (`test/profile_fixture.json`): **0 page errors**, verified length-aware headers, verdicts, survival tags, and footers.

## 6. Screenshots (1920x1080 from local static server)

Saved under `docs/length-norms-screens/` and visually inspected at 1920x1080:

- **Short match (`137019499`, 18:29, Mirage slot 8, Set A)**:
  - [short-summary.png](length-norms-screens/short-summary.png): Summary tab with `MIRAGE IN 18 MIN GAMES` Highlights card.
  - [short-highlight.png](length-norms-screens/short-highlight.png): Focused Highlights stat row showing the length-aware tooltip (`Avg Mirage in 18 min games: 2,492.7`, thin-sample per-minute fallback from 1,982 Mirage games).
  - [short-mvp.png](length-norms-screens/short-mvp.png): MVP Valve tab with `AVG MIRAGE IN 18 MIN GAMES`, length-adjusted `+2.01` score, and updated footer.
- **Long match (`136966554`, 54:16, Paige slot 2, 90k damage+healing)**:
  - [long-summary.png](length-norms-screens/long-summary.png): Summary tab with `PAIGE IN 54 MIN GAMES` showing `Top 25%` damage+healing (down from old `Top 1%`) and `+5 other stats, all typical`.
  - [long-highlight.png](length-norms-screens/long-highlight.png): Focused Highlights stat row tooltip (`Avg Paige in 54 min games: 62,783. Median: 60,230.8. Better than about 88% at this length. Based on nearby game lengths (544 and 374 Paige games).`).
  - [long-mvp.png](length-norms-screens/long-mvp.png): MVP Valve tab with `AVG PAIGE IN 54 MIN GAMES`, length-adjusted `+0.80` score (down from old `+4.25`), and exact Valve MVP + Key Player award order.

## 7. Files changed and why

| File | Status | Why |
| --- | --- | --- |
| `tools/length_data.py` | New | Pure-stdlib loader for `mvp_rows.zip`, `mvp_matches.zip`, and `mvp_check_100.txt`, reproducing `big.py`'s exact 25% `default_rng(0)` holdout split with zero overlap between training and evaluation sets. |
| `tools/fetch_length_farm.py` | New | Reproducibly fetches the two Impact farming columns (`trooper_souls`, `neutral_souls`) for training matches from the public keyless `api.deadlock-api.com` API (rate-limited <= 2 req/min). |
| `tools/data/length_farm.csv.gz` | New | Frozen farming totals for all 18,052 training matches (216,624 player rows, 0 missing). |
| `tools/data/mvp_check_100.txt` | New | Fixed 100-match Set B IDs sampled from Set A with seed `20261124`. |
| `tools/build_length_norms.py` | New | Pure-stdlib generator producing `tools/data/length_norms.json` (21 stats x 45 hero entries) and `data/hero_percentiles.json` (6 Summary stats p1..p99 cutoffs) from the training split only. |
| `tools/data/length_norms.json` | New | Generated length-aware hero norms table (`237 KB`, version `2026-11-24.1`). |
| `tools/build_heronorms_js.py` | Modified | Extended to embed `window.LENGTH_NORMS` alongside `HERO_TABLE` and `SNAP_NORMS` when regenerating `heronorms.js`. |
| `heronorms.js` | Regenerated | Regenerated via `tools/build_heronorms_js.py` (`334 KB`) to expose `window.LENGTH_NORMS` to the browser. |
| `data/hero_percentiles.json` | Regenerated | Replaced flat all-length cutoffs with duration-bucketed + per-minute fallback p1..p99 cutoffs for the 6 Summary/Highlights stats (`1.01 MB`). |
| `scoring.js` | Modified | Added shared `PM_SCORE.expected(heroId, stat, durationS, distributions)` and `PM_SCORE.lengthLabel(seconds)`; updated `scoreMatch()` to compute length-aware points/means/score while keeping flat `picks`/`flatScore` for Valve-tab award ranking per Rule 5. |
| `mvp.js` | Modified | Applied length-aware hero norms and plain length labels (`Avg <Hero> in X min games`) across Valve, Impact, and Raw tabs (keeping Street Brawl lobby-based and guarding zero-inflated role stats with `max(mean, sd)`), and updated Valve footer to verified numbers. |
| `summary/percentile.js` | Modified | Routed `bounds()` and `pct()` through `PM_SCORE.expected(..., durationS, table)` for smooth duration-aware percentiles and thin-bucket rate fallback. |
| `summary/summary.js` | Modified | Passed `match.duration_s` into percentile lookups, removed the abrupt `< 20 min` switch, and updated Highlights card kickers, tooltips, share lines, and score breakdowns to show length-aware hero comparisons. |
| `profile.html` | Modified | Loaded `scoring.js` after `heronorms.js` so Profile can use `PM_SCORE.expected()` and `PM_SCORE.lengthLabel()`. |
| `profile.js` | Modified | Switched match verdicts (`heroAvg`, `verdict`), survival profile tags (`Hard to kill` / `Respawn regular`), and footer copy to length-aware hero norms. |
| `test/score_test.js` | Modified | Verified both Valve flat award vectors (`flatScore`, `flatPoints`, `picks`) and length-aware display scores/means, plus untouched phase/lane vectors. |
| `test/summary.test.js` | Modified | Added unit tests for `PM_SCORE.expected()`, thin-bucket per-minute fallback, smooth edge interpolation across 30:00, top-end extrapolation, fixed 15:00 vs late scaling, and invalid inputs. |
| `tools/check_length_mvp.py`, `tools/check_length_mvp.js` | New | Reproducible evaluation harness scoring Sets A, B, and C through the site's actual `scoring.js`. |
| `tools/check_length_screens.cjs` | New | Local static server + Playwright capture harness comparing `88daa51` vs new across 11 real players and capturing the 6 1920x1080 proof screenshots. |
| `docs/length-norms-screens/*.png` | New | Six 1920x1080 proof screenshots (short and long Summary, Highlights tooltip, and MVP tabs). |
| `docs/LENGTH_NORMS_LOG.md` | New | This proof log. |

Note: `lanes.js` was audited and intentionally left unchanged because it already grades fixed-time snapshots (`early[tv]` at 3:00..15:00 in `snap_norms.json`), not flat full-match averages.

## What could not be checked

- **Live Wrangler Worker integration (`test/app-download-route.integration.mjs`)**: Skipped (2 tests) because Wrangler is not installed locally.
- **Live Deadlock in-game Panorama browser**: Screenshots and tests ran in desktop headless Chromium at 1920x1080 (`website` and `embed` modes), not inside the live Deadlock game client.
- **`test/card-layout-check.mjs` full gallery sweep**: Not re-run as a gate because it is an opt-in diagnostic that writes to the tracked `docs/handoffs/2026-11-20-card-gallery-failures.md` report (known pre-existing 120 failures tracked separately on `codex/card-gallery`); visual layout of our modified Summary, Highlights, and MVP screens was verified directly on the 6 1920x1080 screenshots and `fast-match.test.mjs`'s `.hl-sweep .hl-of` overflow check passed.
- **Live `api.deadlock-api.com` refresh**: Re-used the frozen farming dataset (`tools/data/length_farm.csv.gz`, verified 216,624/216,624 exact match with the 18,052 training matches and 0 negative/null rows) rather than re-querying the public SQL API.
- **Live match / production deploy**: No push, merge, PR, or Cloudflare Worker deploy was run (so `PILOT_ENABLED` in production was not touched).
