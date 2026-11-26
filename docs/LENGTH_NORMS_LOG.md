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

---

# Fix round 2

Date: November 24, 2026
Branch: `codex/length-norms` (worktree `C:\Users\zacha\pm-length-norms`)
New norm table version: **`2026-11-24.2`** (bumped from `2026-11-24.1`; regenerated reproducibly from the same 18,052 training matches and 216,624 player rows with 0 overlap against Sets A, B, and C)

## Summary of fixes

1. **Problem 1 (games under 20 minutes and thin 20-25 minute buckets skewed by per-minute rate fallback)**:
   - Replaced the thin-bucket `hero_rate_all_length * minutes` fallback in `scoring.js` (`PM_SCORE.expected()`) and `tools/build_length_norms.py` with **pooled duration-shape scaling**:
     - Fallback mean at bucket center `i`: `hero_all_mean * (pooled_bucket_mean[i] / pooled_all_mean)`
     - Fallback spread (SD) at bucket center `i`: `hero_all_sd * (pooled_bucket_sd[i] / pooled_all_sd)`
     - Fallback percentile cutoff `p` (`p1..p99`) at bucket center `i`: `hero_all_cut[p] * (pooled_bucket_cut[p] / pooled_all_cut[p])` when `pooled_all_cut[p] > 0`, else `pooled_bucket_cut[p] * (hero_all_mean / pooled_all_mean)`, enforced non-decreasing across `p1..p99`.
   - Outside the outer bucket centers (`< 922.74 s` or `> 3292.63 s`), both real and fallback cells scale linearly from the endpoint bucket center (`durationS / center`). Inside the centers, values interpolate linearly with no jump at bucket boundaries.
   - Kept the shared `PM_SCORE.expected(heroId, key, durationS, distributions)` signature and kept `minRows = 150`. Internal 2-fold cross-validation on the training matches confirmed `minRows = 150` matches or beats lower thresholds on `<20` (`kills` 14.12% vs 15.80% at 100; `souls` 4.43% vs 4.58% at 100) while keeping 1% tail cutoffs valid.
   - Monotonicity check re-run on `2026-11-24.2`: `assists`, `souls`, `valve_souls`, `player_damage`, and `dmg_and_ally_heal` still have **0 adjacent drops** across all 308 hero-transitions; `kills` has the same 5 tiny noise dips and `deaths` the same 2; `objective_damage` has 21 late/thin plateaus (0 drops from `<20` to `20-25`).
   - Updated the Summary thin-sample tooltip in `summary/summary.js` from "use the per-minute rate from ..." to "scale ... games by the all-hero length curve."
2. **Problem 2 (Summary "lobby place" disagreed with the MVP Valve tab)**:
   - Added a single canonical ordering helper `PM_SCORE.rankValve(players)` in `scoring.js` (sorting by `flatScore`, highest first).
   - Removed the `awardOrder` flag from `valveRows()` in `mvp.js` so `valveRows()` always uses `PM_SCORE.rankValve()`.
   - Updated `summary/summary.js` line 70 from `valveRows(false)` to `valveRows()`, so Summary and the MVP Valve tab share one ordering path and cannot drift apart.
   - Updated `placeCard()` in `summary/summary.js` so dot placement on the left-to-right rank strip and the `"ahead of" / "behind"` gap text follow the same `flatScore` ranking (so rank badges 1, 2, 3 always sit in order and gap direction never inverts), while keeping length-aware score size, per-stat points, boost/drag, and tooltip breakdowns.
3. **Minor items**:
   - **`whyScaled` footer text (`mvp.js`)**: Reworded so it no longer claims every stat earns half at average. Impact now says: `"On regular stats, an average game for this hero at this length earns half the available points; role stats (ally healing, barriers and healing prevented) also account for spread so small numbers stay modest."` Raw uses the matching wording for ally healing. Scoring math was not changed.
   - **Visible percentile version mismatch (`scoring.js`, `summary/percentile.js`, `summary/summary.js`)**: When `hero_percentiles.json` and `heronorms.js` have different versions, `scoring.js` now logs a `console.warn` (once per mismatched version pair) and marks `versionMismatch: true`, `SummaryPercentiles.versionMismatch()` exposes it, and the Summary Highlights card displays `"Vs the lobby · stale percentiles"` with `"Hero percentiles do not match hero averages. Showing lobby rank."` instead of silently hiding hero percentiles. Normal behavior when versions match is unchanged. Verified both in unit tests and in live Chromium (`staleCheck`).
   - **Valve tab place vs length-adjusted points explanation (`mvp.js`, `summary/summary.js`)**: Updated the Valve tab score tooltip, the Valve tab footer (`"Place follows Valve's own all-length scoring while points are length-adjusted, so a lower place can show more points"`), and the Summary place-card tooltip so users clearly understand why a lower place can show more length-adjusted points.

