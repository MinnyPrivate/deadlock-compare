# Share plumbing handoff

November 18, 2026 · `codex/share-plumbing` · base `bf464fd`

- `/m/<match>/p/<account>` opens that account's Summary. Add `?embed=1` when loading the page in the in-game browser. The path takes precedence over legacy match, tab, and slot parameters. The existing Copy link action copies the canonical web URL. It keeps the legacy slot link for local fixtures and players without an account ID. The Share control TODO is next to Copy link in `summary/summary.js`.
- `/m/<match>/p/<account>/image.png` returns a 1200 × 630 PNG. Restyle `renderShareCard` in `share/render.mjs` and increment `IMAGE_CACHE_VERSION` in `share/worker.mjs` when the art changes. The placeholder font supports Latin letters and digits, with an account label as a fallback for names it cannot draw. The share page serves Open Graph and Twitter metadata in its initial HTML.
- PNG cache hits skip upstream requests, rendering, and the rate-limit check. The cache key is the host, match, account, and renderer version. The Cache API is local to each Cloudflare data center. Standard Worker request accounting still applies at the edge. A named preview can be cached for a day at the edge and an hour in the browser. Steam lookup fallbacks last five minutes. [Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- Cold PNG requests use a separate 60-per-minute IP rate limit with the same window and response pattern as the companion reads. Match metadata, Steam profiles, and PNGs are capped at 8 MiB, 16 KiB, and 384 KiB. The image route reads public stored Valve match data without passing viewer credentials. [Cloudflare Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) · [Deadlock API](https://api.deadlock-api.com/docs/)

## Verification

`node --test test/share.test.mjs test/summary.test.js` and `node test/score_test.js` passed. Local Chromium with the recorded match fixture verified website and embed entry, account selection despite conflicting query options, the embed heartbeat, PNG decoding, Copy link, missing-account handling, and legacy fixture links. Live Cloudflare caching, Discord unfurls, and the actual Panorama browser remain to be checked in an approved test environment. Before public release, include account-ID exposure and cold-request rate limits in the planned security pass.

## How Zachary wants to work

Read the latest Vault Decisions note and repo handoff, sketch the plan, and wait for explicit approval unless the brief already approves the work. Keep the writing direct and use no em dashes. Let Zachary make design decisions. Keep commits scoped and list staged files explicitly. Ask before dependency installs, destructive changes, pushes, PRs, merges, deployments, spending, or sending anything. This brief approved pushing the feature branch only. Keep the installed Deadlock folder out of scope.
