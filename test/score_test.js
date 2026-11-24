"use strict";
// Checks scoring.js against the expected outputs from the reference code. Run: node test/score_test.js
const fs = require("fs"), path = require("path");
const S = require("../scoring.js");
const table = JSON.parse(fs.readFileSync(path.join(__dirname, "../tools/data/hero_table.json")));
const norms = JSON.parse(fs.readFileSync(path.join(__dirname, "../tools/data/snap_norms.json")));
const vec = JSON.parse(fs.readFileSync(path.join(__dirname, "test_vectors.json")));
const ph = JSON.parse(fs.readFileSync(path.join(__dirname, "test_vectors_phase.json")));
const TOL = 0.002;
const MATCHES = ["136950036", "136941488", "137019499", "137022293", "137018749"];
let failed = 0;
const near = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= TOL);

for (const id of MATCHES) {
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, `${id}.json`)));
  const mi = j.match_info || j;
  const errs = [];
  const r = S.scoreMatch(mi, table), exp = vec[id].tuned;
  const bySlot = {}; r.players.forEach(p => { bySlot[p.slot] = p; });
  for (const e of exp.players) {
    const g = bySlot[e.slot];
    if (!g) { errs.push(`slot ${e.slot} missing`); continue; }
    if (g.graded_hero !== e.graded_hero) errs.push(`slot ${e.slot} graded ${g.graded_hero} want ${e.graded_hero}`);
    if (!near(g.flatScore, e.score)) errs.push(`slot ${e.slot} award score ${g.flatScore.toFixed(4)} want ${e.score}`);
    if (!near(g.score, g.points.reduce((sum, x) => sum + x, g.offset))) errs.push("Displayed points do not add up");
    if (!near(g.means[0], S.expected(g.hero_id, "kills", mi.duration_s).mean)) errs.push("Wrong hero or duration");
    e.points.forEach((v, i) => { if (!near(g.flatPoints[i], v)) errs.push(`slot ${e.slot} award points[${i}] ${g.flatPoints[i].toFixed(4)} want ${v}`); });
  }
  if (JSON.stringify(r.picks) !== JSON.stringify(exp.picks)) errs.push(`picks ${r.picks} want ${exp.picks}`);
  const phase = S.phaseScores(mi, norms), bySlotP = {}; phase.forEach(p => { bySlotP[p.slot] = p; });
  const raw = {}; mi.players.forEach(p => { raw[p.player_slot] = p; });
  for (const e of ph[id].players) {
    const g = bySlotP[e.slot];
    if (e.early_time_s !== g.early_time_s) errs.push(`slot ${e.slot} early_time ${g.early_time_s} want ${e.early_time_s}`);
    if (!near(g.early_valve, e.early_valve)) errs.push(`slot ${e.slot} early_valve ${g.early_valve} want ${e.early_valve}`);
    if (!near(g.late_valve, e.late_valve)) errs.push(`slot ${e.slot} late_valve ${g.late_valve} want ${e.late_valve}`);
    for (const T of [540, 360]) {
      const v = S.laneScore(raw[e.slot], norms, T);
      if (!near(v, e["lane_score_" + T])) errs.push(`slot ${e.slot} lane_score_${T} ${v} want ${e["lane_score_" + T]}`);
    }
  }
  if (errs.length) failed++;
  console.log(`${errs.length ? "FAIL" : "ok  "} ${id} (${vec[id].kind}, ${mi.players.length} players)${errs.length ? "\n  " + errs.slice(0, 8).join("\n  ") : ""}`);
}
console.log(failed ? "FAIL" : "PASS");
process.exit(failed ? 1 : 0);
