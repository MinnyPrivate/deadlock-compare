# Postmortem prelaunch audit | November 19, 2026

| Area | Decision for the friends launch | Highest severity |
| --- | --- | --- |
| Match pages | Fix Hard Crowd Control pairs first. The detail panel silently kept showing the previous selection in 13 of 20 matches. One Brawl graphed 10 kills for a player credited with 5. | High |
| Security | The private upload lifecycle worked locally. No credential signatures were found in the scanned Git objects. Zachary still needs to verify three account controls. | No new confirmed security defect |
| Performance and resilience | Match tabs first rendered in 256 to 362 ms locally. A pending official request can leave a visitor on Loading with no retry. | High |
| First visit | A fresh visitor at the site root has no visible route to player lookup. All 15 standard match links opened on an empty graph. | High |
| Privacy | Dry-run made zero upload requests. The match URL retained the supplied account ID, and the generated opt-in config omits the retention explanation. | Medium |
| Installation | The site can be shared independently. The companion's two-account pilot cannot capture an ordinary friend's games. The documented `bin` directory also lacks its reader. | High for companion distribution |

**Launch judgment.** Fix the broken matchup panel and give friends a working entry into player lookup before sending the bare site URL. Until then, a direct profile link gets a friend past the landing-page dead end. Treat the app as a supervised pilot. No Critical finding was confirmed.

**Revisions and evidence.** Remote website `main` was `bf464fdc056c34f4b3a44419520ebfa1f6da3148`. PR 40 had already merged `codex/summary-tab` (`ee583f1`). Git reported identical trees. The companion's local `main` was `d2118d25821ff13cecd78773ec69ed09475fe615` with no `origin` configured. File references below use those revisions. The November 18 Decisions note and its “Decided but not built” companion set the expected behavior. The November 16 report and its scratch cases supplied the regression baseline. All screenshots and JSON are local audit evidence outside the repository. [Evidence directory](../../../audit-evidence-2026-11-19/)

### Monday findings retested

| Monday finding | Disposition | Current check and disposition of the work |
| --- | --- | --- |
| External `src` injection | FIXED | A nonlocal `src` was ignored, no request went to the supplied host, and the requested real match loaded. `app.js:373`. |
| K/D graph differs from scoreboard | STILL REAL | Replayed Monday's match 136949669. Slot 3 ends at 12 events versus 11 scoreboard kills. Also reproduced in this week's Brawl. B2 below, already in the Vault. |
| Empty `players` selects slot zero | FIXED | `players=` left selection null on a loaded match. `app.js:654`. |
| Hover drops represented players | FIXED | The Souls tooltip showed both supplied series at 26:32. All available series with a sample are passed into the readout. `app.js:1383`. [Hover](../../../audit-evidence-2026-11-19/screens/graph-hover.jpg) |
| Old failed request cancels the new timer | FIXED | Rejected the older pending check after starting a newer wait. The newer timer identity survived. `app.js:521`. |
| Source 12 / crowd-control labels and Souls wording | FIXED | Source 12 reads Breakables, hard crowd control and slows have separate controls, and the souls component chart says the amounts do not add up exactly. `app.js:56`, `app.js:58`, `matchups.js:93`. This verifies labels only. |
| Long graph loses 30:00 tick | FIXED | The rendered SVG contained 30:00. Current long single-chart spacing is ten minutes. `app.js:1216`. |
| Overlay accepts the wrong match / first-ever offline | FIXED / STILL REAL | The current match-ID check rejects a mismatched three-field title at `mod/panorama/scripts/dlcompare_overlay.js:317`. Monday's no-title simulation on current source still marked the panel ready after one load. R4. |
| PR 23 shared key, malformed gzip, wrong embedded ID, first-writer poisoning, null-preview crash, hung public relay | STALE | That public relay and its early renderer were replaced. The current route bounds decompression, validates roster/ID and restricts reads to a paired viewer. The private fetch has a four-second timeout. `companion/metadata.mjs:43`, `companion/metadata.mjs:102`, `companion-preview.js:16`. See the local lifecycle result in section 2. |
| PR merge-order conflicts and draft Graphs plan questions | STALE | PRs 19/22 are integrated and PR 23 was superseded. The November 18 Swing decision supersedes the old six mockups. No conflict-resolution or graph-redesign work is counted here. |
| Matchups lobby-first and MVP interpretation | STILL REAL | Opened each tab with no selected player. Matchups filled 36 cells and picked Graves. The default MVP mode still labels the estimate Valve. U3/U4 are existing planned work. |
| Wait loses elapsed time past 110 seconds | STILL REAL | At 120 seconds the countdown remained, but elapsed time disappeared. R3. |
| Early-data “about a minute” promise / silent swap | STALE / STILL REAL | The current preview has a persistent source label with no ETA. The official swap hides it and leaves no announcement. U6, already planned. |
| Missing tables and missing stats become zero | STILL REAL | Missing matchup matrix gave a message with no next action. Missing Warden snapshots produced numerical penalties. U7 and B3. |
| Native entry says Compare | STILL REAL | The native hover still says Compare in `mod/panorama/scripts/dlcompare_overlay.js:337`. U8 is already planned. |
| Scratch cases beyond the unfinished narrative | Mixed, by case | **FIXED** for a one-player Matchups page, now “Both teams need player data” (`matchups.js:151`). **STILL REAL** for consecutive metadata errors (R2), keyboard focus loss (U5), non-hero damage overwrite (B4), unknown item omission (B5), unknown hero grading and malformed optional data (R5/R6). The successful reordered-slot swap remains guarded by slot, hero and team (`app.js:653`). Ordinary lane detail still renders. |
| Group size, art/contrast measurements and archive statistics | STALE as launch findings | Monday measured control counts, colors, group sizes, item-sale candidates and Mid Boss ownership. These measurements alone do not establish new bugs. Existing graph, item and STOLEN work remains on the Vault list. |

