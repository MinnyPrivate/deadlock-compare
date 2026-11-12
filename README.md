# Deadlock Compare

Overlay and isolate Deadlock post-match graphs. Built to load inside the game through a Panorama mod (Compare button on the post-match screen), and also works in a normal browser.

Open `index.html?match=<match id>`.

- Click heroes to show or hide them. Ctrl+Click shows only that hero.
- Player-specific graphs (Damage breakdown, Souls by source, Support value, Kills by type) overlay any number of players: color = player, line style = category.
- With exactly 2 players on a general graph, "Difference" shows one minus the other.

Optional URL parameters: `graph=<id>`, `players=<slot,slot>`, `embed=1` (shows Close, used by the in-game overlay).

Data: [deadlock-api](https://deadlock-api.com/) `/v1/matches/{id}/metadata`. Hero names come from the game's own files (`heroes.js`).

Local test without the API: `python -m http.server`, then `index.html?match=136014932&src=test/match_136014932.json`.
