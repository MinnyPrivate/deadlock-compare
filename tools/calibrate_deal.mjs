// Measures what the dealer needs from real matches and writes it into data/deal-norms/index.json (calibration):
//   cards     how often each Joker and event card fires (that is its rarity), overall and per hero (for the hero guard)
//   scenic    the distance cut for The Scenic Route
//   crown     the MVP margin cutoffs for a Legendary and a Mythical Crown
//   strength  the spread of hand strength per hero (so the dealer can size a hand by how strong the game was)
// Usage: node tools/calibrate_deal.mjs <dir of match .json.gz files> [--holdout-mod 3]
// Matches whose id is divisible by the holdout number are left out, for the simulation to test on.
import fs from "node:fs";
import path from "node:path";
import { loadNorms, loadScore, sampleMatches, quantile, root } from "./deal_lib.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("../deal/features.js"), C = require("../deal/catalog.js"), E = require("../deal/engine.js"), N = require("../deal/norms.js");

const dir = process.argv[2];
const mod = Number((process.argv.find((a, i) => process.argv[i - 1] === "--holdout-mod")) || 3);
const outDir = path.join(root, "data/deal-norms");
const norms = loadNorms(outDir);
const score = loadScore();
const train = id => id % mod !== 0;

// ---- pass 1: fire rates, scenic ratios, crown margins ----
const fires = {}, games = { all: 0 }, heroGames = {}, heroFires = {};
const dpm = {};            // hero -> distances per minute
const crownMargins = [];
const ratios = [];
let nMatches = 0;
for (const { id, data } of sampleMatches(dir, train)) {
  const m = F.buildMatch(data);
  if (m.duration < 600 || m.players.length < 12) continue;
  nMatches++;
  const scores = (() => { try { return new Map(score.scoreMatch(m.mi, score.table).players.map(x => [x.slot, x.score])); } catch (e) { return null; } })();
  for (const p of m.players) {
    if (p.left || !norms.heroes[p.hero_id]) continue;
    const d = F.pathDistance(m, p.slot);
    if (d != null) (dpm[p.hero_id] = dpm[p.hero_id] || []).push({ r: d / (m.duration / 60) });
    if (p.raw.mvp_rank === 1 && scores) { let rival = -Infinity; for (const [s, x] of scores) if (s !== p.slot && x > rival) rival = x; crownMargins.push(scores.get(p.slot) - rival); }
  }
}
// scenic: hero median distance per minute, cut = top 1.5% of ratio among all player-games
const dpmMedian = {}, allRatios = [];
for (const [h, arr] of Object.entries(dpm)) {
  if (arr.length < 30) continue;
  const s = arr.map(x => x.r).sort((a, b) => a - b);
  dpmMedian[h] = quantile(s, 0.5);
  for (const x of arr) allRatios.push(x.r / dpmMedian[h]);
}
allRatios.sort((a, b) => a - b);
const scenic = { dpm_median: dpmMedian, ratio_cut: quantile(allRatios, 0.985) };
crownMargins.sort((a, b) => a - b);
const crown = { n: crownMargins.length, legendary_margin: quantile(crownMargins, 0.88), mythical_margin: quantile(crownMargins, 0.988) };
console.log("scenic", scenic.ratio_cut, "crown", crown, "matches", nMatches);

// ---- pass 2: fire rates for every card, with a calibration that lets every card through ----
const cal = { scenic, crown, cards: {}, strength: null };
for (const cd of C.CARDS) cal.cards[cd.id] = { rate: 0.5 };      // placeholder so every detector runs; replaced below
norms.index.calibration = cal;
const counts = {}; let nGames = 0; const perHero = {};
for (const { id, data } of sampleMatches(dir, train)) {
  const m = F.buildMatch(data);
  if (m.duration < 600 || m.players.length < 12) continue;
  for (const p of m.players) {
    if (p.left || !norms.heroes[p.hero_id]) continue;
    const a = E.analyze(data, p.slot, norms, { score });
    if (a.stop) continue;
    a.opts = { score };
    nGames++;
    perHero[p.hero_id] = (perHero[p.hero_id] || 0) + 1;
    const node = { index: norms.index, heroes: norms.heroes, median: (hid, stat, dur) => N.median(norms, hid, stat, dur, a.band) };
    for (const cd of C.CARDS) {
      let hit = null;
      try { hit = cd.detect({ m, p, v: a.v, g: a.g, norms: node, scores: a.scores, opts: {} }); } catch (e) { hit = null; }
      if (hit) { counts[cd.id] = counts[cd.id] || { n: 0, h: {} }; counts[cd.id].n++; counts[cd.id].h[p.hero_id] = (counts[cd.id].h[p.hero_id] || 0) + 1; }
    }
  }
}
for (const cd of C.CARDS) {
  const c = counts[cd.id] || { n: 0, h: {} };
  const by_hero = {};
  for (const [h, n] of Object.entries(perHero)) if (n >= 100) by_hero[h] = { rate: (c.h[h] || 0) / n, n };
  cal.cards[cd.id] = { rate: Math.max(c.n, 0.5) / nGames, fired: c.n, n: nGames, by_hero };
}
console.log("games", nGames);
for (const cd of C.CARDS) console.log(cd.id.padEnd(24), (cal.cards[cd.id].rate * 100).toFixed(2) + "%", cal.cards[cd.id].fired, N.tierOfShare(cal.cards[cd.id].rate, cd.kind));

// ---- pass 3: hand strength distributions ----
const strengths = { good: [], bad: [] }, byHero = {};
for (const { id, data } of sampleMatches(dir, train)) {
  const m = F.buildMatch(data);
  if (m.duration < 600 || m.players.length < 12) continue;
  for (const p of m.players) {
    if (p.left || !norms.heroes[p.hero_id]) continue;
    const a = E.analyze(data, p.slot, norms, { score });
    if (a.stop) continue;
    a.opts = { score };
    let cands = E.candidates(a, norms, {});
    const red = E.reduce(cands, {});
    cands = E.limitJokers(red.kept).list;
    const gs = E.strengthOf(cands.filter(c => c.side !== "bad")), bs = E.strengthOf(cands.filter(c => c.side === "bad"));
    strengths.good.push(gs); strengths.bad.push(bs);
    const h = (byHero[p.hero_id] = byHero[p.hero_id] || { good: [], bad: [] });
    h.good.push(gs); h.bad.push(bs);
  }
}
function table(arr) {
  const s = arr.slice().sort((a, b) => a - b), v = [], c = [];
  for (const x of s) { if (v.length && v[v.length - 1] === x) c[c.length - 1]++; else { v.push(x); c.push((c.length ? c[c.length - 1] : 0) + 1); } }
  return { v, c, n: s.length };
}
cal.strength = { good: { all: table(strengths.good), by_hero: {} }, bad: { all: table(strengths.bad), by_hero: {} } };
for (const [h, x] of Object.entries(byHero)) if (x.good.length >= 300) { cal.strength.good.by_hero[h] = table(x.good); cal.strength.bad.by_hero[h] = table(x.bad); }
cal.sample = { matches: nMatches, player_games: nGames, holdout_mod: mod, built_utc: new Date().toISOString() };
const idxPath = path.join(outDir, "index.json");
const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
idx.calibration = cal;
fs.writeFileSync(idxPath, JSON.stringify(idx));
console.log("wrote calibration to", idxPath);