[Original review](<C:/Users/zacha/OneDrive/Desktop/Deadlock Mods/Compare overlay/Data/codex_review_2/report.md>) · [Retests](../../../audit-evidence-2026-11-19/diagnostics.json) · [Additional Monday cases](../../../audit-evidence-2026-11-19/extra.json) · [Missing-data cases](../../../audit-evidence-2026-11-19/cases.json)

## 1. Bugs over 20 matches

Wrangler 4.164.0 served a detached copy of current main on loopback. Chrome opened real `/?match=ID` pages at 1440 × 900. The 20 below are 15 standard matches and five Street Brawls from the two requested players' recent API histories. A separate metadata download captured the source data. A 47:54 game included an 18.8k-soul comeback. A 25:16 stomp ended 50.8k ahead, with no recorded deficit. Those labels also appeared in Summary. [Comeback](../../../audit-evidence-2026-11-19/screens/comeback.jpg) · [Stomp](../../../audit-evidence-2026-11-19/screens/stomp.jpg) · [Run output](../../../audit-evidence-2026-11-19/matrix.json)

The sweep covered every available match tab, every Summary portrait and its six stat controls, graph types, graph and marker hovers, visible native title text, all enabled Matchups stat/time choices and opponent cells, and MVP modes/rows. It exercised 91,217 Summary tooltip events, 1,511 marker events, 560 chart hovers, 5,100 pair clicks and 620 MVP row selections. Counts include repeat controls across states. Native tooltip text was inspected from the element title; screen-reader speech and native-game hover rendering were outside this browser run. Summary was disabled on all five Brawls. All had eight MVP rows and Raw/Impact modes, as intended. All seven Summary unit tests and five scoring fixtures passed.

### Match run

The last column records match-specific discrepancies. U2 (standard links opening on Graphs) applied to every 6v6. U3/U4 describe shared tab behavior. “Clear” means no additional match-specific discrepancy in these checks. B1 screenshots show the stale panel immediately after the click.

