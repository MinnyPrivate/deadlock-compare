// On-demand diagnostic. Run with node test/card-layout-check.mjs.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join, resolve, sep, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(new URL("../", import.meta.url)));
const reportFile = join(repo, "docs/handoffs/2026-11-20-card-gallery-failures.md");
const screenshots = process.argv[2] === "--screenshots" ? process.argv[3] : null;
assert.ok(process.argv.length === 2 || (process.argv.length === 4 && screenshots),
  "Usage: node test/card-layout-check.mjs [--screenshots DIRECTORY]");

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  if (process.env.PM_PLAYWRIGHT) return require(resolve(process.env.PM_PLAYWRIGHT));
  try { return require("playwright"); } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
  }
  // Reuse an existing Playwright CLI cache without running npm or downloading anything.
  const npmCache = process.env.npm_config_cache || (process.platform === "win32"
    ? join(process.env.LOCALAPPDATA, "npm-cache") : join(process.env.HOME, ".npm"));
  const cache = join(npmCache, "_npx");
  for (const entry of (existsSync(cache) ? await readdir(cache) : []).sort()) {
    const module = join(cache, entry, "node_modules", "playwright");
    if (existsSync(join(module, "package.json"))) return require(module);
  }
  throw new Error("Set PM_PLAYWRIGHT to your existing Playwright package directory.");
}

const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const file = resolve(repo, "." + path);
    if (!file.startsWith(repo + sep) || !mime[extname(file)]) return res.writeHead(404).end();
    const bytes = await readFile(file);
    res.writeHead(200, { "Content-Type": mime[extname(file)] }).end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});

