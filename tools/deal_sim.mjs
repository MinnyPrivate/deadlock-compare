// Deals a hand to every player in a folder of real matches and checks the result against the rarity budget (bible 5.8).
// Usage: node tools/deal_sim.mjs <dir of match .json.gz> [--holdout-mod 3] [--all] [--json out.json]
// By default only matches whose id is divisible by the holdout number are used: those were NOT used to calibrate the dealer.
import fs from "node:fs";
import { loadNorms, loadScore, sampleMatches } from "./deal_lib.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("../deal/engine.js");

const args = process.argv.slice(2);
const dir = args[0];
const mod = Number(args[args.indexOf("--holdout-mod") + 1]) || 3;
const useAll = args.includes("--all");
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const norms = loadNorms(), score = loadScore();
const TIERS = ["common", "rare", "epic", "legendary", "mythical"];

const S = { games: 0, notDealt: {}, size: [], sizeHist: {}, ten: 0, goodLegPlus: 0, goodMyth: 0, badLegPlus: 0, joker: 0, twoJokers: 0, allBad: 0, oneSuit: 0, oneSuitEligible: 0, anyLegPlus: 0, allBadStrict: 0, anyMyth: 0, heavySuit: 0, heavyEligible: 0,
  tiers: { good: {}, bad: {} }, byResult: { win: { n: 0, good: 0, bad: 0 }, loss: { n: 0, good: 0, bad: 0 } }, bands: {}, cardHero: {}, heroGames: {}, cardAll: {}, withAlso: 0, commonOnlyFill: 0 };
const isMust = c => c.tier === "legendary" || c.tier === "mythical" || c.kind === "crown" || c.kind === "joker";
const examples = [];

