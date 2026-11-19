"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { mkdtemp, readFile } = require("node:fs/promises");
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
let browser, socket, server, origin, send, browserExit;

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
    if (url.pathname === "/api/v1/companion/session") return json(res, { state: "paused" }, 503);
    if (url.pathname.startsWith("/__fixture/")) {
      const route = routes.get(url.pathname.slice("/__fixture".length));
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

  const userData = await mkdtemp(join(tmpdir(), "postmortem-audit-chrome-"));
  browser = spawn(chrome, ["--headless=new", "--no-first-run", "--disable-background-networking", "--disable-extensions",
    "--remote-debugging-port=0", `--user-data-dir=${userData}`, "about:blank"], { stdio: "ignore", windowsHide: true });
  browserExit = once(browser, "exit").catch(() => {});
  await once(browser, "spawn");
  const portFile = join(userData, "DevToolsActivePort");
  const port = await until(async () => {
    try { return (await readFile(portFile, "utf8")).split(/\r?\n/)[0]; }
    catch (error) {
      if (error.code === "ENOENT" || error.code === "EBUSY") return false;
      throw error;
    }
  }, "Chrome debug port", 8000);
  const target = await until(async () => {
    try { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === "page"); }
    catch (_) { return false; }
  }, "Chrome debug target");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", fail, { once: true }); });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message));
    else callback.done(message.result);
  });
  send = (method, params) => new Promise((done, reject) => {
    pending.set(++id, { done, reject });
    socket.send(JSON.stringify({ id, method, params }));
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
    const originalFetch = window.fetch;
    window.fetch = (input, options) => {
      const url = new URL(input, location.href);
      if (url.hostname === "api.deadlock-api.com" || url.hostname === "assets.deadlock-api.com") {
        input = "/__fixture" + url.pathname + url.search;
      }
      return originalFetch(input, options);
    };
  ` });
});

after(async () => {
  if (send && socket?.readyState === WebSocket.OPEN) await Promise.race([send("Browser.close").catch(() => {}), delay(500)]);
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (browser && browser.exitCode === null) browser.kill();
  await browserExit;
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
  await page("document.querySelector('#profileLookup').click(); true");
  await waitPage("location.pathname === '/profile.html'");
  await waitPage("document.querySelector('#q') !== null");
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
  assert.deepEqual(await page(`(async () => {
    const w = state.wait;
    for (let i = 0; i < 5; i++) await check(w, w.id, loadSeq);
    return { failures: w.failures, stopped: w.stopped, retry: !!document.querySelector('#status .retry') };
  })()`), { failures: { salts: 0, metadata: 5 }, stopped: "down", retry: true });
  assert.equal(officialCalls, 6);
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

test("U2: a preview uses Graphs and opens Summary when eligible official data arrives", async () => {
  await navigate(localMatch);
  await loaded(standardId);
  const result = await page(`(() => {
    const official = {...state.match};
    state.previewSlot = state.players[0].slot;
    setup({...official});
    const preview = [state.tab, document.querySelector('[data-tab=summary]').disabled];
    show(official, loadSeq);
    const upgraded = [state.tab, document.querySelector('[data-tab=summary]').disabled];
    state.previewSlot = state.players[0].slot;
    setup({...official});
    document.querySelector('[data-tab=mvp]').click();
    show({...official}, loadSeq);
    return {preview, upgraded, manual: state.tab};
  })()`);
  assert.deepEqual(result, { preview: ["graphs", true], upgraded: ["summary", false], manual: "mvp" });
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