## R2.1 Problem 1 hold-out proof: old rate fallback vs new pooled-shape fallback

Re-measured with `python -B tools/check_short_fallback.py "C:\Users\zacha\OneDrive\Desktop\Deadlock Mods\Compare overlay\Data\mvp_fit"` on the 18,052 training matches (0 overlap with Sets A, B, and C). Every hold-out row hides the tested hero's target bucket AND excludes that hero from the pooled `"all"` curve (leave-one-hero-out) so there is no leakage.

### Pooled `<20` check (re-measured at bucket center `922.74 s`, `n = 3,672` rows)

| Stat | Real `<20` mean | Old fallback mean | Old mean error | Real `<20` SD | Old fallback SD | Old SD error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `kills` | 2.75 | 2.85 | +3.5% | 2.97 | 2.04 | -31.4% |
| `assists` | 3.47 | 5.16 | +48.6% | 3.63 | 2.64 | -27.4% |
| `deaths` | 2.80 | 2.86 | +2.1% | 2.45 | 1.50 | -38.7% |
| `souls` | 13,035.14 | 17,461.43 | +34.0% | 5,038.38 | 3,139.58 | -37.7% |
| `valve_souls` | 12,814.68 | 17,421.68 | +36.0% | 5,243.33 | 3,199.37 | -39.0% |
| `objective_damage` | 2,746.33 | 2,586.64 | -5.8% | 3,469.42 | 2,477.47 | -28.6% |
| `player_damage` | 7,641.12 | 13,986.77 | +83.0% | 5,065.37 | 5,899.01 | +16.5% |
| `dmg_and_ally_heal` | 7,875.88 | 14,531.03 | +84.5% | 5,175.63 | 5,888.23 | +13.8% |

### Hold-out Mean and SD MAPE at `<20` (`922.74 s`)

Note on hero counts in `<20`: at `minRows = 150`, only 1 hero (Drifter, `n = 154`) clears 150 rows; 15 heroes have `n >= 100` (`102..154` rows); all 44 heroes have `24..154` rows. All three hero slices are reported below.

| Stat | `<20` `n >= 100` (15 heroes) Mean MAPE Old -> New | `<20` `n >= 100` (15 heroes) SD MAPE Old -> New | `<20` `n >= 150` (1 hero: Drifter) Mean MAPE Old -> New | `<20` all 44 heroes Mean MAPE Old -> New | `<20` all 44 heroes SD MAPE Old -> New |
| --- | ---: | ---: | ---: | ---: | ---: |
| `kills` | 7.3% -> **6.9%** | 35.5% -> **10.7%** | 0.9% -> 3.6% | 12.9% -> **12.3%** | 32.0% -> **14.8%** |
| `assists` | 46.8% -> **8.1%** | 28.5% -> **12.9%** | 46.8% -> **2.0%** | 50.2% -> **10.6%** | 26.2% -> **15.4%** |
| `deaths` | 8.8% -> **8.7%** | 38.1% -> **10.4%** | 14.5% -> **12.3%** | 9.6% -> **9.5%** | 37.8% -> **10.8%** |
| `souls` | 32.9% -> **2.2%** | 40.1% -> **7.0%** | 32.6% -> **1.6%** | 34.1% -> **2.9%** | 37.8% -> **8.1%** |
| `valve_souls` | 34.9% -> **2.2%** | 41.3% -> **7.5%** | 33.8% -> **2.2%** | 36.1% -> **3.0%** | 39.0% -> **8.3%** |
| `objective_damage` | 9.8% -> **8.4%** | 32.5% -> **8.0%** | 0.8% -> 5.6% | 15.2% -> **14.6%** | 30.9% -> **16.4%** |
| `player_damage` | 85.4% -> **5.9%** | 9.4% -> **9.4%** | 69.0% -> **9.1%** | 82.8% -> **7.7%** | 21.6% -> **16.2%** |
| `dmg_and_ally_heal` | 85.4% -> **5.9%** | 9.4% -> **9.0%** | 69.0% -> **9.8%** | 84.8% -> **7.6%** | 20.2% -> **15.9%** |