for (const { id, data } of sampleMatches(dir, id => useAll || id % mod === 0)) {
  const mi = data.match_info;
  for (const pl of mi.players) {
    if (pl.abandon_match_time_s > 0) continue;
    const h = E.dealMatch(data, pl.player_slot, norms, { score });
    if (h.status !== "dealt") { S.notDealt[h.reason] = (S.notDealt[h.reason] || 0) + 1; continue; }
    S.games++;
    const cards = h.cards;
    S.size.push(cards.length); S.sizeHist[cards.length] = (S.sizeHist[cards.length] || 0) + 1;
    if (cards.length >= 10) S.ten++;
    const good = cards.filter(c => c.side !== "bad"), bad = cards.filter(c => c.side === "bad");
    if (good.some(c => c.tier === "legendary" || c.tier === "mythical")) S.goodLegPlus++;
    if (good.some(c => c.tier === "mythical")) S.goodMyth++;
    if (bad.some(c => c.tier === "legendary" || c.tier === "mythical")) S.badLegPlus++;
    if (cards.some(c => c.tier === "legendary" || c.tier === "mythical")) S.anyLegPlus++;
    if (cards.some(c => c.tier === "mythical")) S.anyMyth++;
    const jk = cards.filter(c => c.kind === "joker").length;
    if (jk >= 1) S.joker++; if (jk >= 2) S.twoJokers++;
    if (!good.length) S.allBad++;
    if (!good.some(c => c.tier !== "middle")) S.allBadStrict++;
    const nm = cards.filter(c => !isMust(c));
    if (nm.length >= 3) { S.oneSuitEligible++; const by = {}; for (const c of nm) by[c.suit] = (by[c.suit] || 0) + 1; if (Math.max(...Object.values(by)) / nm.length > 0.5) S.oneSuit++; }
    const ns = cards.filter(c => c.kind !== "joker");
    if (ns.length >= 5) { S.heavyEligible++; const by = {}; for (const c of ns) by[c.suit] = (by[c.suit] || 0) + 1; if (Math.max(...Object.values(by)) / ns.length >= 0.7) S.heavySuit++; }
    for (const c of cards) {
      const side = c.side === "bad" ? "bad" : "good";
      S.tiers[side][c.tier] = (S.tiers[side][c.tier] || 0) + 1;
      S.cardAll[c.card_id + (c.side === "bad" ? " (bad)" : "")] = (S.cardAll[c.card_id + (c.side === "bad" ? " (bad)" : "")] || 0) + 1;
      const ch = (S.cardHero[pl.hero_id] = S.cardHero[pl.hero_id] || {});
      const key = c.card_id + (c.side === "bad" ? " (bad)" : "");
      ch[key] = (ch[key] || 0) + 1;
    }
    S.heroGames[pl.hero_id] = (S.heroGames[pl.hero_id] || 0) + 1;
    const r = S.byResult[h.result]; r.n++; r.good += good.length; r.bad += bad.length;
    const band = h.rank.band || "none";
    const b = (S.bands[band] = S.bands[band] || { n: 0, size: 0, legPlus: 0, good: 0, bad: 0 });
    b.n++; b.size += cards.length; b.good += good.length; b.bad += bad.length; if (good.some(c => c.tier === "legendary" || c.tier === "mythical")) b.legPlus++;
    if (h.also_earned.length || cards.some(c => c.also)) S.withAlso++;
  }
}
const pct = (x, d = 1) => (100 * x / S.games).toFixed(d) + "%";
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const overHero = [];
for (const [hero, cs] of Object.entries(S.cardHero)) {
  const n = S.heroGames[hero];
  if (n < 100) continue;
  for (const [card, k] of Object.entries(cs)) if (k / n > 0.35) overHero.push({ hero, card, share: k / n, n });
}
const maxHero = Object.entries(S.cardHero).flatMap(([hero, cs]) => S.heroGames[hero] >= 100 ? Object.entries(cs).map(([card, k]) => ({ hero, card, share: k / S.heroGames[hero] })) : []).sort((a, b) => b.share - a.share).slice(0, 5);
const out = {
  games: S.games, notDealt: S.notDealt,
  avgSize: +avg(S.size).toFixed(2), tenPlus: pct(S.ten), goodLegendaryPlus: pct(S.goodLegPlus), goodMythical: pct(S.goodMyth, 2), badLegendaryPlus: pct(S.badLegPlus),
  anyLegendaryPlus: pct(S.anyLegPlus), anyMythical: pct(S.anyMyth, 2),
  mostlyOneSuitHeavy: (100 * S.heavySuit / S.heavyEligible).toFixed(1) + "% of " + S.heavyEligible + " hands with 5+ non-Joker cards (one suit holds 70% or more)",
  withJoker: pct(S.joker), twoJokers: pct(S.twoJokers, 2), allBad: pct(S.allBad, 2), allBadNoEarnedGoodCard: pct(S.allBadStrict, 2),
  mostlyOneSuit: (100 * S.oneSuit / S.oneSuitEligible).toFixed(1) + "% of " + S.oneSuitEligible + " hands with 3+ non-must cards",
  cardsOver35PctOfOneHero: overHero, topHeroCards: maxHero,
  sizeHistogram: S.sizeHist,
  perHand: Object.fromEntries(["good", "bad"].map(s => [s, Object.fromEntries(TIERS.map(t => [t, +((S.tiers[s][t] || 0) / S.games).toFixed(2)]))])),
  winVsLoss: Object.fromEntries(Object.entries(S.byResult).map(([k, v]) => [k, { games: v.n, goodPerHand: +(v.good / v.n).toFixed(2), badPerHand: +(v.bad / v.n).toFixed(2) }])),
  byRank: Object.fromEntries(Object.entries(S.bands).map(([k, v]) => [k, { games: v.n, avgSize: +(v.size / v.n).toFixed(2), legendaryPlus: (100 * v.legPlus / v.n).toFixed(1) + "%", goodPerHand: +(v.good / v.n).toFixed(2), badPerHand: +(v.bad / v.n).toFixed(2) }])),
  mostDealt: Object.entries(S.cardAll).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k}: ${pct(v)}`),
};
console.log(JSON.stringify(out, null, 2));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 2));
