// Inspect old and new cards on local static servers and capture 1920x1080 screenshots.
// Usage: node tools/check_length_screens.cjs <directory-of-match-json-files>
"use strict";
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { once } = require("node:events");
const { chromium } = require(process.env.PM_PLAYWRIGHT || "playwright");

const root = path.resolve(__dirname, "..");
const fixtures = path.resolve(process.argv[2]);
const cases = [
  ["short", 137019499, 8],
  ["short", 136975905, 12],
  ["short", 136996376, 3],
  ["typical", 136942808, 6],
  ["typical", 136941488, 8],
  ["typical", 136942360, 10],
  ["long", 137021431, 11],
  ["long", 137022588, 4],
  ["long", 137029881, 9],
  ["long", 136966554, 2],
  ["long", 136934088, 11],
];
const mime = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2",
};

async function serve(old) {
  const cache = new Map();
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const key = pathname === "/" ? "index.html" : pathname.slice(1);
    const fixture = /^test\/(\d+)\.json$/.exec(key);
    const file = fixture ? path.join(fixtures, fixture[1] + ".json") : path.resolve(root, key);
    if (!fixture && !file.startsWith(root + path.sep)) return res.writeHead(404).end();
    try {
      if (!cache.has(key)) {
        const fromGit = old && [
          "mvp.js", "heronorms.js", "scoring.js", "summary/summary.js",
          "data/hero_percentiles.json", "summary/percentile.js",
        ].includes(key);
        cache.set(
          key,
          fromGit ? execFileSync("git", ["show", "88daa51:" + key], { cwd: root, maxBuffer: 25e6 }) : fs.readFileSync(file)
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

async function inspect(browser, old, before = []) {
  const server = await serve(old);
  const origin = "http://127.0.0.1:" + server.address().port;
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  await page.route(url => url.protocol === "https:", route => route.abort());
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const results = [];
  const shots = path.join(root, "docs/length-norms-screens");
  if (!old) fs.mkdirSync(shots, { recursive: true });
  try {
    for (const [group, id, slot] of cases) {
      await page.goto(origin + "/?match=" + id + "&src=test/" + id + ".json&pick=" + slot);
      await page.waitForFunction(
        s => window.Summary?.selected()?.slot === s && document.querySelector(".hl-hero") && state.tab === "summary",
        slot
      );
      await page.evaluate(async () => { await SummaryPercentiles.load(); Summary.render(); await document.fonts.ready; });
      const obs = await page.evaluate(async ({ old, id, slot, originalStat }) => {
        const info = state.match;
        const view = await Summary.inspectCards(info, slot), card = view.candidates.sweep;
        const p = state.players.find(q => q.slot === slot), v = valveRows().find(r => r.p === p).v;
        const host = document.createElement("div");
        host.innerHTML = view.cardHtml(card);
        const get = sel => host.querySelector(sel)?.textContent.trim();
        const labelToIdx = {
          "Kills": 0, "Assists": 1, "Deaths": 2, "Souls": 3,
          "Objective damage": 4, "Hero damage + ally healing": 5,
        };
        const idx = p.heroId === 67 ? 5 : labelToIdx[card.leadLabel];
        const keys = ["kills", "assists", "deaths", "souls", "objective_damage", "dmg_and_ally_heal"];
        const key = originalStat || keys[idx], statIndex = keys.indexOf(key), duration = info.duration_s;
        const raw = statIndex === 3 ? p.souls : v.values[statIndex];
        const usesRate = old && duration < 1200;
        const b = SummaryPercentiles.bounds(p.heroId, usesRate ? key + "_per_min" : key,
          usesRate ? raw * 60 / duration : raw, duration);
        const pct = SummaryPercentiles.pct(p.heroId, usesRate ? key + "_per_min" : key,
          usesRate ? raw * 60 / duration : raw, duration);
        const hero = old ? HERO_NAMES[v.graded_hero] : p.hero;
        const mean = old ? HERO_TABLE.heroes[v.graded_hero].mean[statIndex] : v.means[statIndex];
        const rows = [...host.querySelectorAll(".hl-sweep-row")].map(el => ({
          label: el.querySelector(".hl-sweep-label")?.textContent.trim(),
          word: el.querySelector(".hl-sweep-word")?.textContent.trim(),
          tip: el.dataset.summaryTip || "",
        }));
        return {
          id, slot, hero: p.hero, heroId: p.heroId, duration, key, actual: raw,
          mean: Number(mean.toFixed(2)), median: Number((pct?.p50 ?? 0).toFixed(2)),
          pct: pct?.pct ?? null, better: b?.better ?? null, worse: b?.worse ?? null,
          fallback: b?.ref?.fallback ?? null,
          avgLabel: "Avg " + hero + (old ? "" : " in " + PM_SCORE.lengthLabel(duration)) + ": " + fmtStat(mean),
          kicker: get(".hl-kicker"), big: get(".hl-big"), detail: get(".hl-of"),
          rows, damage: p.stats.at(-1).player_damage, healing: p.stats.at(-1).teammate_healing,
          valveScore: Number(v.score.toFixed(2)), flatScore: Number((v.flatScore ?? v.score).toFixed(2)),
        };
      }, { old, id, slot, originalStat: before.find(e => e.id === id && e.slot === slot)?.key });
      results.push({ group, ...obs });
      if (!old && (id === 136966554 || id === 137019499)) {
        await page.reload();
        await page.waitForSelector("[data-hl-card=sweep]");
        await page.evaluate(async () => { await SummaryPercentiles.load(); Summary.render(); await document.fonts.ready; });
        await page.screenshot({ path: path.join(shots, group + "-summary.png") });
        const row = page.locator("[data-hl-card=sweep] .hl-sweep-row").first();
        await row.focus();
        await page.waitForSelector("#summaryTip:not([hidden])");
        await page.screenshot({ path: path.join(shots, group + "-highlight.png") });
        await page.click("[data-tab=mvp]");
        await page.click('.mvpRow[data-slot="' + slot + '"]');
        await page.waitForSelector(".whyTable.valve");
        await page.screenshot({ path: path.join(shots, group + "-mvp.png") });
      }
    }
    if (errors.length) throw new Error(errors.join("\n"));
    return results;
  } finally {
    await page.close();
    server.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PM_AUDIT_CHROME });
  try {
    const before = await inspect(browser, true);
    const after = await inspect(browser, false, before);
    console.log(JSON.stringify({ before, after }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