### Hold-out Mean and SD MAPE at `20-25` (`1350 s`) and `50+` (`3292.63 s`)

In `20-25`, 25 heroes have a real `>= 150` bucket (`161..257` rows) and 19 heroes have thin `< 150` data (`53..147` rows). In `50+`, 42 heroes have `>= 150` rows and 2 heroes (Baba, Sinclair) have `< 150` rows.

| Stat | `20-25` real `>= 150` (25 heroes) Mean MAPE Old -> New | `20-25` thin `< 150` (19 heroes) Mean MAPE Old -> New | `20-25` all 44 heroes Mean MAPE Old -> New | `20-25` all 44 heroes SD MAPE Old -> New | `50+` real `>= 150` (42 heroes) Mean MAPE Old -> New |
| --- | ---: | ---: | ---: | ---: | ---: |
| `kills` | 13.8% -> **8.8%** | 9.7% -> 11.1% | 12.0% -> **9.8%** | 28.4% -> **10.5%** | 7.9% -> **2.7%** |
| `assists` | 6.6% -> 6.7% | 9.7% -> **8.7%** | 7.9% -> **7.6%** | 29.5% -> **5.9%** | 3.2% -> **2.7%** |
| `deaths` | 10.0% -> **6.1%** | 14.0% -> **6.6%** | 11.7% -> **6.3%** | 33.1% -> **5.6%** | 9.4% -> **3.4%** |
| `souls` | 11.5% -> **2.3%** | 14.4% -> **4.3%** | 12.7% -> **3.2%** | 16.2% -> **11.9%** | 11.3% -> **1.1%** |
| `valve_souls` | 12.1% -> **2.3%** | 15.0% -> **4.3%** | 13.4% -> **3.2%** | 18.7% -> **12.0%** | 11.4% -> **1.1%** |
| `objective_damage` | 17.1% -> **8.1%** | 13.8% -> 15.1% | 15.7% -> **11.1%** | 24.5% -> **9.8%** | 21.7% -> **5.1%** |
| `player_damage` | 25.0% -> **4.7%** | 30.7% -> **6.7%** | 27.5% -> **5.6%** | 13.0% -> 14.2% | 19.8% -> **3.2%** |
| `dmg_and_ally_heal` | 25.8% -> **4.4%** | 31.0% -> **6.9%** | 28.1% -> **5.5%** | 12.6% -> 14.7% | 19.8% -> **3.3%** |

### Hold-out percentile cutoff accuracy and tail calibration (Summary/Highlights stats, LOHO)

Average error across 7 cutoffs (`p10, p25, p50, p75, p90, p95, p99`, normalized by the real bucket mean) plus empirical Top 5% rate (target ~5%) and Bottom 25% rate (target ~25%) on actual hero rows in each bucket:

| Bucket (heroes) | Stat | 7-cutoff error Old -> New | Empirical Top 5% rate (~5%) Old -> New | Empirical Bottom 25% rate (~25%) Old -> New |
| --- | --- | ---: | ---: | ---: |
| `<20` `n >= 100` (15) | `kills` | 52.6% -> **25.8%** | 10.6% -> **4.8%** | 41.1% -> **33.4%** |
| `<20` `n >= 100` (15) | `assists` | 59.3% -> **23.9%** | 6.0% -> **4.8%** | 59.6% -> **25.7%** |
| `<20` `n >= 100` (15) | `deaths` | 44.7% -> **22.0%** | 12.7% -> **4.8%** | 37.9% -> **24.8%** |
| `<20` `n >= 100` (15) | `souls` | 26.6% -> **5.3%** | 3.7% -> **6.2%** | 66.7% -> **25.6%** |
| `<20` `n >= 100` (15) | `objective_damage` | 53.6% -> **22.4%** | 12.3% -> **6.9%** | 37.3% -> **24.3%** |
| `<20` `n >= 100` (15) | `dmg_and_ally_heal` | 86.0% -> **15.3%** | 1.6% -> **5.5%** | 76.4% -> **27.2%** |
| `20-25` real `>= 150` (25) | `souls` | 10.7% -> **5.2%** | 4.0% -> **5.5%** | 50.3% -> **24.8%** |
| `20-25` real `>= 150` (25) | `dmg_and_ally_heal` | 26.9% -> **11.5%** | 2.7% -> **5.4%** | 48.7% -> **24.8%** |
| `20-25` thin `< 150` (19) | `kills` | 32.1% -> **27.6%** | 11.1% -> **3.8%** | 32.5% -> 32.5% |
| `20-25` thin `< 150` (19) | `assists` | 31.7% -> **15.9%** | 11.5% -> **3.5%** | 43.6% -> **27.3%** |
| `20-25` thin `< 150` (19) | `deaths` | 34.1% -> **13.3%** | 15.6% -> **3.8%** | 28.8% -> **22.4%** |
| `20-25` thin `< 150` (19) | `souls` | 13.7% -> **7.3%** | 3.2% -> **3.5%** | 54.8% -> **26.1%** |
| `20-25` thin `< 150` (19) | `objective_damage` | 37.2% -> **31.2%** | 9.8% -> **4.2%** | 29.9% -> **26.7%** |
| `20-25` thin `< 150` (19) | `dmg_and_ally_heal` | 34.8% -> **16.3%** | 1.7% -> **4.0%** | 50.9% -> **25.1%** |

