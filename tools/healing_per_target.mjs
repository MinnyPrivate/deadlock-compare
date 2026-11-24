// Prints healing per target for saved Valve match metadata files and checks it against the scoreboard.
// Usage: node tools/healing_per_target.mjs <metadata.json> [...more] [--json out.json]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
const { healingPerTarget, reconcile } = require(path.join(here, "..", "healing.js"));
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(here, "..", "heroes.js"), "utf8"), sandbox);
const HERO = sandbox.window.HERO_NAMES || {};

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json");
const jsonOut = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : null;
const report = [];
let allOk = true;

for (const file of args) {
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const mi = doc.match_info || doc;
  const per = healingPerTarget(mi);
  const bySlot = Object.fromEntries((mi.players || []).map(p => [p.player_slot, p]));
  const name = s => `${HERO[bySlot[s]?.hero_id] || "hero " + bySlot[s]?.hero_id} (slot ${s}, team ${bySlot[s]?.team})`;
  console.log(`\n=== Match ${mi.match_id} (${Math.round((mi.duration_s || 0) / 60)} min) ===`);
  if (!per) { console.log("No damage matrix in this file."); allOk = false; continue; }
  const checks = reconcile(mi, per);
  const match = { match_id: mi.match_id, players: [] };
  for (const c of checks) {
    const h = per[c.slot] || { targets: {} };
    const ok = c.matrix.total === c.official.total && c.matrix.self === c.official.self && c.matrix.allies === c.official.allies;
    if (!ok) allOk = false;
    const others = Object.entries(h.targets).filter(([t]) => Number(t) !== c.slot).sort((a, b) => b[1].total - a[1].total);
    const crossTeam = others.filter(([t]) => bySlot[t]?.team !== bySlot[c.slot]?.team);
    console.log(`${name(c.slot)}: total ${c.matrix.total} (scoreboard ${c.official.total}), self ${c.matrix.self} (${c.official.self}), allies ${c.matrix.allies} (${c.official.allies}) ${ok ? "MATCH" : "MISMATCH"}`);
    for (const [t, v] of others) {
      const srcs = Object.entries(v.sources).sort((a, b) => b[1] - a[1]).map(([n, a]) => `${n} ${a}`).join(", ");
      console.log(`    -> ${name(Number(t))}: ${v.total}  [${srcs}]`);
    }
    if (crossTeam.length) console.log(`    !! ${crossTeam.length} target(s) on the other team`);
    match.players.push({ slot: c.slot, hero: HERO[c.heroId] || c.heroId, ok, matrix: c.matrix, official: c.official, targets: h.targets });
  }
  report.push(match);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
console.log(`\n${allOk ? "All players reconcile with the scoreboard." : "Some players did NOT reconcile, see MISMATCH lines."}`);
process.exitCode = allOk ? 0 : 1;
