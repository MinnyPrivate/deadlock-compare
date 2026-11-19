# Companion download button

November 19, 2026. `codex/app-download` starts from `origin/main` at `bf464fd`.

- The profile's **Add a missing match** dialog uses its existing button style for **Download the app**. Replace `COMPANION_APP_DOWNLOAD_URL` in `profile.js` with the pilot download URL when it exists. The current value uses `example.invalid`.
- `node --test test/*.test.js test/*.test.mjs` and `node test/score_test.js` passed. Local Chromium opened the dialog from the saved profile fixture and verified the link and layout at 1920 by 1080 and 390 by 844.
- The scope is the website feature branch push. The companion zip stays local in the companion checkout. The eventual download host and access for testers are pending.

## How Zachary wants to work

Read Vault Decisions and the newest handoff first. Wait for approval on each phase unless the brief already approves it. Keep visuals in the existing style and let Zachary make design decisions. Stage explicit paths. Ask before a push, merge, deployment, dependency installation, destructive change, spending, or sending anything. This brief approved pushing only the website feature branch.