Under the old per-minute rate fallback, 76.4% of `<20` players were flagged Bottom 25% on damage+healing and 66.7% on souls. Under the pooled-shape fallback, those rates land at **27.2%** and **25.6%** (right on target ~25%).

## R2.2 Five real short-game examples under 20 minutes (Old `0b3306c` vs New `2026-11-24.2`)

Set A (`mvp_matches.zip`) contains 10 matches under 20 minutes. Five real players across five distinct under-20 matches were captured directly from live Chromium renders of `0b3306c` (old rate fallback + old Summary place) vs the updated working tree via `node tools/check_short_round2.cjs tools/.length-work/short-round2`:

| Match (Slot) | Hero | Length | Line (`K/D/A`, Souls, Dmg+Heal) | Old expected Dmg+Heal (pct) | New expected Dmg+Heal (pct) | Old Valve score -> New | Old Summary place (MVP tab) -> New | Old Highlights card | New Highlights card |
| --- | --- | ---: | --- | ---: | ---: | ---: | --- | --- | --- |
| `137022293` (slot 6) | Seven | 13:47 | 4/2/2, 10.5k souls, 7,956 d+h | 13,245 (p13 / Bottom 25%) | **7,255 (p66 / Typical)** | -1.77 -> **+0.23** | 7th (MVP: 8th) -> **8th (MVP: 8th)** | `Seven in 14 min games`: **Bottom 5%** `souls · 10.5k` | `Seven in 14 min games`: **Top 25%** `kills · 4` (`+5 other stats, all typical`) |
| `137035207` (slot 10) | Yamato | 14:23 | 2/2/3, 14.2k souls, 6,768 d+h | 13,012 (p9 / Bottom 10%) | **7,008 (p57 / Typical)** | -2.38 -> **-0.18** | 6th (MVP: 6th) -> **6th (MVP: 6th)** | `Yamato in 14 min games`: **Bottom 10%** `damage + healing · 6,768` | `Yamato in 14 min games`: **Typical** `on every stat` |
| `137047216` (slot 9) | Haze | 13:17 | 6/1/1, 19.7k souls, 8,238 d+h | 13,016 (p19 / Bottom 25%) | **6,999 (p69 / Typical)** | -0.03 -> **+1.42** | 5th (MVP: 5th) -> **5th (MVP: 5th)** | `Haze in 13 min games`: **Bottom 10%** `assists · 1` | `Haze in 13 min games`: **Top 10%** `souls · 19.7k` |
| `137027801` (slot 11) | Holliday | 16:18 | 3/0/3, 17.0k souls, 11,120 d+h | 14,179 (p29 / Typical) | **8,252 (p80 / Top 25%)** | -0.67 -> **+1.03** | 2nd (MVP: 3rd) -> **3rd (MVP: 3rd)** | `Holliday in 16 min games`: **Top 5%** `deaths · 0` (plus `Bottom 25%` assists) | `Holliday in 16 min games`: **Top 10%** `deaths · 0` (plus `Top 25%` damage + healing) |
| `137019499` (slot 8) | Mirage | 18:29 | 3/3/9, 19.8k souls, 6,209 d+h | 14,345 (p5 / Bottom 5%) | **9,808 (p28 / Typical)** | +2.01 -> **+1.87** | 2nd (MVP: 2nd) -> **2nd (MVP: 2nd)** | `Mirage in 18 min games`: **Top 1%** `objective damage · 13.4k` (with `Bottom 5%` damage + healing) | `Mirage in 18 min games`: **Top 5%** `objective damage · 13.4k` (damage + healing now `Typical`) |

