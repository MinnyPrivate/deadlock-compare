# Deadlock Compare

Overlay and isolate Deadlock post-match graphs. Built to load inside the game through a Panorama mod (Compare button on the post-match screen), and also works in a normal browser.

Open `index.html?match=<match id>`.

- Click heroes to show or hide them. Ctrl+Click shows only that hero.
- Player-specific graphs (Damage breakdown, Souls by source, Support value, Kills by type) overlay any number of players: color = player, line style = category.
- With exactly 2 players on a general graph, "Difference" shows one minus the other.

Optional URL parameters: `graph=<id>` (for example `souls_lead`), `players=<slot,slot>`, `embed=1` (in-game overlay mode: ESC asks the game to close it).

Data: [deadlock-api](https://deadlock-api.com/) `/v1/matches/{id}/metadata`. Hero names come from the game's own files (`heroes.js`).

Local test without the API: `python -m http.server`, then `index.html?match=136014932&src=test/match_136014932.json`.

## Game assets

`assets/` holds hero portraits (the painted `<hero>_card_psd` art masked with `hero_badges/hero_image_mask_psd`, as on the native graph screen), the post-game background, icons and Deadlock's UI fonts (Radiance, VALVE Oracle, VALVE Pulp, subset to Latin), extracted from the game files with `tools/extract_assets.py` and decoded with `tools/s2decode.py`. They are Valve's. The fonts' license says: "Like other Valve game content, you may use this font to create Fan Art, as described in the Steam Subscriber Agreement." This project is a free, non-commercial fan mod.