| Match ID | Account | UTC date | Mode | Length | What broke / screenshot |
| ---: | ---: | --- | --- | ---: | --- |
| 139859134 | 242410987 | 2026-11-18 | 6v6 | 36:08 | B1, Graves / Haze [screen](../../../audit-evidence-2026-11-19/screens/pair-139859134.jpg) |
| 138427763 | 242410987 | 2026-11-16 | 6v6 | 47:54 | Clear. [comeback](../../../audit-evidence-2026-11-19/screens/comeback.jpg) |
| 138410817 | 242410987 | 2026-11-16 | 6v6 | 38:36 | Clear |
| 138395412 | 242410987 | 2026-11-16 | 6v6 | 30:52 | Clear |
| 138189026 | 242410987 | 2026-11-15 | 6v6 | 43:04 | B1, Nurse Harrow / Lash [screen](../../../audit-evidence-2026-11-19/screens/pair-138189026.jpg) |
| 138163242 | 242410987 | 2026-11-15 | 6v6 | 37:33 | B1, Venator / Paige [screen](../../../audit-evidence-2026-11-19/screens/pair-138163242.jpg) |
| 138104330 | 242410987 | 2026-11-15 | 6v6 | 36:41 | Clear |
| 137683794 | 242410987 | 2026-11-15 | 6v6 | 31:13 | B1, Graves / Calico [screen](../../../audit-evidence-2026-11-19/screens/pair-137683794.jpg) |
| 137665238 | 242410987 | 2026-11-15 | 6v6 | 25:16 | B1, Graves / Rat King [screen](../../../audit-evidence-2026-11-19/screens/pair-137665238.jpg). [stomp](../../../audit-evidence-2026-11-19/screens/stomp.jpg) |
| 137627512 | 242410987 | 2026-11-15 | 6v6 | 29:23 | B1, Venator / Ivy [screen](../../../audit-evidence-2026-11-19/screens/pair-137627512.jpg) |
| 137607197 | 242410987 | 2026-11-15 | 6v6 | 36:27 | B1, Nurse Harrow / Vyper [screen](../../../audit-evidence-2026-11-19/screens/pair-137607197.jpg) |
| 137350098 | 242410987 | 2026-11-14 | 6v6 | 37:32 | Clear |
| 137331342 | 242410987 | 2026-11-14 | 6v6 | 33:53 | B1, Graves / Celeste [screen](../../../audit-evidence-2026-11-19/screens/pair-137331342.jpg) |
| 137305844 | 242410987 | 2026-11-14 | 6v6 | 38:56 | B1, Vindicta / Dynamo [screen](../../../audit-evidence-2026-11-19/screens/pair-137305844.jpg) |
| 139685110 | 740666480 | 2026-11-18 | 6v6 | 44:35 | B1, Venator / Ivy [screen](../../../audit-evidence-2026-11-19/screens/pair-139685110.jpg) |
| 139631885 | 740666480 | 2026-11-18 | Brawl | 14:10 | B1, Vindicta / Haze [screen](../../../audit-evidence-2026-11-19/screens/pair-139631885.jpg) |
| 139620352 | 740666480 | 2026-11-18 | Brawl | 15:01 | B1, Graves / Dynamo [screen](../../../audit-evidence-2026-11-19/screens/pair-139620352.jpg) |
| 139609876 | 740666480 | 2026-11-18 | Brawl | 16:42 | B1, Vindicta / Venator [screen](../../../audit-evidence-2026-11-19/screens/pair-139609876.jpg). B2 [kills](../../../audit-evidence-2026-11-19/screens/brawl-kills.jpg) |
| 139601141 | 740666480 | 2026-11-18 | Brawl | 14:06 | Clear |
| 139598914 | 740666480 | 2026-11-18 | Brawl | 7:06 | Clear |

### Reproducible findings

| ID · severity | Source | How to reproduce and observed impact | One-line fix |
| --- | --- | --- | --- |
| B1 · **High** | `matchups.js:275` | In 139859134 open Matchups → Hard Crowd Control → Graves versus Haze. The two directions have different category counts. Reading the absent reverse row throws and the old Graves panel remains visible. Confirmed independently for each pair above. | Join both directions by effect name and supply zero for a missing direction. |
| B2 · **High** · planned | `app.js:158`, `app.js:932` | In 139609876 pick Abrams and graph Kills. At 16:42 the graph reports 10 against 5 credited kills. Another slot shows 3 against 4. Monday's 6v6 also still fails. [Brawl](../../../audit-evidence-2026-11-19/screens/brawl-kills.jpg) · [Monday match](../../../audit-evidence-2026-11-19/screens/monday-kills.jpg) | Reconcile the endpoint with scoreboard K/D and disclose unmatched events without inventing timestamps. |
| B3 · **Medium** · Monday | `scoring.js:41` | In an isolated copy of 139859134 set Warden's `stats` to an empty array and open his Valve MVP detail. Missing damage/healing and objective data become zero, costing 1.98 and 0.65 points. His score reads −2.69, tenth of twelve. [Score panel](../../../audit-evidence-2026-11-19/screens/missing-stats.jpg) | Mark the estimate unavailable when its required measurements are absent. |
| B4 · **Medium** · Monday scratch | `matchups.js:55` | In Monday's two-dealer fixture, assign non-hero Bullet damage of 100 and 200 to the same target and timestamp. The parser retains 200 of the expected 300. This is a fixture result, not a prevalence estimate. [Retest](../../../audit-evidence-2026-11-19/extra.json) | Sum non-hero series by target, category and timestamp before displaying the total. |
| B5 · **Low** · Monday scratch | `graph-markers.js:117` | Add one timed purchase with an unknown item ID to the first player's items in 139859134. The marker builder returns 18 purchases before and after. A game patch can make a real purchase disappear. [Retest](../../../audit-evidence-2026-11-19/cases.json) | Preserve its timestamp and show an unknown-item label until the catalog knows the ID. |

### Profile filters and hover

