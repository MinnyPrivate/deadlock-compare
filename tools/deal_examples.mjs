// Prints real example hands in plain words, for the Deal Report.
// Usage: node tools/deal_examples.mjs <match dir> [--pick] [--match <id> [--match <id>]] > hands.md
//   --pick    choose 10 telling hands from the held-out matches (best game, a Mythical, average, weak, atrocious, support ...)
//   --match   deal all twelve players of those matches (full files fetched from deadlock-api, cached in the match dir)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { loadNorms, loadScore, sampleMatches, root } from "./deal_lib.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("../deal/engine.js");

const args = process.argv.slice(2);
const dir = args[0];
const matchIds = args.flatMap((a, i) => (args[i - 1] === "--match" ? [Number(a)] : []));
const norms = loadNorms(), score = loadScore();
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(root, "heroes.js"), "utf8"), { window: win });
const heroName = id => (win.HERO_NAMES && win.HERO_NAMES[id]) || `Hero ${id}`;
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const TIER = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", mythical: "Mythical", middle: "Middle" };

function describe(data, slot) {
  const mi = data.match_info;
  const pl = mi.players.find(p => p.player_slot === slot);
  const h = E.dealMatch(data, slot, norms, { score, heroName });
  const lines = [];
  const head = `**${heroName(pl.hero_id)}, ${pl.kills}/${pl.deaths}/${pl.assists}, ${Math.round(mi.duration_s / 60)} min, ${h.result || "?"}${pl.mvp_rank === 1 ? ", Valve MVP" : ""}${h.rank ? (h.rank.band ? ", " + h.rank.band + " rank" : ", no rank on file") : ""}**`;
  if (h.status !== "dealt") return { head, h, lines: [`Not dealt: ${h.message}`], text: `${head}\n\nNot dealt: ${h.message}\n` };
  lines.push(`${h.hand_size} cards${h.named_hand ? ` (${h.named_hand})` : ""}:`);
  for (const c of h.cards) {
    const side = c.side === "bad" ? "bad " : "";
    const how = c.kind === "stat" ? `${c.percentile_text}, ${c.line}` : c.kind === "crown" ? c.line : `${c.line} (${c.percentile_text.toLowerCase()})`;
    lines.push(`- ${TIER[c.tier]} ${side}**${c.title}**${c.kind === "joker" ? " (Joker)" : ""}: ${how}`);
  }
  for (const c of h.cards) if (c.also) lines.push(`  - also on ${c.title}: ${c.also.map(a => a.title).join(", ")}`);
  if (h.also_earned.length) lines.push(`- also earned, not dealt: ${h.also_earned.map(c => `${c.title} (${TIER[c.tier]} Joker)`).join(", ")}`);
  return { head, h, pl, lines, text: `${head}\n\n${lines.join("\n")}\n` };
}

if (matchIds.length) {
  for (const id of matchIds) {
    const f = path.join(dir, `${id}.json.gz`);
    if (!fs.existsSync(f)) {
      const r = await fetch(`https://api.deadlock-api.com/v1/matches/${id}/metadata`);
      fs.writeFileSync(f, zlib.gzipSync(Buffer.from(await r.arrayBuffer())));
    }
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString("utf8"));
    console.log(`## Match ${id}: all twelve hands\n`);
    for (const p of data.match_info.players.slice().sort((a, b) => a.team - b.team || a.player_slot - b.player_slot)) console.log(describe(data, p.player_slot).text);
  }
} else {
  // pick telling hands from the held-out matches
  const pool = [];
  for (const { id, data } of sampleMatches(dir, id => id % 3 === 0)) {
    for (const p of data.match_info.players) {
      if (p.abandon_match_time_s > 0) continue;
      const h = E.dealMatch(data, p.player_slot, norms, { score, heroName });
      if (h.status !== "dealt") continue;
      pool.push({ id, slot: p.player_slot, size: h.hand_size, h, p, dur: data.match_info.duration_s });
    }
    if (pool.length > 9000) break;
  }
  const take = (label, pred, rank) => {
    const c = pool.filter(pred).sort(rank)[0];
    return c ? { label, c } : null;
  };
  const lm = x => x.h.cards.filter(c => c.tier === "legendary" || c.tier === "mythical").length;
  const picks = [
    take("The biggest hand", () => true, (a, b) => b.size - a.size || lm(b) - lm(a)),
    take("A Mythical hand", x => x.h.cards.some(c => c.tier === "mythical" && c.side !== "bad"), (a, b) => b.size - a.size),
    take("A Joker, one of two Legendary-level surprises", x => x.h.cards.filter(c => c.kind === "joker").length >= 1 && x.h.cards.some(c => c.kind === "joker" && c.tier === "legendary"), (a, b) => a.id - b.id),
    take("A great game in a loss", x => x.h.result === "loss" && lm(x) >= 1 && x.size >= 7, (a, b) => b.size - a.size),
    take("An average game", x => x.size === 5 && !lm(x) && x.h.cards.filter(c => c.side === "bad").length === 1, (a, b) => a.id - b.id),
    take("An average game, high rank", x => x.size === 5 && !lm(x) && x.h.rank.band === "top", (a, b) => a.id - b.id),
    take("A support who healed", x => x.h.cards.some(c => c.card_id === "stat.healing" && c.side !== "bad"), (a, b) => b.size - a.size),
    take("A weak game", x => x.h.cards.filter(c => c.side === "bad").length >= 3 && x.h.result === "loss", (a, b) => b.h.cards.filter(c => c.side === "bad").length - a.h.cards.filter(c => c.side === "bad").length),
    take("An atrocious game", x => x.h.strength.atrocious, (a, b) => b.h.strength.bad - a.h.strength.bad),
    take("The Crown, a runaway MVP", x => x.h.cards.some(c => c.kind === "crown" && (c.tier === "legendary" || c.tier === "mythical")), (a, b) => b.size - a.size),
    take("Bad cards softened for a player out of their depth", x => x.h.notes.some(n => /softened/.test(n)), (a, b) => b.size - a.size),
  ].filter(Boolean);
  const seen = new Set();
  for (const { label, c } of picks) {
    const key = c.id + ":" + c.slot;
    if (seen.has(key)) continue; seen.add(key);
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, `${c.id}.json.gz`))).toString("utf8"));
    console.log(`### ${label}\n`);
    console.log(describe(data, c.slot).text);
  }
}
