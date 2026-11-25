"use strict";
// Runs the real mvp.js and summary/summary.js code in isolated VM contexts (current working tree AND old commit 0b3306c)
// across every streamed match and every player, comparing the rendered MVP Valve tab place against the Summary place card.
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

function readSource(ref, relPath) {
  if (!ref) return fs.readFileSync(path.join(root, relPath), "utf8");
  return execFileSync("git", ["show", `${ref}:${relPath}`], { cwd: root, maxBuffer: 25e6, encoding: "utf8" });
}

function createPageHarness(ref) {
  const noop = () => {};
  const makeEl = () => ({
    innerHTML: "",
    hidden: false,
    style: { setProperty: noop },
    addEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    contains: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 0, width: 100 }),
    removeAttribute: noop,
    setAttribute: noop,
  });
  const elements = {
    mvpView: makeEl(),
    summaryView: makeEl(),
    summaryTip: makeEl(),
    stage: makeEl(),
  };
  const state = {
    match: null,
    players: [],
    me: null,
    tab: "summary",
    mvpMode: "valve",
    mvpPick: null,
    mvpAll: false,
    summaryPick: null,
    previewSlot: null,
    awaitingValve: false,
    confirmedPreview: false,
    leftTeam: 0,
    zoom: 1,
  };
  const ctx = {
    console,
    Math,
    Number,
    String,
    Array,
    Object,
    Map,
    Set,
    Date,
    Intl,
    URL,
    Promise,
    JSON,
    RegExp,
    parseInt,
    parseFloat,
    isFinite,
    isNaN,
    setTimeout: () => 0,
    clearTimeout: noop,
    performance: { now: () => 0 },
    matchMedia: () => ({ matches: true }),
    location: { pathname: "/", origin: "http://127.0.0.1" },
    params: new URLSearchParams(),
    EMBED: true,
    loadSeq: 0,
    TEAMS: {
      0: { name: "Amber Hand", color: "Amber", c: "#D4A359", coin: "#D4A359", icon: "" },
      1: { name: "Sapphire Flame", color: "Sapphire", c: "#5F9FD8", coin: "#5F9FD8", icon: "" },
    },
    state,
    $: id => (elements[id] ||= makeEl()),
    esc: s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    isStreetBrawl: () => state.match?.game_mode === 4,
    hasSummaryStats: () => !state.match?.not_scored && state.players.length > 0 && state.players.every(p => p.stats.length > 0),
    deathEvents: () => [],
    muParse: () => null,
    muAt: () => 0,
    snapAt: () => null,
    fmtTime: s => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, "0")}`,
    rankHtml: () => "",
    rankOf: () => null,
    cardImg: () => "",
    heroColor: () => "#D4A359",
    renderTop: noop,
    renderAll: noop,
    previewPending: f => String(f),
    samePlayer: (a, b) => a.slot === b.slot,
    getJson: async () => ({ ok: false }),
    GraphMarkers: { itemRecords: () => [] },
    PlayerAssets: { steamProfiles: async () => null, heroArt: async () => ({}) },
    HeroBackdrop: { apply: noop },
    SummaryPercentiles: {
      load: async () => {},
      bounds: () => null,
      percentile: () => null,
      pct: () => null,
      versionMismatch: () => false,
    },
    document: {
      activeElement: null,
      querySelector: () => null,
      createElement: () => ({ innerHTML: "", content: { textContent: "" } }),
    },
    setMatchRoster(mi) {
      state.match = mi;
      const ordered = [...mi.players].sort((a, b) => a.team - b.team || (a.assigned_lane || 0) - (b.assigned_lane || 0) || a.player_slot - b.player_slot);
      state.players = ordered.map(p => ({
        slot: Number(p.player_slot),
        team: Number(p.team) === 1 ? 1 : 0,
        lane: Number(p.assigned_lane) || 0,
        heroId: Number(p.hero_id),
        hero: (ctx.window.HERO_NAMES || {})[p.hero_id] || `Hero ${p.hero_id}`,
        img: "",
        card: null,
        left: Number(p.abandon_match_time_s) || 0,
        mvp: Number(p.mvp_rank) || 0,
        souls: Number(p.net_worth) || 0,
        badge: 0,
        stats: p.stats || [{}],
        raw: p,
      }));
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  for (const file of ["heroes.js", "heronorms.js", "scoring.js", "mvp.js", "summary/summary.js"]) {
    vm.runInContext(readSource(ref, file), ctx, { filename: `${ref || "worktree"}:${file}` });
  }

  return async function evaluateMatch(mi) {
    ctx.setMatchRoster(mi);
    state.mvpMode = "valve";
    state.mvpPick = null;
    ctx.renderMvp();
    const mvpHtml = elements.mvpView.innerHTML;
    const mvpPlaces = {};
    const mvpRe = /<button class="mvpRow[^"]*" data-slot="(\d+)"[\s\S]*?<span class="place">(\d+)<\/span>/g;
    let m;
    while ((m = mvpRe.exec(mvpHtml)) !== null) {
      mvpPlaces[Number(m[1])] = Number(m[2]);
    }
    if (Object.keys(mvpPlaces).length !== mi.players.length) {
      throw new Error(`Parsed ${Object.keys(mvpPlaces).length} MVP rows for match ${mi.match_id}`);
    }

    const summaryPlaces = {};
    for (const p of mi.players) {
      const inspected = await ctx.Summary.inspectCards(mi, Number(p.player_slot));
      const hit = /<b class="hl-big">(\d+)(?:st|nd|rd|th)<\/b>/.exec(inspected.candidates.place.big);
      if (!hit) throw new Error(`Could not parse Summary place for match ${mi.match_id} slot ${p.player_slot}`);
      summaryPlaces[Number(p.player_slot)] = Number(hit[1]);
    }

    const valveMvp = mi.players.find(p => p.mvp_rank === 1);
    return {
      mvpPlaces,
      summaryPlaces,
      mvpFirstMatchesValve: mvpPlaces[valveMvp.player_slot] === 1,
      summaryFirstMatchesValve: summaryPlaces[valveMvp.player_slot] === 1,
    };
  };
}

function makeStats() {
  return {
    matches: 0,
    players: 0,
    mismatches: 0,
    matchesWithMismatch: 0,
    mvpTabFirstMatchesValve: 0,
    summaryFirstMatchesValve: 0,
  };
}

async function main() {
  const evalOld = createPageHarness("0b3306c");
  const evalNew = createPageHarness(null);
  const oldStats = makeStats();
  const newStats = makeStats();

  const rl = readline.createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const mi = JSON.parse(line);
    for (const [fn, st] of [[evalOld, oldStats], [evalNew, newStats]]) {
      const r = await fn(mi);
      st.matches++;
      if (r.mvpFirstMatchesValve) st.mvpTabFirstMatchesValve++;
      if (r.summaryFirstMatchesValve) st.summaryFirstMatchesValve++;
      let diff = false;
      for (const p of mi.players) {
        st.players++;
        if (r.mvpPlaces[p.player_slot] !== r.summaryPlaces[p.player_slot]) {
          st.mismatches++;
          diff = true;
        }
      }
      if (diff) st.matchesWithMismatch++;
    }
  }
  for (const st of [oldStats, newStats]) {
    st.mismatchPct = Number((st.mismatches / st.players * 100).toFixed(2));
  }
  console.log(JSON.stringify({ old_0b3306c: oldStats, new_worktree: newStats }, null, 2));
  if (newStats.mismatches !== 0) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exitCode = 1; });
