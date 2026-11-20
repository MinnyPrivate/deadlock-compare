# Fast match loading

November 20, 2026. Branch `codex/fast-match`, based on `78874ae`.

## What changed

- A linked browser sees “Reading your match from the app” once its session is confirmed. The ordinary Valve checks keep running during this time. At 25 seconds without a copy, the existing wait screen takes over with its elapsed time intact. An unlinked browser goes straight to the existing wait.
- The app copy opens Highlights on the viewer. Available stats and the existing estimated lobby placement stay visible. Missing fields get short markers in the relevant card or header. The source label explains that Valve data will replace the copy.
- Graphs, Matchups, MVP and the corresponding shortcuts in Highlights stay locked until Valve data arrives. Graphs says “Accurate graphs coming.” Highlights keeps its existing summary visuals. The Graphs tab draws nothing from the upload.
- The paired control sits at the top right, clear of the match content. The first app copy and the official swap skip the usual Highlights entrance motion. The swap holds the hero column and populated card positions when the same cards can be filled. A sparse copy can gain cards when the full file appears.
- The swap restores the selected player, keyboard target and scroll position wherever the official content still has a matching target. A direct tab link still opens its requested tab when it unlocks. A matching swap announces “Updated with official Valve data.” A mismatch quietly uses Valve data. A temporary failure fetching the official file leaves the app copy in place while the page retries.
- Only a linked viewer gets the fast copy. Installing the app alone is insufficient. Enter the app's six-character code in each browser or overlay where you want the fast view.

## Upload fields audited against Highlights and the header

| Field | What the saved upload can show |
| --- | --- |
| Names | The schema excludes `players[].account_id`. The hero name identifies the portrait and card until the Valve file supplies the account ID for the Steam name lookup. |
| Ranks | The schema allows `player_rank_data.initial_display_rank` and `average_badge_team0/1`. The replay has no individual ranks and its team averages are zero. Player, team and lobby rank markers occupy their usual areas. The official replay also has no usable rank and resolves the player card to Unranked. |
| MVP and accolades | The schema allows `mvp_rank` and `accolades[]` with ID, value and tier. Both saved captures include accolades for all players and MVP ranks for the award recipients. Omitted ranks for other players in a populated roster yield no award badge. A copy missing all MVP award information or any accolade list gets a marker by the estimate or the sparse scoreboard. The lobby place remains an estimate. The Valve-only `not_scored` flag is applied when the official file comes in. |
| Scoreboard, items and lane | The projection carries K/D/A, souls, last hits, denies, lane, item purchase and sale details, duration and result. It carries the snapshots used for damage, healing, objective damage and lane comparisons. When a sparse upload omits values, the page shows pending text or keeps the affected comparison out of the preview. |
| Deaths | The projection carries `game_time_s`, `killer_player_slot` and `death_duration_s`. It excludes `time_to_kill_s`, `death_pos` and `killer_pos`. Recorded kills and deaths can populate Highlights. The opponent card waits for time to kill where it applies. Incomplete basic death records get pending markers for the opponent card and death timeline. Positions are part of the locked graph details. |
| Opponent damage | The schema excludes `damage_matrix`. The opponent card shows a pending marker where the damage comparison goes. The Matchups tab waits for the full file. |
| Objectives and paths | The projection carries objective ID, team and destruction time, Mid Boss times and teams, and aggregate `stats[].boss_damage`. It excludes `match_paths`, the objective masks, and the objective fields `legacy_objective_id`, `first_damage_time_s`, `creep_damage`, `creep_damage_mitigated`, `player_damage`, `player_damage_mitigated` and `player_spirit_damage`. Highlights can show recorded Mid Boss times and aggregate objective damage. Graphs waits for the full file. Existing estimated-assist wording still applies. |
| Souls sources | The schema includes `gold_sources` and `gold_death_loss`. Older flat source counters used by other views are outside this projection. Highlights does not render its unused souls-source card. The Graphs and MVP breakdowns wait for Valve. |

