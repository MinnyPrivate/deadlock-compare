// Shared helpers for the dealer's Node tools (calibration, simulation, example hands). Not used by the site.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

export function loadNorms(dir = path.join(root, "data/deal-norms")) {
  const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
  const heroes = {};
  for (const id of index.heroes) {
    const f = path.join(dir, `hero_${id}.json`);
    if (fs.existsSync(f)) heroes[id] = JSON.parse(fs.readFileSync(f, "utf8"));
  }
  return { index, heroes };
}

// The estimated Valve score (scoring.js with the hero table). Used for the Crown margin and The Uncrowned.
export function loadScore() {
  const win = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, "heronorms.js"), "utf8"), { window: win });
  const scoring = require(path.join(root, "scoring.js"));
  return { scoreMatch: scoring.scoreMatch, table: win.HERO_TABLE };
}

export function* sampleMatches(dir, filter) {
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json.gz")) continue;
    const id = Number(f.split(".")[0]);
    if (filter && !filter(id)) continue;
    try { yield { id, data: JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString("utf8")) }; } catch (e) { /* skip a bad file */ }
  }
}

export const quantile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))] : null;
export { root };