// Runs in the page. Direct text ranges avoid counting a parent and child twice, and report every
// line fragment. The containing element supplies visibility, scroll/client sizes and the clip box.
function measure(card) {
  const tolerance = 1;
  const issues = [];
  const pixels = value => Math.round(value * 10) / 10;
  const dimensions = (width, height) => `${pixels(width)} × ${pixels(height)} px`;
  const describe = element => element.localName + [...element.classList].map(name => "." + name).join("");
  const box = card.getBoundingClientRect();
  const viewport = { top: 0, left: 0, right: document.documentElement.clientWidth, bottom: innerHeight };
  const style = new Map();
  const css = element => {
    if (!style.has(element)) style.set(element, getComputedStyle(element));
    return style.get(element);
  };
  const clips = value => ["hidden", "clip", "scroll", "auto"].includes(value);
  // These selectors explicitly use single-line ellipsis in summary.css. Allow the intentional
  // horizontal truncation only inside that element's own clip box.
  const ellipsis = ".summary-name, .hl-kicker, .hl-you-pin, .hl-dot-name, .hl-duel-bars span, .hl-best-list span, .hl-col small";
  const path = element => {
    const parts = [];
    for (let current = element; current !== card; current = current.parentElement) {
      const i = Array.prototype.indexOf.call(current.parentElement.children, current) + 1;
      parts.unshift(describe(current) + `[${i}]`);
    }
    return parts.join(" > ");
  };
  const spill = (rect, bounds) => ({
    left: Math.max(0, bounds.left - rect.left), right: Math.max(0, rect.right - bounds.right),
    top: Math.max(0, bounds.top - rect.top), bottom: Math.max(0, rect.bottom - bounds.bottom),
  });
  const addSpill = (label, kind, gaps, size) => {
    const edges = Object.entries(gaps).filter(([, amount]) => amount > tolerance);
    if (!edges.length) return;
    issues.push({ kind, elements: label, pixels: `${edges.map(([edge, amount]) => `${edge} ${pixels(amount)} px`).join(", ")} · ${size}`,
      severity: Math.max(...edges.map(([, amount]) => amount)) });
  };
  const effective = [], checkedClips = new Set();
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const element = node.parentElement;
    if (element.closest("title, desc, script, style")) continue;
    const chain = [];
    for (let current = element; current !== card; current = current.parentElement) chain.push(current);
    if (chain.some(item => {
      const s = css(item);
      return s.display === "none" || s.visibility !== "visible" || Number(s.opacity) === 0;
    })) continue;
    const range = document.createRange();
    const text = node.textContent;
    range.setStart(node, text.length - text.trimStart().length);
    range.setEnd(node, text.trimEnd().length);
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
    if (!rects.length) continue;
    const label = `${path(element)} “${text.trim().replace(/\s+/g, " ")}”`;

    const clipBoxes = chain.flatMap(item => {
      const s = css(item);
      if (!item.clientWidth || !item.clientHeight || !(clips(s.overflowX) || clips(s.overflowY))) return [];
      const rect = item.getBoundingClientRect();
      const scaleX = item.offsetWidth ? rect.width / item.offsetWidth : 1;
      const scaleY = item.offsetHeight ? rect.height / item.offsetHeight : 1;
      const left = rect.left + item.clientLeft * scaleX, top = rect.top + item.clientTop * scaleY;
      const intentional = item.matches(ellipsis) && s.textOverflow === "ellipsis" && s.whiteSpace === "nowrap";
      const bounds = { left, top, right: left + item.clientWidth * scaleX, bottom: top + item.clientHeight * scaleY };
      // CSS line clamps create hidden text overflow even when the element itself fits inside the card.
      if (!checkedClips.has(item)) {
        checkedClips.add(item);
        const horizontal = clips(s.overflowX) && !intentional ? (item.scrollWidth - item.clientWidth) * scaleX : 0;
        const vertical = clips(s.overflowY) ? (item.scrollHeight - item.clientHeight) * scaleY : 0;
        addSpill(path(item), parseInt(s.webkitLineClamp, 10) > 0 ? "line clamp cuts text" : "element clips text",
          { horizontal, vertical }, `scroll ${dimensions(item.scrollWidth * scaleX, item.scrollHeight * scaleY)} · client ${dimensions(item.clientWidth * scaleX, item.clientHeight * scaleY)}`);
      }
      return [{ bounds, x: intentional }];
    });

    const fragments = [];
    for (const fragment of rects) {
      const rect = { left: fragment.left, right: fragment.right, top: fragment.top, bottom: fragment.bottom };
      for (const { bounds, x } of clipBoxes) {
        if (!x) continue;
        rect.left = Math.max(rect.left, bounds.left);
        rect.right = Math.min(rect.right, bounds.right);
      }
      if (rect.left >= rect.right) continue;
      // Chromium can return both the laid-out and truncated run on the same line for ellipsis.
      const sameLine = fragments.find(part => Math.abs(part.top - rect.top) < tolerance &&
        Math.abs(part.bottom - rect.bottom) < tolerance && part.left < rect.right && rect.left < part.right);
      if (sameLine) {
        sameLine.left = Math.min(sameLine.left, rect.left);
        sameLine.right = Math.max(sameLine.right, rect.right);
      } else fragments.push(rect);
    }
    for (const [i, rect] of fragments.entries()) {
      const name = fragments.length > 1 ? `${label} (fragment ${i + 1})` : label;
      const size = dimensions(rect.right - rect.left, rect.bottom - rect.top);
      addSpill(name, "card overflow", spill(rect, box), `text ${size} · card ${dimensions(box.width, box.height)}`);
      addSpill(name, "viewport overflow", spill(rect, viewport), `text ${size} · viewport ${dimensions(viewport.right, viewport.bottom)}`);
      effective.push({ name, rect });
    }
  }
  for (const [i, a] of effective.entries()) {
    for (const b of effective.slice(i + 1)) {
      const width = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const height = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      if (width > tolerance && height > tolerance) {
        issues.push({ kind: "text overlap", elements: `${a.name} / ${b.name}`, pixels: dimensions(width, height),
          severity: Math.min(width, height) });
      }
    }
  }
  return issues;
}

const sizes = { website: { width: 1920, height: 1080 }, ingame: { width: 1560, height: 912 } };
const states = ["rest", "hover"];
const failures = [];
const coverage = [];
const images = [];
const columns = ["Match", "Card", "State", "Width", "Failure", "Elements", "Pixels"];
const fields = ["match", "card", "state", "width", "kind", "elements", "pixels"];
const row = cells => "| " + cells.map(cell => String(cell).replaceAll("|", "\\|").replaceAll("\n", " ")).join(" | ") + " |";
const heading = names => [row(names), row(names.map(() => "---"))];

