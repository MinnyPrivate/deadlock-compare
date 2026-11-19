# Profile theme follows the main hero

November 19, 2026. `codex/theme-follows-main` starts from `origin/main` at `7b4ac8b`, which includes the official Valve palette.

The Main hero card and Profile accent use the same match counts after the mode, played-with, sidebar range, and hero filters. Equal counts keep the card's existing rule of picking the lower numeric hero ID. An empty result keeps that profile's last color. A profile that starts empty uses the neutral accent until it has a main hero.

The Profile backdrop uses an accent-driven wash so it can ease with the sigils, borders, selected chips, rank line, and dust over 400 ms. Reduced motion updates the color instantly. Filter updates keep the page shell mounted. The old `?theme=` preview override was removed so links always show the filtered main hero's color. The last-50-games tag now says “Often plays” to distinguish it from the Main hero card.

## Screenshots

Both 1920 × 1080 Chromium captures were opened and checked. They use the real saved history from `audit-evidence-2026-11-19/h242410987.json`, shown under the fixture name “Audit Profile”.

- [Before the switch, All with Graves](../screens/theme-follows-main/before-all-graves.png). Graves leads with 140 of 666 standard games and uses `#D9F334`.
- [After selecting Ranked, Kelvin](../screens/theme-follows-main/after-ranked-kelvin.png). Kelvin leads with 41 of 113 Ranked and Placement games and uses `#74ABBC`.

To regenerate the captures, set `PM_THEME_HISTORY` to the saved history above and `PM_THEME_SCREENSHOTS` to `docs/screens/theme-follows-main`. Run `node --test --test-name-pattern="the Profile main hero" test/prelaunch-audit.test.js`.

## Verification

- The Chromium regression checks the rendered hero, both Valve colors, an intermediate frame, the shared backdrop and chip colors, and the mounted page shell. It also covers reduced motion, empty results, tie-breaking, Street Brawl, Unranked, hero selection, sidebar range, and played-with filtering.
- `node --test` passed all 28 tests with zero skips, including the 20 saved audit matches and the Monday K/D replay. The two download integration checks used the repository Worker with a local Node asset binding. `node test/score_test.js` passed all five fixtures. Browser verification used desktop Chromium, including the site's embedded mode.

## How Zachary wants to work

Read Vault Decisions and the newest handoff first. Sketch the work and wait for approval when the brief has yet to provide it. Keep design decisions with Zachary, use recorded data, stage explicit files, and leave credentials and local logs out of Git. This brief authorizes pushing `codex/theme-follows-main` only. Merges, deployments, and pushes to `main` require separate approval.
