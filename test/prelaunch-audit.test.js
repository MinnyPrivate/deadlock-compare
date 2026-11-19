"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { mkdir, mkdtemp, readFile, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const { tmpdir } = require("node:os");
const { extname, join, resolve, sep } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { after, before, test } = require("node:test");

const site = resolve(__dirname, "..");
const chrome = process.env.PM_AUDIT_CHROME || (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "chromium");
const match = require("./137018749.json");
const profile = require("./profile_fixture.json");
const routes = new Map();
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const json = (res, body, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
let browser, socket, server, origin, send, browserExit, userData, debugPort;

async function until(read, label, ms = 4000) {
  const end = Date.now() + ms;
  do {
    const value = await read();
    if (value) return value;
    await delay(30);
  } while (Date.now() < end);
  assert.fail(label);
}

before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname.startsWith("/api/v1/companion/") || url.pathname.startsWith("/__fixture/")) {
      const route = routes.get(url.pathname.replace(/^\/__fixture/, ""));
      if (!route && url.pathname === "/api/v1/companion/session") return json(res, { state: "paused" }, 503);
      return route ? route(res) : json(res, [], 404);
    }
    const file = resolve(site, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(site + sep) || !mime[extname(file)]) return res.writeHead(404).end();
    try {
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": mime[extname(file)] }).end(data);
    } catch (_) { res.writeHead(404).end(); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${server.address().port}`;

  userData = await mkdtemp(join(tmpdir(), "postmortem-audit-chrome-"));
  await startBrowser();
});

async function startBrowser() {
  browser = spawn(chrome, ["--headless=new", "--no-first-run", "--disable-background-networking", "--disable-extensions",
    "--remote-debugging-port=0", `--user-data-dir=${userData}`, "about:blank"], { stdio: "ignore", windowsHide: true });
  browserExit = once(browser, "exit").catch(() => {});
  await once(browser, "spawn");
  const portFile = join(userData, "DevToolsActivePort");
  await connectPage(null, portFile);
}

async function connectPage(targetId, portFile) {
  const target = await until(async () => {
    try {
      if (portFile) debugPort = (await readFile(portFile, "utf8")).split(/\r?\n/)[0];
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      return targets.find(t => t.type === "page" && (!targetId || t.id === targetId));
    }
    catch (_) { return false; }
  }, "Chrome debug target", 8000);
  const connection = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => { connection.addEventListener("open", done, { once: true }); connection.addEventListener("error", fail, { once: true }); });
  socket?.close();
  socket = connection;
  let id = 0;
  const pending = new Map();
  connection.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message));
    else callback.done(message.result);
  });
  send = (method, params) => new Promise((done, reject) => {
    pending.set(++id, { done, reject });
    connection.send(JSON.stringify({ id, method, params }));
  });
  await send("Page.enable");
  await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["https://*"] });
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.auditErrors = [];
    addEventListener("error", e => { if (e.message) auditErrors.push(e.message); });
    addEventListener("unhandledrejection", e => auditErrors.push(String(e.reason)));
    if (new URLSearchParams(location.search).has("dlh")) {
      window.auditHideoutSignals = [];
      let lastTitle = "";
      new MutationObserver(() => {
        if (document.title === lastTitle) return;
        lastTitle = document.title;
        if (lastTitle.startsWith("DLH:7:")) auditHideoutSignals.push(lastTitle.split(":")[2]);
      }).observe(document, { childList: true, subtree: true, characterData: true });
    }
    const originalFetch = window.fetch;
    window.fetch = (input, options) => {
      const url = new URL(input, location.href);
      if (url.hostname === "api.deadlock-api.com" || url.hostname === "assets.deadlock-api.com") {
        input = "/__fixture" + url.pathname + url.search;
      }
      return originalFetch(input, options);
    };
  ` });
}

async function stopBrowser() {
  if (send && socket?.readyState === WebSocket.OPEN) await Promise.race([send("Browser.close").catch(() => {}), delay(500)]);
  await Promise.race([browserExit, delay(3000)]);
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (browser && browser.exitCode === null) browser.kill();
  await browserExit;
}

after(async () => {
  await stopBrowser();
  server?.closeAllConnections();
  await new Promise(done => server ? server.close(done) : done());
});

