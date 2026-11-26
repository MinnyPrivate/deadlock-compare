// Capture old (0b3306c) vs new (working tree) live Chromium numbers for 5 under-20 matches,
// verify visible version-mismatch warning in the browser, and save fresh 1920x1080 screenshots.
// Usage: node tools/check_short_round2.cjs <directory-of-under20-match-json-files>
"use strict";
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { once } = require("node:events");
const { chromium } = require(process.env.PM_PLAYWRIGHT || process.env.PM_FAST_PLAYWRIGHT || "playwright");

const root = path.resolve(__dirname, "..");
const fixtures = path.resolve(process.argv[2]);
const cases = [
  [137022293, 6],  // 13:47 Seven
  [137035207, 10], // 14:23 Yamato
  [137047216, 9],  // 13:17 Haze
  [137027801, 11], // 16:18 Holliday
  [137019499, 8],  // 18:29 Mirage
];
const mime = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2",
};

async function serve(gitRef, stalePercentiles = false) {
  const cache = new Map();
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const key = pathname === "/" ? "index.html" : pathname.slice(1);
    const fixture = /^test\/(\d+)\.json$/.exec(key);
    const file = fixture ? path.join(fixtures, fixture[1] + ".json") : path.resolve(root, key);
    if (!fixture && !file.startsWith(root + path.sep)) return res.writeHead(404).end();
    try {
      if (stalePercentiles && key === "data/hero_percentiles.json") {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        parsed.version = "2026-11-24.1-stale";
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(parsed));
        return;
      }
      if (!cache.has(key)) {
        const fromGit = gitRef && [
          "mvp.js", "heronorms.js", "scoring.js", "summary/summary.js",
          "data/hero_percentiles.json", "summary/percentile.js",
        ].includes(key);
        cache.set(
          key,
          fromGit ? execFileSync("git", ["show", gitRef + ":" + key], { cwd: root, maxBuffer: 25e6 }) : fs.readFileSync(file)
        );
      }
      res.writeHead(200, { "Content-Type": mime[path.extname(key)] || "application/octet-stream" }).end(cache.get(key));
    } catch {
      res.writeHead(404).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}

async function inspect(browser, gitRef) {
  const server = await serve(gitRef);
  const origin = "http://127.0.0.1:" + server.address().port;
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  await page.route(url => url.protocol === "https:", route => route.abort());
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const results = [];
  const shots = path.join(root, "docs/length-norms-screens");
  if (!gitRef) fs.mkdirSync(shots, { recursive: true });
  try {
    for (const [id, slot] of cases) {
      await page.goto(origin + "/?match=" + id + "&src=test/" + id + ".json&pick=" + slot);
      await page.waitForFunction(
        s => window.Summary?.selected()?.slot === s && document.querySelector(".hl-hero") && state.tab === "summary",
        slot
      );
      await page.evaluate(async () => { await SummaryPercentiles.load(); Summary.render(); await document.fonts.ready; });
      const obs = await page.evaluate(async ({ id, slot }) => {
        const info = state.match;
        const view = await Summary.inspectCards(info, slot);
        const card = view.candidates.sweep;
        const placeCard = view.candidates.place;
        const p = state.players.find(q => q.slot === slot);
        const mvpRow = valveRows().find(r => r.p === p);
        const v = mvpRow.v;
        const host = document.createElement("div");
        host.innerHTML = view.cardHtml(card);
        const get = (rootEl, sel) => rootEl.querySelector(sel)?.textContent.trim();
        const placeHost = document.createElement("div");
        placeHost.innerHTML = view.cardHtml(placeCard);
        const keys = ["kills", "assists", "deaths", "souls", "objective_damage", "dmg_and_ally_heal"];
        const stats = {};
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          const val = i === 3 ? p.souls : v.values[i];
          const b = SummaryPercentiles.bounds(p.heroId, k, val, info.duration_s);
          const pct = SummaryPercentiles.percentile(b);
          stats[k] = {
            actual: val,
            expectedMean: Number(b.ref.mean.toFixed(1)),
            median: Number(pct.p50.toFixed(1)),
            pct: pct.pct,
            better: b.better,
            worse: b.worse,
          };
        }
        const rows = [...host.querySelectorAll(".hl-sweep-row")].map(el => ({
          label: el.querySelector(".hl-sweep-label")?.textContent.trim(),
          word: el.querySelector(".hl-sweep-word")?.textContent.trim(),
          tip: el.dataset.summaryTip || "",
        }));
        const rest = host.querySelector(".hl-sweep-rest")?.textContent.trim() || "";
        return {
          id, slot, hero: p.hero, heroId: p.heroId, duration: info.duration_s,
          kda: `${p.raw.kills}/${p.raw.deaths}/${p.raw.assists}`,
          souls: p.souls,
          mvpTabPlace: mvpRow.place,
          summaryPlace: get(placeHost, ".hl-big"),
          summaryPlaceSub: get(placeHost, ".hl-sub"),
          valveScore: Number(v.score.toFixed(2)),
          flatScore: Number(v.flatScore.toFixed(2)),
          kicker: get(host, ".hl-kicker"),
          big: get(host, ".hl-big"),
          detail: get(host, ".hl-of"),
          rows,
          rest,
          stats,
        };
      }, { id, slot });
      results.push(obs);

      if (!gitRef && id === 137022293) {
        await page.reload();
        await page.waitForSelector("[data-hl-card=sweep]");
        await page.evaluate(async () => { await SummaryPercentiles.load(); Summary.render(); await document.fonts.ready; });
        await page.screenshot({ path: path.join(shots, "short-r2-summary.png") });
        const row = page.locator("[data-hl-card=sweep] .hl-sweep-row").first();
        await row.focus();
        await page.waitForSelector("#summaryTip:not([hidden])");
        await page.screenshot({ path: path.join(shots, "short-r2-highlight.png") });
        await page.click("[data-tab=mvp]");
        await page.click('.mvpRow[data-slot="' + slot + '"]');
        await page.waitForSelector(".whyTable.valve");
        await page.screenshot({ path: path.join(shots, "short-r2-mvp.png") });
      }
    }
    if (errors.length) throw new Error(errors.join("\n"));
    return results;
  } finally {
    await page.close();
    server.close();
  }
}

async function checkStaleWarning(browser) {
  const server = await serve(null, true);
  const origin = "http://127.0.0.1:" + server.address().port;
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  await page.route(url => url.protocol === "https:", route => route.abort());
  const warnings = [];
  page.on("console", msg => { if (msg.type() === "warning") warnings.push(msg.text()); });
  try {
    await page.goto(origin + "/?match=137022293&src=test/137022293.json&pick=6");
    await page.waitForSelector("[data-hl-card=sweep]");
    await page.evaluate(async () => { await SummaryPercentiles.load(); Summary.render(); });
    const ui = await page.evaluate(() => ({
      kicker: document.querySelector("[data-hl-card=sweep] .hl-kicker")?.textContent.trim(),
      sub: document.querySelector("[data-hl-card=sweep] .hl-sub")?.textContent.trim(),
    }));
    return { warnings, ui };
  } finally {
    await page.close();
    server.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PM_AUDIT_CHROME });
  try {
    const old0b3306c = await inspect(browser, "0b3306c");
    const newWorktree = await inspect(browser, null);
    const staleCheck = await checkStaleWarning(browser);
    console.log(JSON.stringify({ old0b3306c, newWorktree, staleCheck }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
