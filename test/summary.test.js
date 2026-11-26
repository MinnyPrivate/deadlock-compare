"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { pct, bounds, versionMismatch } = require("../summary/percentile");
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

test("a thin hero bucket scales the hero all-length stats and cutoffs by the pooled duration shape", () => {
  const [id, hero] = Object.entries(norms.heroes).find(([k, h]) => k !== "all" && h.dmg_and_ally_heal.n[0] < norms.minRows);
  const pool = norms.heroes.all, poolCuts = cutoffs.heroes.all;
  const center0 = norms.centers[0];
  const atCenter = S.expected(id, "dmg_and_ally_heal", center0, cutoffs);
  assert.equal(atCenter.fallback, true);
  assert.ok(Math.abs(atCenter.mean - hero.dmg_and_ally_heal.all[0] * (pool.dmg_and_ally_heal.b[0][0] / pool.dmg_and_ally_heal.all[0])) < 1e-7);
  assert.ok(Math.abs(atCenter.sd - hero.dmg_and_ally_heal.all[1] * (pool.dmg_and_ally_heal.b[0][1] / pool.dmg_and_ally_heal.all[1])) < 1e-7);
  // Pooled duration shape must stay well below naive linear all-length scaling for damage+healing under 20 minutes.
  assert.ok(atCenter.mean < hero.dmg_and_ally_heal.all[0] * (center0 / 2238) * 0.7);
  // Cutoffs remain strictly non-decreasing and match pooled-shape scaling below the first center too.
  for (let i = 1; i < atCenter.cutoffs.length; i++) assert.ok(atCenter.cutoffs[i] >= atCenter.cutoffs[i - 1]);
  const sec = center0 - 120, shorter = S.expected(id, "dmg_and_ally_heal", sec, cutoffs);
  const ratio = sec / center0;
  assert.equal(shorter.fallback, true);
  assert.ok(Math.abs(shorter.mean - atCenter.mean * ratio) < 1e-7);
  assert.ok(Math.abs(shorter.sd - atCenter.sd * ratio) < 1e-7);
  assert.ok(Math.abs(shorter.cutoffs[74] - atCenter.cutoffs[74] * ratio) < 1e-7);
  const p75 = shorter.cutoffs[74];
  assert.equal(pct(id, "dmg_and_ally_heal", p75, sec).pct, pct(id, "dmg_and_ally_heal_per_min", p75 / (sec / 60), sec).pct);
  // Check discrete-stat zero-denominator fallback path on kills as well.
  const killsAtCenter = S.expected(id, "kills", center0, cutoffs);
  assert.equal(killsAtCenter.fallback, true);
  assert.ok(poolCuts.kills.b[0][0] === 0 && killsAtCenter.cutoffs[0] === 0);
  for (let i = 1; i < killsAtCenter.cutoffs.length; i++) assert.ok(killsAtCenter.cutoffs[i] >= killsAtCenter.cutoffs[i - 1]);
  // Blending from a thin <20 bucket into a real 20-25 bucket stays smooth across 1200 s.
  const [blendId] = Object.entries(norms.heroes).find(([k, h]) => k !== "all" && !h.souls.b[0] && h.souls.b[1]);
  const s1 = S.expected(blendId, "souls", 1199.99, cutoffs);
  const s2 = S.expected(blendId, "souls", 1200.01, cutoffs);
  assert.equal(s1.fallback, true);
  assert.ok(Math.abs(s2.mean - s1.mean) < 1);
});

test("percentile table version mismatch warns once instead of turning silent", () => {
  assert.equal(versionMismatch(), false);
  const stale = { ...cutoffs, version: "stale-test-version" };
  assert.equal(versionMismatch(stale), true);
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const first = S.expected(72, "souls", norms.centers[3], stale);
    const second = S.expected(72, "kills", norms.centers[3], stale);
    assert.equal(first.versionMismatch, true);
    assert.equal(first.cutoffs, undefined);
    assert.equal(second.versionMismatch, true);
    assert.equal(bounds(72, "souls", 35000, norms.centers[3], stale), null);
  } finally {
    console.warn = origWarn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /stale-test-version/);
  assert.match(warnings[0], new RegExp(norms.version.replace(/\./g, "\\.")));
});