async function page(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function navigate(path) { await send("Page.navigate", { url: origin + path }); }
async function waitPage(expression, ms) {
  return until(() => page(expression).catch(() => false), "Page did not satisfy " + expression, ms);
}
const standardId = match.match_info.match_id;
const localMatch = `/?match=${standardId}&src=test/${standardId}.json`;
async function loaded(id) {
  try { await waitPage(`state.match?.match_id === ${id} && !document.body.classList.contains('noMatch')`, 13_000); }
  catch (error) {
    const status = await page("document.querySelector('#status')?.textContent || 'No match status'").catch(() => "Page unavailable");
    throw new Error(`Match ${id}: ${status}`, { cause: error });
  }
}

test("U1 and I1: the website can start with a player while the companion session is paused", async () => {
  const id = Number(profile.profile.account_id);
  routes.set("/v1/players/steam-search", res => json(res, [profile.profile]));
  routes.set("/v1/players/steam", res => json(res, [profile.profile]));
  routes.set(`/v1/players/${id}/match-history`, res => json(res, profile.history));
  await navigate("/");
  await waitPage("!document.querySelector('#profileLookup').hidden");
  assert.equal(await page("document.querySelector('#profileLookup').getClientRects().length"), 1);
  assert.deepEqual(await page(`(() => {
    const link = document.querySelector("#companionDownload");
    return { visible: link.getClientRects().length > 0, label: link.textContent, href: link.getAttribute("href"),
      download: link.hasAttribute("download"), note: document.querySelector("#companionBuild").textContent };
  })()`), { visible: true, label: "Download the app", href: "/download/postmortem-companion.zip",
    download: true, note: "Build Nov 19, 2026" });
  await page("document.querySelector('#profileLookup').click(); true");
  await waitPage("location.pathname === '/profile.html'");
  await waitPage("document.querySelector('#q') !== null");
  assert.equal(await page("document.querySelector('#q').type"), "search");
  await page(`(() => {
    const input = document.querySelector('#q');
    input.value = ${JSON.stringify(profile.profile.personaname)};
    input.form.requestSubmit();
  })()`);
  await waitPage(`document.querySelector('.result .rName')?.textContent === ${JSON.stringify(profile.profile.personaname)}`);
  await page("document.querySelector('.result').click(); true");
  await waitPage("document.querySelector('#matches')?.textContent.length > 0");
  await navigate("/?embed=1");
  await waitPage("document.body.classList.contains('noMatch')");
  assert.equal(await page("document.querySelector('#profileLookup').getClientRects().length"), 0);
  assert.equal(await page("document.querySelector('#companionDownload').getClientRects().length"), 0);
});

test("the Hideout profile accepts pointer input and typing without running site backdrop effects", async () => {
  const id = Number(profile.profile.account_id);
  await navigate(`/profile.html?id=${id}&src=test/profile_fixture.json&embed=1&dlh=7`);
  await waitPage("document.querySelector('#matches') && auditHideoutSignals.includes('ready')");
  assert.deepEqual(await page(`(() => {
    const input = document.querySelector("#q");
    const bar = document.querySelector(".topbar");
    const dust = document.querySelector("#dust");
    return [input.type, getComputedStyle(input).cursor, getComputedStyle(input.nextElementSibling).cursor,
      getComputedStyle(bar).backdropFilter, getComputedStyle(dust).display, dust.width,
      getComputedStyle(document.querySelector(".backdrop i")).display];
  })()`), ["text", "default", "default", "none", "none", 300, "none"]);
  async function clickControl(selector) {
    const point = await page(`(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      const rect = control.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      return { x, y, targetIsControl: document.elementFromPoint(x, y) === control };
    })()`);
    assert.equal(point.targetIsControl, true, selector);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount: 1 });
    }
  }
  await clickControl("#q");
  assert.equal(await page("document.activeElement.id"), "q");
  await send("Input.insertText", { text: profile.profile.personaname });
  assert.equal(await page("document.querySelector('#q').value"), profile.profile.personaname);
  await clickControl("#search button");
  await waitPage("auditHideoutSignals.includes('submit-search')");
  assert.deepEqual(await page("auditHideoutSignals"), ["ready", "down-search", "focus-search", "click-search", "type-search", "submit-search"]);
  assert.deepEqual(await page("[...new URLSearchParams(location.search)]"),
    [["q", profile.profile.personaname], ["embed", "1"], ["dlh", "7"]]);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await waitPage("auditHideoutSignals.includes('escape')");
});

test("Time of day shares a profile-wide color scale across hours and sample sizes", async () => {
  const id = Number(profile.profile.account_id);
  const hours = [[10, 1, 1], [13, 0, 10], [14, 10, 10], [15, 2, 4], [16, 5, 10],
    [17, 11, 20], [18, 8, 21], [20, 11, 20]];
  const row = profile.history.find(m => m.game_mode === 1);
  assert.ok(row);
  const history = hours.flatMap(([hour, wins, games]) =>
    Array.from({ length: games }, (_, i) => ({ ...row, hour, player_match_outcome: i < wins ? 1 : 2 })));
  // Put wins newest so changing the displayed range changes its rate but keeps the same profile baseline.
  history.sort((a, b) => b.player_match_outcome - a.player_match_outcome);
  history.forEach((match, i) => {
    match.match_id = 900000000 + i;
    match.start_time = new Date(2026, 10, i + 1, match.hour).getTime() / 1000;
  });
  routes.set(`/v1/players/${id}/match-history`, res => json(res, history));
  routes.set("/v1/players/steam", res => json(res, [profile.profile]));
  await navigate(`/profile.html?id=${id}`);
  await waitPage("document.querySelector('.clock24')");
  const cells = await page(`[...document.querySelectorAll(".clock24 .hr")].map(cell => {
    const swatch = getComputedStyle(cell, "::before");
    return { color: swatch.backgroundColor, opacity: Number(swatch.opacity), text: cell.dataset.tip,
      sign: cell.querySelector("sup")?.textContent, empty: cell.classList.contains("empty") };
  })`);
  assert.equal(cells.length, 24);
  assert.equal(cells[17].color, cells[20].color);
  assert.equal(cells[17].opacity, cells[20].opacity);
  assert.match(cells[17].text, /55%\) vs your 50%.*Above average/);
  assert.match(cells[18].text, /38%\) vs your 50%.*Below average/);
  assert.notEqual(cells[17].color, cells[18].color);
  assert.equal(cells[17].sign, "+");
  assert.equal(cells[18].sign, "−");
  assert.equal(cells[15].color, cells[16].color);
  assert.equal(cells[15].sign, "=");
  assert.ok(cells[15].opacity < cells[16].opacity);
  assert.equal(cells[16].opacity, 1);
  assert.equal(cells[0].empty, true);
  assert.equal(cells[10].empty, false);
  assert.equal(cells[0].color, "rgba(0, 0, 0, 0)");
  assert.match(await page("document.querySelector('.clockLegend').textContent"), /vs your 50%/);

  const ordered = await page(`Array.from({ length: 101 }, (_, i) => {
    const { direction, intensity } = timeOfDayColor(i / 100, 0.58, 10);
    return direction * intensity;
  })`);
  assert.ok(ordered.every((value, i) => i === 0 || value > ordered[i - 1]));

  await page("document.querySelector('[data-range=\"50\"]').click(); true");
  await waitPage("document.querySelector('.clockLegend')?.textContent.includes('vs your 50%')");
});

test("all 44 heroes use their official Panorama colors and only unknown IDs use coral", async () => {
  const expected = require("./official-hero-colors.json");
  assert.equal(expected.length, 44);
  assert.equal(new Set(expected.map(hero => hero.id)).size, 44);
  await navigate("/profile.html");
  await waitPage("typeof heroColor === 'function'");
  const palette = await page(`${JSON.stringify(expected.map(hero => hero.id))}.map(id => ({
    id, name: HERO_NAMES[id], hex: heroColor(id)
  }))`);
  assert.deepEqual(palette, expected);
  assert.ok(palette.every(hero => hero.hex !== "#EB6A6A"));
  assert.deepEqual(await page("[0, 9999, 'constructor'].map(heroColor)"), Array(3).fill("#EB6A6A"));
});

function themeHistory() {
  const row = profile.history.find(m => m.game_mode === 1);
  return Array.from({ length: 62 }, (_, i) => {
    const kelvin = i > 0 && i < 30;
    const brawl = i >= 60;
    return { ...row, match_id: 140000000 - i, start_time: row.start_time - i * 3600,
      hero_id: brawl ? 67 : kelvin ? 12 : 76, game_mode: brawl ? 4 : 1,
      match_mode: i === 1 ? 8 : kelvin ? 4 : 1 };
  });
}

