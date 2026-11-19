# Companion pilot ZIP

November 19, 2026. `codex/host-app-zip` starts from fetched `origin/main` at `d181101`.

- The profile dialog downloads `/download/postmortem-companion.zip` and shows **Build Nov 19, 2026**. The asset is byte-for-byte identical to `postmortem-companion-windows-x64-20261119-082532-644f4fe3.zip` (4,031,027 bytes). SHA-256 is `ca179e04d855e8419facf5f88f559d7c590c216959ae9904ff516d376ff126cf`.
- Cloudflare serves the path through its static asset handler. The root `_headers` file gives it `application/zip` and an attachment filename. `.assetsignore` allows only the pilot ZIP under `download/`. The Cloudflare limit is 25 MiB per file. [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/) and [static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/).
- The standard Node suite passed with one optional audit fixture test skipped. Score fixtures passed. A local HTTP harness verified the response headers, ZIP contents and 404 for the loose executable. Chromium downloaded the ZIP at 1920 × 1080 and 390 × 844. Git checked the asset ignore patterns. Wrangler was unavailable locally, so the HTTP assertions still need a run against the actual Worker runtime.
- To run the integration test, start `wrangler dev --ip 127.0.0.1 --port 8787` in the profile checkout with an existing Wrangler installation. In a second PowerShell, set `$env:PM_DOWNLOAD_TEST_ORIGIN = 'http://127.0.0.1:8787'` and run `node --test test/app-download-route.integration.mjs`.
- For a later pilot build, replace the ZIP at the same path and update the date in `profile.js`. The ZIP is a public static asset after deployment. The approved-account restriction applies to use of the pilot service. Keep the planned security review before wider distribution.

## How Zachary wants to work

Start with the vault Decisions note and the newest project handoff. Plan each phase and wait for approval unless the brief already approves it. Keep design decisions with Zachary and use the established UI style. Keep credentials and captures out of Git. Stage explicit paths. This brief authorized pushing only `codex/host-app-zip`. Merge, deployment, dependency installation, and wider distribution need separate approval.