test("Summary place card and MVP Valve tab agree on every player's place across fixture matches", async () => {
  const root = path.resolve(__dirname, "..");
  const noop = () => {};
  const makeEl = () => ({
    innerHTML: "", hidden: false, style: { setProperty: noop }, addEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], contains: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 0, width: 100 }),
    removeAttribute: noop, setAttribute: noop,
  });
  const elements = { mvpView: makeEl(), summaryView: makeEl(), summaryTip: makeEl(), stage: makeEl() };
  const state = {
    match: null, players: [], me: null, tab: "summary", mvpMode: "valve", mvpPick: null, mvpAll: false,
    summaryPick: null, previewSlot: null, awaitingValve: false, confirmedPreview: false, leftTeam: 0, zoom: 1,
  };
  const ctx = {
    console, Math, Number, String, Array, Object, Map, Set, Date, Intl, URL, Promise, JSON, RegExp,
    parseInt, parseFloat, isFinite, isNaN, setTimeout: () => 0, clearTimeout: noop,
    performance: { now: () => 0 }, matchMedia: () => ({ matches: true }),
    location: { pathname: "/", origin: "http://127.0.0.1" }, params: new URLSearchParams(),
    EMBED: true, loadSeq: 0, state,
    TEAMS: {
      0: { name: "Amber Hand", color: "Amber", c: "#D4A359", coin: "#D4A359", icon: "" },
      1: { name: "Sapphire Flame", color: "Sapphire", c: "#5F9FD8", coin: "#5F9FD8", icon: "" },
    },
    $: id => (elements[id] ||= makeEl()),
    esc: s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    isStreetBrawl: () => state.match?.game_mode === 4,
    hasSummaryStats: () => !state.match?.not_scored && state.players.length > 0 && state.players.every(p => p.stats.length > 0),
    deathEvents: () => [], muParse: () => null, muAt: () => 0, snapAt: () => null,
    fmtTime: s => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, "0")}`,
    rankHtml: () => "", rankOf: () => null, cardImg: () => "", heroColor: () => "#D4A359",
    renderTop: noop, renderAll: noop, previewPending: f => String(f), samePlayer: (a, b) => a.slot === b.slot,
    getJson: async () => ({ ok: false }),
    GraphMarkers: { itemRecords: () => [] },
    PlayerAssets: { steamProfiles: async () => null, heroArt: async () => ({}) },
    HeroBackdrop: { apply: noop },
    SummaryPercentiles: { load: async () => {}, bounds: () => null, percentile: () => null, pct: () => null, versionMismatch: () => false },
    document: { activeElement: null, querySelector: () => null, createElement: () => ({ innerHTML: "", content: { textContent: "" } }) },
    setMatchRoster(mi) {
      state.match = mi;
      const ordered = [...mi.players].sort((a, b) => a.team - b.team || (a.assigned_lane || 0) - (b.assigned_lane || 0) || a.player_slot - b.player_slot);
      state.players = ordered.map(p => ({
        slot: Number(p.player_slot), team: Number(p.team) === 1 ? 1 : 0, lane: Number(p.assigned_lane) || 0,
        heroId: Number(p.hero_id), hero: (ctx.window.HERO_NAMES || {})[p.hero_id] || `Hero ${p.hero_id}`,
        img: "", card: null, left: Number(p.abandon_match_time_s) || 0, mvp: Number(p.mvp_rank) || 0,
        souls: Number(p.net_worth) || 0, badge: 0, stats: p.stats || [{}], raw: p,
      }));
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const file of ["heroes.js", "heronorms.js", "scoring.js", "mvp.js", "summary/summary.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx, { filename: file });
  }

  let checkedPlayers = 0;
  let sawFlatVsLengthDifference = false;
  for (const id of ["136950036", "136941488", "137019499", "137022293", "137018749"]) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, `${id}.json`), "utf8"));
    const mi = raw.match_info || raw;
    ctx.setMatchRoster(mi);
    state.mvpMode = "valve";
    state.mvpPick = null;
    ctx.renderMvp();
    assert.match(elements.mvpView.innerHTML, /Place follows Valve's own all-length scoring while points are length-adjusted/);
    const mvpPlaces = {};
    const mvpRe = /<button class="mvpRow[^"]*" data-slot="(\d+)"[\s\S]*?<span class="place">(\d+)<\/span>/g;
    let m;
    while ((m = mvpRe.exec(elements.mvpView.innerHTML)) !== null) mvpPlaces[Number(m[1])] = Number(m[2]);
    assert.equal(Object.keys(mvpPlaces).length, mi.players.length);

    const rows = ctx.valveRows();
    const byLength = rows.slice().sort((a, b) => b.score - a.score);
    if (rows.some((r, idx) => r.p.slot !== byLength[idx].p.slot)) sawFlatVsLengthDifference = true;

    for (const p of mi.players) {
      const inspected = await ctx.Summary.inspectCards(mi, Number(p.player_slot));
      const hit = /<b class="hl-big">(\d+)(?:st|nd|rd|th)<\/b>/.exec(inspected.candidates.place.big);
      assert.ok(hit, `Summary place missing for ${id} slot ${p.player_slot}`);
      assert.equal(Number(hit[1]), mvpPlaces[Number(p.player_slot)], `Match ${id} slot ${p.player_slot} place mismatch`);
      checkedPlayers++;
    }
  }
  assert.equal(checkedPlayers, 60);
  assert.equal(sawFlatVsLengthDifference, true, "Fixtures must include cases where flat and length order differ");

  // Also verify Impact and Raw footers accurately describe role-stat scaling instead of claiming all stats earn half.
  state.mvpMode = "impact";
  ctx.renderMvp();
  assert.match(elements.mvpView.innerHTML, /role stats \(ally healing, barriers and healing prevented\) also account for spread/);
  assert.doesNotMatch(elements.mvpView.innerHTML, /An average performance for this hero at this length earns half/);
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