| Account | All | Ranked | Unranked | Street Brawl |
| --- | ---: | ---: | ---: | ---: |
| 242410987 | 666 | 113 | 553 | 0 |
| 740666480 | 16 | 0 | 16 | 8 |

Counts above are independently classified API history entries. Four and one nonmatchmaking entries respectively fall outside those modes. On both profiles all eight filter selections rendered their expected first page or empty state. Profile 242410987 displayed 20 rows where its list exceeded 20. Profile 740666480 displayed 16 standard or eight Brawl rows. The visible custom help text matched each hovered element's stored explanation. Brawl stayed out of All. [Filter runs and row IDs](../../../audit-evidence-2026-11-19/profiles.json) · [Brawl list](../../../audit-evidence-2026-11-19/screens/profile-740666480-street_brawl.jpg) · [Empty Brawl list](../../../audit-evidence-2026-11-19/screens/profile-242410987-street_brawl.jpg)

## 2. Security

**The private upload lifecycle passed locally.** The current site's Worker, metadata projection, schema and both migrations matched the companion's offline fixture copies after normalizing line endings. The Rust fixture sent a saved eight-player match to that Worker with the existing in-memory SQLite adapter. Dry-run issued zero upload requests. An opted-in send succeeded. The paired viewer read a private preview, an unpaired read returned 404, official verification removed the preview body, and unlink returned 200. This is a current logic test. The prior workerd/D1 review covers actual binding behavior. [Current lifecycle evidence](../../../audit-evidence-2026-11-19/pilot.json)

| Check | Result on the audited revisions |
| --- | --- |
| Secrets | Before writing this report, scanned 502 website and 77 companion tracked/nonignored files. Scanned all locally reachable refs plus fetched site main for provider token signatures, private-key headers and literal secret assignments. Covered 926 distinct website Git blobs, 167 companion blobs, and 1,100 members of seven ZIP archives. Zero candidates. Arbitrary opaque secrets, ignored runtime files, unreachable Git objects and provider secret stores are outside that result. [Git scan](../../../audit-evidence-2026-11-19/history-results.json) · [Working files](../../../audit-evidence-2026-11-19/worktree-scan.json) |
| Upload validation | `companion/metadata.mjs:43` enforces 384 KiB compressed and 2 MiB inflated. `companion/metadata.mjs:102` projects allowed fields and checks match identity, balanced roster, known mode, viewer slot and age. The eight-slot local preview contained none of the tested prohibited fields. |
| D1, pairing and CORS | Session and match identifiers are bound SQL parameters (`companion/worker.mjs:60`, `companion/worker.mjs:148`). The column selection at line 147 uses two fixed choices. Redemption uses a database batch. Redemption and unlink check Origin (`companion/worker.mjs:231`). JSON responses are private/no-store with no wildcard CORS grant. The local cookie had Secure, HttpOnly and SameSite=Strict. |
| Rate limits | `wrangler.jsonc:19` configures upload 10/minute, read 60/minute and pair 5/minute. `companion/worker.mjs:225` selects the binding and applies the connection IP. Missing bindings fail closed. Production enforcement was not load-tested. Phase 3 items are excluded from the findings and ranking. |
| Player-name XSS | Supplied harmless Steam display text containing angle brackets, an ampersand and a bold tag. Both Summary and Profile rendered the literal text. Neither created a nested bold element. `summary/summary.js:307` and `profile.js:15` escape names. The match page also declares a script CSP at `index.html:5`. This result is specific to the tested name sinks. [Rendered result](../../../audit-evidence-2026-11-19/optional.json) |

**Zachary's manual checks.** Account settings were not inspected. Official instructions checked November 18, 2026.

