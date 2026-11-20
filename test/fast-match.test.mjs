import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buffer } from "node:stream/consumers";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { normalizeUpload } from "../companion/metadata.mjs";
import { createWorker } from "../companion/worker.mjs";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require(process.env.PM_FAST_PLAYWRIGHT || "playwright"));
} catch (error) {
  if (process.env.PM_FAST_PLAYWRIGHT || error.code !== "MODULE_NOT_FOUND") throw error;
}

const site = fileURLToPath(new URL("..", import.meta.url));
const api = "/api/v1/companion";
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const readJson = async path => JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));

// Run the real API and verifier using the repo migrations and local SQLite for the D1 calls.
async function serve(t, now, official) {
  const db = new DatabaseSync(":memory:");
  for (const migration of ["001-preview", "002-pair-code-failures"]) {
    db.exec(await readFile(new URL(`../companion/${migration}.sql`, import.meta.url), "utf8"));
  }
  const limit = { limit: async () => ({ success: true }) };
  const env = {
    PILOT_ENABLED: "true", PAIRING_SECRET: randomBytes(32).toString("hex"),
    PAIR_LIMIT: limit, READ_LIMIT: limit, UPLOAD_LIMIT: limit,
    DB: {
      prepare(sql) {
        const statement = db.prepare(sql);
        const bind = (...values) => {
          const args = values.map(value => value instanceof ArrayBuffer ? new Uint8Array(value) : value);
          const run = () => statement.columns().length
            ? { results: statement.all(...args) } : { meta: statement.run(...args) };
          return { first: () => statement.get(...args), run };
        };
        return { bind, ...bind() };
      },
      batch(statements) {
        db.exec("BEGIN");
        try {
          const result = statements.map(statement => statement.run());
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
    ASSETS: {
      async fetch(request) {
        const pathname = new URL(request.url).pathname;
        const file = resolve(site, "." + (pathname === "/" ? "/index.html" : pathname));
        if (!file.startsWith(resolve(site) + sep) || !mime[extname(file)]) return new Response(null, { status: 404 });
        try { return new Response(await readFile(file), { headers: { "Content-Type": mime[extname(file)] } }); }
        catch { return new Response(null, { status: 404 }); }
      },
    },
  };
  let checks = 0;
  const worker = createWorker({ now: () => now, fetchOfficial: async url => {
    assert.equal(url, `https://api.deadlock-api.com/v1/matches/${official.match_info.match_id}/metadata?disable_steam=true`);
    checks++;
    return Response.json(official);
  } });
  const server = createServer(async (req, res) => {
    const headers = new Headers(req.headers);
    headers.set("CF-Connecting-IP", "127.0.0.1");
    const body = req.method === "POST" ? await buffer(req) : undefined;
    const response = await worker.fetch(new Request(origin + req.url, { method: req.method, headers, body }), env);
    res.writeHead(response.status, Object.fromEntries(response.headers)).end(Buffer.from(await response.arrayBuffer()));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { server.closeAllConnections(); server.close(); db.close(); });
  return { origin, verify: () => worker.scheduled(null, env), checks: () => checks };
}

async function replay(t, mode, official, capture, { mismatch = false } = {}) {
  const embed = mode === "embed";
  const info = capture.match_info;
  const viewer = info.players[0];
  const id = String(info.match_id);
  const now = (info.start_time + info.duration_s + 60) * 1000;
  const { origin, verify, checks } = await serve(t, now, official);
  const browser = await chromium.launch({
    ...(process.env.PM_AUDIT_CHROME ? { executablePath: process.env.PM_AUDIT_CHROME } : {}),
    args: ["--disable-background-networking"],
  });
  t.after(() => browser.close());
  const context = await browser.newContext({
    viewport: { width: 1920, height: embed ? 996 : 1080 },
    reducedMotion: embed ? "reduce" : "no-preference",
  });
  let officialAvailable = false;
  const requests = [];
  const names = official.match_info.players.map(p => ({ account_id: p.account_id, personaname: `Player ${p.player_slot}` }));
  await context.route(url => url.origin !== origin, route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "api.deadlock-api.com") return route.abort();
    if (url.pathname === "/v1/players/steam") return route.fulfill({ json: names });
    if (url.pathname === "/v1/assets/heroes") return route.fulfill({ json: [] });
    requests.push(url.pathname + url.search);
    if (url.pathname.endsWith("/metadata") && officialAvailable) return route.fulfill({ json: official });
    return route.fulfill({ status: 404, json: {} });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now + 100);
  const reading = page.locator("#appReading"), status = page.locator("#status");
  const source = page.locator("#companionSource"), summary = page.locator("#summaryView");
  const graphs = page.locator("#tabs").getByRole("button", { name: "Graphs", exact: true });
  const link = page.locator("#companionLink");
  const url = `${origin}/?match=${id}&tab=summary${embed ? "&embed=1" : ""}`;
  const shots = process.env.PM_FAST_SCREENSHOTS;
  async function shot(name) {
    if (!shots || mismatch) return;
    await mkdir(shots, { recursive: true });
    await page.screenshot({ path: join(shots, `${name}_${mode}.png`), animations: "disabled", timeout: 25_000 });
  }

  async function waitMarkup() {
    await status.locator(".waitTitle").waitFor();
    return status.evaluate(el => [...el.children].map(child => ({
      className: child.className, text: child.textContent.replace(/\d+:\d\d(?= so far|\.$)/g, "<elapsed>"),
    })));
  }

  await page.goto(url);
  const normalWait = await waitMarkup();
  assert.deepEqual(normalWait, [
    { className: "waitTitle", text: "Waiting for this match's data" },
    { className: "waitRange", text: "Usually 1:20 to 1:50 after a game ends. <elapsed> so far." },
    { className: "waitBar", text: "" },
    { className: "waitCheck", text: "Checking again in <elapsed>." },
  ]);
  assert.equal(await reading.isHidden(), true);
  assert.equal(await graphs.getAttribute("aria-describedby"), "tabLoading");
  assert.equal(requests[0], `/v1/matches/${id}/metadata`);
  await shot("6_no_app_normal_wait");

  const bearer = { Authorization: `Bearer ${randomBytes(32).toString("hex")}`, "Content-Type": "application/json" };
  const issued = await fetch(origin + api + "/pairing", { method: "POST", headers: bearer, body: "{}" });
  assert.equal(issued.status, 201);
  const { code } = await issued.json();
  await link.click();
  await page.getByLabel("Pairing code").fill(code);
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await reading.waitFor();
  await page.reload();
  await reading.waitFor();
  assert.equal(await link.textContent(), "Unlink companion");
  assert.equal(await reading.textContent(), "Reading your match from the app");
  assert.equal(await status.locator(".waitTitle").count(), 0);
  assert.equal(await graphs.evaluate(button => getComputedStyle(button, "::after").display), "none");
  await shot("1_loading");

  await page.clock.runFor(24_999);
  assert.equal(await reading.isVisible(), true);
  await page.clock.runFor(1);
  assert.deepEqual(await waitMarkup(), normalWait);
  assert.equal(await reading.isHidden(), true);
  await shot("7_fallback_after_timeout");

  await page.reload();
  await reading.waitFor();
  const upload = normalizeUpload({ version: 1, viewer_slot: viewer.player_slot, match_info: info }, id, now);
  const payload = { version: 1, viewer_slot: upload.viewer_slot, match_info: upload.match_info };
  const sent = await fetch(origin + api + "/matches/" + id, {
    method: "POST", headers: { ...bearer, "Content-Encoding": "gzip" }, body: gzipSync(JSON.stringify(payload)),
  });
  assert.equal(sent.status, 202);
  assert.equal(checks(), 0);
  await page.clock.runFor(5000);
  await summary.waitFor();
  assert.equal(await summary.locator(".summary-kda b").innerText(), `${viewer.kills} / ${viewer.deaths} / ${viewer.assists}`);
  assert.equal(await source.textContent(), "App copy. Valve data will replace it.");
  assert.equal(await reading.isHidden(), true);
  await shot("2_first_seconds_app_copy");

  const markers = await page.locator("[data-valve-pending]").evaluateAll(nodes => nodes.map(node => node.dataset.valvePending));
  for (const field of ["Player name", "Damage by opponent"]) assert.ok(markers.includes(field), field);
  if (!viewer.player_rank_data?.initial_display_rank) assert.ok(markers.includes("Player rank"));
  if (id === "136527656") {
    for (const field of ["Time to kill", "Team rank", "Lobby rank"]) assert.ok(markers.includes(field), field);
  }
  if (shots && !mismatch) await summary.locator("[data-hl-card=rival]").focus();
  await shot("3_pending_fields");
  assert.equal(await graphs.isDisabled(), true);
  assert.equal(await graphs.locator(".tabNotice").textContent(), "Accurate graphs coming");
  assert.equal(await graphs.getAttribute("aria-describedby"), "graphsComing");
  assert.equal(await page.locator("button[data-tab=matchups] .tabNotice").textContent(), "Matchups coming");
  assert.equal(await page.locator("button[data-tab=mvp] .tabNotice").textContent(), "MVP coming");
  assert.equal(await page.locator(".mainCol").isHidden(), true);
  assert.equal(await page.locator("#graphCtn svg > *").count(), 0);
  assert.equal(await page.evaluate(() => state.events.length + state.players.reduce((n, p) => n + p.kdaGraphStats.length, 0)), 0);
  assert.ok(await summary.locator("[data-hl-go]:disabled").count());
  assert.equal(await summary.evaluate(el => el.getAnimations({ subtree: true })
    .filter(animation => !(animation instanceof CSSTransition)).length), 0);
  const controlBounds = await link.boundingBox(), contentBounds = await summary.boundingBox();
  assert.ok(controlBounds.y + controlBounds.height < contentBounds.y);
  const graphBounds = await graphs.boundingBox(), noticeBounds = await graphs.locator(".tabNotice").boundingBox();
  assert.ok(noticeBounds.x >= graphBounds.x && noticeBounds.x + noticeBounds.width <= graphBounds.x + graphBounds.width);
  let picked;
  if (!mismatch) {
    picked = info.players.find(p => p.player_slot !== viewer.player_slot).player_slot;
    await page.locator(`[data-summary-portrait="${picked}"]`).click();
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await summary.locator(".hl-sweep .hl-of").evaluateAll(nodes => nodes.every(node =>
      node.getBoundingClientRect().right <= node.closest(".hl-card").getBoundingClientRect().right)));
  }
  await shot("4_graphs_coming");

  const focus = embed ? summary.locator("[data-hl-card=place]") : page.locator(`[data-summary-portrait="${picked}"]`);
  if (!mismatch) await focus.focus();
  const layout = () => summary.locator(".hl-art, .hl-card").evaluateAll(nodes => nodes.map(node =>
    [node.dataset.hlCard || "art", node.offsetLeft, node.offsetTop, node.offsetWidth, node.offsetHeight]));
  const before = await layout();
  let scroller;
  if (!mismatch) {
    scroller = await page.addStyleTag({ content: "#summaryView {overflow:auto} .hl-layout {height:calc(100% + 100px)}" });
    await summary.evaluate(el => el.scrollTo(0, 40));
    assert.equal(await summary.evaluate(el => el.scrollTop), 40);
  }
  await verify();
  assert.equal(checks(), 1);
  const receipt = await page.evaluate(path => fetch(path).then(response => response.json()),
    origin + api + "/matches/" + id + "?status=1");
  assert.equal(receipt.state, mismatch ? "mismatch" : "official");
  const attempt = page.waitForResponse(response => response.url().endsWith("/metadata?disable_steam=true") && response.status() === 404);
  await Promise.all([attempt, page.clock.fastForward(31_000)]);
  assert.equal(await source.textContent(), "App copy. Valve data will replace it.");
  officialAvailable = true;
  await page.clock.fastForward(31_000);
  await page.locator("#tabs [data-tab=graphs]:enabled").waitFor();
  assert.equal(await source.getAttribute("aria-live"), "polite");
  assert.equal(await source.textContent(), mismatch ? "" : "Updated with official Valve data");
  assert.equal(await page.locator("[data-valve-pending]").count(), 0);
  assert.equal(await page.locator("[aria-current=true]").getAttribute("data-tab"), "summary");
  if (!mismatch) {
    assert.equal(await summary.evaluate(el => el.scrollTop), 40);
    assert.equal(await focus.evaluate(el => el === document.activeElement), true);
    await summary.evaluate(el => el.scrollTo(0, 0));
    await scroller.evaluate(el => el.remove());
    assert.equal(await page.evaluate(() => Summary.selected().slot), picked);
    assert.deepEqual(await layout(), before);
    if (names.some(p => p.account_id && p.personaname === `Player ${picked}`)) {
      await summary.getByRole("heading", { name: `Player ${picked}`, exact: true }).waitFor();
    }
    if (id === "136527656") {
      assert.equal(await summary.locator(".hl-duel-bars").isVisible(), true);
      assert.equal(await summary.locator(".hl-duel-ttk").isVisible(), true);
    }
  }
  await shot("5_official_swapped");
  assert.deepEqual(errors, []);
}

const skip = !chromium && "Set PM_FAST_PLAYWRIGHT to the installed Playwright package";
test("saved companion upload fills, falls back, and quietly swaps in Chromium", { skip, timeout: 90_000 }, async t => {
  const official = await readJson(process.env.PM_FAST_OFFICIAL || new URL("137018749.json", import.meta.url));
  const capture = process.env.PM_FAST_CAPTURE ? await readJson(process.env.PM_FAST_CAPTURE) : official;
  for (const mode of ["website", "embed"]) await t.test(mode, t => replay(t, mode, official, capture));
});

test("a mismatched upload quietly yields to Valve", { skip, timeout: 45_000 }, async t => {
  const official = await readJson(new URL("137018749.json", import.meta.url));
  const capture = structuredClone(official);
  capture.match_info.players[0].kills += 1;
  await replay(t, "embed", official, capture, { mismatch: true });
});