async function openThemeProfile(t, history) {
  const id = 42424242;
  const mate = { mate_id: 98765432, matches_played: 2, wins: 1, matches: [140000000, 139999999] };
  const fixtures = new Map([
    [`/v1/players/${id}/match-history`, history],
    [`/v1/players/${id}/mate-stats`, [mate]],
    ["/v1/players/steam", [{ account_id: id, personaname: "Audit Profile" }]],
  ]);
  for (const [path, data] of fixtures) routes.set(path, res => json(res, data));
  t.after(async () => {
    for (const path of fixtures.keys()) routes.delete(path);
    await page(`for (const store of [localStorage, sessionStorage]) { store.removeItem("pm_mode"); store.removeItem("pm_with") }`);
  });
  await navigate(`/profile.html?id=${id}`);
  await waitPage(`document.querySelector(".head h1")?.textContent === "Audit Profile" && P.mates`);
}

const themeColor = `getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()`;
const mainHeroTitle = `document.querySelector(".mainHero h2")?.textContent`;
const themeTransition = `document.documentElement.getAnimations().find(a => a.transitionProperty === "--accent")`;
const clickMode = mode => page(`document.querySelector('[data-mode="${mode}"]').click()`);

test("the Profile main hero, backdrop and accents ease together after a mode change", async t => {
  const capture = process.env.PM_THEME_SCREENSHOTS;
  const history = capture ? JSON.parse(await readFile(process.env.PM_THEME_HISTORY, "utf8")) : themeHistory();
  const setViewport = (width, height) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  if (capture) {
    await mkdir(capture, { recursive: true });
    await setViewport(1920, 1080);
    t.after(() => setViewport(1440, 900));
  }
  async function screenshot(name) {
    if (!capture) return;
    await page("document.fonts.ready.then(() => true)");
    await waitPage(`getComputedStyle(document.getElementById("backdrop")).opacity === "1"`);
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(capture, name), Buffer.from(data, "base64"));
  }
  await openThemeProfile(t, history);
  const graves = "rgb(217, 243, 52)", kelvin = "rgb(116, 171, 188)";
  await waitPage(`${themeColor} === "${graves}"`);
  assert.equal(await page(mainHeroTitle), "Graves");
  await screenshot("before-all-graves.png");

  const result = await page(`(() => {
    const nodes = [".head", "#side", "#matches", "#backdrop"];
    const originals = nodes.map(s => document.querySelector(s));
    const read = () => ({
      accent: ${themeColor},
      ring: getComputedStyle(document.querySelector(".backdrop i")).backgroundColor,
      wash: getComputedStyle(document.querySelector(".backdrop"), "::before").backgroundImage,
      chip: getComputedStyle(document.querySelector(".modeSeg .on")).boxShadow,
      title: getComputedStyle(document.querySelector(".mainHero h2")).color
    });
    const before = read();
    document.querySelector("[data-mode=ranked]").click();
    getComputedStyle(document.documentElement).getPropertyValue("--accent");
    const transition = ${themeTransition};
    transition.pause();
    transition.currentTime = 200;
    const middle = read();
    transition.finish();
    return { before, middle, after: read(), duration: transition.effect.getTiming().duration,
      hero: ${mainHeroTitle}, stable: nodes.every((s, i) => document.querySelector(s) === originals[i]) };
  })()`);
  assert.equal(result.hero, "Kelvin");
  assert.equal(result.duration, 400);
  assert.equal(result.stable, true);
  assert.equal(result.before.accent, graves);
  assert.equal(result.after.accent, kelvin);
  assert.notEqual(result.middle.accent, graves);
  assert.notEqual(result.middle.accent, kelvin);
  assert.notEqual(result.middle.wash, result.before.wash);
  assert.notEqual(result.middle.wash, result.after.wash);
  for (const state of [result.before, result.middle, result.after]) {
    assert.equal(state.ring, state.accent);
    assert.equal(state.title, state.accent);
    assert.ok(state.chip.includes(state.accent), state.chip);
  }
  await screenshot("after-ranked-kelvin.png");
  assert.deepEqual(await page("auditErrors"), []);
});

test("the Profile swaps instantly with reduced motion and retains its last color on empty filters", async t => {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  t.after(() => send("Emulation.setEmulatedMedia", { features: [] }));
  await openThemeProfile(t, themeHistory());
  const graves = "rgb(217, 243, 52)", kelvin = "rgb(116, 171, 188)", paige = "rgb(37, 143, 99)";
  const state = () => page(`[${mainHeroTitle}, ${themeColor}, Boolean(${themeTransition})]`);
  assert.deepEqual(await state(), ["Graves", graves, false]);
  assert.deepEqual(await page(`document.querySelector("[data-mode=ranked]").click();
    [${mainHeroTitle}, ${themeColor}, Boolean(${themeTransition})]`), ["Kelvin", kelvin, false]);
  await clickMode("unranked");
  assert.deepEqual(await state(), ["Graves", graves, false]);
  await clickMode("street_brawl");
  assert.deepEqual(await state(), ["Paige", paige, false]);
  await clickMode("all");
  await page(`document.querySelector("[data-range='50']").click()`);
  assert.deepEqual(await state(), ["Kelvin", kelvin, false]);
  await page(`document.querySelector("[data-hero='76']").click()`);
  assert.deepEqual(await state(), ["Graves", graves, false]);
  await page(`document.querySelector("#clearHero").click()`);
  assert.deepEqual(await state(), ["Kelvin", kelvin, false]);
  await page(`document.querySelector("[data-range='all']").click()`);
  await page(`document.querySelector("#withBtn").click(); document.querySelector("[data-pick='98765432']").click()`);
  assert.deepEqual(await state(), ["Kelvin", kelvin, false], "the lower hero ID wins a tie even if its game is older");
  await clickMode("street_brawl");
  assert.deepEqual(await state(), [null, kelvin, false]);
  await page(`document.querySelector("#clearWith").click()`);
  assert.deepEqual(await state(), ["Paige", paige, false]);
  assert.deepEqual(await page("auditErrors"), []);
});