1. In GitHub personal settings, open **Password and authentication**, verify 2FA, enroll an authenticator if needed, and store recovery codes privately. [GitHub 2FA](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication)
2. In Cloudflare, open **My Profile → Authentication**. Verify the email, check the enrolled factors, enable an authenticator or security key if needed, and store backup codes privately. [Cloudflare 2FA](https://developers.cloudflare.com/fundamentals/user-profiles/2fa/)
3. In the website repo's **Settings → Branches**, verify a rule covers `main`. Require a PR and the actual project checks, keep force pushes and deletions disabled, and check administrator bypass. A solo owner should avoid requiring an unavailable second reviewer. Private-repo protection depends on the GitHub plan. [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)

## 3. Performance and resilience

Three direct navigations per tab, Chrome HTTP cache disabled, localhost assets, real upstream services. Match 139859134 and profile 740666480. Ready time runs from navigation start to the first poll observing the active tab with data or the profile filters. It excludes deferred enrichment. Bytes include encoded transfers from all completed requests through a short quiet interval. Local storage persisted between runs, including the one-day art cache. These are desktop measurements. [All 15 samples](../../../audit-evidence-2026-11-19/performance.json)

| Direct entry | Median ready (range) | Median transferred | Completed requests, range |
| --- | ---: | ---: | ---: |
| Graphs | 300 ms (291–301) | 1.07 MiB | 45–46 |
| Summary | 268 ms (256–296) | 1.65 MiB | 65–66 |
| Matchups | 312 ms (288–362) | 1.09 MiB | 46 |
| MVP | 294 ms (285–307) | 1.23 MiB | 58 |
| Profile | 166 ms (162–4,557) | 1.18 MiB | 46–162 |

An immediate network failure on an unpaired match showed Retry. A 404 entered the wait loop. A pending response behaved differently. These controlled failure tests use saved real metadata or the real page with delayed responses. They establish the consequence of each condition. [Offline screen](../../../audit-evidence-2026-11-19/screens/offline.jpg) · [Failure results](../../../audit-evidence-2026-11-19/diagnostics.json)

| ID · severity | Source | How to reproduce and impact | One-line fix |
| --- | --- | --- | --- |
| R1 · **High** | `app.js:422` | Hold the first official metadata response pending. After 15.5 seconds the page still said Loading with no Retry or wait state. The fetch has no application deadline. The polling budget has not started. [Screen](../../../audit-evidence-2026-11-19/screens/slow-load.jpg) | Give official requests a bounded timeout and route expiry to a recoverable wait or Retry state. |
| R2 · **Medium** · Monday | `app.js:482`, `app.js:511` | Return valid salts followed by metadata 503 six times. The salts success resets the shared failure count. After six failures it reads one and polling continues. [Result](../../../audit-evidence-2026-11-19/diagnostics.json) | Track metadata and salts failures independently and apply the stop threshold to the failing call. |
| R3 · **Low** · Monday | `app.js:569` | At 120 seconds the bar and next-check countdown remain, but elapsed time disappears. The timer measures time on the page. [Screen](../../../audit-evidence-2026-11-19/screens/waiting-120.jpg) | Keep elapsed page-wait time visible after the typical range. |
| R4 · **Medium** · Monday | `mod/panorama/scripts/dlcompare_overlay.js:187`, `mod/panorama/scripts/dlcompare_overlay.js:212` | Run Monday's mock Panorama clock, open the first match and supply no page title for 60 seconds. One URL load, ready class true, no retry. Native pixels were not inspected. [State trace](../../../audit-evidence-2026-11-19/extra.json) | Keep a first-load retry deadline active until a matching readiness signal arrives. |
| R5 · **Medium** | `app.js:419`, `app.js:634`, `app.js:675`, `app.js:235` | Change a saved response to contain a null roster entry, a string in place of a stats array, or a permanent buff with a null type. Sorting, mapping or buff labeling throws. Renaming the roster removes all match data. [Cases](../../../audit-evidence-2026-11-19/cases.json) · [Roster](../../../audit-evidence-2026-11-19/diagnostics.json) | Validate required roster fields, then skip incompatible optional fields with a visible unavailable state. |
| R6 · **Medium** · Monday scratch | `scoring.js:33`, `scoring.js:54` | Give Warden in 139859134 an unknown hero ID while retaining his accolades. The scorer selects hero 25 and marks it in-table. The panel still uses Warden averages. [Screen](../../../audit-evidence-2026-11-19/screens/unknown-hero.jpg) | Handle unknown roster heroes before applying known-hero swap inference. |
| R7 · **Medium** | `profile.js:561` | Delay only the Steam name response by four seconds. At 2.46 s, profile 740666480 still said Loading match history even though history had arrived. The list appeared at 4.19 s. [Screen](../../../audit-evidence-2026-11-19/screens/profile-name-wait.jpg) | Render history with the existing identity and art fallbacks, then enrich it independently. |

The official roster, snapshot arrays and item/hero/effect catalogs are the principal format dependencies (B1, B3, B5, R5, R6). The private preview has an explicitly versioned schema (`companion/metadata.mjs:102`). Unknown preview modes are intended to stay local. Mod readiness depends on the native match-ID panel and heartbeat. The companion depends on its Windows install path and fresh console events. A live Valve update and Panorama performance were not tested.

## 4. Fresh-eyes UX

A visitor following a Reddit link needs to find a player, recognize whose stats are on screen and distinguish Valve's awards from Postmortem's estimates. The empty Graphs canvas is intentional. Summary is the exception that should open on the viewer when known.

| ID · severity | Source | How to reproduce and impact | One-line fix |
| --- | --- | --- | --- |
| U1 · **High** | `index.html:166`, `app.js:1846` | Open `/` in a fresh browser and try to find a friend by username. Lookup requires a match number. The only Profile anchor is a hidden Back control reserved for a profile referral. [Landing](../../../audit-evidence-2026-11-19/screens/landing.jpg) | Expose the existing player lookup from the standalone landing page. |
| U2 · **Medium** | `app.js:280`, `app.js:1841` | Open a bare standard `/?match=ID` link. All 15 standard games started on empty Graphs despite having Summary available. An explicit `tab=summary` works. [Default](../../../audit-evidence-2026-11-19/screens/default-graphs.jpg) · [With viewer](../../../audit-evidence-2026-11-19/screens/account-url-summary.jpg) | Choose Summary by default when eligible and preserve explicit tabs, Brawl and preview fallbacks. |
| U3 · **Medium** · partly planned | `matchups.js:152`, `mvp.js:116`, `mvp.js:138` | In 139859134 Matchups selected Graves and filled 36 cells before a selection. MVP also picked a row. Summary resolved Graves to a Steam name, but both other tabs used hero names. [Entry](../../../audit-evidence-2026-11-19/screens/matchups-entry.jpg) · [Roster](../../../audit-evidence-2026-11-19/screens/mvp-roster.jpg) | Apply the agreed empty-selection and username-first rules to both tabs while keeping the lobby view available. |
| U4 · **Medium** · planned | `mvp.js:52`, `mvp.js:160` | Select Valve in MVP. The calculated rank and points sit beside official badges. The score tooltip describes above/below average without identifying the estimate. [Score](../../../audit-evidence-2026-11-19/screens/valve-score.jpg) | Label the calculated points as an estimate at the value and keep the recorded award explicitly attributed to Valve. |
| U5 · **Medium** · Monday scratch | `mvp.js:169`, `mvp.js:172` | Focus an MVP player button and activate it. Rebuilding the list returns focus to BODY, so a keyboard user loses their place. [Focus trace](../../../audit-evidence-2026-11-19/extra.json) | Restore focus to the selected slot after rerendering the list. |
| U6 · **Low** · planned | `index.html:42`, `app.js:619` | Show official metadata after a private preview. The persistent source label disappears, leaving no populated live region to announce the change. [Preview](../../../audit-evidence-2026-11-19/screens/preview-label.jpg) · [Swap result](../../../audit-evidence-2026-11-19/last.json) | Announce official replacement once through a polite status region. |
| U7 · **Low** · Monday | `matchups.js:147` | Omit the optional damage matrix in a real fixture and open Matchups. The message explains the missing data but offers no action inside the panel. [Screen](../../../audit-evidence-2026-11-19/screens/no-matrix.jpg) | Add a direct action to an available match tab beside the explanation. |
| U8 · **Low** · planned | `mod/panorama/scripts/dlcompare_overlay.js:337` | Inspect the native hover registered for the postgame entry. A friend told to open Postmortem sees Compare. This is the actual source string; a native screenshot would require the game. | Apply the already-decided product name to the entry tooltip. |

## 5. Privacy

| What and where | Who can see it | Retention and opt-in |
| --- | --- | --- |
| Public match history, roster, Steam names, hero art and scores | A visitor who knows a match or account ID can request official data. The browser calls Deadlock API directly. Its operators receive those requests. | Upstream retention is outside these repos. The official page works without the companion or consent to private preview uploads. `profile.js:471`, `app.js:374`. |
| Website preferences in browser local storage | Anyone using that browser profile can see the saved “me” account, recent profiles (up to six IDs/names/avatar URLs), selected mode and teammate, graph marker choices and tag settings. | Most keys have no TTL. They persist until replaced or site storage is cleared. The hero-art cache is reused for one day. `profile.js:129`, `profile.js:155`, `profile.js:1183`, `graph-markers.js:41`, `player-assets.js:13`. |
| Companion on the PC | The Windows user and processes with access to their files can see original protobuf and converted JSON, match IDs, diagnostic records, config, and the installation credential. Local captures can contain roster information omitted from uploads. | Config lives in `%APPDATA%\PostmortemCompanion`. Captures, completed markers, logs and credential live in `%LOCALAPPDATA%\PostmortemCompanion`. The newest 20 matches stay in captures. Older ones move to parked-captures. Incomplete files, parked files and logs have no documented expiry. `src/storage.rs:140`, `src/storage.rs:176`, `src/upload.rs:63` in the companion. |
| Pending preview and receipts in Cloudflare D1 | The operator and a viewer paired to the matching installation can access it through their respective roles. The preview contains match timing, queue/mode, result, slot/hero/team, K/D/A, souls, snapshots and selected events for other players too. Roster IDs, Steam names, chat, replay keys and raw capture files are excluded by projection. | Up to six hours from estimated match end, enforced on read. Official arrival clears the payload and a receipt persists through expiry. Cleanup is scheduled. D1 recovery can retain deleted rows for seven days on Free or 30 days on Paid. The actual account plan and infrastructure log retention were unverified. `companion/metadata.mjs:102`, `companion/worker.mjs:148`, `companion/worker.mjs:205`. [D1 retention by plan](https://developers.cloudflare.com/d1/platform/limits/) |
| App pairing and viewer session | A user explicitly requests a six-character, one-use code. The server stores its keyed hash. The browser receives a separate protected cookie. Cloudflare receives connection IPs for limiting. | Code expires in ten minutes. Default cookie is session-only with a 24-hour server limit. Remember allows seven days. Unlink revokes that viewer session. `companion/worker.mjs:46`, `companion/worker.mjs:77`, `companion/worker.mjs:91`, `companion/worker.mjs:240`. |
| Manual “Missing a game?” upload on Profile | After file selection and Send, Deadlock API receives extracted match IDs and replay/metadata keys. This is a separate public match-discovery route. | That upstream service controls its own retention. The six-hour private preview window does not apply here. `profile.js:1444`, `profile.js:1510`. |

The generated configuration has sending off. The app checks enabled, both send flags and the site destination, and rechecks consent during retries (`src/config.rs:40`, `src/upload.rs:83`, `src/upload.rs:125`). A clean config refused pairing and the local dry-run made zero upload requests. Turning sending off stops future eligible sends. Previews already sent retain their original deadline. Restart-safe retries and app-launched personalized URLs are already planned in Phase 2.

| ID · severity | Source | How to reproduce and impact | One-line fix |
| --- | --- | --- | --- |
| P1 · **Medium** | `app.js:603`, `index.html:6` | Open `/?match=139859134&me=242410987&tab=summary`. The correct viewer was highlighted and `location.search` still contained the account ID. Copying the address bar retains it. Summary's own Copy link constructs a clean URL (`summary/summary.js:566`). The page sets no-referrer. [Recorded URL](../../../audit-evidence-2026-11-19/diagnostics.json) | Capture and validate the viewer hint once, then immediately remove `me` from the match URL with history replacement. |
| P2 · **Medium** | Companion `config.example.toml:6`, `docs/pilot-checklist.md:53` | Run `--init-config` with fresh app data, then follow the pilot opt-in block. Neither the generated flags nor that block states the other-player fields, six-hour deadline, D1 recovery window and unlink procedure together as required by `docs/plans/step3-send-to-site.md:62`. | Put a short consent explanation beside the flags covering destination, fields, access, expiry/recovery, opt-out and unlink. |

## 6. Install notes for friends

**Website, available now.** For player lookup, open [Postmortem Profile](https://deadlock-compare.minnymods.workers.dev/profile.html). Use the search field for a Steam name, or open a friend’s profile link. To view a specific game, use the match link Zachary gives you. The app and mod are optional.

**Post-match mod, draft for Zachary's supervised test.**

1. Close Deadlock. Ask Zachary for the postgame **v7 `pak97_dir.vpk`** and use the project-approved Deadlock Mod Manager. The similarly named `pak99_dir.vpk` is the separate Hideout experiment. The v7 file verified in the build archive was 28,578 bytes with SHA-256 `82C55EA406566981C61462CAE03EDF4BDA68A804FF91551E523300CB14CFBC99`. [Build handoff](../../../docs/handoffs/2026-11-14-postmortem-pak-v7.md)
2. In **Mods Library → Add Local Mod**, select the VPK, give it the name **Postmortem**, add it to the library, then select and enable its file in your active profile. If the manager reports a conflict with another postgame layout, record the warning for Zachary before replacing anything. [Manager's local-mod instructions](https://docs.deadlockmods.app/using-mod-manager/library)
3. Launch with the enabled mod profile. After a **finished** match, open **Compare** on the postgame screen. Check that the displayed match ID matches the native end screen. A new match can take time to appear. The browser website remains available while it waits. To roll back, close the game and disable Postmortem in that profile.

The v7 archive hash and source entry label were verified. Import, Valve patch compatibility, first native load and actual in-panel cookie persistence require a supervised game run. The audit did not open the game directory. If a game update disrupts a previously working setup, the Vault records Steam Verify integrity followed by reapplying the manager profile as Zachary's recovery procedure. [Project roadmap](<C:/Users/zacha/OneDrive/Desktop/Deadlock Mods/Vault/Roadmap.md>)

**Companion, two-account Windows pilot only.** Ordinary friends should use the site. Giving them the EXE today will not enable their accounts.

1. For an approved pilot account, get a matching pair of `postmortem-companion.exe` and `pm-reader.exe` from Zachary's verified release folder. Keep them side by side in one folder. Open a normal PowerShell window in that folder.
2. Run `.\postmortem-companion.exe --init-config` once. If it reports that the file exists, use the existing `%APPDATA%\PostmortemCompanion\config.toml`. Set `trigger = "disconnect"` for this pilot. Local-only capture uses `dry_run = true` and `send_matches = false`. The current build expects the standard Steam path on C: and a fresh console log.
3. Only if you want private previews sent to the site, read the privacy table above, keep the approved HTTPS destination, and set `enabled = true`, `dry_run = false` and `send_matches = true`. Open a **match page**, select **Link companion**, run `.\postmortem-companion.exe --pair` in PowerShell, and enter the displayed code there within ten minutes. Pair an in-game viewer separately using a fresh code. Keep codes in the pairing UI. If the button is missing, use the website normally and tell Zachary the pilot may be paused.
4. With the game running, start `.\postmortem-companion.exe --watch` **before queueing**. Keep the window open. Finish the match, then return normally to Hideout. Open the paired match page. Look for **From your app · awaiting Valve data** and then official stats. `.\postmortem-companion.exe --report` shows local capture results. A missed trigger can mean the watcher started late or lost log continuity.
5. To stop future sends, restore `send_matches = false`. To stop capture, set `enabled = false` and close the watcher. **Unlink companion** removes that viewer's session. Already uploaded previews expire on schedule. If Windows or antivirus blocks either executable, record the warning and stop. Use the website while Zachary checks the build.

| ID · severity | Source | How to reproduce and impact | One-line fix |
| --- | --- | --- | --- |
| I1 · **High for app distribution** · planned pilot limit | Companion `src/config.rs:32`, `src/guard.rs:5` | Follow the config and account guard for a third account. The config parser refuses it and the capture guard only admits the two named accounts. Installation cannot make the app work for an ordinary friend. | Keep friend instructions website-first until Zachary approves and verifies the planned friends enrollment step. |
| I2 · **High for the documented package** | Companion `README.md:21`, `src/main.rs:228` | Inspect the README's `bin` directory. It contains only the companion. Capture resolves `pm-reader.exe` beside the current executable. Both binaries exist together in `target/release`. | Ship and verify the matching release pair in one package and point the instructions to that package. |
| I3 · **Medium** | Companion `config.example.toml:2`, `src/main.rs:29` | A fresh `--init-config` wrote `trigger = "postgame"`. The recorded decision and supervised checklist use disconnect after Hideout. The default takes a different capture path. | Generate the approved disconnect default and explain how existing pilot users can check their setting. |
| I4 · **Medium** | Companion `src/config.rs:5`, `src/config.rs:6` | Compare the compiled console and executable paths with an installation in a Steam library on D:. Even a valid copy there cannot match those paths. This is a source dependency, not a live install test. | Resolve the verified Steam library install path or document the fixed-path restriction before offering the build. |

**How Zachary wants to work.** This phase hands back a report and evidence. Use the ranked list to choose a single approved change. Keep the site and app optionality, usernames and empty-view decisions intact. Ask before changing design, packaging, installing, publishing or touching the game. The production controls and native pilot run remain operator checks.

## Top 10 fixes before friends launch

1. **B1 · High.** Fix asymmetric Hard Crowd Control rows. This was the most frequent silent failure, affecting 13 of 20 matches.
2. **U1 · High.** Put player lookup on the landing page so a Reddit visitor can start with a name.
3. **B2 · High.** Reconcile the K/D graph with the scoreboard. The tested Brawl doubled Abrams's credited kills.
4. **R1 · High.** Give official metadata requests a deadline and an actionable recovery state.
5. **I1 · High for app distribution.** Share the website with ordinary friends and label the two-account companion pilot clearly until friends enrollment is ready.
6. **I2 · High for the documented package.** Verify the companion and reader are distributed together before handing out an app build.
7. **P2 · Medium.** Explain whose data is sent, who can see it, and both retention windows at the actual opt-in.
8. **P1 · Medium.** Remove the account hint from the match address after using it.
9. **U2 · Medium.** Open eligible match links on Summary and honor explicit tab choices.
10. **I3 · Medium.** Make a fresh pilot config follow the agreed disconnect-to-Hideout trigger.
