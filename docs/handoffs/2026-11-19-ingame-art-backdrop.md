# In-game Profile hero art backdrop

November 19, 2026. Fetched `origin` and based `codex/ingame-art-backdrop` on `origin/codex/profile-art-backdrop` at `3f999ac`. Merge the website art PR first, then the in-game backdrop PR.

Both `?embed=1` and `?ingame=1` use the website's hero art and its existing local, remote and generic fallback order. The embedded image fills the backdrop at 32% opacity with the existing vignette and no filter. The lower opacity softens the original image without a new asset. Both ritual circles are visible with their animations and `will-change` disabled. Dust and grain stay hidden, the top bar has no backdrop blur, and the cursor stays at `default`. When the main hero changes, the in-game accent updates immediately and the next image replaces the old one as soon as it decodes. The standalone Profile keeps its blurred art, moving circles, dust, grain and 400 ms theme easing.

## Screenshots

Opened and visually checked both 1920 × 1080 Chrome captures. Both use the same saved match history from the local `audit-evidence-2026-11-19/h242410987.json` file. The history is replayed as “Audit Profile” on All games with Graves as the main hero.

- [Before on the base branch, with the flat wash](../screens/ingame-art/before.png)
- [After, with hero art and both circles](../screens/ingame-art/after.png)

To recapture the after image, set `PM_THEME_HISTORY` to the saved history and `PM_INGAME_ART_SCREENSHOTS` to `docs/screens/ingame-art`. Run `node --test --test-name-pattern="the in-game Profile uses" test/prelaunch-audit.test.js`.

## Verification

The Chrome regression checks both embed aliases, including both circles at the 640 px breakpoint. It verifies a decoded hero image, computed styles for the backdrop subtree and pseudo-elements, and zero backdrop animations in `document.getAnimations()` on load and across a Graves-to-Kelvin switch. It also checks the instant accent change, hidden effects and disabled top bar blur. The existing website tests cover the 400 ms art and accent easing, animated circles, dust and grain, and reduced motion. The Hideout pointer and typing test also passed.

`node --test` passed all 31 tests with zero skips, including the 20 saved audit matches and Monday's K/D replay. The two download integration checks ran through the repository Worker with a local Node asset binding that read `_headers` and `.assetsignore`. All five scoring fixtures passed.

## What to check in Deadlock

The current pak loads the live Profile page. The fix reaches the game after the branch is merged and the website is deployed. No new pak build is needed. The screenshots and automated checks used desktop Chrome. Deadlock performance is still to be checked.

1. Open Profile in Hideout. Check that the main hero's art is visible behind the page and that both circles stay still for several seconds.
2. Change to a filter with a different main hero. The accent should change immediately and the art should swap once the new image is ready.
3. Compare open time, scrolling and typing against the current build using the same profile on the same machine. Record how the current build feels before the site deploys so you can compare afterward.

## How Zachary wants to work

Read Vault Decisions and the newest handoff first. Sketch the plan and wait for approval unless Zachary has already approved it in the brief. Use recorded data for game work, keep design decisions with Zachary, write plainly and use no em dashes. Stage explicit files and keep credentials and local logs out of Git. This brief authorizes pushing the feature branch only. Ask before creating a PR, merging, deploying or pushing to `main`.
