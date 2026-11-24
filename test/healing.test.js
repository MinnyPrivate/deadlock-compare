// Healing per target from the damage matrix must add up to each player's scoreboard healing.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { healingPerTarget, reconcile } = require("../healing.js");

const files = ["136941488", "136950036", "137018749", "137019499", "137022293", "match_136014932"];
for (const id of files) {
  test(`healing per target reconciles with the scoreboard for ${id}`, () => {
    const doc = JSON.parse(fs.readFileSync(path.join(__dirname, `${id}.json`), "utf8"));
    const mi = doc.match_info || doc;
    const per = healingPerTarget(mi);
    assert.ok(per, "damage matrix present");
    const team = Object.fromEntries(mi.players.map(p => [p.player_slot, p.team]));
    for (const row of reconcile(mi, per)) {
      assert.deepStrictEqual(row.matrix, row.official, `slot ${row.slot}`);
      for (const to of Object.keys((per[row.slot] || {}).targets || {})) assert.strictEqual(team[to], team[row.slot], `slot ${row.slot} healed an enemy`);
    }
  });
}
