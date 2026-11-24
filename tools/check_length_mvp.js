"use strict";
const readline = require("node:readline");
const S = require("../scoring.js");
const table = require("./data/hero_table.json");
const totals = {};
function record(key, picks, truth) {
  const t = totals[key] ||= { matches: 0, mvp: 0, ordered: 0 };
  t.matches++;
  t.mvp += Number(picks[0] === truth[0]);
  t.ordered += Number(picks.length === 3 && truth.every((slot, i) => picks[i] === slot));
}
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", line => {
  const [labels, mi] = JSON.parse(line);
  const awards = mi.players.filter(p => p.mvp_rank > 0).sort((a, b) => a.mvp_rank - b.mvp_rank);
  if (awards.map(p => p.mvp_rank).join() !== "1,2,3") throw new Error("Incomplete awards " + mi.match_id);
  const truth = awards.map(p => p.player_slot);
  const result = S.scoreMatch(mi, table);
  for (const label of labels) {
    record(label + " deployed", result.picks, truth);
    if (result.lengthPicks) {
      record(label + " length", result.lengthPicks, truth);
      record(label + " flat", result.flatPicks, truth);
    }
  }
});
lines.on("close", () => console.log(JSON.stringify(totals, null, 2)));

