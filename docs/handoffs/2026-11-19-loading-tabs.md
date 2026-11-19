# Match tab loading

November 19, 2026. `codex/loading-tabs` starts from `origin/main` at `a41a1e9`.

- While Valve data is pending, the match page opens on Summary. A companion preview fills it with available stats. Before any match data arrives, the existing wait screen shows the status. Sparse and Street Brawl previews show their recorded scoreboard values without estimated grades.
- Graphs, Matchups and MVP use disabled buttons with a loading description and a spinner that stays still with reduced motion. They unlock together because Valve delivers their data in one metadata response. Direct `?tab=` links open automatically on that response. An eligible Summary keeps the selected player when the roster still matches.
- The four screenshots under `docs/screens/loading/` show website and `embed=1` mode at 1920 × 1080 and 1920 × 996 respectively. Chromium replayed saved companion and Valve data for match `136527656`. The existing companion button overlaps the bottom of the phase panel in both paired views. The in-game browser itself was not run.
- All 21 tests passed, including the full saved-match audit corpus and the download route checks against local Wrangler. `node test/score_test.js` passed all five score fixtures.
- The Chromium regression uses the checked-in match fixture by default. To regenerate screenshots, set `PM_LOADING_SCREENSHOTS` to `docs/screens/loading` and run `node --test --test-name-pattern="match tabs wait for Valve" test/prelaunch-audit.test.js`. The optional `PM_LOADING_PREVIEW` and `PM_LOADING_OFFICIAL` paths let the same test replay a matching pair of saved capture and metadata files.

## How Zachary wants to work

Read the Vault Decisions note and newest handoff first. Sketch each phase and wait for approval unless the brief already gives it. Leave visual and architectural choices with Zachary, use saved match data first, stage explicit paths, and keep local captures and credentials out of Git. This brief authorizes pushing `codex/loading-tabs` to GitHub. Merging, deploying and pushing to `main` require separate approval.
