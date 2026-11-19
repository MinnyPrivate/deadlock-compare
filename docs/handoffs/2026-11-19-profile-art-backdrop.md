# Standalone Profile hero art backdrop

November 19, 2026. `codex/profile-art-backdrop` starts at fetched `origin/main` commit `8782785`.

The standalone Profile uses the filtered Main hero for both the accent and the blurred art. It prefers `assets/backdrops/<id>.webp`, then the hero art URL, then `assets/backdrops/generic.webp`. The original blur, placement, vignette, rotating ritual circles, dust, and grain are back together. The standalone accent gradient override was removed.

The outgoing art stays visible until the new image decodes. The new layer eases in over 400 ms while the accent uses its existing 400 ms easing. Reduced motion swaps the image as soon as it decodes. Empty filter results keep the last hero art and accent. The embedded Profile still uses its static wash, and Summary still uses its existing `--bd` path.

## Screenshots

Opened and reviewed all four 1920 × 1080 Chromium captures from the standalone Profile. They use the recorded history in `../audit-evidence-2026-11-19/h242410987.json`, replayed as “Audit Profile.” Graves leads All with 140 of 666 games. Kelvin leads Ranked with 41 of 113 games.

- [Before, flat Graves gradient on `origin/main`](../screens/profile-art/before-all-graves.png)
- [After, restored Graves art](../screens/profile-art/after-all-graves.png)
- [Graves to Kelvin at 200 ms](../screens/profile-art/midpoint-graves-to-kelvin.png)
- [After, restored Kelvin art](../screens/profile-art/after-ranked-kelvin.png)

To recapture the three branch screenshots, set `PM_THEME_HISTORY` to the saved history and `PM_THEME_SCREENSHOTS` to `docs/screens/profile-art`. Run `node --test --test-name-pattern="the Profile main hero" test/prelaunch-audit.test.js`. The midpoint capture pauses both animations at 200 ms.

## Verification

The Chromium regression checks decoded hero art, both rotating rings, dust and grain, removal of the gradient override, the mounted page shell, and the accent and image at 200 ms. It also checks reduced motion and the retained theme on empty filters. The embedded Profile test confirms it creates no hero art layers.

`node --test` passed all 30 tests with zero skips, including the saved 20-match audit corpus and the Monday K/D reproduction. The two download integration cases ran through the repository Worker with a local Node asset binding. `node test/score_test.js` passed all five scoring fixtures.

## How Zachary wants to work

Read Vault Decisions and the latest handoff first. Sketch the plan and wait for approval when the brief has yet to approve it. Keep design decisions with Zachary and use recorded data for game work. Write plainly and use no em dashes. Stage explicit files and keep credentials and local logs out of Git. This brief authorizes pushing `codex/profile-art-backdrop` only. Ask before merging, deploying, pushing to `main`, or opening a PR.