### Detailed Highlights card text before and after (`137022293`, 13:47, Seven slot 6)

- **Before (`0b3306c`, old per-minute rate fallback)**:
  - Kicker / Headline: `Seven in 14 min games` / `Bottom 5% souls · 10.5k`
  - Shown rows: `Souls: ▼ Bottom 5%`, `Kills: ▲ Top 25%`, `Assists: ▼ Bottom 25%`, `+3 other stats`
  - Lead tooltip: `"10,488 souls. Avg Seven in 14 min games: 16,465. Median: 16,335.3. Better than about 2% at this length. Thin samples use the per-minute rate from 6,043 Seven games. 9th of 12 in the lobby."`
  - Summary place card: `7th of 12` (`1.7 est. pts behind Bebop`), disagreeing with MVP Valve tab `8th of 12`.
- **After (working tree, pooled-shape fallback `2026-11-24.2` + unified Valve place)**:
  - Kicker / Headline: `Seven in 14 min games` / `Top 25% kills · 4`
  - Shown rows: `Kills: ▲ Top 25%`, `+5 other stats, all typical`
  - Lead tooltip: `"4 kills. Avg Seven in 14 min games: 2.1. Median: 1.8. Better than about 83% at this length. Thin samples scale 6,043 Seven games by the all-hero length curve. 1st of 12 in the lobby."`
  - Summary place card: `8th of 12` (`0.1 est. pts behind Infernus`), matching MVP Valve tab `8th of 12` exactly.

## R2.3 Re-verified Valve-tab MVP agreement (`2026-11-24.2`)

Re-run now with `python -B tools/check_length_mvp.py "C:\Users\zacha\OneDrive\Desktop\Deadlock Mods\Compare overlay\Data\mvp_fit"`:

| Evaluation set | Matches | Deployed Valve-tab MVP | Deployed All 3 in order | Pure length-aware MVP | Pure length-aware All 3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Set A (500 ranked, `mvp_matches.zip`) | 500 | **492/500 (98.40%)** | **468/500 (93.60%)** | 445/500 (89.00%) | 300/500 (60.00%) |
| Set B (100 fixed, `mvp_check_100.txt`) | 100 | **99/100** | **97/100** | 89/100 | 62/100 |
| Set C Unranked (held-out) | 4,596 | **4,577/4,596 (99.59%)** | **4,492/4,596 (97.74%)** | 4,295/4,596 (93.45%) | 3,467/4,596 (75.44%) |
| Set C Ranked (held-out) | 1,269 | **1,253/1,269 (98.74%)** | **1,201/1,269 (94.64%)** | 1,121/1,269 (88.34%) | 810/1,269 (63.83%) |
| Set C Combined (held-out) | 5,865 | **5,830/5,865 (99.40%)** | **5,693/5,865 (97.07%)** | 5,416/5,865 (92.34%) | 4,277/5,865 (72.92%) |

All Valve-tab targets remain unchanged at exact baseline (`98.40%` Set A, `99/100` Set B, `99.40%` Set C combined, with all-three-in-order unchanged on every set).

## R2.4 Summary vs MVP Valve-tab place agreement proof

Command: `python -B tools/check_place_agreement.py "C:\Users\zacha\OneDrive\Desktop\Deadlock Mods\Compare overlay\Data\mvp_fit"`

Executes the real `mvp.js` (`renderMvp()`) and `summary/summary.js` (`Summary.inspectCards()`) files in isolated Node VM harnesses across all 500 Set A matches x 12 players (6,000 player rows), comparing commit `0b3306c` against the updated working tree:

| Build | Matches | Players checked | Place mismatches | Mismatch rate | Matches with any mismatch | MVP tab puts Valve MVP 1st | Summary puts Valve MVP 1st |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Old (`0b3306c`) | 500 | 6,000 | 1,845 | 30.75% | 443 / 500 | 469 / 500 | 423 / 500 |
| New (working tree) | 500 | 6,000 | **0** | **0.00%** | **0 / 500** | **469 / 500** | **469 / 500** |

