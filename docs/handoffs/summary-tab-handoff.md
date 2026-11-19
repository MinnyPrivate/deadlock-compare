# Summary tab handoff

November 18, 2026 · `codex/summary-tab` · base `d42dd52` · PR pending

The implementation and screenshots are in the working tree. The current run used the existing branch and left Git metadata and the Vault untouched. Claude can commit the changes, push the branch, and open the PR to `main` using the text below. Leave it open for review. The repository's `main` branch auto-deploys.

Read the November 18 Vault Decisions note, `DESIGN.md`, the source percentile README, and the local round 4 reference. The copied percentile table matches the source file byte for byte.

## Verification

- `node test/score_test.js` passed all five match fixtures. `node --test test/summary.test.js` passed all seven tests.
- Chromium checked all 12 portraits in match `137018749`, the explicit and saved account defaults, the top-left fallback, the chart controls and flat-average fallback, the score and distribution tooltips, Copy link, and the existing Graphs, Matchups, MVP, and Profile views. It also checked that Summary waits for the full match when a companion preview is present. A mocked Steam lookup verified username escaping and ellipsis. The tooltip stayed on screen at 1280 × 720.
- The four PNGs were captured at 1920 × 1080 and reviewed visually. The in-game screenshots use Chromium in embed mode. The captures use the local card art and hero-name fallback. Asset selection and error fallback were checked with mocked responses. Live art delivery and the actual in-game browser remain to be checked.
- The saved match has no player-attributed objective hit timestamps or friend list. The chart reports the objective timing gap and shows only the recorded kill and death events it can attribute. Friend markers need a separate source. Billy's last recorded snapshot has 15 kills and the scoreboard has 17. The last dot uses 15, and the benchmark uses the scoreboard's 17. The supplied table puts that at better than 97% of 1,502 ranked Billy games, with a median of 6.
- The round 4 strip follows overall estimated Valve score and displays MVP or KEY only where Valve recorded the award. The exact-time fight rule uses map-plane distance and requires coordinates. `Compare with…` opens the existing two-player Souls graph.

## How Zachary wants to work

Sketch the plan and wait for Zachary's go before building. Follow the Vault Decisions note and `DESIGN.md`. Keep writing direct and use no em dashes. On visual work, make one reviewable change at a time and show the agreed camera. Keep added paths explicit when committing. Ask before destructive work, dependency installs, pushes, PRs, merges, deployments, spending, or sending anything. Use the approved branch and preserve Zachary's design choices. The public-release audit already called for in Decisions should include the art host allowlist and the share link's account-ID handling.

---

## PR title

Summary tab (round 4 layout)

## PR body

Adds Summary as the first match tab. It opens on your saved or supplied account when that player is in the match, with the top-left portrait as the fallback. Selecting another portrait switches the card, stats, chart, lane, rivals, and phase bars together.

- Adds the match strip, username-led hero card, six hero percentile cards, and keyboard-accessible score explanations.
- Draws the standout stat from recorded snapshots against the same hero's averages. Stat cards and the chart controls switch the graph. Exact kill and death timestamps mark the timeline, and nearby deaths use the tested fight rule.
- Uses the Valve backdrop in the embed and shares Profile's backdrop on the website. Includes the final build, three-star accolades, Copy link, and a shortcut to the existing comparison graph.

The fixture has no player-attributed objective hit times. The graph shows the available events and calls out that limit. The screenshots show hero-name and normal local art fallbacks.

Deferred work includes the Everyone view, the early/loading Summary, multi-hero Summary compare, and the shareable image.

### Decisions

- **D1 A.** Make the 1200 × 630 shareable card and match link a separate phase 2 PR.
- **D2 A.** Use gloat art for the top three by estimated Valve score, critical art for the bottom three, and normal art for everyone else. Use the local normal card when art is unavailable.
- **D3 A.** Use coarse percentile buckets on cards and give the ranked sample size, median, dates, and exact whole-percent comparison on hover or focus.
- **D4 A.** Show a dashed final hero average with a caption when per-time averages are unavailable.

### Screenshots

- [Loss in-game layout](https://github.com/MinnyPrivate/deadlock-compare/blob/codex/summary-tab/docs/screens/summary/1_loss_ingame.png)
- [Win in-game layout](https://github.com/MinnyPrivate/deadlock-compare/blob/codex/summary-tab/docs/screens/summary/2_win_ingame.png)
- [Loss website layout](https://github.com/MinnyPrivate/deadlock-compare/blob/codex/summary-tab/docs/screens/summary/3_loss_website.png)
- [Why this player placed fifth](https://github.com/MinnyPrivate/deadlock-compare/blob/codex/summary-tab/docs/screens/summary/4_hover_why.png)

### Tests

`node test/score_test.js` and `node --test test/summary.test.js`. The saved fixture was also checked in Chromium for the default player, portrait and stat switching, hover and keyboard focus, comparison, sharing, and both layouts.
