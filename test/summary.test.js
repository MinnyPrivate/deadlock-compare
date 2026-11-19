"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { pct, bounds } = require("../summary/percentile");
const { groupFights } = require("../summary/fights");
const billy = require("../data/hero_percentiles.json").heroes[72];

test("looks up the median and clamps values beyond the sampled cutoffs", () => {
  const souls = billy.percentiles.souls;
  assert.deepEqual(pct(72, "souls", souls[49]), { pct: 50, n: billy.n, p50: souls[49] });
  assert.equal(pct(72, "kills", billy.percentiles.kills[49]).pct, 50);
  assert.equal(pct(72, "souls", souls[0] - 1).pct, 1);
  assert.equal(pct(72, "souls", souls[98] + 1).pct, 99);
});

test("fewer deaths rank higher, while ties do not count as being strictly better", () => {
  const deaths = billy.percentiles.deaths;
  assert.equal(pct(72, "deaths", deaths[0] - 1).pct, 99);
  assert.equal(pct(72, "deaths", deaths[98] + 1).pct, 1);
  assert.ok(pct(72, "deaths", 5).pct > pct(72, "deaths", 10).pct);
  const atCutoff = bounds(72, "kills", billy.percentiles.kills[94]);
  assert.ok(atCutoff.better < 95);
});

test("unknown heroes and stats have no percentile", () => {
  assert.equal(pct(-1, "kills", 17), null);
  assert.equal(pct(72, "missing", 17), null);
});

const death = (t, x, y = 0) => ({ t, pos: [x, y] });

test("two deaths two seconds apart in the same spot make one fight", () => {
  const deaths = [death(12, 0), death(10, 0)];
  assert.deepEqual(groupFights(deaths), [{ start: 10, end: 12, deaths: [deaths[1], deaths[0]] }]);
});

test("three deaths 25 seconds apart across the map make no fight", () => {
  assert.deepEqual(groupFights([death(10, 0), death(35, 5000), death(60, 10000)]), []);
});

test("nearby deaths can form two concurrent fights in different places", () => {
  const deaths = [death(10, 0), death(11, 6000), death(12, 1500), death(13, 7500)];
  const fights = groupFights(deaths);
  assert.deepEqual(fights.map(fight => fight.deaths), [[deaths[0], deaths[2]], [deaths[1], deaths[3]]]);
});

test("the inclusive time and distance limits work without guessing missing positions", () => {
  const deaths = [death(0, 0), death(30, 3000), death(60, 6000), { t: 61 }, death(62, -5000)];
  assert.deepEqual(groupFights(deaths).map(fight => fight.deaths), [deaths.slice(0, 3)]);
});
