# Highlights card gallery

November 20, 2026. Branch `codex/card-gallery`, based on `78874ae`.

The gallery pairs the resting and forced hover states for all eight card builders on this branch. Seven builders participate in the player-facing picker. The gallery also renders Soul sources, which the current picker never considers. The picker omissions under each match show the score and reason, including cards below the current interest floor of 18. Cards that the builders cannot supply get an N/A tile. Street Brawl has eight N/A tiles because the site disables Highlights for that mode.

## Open locally

1. From this repository, run `python -m http.server 8765 --bind 127.0.0.1`.
2. Open [the website gallery](http://127.0.0.1:8765/dev-cards.html) or [the in-game-width gallery](http://127.0.0.1:8765/dev-cards.html?width=ingame).
3. Use Website or In-game panel to switch skins, and expand Picker omissions under a match. The comparison scales both copies if the pair would exceed the available width. Resting only and Forced hover only show the cards at their native reference size and accept `?state=rest` or `?state=hover`.

The gallery is unlinked and marked noindex. It is **local only**. Cloudflare excludes `dev-cards.*` and the fixtures under `test/` via `.assetsignore`, keeping saved review data and the diagnostics route off the deployed site. Verified the exclusion syntax against Cloudflare's static-assets configuration documentation on November 20. [Cloudflare static-assets docs](https://developers.cloudflare.com/workers/static-assets/binding/#ignoring-assets)

## Saved match selection

Soul leads sum both teams' net worth at timestamps shared by the full lobby, from the selected player's team. The gallery uses the Highlights lead-series function. Kill totals use the saved scoreboard. The Playwright run checks the results, modes and classification thresholds from the fixtures.

| Match | Review slot | Classification from recorded data | Fixture |
| --- | --- | --- | --- |
| 136941488 | 8, Wraith | Stomp win in 29:40. Winning team never trailed after 5:00 and finished 48,214 souls ahead. | Existing `test/136941488.json` |
| 138427763 | 5, Lash | Comeback win in 47:54. The winning team fell 18,792 souls behind and finished 31,589 ahead. | November 19 audit, projected into `test/card-gallery/` |
| 137018749 | 6, Billy | Loss in 46:08. Billy's team led by as much as 8,825 souls and finished 32,829 behind. The production story reads “Thrown.” | Existing `test/137018749.json` |
| 139859134 | 4, Pocket | Quiet for kills and player highlights. 39 kills in 36:08 is 1.08 per minute, the lowest of the standard matches screened in the saved fixtures and local audit corpus. Pocket's Rival, Big moment, Lane and Lobby bests all score below 18. The team still won by 26,686 souls and the production story reads “Stomp.” | November 19 audit, projected into `test/card-gallery/` |
| 139609876 | 3, Vindicta | Street Brawl. Recorded game mode 4, eight players and 16:42 duration. | November 19 audit, projected into `test/card-gallery/` |

The three audit projections keep the original recorded scoreboard, card-relevant snapshots, death timings, award fields, Mid Boss timings and hero damage categories. They omit account IDs, coordinates, items, rank fields and other data the bento does not consume. Steam identities in Highlights come from an online profile lookup. The gallery uses the same hero-name fallback without contacting Steam.

## Shared code and sizing

- `app.js` exposes the roster setup used by both the full match page and the gallery's isolated match-page frame.
- `summary/summary.js` shares match preparation, candidate construction, the real picker, card and grid markup, and tooltip content. The inspection entry point returns the existing candidate and picker results before the gallery adds its labels and N/A tiles.
- The gallery uses `index.html?embed=1` for the 1560 × 912 in-game reference and the standalone match page for 1920 × 1080. Each selected card uses its measured production grid span and height. Omitted cards borrow a reference slot from that match's grid. Match story uses three columns and the second row where available. Other omissions use two columns and the final row.
- The gallery derives forced selectors and tooltip styling from the original CSS rules in their original cascade order. The forced sample uses the existing tooltip content renderer and places a representative tooltip under the card. Pointer or keyboard focus can select a different example. The stylesheet and share card source are unchanged.

## Check and screenshots

`node test/card-layout-check.mjs` starts a loopback static server and uses an already available Playwright package and Chromium. It tries a normal module install or the existing CLI cache. Set `PM_PLAYWRIGHT` to an existing Playwright package directory if needed. Set `PM_AUDIT_CHROME` only to override the browser executable. No npm command or download is needed on the review machine. The gallery checks are opt-in and exit 1 when they report findings.

The command prints the complete failure table and updates [the failure report](2026-11-20-card-gallery-failures.md). It checks both states and widths, scrolls each card into view, compares text fragments and card/viewport bounds, and uses scroll/client dimensions for internal clipping and line clamps. It allows the existing intentional one-line ellipses. The report is geometric, so a small font-metric overlap can register even where the ink looks separate. Playwright also checks the width toggle and compares forced styling with the real focus-within state. [Playwright screenshot docs](https://playwright.dev/docs/screenshots) · [Node test discovery docs](https://nodejs.org/docs/latest-v24.x/api/test.html#running-tests-from-the-command-line)

To recapture the four full images, twenty match crops and screenshot index:

```powershell
$galleryShots = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Deadlock Mods/Vault/Design Reviews/2026-11-20 Card gallery'
node test/card-layout-check.mjs --screenshots $galleryShots
```

The layout check recorded 120 findings across 124 rendered card states and 36 N/A tiles. Opened the website and in-game stomp captures and the in-game Street Brawl crop. Lobby bests visibly overlaps the headline and clips its last row in the stomp match.

The gallery also loaded through the documented Python server. `node --test` reported 29 passes and zero failures, with three existing opt-in checks skipped. `node test/score_test.js` passed all five scoring fixtures.

## What this gallery cannot show

- Live entrance motion, hover or tooltip timing, floating tooltip placement, or performance in Valve's embedded browser. The in-game images use the real embed skin in desktop Chromium.
- The hero overview, player-selection flow, cross-tab navigation or share-card canvas. This gallery covers the bento cards in isolation.
- Live usernames and the longer personalized strings they can produce, match events the fixtures lack, or every headline and branching variant across all players. The review fixes one player slot per match.
- Player-facing dimensions for cards the picker omits. Those cards have no production slot and use the reference sizes described above.

## How Zachary wants to work

Read the Vault Decisions note, `DESIGN.md` and the latest handoff first. Sketch the plan and get approval unless the brief already grants it. Use real recordings, keep design calls with Zachary, and use one reviewable change per visual round. Write directly with no em dashes. Stage files explicitly, keep credentials out of logs and Git, and ask before structural changes, installing dependencies, spending, sending, or changing remotes. This brief authorizes pushing only `codex/card-gallery`. Merges, deployments and pushes to `main` need separate approval.
