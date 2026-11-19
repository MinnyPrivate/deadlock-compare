# Postmortem (Deadlock Compare)

Overlay and isolate Deadlock post-match graphs. Built to load inside the game through a Panorama mod (Compare button on the post-match screen), and also works in a normal browser.

Friends can open the website and select **Find a player** for Steam name lookup. Open `index.html?match=<match id>` for a specific game. Standard matches with Summary data open on Summary by default. The Windows companion is optional and currently limited to a supervised two-account pilot.

- Graphs opens with no hero picked and every graph opens with no line types on. Click heroes to show or hide them (Ctrl+Click shows only that hero). Your hero picks and your Markers settings carry over to the next graph; line types do not.
- Player-Specific graphs (Regen by Type, Damage Breakdown, Souls by Source and so on) have a legend on the right that is also the picker: every line type, grouped (From the map, From items, Built in, From abilities) and sorted by size, with each picked hero's total. Click a row to show or hide it; Only appears on the hovered row; All and Clear at the bottom. Hovering a row or a line brings it forward and dims the rest.
- Layout by group size on those graphs: 1 or 2 heroes share one chart (color = line type, the first hero solid and the second dashed, with a key top-left); 3 or 4 heroes get one panel each on a shared scale with a synced crosshair; 5 or more get the overview (team totals over time, a ranked table with a column per line type you turned on and the lobby best in gold, and a compare tray that opens up to 4 heroes side by side). The General graphs (one line per hero) always stay one chart, with hover-to-focus.
- With exactly 2 players on a general graph, "Difference" shows one minus the other.
- General graphs can show Value, Per Minute, % of Team or totals for each team's roster. Standard matches also offer Lanes for totals by team and lane.
- Teams and Lanes lines are listed in the legend and can be hidden one by one.
- Kills and Deaths step at recorded event times when their counts match the scoreboard. When they differ, the chart shows Valve's recorded snapshots and final scoreboard totals, with a note about the event count mismatch. The Deaths marker shows recorded deaths and their attribution on hover.
- Souls Dropped on Death is a General graph (Valve's unsecured-souls-lost counter per hero, every 3 minutes), so it compares players like any other.
- Deaths and Items markers are available on hero graphs. Standard matches also offer Objectives markers. Settings carry across graphs and matches. Item buys show under the lines for 1 to 3 heroes. Hover to see what was bought since the last point.
- Shift+P shows a speed check (frame rate, hover and draw times), to confirm the in-game browser keeps up.
- Hover readout like the game's: one row per hero, highest first, tinted by team, with the line color on the left and the hero's share of the lobby. It follows the mouse to the second; values between Valve's snapshots are read off the drawn line.
- Time axis: totals start at 0:00, the Power graphs start at each hero's spawn values (level 1, base health from `heroes.vdata`), and rates and percentages start from 0 with a dotted line up to Valve's first snapshot (3:00), since there's no value before it.
- Matchups tab: hero damage, hard crowd control and slows between every pair of opponents, from Valve's damage matrix, with a head-to-head for any pair. The side panel lists a hero's top damage sources and what hit them (enemy hero and ability or gun). Totals match the scoreboard's hero damage exactly. Crowd control values are milliseconds (whole 1/64 s ticks).
- The MVP tab offers Raw and Impact scores and shows Valve's recorded picks and accolades. Standard matches also offer the Valve score based on hero averages.
- The Summary tab opens on your player when the match can identify you. Select a portrait to switch players. Hover or focus a score or percentile for its breakdown, and click a stat card to graph its recorded snapshots.

Optional URL parameters include `tab=graphs`, `tab=summary`, `tab=matchups`, `tab=mvp`, `graph=<id>` (for example `souls_lead`), `players=<slot,slot>`, `embed=1` (in-game overlay mode), and `scale=transform` (older scaling fallback).

The page is laid out in Deadlock's 1080p units and scaled with CSS `zoom`, which lays text out again at the real resolution so it stays sharp. Rank badges show the subrank inside the badge (I to VI), except on the team and lobby averages.

Data: [deadlock-api](https://deadlock-api.com/) `/v1/matches/{id}/metadata`. Hero names come from the game's own files (`heroes.js`).

Local test without the API: `python -m http.server`, then `index.html?match=136014932&src=test/match_136014932.json`. Add `tab=matchups` or `tab=mvp` to open another tab.

Summary fixture: `index.html?match=137018749&src=test/137018749.json&tab=summary&me=81646827`. Add `embed=1` for the in-game layout or `pick=10` to select Silver.

## Profile (prototype)

`profile.html` is a separate page for one player, laid out like OP.GG: a sidebar (main hero, rank with seasons, heroes with games per hero, teammates, patterns) and the matches in the main column under a Recent form card.

The Profile theme follows the Main hero shown for the current filters. The hero's official Valve Panorama color from `herothemes.js` drives the backdrop wash, ritual sigils, dust, and page accents. Color changes ease over 400 ms, or update instantly with reduced motion. An empty result keeps the last color for that profile, and tied match counts go to the lower hero ID. Win/loss, team and gold use their own palettes.

- Recent form: the last 20 games against the player's usual (all their games), with the takeaway in one sentence.
- Match rows: result, game mode, hero art, K/D/A, Valve's MVP or Key Player place, Valve's top-tier accolades, the final build in a 2 by 6 grid, and the players on each team. Standard matches also show a verdict against that hero's average (`heronorms.js`). Clicking the row opens the match on the Compare page.
- Teammates: best and worst win rates with people you played 5 or more games with, either queued together or anyone on your team.
- Patterns: each answers one question with its own picture (24-hour grid for time of day, columns for session and game length, a split bar for Hidden King vs Archmother), sorted so the most striking comes first.

Data (deadlock-api): `/v1/players/{id}/match-history`, `/v1/players/steam` (names and avatars), `/v1/players/steam-search`, `/v1/matches/metadata` (one bulk call per 20 matches, 30 per minute per IP; falls back to `/v1/matches/{id}/metadata`), `/v1/players/{id}/mate-stats`, `/v1/assets/ranked-seasons` and `/v1/assets/heroes` (the game's hero icons and card art; the local images are the fallback). The profile counts standard and Street Brawl matchmaking games.

Your account: `profile.html` opens your own profile. The player comes from `?me=<account id>` (saved), else the saved one, else a one-time setup card that takes an account ID, a SteamID64 or a `steamcommunity.com/profiles/<id>` link and shows the Steam name and avatar to confirm. Saved in the browser as `pm_me` (the future app can pass `?me=`). "Save as me" on any profile saves it; "Change account" replaces it. Steam `/id/<name>` links are not supported yet.

The **All / Ranked / Unranked / Street Brawl** filters apply to the match list, daily records and profile stats. All covers standard matchmaking games. Ranked includes standard placements, and Unranked covers standard unranked games. Street Brawl has its own match list and stats. Hero-average grades apply to standard matches. The filter is saved as `pm_mode`.

**Played with** filters those games to the match IDs shared with one teammate. Choose **Queued together** (`same_party=true`) or **Same team** (`same_party=false`). The profile uses standard teammate data for All, Ranked and Unranked, and Street Brawl teammate data for the Street Brawl filter. Click a teammate in a match row or the Teammates card to apply the filter. Ctrl-click opens their profile. The selection is saved per profile as `pm_with`.

Under the filters, "Updated X min ago" and Refresh. The history is deadlock-api's stored copy, cached for 5 minutes by its CDN and the browser, so the first load asks for a copy no older than a minute and Refresh asks for the newest (at most once every 2 minutes; `force_refetch` is not used because it only reaches Steam for bot-friend accounts and allows 1 call an hour per IP). A game that deadlock-api never received can't be listed or counted. "Missing a game?" opens Add a missing match: it reads only Steam httpcache entries (`<40 hex>_<40 hex>` file names, first 16 KB), pulls out `replay<server>.valve.net/1422450/<match id>_<key>.meta|dem.bz2` numbers, and after the player presses Send posts them to `POST /v1/matches/salts` (ids and keys only, label "postmortem"). The panel's grain is from Valve's `paper_panel_bg_01` (`assets/ui/panel_grain.webp`).

Local test without the API: `profile.html?id=12345678&src=test/profile_fixture.json` (synthetic data, not a real player).

## Waiting screen

A match deadlock-api doesn't have yet shows a waiting screen. The first request is a normal /metadata call (deadlock-api may ask Steam once; that is limited to 3 per hour per IP). After that the page only uses calls that never ask Steam: the free `/salts?disable_steam=true` check every 10 s for 3 minutes, then every 30 s, and `/metadata?disable_steam=true` as soon as salts exist (and once a minute regardless). Once deadlock-api has the salts it downloads the match from Valve inside that request. The screen shows only a title, how long it has waited against the usual 1:20 to 1:50 (a bar that fills and then holds, with "Taking longer than usual" after that) and "Checking again in X"; the details (last answer, try count) are kept in the status element's `data-detail` attribute. The Try Now button (10 second cooldown) appears only once it has stopped. It stops after 15 minutes ("hasn't been uploaded" or "Valve hasn't published it") or after 5 server errors in a row ("looks down"). A 429 waits as long as its `next_request_in` says.

## Game data

`gamedata.js` (item, accolade and damage source names) and `assets/items/` (item icons) are generated by `tools/build_gamedata.py` from the game's `abilities.vdata_c`, `accolades.vdata_c`, `heroes.vdata_c` (base health), localization files and item images (the raw files are in `raw/ranks_items_raw.zip` on the `assets-portraits-raw` branch). `tools/kv3.py` reads the binary KV3 format, ported from [ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat) (MIT). Item ids in match data are MurmurHash2 (seed `0x31415926`) of the item's class name.

## Game assets

`assets/` holds hero portraits (the painted `<hero>_card_psd` art masked with `hero_badges/hero_image_mask_psd` in `assets/heroes/` for the round chips, as on the native graph screen, and the unmasked card in `assets/cards/` for Lane Stats, the hover box and the MVP tab; Vyper's art is the game's `kali_card_psd`, and The Boss, Thumper and Cadence only have a small portrait in the game), the post-game background, icons and Deadlock's UI fonts (Radiance, VALVE Oracle, VALVE Pulp, subset to Latin), extracted from the game files with `tools/extract_assets.py` and decoded with `tools/s2decode.py`. They are Valve's. The fonts' license says: "Like other Valve game content, you may use this font to create Fan Art, as described in the Steam Subscriber Agreement." This project is a free, non-commercial fan mod.