The same real-page agreement check was also added to `test/summary.test.js` across all 5 tracked match fixtures (`136950036`, `136941488`, `137019499`, `137022293`, `137018749`, 60 players total, verifying 0 mismatches even when flat and length-adjusted rankings differ).

## R2.5 Regenerated tables and test results

### Regenerated assets (table version `2026-11-24.2`)

Commands:
- `python -B tools/build_length_norms.py "C:\Users\zacha\OneDrive\Desktop\Deadlock Mods\Compare overlay\Data\mvp_fit"`
- `python -B tools/build_heronorms_js.py tools/data/hero_table.json tools/data/snap_norms.json heronorms.js tools/data/length_norms.json`

Outputs:
- `tools/data/length_norms.json`: `238,257` bytes (`version: "2026-11-24.2"`)
- `data/hero_percentiles.json`: `828,180` bytes (`version: "2026-11-24.2"`, down from `1.01 MB` because all-length cutoffs replace floating-point rate cutoffs)
- `heronorms.js`: `335,407` bytes (`window.LENGTH_NORMS.version === "2026-11-24.2"`)

### Full test suite results (verified after final code edit)

1. `node test/score_test.js`: **5 / 5 PASS** (`136950036`, `136941488`, `137019499`, `137022293`, `137018749`).
2. `node --test test/summary.test.js test/app-download.test.mjs test/app-download-route.integration.mjs test/fast-match.test.mjs test/prelaunch-audit.test.js` (with `PM_FAST_PLAYWRIGHT`, `PM_AUDIT_CHROME`, `PM_AUDIT_MATCHES`, and `PM_AUDIT_MONDAY` set): **38 passed, 0 failed, 2 skipped**:
   - `test/summary.test.js`: **13 / 13 PASS** (includes updated pooled-shape thin-bucket fallback unit test, new percentile version-mismatch warning test, and new real-page Summary vs MVP Valve-tab place agreement + footer copy test across all 5 match fixtures / 60 players).
   - `test/app-download.test.mjs`: **1 / 1 PASS**.
   - `test/fast-match.test.mjs`: **2 / 2 PASS** (`website` and `embed` companion swap + mismatched upload fallback).
   - `test/prelaunch-audit.test.js`: **22 / 22 PASS** (including all 20 audit matches + Monday `136949669`: 180 Summary portraits, 575 graphs, 5,100 Matchups pairs, 620 MVP rows).
   - `test/app-download-route.integration.mjs`: **2 skipped** (Wrangler is not installed locally).
3. Live Chromium browser check (`node tools/check_short_round2.cjs tools/.length-work/short-round2`): **0 page errors** across all 5 under-20 matches, plus live stale-version test confirmed single `console.warn` and visible `"Vs the lobby · stale percentiles"` / `"Hero percentiles do not match hero averages. Showing lobby rank."` card text.

## R2.6 Fresh 1920x1080 screenshots (under-20 match `137022293`, 13:47, Seven slot 6)

Saved under `docs/length-norms-screens/` with new file names (none of the 6 Round 1 screenshots were overwritten) and visually inspected:

- [short-r2-summary.png](length-norms-screens/short-r2-summary.png): Summary tab showing `ESTIMATED LOBBY PLACE: 8th of 12` (`0.1 est. pts behind Infernus`, matching MVP Valve tab `8th`) with rank dots 1, 2, 3 in strict left-to-right order, and `SEVEN IN 14 MIN GAMES: Top 25% kills · 4` (`+5 other stats, all typical`).
- [short-r2-highlight.png](length-norms-screens/short-r2-highlight.png): Focused Highlights stat row showing the new pooled-shape tooltip (`4 kills. Avg Seven in 14 min games: 2.1. Median: 1.8. Better than about 83% at this length. Thin samples scale 6,043 Seven games by the all-hero length curve. 1st of 12 in the lobby.`).
- [short-r2-mvp.png](length-norms-screens/short-r2-mvp.png): MVP Valve tab showing Seven in `8th of 12` (`+0.23` length-adjusted points) matching Summary, `AVG SEVEN IN 14 MIN GAMES` (`7,254` dmg+heal, `12.1k` souls), and the updated footer explaining why a lower place (such as Paige at 6th with `+2.2` vs Bebop at 5th with `+1.3`) can show more length-adjusted points.

## R2.7 Files changed in Fix round 2 and why

