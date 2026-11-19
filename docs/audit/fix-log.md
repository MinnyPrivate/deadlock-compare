# Prelaunch audit fix log

Source of findings and match IDs is the [November 19 prelaunch audit](2026-11-19-prelaunch-audit.md). The website branch started at `bf464fd`, the latest `main` with Summary. The companion work (`6832929`, `6d89339`) is in `C:\Users\zacha\postmortem-companion` on its own `codex/audit-fixes` branch from `d2118d2`.

## Findings

| ID | Status | Change or reason |
| --- | --- | --- |
| B1 | FIXED | Matchups pairs join Hard Crowd Control effects by name and show zero in a missing direction. Browser regression tests use different unknown effects on each side and verify the panel follows the selected pair across the saved matches. |
| B2 | FIXED | Kills and Deaths use event steps when the recorded counts reconcile. Otherwise, the graph uses recorded snapshots and the final scoreboard total at match end, with a caption explaining the mismatch. Summary preserves its measured snapshots and discloses marker counts that disagree with the scoreboard. Browser regressions cover the totals, caption and absence of invented event times. |
| B3 | SKIPPED | Unavailable estimates affect rankings, suggested awards, Summary copy, and partial rosters. See Needs Zachary. |
| B4 | FIXED | Matchups sums each non-hero dealer's right-aligned cumulative series. The browser test uses two dealers with different snapshot lengths. |
| B5 | SKIPPED | Low severity. Unknown item marker treatment is outside this pass. |
| R1 | FIXED | Official requests have a ten-second deadline across both headers and body. An unpaired visitor gets Retry, and the paired flow can continue waiting for Valve data. Starting a new load cancels the old match's requests. The browser stalls headers and body separately and recovers both through Retry. |
| R2 | FIXED | Salts and metadata have independent consecutive-failure counters. The browser test returns valid salts and five metadata errors, then checks that automatic polling stops with Try Now. |
| R3 | SKIPPED | Low severity. The elapsed-time display after the typical wait is outside this pass. |
| R4 | SKIPPED | First-load retry affects the native postgame panel and needs controlled Panorama verification. See Needs Zachary. |
| R5 | SKIPPED | Format handling spans the roster, normalization, scoring and optional graphs. See Needs Zachary. |
| R6 | FIXED | An unknown hero keeps their roster ID and uses the all-hero baseline. Known heroes retain existing swap inference. Browser regression and the existing scoring fixtures verify both paths. |
| R7 | FIXED | Profile history renders while Steam identity is pending. The name and avatar update without rebuilding the match list. The browser delays Steam and asserts both stages. |
| U1 | FIXED | **Find a player** on the standalone landing page opens existing Steam-name search. Browser coverage follows a search result to its history with the companion endpoint paused. |
| U2 | FIXED | Eligible standard matches default to Summary. Explicit tabs, graph links and manual tab choices are respected. Brawl and early previews keep their fallbacks. Browser regressions cover each path, including Summary opening after an eligible preview swaps to official. |
| U3 | SKIPPED | Empty selection and username-first behavior require coordinated changes to Matchups and MVP. See Needs Zachary. |
| U4 | FIXED | MVP marks calculated points as estimates and labels the recorded awards as Valve's. The browser test checks both labels. |
| U5 | FIXED | Selecting an MVP row restores focus to its replacement after rendering. The browser regression checks the selected slot retains focus. |
| U6 | SKIPPED | Low severity. Announcing the official swap through a live region is outside this pass. |
| U7 | SKIPPED | Low severity. The fallback action in Matchups requires choosing a destination. See Needs Zachary. |
| U8 | SKIPPED | Low severity. Updating the native entry and verifying it in the game are outside this pass. |
| P1 | FIXED | The page validates the account hint, holds it in memory for the current match, and removes it from the address using history replacement. Browser tests verify the correct player, invalid input, preservation of other URL fields and a clean Copy link. |
| P2 | FIXED | The companion's generated settings and pilot checklist describe which match fields are sent to Postmortem, operator and paired viewer access, the six-hour expiry, D1 recovery and opt-out/unlink. The real `--init-config` integration test verifies the bundled disclosure and local-only defaults. [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/) |
| I1 | FIXED | The website is the entry for ordinary friends. The app docs and generated config label the supervised two-account pilot. Companion tests verify an outside account is refused, and the browser verifies website lookup with the pilot paused. Widening enrollment is a separate decision. |
| I2 | FIXED | `tools\build-offline.ps1 -Package` writes a ZIP into `bin` containing both binaries from the same locked release build. Build verification checks both archive entries and hashes. An independent smoke test extracted the ZIP and ran the packaged companion's isolated `--init-config`. |
| I3 | FIXED | New configs use the disconnect trigger and capture after returning to Hideout. The real CLI test checks the default and confirms config initialization preserves an existing file. |
| I4 | FIXED | The companion README documents the existing default Steam path, the small remediation offered in the audit. Automatic discovery for other libraries remains a separate change. |

