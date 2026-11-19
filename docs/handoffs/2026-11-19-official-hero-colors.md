# Official hero colors

November 19, 2026. `codex/official-hero-colors` starts from the fetched `origin/main` at `57c353d`. The 44 official values come from `heroes[].game.hex` in the Vault's Hero Colors extract, labeled GAME BACKGROUND on the sheet. The source is Valve's Panorama `#HeroRowBackground` palette from Deadlock build 6864.

Profile, Summary, the hero backdrop, and hero-colored graph strokes, hover swatches and portrait chips share one lookup. Coral `#EB6A6A` is for IDs outside the 44-hero roster. The test fixture contains the 44 published IDs and colors from the extract.

## PR notes and design rules

- **Gold for lobby best.** The old Summary hue cutoff would neutralize Billy, Deadman Danny, The Doorman, Dynamo, Graves, Mo & Krill, Pocket, Seven, Silver, Solomon, and Vyper. The design guide reserves `#FFED79` for ranks and badges. The official colors stay on hero decoration and identity swatches, and lobby-best marks retain the reserved gold. Sinclair's official gray also survives the old neutral-color cutoff.
- **Other color meanings.** Team amber and sapphire, win/loss cues, Matchups heat intensity, profile win-rate heat, graph source categories, and the Summary player-versus-average key keep their existing encodings. Player-Specific graphs distinguish heroes with solid and dashed lines. Website Summary accents and the site backdrop use the selected hero color.
- **Text contrast.** Profile hero titles below 4.5:1 against the dark panel use cream text. The decorative accent still uses the exact official hex. All 44 rendered profile headings passed the contrast check against the panel's conservative `#242424` background bound.

## Verification

- [Before and after PNG](../screens/official-hero-colors/before_after_sheet.png). Matching 1920 × 1080 Chromium views show all 44 Profile cards and three saved-match views covering Summary, Graphs and its hover readout, and the Matchups heatmap. The Vault copy is `Hero Colors/before_after_sheet.png`.
- `node --test` passed 24 tests with the saved audit fixtures, covering all 20 audit matches plus the Monday K/D replay. All five scoring fixtures passed. The two download integration cases passed separately against the repository Worker with a local Node asset binding that read `_headers` and checked `.assetsignore`. Wrangler was unavailable for those cases.
- Chromium replay covered the website and the overlay's web mode. The native in-game browser was outside this run.
- The Vault's original sheet generator still assumes the old Summary hue filter and pick-order graph palette. Its existing extract was used as the source and remains available as the baseline.

## How Zachary wants to work

Read Vault Decisions and the latest handoff first. Sketch each phase and wait for approval unless the brief already gives it. Keep design decisions with Zachary, use recorded data for verification, stage explicit paths, and keep credentials and local logs out of Git. This brief authorizes pushing only `codex/official-hero-colors`. Keep main, merges, and deployment out of the task.