function checkFixtures(matches) {
  const byType = new Map(matches.map(match => [match.type, match]));
  const stomp = byType.get("Stomp win").facts;
  const comeback = byType.get("Comeback").facts;
  const loss = byType.get("Loss").facts;
  const quiet = byType.get("Quiet game");
  const brawl = byType.get("Street Brawl");
  assert.ok(stomp.won && stomp.afterFiveMin >= 0 && stomp.max >= 15000 && stomp.story === "Stomp");
  assert.ok(comeback.won && comeback.min <= -5000 && comeback.story === "Comeback");
  assert.ok(!loss.won && loss.final < 0);
  assert.ok(quiet.facts.kills / (quiet.seconds / 60) < 1.2);
  for (const id of ["rival", "moments", "lane", "bests"]) {
    assert.ok(quiet.cards.find(card => card.id === id).interest < 18);
  }
  assert.ok(brawl.mode === 4 && brawl.players === 8 && brawl.cards.every(card => !card.rendered));
}

async function checkControls(browser, origin) {
  const page = await browser.newPage({ viewport: sizes.website });
  try {
    await page.goto(origin + "/dev-cards.html");
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    const pair = page.locator('[data-match="136941488"] [data-card="place"]');
    const rest = pair.locator('[data-sample-state="rest"] .hl-card');
    const forced = pair.locator('[data-sample-state="hover"] .hl-card');
    const left = await rest.boundingBox(), right = await forced.boundingBox();
    assert.ok(right.x >= left.x + left.width && Math.abs(left.y - right.y) < 4, "Expected adjacent card samples");
    const visual = card => {
      const read = (el, keys) => keys.map(key => getComputedStyle(el)[key]);
      return [
        ...read(card, ["transform", "borderColor"]),
        ...read(card.querySelector(".hl-link"), ["color"]),
        ...read(card.querySelector(".hl-sub"), ["opacity", "transform"]),
        ...read(card.querySelector(".hl-more"), ["opacity", "transform", "visibility"]),
      ];
    };
    await rest.evaluate(card => { card.inert = false; card.focus({ preventScroll: true }); });
    // Wait for the live focus-within transition to reach the same end state as the forced card.
    await rest.evaluate(card => Promise.all(card.getAnimations({ subtree: true }).map(animation => animation.finished)));
    assert.deepEqual(await rest.evaluate(visual), await forced.evaluate(visual), "Forced card must match the actual focus-within visual");
    await page.getByRole("button", { name: "In-game panel" }).click();
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true" && !document.body.classList.contains("standalone"));
    assert.equal(new URL(page.url()).searchParams.get("width"), "ingame");
    await page.getByRole("button", { name: "Forced hover only" }).click();
    assert.equal(await page.locator("html").getAttribute("data-state"), "hover");
    assert.equal(new URL(page.url()).searchParams.get("state"), "hover");
  } finally {
    await page.close();
  }
}