## Earlier findings retested in the report

| Earlier finding | Status | Disposition |
| --- | --- | --- |
| External `src` injection, empty `players`, missing tooltip series, and stale request timer | FIXED | Already fixed on `main` as recorded in the audit. The match request and entry regressions also exercise the current paths. |
| Source 12, crowd control and Souls wording, 30:00 tick, and one-player Matchups | FIXED | Already fixed on `main` as individually recorded in the audit. B1 fixes the separate crowd control rendering defect. |
| Wrong match accepted by native overlay | FIXED | Already fixed on `main`. First-load offline behavior remains R4. |
| K/D totals, estimated points, consecutive metadata errors, MVP keyboard focus, world damage and unknown heroes | FIXED | See B2, U4, R2, U5, B4 and R6 for the individual fixes and regressions. |
| Matchups/MVP selection, elapsed wait, silent swap, missing tables or stats, unknown purchases, malformed metadata and Compare name | SKIPPED | See U3, R3, U6, U7, B3, B5, R5 and U8 for the individual reasons. |
| Original early-data ETA and reordered-slot preview replacement | FIXED | The ETA was removed before this audit. The slot, hero and team guard was already in `main`. |
| Former PR 23 public relay and old graph/merge-order work | SKIPPED | Those paths or plans were superseded before this audit. Local workerd, D1 and Chromium exercised the current private preview lifecycle. |
| Group size, contrast, archive statistics and existing Mid Boss work | SKIPPED | The audit reports measurements or planned work here. There is no newly confirmed defect to fix in this pass. |

## Needs Zachary

- **B3 and R5.** Decide how a partial record should affect the estimate and ranking, what roster errors should block a match, and which unavailable stats should be explained in Summary, MVP and Graphs.
- **R4 and U8.** Reserve a separately approved native run for the first-load retry and the entry rename. This audit used saved data and browser checks.
- **U3 and U7.** Confirm how the empty Matchups and MVP panels should introduce the lobby, and where the missing-matrix action should take the visitor.
- **I1 and I4.** The supervised pilot and documented Steam path are the current launch boundary. Widening enrollment and supporting other Steam libraries need separate decisions.
- **Security checks in section 2.** GitHub 2FA, Cloudflare 2FA, and `main` branch protection are SKIPPED operator checks. Production rate-limit enforcement and native pairing remain unverified. Do the account checks before public release.

## Verification

- Website regression suite uses Node 24 and installed Chrome. From the website repo run `node --test test/prelaunch-audit.test.js test/score_test.js test/summary.test.js`. Set `PM_AUDIT_MATCHES` to the `matches` folder from the audit evidence and `PM_AUDIT_MONDAY` to the saved `136949669.json` from the previous audit for the full corpus replay.
- All 20 matches in the audit table and the earlier `136949669` K/D case passed using saved official metadata. The sweep checked 180 Summary portraits and their stat controls, 575 graph renders, 5,100 Matchups pair selections, and 620 MVP selections. Kills and Deaths endpoints matched the scoreboard. Summary opened by default for all 15 eligible standard matches and stayed disabled for all five Street Brawls. Abrams ends at 5 kills in `139609876`, and slot 3 ends at 11 kills in `136949669`.
- Companion `tools\build-offline.ps1 -Test -Pilot -Package` passed 74 Rust tests and produced `bin\postmortem-companion-windows-x64-20261119-013126-4d3bea24.zip`. Archive verification and isolated CLI smoke passed. The existing denied-account CLI test attempted to open the default console log before refusing capture. It reported no reader launch. No game files were changed.
- The local workerd, D1 and Chromium lifecycle suite passed against an isolated copy of the website and saved Brawl/6v6 captures. It covered paused and opted-in uploads, pairing, expiry, private views and official replacement.

## How Zachary wants to work

Read the Vault Decisions and newest handoff first. Sketch the scope and wait for approval unless the brief already gives it. Bring design or large changes back as numbered choices with a recommendation. Keep fixes in the approved repos, test with saved data, commit named paths, and exclude secrets and local logs. This pass authorizes the audit branch and excludes merging, deploying, pushing to `main`, changing hero colors or editing the game install.
