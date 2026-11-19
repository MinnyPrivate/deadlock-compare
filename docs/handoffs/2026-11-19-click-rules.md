# Player click rules

November 19, 2026. `codex/click-rules` starts at fetched `origin/main` commit `8782785`.

| Player action | Before | After |
| --- | --- | --- |
| Profile match row, teammate | Plain click filtered to party when you queued together for that match, otherwise same team. Ctrl or Cmd used the browser's new-tab behavior. | Click or Enter opens the player in the same tab. Ctrl or Cmd filters with the original party or team rule. |
| Profile match row, opponent | Click opened the player's profile in the current page. Ctrl or Cmd also went through that route without filtering. | Click or Enter opens the player in the same tab. Ctrl or Cmd filters to matches where you shared a team. |
| Profile match row, current profile or bot | The current profile was a label. A bot could link to an invalid account. | Both display as labels. Links require a valid account ID. |
| Teammates win-rate rows, including best, worst and expanded lists | Plain click filtered by the list's party or team scope. Ctrl or Cmd used the browser's new-tab behavior. | Click or Enter opens the player in the same tab. Ctrl or Cmd applies the original list scope. |
| Played with picker, teammate row (formerly `data-pick`) | Click and Enter selected the filter in the picker. | Click or Enter opens the player in the same tab. Ctrl or Cmd applies the picker scope and returns focus to Played with. |
| Played with picker, linked name in its footer | Plain click opened the profile in place. Ctrl or Cmd used the browser's new-tab behavior. | Click or Enter opens the player in the same tab. Ctrl or Cmd applies the active filter scope. |
| Profile search results and recent profiles (formerly `data-id`) | Clicks went through the same-tab profile route, including modified clicks. | Click or Enter opens the player in the same tab. Ctrl or Cmd opens the saved profile with the same-team filter, or carries the filter to account setup if needed. |
| Match Summary name and MVP detail heading | Static text. Portraits and selection rows switched the viewed player. | The heading links to the selected player's profile when an account ID is available. Ctrl or Cmd opens the viewer's profile with `with=<player>` and `withKind=team`. |
| Match page Back to profile, from a profile match row or recent form tile | Website-only Back control with an origin-profile URL fallback. | Available on the website and in embed mode. Browser Back restores the previous profile when it opened the match. Ctrl or Cmd with click or Enter uses the match page's viewer filter rule when the player ID is known. |
| Match Summary portraits, leaders, lane faces, rivals and Compare with | Selected a player or set up a comparison. | Selects a player or sets up a comparison. |
| Match top portraits, Matchups headers, cells and side portraits, MVP list, and Graphs or Lanes player controls | Changed the selected player, pair, lane or graph selection. | Changes the selected player, pair, lane or graph selection. |
| Profile charts and the Played with toolbar button | Charts showed summary statistics or opened matches. Played with opened the picker. | Charts show summary statistics or open matches. Played with opens the picker. The Teammates win-rate rows are the clickable per-player entries. |

Ctrl or Cmd also works with Enter. Ordinary website anchor middle clicks and the browser context menu keep their native behavior. The match page uses the identified viewer, then the saved account or the profile the match came from. When it has none of those IDs, the filter URL carries through profile setup.

## In-game behavior

- `?embed=1` and `?ingame=1` both activate game mode. Generated links carry `embed=1` and preserve the Hideout sequence when provided.
- A profile opened from the match panel continues sending its original match heartbeat. This also covers opening a different match from that profile, so the game watchdog still sees the match ID it is watching. The profile's Back to match link returns to the source match in the same mode. Native browser Back follows the visited pages. The in-panel return link opens the source match by ID because match pages suppress referrers.
- In game, all elements use the default arrow, including text inputs. The Hideout typing test still passes. On hover, clickable elements get a one-pixel inset outline in the profile accent or the match page's cream. The highlight uses no transition, filter or animation. Existing focus rings keep priority. The website keeps its hand and hover styles.

## Screenshots and verification

- [Embed teammate hover at 1920 × 1080](../screens/click-rules/embed-hover.png)
- [Website teammate hover at 1920 × 1080](../screens/click-rules/website-hover.png)

Both captures show the same teammate row and were opened for visual inspection. The browser tests use the recorded match `137018749` for the roster, with fixture profiles and test names. Set `PM_CLICK_SCREENSHOTS` to an output directory and run `node --test --test-name-pattern="the hand" test/prelaunch-audit.test.js` to regenerate them.

The browser regression exercises native mouse and keyboard input, same-tab history, same-team and party results, the embed cursor and hover, and the title heartbeat. It checks the browser's page count, instruments `window.open`, and checks rendered player-link attributes.

`node --test` passed all 33 tests with zero skips, including all 20 saved audit matches and Monday's K/D fixture through `PM_AUDIT_MATCHES` and `PM_AUDIT_MONDAY`. All five scoring fixtures passed. The download integration cases used the repository Worker with a local Node asset binding that reads `_headers` and `.assetsignore`. Browser and heartbeat checks ran in desktop Chromium. Deadlock itself was outside this test run.

## Overlap with the embed art branch

In base `profile.css`, the cursor rule at line 441 and match-hover rule at line 447 bracket lines 443 through 445, where `codex/ingame-art-backdrop` edits the art and effects. The cursor and filter overrides now live in `postmortem-embed.css`. The match tint and Back to match styling sit in the marked click block at the end of `profile.css`. Preserve the art branch's backdrop rules when resolving that area. In `profile.js`, the changed `matchHref` is two lines above the art branch's `applyTheme` edit. In `profile.html`, both branches add markup or imports near the backdrop.

## How Zachary wants to work

Read Vault Decisions and the latest handoff first. Sketch the plan and wait for explicit approval unless Zachary has already approved it in the brief. Keep design calls with Zachary and use recorded game data for game-facing work. Stage files by name and keep credentials and local logs out of Git. This brief authorizes pushing only `codex/click-rules`. Merges, deploys and pushes to `main` require separate approval.