test("official colors reach Summary, graph strokes, readout swatches and portrait chips", async () => {
  const players = match.match_info.players.slice();
  players[0] = { ...players[0], hero_id: 76 };
  players[1] = { ...players[1], hero_id: 16 };
  routes.set(`/v1/matches/${standardId}/metadata`, res => json(res, { match_info: { ...match.match_info, players } }));
  const [lightSlot, darkSlot] = players.map(p => p.player_slot);
  const url = `/?match=${standardId}`;
  await navigate(`${url}&tab=summary&pick=${lightSlot}`);
  await loaded(standardId);
  await waitPage("document.querySelector('.summary-chart svg')");
  assert.deepEqual(await page(`[
    document.documentElement.style.getPropertyValue("--accent"),
    document.querySelector("#summaryView").style.getPropertyValue("--hero-accent"),
    document.querySelector("#stage").style.getPropertyValue("--summary-underline")
  ]`), Array(3).fill("#D9F334"));

  await navigate(`${url}&graph=souls&players=${lightSlot},${darkSlot}`);
  await loaded(standardId);
  assert.deepEqual(await page(`[...document.querySelectorAll("#chartLines path[stroke-width='2.6']")]
    .map(node => node.getAttribute("stroke")).sort()`), ["#572798", "#D9F334"]);
  assert.deepEqual(await page(`[...document.querySelectorAll(".player.sel")]
    .map(node => node.style.getPropertyValue("--pc")).sort()`), ["#572798", "#D9F334"]);
  const point = await page(`(() => {
    const bounds = document.querySelector("#graphCtn").getBoundingClientRect();
    return { x: bounds.x + bounds.width * 0.6, y: bounds.y + bounds.height * 0.5 };
  })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await waitPage("document.querySelectorAll('#tooltip .heroRows .hr').length === 2");
  assert.deepEqual(await page(`[...document.querySelectorAll("#tooltip .heroRows .hr")]
    .map(node => node.style.getPropertyValue("--pc")).sort()`), ["#572798", "#D9F334"]);
  await page("document.querySelector('[data-tab=matchups]').click()");
  await waitPage("document.querySelectorAll('.muCell').length === 36");
  assert.ok(await page("[...document.querySelectorAll('.muCell')].every(cell => Number(cell.style.getPropertyValue('--heat')) > 0)"));
  assert.deepEqual(await page("auditErrors"), []);
});

test("U2 and P1: Summary opens on the viewer and cleans the hint while preserving other parameters", async () => {
  await navigate(`${localMatch}&me=81646827&unrelated=keep#friendly=1`);
  await loaded(standardId);
  const entry = await page(`({tab: state.tab, me: state.me.raw.account_id, pick: Summary.selected().slot,
    hasMe: new URL(location.href).searchParams.has('me'), unrelated: new URL(location.href).searchParams.get('unrelated'), hash: location.hash})`);
  assert.deepEqual(entry, { tab: "summary", me: 81646827, pick: await page("state.me.slot"), hasMe: false, unrelated: "keep", hash: "#friendly=1" });
  await waitPage("document.querySelector('#summaryView [data-summary-copy]') !== null");
  const link = await page(`(async () => {
    let href;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { href = value; } } });
    document.querySelector('#summaryView [data-summary-copy]').click();
    return href;
  })()`);
  assert.equal(new URL(link).searchParams.has("me"), false);
  await navigate(`${localMatch}&tab=graphs&me=4294967296`);
  await loaded(standardId);
  assert.equal(await page("state.tab"), "graphs");
  assert.equal(await page("location.search.includes('me=') || viewerAccount !== null"), false);
  await navigate(`${localMatch}&graph=kills&players=3`);
  await loaded(standardId);
  assert.deepEqual(await page("[state.tab, state.graph]"), ["graphs", "kills"]);
  await navigate(`${localMatch}&tab=mvp`);
  await loaded(standardId);
  assert.equal(await page("state.tab"), "mvp");
  const anotherId = standardId + 1;
  routes.set(`/v1/matches/${standardId}/metadata`, res => json(res, match));
  routes.set(`/v1/matches/${anotherId}/metadata`, res => json(res, { match_info: { ...match.match_info, match_id: anotherId } }));
  await navigate(`/?match=${standardId}&me=81646827&pick=3`);
  await loaded(standardId);
  await page(`document.querySelector('#matchInput').value = '${anotherId}'; document.querySelector('#matchForm').requestSubmit(); true`);
  await loaded(anotherId);
  assert.equal(await page("state.summaryPick === null && viewerAccount === null && !new URL(location.href).searchParams.has('pick')"), true);
});

test("match tabs wait for Valve on the website and in the overlay", { timeout: 30_000 }, async t => {
  const { normalizeUpload } = await import("../companion/metadata.mjs");
  const fixture = async (path, fallback) => path ? JSON.parse(await readFile(path, "utf8")) : fallback;
  const official = await fixture(process.env.PM_LOADING_OFFICIAL, match);
  const early = await fixture(process.env.PM_LOADING_PREVIEW, official);
  const id = official.match_info.match_id;
  const viewer = early.match_info.players[0];
  const preview = normalizeUpload({ version: 1, viewer_slot: viewer.player_slot, match_info: early.match_info },
    String(id), (early.match_info.start_time + early.match_info.duration_s) * 1000);
  const session = "/api/v1/companion/session", previewPath = `/api/v1/companion/matches/${id}`;
  const initialRoutes = new Map(routes);
  routes.set(session, res => json(res, { paired: true }));
  routes.set("/v1/players/steam", res => json(res, []));
  routes.set("/v1/assets/heroes", res => json(res, []));
  t.after(async () => {
    routes.clear();
    for (const [path, handler] of initialRoutes) routes.set(path, handler);
    await send("Emulation.setEmulatedMedia", { features: [] });
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  });

  const selectors = `Array.from(document.querySelectorAll('#tabs .tab'))`;
  const tabState = () => page(`${selectors}.map(button => [button.dataset.tab, button.disabled,
    button.getAttribute('aria-current') === 'true', button.hasAttribute('aria-describedby')])`);
  const pending = [["summary", false, true, false], ["graphs", true, false, true],
    ["matchups", true, false, true], ["mvp", true, false, true]];
  const shots = process.env.PM_LOADING_SCREENSHOTS;
  async function screenshot(name) {
    if (!shots) return;
    await mkdir(shots, { recursive: true });
    await page("document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(shots, name + ".png"), Buffer.from(data, "base64"));
  }

  for (const [mode, requested, sparse] of [
    ["website", "summary", false], ["embed", "summary", false],
    ["embed", "graphs", false], ["embed", "matchups", false], ["website", "mvp", true],
  ]) {
    const embed = mode === "embed";
    let previewResponse, metadataResponse;
    routes.set(previewPath, res => { previewResponse = res; });
    routes.set(`/v1/matches/${id}/metadata`, res => { metadataResponse = res; });
    await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: embed ? 996 : 1080, deviceScaleFactor: 1, mobile: false });
    const motion = value => send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value }] });
    await motion("no-preference");
    await navigate(`/?match=${id}&tab=${requested}${embed ? "&embed=1" : ""}${requested === "graphs" ? "&graph=dmg_type" : ""}`);
    await until(() => previewResponse && metadataResponse, "Both match requests started");
    assert.deepEqual(await tabState(), pending);
    assert.equal(await page("document.querySelector('#status').textContent"), `Loading match ${id}...`);

    const result = structuredClone(preview);
    result.expires_at = Date.now() + 60_000;
    if (sparse) delete result.match_info.players[0].stats;
    json(previewResponse, result);
    await waitPage("!document.querySelector('#summaryView').hidden && !!document.querySelector('.summary-kda')");
    assert.deepEqual(await tabState(), pending);
    assert.equal(await page("document.querySelector('#companionSource').hidden"), false);
    assert.equal(await page("Summary.selected().slot"), viewer.player_slot);
    assert.equal(await page("document.querySelector('.summary-kda b').textContent"), `${viewer.kills} / ${viewer.deaths} / ${viewer.assists}`);
    assert.equal(await page("!!document.querySelector('.summary-chart')"), !sparse);
    assert.equal(await page("!!document.querySelector('.summary-compare')"), false);

    const loadingWidth = await page(`${selectors}.slice(1).map(b => b.offsetWidth)`);
    const animation = await page("getComputedStyle(document.querySelector('[data-tab=graphs]'), '::after').animationName");
    assert.equal(animation, "tab-spin");
    await motion("reduce");
    assert.equal(await page("getComputedStyle(document.querySelector('[data-tab=graphs]'), '::after').animationName"), "none");

    if (requested === "summary") await screenshot(`${mode}-loading`);
    const summary = "document.querySelector('[data-tab=summary]')";
    assert.equal(await page(`(() => {
      ${summary}.focus();
      for (const b of ${selectors}.slice(1)) { b.focus(); b.click(); }
      ${summary}.click();
      return document.activeElement === ${summary} && state.tab === 'summary';
    })()`), true);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    assert.equal(await page("!document.activeElement.closest('#tabs') && document.activeElement !== document.body"), true);

    const root = (await send("DOM.getDocument")).root.nodeId;
    const { nodeId } = await send("DOM.querySelector", { nodeId: root, selector: '[data-tab="graphs"]' });
    const { nodes: [accessible] } = await send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
    assert.equal(accessible.description.value, "Loading match data");
    assert.equal(accessible.properties.find(property => property.name === "disabled").value.value, true);

    const picked = result.match_info.players[1].player_slot;
    if (requested === "summary") {
      await page(`document.querySelector('[data-summary-portrait="${picked}"]').click(); true`);
    } else await page(`${summary}.focus(); true`);
    json(metadataResponse, official);
    await waitPage(`state.previewSlot === null && state.tab === '${requested}'`);
    assert.deepEqual(await tabState(), ["summary", "graphs", "matchups", "mvp"].map(tab => [tab, false, tab === requested, false]));
    assert.deepEqual(await page(`${selectors}.slice(1).map(b => b.offsetWidth)`), loadingWidth);
    assert.equal(await page("document.querySelector('#companionSource').hidden"), true);
    assert.equal(await page("state.me.slot"), viewer.player_slot);
    assert.equal(await page("location.search.includes('tab=' + state.tab)"), true);
    if (requested === "summary") {
      assert.equal(await page("Summary.selected().slot"), picked);
      assert.equal(await page("document.activeElement.dataset.summaryPortrait"), String(picked));
      assert.equal(await page("!!document.querySelector('.summary-compare')"), true);
      await page(`Summary.select(${viewer.player_slot}); document.activeElement.blur(); true`);
      await screenshot(`${mode}-loaded`);
    } else assert.equal(await page("document.activeElement.dataset.tab"), requested);
    if (requested === "graphs") assert.equal(await page("state.graph"), "dmg_type");
    assert.deepEqual(await page("auditErrors"), []);
  }
});

