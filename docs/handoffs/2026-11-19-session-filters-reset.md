# Session-only filters

November 19, 2026. Branch `codex/session-filters-reset` starts at fetched `origin/main` commit `7b4ac8b`.

A fresh tab or browser session opens the saved profile with All standard games, no played-with or hero selection, All games for the sidebar range, and Queued with you for the Teammates card. Mode and played-with still survive a reload in the same tab. Hero, sidebar range and Teammates card selections still live in the current page. Explicit profile links can apply `mode`, `hero`, `with` and `withKind`. Existing match links still accept `tab`, `graph`, `pick` and `players`.

## Browser storage audit

| Key | What it stores | Decision |
| --- | --- | --- |
| `pm_me` | The account ID saved by profile setup, Save as me, or explicit `?me=` | Keep in `localStorage`. |
| `pm_companion_view` | The companion preview pairing token | Keep the existing Secure, HttpOnly, SameSite=Strict cookie. It stays session-only by default and gets a Max-Age when the user chooses Remember. |
| `pm_mode` | All, Ranked, Unranked, or Street Brawl | Move to `sessionStorage`. An explicit `mode` URL parameter takes priority. |
| `pm_with` | Profile ID, teammate account ID, and party or team scope | Move to `sessionStorage`. An explicit `with` URL parameter and optional `withKind` take priority. |
| `pm_recent_profiles` | Up to six recently viewed profile IDs, names and avatars | Keep in `localStorage` across browser restarts. The legacy cleanup preserves it. |
| `postmortem.markers` | Graph overlays, objective visibility and marker settings | Move to `sessionStorage`. |
| `postmortem.summary.hideNegativeTags` | Whether Summary hides negative tags | Move to `sessionStorage`. |
| `postmortem.perf` | Whether the performance display is enabled | Move to `sessionStorage`. |
| `pm_hero_art3` | Hero image URLs and a cache timestamp | Move to `sessionStorage`. Fresh tabs can re-request the asset manifest. |
| `dlhideout_test` | Test page timestamp of the first open and a count | Move to `sessionStorage`. The test page now checks reloads of the same Hideout panel. |

There are no IndexedDB writers or other cookies in the tracked site source. Hero, sidebar range, teammate list mode, sorting, and other view selections without storage keys remain page state or URL parameters.

The migration runs before application scripts on the profile, match, and Hideout test pages. It removes the seven legacy `localStorage` keys whose writers now use `sessionStorage`, without importing their stale values. The migration needs no version key and retries on later visits if storage was unavailable.

## Files changed

- `session-storage.js`, `index.html`, `profile.html`, `hideout-test.html`
- `profile.js`, `app.js`, `graph-markers.js`, `summary/summary.js`, `player-assets.js`
- `test/prelaunch-audit.test.js`, `README.md`, this handoff

## Verification

- The Chromium regression starts with the legacy keys and six recent profiles, saves the account through `?me=`, selects mode and Played with through the UI, and reloads the tab. It then opens an independent tab and restarts Chromium with the same browser profile to check that the account and capped recent list carry over and the filters reset.
- The URL regression checks that explicit mode, teammate, scope and hero parameters apply together and that clearing filters updates the URL.
- `node --test` passed all 28 tests with zero skips, including the saved 20-match audit corpus and Monday's K/D fixture. Scoring passed all five fixtures. The download tests used the repository Worker with a local Node asset binding configured from `_headers`.

## How Zachary wants to work

Read Vault Decisions and the latest handoff first. Get approval for each plan unless the brief already approves it. Keep design decisions with Zachary, use recorded data where the game is involved, stage explicit files, and keep credentials and local logs out of Git. This brief authorizes pushing `codex/session-filters-reset` only. Merges, deployments, and pushes to `main` require separate approval.