| File | Status | Why |
| --- | --- | --- |
| `tools/build_length_norms.py` | Modified | Bumped norm table version to `2026-11-24.2` and stored all-length moments and cutoffs (`all`) instead of all-length per-minute rates (`rate`) to power pooled duration-shape fallback. |
| `tools/data/length_norms.json` | Regenerated | Regenerated at version `2026-11-24.2` (`238,257` bytes) with `all` moments for pooled-shape fallback. |
| `data/hero_percentiles.json` | Regenerated | Regenerated at version `2026-11-24.2` (`828,180` bytes) with `all` p1..p99 cutoffs for pooled-shape fallback. |
| `heronorms.js` | Regenerated | Rebuilt via `tools/build_heronorms_js.py` (`335,407` bytes, `window.LENGTH_NORMS.version = "2026-11-24.2"`). |
| `scoring.js` | Modified | Switched thin-bucket fallback in `PM_SCORE.expected()` to pooled duration-shape scaling for mean, SD, and percentile cutoffs; added `PM_SCORE.rankValve()` for shared Valve-tab ordering; added `percentileVersionMismatch()` and deduplicated `console.warn` on version mismatch. |
| `mvp.js` | Modified | Removed `awardOrder` flag from `valveRows()` and routed it through `PM_SCORE.rankValve()`; made `whyScaled` footer accurate for role stats; added plain explanation to Valve tab tooltip and footer that place follows Valve's all-length scoring while points are length-adjusted. |
| `summary/percentile.js` | Modified | Exposed `versionMismatch()`, logged mismatch warning on `load()`, and accepted an optional table argument on `bounds()`/`pct()` for testing without changing normal calls. |
| `summary/summary.js` | Modified | Changed `valveRows(false)` to `valveRows()` so Summary and MVP Valve tab share one ordering path; aligned `placeCard()` dot positions and gap text with `flatScore` while keeping length-aware score size/points; updated thin-sample tooltip wording; added visible stale-percentile card text on version mismatch. |
| `test/summary.test.js` | Modified | Updated thin-bucket fallback unit test for pooled-shape scaling; added tests for percentile version-mismatch warning and real-page Summary vs MVP Valve-tab place agreement across 5 match fixtures (60 players) plus footer copy checks. |
| `tools/check_short_fallback.py` | New | Reproducible leave-one-hero-out hold-out benchmark comparing old rate fallback vs new pooled-shape fallback across `<20`, `20-25`, and `50+` buckets (means, SDs, and percentile cutoffs). |
| `tools/check_place_agreement.py`, `tools/check_place_agreement.js` | New | Reproducible 500-match (6,000-player) verification script running real `mvp.js` and `summary/summary.js` code on `0b3306c` vs working tree. |
| `tools/check_short_round2.cjs` | New | Live Chromium capture harness comparing `0b3306c` vs working tree on 5 under-20 matches, testing the stale-percentile browser warning, and saving the 3 new 1920x1080 screenshots. |
| `docs/length-norms-screens/short-r2-*.png` | New | Three fresh 1920x1080 screenshots (`short-r2-summary.png`, `short-r2-highlight.png`, `short-r2-mvp.png`) for under-20 match `137022293` (13:47, Seven slot 6). |
| `docs/LENGTH_NORMS_LOG.md` | Modified | Appended this Fix round 2 proof section. |

## R2.8 What could not be checked

- **Live Wrangler Worker integration (`test/app-download-route.integration.mjs`)**: Skipped (2 tests) because Wrangler is not installed locally.
- **Live Deadlock in-game Panorama browser**: All Chromium checks and screenshots ran in desktop headless Chrome at 1920x1080 (`website` and `embed` modes), not inside the live game client.
- **`test/card-layout-check.mjs` full gallery sweep**: Not run as a gate because it overwrites the tracked `docs/handoffs/2026-11-20-card-gallery-failures.md` report (pre-existing 120 layout failures tracked separately on `codex/card-gallery`); our modified Summary, Highlights, and MVP views were visually verified at 1920x1080 and `fast-match.test.mjs`'s `.hl-sweep .hl-of` overflow check passed.
- **Live `api.deadlock-api.com` refresh**: Re-used the verified frozen `tools/data/length_farm.csv.gz` (216,624/216,624 rows exact match) rather than re-querying the public SQL API.
- **Production deploy / `PILOT_ENABLED` check**: No push, merge, PR, or deploy was run.
