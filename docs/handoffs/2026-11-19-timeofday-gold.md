# Profile Time of day uses a fixed gold scale

November 19, 2026. `codex/timeofday-gold` starts at fetched `origin/main` commit `8782785`.

Time of day buckets finished matches by the viewer's local hour. It compares each hour's exact win rate to 50% and rounds the percentage for the tooltip. The hour label keeps a minus, equals, or plus sign for the below-neutral, neutral, and above-neutral bands. Keyboard Tab shows the same count and rate as pointer hover, with a cream focus ring. Touch can tap a cell for the count and rate. An hour with one to four games uses 75% swatch opacity and adds “Fewer than 5 games.” to the tooltip. An empty hour has an outline and reports “no games.” The Patterns header shows the overall rate as context.

| Step | Win rate | Swatch | CIEDE2000 from previous step |
| --- | --- | --- | --- |
| 1 | 40% or less | `#302C28` | |
| 2 | Over 40%, under 47% | `#524D47` | 10.89 |
| 3 | 47% through 53%, inclusive | `#85827D` | 19.98 |
| 4 | Over 53%, under 60% | `#B8A64F` | 23.78 |
| 5 | 60% or more | `#FFED79` | 17.64 |

The scale gets lighter at every step (L* 18, 33, 55, 68, 93), so the order reads dark ash, lighter ash, neutral gray, mid gold, bright gold. Steps 3 to 5 use dark hour labels for contrast (4.9, 7.7 and 15.7 against the swatch).

Distances use the full-opacity sRGB swatches converted to CIELAB with a D65 white point. The calculation matched all 34 published CIEDE2000 reference pairs. [Sharma, Wu and Dalal, February 2005](https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/)

## Approved overrides

- The Vault Decisions note has no rule specific to this chart. Its hero-relative rule covers post-match tags. The older Hideout v6 handoff uses a player-relative, red/ochre/green scale for Time of day. The approved brief replaces that chart rule with a fixed 50% baseline and ash, gray, and gold swatches.
- `DESIGN.md` reserves `#FFED79` for lobby best, top rank, and key badges. The approved brief extends that site gold to the top Time of day band.

## Screenshots

The three 1920 × 1080 Chromium captures were opened and checked. They use the same real audit history from `audit-evidence-2026-11-19/h242410987.json`, shown as “Audit Profile” with the browser set to `America/New_York`.

- [Before](../screens/timeofday-gold/before.png) shows the old player-relative scale on a profile with a 58% overall win rate.
- [After](../screens/timeofday-gold/after.png) shows the five swatches and the `vs 50%` legend.
- [After with tooltip](../screens/timeofday-gold/after-hover.png) shows `3 PM: won 12 of 22 (55%)`.

To capture the chart on the current code, set `PM_TIMEOFDAY_HISTORY` to the saved history above and `PM_TIMEOFDAY_SCREENSHOT` to the desired PNG path. Set `PM_TIMEOFDAY_TOOLTIP_SCREENSHOT` for a second capture with the 3 PM tooltip. Run `node --test --test-name-pattern="capture Time of day" test/prelaunch-audit.test.js`.

## Verification

- The Chromium regression checks the eight boundaries, five cell colors and legend swatches, equal win rates with different counts, the low-sample opacity and copy, empty hours, and the same tooltip on hover and Tab. The 3 PM swatch stays fixed when the sidebar range changes the overall win rate from 81% to 24%.
- `node --test` passed all 30 tests with zero skips, including the saved 20-match audit and Monday's K/D replay. The download checks used the repository Worker with a local Node asset binding reading `_headers` and `.assetsignore`. `node test/score_test.js` also passed all five scoring fixtures.

## How Zachary wants to work

Read Vault Decisions and the newest handoff first. Sketch the plan and wait for explicit approval unless the brief already gives it. Keep design decisions with Zachary and use saved real data for visual checks. Stage only named files and keep credentials and local logs out of Git. This brief authorizes pushing only `codex/timeofday-gold`. Merging, deploying, or pushing to `main` requires separate authorization.

The screenshots above were captured before the palette reorder and show the earlier step 2 and 3 colors.
