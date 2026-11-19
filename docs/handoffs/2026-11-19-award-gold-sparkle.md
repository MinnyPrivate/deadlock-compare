# Award gold shine

November 19, 2026. Branch `codex/award-gold-sparkle` starts at `origin/main` commit `2cac59c`.

`award-gold.css` defines the shared `.goldMark` treatment for filled marks, text and the Summary stat edge. The diagonal sheen starts from award gold `#FFED79`. Key Player and first-place marks use a lighter gold to preserve their original contrast. On the website, a seven-second cycle adds one sweep and one staggered 7 px star. Only transform and opacity animate. `award-gold.js` gives motion to at most eight marks that intersect the viewport. Embedded pages and reduced-motion sessions show the static sheen.

## Places changed

| Where | Marks |
| --- | --- |
| Match portrait strip | MVP and KEY badges |
| Summary | First-place marks on the player card and leaderboard, MVP and KEY badges, lobby-best stat values, left edges and chips, and lobby-best chips in accolade rows |
| MVP tab | First-place rank, MVP and KEY badges, Raw and Impact lobby-best values, filled accolade pips, and accolade lobby-best chips |
| Graphs | Lobby-best values in the line legend, plus first place, best total and best column values in the lobby overview |
| Lane Stats | Won lane verdict badge |
| Profile | MVP and numbered Key Player badges in the match list |

This revision has no separate medal or Highlights award UI. The Profile rank-chart cursor and FAQ hover are general UI cues. The Time of day chart has its own gold scale on a separate branch and may want the same sheen in a future pass.

## Screenshots

Four 1920 × 1080 Chromium screenshots from recorded matches, opened and checked side by side and at native scale in the stat-card area. Billy is from repository fixture `137019499` and Graves is from audit fixture `137665238`. The after frames pause the sweep at 6,000 ms and the star at 6,440 ms. The tests compare both Summary accents with the official hero-color map.

- Billy [before](../screens/gold-sparkle/billy-before.png) and [after](../screens/gold-sparkle/billy-after.png)
- Graves [before](../screens/gold-sparkle/graves-before.png) and [after](../screens/gold-sparkle/graves-after.png)

To regenerate the after frames, set `PM_AWARD_SCREENSHOTS` to `docs/screens/gold-sparkle` and `PM_AUDIT_MATCHES` to the saved audit match folder. Run `node --test --test-name-pattern="award gold" test/prelaunch-audit.test.js`.

## Verification

- The Chromium regressions check that rendered award selectors use the shared treatment, verify the exact Billy and Graves accent colors, inspect computed animation styles for the website, embed and reduced motion, and exercise the eight-mark cap while scrolling a long Profile.
- `node --test` passed 33 tests with zero skips, including the saved 20-match audit corpus and Monday's K/D reproduction. `node test/score_test.js` passed all five fixtures. The download integration checks used the repository Worker with a local Node asset binding configured from `_headers`. The in-game mode was checked in Chromium.

## How Zachary wants to work

Read Vault Decisions and the newest handoff first. Get approval for each plan unless the brief already approves it. Keep design decisions with Zachary, use recorded data, stage explicit files, and keep credentials and local logs out of Git. This brief authorizes pushing `codex/award-gold-sparkle` only. Merges, deployments and pushes to main require separate approval.