test("R1: stalled official headers and body both expire, and Retry loads the match", { timeout: 32_000 }, async () => {
  const metadata = `/v1/matches/${standardId}/metadata`;
  let sent;
  for (const bodyStalls of [false, true]) {
    sent = false;
    routes.set(metadata, res => {
      sent = true;
      if (bodyStalls) res.writeHead(200, { "Content-Type": "application/json" }).write("{");
    });
    await navigate(`/?match=${standardId}&tab=graphs`);
    await until(() => sent, "official metadata request did not start");
    await waitPage("document.querySelector('#status .retry')?.textContent === 'Retry'", 12_000);
    assert.match(await page("document.querySelector('#status').textContent"), /took too long/);
    routes.set(metadata, res => json(res, match));
    await page("document.querySelector('#status .retry').click(); true");
    await loaded(standardId);
  }
});

test("R2: salts success cannot reset the metadata failure limit", async () => {
  const id = 12345;
  const metadata = `/v1/matches/${id}/metadata`, salts = `/v1/matches/${id}/salts`;
  let officialCalls = 0;
  routes.set(metadata, res => json(res, {}, ++officialCalls === 1 ? 404 : 503));
  routes.set(salts, res => json(res, { metadata_salt: 1, cluster_id: 1 }));
  await navigate(`/?match=${id}`);
  await waitPage("state.wait?.tries === 1");
  assert.deepEqual(await page("[...document.querySelectorAll('#tabs .tab:disabled')].map(b => b.dataset.tab)"), ["graphs", "matchups", "mvp"]);
  assert.equal(await page("document.querySelector('#tabs').hidden"), false);
  assert.deepEqual(await page(`(async () => {
    const w = state.wait;
    for (let i = 0; i < 5; i++) await check(w, w.id, loadSeq);
    return { failures: w.failures, stopped: w.stopped, retry: !!document.querySelector('#status .retry') };
  })()`), { failures: { salts: 0, metadata: 5 }, stopped: "down", retry: true });
  assert.equal(officialCalls, 6);
  assert.equal(await page("document.querySelector('#tabs').hidden"), true);
});