async function checkGallery(browser, origin, width, state) {
  const page = await browser.newPage({ viewport: sizes[width], deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
  try {
    await page.goto(`${origin}/dev-cards.html?width=${width}&state=${state}`);
    await page.waitForFunction(() => ["true", "error"].includes(document.documentElement.dataset.ready));
    assert.equal(await page.locator("html").getAttribute("data-ready"), "true", await page.locator("#gallery-status").textContent());
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
    });
    const matches = await page.evaluate(() => window.cardGalleryCoverage);
    assert.ok(matches.length >= 5, "Expected at least five match rows");
    checkFixtures(matches);
    const catalog = matches[0].cards.map(card => card.id);
    assert.equal(new Set(catalog).size, catalog.length);
    const rendered = new Set();
    const entries = page.locator(`[data-sample-state="${state}"] .hl-card`);
    const unavailable = page.locator(`[data-sample-state="${state}"] .gallery-na`);
    let expected = 0;
    for (const match of matches) {
      assert.deepEqual(match.cards.map(card => card.id), catalog);
      for (const card of match.cards) {
        if (!card.rendered) continue;
        expected++;
        rendered.add(card.id);
      }
    }
    assert.deepEqual([...rendered].sort(), [...catalog].sort(), "Every card type must render on at least one match");
    assert.equal(await entries.count(), expected);
    assert.equal(await unavailable.count(), matches.length * catalog.length - expected);
    await page.mouse.move(0, 0);

    for (const entry of await entries.all()) {
      const context = await entry.evaluate(async card => {
        card.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
        await new Promise(resolve => requestAnimationFrame(resolve));
        return {
          match: card.closest("[data-match]").dataset.match, card: card.dataset.hlCard,
          forced: card.classList.contains("gallery-force-hover"), more: card.querySelector(".hl-more") &&
            getComputedStyle(card.querySelector(".hl-more")).visibility,
          width: card.getBoundingClientRect().width,
        };
      });
      assert.equal(context.forced, state === "hover");
      if (context.more) assert.equal(context.more, state === "hover" ? "visible" : "hidden");
      assert.ok(context.width > 0, "Card needs a measured width");
      const items = await entry.evaluate(measure);
      for (const item of items) failures.push({ match: context.match, card: context.card, width, state, ...item });
    }
    coverage.push({ width, state, expected, unavailable: matches.length * catalog.length - expected, matches });
    assert.deepEqual(errors, [], "Gallery page errors");

    if (screenshots) {
      await page.evaluate(() => scrollTo(0, 0));
      const prefix = `${width}-${state}`;
      const name = `${prefix}-full.png`;
      await page.screenshot({ path: join(screenshots, name), fullPage: true, animations: "disabled" });
      images.push([name, "Full gallery"]);
      for (const match of matches) {
        const file = `${prefix}-${match.id}.png`;
        const section = page.locator(`[data-match="${match.id}"]`);
        await section.screenshot({ path: join(screenshots, file), animations: "disabled" });
        images.push([file, `${match.type}, match ${match.id}`]);
      }
    }
  } finally {
    await page.close();
  }
}

async function run() {
  const { chromium } = await loadPlaywright();
  const chrome = process.env.PM_AUDIT_CHROME || (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "chromium");
  const browser = await chromium.launch({
    ...(existsSync(chrome) ? { executablePath: chrome } : process.platform === "win32" ? { channel: "chrome" } : {}),
  });
  try {
    await new Promise((done, fail) => server.listen(0, "127.0.0.1", done).once("error", fail));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await checkControls(browser, origin);
    if (screenshots) await mkdir(screenshots, { recursive: true });
    for (const width of Object.keys(sizes)) {
      for (const state of states) await checkGallery(browser, origin, width, state);
    }
  } finally {
    await browser.close();
    server.close();
  }

  failures.sort((a, b) => b.severity - a.severity);
  const table = [...heading(columns), ...failures.map(failure => row(fields.map(field => failure[field])))];
  const matrix = coverage.map(run => [run.width, run.state, run.expected, run.unavailable,
    failures.filter(failure => failure.width === run.width && failure.state === run.state).length]);
  const total = coverage.reduce((sum, run) => sum + run.expected, 0);
  const contents = [
    "# Highlights card gallery layout check", "",
    `${failures.length} findings across ${total} rendered card states in Chromium ${browser.version()}.`, "",
    ...heading(["Width", "State", "Rendered cards", "N/A tiles", "Findings"]), ...matrix.map(row), "",
    "The check scrolls each card into the viewport, compares visible text fragments, and checks clipping dimensions. Measurements are in screen pixels with a 1 px tolerance. Report order uses the largest overflow edge or the shorter overlap dimension.", "",
    ...table, "",
  ];
  await mkdir(dirname(reportFile), { recursive: true });
  await writeFile(reportFile, contents.join("\n"), "utf8");
  if (screenshots) {
    await writeFile(join(screenshots, "INDEX.md"), [
      "# Highlights card gallery", "",
      "November 20, 2026. Website screenshots use 1920 × 1080 and in-game screenshots use 1560 × 912. Full images include all five matches. Match crops provide shorter sections at the same scale.", "",
      ...heading(["Screenshot", "Section"]), ...images.map(([name, label]) => row([`[${name}](${name})`, label])), "",
    ].join("\n"), "utf8");
  }
  console.log(table.join("\n"));
  console.log(`${failures.length} findings across ${total} rendered card states. Wrote ${reportFile}`);
  process.exitCode = failures.length ? 1 : 0;
}

// Node discovers files under test/ even without a .test suffix. Keep this diagnostic opt-in.
if (!process.env.NODE_TEST_CONTEXT || process.env.PM_RUN_CARD_LAYOUT === "1") await run();
