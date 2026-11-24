"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { pct, bounds } = require("../summary/percentile");
const { groupFights } = require("../summary/fights");
const S = require("../scoring");
const norms = require("../tools/data/length_norms.json");
const cutoffs = require("../data/hero_percentiles.json");

test("shared hero expectation matches the measured mean, SD and median at a bucket center", () => {
  const row = norms.heroes[72].souls, sec = norms.centers[3];
  const ref = S.expected(72, "souls", sec, cutoffs);
  assert.deepEqual([ref.mean, ref.sd], row.b[3]);
  assert.equal(ref.fallback, false);
  assert.equal(ref.knownHero, true);
  assert.deepEqual(S.expected(72, "net_worth", sec, cutoffs), ref);
  const median = cutoffs.heroes[72].souls.b[3][49];
  assert.deepEqual(pct(72, "souls", median, sec), { pct: 50, p50: median });
  assert.equal(pct(72, "souls", ref.cutoffs[0] - 1, sec).pct, 1);
  assert.equal(pct(72, "souls", ref.cutoffs[98] + 1, sec).pct, 99);
});

test("a thin hero bucket uses that hero's all-length rate and rate distribution", () => {
  const [id, hero] = Object.entries(norms.heroes).find(([k, h]) => k !== "all" && h.kills.n[0] < norms.minRows);
  const sec = norms.centers[0] - 120, ref = S.expected(id, "kills", sec, cutoffs);
  assert.equal(ref.fallback, true);
  assert.ok(Math.abs(ref.mean - hero.kills.rate[0] * sec / 60) < 1e-8);
  assert.ok(Math.abs(ref.sd - hero.kills.rate[1] * sec / 60) < 1e-8);
  const rate = cutoffs.heroes[id].kills.rate[74];
  assert.ok(Math.abs(ref.cutoffs[74] - rate * sec / 60) < 1e-8);
  assert.deepEqual(pct(id, "kills", rate * sec / 60, sec).pct, pct(id, "kills_per_min", rate, sec).pct);
});

test("crossing a bucket edge interpolates smoothly between centers without jumping", () => {
  const row = norms.heroes[72].kills, q = cutoffs.heroes[72].kills;
  const samples = [1799.99, 1800, 1800.01].map(sec => S.expected(72, "kills", sec, cutoffs));
  for (const [idx, sec] of [1799.99, 1800, 1800.01].entries()) {
    const f = (sec - 1650) / 300, mix = (a, b) => a + (b - a) * f;
    const ref = samples[idx];
    assert.ok(Math.abs(ref.mean - mix(row.b[2][0], row.b[3][0])) < 1e-8);
    assert.ok(Math.abs(ref.sd - mix(row.b[2][1], row.b[3][1])) < 1e-8);
    assert.ok(Math.abs(ref.cutoffs[74] - mix(q.b[2][74], q.b[3][74])) < 1e-8);
  }
  assert.ok(Math.abs(samples[1].mean - samples[0].mean) < 1e-4);
  assert.ok(Math.abs(samples[2].mean - samples[1].mean) < 1e-4);
});

test("long games past the top bucket center extrapolate smoothly from the top center rate", () => {
  const topCenter = norms.centers[7];
  const atTop = S.expected(72, "souls", topCenter, cutoffs);
  const longer = S.expected(72, "souls", topCenter + 600, cutoffs);
  const ratio = (topCenter + 600) / topCenter;
  assert.ok(Math.abs(longer.mean - atTop.mean * ratio) < 1e-6);
  assert.ok(Math.abs(longer.cutoffs[49] - atTop.cutoffs[49] * ratio) < 1e-6);
});

test("fixed 15:00 stats ignore final match length and late stats scale smoothly above 15:00", () => {
  const earlyShort = S.expected(72, "at900_player_damage", 1300);
  const earlyLong = S.expected(72, "at900_player_damage", 3200);
  assert.equal(earlyShort.fixed, true);
  assert.deepEqual(earlyShort, earlyLong);
  assert.equal(S.expected(72, "late_player_damage", 900), null);
  const late20 = S.expected(72, "late_player_damage", 1200);
  const lateCenter1 = S.expected(72, "late_player_damage", norms.centers[1]);
  assert.ok(late20.mean > 0 && late20.mean < lateCenter1.mean);
  const expectedRatio = (1200 - 900) / (norms.centers[1] - 900);
  assert.ok(Math.abs(late20.mean - lateCenter1.mean * expectedRatio) < 1e-6);
});

test("fewer deaths rank higher and equal kills do not earn a strict top-tail claim", () => {
  const sec = norms.centers[3];
  const deaths = S.expected(72, "deaths", sec, cutoffs).cutoffs;
  assert.equal(pct(72, "deaths", deaths[0] - 1, sec).pct, 99);
  assert.equal(pct(72, "deaths", deaths[98] + 1, sec).pct, 1);
  const kills = S.expected(72, "kills", sec, cutoffs).cutoffs;
  assert.ok(bounds(72, "kills", kills[94], sec).better < 95);
});

test("unknown heroes get a pooled mean and no hero-specific rarity claim", () => {
  assert.equal(S.expected(-1, "kills", 2000).knownHero, false);
  assert.equal(pct(-1, "kills", 17, 2000), null);
  assert.equal(pct(72, "missing", 17, 2000), null);
  assert.equal(S.expected(72, "kills", 0), null);
  assert.equal(S.expected(72, "kills", undefined), null);
  assert.equal(S.expected(72, null, 2000), null);
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