test("B1 and B4: asymmetric crowd control joins by name and world damage sums both dealers", async () => {
  await navigate(`${localMatch}&tab=matchups`);
  await loaded(standardId);
  const output = await page(`(() => {
    const [a, b] = [state.players.find(p => p.team === 0), state.players.find(p => p.team === 1)];
    const src = (source_details_index, target_player_slot, damage) => ({source_details_index, damage_to_players: [{target_player_slot, damage}]});
    const dealer = (dealer_player_slot, ...damage_sources) => ({dealer_player_slot, damage_sources});
    state.match.damage_matrix = {sample_time_s: [900, 1800], source_details: {
      stat_type: [6, 6, 0], source_name: ['Citadel_Graph_CrowdControl_First', 'Citadel_Graph_CrowdControl_Reverse', 'Bullet']
    }, damage_dealers: [dealer(a.slot, src(0, b.slot, [2000, 5000])), dealer(b.slot, src(1, a.slot, [8000])),
      dealer(100, src(2, a.slot, [100, 200])), dealer(101, src(2, a.slot, [300]))]};
    delete state.match._mu;
    state.mvpPick = a.slot;
    renderAll();
    const world = document.querySelector('#muView .muNote').textContent;
    document.querySelector('#muView [data-stat=cc]').click();
    document.querySelector('.muCell[data-a="'+a.slot+'"][data-b="'+b.slot+'"]').click();
    const rows = [...document.querySelectorAll('.muH2H .h2hRow:not(.th)')].map(e => [e.children[2].textContent, e.children[0].textContent, e.children[4].textContent]);
    return {world, rows, errors: auditErrors};
  })()`);
  assert.match(output.world, /500/);
  assert.deepEqual(output.rows, [["First", "5.0s", "0s"], ["Reverse", "0s", "8.0s"]]);
  assert.deepEqual(output.errors, []);
});

test("B2: disagreeing events fall back to recorded samples and the scoreboard, including Summary disclosure", async () => {
  await navigate(localMatch);
  await loaded(standardId);
  const output = await page(`(() => {
    const source = state.players[0];
    const victim = state.players.find(p => p.team !== source.team);
    victim.raw.death_details.push(...Array.from({length: 30}, () => ({game_time_s: 2, killer_player_slot: source.slot})));
    // Summary caches its per-match events, so render the fixture as a new response.
    const changed = {...state.match};
    setup(changed);
    window.Summary.select(source.slot);
    const summary = document.querySelector('.summary-chart-caption').textContent;
    document.querySelector('[data-tab=graphs]').click();
    openGraph('kills'); setSel(new Set([source.slot])); renderAll();
    const pts = seriesFor(graphNow())[0].pts;
    return {summary, graph: document.querySelector('#lines').textContent, end: pts.at(-1), expected: [state.match.duration_s, source.raw.kills],
      step: !!pts.step, artificialTime: pts.some(p => p[0] === 2)};
  })()`);
  assert.match(output.summary, /Recorded markers differ from the scoreboard/);
  assert.match(output.graph, /Event counts differ from the scoreboard/);
  assert.deepEqual(output.end, output.expected);
  assert.equal(output.step || output.artificialTime, false);
});