## Files and verification

- `app.js`, `companion-preview.js`, `index.html`, `style.css`, `summary/summary.js`, and `summary/summary.css` contain the browser changes.
- `test/prelaunch-audit.test.js` covers direct tab links, sparse uploads and Street Brawl. It can use the installed Playwright Chromium driver for its existing browser checks.
- `test/fast-match.test.mjs` replayed `match_136527656_converter.json` from `Data/app_phase2` and `match_136527656_api.json` from `Data/app_poc`. It paired through the browser form using a locally generated code, reloaded the linked browser, posted the gzipped projection, and ran the actual repository Worker verifier against a local SQLite D1 adapter and the saved Valve file. Browser requests to Deadlock API were stubbed. “Player 11” and similar names in the official frames are fixture aliases. The test clock covers the 25-second fallback and poll schedule.
- The regression asserts pending fields, disabled controls, no Graphs chart, reduced motion, the unchanged ordinary wait markup and first request, a quiet mismatch, a retry when the official fetch is unavailable, and preserved selection, focus, scroll and card geometry in both modes.
- Set `PM_FAST_PLAYWRIGHT` to the installed Playwright package, `PM_AUDIT_CHROME` to the Chromium executable if needed, and `PM_FAST_CAPTURE`, `PM_FAST_OFFICIAL`, and `PM_FAST_SCREENSHOTS` to replay the saved capture and regenerate the images with `node --test test/fast-match.test.mjs`. The test uses checked-in match metadata if no capture is supplied.
- The full suite uses `PM_AUDIT_MATCHES` for the saved match corpus, `PM_AUDIT_MONDAY` for match `136949669`, and `PM_DOWNLOAD_TEST_ORIGIN` for the local download route. The download checks used the repo Worker with a local static asset binding that read the download headers from `_headers`.
- `node --test` passed 35 tests with zero skips, including the 20-match audit and Monday's K/D replay. The separate `node test/score_test.js` run passed all five score fixtures.
- The linked worktree's Git index was read-only in this session. The commit uses a temporary index and branch metadata with the same base and working files. The linked worktree's local branch still points to its original commit.
- The screenshot index is in the Vault under `Design Reviews/2026-11-20 Fast match/INDEX.md`. Website captures are 1920 × 1080. Embedded captures are 1920 × 996.

## Visual review

8/10. The wait states share a visual anchor, the lock notices fit under their tabs, and the unlink button clears the content. The repeated rank markers make the header busier than the official view. The embedded game browser still needs a visual check.

1. Pending rank wording. A (rec) Keep the explicit labels at each rank. B. Use “Rank pending” in the team header. C. Show one shared rank note in the header. D. Keep the details on hover.
2. Official confirmation. A (rec) Leave the quiet confirmation in the source slot until the next match. B. Clear it after a few seconds. C. Use a small icon and text. D. Use an announcement for screen readers only.

## Live match checks still open

- Link inside Deadlock's browser and check whether its cookie persists across overlay close and reopen, a second match, and a game restart with “Remember this viewer.”
- Measure time from match end to the app copy and then to the Valve swap under the real polling schedule.
- Verify that the real companion reads and uploads only after disconnect or return to the Hideout, and that the upload reaches the linked overlay. The saved replay proves the web flow with the existing upload format. Live app execution and the game's browser were outside the replay.

## How Zachary wants to work

Read Vault Decisions and the newest handoff. Plan first and wait for Zachary's explicit yes unless he approved the plan in the brief. Give design decisions as numbered items with A to D options and exactly one marked (rec). Work in capped taste rounds with one change, a screenshot from the agreed camera, and an honest assessment. Use plain language and no em dashes. Commit only explicit files. Use the backup remote only when Zachary says. Flag any cost before proceeding. Get approval for pushes, merges and deployments unless expressly authorized in the brief.