test("U4, U5 and R6: MVP labels estimates and official awards, keeps row focus and uses the fallback for unknown heroes", async () => {
  await navigate(`${localMatch}&tab=mvp`);
  await loaded(standardId);
  const output = await page(`(() => {
    const row = document.querySelector('.mvpRow:last-of-type');
    row.focus(); row.click();
    const active = document.activeElement.dataset.slot;
    const p = state.players.find(p => p.slot === state.mvpPick);
    const changed = {...p.raw, hero_id: 999999};
    const scored = window.PM_SCORE.scoreMatch({players: [changed]}, window.HERO_TABLE).players[0];
    return {active, requested: row.dataset.slot, estimate: row.querySelector('.score').textContent,
      official: document.querySelector('.mvpRow .badge').title, graded: scored.graded_hero, inTable: scored.inTable};
  })()`);
  assert.equal(output.active, output.requested);
  assert.match(output.estimate, /est\./);
  assert.match(output.official, /Valve's recorded/);
  assert.equal(output.graded, 999999);
  assert.equal(output.inTable, false);
});

test("R7: profile history renders while its Steam name is pending", async () => {
  const id = Number(profile.profile.account_id);
  routes.set(`/v1/players/${id}/match-history`, res => json(res, profile.history));
  let finish;
  routes.set("/v1/players/steam", res => { finish ??= () => json(res, [profile.profile]); });
  await navigate(`/profile.html?id=${id}`);
  await until(() => finish, "Steam identity request did not start");
  await waitPage(`document.querySelector('#matches')?.textContent.length > 0 && document.querySelector('.head h1')?.textContent === 'Player ${id}'`);
  await page("window.auditMatches = document.querySelector('#matches'); true");
  finish();
  await waitPage(`document.querySelector('.head h1')?.textContent === ${JSON.stringify(profile.profile.personaname)}`);
  assert.equal(await page("window.auditMatches === document.querySelector('#matches')"), true);
});

test("a Street Brawl preview shows the scoreboard while Summary waits for Valve", async () => {
  await navigate(localMatch);
  await loaded(standardId);
  const result = await page(`(() => {
    const players = [0, 1].flatMap(team => state.match.players.filter(p => p.team === team).slice(0, 4));
    const official = { ...state.match, game_mode: 4, players };
    state.awaitingValve = true;
    state.previewSlot = players[0].player_slot;
    setup({...official});
    const tabs = () => Array.from(document.querySelectorAll('#tabs .tab')).map(b => b.disabled);
    const preview = { tab: state.tab, disabled: tabs(), portraits: document.querySelectorAll('[data-summary-portrait]').length,
      kda: !!document.querySelector('.summary-kda'), grades: !!document.querySelector('.summary-place') };
    document.querySelector('[data-tab=summary]').focus();
    show(official, loadSeq);
    return { preview, official: { tab: state.tab, disabled: tabs(), focus: document.activeElement.dataset.tab }, errors: auditErrors };
  })()`);
  assert.deepEqual(result, {
    preview: { tab: "summary", disabled: [false, true, true, true], portraits: 8, kda: true, grades: false },
    official: { tab: "graphs", disabled: [true, false, false, false], focus: "graphs" }, errors: [],
  });
});

// Point PM_AUDIT_MATCHES at the audit's saved matches folder to replay the original sweep.
const audited = [139859134, 138427763, 138410817, 138395412, 138189026, 138163242, 138104330,
  137683794, 137665238, 137627512, 137607197, 137350098, 137331342, 137305844, 139685110,
  139631885, 139620352, 139609876, 139601141, 139598914];
function sweepMatch() {
  const clickTab = tab => document.querySelector(`[data-tab=${tab}]`).click();
  const all = selector => [...document.querySelectorAll(selector)];
  const summaryDisabled = document.querySelector("[data-tab=summary]").disabled;
  const entry = state.tab;
  let portraits = 0, pairs = 0, graphs = 0, mvpRows = 0;
  if (!summaryDisabled) {
    for (const player of state.players) {
      document.querySelector(`[data-summary-portrait="${player.slot}"]`).click();
      if (Summary.selected() !== player) throw new Error(`Summary selected the wrong slot ${player.slot}`);
      for (const button of all("#summaryView [data-summary-stat]")) button.click();
      portraits++;
    }
  }
  clickTab("graphs");
  for (const graph of availableGraphs()) {
    openGraph(graph.id);
    setSel(new Set(state.players.slice(0, 2).map(p => p.slot)));
    renderAll();
    graphs++;
    if (!graph.events) continue;
    const { build } = lineMaker(graph, "value");
    for (const player of state.players) {
      const pts = build(player, graph.get);
      const [time, value] = pts.at(-1);
      if (time !== state.match.duration_s || value !== player.raw[graph.id] || pts.some((p, i) => i && p[0] < pts[i - 1][0])) {
        throw new Error(`Slot ${player.slot} ended at ${time}s with ${value} ${graph.id}, scoreboard has ${player.raw[graph.id]}`);
      }
    }
  }
  clickTab("matchups");
  for (const stat of all("#muView [data-stat]").map(button => button.dataset.stat)) {
    document.querySelector(`#muView [data-stat=${stat}]`).click();
    for (const win of all("#muView [data-win]:enabled").map(button => button.dataset.win)) {
      document.querySelector(`#muView [data-win=${win}]`).click();
      const cells = all(".muCell").map(({ dataset: { a, b } }) => [a, b]);
      for (const [a, b] of cells) {
        const cell = document.querySelector(`.muCell[data-a="${a}"][data-b="${b}"]`);
        if (cell.classList.contains("on")) cell.click();
        document.querySelector(`.muCell[data-a="${a}"][data-b="${b}"]`).click();
        const rendered = all(".muSide").map(button => button.dataset.hero);
        if (rendered.length !== 2 || !rendered.includes(a) || !rendered.includes(b)) {
          throw new Error(`Stale detail for ${stat}/${win}, pair ${a}/${b} showed ${rendered}`);
        }
        pairs++;
      }
    }
  }
  clickTab("mvp");
  for (const mode of all("#mvpView [data-mode]").map(btn => btn.dataset.mode)) {
    document.querySelector(`#mvpView [data-mode=${mode}]`).click();
    for (const slot of all(".mvpRow").map(btn => btn.dataset.slot)) {
      document.querySelector(`.mvpRow[data-slot="${slot}"]`).click();
      if (state.mvpPick !== Number(slot)) throw new Error(`MVP selected the wrong slot ${slot}`);
      mvpRows++;
    }
  }
  return { entry, summaryDisabled, portraits, pairs, graphs, mvpRows, errors: auditErrors };
}

test("audit match corpus: all 20 matches and Monday's K/D reproduction", {
  skip: !process.env.PM_AUDIT_MATCHES && "Set PM_AUDIT_MATCHES and PM_AUDIT_MONDAY to the saved audit fixtures",
  timeout: 480_000,
}, async t => {
  const count = { portraits: 0, pairs: 0, graphs: 0, mvpRows: 0 };
  for (const id of audited) {
    const data = JSON.parse(await readFile(join(process.env.PM_AUDIT_MATCHES, `${id}.json`), "utf8"));
    const info = data.match_info || data, brawl = info.game_mode === 4;
    routes.set(`/v1/matches/${id}/metadata`, res => json(res, data));
    await navigate(`/?match=${id}`);
    await loaded(id);
    const result = await page(`(${sweepMatch.toString()})()`);
    assert.equal(result.entry, brawl ? "graphs" : "summary", String(id));
    assert.equal(result.summaryDisabled, brawl, String(id));
    assert.equal(result.portraits, brawl ? 0 : 12, String(id));
    assert.equal(result.mvpRows, brawl ? 16 : 36, String(id));
    assert.ok(result.pairs >= (brawl ? 48 : 108), String(id));
    assert.deepEqual(result.errors, [], String(id));
    for (const key of Object.keys(count)) count[key] += result[key];
  }
  assert.ok(process.env.PM_AUDIT_MONDAY, "Use PM_AUDIT_MONDAY for the saved 136949669.json from the previous audit");
  const monday = JSON.parse(await readFile(process.env.PM_AUDIT_MONDAY, "utf8"));
  routes.set("/v1/matches/136949669/metadata", res => json(res, monday));
  await navigate("/?match=136949669&tab=graphs&graph=kills&players=3");
  await loaded(136949669);
  assert.deepEqual(await page(`(() => {
    const [line] = seriesFor(graphNow());
    return [line.pts.at(-1), auditErrors];
  })()`), [[monday.match_info.duration_s, 11], []]);
  t.diagnostic(`20 matches plus 136949669. ${count.portraits} Summary portraits, ${count.graphs} graphs, ${count.pairs} Matchups pairs, ${count.mvpRows} MVP rows.`);
});

function serveFilterProfile() {
  const id = Number(profile.profile.account_id);
  const mateId = profile.mates.all[0].mate_id;
  const ranked = profile.history.find(m => m.game_mode === 1 && m.match_mode === 4);
  const unranked = profile.history.find(m => m.game_mode === 1 && m.match_mode === 1);
  routes.set(`/v1/players/${id}/match-history`, res => json(res, profile.history));
  routes.set(`/v1/players/${id}/mate-stats`, res => json(res, [{
    mate_id: mateId, matches_played: 2, wins: 1, matches: [ranked.match_id, unranked.match_id],
  }]));
  routes.set("/v1/players/steam", res => json(res, [profile.profile, ...profile.names]));
  return { id, mateId, ranked };
}

test("recent profiles persist while other settings reset in new tabs and browser sessions", async () => {
  const { id, mateId, ranked } = serveFilterProfile();
  routes.set("/v1/assets/heroes", res => json(res, []));

  // Start with the old site's storage and use the real account-saving entry point.
  routes.set("/storage-seed.html", res => res.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html>"));
  await navigate("/__fixture/storage-seed.html");
  await waitPage("location.pathname === '/__fixture/storage-seed.html'");
  const legacy = {
    pm_mode: "street_brawl", pm_with: JSON.stringify({ p: id, id: mateId, kind: "team" }),
    "postmortem.markers": '{"obj":true}',
    "postmortem.summary.hideNegativeTags": "1", "postmortem.perf": "1", pm_hero_art3: "{}", dlhideout_test: "{}",
  };
  const sessionKeys = JSON.stringify(Object.keys(legacy));
  const recent = Array.from({ length: 6 }, (_, i) => ({ id: id + i + 1, name: `Recent player ${i + 1}`, avatar: "" }));
  const storedRecent = "JSON.parse(localStorage.getItem('pm_recent_profiles'))";
  await page(`
    localStorage.clear(); sessionStorage.clear();
    Object.entries(${JSON.stringify(legacy)}).forEach(([key, value]) => localStorage.setItem(key, value));
    localStorage.setItem('pm_recent_profiles', ${JSON.stringify(JSON.stringify(recent))});
  `);
  const storedKeys = (area) => page(`${sessionKeys}.filter(key => ${area}.getItem(key) !== null)`);
  await navigate("/profile.html");
  await waitPage("document.querySelector('#accountTitle')");
  assert.deepEqual(await page(storedRecent), recent);
  assert.deepEqual(await page("Array.from(document.querySelectorAll('.recent [data-id]'), link => Number(link.dataset.id))"),
    recent.map(player => player.id));
  assert.deepEqual(await storedKeys("localStorage"), []);
  assert.deepEqual(await storedKeys("sessionStorage"), []);

  const assertDefaults = async () => {
    await waitPage(`document.querySelector('.head h1')?.textContent === ${JSON.stringify(profile.profile.personaname)}`);
    assert.deepEqual(await page(`[
      document.querySelector('#matches [data-mode][aria-pressed="true"]').dataset.mode,
      Boolean(document.querySelector('#clearWith')), P.hero, P.mateMode, P.range
    ]`), ["all", false, null, "party", "all"]);
    assert.equal(await page("localStorage.getItem('pm_me')"), String(id));
  };

  await navigate(`/profile.html?me=${id}`);
  await assertDefaults();
  const expectedRecent = [{ id, name: profile.profile.personaname, avatar: "" }, ...recent.slice(0, 5)];
  assert.deepEqual(await page(storedRecent), expectedRecent);
  assert.equal(await page("sessionStorage.getItem('pm_recent_profiles')"), null);
  await waitPage("P.mates");
  await page(`
    document.querySelector('[data-mode="ranked"]').click();
    document.querySelector('#withBtn').click();
    document.querySelector('[data-wkind="team"]').click();
    document.querySelector('[data-pick="${mateId}"]').click();
  `);
  const assertFiltered = async () => {
    await waitPage(`location.pathname === '/profile.html' && typeof P !== 'undefined' && P?.games[0]?.match_id === ${ranked.match_id}`);
    assert.deepEqual(await page("[P.mode, P.withId, P.withKind, P.games.map(m => m.match_id)]"),
      ["ranked", mateId, "team", [ranked.match_id]]);
  };
  await assertFiltered();
  await page("window.beforeStorageReload = true");
  await send("Page.reload");
  await waitPage("!window.beforeStorageReload");
  await assertFiltered();
  await page(`
    document.querySelector('#matches [data-mode="all"]').click();
    document.querySelector('[data-mates="all"]').click();
    document.querySelector('#matches [data-mode="ranked"]').click();
    document.querySelector('.hRow[data-hero="${ranked.hero_id}"]').click();
  `);
  assert.deepEqual(await page("[P.hero, P.mateMode]"), [ranked.hero_id, "all"]);

  await navigate("/hideout-test.html");
  await waitPage("document.querySelector('#count')?.textContent === '1'");
  // A previously hidden tag preference keeps the checkbox visible on this fixture.
  await page("sessionStorage.setItem('postmortem.summary.hideNegativeTags', '1')");
  await navigate(`${localMatch}&tab=summary`);
  await loaded(standardId);
  await page(`
    document.querySelector('.markToggle[data-mark="obj"]').click();
    document.querySelector('[data-summary-negative]').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', shiftKey: true }));
  `);
  assert.equal(await page("sessionStorage.getItem('postmortem.summary.hideNegativeTags')"), "0");
  assert.deepEqual(await storedKeys("localStorage"), []);
  assert.deepEqual(await storedKeys("sessionStorage"), Object.keys(legacy));

  const assertFreshOpen = async () => {
    await navigate("/__fixture/storage-seed.html");
    await waitPage("location.pathname === '/__fixture/storage-seed.html'");
    assert.deepEqual(await storedKeys("sessionStorage"), []);
    assert.deepEqual(await page(storedRecent), expectedRecent);
    await navigate("/profile.html");
    await assertDefaults();
    assert.deepEqual(await page(storedRecent), expectedRecent);
  };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  await connectPage(targetId);
  await assertFreshOpen();

  await stopBrowser();
  await startBrowser();
  await assertFreshOpen();
});

test("profile filter URLs override tab choices and still apply the existing filters", async () => {
  const { id, mateId, ranked } = serveFilterProfile();
  await navigate(`/profile.html?id=${id}`);
  await waitPage("typeof P !== 'undefined' && P?.mates");
  await page("sessionStorage.setItem('pm_mode', 'unranked')");
  await navigate(`/profile.html?id=${id}&mode=ranked&with=${mateId}&withKind=team&hero=${ranked.hero_id}`);
  await waitPage(`P?.mates && P?.withId === ${mateId} && matchList().length === 1`);
  assert.deepEqual(await page("[P.mode, P.withKind, P.hero, matchList()[0].match_id]"),
    ["ranked", "team", ranked.hero_id, ranked.match_id]);
  await page("document.querySelector('#clearWith').click(); document.querySelector('#clearHero').click()");
  assert.equal(await page("new URL(location.href).search"), `?id=${id}&mode=ranked`);
});
