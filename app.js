"use strict";
// Deadlock Compare: overlay and isolate post-match graphs, styled like Deadlock's own graph screen.
// Data: https://api.deadlock-api.com/v1/matches/{id}/metadata (Valve match metadata).

const API = "https://api.deadlock-api.com/v1/matches/";
const PLAYER_COLORS = [
  "#58D86A", "#8C83FF", "#F25CE0", "#FF5A5F", "#FFD23F", "#3FCBFF",
  "#FF9A3C", "#C3A6FF", "#38E8B0", "#FF8FB1", "#C6EE4A", "#5C9DFF",
];
// Player comparison graphs show few heroes, so they get the most distinct colors in pick order.
// Player-Specific graphs: color is the line type (Fountain always cyan), and with two heroes the second one is dashed.
const TYPE_PAL = ["#3FCBFF", "#F25CE0", "#FFD23F", "#FF9A3C", "#58D86A", "#C3A6FF", "#FF5A5F", "#5C9DFF", "#C6EE4A", "#FF8FB1", "#38E8B0", "#8C83FF"];
const TYPE_FIXED = { "Fountain": "#3FCBFF" };
const HERO_DASH = ["", "9 6"];
const TEAMS = {
  0: { name: "Hidden King", color: "Hidden King", c: "#D4860B", coin: "#6F3806", icon: "assets/ui/icon_team1.png" },
  1: { name: "Archmother", color: "Archmother", c: "#4D75C3", coin: "#243265", icon: "assets/ui/icon_team2.png" },
};
// Objective lane index (ECitadelTeamObjective _LaneN) -> lane color. The current map uses lanes 1, 3 and 4.
const LANES = { 1: "Yellow", 2: "Green", 3: "Blue", 4: "Green" };

// Souls per source. Trooper and Haunt souls come in two parts: the kill itself and the orb you shoot, so add both.
const GS = (s, ids) => (s.gold_sources || []).reduce((a, g) => a + (ids.includes(g.source) ? (g.gold || 0) + (g.gold_orbs || 0) : 0), 0);
// Same sections and order as the game's own Graph Type list; Compare's extra graphs come at the end of each section.
const PS = "Player-Specific";
const GRAPHS = [
  { group: "General", id: "souls", label: "Souls Collected", kind: "general", get: s => s.net_worth },
  { group: "General", id: "souls_pm", label: "Souls per Minute", kind: "general", permin: true, get: s => s.net_worth },
  { group: "General", id: "kills", label: "Kills", kind: "general", whole: true, get: s => s.kills, events: p => killTimes(p) },
  { group: "General", id: "deaths", label: "Deaths", kind: "general", whole: true, get: s => s.deaths, events: p => deathTimes(p) },
  { group: "General", id: "healing", label: "Healing", kind: "general", get: s => s.player_healing, sub: "Yourself and allies" },
  { group: "General", id: "lanes", label: "Lane Stats", kind: "lanes", sub: "Each lane's two heroes per team side by side, plus who threw" },
  // Compare's extras
  { group: "General", id: "souls_lead", label: "Team Souls Lead", kind: "lead", extra: true, sub: "Which team was ahead on souls, and by how much" },
  { group: "General", id: "assists", label: "Assists", kind: "general", extra: true, whole: true, get: s => s.assists },
  { group: "General", id: "boss_damage", label: "Objective Damage", kind: "general", extra: true, obj: true, get: s => s.boss_damage,
    sub: "Damage dealt to objectives" },
  { group: "General", id: "last_hits", label: "Trooper and Haunt Kills", kind: "general", extra: true, whole: true, get: s => (s.creep_kills || 0) + (s.neutral_kills || 0), sub: "Not the scoreboard's Last Hits, which counts more" },
  { group: "General", id: "souls_dropped", label: "Souls Dropped on Death", kind: "general", extra: true, get: s => s.gold_death_loss, sub: "Unsecured souls carried when they died. Valve's counter, updated every 3 minutes" },
  { group: "General", id: "denies", label: "Denies", kind: "general", extra: true, whole: true, get: s => s.denies },
  { group: "General", id: "accuracy", label: "Accuracy", extra: true, sub: "All targets, troopers included", kind: "general", ratio: true, get: s => pct(s.shots_hit, (s.shots_hit || 0) + (s.shots_missed || 0)) },
  { group: "General", id: "crit", label: "Headshot Rate", extra: true, kind: "general", ratio: true, get: s => pct(s.hero_bullets_hit_crit, s.hero_bullets_hit), sub: "Crit bullets that hit heroes" },
  // Valve's first snapshot is at 3:00. The power graphs start at 0:00 from what every hero spawns with:
  // level 1, the hero's base health (heroes.vdata, gamedata.js HERO_HP) and no bonus power.
  { group: "General", id: "level", label: "Level", kind: "general", extra: true, power: true, level: true, whole: true, get: s => s.level, start: () => 1 },
  { group: "General", id: "max_health", label: "Max Health", kind: "general", extra: true, power: true, level: true, get: s => s.max_health, start: p => (window.HERO_HP || {})[p.heroId] },
  { group: "General", id: "weapon_power", label: "Weapon Power", kind: "general", extra: true, power: true, level: true, get: s => s.weapon_power, start: () => 0 },
  { group: "General", id: "spirit_power", label: "Spirit Power", kind: "general", extra: true, power: true, level: true, get: s => s.tech_power, start: () => 0 },

  { group: PS, id: "souls_source", label: "Souls by Source", kind: "breakdown", series: [
      { label: "Enemy Kills", get: s => GS(s, [1]) },
      { label: "Kill Assists", get: s => GS(s, [6]) },
      { label: "Troopers", get: s => GS(s, [2]) },
      { label: "Haunts", get: s => GS(s, [3]) },
      { label: "Objectives", get: s => GS(s, [4]) },
      { label: "Breakables", get: s => GS(s, [12]) },
      { label: "Other", get: s => GS(s, [5, 7, 8, 9, 10, 11, 13]) },
  ], sub: "These won't add up exactly to total souls" },
  // Golden statue buffs, from power_up_buffs: the exact second of every pickup, so these lines step at the real times.
  { group: PS, id: "perm_buffs", label: "Permanent Buffs", kind: "breakdown", steps: true, whole: true, dyn: () => buffSeries(), sub: "Golden statue buffs picked up, by type" },
  { group: PS, id: "dmg_breakdown", label: "Damage Breakdown", kind: "breakdown", obj: true, series: [
      { label: "Enemy Players", get: s => s.player_damage },
      { label: "Troopers", get: s => s.creep_damage },
      { label: "Haunts", get: s => s.neutral_damage },
      { label: "Objectives", get: s => s.boss_damage },
  ] },
  // From Valve's damage matrix (every 3 minutes). Damage by type counts every target: heroes, troopers, haunts and objectives.
  { group: PS, id: "dmg_type", label: "Damage Dealt by Type", kind: "breakdown", series: [
      { label: "Gun", tl: p => mtxLine(p, 0, ["Bullet"]) },
      { label: "Ability", tl: p => mtxLine(p, 0, ["Ability"]) },
      { label: "Melee", tl: p => mtxLine(p, 0, ["Melee"]) },
      { label: "Other", tl: p => mtxLine(p, 0, ["Misc"]) },
  ], sub: "Every target: heroes, troopers, haunts and objectives" },
  { group: PS, id: "heal_type", label: "Healing by Type", kind: "breakdown", dyn: () => sourceSeries(1), sub: "Each ability and item that healed, yourself and allies" },
  { group: PS, id: "regen_type", label: "Regen by Type", kind: "breakdown", dyn: () => sourceSeries(5), sub: "Base regen, fountain, pickups and items" },
  { group: PS, id: "player_damage", label: "Damage to Players", kind: "general", get: s => s.player_damage },
  { group: PS, id: "damage_taken", label: "Damage from Players", kind: "general", get: s => s.player_damage_taken },
  // Compare's extras
  { group: PS, id: "support", label: "Support", kind: "breakdown", extra: true, series: [
      { label: "Healing Allies", get: s => s.teammate_healing },
      { label: "Barriers Given", get: s => s.player_barriering },
      { label: "Healing Prevented", get: s => s.heal_prevented },
  ] },
  { group: PS, id: "tanking", label: "Tanking", kind: "breakdown", extra: true, series: [
      { label: "Damage Taken", get: s => s.player_damage_taken },
      { label: "Damage Mitigated", get: s => s.damage_mitigated },
  ] },
  { group: PS, id: "kill_types", label: "Kills by Type", kind: "breakdown", extra: true, whole: true, series: [
      { label: "Gun", get: s => s.bullet_kills },
      { label: "Ability", get: s => s.ability_kills },
      { label: "Melee", get: s => s.melee_kills },
      { label: "Headshot (of Gun)", get: s => s.headshot_kills },
  ] },
];
for (const g of GRAPHS) if (g.dyn) g.series = [];

// ---------- graphs built from the damage matrix and power-up buffs ----------
// Every hero's cumulative damage matrix values per stat type and source, summed over all targets,
// lined up with sample_time_s (Valve right-aligns shorter arrays: they start later).
function mtxParse() {
  const mi = state.match;
  if (mi._mtx !== undefined) return mi._mtx;
  const dm = mi.damage_matrix;
  if (!dm || !Array.isArray(dm.damage_dealers) || !dm.source_details) return (mi._mtx = null);
  const times = dm.sample_time_s || [], T = times.length;
  const types = dm.source_details.stat_type || [], names = dm.source_details.source_name || [];
  const by = {};
  for (const d of dm.damage_dealers) {
    const a = Number(d.dealer_player_slot);
    for (const src of d.damage_sources || []) {
      const t = types[src.source_details_index], n = names[src.source_details_index] || "";
      const acc = (((by[a] = by[a] || {})[t] = by[a][t] || {})[n] = by[a][t][n] || new Array(T).fill(0));
      for (const tp of src.damage_to_players || []) {
        const arr = tp.damage || [];
        for (let k = 0; k < T; k++) { const j = k - (T - arr.length); if (j >= 0) acc[k] += arr[j] || 0; }
      }
    }
  }
  return (mi._mtx = { times, by });
}
function mtxLine(p, type, names) {
  const m = mtxParse();
  if (!m) return [];
  const o = ((m.by[p.slot] || {})[type]) || {};
  return m.times.map((t, k) => [t, names.reduce((a, n) => a + (o[n] ? o[n][k] : 0), 0)]);
}
const MTX_CATS = ["Bullet", "Ability", "Melee", "Misc"];
const REGEN_NAMES = [
  [/^base_stat_regen/, "Base Regen"], [/in_fountain/, "Fountain"], [/medic_trooper_aoe_health_pickup/, "Healing Troopers"],
  [/health_float_in_world/, "Health Orbs"], [/^survival_powerup_pickup/, "Survival Powerup"], [/invis_bush/, "Bushes"],
];
function sourceLabel(n) {
  for (const [rx, label] of REGEN_NAMES) if (rx.test(n)) return label;
  return typeof muSourceName === "function" ? muSourceName(n.split("/")[0]) : n;
}
// Healing and Regen by Type: one line type per source (same names merged), ranked by the picked heroes' totals.
// Every source gets its own row in the legend, so nothing is lumped into "Other".
function sourceSeries(type) {
  const m = mtxParse();
  if (!m) return [];
  const last = m.times.length - 1, tot = {}, keys = {};
  const picked = pickedList("breakdown");
  for (const p of picked.length ? picked : state.players) {
    const o = (m.by[p.slot] || {})[type] || {};
    for (const n of Object.keys(o)) {
      if (type === 0 && MTX_CATS.includes(n)) continue;
      const label = sourceLabel(n);
      (keys[label] = keys[label] || new Set()).add(n);
      tot[label] = (tot[label] || 0) + o[n][last];
    }
  }
  const ranked = Object.keys(tot).filter(l => tot[l] > 0).sort((a, b) => tot[b] - tot[a]);
  return ranked.map(l => ({ label: l, tl: p => mtxLine(p, type, [...keys[l]]) }));
}
// Only use event steps when the roster's recorded counts reconcile with the scoreboard for this stat.
const deathTimes = p => deathEvents().filter(event => event.victim === p).map(event => event.t);
const killTimes = p => deathEvents().filter(event => event.killer === p && event.victim !== p).map(event => event.t);
const haveDeathDetails = () => state.players.length > 0 && state.players.every(p => Array.isArray(p.raw.death_details));
function exactKda(g) {
  if (!g.events || !haveDeathDetails()) return false;
  if (!state.exactKda.has(g.id)) {
    state.exactKda.set(g.id, state.players.every(p => p.raw[g.id] === g.events(p).length));
  }
  return state.exactKda.get(g.id);
}
function kdaGraphStats(p, duration) {
  const samples = new Map();
  for (const snapshot of Array.isArray(p.stats) ? p.stats : []) {
    const t = snapshot.time_stamp_s;
    if (!Number.isFinite(t) || t <= 0 || (duration > 0 && t > duration)) continue;
    const record = { time_stamp_s: t };
    for (const stat of ["kills", "deaths"]) {
      const value = snapshot[stat], final = p[stat];
      if (Number.isInteger(value) && value >= 0 && (!Number.isInteger(final) || value <= final)) record[stat] = value;
    }
    samples.set(t, record);
  }
  if (duration > 0) {
    const end = samples.get(duration) || { time_stamp_s: duration };
    for (const stat of ["kills", "deaths"]) if (Number.isInteger(p[stat]) && p[stat] >= 0) end[stat] = p[stat];
    samples.set(duration, end);
  }
  return [...samples.values()].sort((a, b) => a.time_stamp_s - b.time_stamp_s);
}
function stepPts(times) {
  const pts = [[0, 0]];
  times.forEach((t, i) => { pts.push([t, i]); pts.push([t, i + 1]); });
  pts.push([state.match.duration_s || (times[times.length - 1] || 0), times.length]);
  pts.step = true; // read as "the count so far", not interpolated
  return pts;
}
const stepAt = (pts, t) => { let v = 0; for (const [x, y] of pts) { if (x <= t) v = y; else break; } return v; };
// Every kill as one event: the hero that died, who killed them (if a hero) and when.
function deathEvents() {
  const mi = state.match;
  if (state.deaths) return state.deaths;
  const bySlot = new Map(state.players.map(p => [p.slot, p]));
  const out = [];
  const dur = Number(mi.duration_s);
  for (const v of state.players) for (const d of Array.isArray(v.raw.death_details) ? v.raw.death_details : []) {
    const t = d?.game_time_s;
    if (!Number.isFinite(t) || t < 0 || (dur > 0 && t > dur)) continue;
    const dp = d.death_pos && Number.isFinite(d.death_pos.x) ? [d.death_pos.x, d.death_pos.y] : null;
    const seconds = Number(d.death_duration_s);
    const duration = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    out.push({ t, duration, victim: v, killer: bySlot.get(d.killer_player_slot) || null, pos: dp, assists: [] });
  }
  out.sort((a, b) => a.t - b.t);
  return (state.deaths = out);
}
// Who assisted. Valve's data names the killer but not the assisters. It does have each hero's assist count at every stats
// snapshot and every hero's position each second (match_paths), so each hero's assists between two snapshots go to the deaths
// in that stretch they were closest to (over the 8 seconds before the death). Each hero's total matches the scoreboard;
// which death got which assist is a best guess, so the hover box says so. Checked on 5 matches: a plain "was nearby" rule
// alone lands within about 12% of the real totals, and the snapshot counts tighten it.
const ASSIST_LOOKBACK_S = 8, ASSIST_MAX_DIST = 6000;
function pathPos(slot, t) {
  const mp = state.match.match_paths;
  if (!mp || !Array.isArray(mp.paths)) return null;
  const p = mp.paths.find(q => Number(q.player_slot) === slot);
  if (!p || !p.x_pos || !p.y_pos) return null;
  const i = Math.round(t / (mp.interval_s || 1));
  if (i < 0 || i >= p.x_pos.length) return null;
  const rx = mp.x_resolution || 16383, ry = mp.y_resolution || 16383;
  return [p.x_min + (p.x_pos[i] / rx) * (p.x_max - p.x_min), p.y_min + (p.y_pos[i] / ry) * (p.y_max - p.y_min)];
}
function assignAssists(evs) {
  if (!state.match.match_paths) return;
  for (const s of state.players) {
    const snaps = (s.stats || []).map(x => [Number(x.time_stamp_s) || 0, Number(x.assists) || 0]);
    let prevT = -1, prevA = 0;
    for (const [ts, a] of snaps) {
      const n = a - prevA, lo = prevT;
      prevT = ts; prevA = a;
      if (n <= 0) continue;
      const cands = [];
      for (const e of evs) {
        if (e.t <= lo || e.t > ts || !e.pos || e.victim.team === s.team || e.killer === s) continue;
        let best = Infinity;
        for (let j = 0; j <= ASSIST_LOOKBACK_S; j++) {
          const q = pathPos(s.slot, e.t - j);
          if (q) best = Math.min(best, Math.hypot(q[0] - e.pos[0], q[1] - e.pos[1]));
        }
        if (best <= ASSIST_MAX_DIST) cands.push([best, e]);
      }
      cands.sort((x, y) => x[0] - y[0]).slice(0, n).forEach(([, e]) => e.assists.push(s));
    }
  }
}

function ensureAssists(events) {
  if (state.match._estimatedAssists) return;
  assignAssists(events);
  state.match._estimatedAssists = true;
}

const BUFF_NAMES = {
  spirit: "Spirit Power", wp: "Weapon Damage", firerate: "Fire Rate", ammo: "Ammo", hp: "Health",
  bulletresist: "Bullet Resist", spiritresist: "Spirit Resist", cd: "Cooldown Reduction", movespeed: "Move Speed", range: "Range",
};
const buffKind = t => t.replace(/_permanent_pickup(_lv\d+)?$/, "");
// Permanent Buffs: the number of each buff type picked up so far, stepping at the exact pickup second.
function buffSeries() {
  const tot = {};
  for (const p of state.players) for (const b of p.raw.power_up_buffs || []) {
    if (!b.is_permanent) continue;
    const k = buffKind(b.type);
    tot[k] = (tot[k] || 0) + (b.pickup_times_s || []).length;
  }
  const kinds = Object.keys(tot).filter(k => tot[k] > 0).sort((a, b) => tot[b] - tot[a]);
  return [{ label: "All Buffs", tl: p => buffLine(p, null) }].concat(kinds.map(k => ({ label: BUFF_NAMES[k] || k, tl: p => buffLine(p, k) })));
}
function buffLine(p, kind) {
  const times = [];
  for (const b of p.raw.power_up_buffs || []) if (b.is_permanent && (!kind || buffKind(b.type) === kind)) times.push(...(b.pickup_times_s || []));
  times.sort((a, b) => a - b);
  const pts = [];
  times.forEach((t, i) => { pts.push([t, i]); pts.push([t, i + 1]); });
  pts.push([state.match.duration_s || (times[times.length - 1] || 0), times.length]);
  return pts;
}
// New match: rebuild the graphs whose line types depend on the match. They are ranked by the picked heroes,
// so they are rebuilt when the picks change too. Lines you turned on or off stay that way (kept by name).
function prepDynamicGraphs(force) {
  const key = [...selFor("breakdown")].sort().join(",");
  for (const g of GRAPHS) if (g.dyn && (force || g._key !== key)) {
    g._key = key;
    g.series = g.dyn();
  }
}

const GROUP_SUB = { [PS]: "Every line type for the heroes you pick" };

function pct(a, b) { return b ? (100 * (a || 0)) / b : null; }

const params = new URLSearchParams(location.search);
const EMBED = params.get("embed") === "1";
function entryTab() {
  const tab = params.get("tab");
  if (["summary", "graphs", "mvp", "matchups"].includes(tab)) return tab;
  return params.has("graph") || params.has("players") ? "graphs" : null;
}
const state = {
  match: null, players: [], events: [],
  sel: null, // the heroes you picked; null until you pick, then it stays the same on every graph
  graph: "souls", mode: "value", diff: false, showGraph: false,
  lineOv: {}, hiddenGroups: new Set(),
  focus: null, folds: {}, tray: [], // hover focus key ("t3" a line type, "s5" a hero), legend groups opened, overview compare tray
  laneOf: null, laneTime: 540, laneHover: null,
  leftTeam: 0, me: null, previewSlot: null, previewViewer: null, awaitingValve: false,
  tab: "graphs", requestedTab: entryTab(), mvpPick: null, mvpMode: "valve", summaryPick: null, summaryStat: null,
  muStat: "dmg", muWin: "all", muPair: null,
};
const $ = id => document.getElementById(id);
const tabs = [...document.querySelectorAll("#tabs .tab")];
const graphNow = () => GRAPHS.find(g => g.id === state.graph);
const isStreetBrawl = () => Number(state.match?.game_mode) === 4;
const availableGraphs = () => GRAPHS.filter(g => !isStreetBrawl() || g.kind !== "lanes");
// You build the view: nothing is drawn until you pick it. No hero is picked when a match opens; once you pick heroes,
// they stay picked on every graph until you change them. (kind is kept for the callers; every graph shares one pick.)
const selFor = kind => state.sel || new Set();
const selNow = () => selFor(graphNow().kind);
const setSel = s => { state.sel = s; state.showGraph = true; };
// Picked heroes in order, for the graphs that color them by pick order.
const pickedList = kind => [...selFor(kind)].map(s => state.players.find(p => p.slot === s)).filter(Boolean);
// On the Player-Specific graphs color means the line type, so a hero is told apart by solid or dashed instead.
// Their portrait bar is then off-white (dashed for the second hero) rather than a color that would mean a line type.
function colorOf(p) {
  return graphNow().kind === "breakdown" ? "#FFEFD7" : p.color;
}
// Every graph opens with no line types on (openGraph clears them). What you turn on is kept by name while you stay
// on the graph, so it survives the lines being re-ranked when you pick other heroes.
function lineOn(g, i) {
  const ov = state.lineOv[g.id];
  return !!(ov && ov.get(g.series[i].label));
}
function openGraph(id) {
  GraphMarkers.close();
  state.graph = id;
  state.showGraph = false;
  state.mode = "value";
  state.diff = false;
  state.hiddenGroups.clear();
  delete state.lineOv[id];
  state.focus = null;
}
function setLine(g, i, on) { (state.lineOv[g.id] = state.lineOv[g.id] || new Map()).set(g.series[i].label, on); }
function visibleCats(g) { return g.series.map((s, i) => i).filter(i => lineOn(g, i)); }
// View As: Value and Per Minute work on most graphs; % of Team, Teams and Lanes only on the General graphs that add up.
function modeNow(g) {
  const m = state.mode;
  if (g.permin) return "permin";
  if (g.kind === "lanes") return "value";
  if (g.steps) return "value";
  if (g.ratio || g.level || g.kind === "lead") return "value";
  if (g.kind !== "general" && m !== "permin") return "value";
  return m;
}
const grouped = g => ["team", "lane"].includes(modeNow(g));

// ---------- layout scaling: Deadlock lays out in 1080p units ----------
// CSS zoom lays the page out again at the real size, so text is drawn sharp at your resolution.
// transform: scale() shrinks a finished picture instead, which softens text; it is only the fallback.
const ZOOM = !!(window.CSS && CSS.supports && CSS.supports("zoom", "2")) && params.get("scale") !== "transform";
function fit() {
  const H = EMBED ? 996 : 1080;
  const z = Math.min(innerWidth / 1920, innerHeight / H);
  const st = $("stage");
  const left = Math.max(0, Math.round((innerWidth - 1920 * z) / 2));
  if (ZOOM) { st.style.zoom = z; st.style.transform = ""; st.style.left = left / z + "px"; }
  else { st.style.transform = `scale(${z})`; st.style.left = left + "px"; }
  state.zoom = z; state.stageLeft = left;
}
// The mouse in an element's own 1080p layout units. Built only from the mouse's place on screen, the scale set in fit()
// and layout offsets, because browsers disagree on whether getBoundingClientRect includes CSS zoom
// (the game's built-in browser doesn't, which put the hover readout in the wrong place).
function mouseIn(el, ev) {
  let x = 0, y = 0;
  for (let e = el; e && e.id !== "stage"; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
  return { x: (ev.clientX - state.stageLeft) / state.zoom - x, y: ev.clientY / state.zoom - y };
}

// ---------- loading ----------
// How a fresh match reaches us (deadlock-api's own code, Nov 2026). /metadata answers at once when the match is stored. When it
// isn't, but someone's uploader has sent the match's salts (the keys to Valve's file), deadlock-api downloads the file from Valve
// inside that same request. With neither, it asks Steam through one of its bots, and that is limited to 3 per hour per IP: the
// 429 we used to call "busy" was mostly our own retries using that up before the salts arrived.
// So: one normal request first (the bot lookup is the only quick path when nobody in the match runs the uploader). If the match
// isn't there, wait on the free salts check, which only reads deadlock-api's database, and ask for /metadata the moment salts
// show up (and once a minute anyway, in case the match got stored without salts). Both waiting requests pass disable_steam=true,
// so they never spend the hourly Steam lookups. See waitForMatch.
let loadSeq = 0;
let activeMatchId = null;
let loadRequests = null;
CompanionPreview.onChange(() => { if (activeMatchId) void loadMatch(activeMatchId); });
async function loadMatch(id) {
  const my = ++loadSeq; // only the newest request may draw
  loadRequests?.abort();
  const requests = loadRequests = new AbortController();
  activeMatchId = id;
  $("profileLookup").hidden = true;
  CompanionPreview.stop();
  clearMatch(true);
  clearTimeout(checkTimer); clearInterval(waitTimer);
  setStatus("Loading match " + id + "...");
  const src = params.get("src"); // local test file: only files in this repo's test/ folder
  const local = src && /^test\/[\w-]+\.json$/.test(src);
  const officialUrl = API + encodeURIComponent(id) + "/metadata";
  const verifiedUrl = officialUrl + "?disable_steam=true";
  try {
    if (!local) await CompanionPreview.ready;
    if (my !== loadSeq) return;
    const paired = !local && CompanionPreview.isPaired();
    if (paired) CompanionPreview.start(id, {
      preview(data) {
        if (my !== loadSeq || !matchesPage(data.match_info, id)) return false;
        state.previewSlot = data.viewer_slot;
        setup(data.match_info);
        return true;
      },
      expire() {
        if (my !== loadSeq || state.previewSlot === null) return;
        const waiting = state.wait;
        clearMatch(!waiting?.stopped || !!waiting?.checking);
        state.wait = waiting;
        if (waiting) drawWait(waiting, id, my);
        else setStatus("Waiting for this match’s Valve data.");
      },
      async official() {
        try {
          const response = await getJson(verifiedUrl, requests.signal);
          if (response.ok && my === loadSeq && matchesPage(response.body?.match_info || response.body, id)) {
            show(response.body, my);
            return true;
          }
        } catch (_) { /* Existing match checks still handle upstream availability. */ }
        return false;
      },
    });
    const r = await getJson(local ? src : paired ? verifiedUrl : officialUrl, requests.signal);
    if (my !== loadSeq || (state.match && state.previewSlot === null)) return;
    if (r.ok && (local || matchesPage(r.body?.match_info || r.body, id))) return show(r.body, my);
    if (!local && WAIT_STATUS.has(r.status)) return waitForMatch(id, my, r);
    throw new Error("Couldn't load the match (error " + r.status + ").");
  } catch (e) {
    if (my === loadSeq && !local && CompanionPreview.isPaired()) {
      if (!state.match || state.previewSlot !== null) return waitForMatch(id, my, { status: 503, body: null });
      return;
    }
    fail(e, id, my);
  }
}
function matchesPage(info, id) {
  return !!info && String(info.match_id) === id && Array.isArray(info.players) && info.players.length > 0;
}
const MATCH_REQUEST_MS = 10_000;
async function getJson(url, parentSignal) {
  const request = new AbortController();
  const cancel = () => request.abort();
  if (parentSignal?.aborted) cancel();
  else parentSignal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; cancel(); }, MATCH_REQUEST_MS);
  try {
    const r = await fetch(url, { signal: request.signal });
    let body = null;
    try { body = await r.json(); } catch (e) { if (request.signal.aborted) throw e; }
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    if (timedOut) throw new Error("The match server took too long to respond. Try again.");
    throw e;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", cancel);
  }
}
function show(data, my) {
  if (my !== loadSeq || (state.match && state.previewSlot === null)) return;
  const mi = data && (data.match_info || data);
  if (!mi || !Array.isArray(mi.players) || !mi.players.length) throw new Error("This match has no player data.");
  const fromPreview = state.previewSlot !== null;
  const picked = fromPreview && state.sel ? state.players.filter(p => state.sel.has(p.slot)) : null;
  const hadGraph = fromPreview && state.showGraph;
  const summary = fromPreview ? {
    picked: state.summaryPick !== null, player: window.Summary.selected(), stat: state.summaryStat,
  } : null;
  const focus = document.activeElement;
  const fromSummary = state.awaitingValve && (
    $("summaryView").contains(focus) || focus?.hasAttribute("data-summary-portrait") || focus === tabs[0]);
  state.previewViewer = fromPreview ? state.players.find(p => p.slot === state.previewSlot) : null;
  state.previewSlot = null;
  state.awaitingValve = false;
  CompanionPreview.stop();
  clearTimeout(checkTimer); clearInterval(waitTimer);
  state.wait = null;
  setup(mi, picked, hadGraph, summary);
  if (fromSummary && (state.tab !== "summary" || !focus.isConnected)) {
    let replacement;
    if (state.tab === "summary") {
      const { summaryPortrait, summaryFocus } = focus.dataset;
      if (summaryPortrait !== undefined) replacement = document.querySelector(`[data-summary-portrait="${window.Summary.selected().slot}"]`);
      else if (summaryFocus) replacement = $("summaryView").querySelector(`[data-summary-focus="${CSS.escape(summaryFocus)}"]`);
    }
    (replacement || tabs.find(button => button.dataset.tab === state.tab))?.focus({ preventScroll: true });
  }
}
function fail(e, id, my) {
  if (my !== loadSeq) return;
  clearTimeout(checkTimer); clearInterval(waitTimer);
  CompanionPreview.stop();
  clearMatch();
  const msg = e instanceof TypeError ? "Couldn't reach the match server. Check your connection and try again." : e.message || String(e);
  setStatus(msg, true, () => loadMatch(id));
}

// The "not ready yet" screen. Checks every 10 seconds for the first 3 minutes, then every 30, and stops after 15 minutes.
// A 429 waits as long as deadlock-api asks. Five consecutive server errors at either polling endpoint stop it too.
// Try Now runs one check at once (after a short cooldown, so clicking again and again doesn't hammer the API).
const WAIT_STATUS = new Set([404, 429, 500, 502, 503, 504]);
// Measured from real matches (PR 18): the match file usually appears 80 to 110 s after the game ends. The wait screen shows this range.
const TYPICAL_LO_S = 80, TYPICAL_HI_S = 110;
const FAST_S = 10, SLOW_S = 30, FAST_FOR_S = 180, GIVE_UP_S = 15 * 60, META_EVERY_S = 60, DOWN_GIVE_UP = 5, TRY_NOW_COOLDOWN_S = 10;
let waitTimer = null, checkTimer = null;
function waitForMatch(id, my, first) {
  let w = state.wait;
  if (!w || w.id !== id) w = state.wait = { id, start: Date.now(), tries: 1, failures: { salts: 0, metadata: 0 }, salts: false, lastMeta: Date.now(), last: Date.now() };
  // The first request is the only one allowed to make deadlock-api ask Steam. A 429 there is the hourly Steam lookup limit and a
  // 503 means no bot was free: neither touches the free checks we wait on, so just start waiting.
  if (w.tries === 1 && (first.status === 429 || first.status >= 500)) w.phase = "nosalts";
  else note(w, "metadata", first);
  plan(w, id, my);
}
// What one answer means for the wait. `what` is "metadata" or "salts".
function note(w, what, r) {
  const b = r.body || {};
  if (r.status === 429) {
    w.phase = "limit";
    const next = Number(b.next_request_in) || 0;
    w.holdUntil = Date.now() + Math.max(FAST_S, next) * 1000;
    w.detail = `deadlock-api limit hit (${b.type || "?"} scope${b.quota ? `, ${b.quota.limit} per ${fmtPeriod(b.quota.period)}` : ""}) resets in ${fmtTime(next)}`;
    return;
  }
  if (r.status >= 500) {
    w.failures[what]++;
    w.phase = what === "metadata" && w.salts ? "valve" : "down";
    w.detail = what === "metadata" && r.status === 503 && w.salts ? "deadlock-api couldn't get the file from Valve yet (503)" : `deadlock-api answered ${r.status} to the ${what} check`;
    return;
  }
  w.failures[what] = 0;
  if (what === "salts") {
    if (r.ok && b.metadata_salt && b.cluster_id) { w.salts = true; w.phase = "valve"; w.detail = "deadlock-api has the match's keys"; }
    else if (!w.salts) { w.phase = "nosalts"; w.detail = "No keys for this match on deadlock-api yet (404)"; }
  } else if (r.status === 404) {
    w.phase = w.salts ? "valve" : "nosalts";
    w.detail = w.salts ? "Valve hasn't published the match file yet (404)" : "deadlock-api doesn't have this match yet (404)";
  }
}
function fmtPeriod(s) { return s >= 3600 && s % 3600 === 0 ? (s === 3600 ? "hour" : s / 3600 + " hours") : s >= 60 && s % 60 === 0 ? (s === 60 ? "minute" : s / 60 + " minutes") : s + " s"; }
// Decide when the next check runs (or that we stop), then draw the countdown.
function plan(w, id, my) {
  const now = Date.now(), age = (now - w.start) / 1000;
  w.stopped = age >= GIVE_UP_S ? (w.salts ? "valve" : "missing") : Math.max(...Object.values(w.failures)) >= DOWN_GIVE_UP ? "down" : null;
  const step = age < FAST_FOR_S ? FAST_S : SLOW_S;
  w.next = Math.max(now + step * 1000, w.holdUntil || 0);
  clearTimeout(checkTimer); clearInterval(waitTimer);
  drawWait(w, id, my);
  waitTimer = setInterval(() => drawWait(w, id, my), 1000); // countdowns, and the Try Now cooldown even after we stop
  if (!w.stopped) checkTimer = setTimeout(() => check(w, id, my), w.next - now);
}
async function check(w, id, my) {
  if (my !== loadSeq || state.wait !== w || w.checking) return;
  w.checking = true;
  if (!state.match && !state.awaitingValve) {
    state.awaitingValve = true;
    renderTabs();
  }
  clearTimeout(checkTimer);
  w.tries++; w.last = Date.now();
  const base = API + encodeURIComponent(id);
  const signal = loadRequests?.signal;
  let what = "salts";
  try {
    const s = await getJson(base + "/salts?disable_steam=true", signal);
    if (my !== loadSeq || state.wait !== w) return;
    note(w, "salts", s);
    if (s.status !== 429 && w.failures.salts < DOWN_GIVE_UP && (w.salts || Date.now() - w.lastMeta >= META_EVERY_S * 1000)) {
      what = "metadata";
      w.lastMeta = Date.now();
      const m = await getJson(base + "/metadata?disable_steam=true", signal);
      if (my !== loadSeq || state.wait !== w) return;
      if (m.ok && matchesPage(m.body?.match_info || m.body, id)) return show(m.body, my);
      if (!WAIT_STATUS.has(m.status)) throw new Error("Couldn't load the match (error " + m.status + ").");
      note(w, "metadata", m);
    }
  } catch (e) {
    if (my !== loadSeq || state.wait !== w) return;
    if (!(e instanceof TypeError)) return fail(e, id, my);
    w.failures[what]++; w.phase = "down"; w.detail = "Couldn't reach deadlock-api"; // a dropped connection: keep waiting, it may come back
  } finally {
    w.checking = false;
  }
  plan(w, id, my);
}
function drawWait(w, id, my) {
  if (my !== loadSeq || state.wait !== w) return;
  if (state.previewSlot !== null) return;
  const awaitingValve = !w.stopped || w.checking;
  if (awaitingValve !== state.awaitingValve) {
    state.awaitingValve = awaitingValve;
    renderTabs();
  }
  const s = $("status");
  s.classList.remove("err");
  s.dataset.detail = `${w.detail || ""} | try ${w.tries} | phase ${w.phase || ""}`; // for debugging only, not shown
  const left = Math.max(0, Math.ceil((w.next - Date.now()) / 1000));
  if (!w.stopped) {
    // Keep it short: say it is waiting, how long that usually takes, and when it checks next.
    const title = w.phase === "down" ? "deadlock-api is having trouble" : "Waiting for this match's data";
    s.innerHTML = `<div class="waitTitle">${title}</div>${waitMeter((Date.now() - w.start) / 1000)}<div class="waitCheck">Checking again in ${fmtTime(left)}.</div>`;
    return;
  }
  // Stopped after 15 minutes or too many errors: this is the one place with a Try Now button, so there is a way to start again.
  const cool = Math.max(0, Math.ceil((w.last + TRY_NOW_COOLDOWN_S * 1000 - Date.now()) / 1000));
  const waited = fmtTime((Date.now() - w.start) / 1000);
  let title, text;
  if (w.stopped === "missing") {
    title = "This match hasn't been uploaded";
    text = "After 15 minutes deadlock-api still doesn't have it. Either nobody who played it runs the deadlock-api uploader, or the match was abandoned, which may never get data. If it finished normally, ask someone who played it to run the uploader, then press Try Now.";
  } else if (w.stopped === "valve") {
    title = "Valve hasn't published this match yet";
    text = "deadlock-api has the match's keys, but Valve's file still isn't there after 15 minutes. Press Try Now to check again later.";
  } else {
    title = "deadlock-api looks down right now";
    text = "It keeps answering with errors, so I stopped asking. Press Try Now to ask again in a while.";
  }
  s.innerHTML = `<div class="waitTitle">${title}</div><div class="waitText">${text}</div><div class="waitDetail">waited ${waited}</div>`;
  const b = el("button", "graphOptionButton retry", cool ? `Try Now (${cool})` : "Try Now");
  b.disabled = cool > 0;
  b.onclick = () => { b.disabled = true; clearInterval(waitTimer); check(w, id, my); };
  s.append(b);
}
// Set to { name, url } once the companion app exists. Until then the long-wait message does not mention it.
const COMPANION_APP = null;
// Elapsed time, the typical range, and a bar that fills against that range and then holds at the end (not a fake percent).
// Past the range the line changes to say so. It redraws every second, so the bar needs no animation and works with reduced motion.
function waitMeter(elapsed) {
  const over = elapsed > TYPICAL_HI_S;
  const pct = Math.min(100, (elapsed / TYPICAL_HI_S) * 100);
  const app = COMPANION_APP ? ` <a href="${esc(COMPANION_APP.url)}" target="_blank" rel="noopener">Get ${esc(COMPANION_APP.name)} for faster loads.</a>` : "";
  const lead = over
    ? `Taking longer than usual. You can keep this open.${app}`
    : `Usually ${fmtTime(TYPICAL_LO_S)} to ${fmtTime(TYPICAL_HI_S)} after a game ends. <b>${fmtTime(elapsed)}</b> so far.`;
  return `<div class="waitRange">${lead}</div>` +
    `<div class="waitBar${over ? " hold" : ""}" role="progressbar" aria-label="Time waited against the usual range" aria-valuemin="0" aria-valuemax="${TYPICAL_HI_S}" aria-valuenow="${Math.min(TYPICAL_HI_S, Math.round(elapsed))}"><i style="width:${pct}%"></i><span class="tick" style="left:${(TYPICAL_LO_S / TYPICAL_HI_S) * 100}%"></span></div>`;
}
function clearMatch(awaitingValve = false) {
  stopChartHover();
  GraphMarkers.close();
  state.match = null;
  state.previewSlot = null;
  state.previewViewer = null;
  state.awaitingValve = awaitingValve;
  state.wait = null;
  $("companionSource").hidden = true;
  document.body.classList.add("noMatch");
  $("tooltip").hidden = true;
  $("summaryView").hidden = $("summaryBackdrop").hidden = true;
  state.tab = awaitingValve ? "summary" : "graphs";
  renderTabs();
  document.body.classList.remove("tabSummary");
  window.Summary?.hideTip();
}

// Viewer hints from the game (friendly team, local hero). They come in the query, or in the #hash: the mod preloads the
// page before the post-game screen knows them, then passes them by changing only the hash, which doesn't reload.
function hint(k) {
  const h = new URLSearchParams(location.hash.slice(1));
  return h.has(k) ? h.get(k) : params.get(k);
}
let viewerAccount = null;
function consumeViewerAccount(matchId) {
  const url = new URL(location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  if (!url.searchParams.has("me") && !hash.has("me")) return;
  const hint = hash.get("me") ?? url.searchParams.get("me");
  const id = /^\d{1,10}$/.test(hint) ? Number(hint) : 0;
  viewerAccount = /^\d+$/.test(matchId || "") && id > 0 && id <= 0xffffffff ? { matchId, id } : null;
  params.delete("me");
  if (url.searchParams.has("me")) url.searchParams.delete("me");
  if (hash.has("me")) { hash.delete("me"); url.hash = hash.toString(); }
  history.replaceState(history.state, "", url);
}
consumeViewerAccount(params.get("match"));
// Which team sits on the left: the viewer's team when the game tells us, else Hidden King.
function applyViewer() {
  const fr = Number(hint("friendly"));
  state.leftTeam = hint("friendly") != null && (fr === 0 || fr === 1) ? fr : 0;
  const meHero = Number(hint("me_hero")) || (window.HERO_CODES || {})[hint("me_name")] || 0;
  const previewMe = state.previewSlot === null ? null : state.players.find(p => p.slot === state.previewSlot);
  let saved = null;
  try { saved = localStorage.getItem("pm_me"); } catch (_) { /* storage may be unavailable */ }
  const account = viewerAccount?.matchId === String(state.match.match_id) ? viewerAccount.id : Number(saved);
  const accountMe = account > 0 && state.players.find(p => Number(p.raw.account_id) === account);
  const gameMe = state.players.find(p => p.heroId === meHero && (hint("friendly") == null || p.team === state.leftTeam));
  const known = state.previewViewer;
  const confirmedMe = known && state.players.find(p => samePlayer(p, known));
  state.me = previewMe || accountMe || gameMe || confirmedMe || null;
  if (state.me) state.leftTeam = state.me.team;
}

function hasSummaryStats() {
  return !isStreetBrawl() && !state.match?.not_scored &&
    state.players.length > 0 && state.players.every(player => player.stats.length > 0);
}
const samePlayer = (a, b) => a.slot === b.slot && a.heroId === b.heroId && a.team === b.team;

function renderTabs() {
  const canSummarize = state.awaitingValve || (state.match && hasSummaryStats());
  $("tabs").hidden = !state.awaitingValve && !state.match;
  for (const button of tabs) {
    const summary = button.dataset.tab === "summary";
    const loading = state.awaitingValve && !summary;
    const active = button.dataset.tab === state.tab;
    button.disabled = summary ? !canSummarize : loading;
    if (loading) button.setAttribute("aria-describedby", "tabLoading");
    else button.removeAttribute("aria-describedby");
    if (active) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
    button.classList.toggle("on", active);
  }
}

function setup(mi, picked, hadGraph, summary) {
  state.match = mi;
  state.deaths = null;
  state.exactKda = new Map();
  const brawl = isStreetBrawl();
  $("companionSource").hidden = state.previewSlot === null;
  closeMenu();
  if (!availableGraphs().includes(graphNow())) openGraph("souls");
  if (brawl && state.mode === "lane") state.mode = "value";
  document.body.classList.remove("noMatch");
  const lane = p => brawl ? 0 : p.assigned_lane || 0;
  const ordered = [...mi.players].sort((a, b) => a.team - b.team || lane(a) - lane(b) || a.player_slot - b.player_slot);
  state.players = ordered.map((p, i) => ({
    slot: Number(p.player_slot) || 0, team: Number(p.team) === 1 ? 1 : 0, lane: lane(p), heroId: Number(p.hero_id) || 0,
    hero: (window.HERO_NAMES || {})[p.hero_id] || "Hero " + (Number(p.hero_id) || 0),
    img: `assets/heroes/${Number(p.hero_id) || 0}.png`, // masked card art for the round chips
    card: (window.HERO_CARDS || []).includes(Number(p.hero_id)) ? `assets/cards/${Number(p.hero_id)}.webp` : null, // the game's rectangular card art
    left: Number(p.abandon_match_time_s) || 0,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    stats: scoreboardKda(p),
    kdaGraphStats: kdaGraphStats(p, Number(mi.duration_s)),
    souls: p.net_worth || 0, mvp: p.mvp_rank || 0,
    badge: brawl ? 0 : Number(p.player_rank_data?.initial_display_rank) || 0,
    raw: p,
  }));
  applyViewer();
  const stillPresent = old => state.players.some(p => samePlayer(p, old));
  const requested = params.get("pick");
  state.summaryPick = String(mi.match_id) === params.get("match") && /^\d+$/.test(requested || "") ? Number(requested) : null;
  if (summary?.picked && stillPresent(summary.player)) state.summaryPick = summary.player.slot;
  state.summaryStat = summary && samePlayer(window.Summary.selected(), summary.player) ? summary.stat : null;
  const canSummarize = hasSummaryStats();
  state.tab = state.awaitingValve ? "summary" : state.requestedTab || (canSummarize ? "summary" : "graphs");
  if (!state.awaitingValve && state.tab === "summary" && !canSummarize) state.tab = "graphs";

  const sel = picked ? picked.filter(stillPresent).map(p => p.slot)
    : (params.get("players") || "").split(",").filter(x => /^\d+$/.test(x.trim())).map(Number).filter(n => state.players.some(p => p.slot === n));
  state.sel = sel.length ? new Set(sel) : null;
  state.showGraph = !!sel.length && (!picked || hadGraph);
  state.hiddenGroups.clear();
  state.laneOf = null;
  state.laneHover = null;
  state.mvpPick = null;
  state.muPair = null;
  state.lineOv = {}; state.tray = []; state.focus = null; // a new match opens with nothing drawn
  prepDynamicGraphs(true);
  // Brawl objective entries reuse standard map IDs, including inactive buildings.
  state.events = brawl ? [] : buildEvents(mi);
  $("matchInput").value = mi.match_id || "";
  $("clock").textContent = fmtTime(mi.duration_s || 0);
  setStatus("");
  renderAll();
}

// Stats snapshots sorted by time, with kills, deaths and assists pinned to the scoreboard:
// the last snapshot can disagree with the end screen, so the final point uses the scoreboard and earlier points never pass it.
function scoreboardKda(p) {
  const st = (p.stats || []).map(s => Object.assign({}, s)).sort((a, b) => a.time_stamp_s - b.time_stamp_s);
  for (const k of ["kills", "deaths", "assists"]) {
    const end = Number(p[k]);
    if (!Number.isFinite(end) || !st.length) continue;
    for (const s of st) if (s[k] > end) s[k] = end;
    st[st.length - 1][k] = end;
  }
  return st;
}

function buildEvents(mi) {
  const ev = [];
  for (const o of mi.objectives || []) {
    const t = o.destroyed_time_s;
    if (!t) continue;
    const id = o.team_objective_id, team = TEAMS[o.team] || TEAMS[0];
    let what, type, icon, lane = null;
    if (id >= 1 && id <= 4) { what = "Guardian"; type = "guardian"; icon = "objective_t1"; lane = LANES[id]; }
    else if (id >= 5 && id <= 8) { what = "Walker"; type = "walker"; icon = "objective_t2"; lane = LANES[id - 4]; }
    else if (id >= 12 && id <= 15) { what = "Base Guardians"; type = "base"; icon = "objective_t2"; lane = LANES[id - 11]; }
    else if (id === 10 || id === 11) { what = "Shrine"; type = "shrine"; icon = "team"; }
    else if (id === 9) { what = "Patron (first phase)"; type = "patron"; icon = "team"; }
    else if (id === 0) { what = "Patron"; type = "patron"; icon = "team"; }
    else continue;
    const name = lane ? `${team.color}'s ${lane} ${what}` : `${team.color}'s ${what}`;
    ev.push({ t, type, text: `${name} destroyed`, color: team.c, icon: icon === "team" ? team.icon : `assets/ui/${icon}.svg` });
  }
  for (const mb of mi.mid_boss || []) {
    if (!mb.destroyed_time_s) continue;
    const tm = mb.team_claimed ?? mb.team_killed;
    const by = TEAMS[tm] ? TEAMS[tm].color : "";
    ev.push({ t: mb.destroyed_time_s, type: "mid", text: `Mid Boss taken${by ? " by " + by : ""}`, color: "#70F8C1", icon: "assets/ui/icon_soul.svg", mid: true });
  }
  return ev.sort((a, b) => a.t - b.t);
}

// ---------- ranks ----------
// Valve's packed badge: tens = tier (0 Obscurus .. 11 Eternus), ones = subrank 1-6.
// Names and badges from the ranked overhaul (Citadel_ranks_N strings, ranked/badges/rankNN_sm art).
// The game draws the subrank as text engraved on that art (citadel_ranked_badge.vcss, CitadelRankedBadgeMini):
// a 256px box, Oracle bold 64px, #000000ee, a 4px glow in a per-rank color, pushed down by a per-rank margin.
// RANK_GLOW and RANK_DROP copy those values. Averages (team, lobby) show the badge without it.
const RANK_GLOW = ["#fff6", "#6b4e2f", "#7c6e63", "#8b9092", "#a57941", "#b9d0e0", "#ddb854", "#e3eade", "#d7e1eb", "#d2dcef", "#f2fed6", "#fafdfc"];
const RANK_DROP = [68, 68, 62, 68, 68, 68, 68, 42, 68, 46, 48, 30];
const RANK_NAMES = ["Obscurus", "Initiate", "Seeker", "Acolyte", "Sentinel", "Mystic", "Ritualist", "Emissary", "Oracle", "Phantom", "Ascendant", "Eternus"];
const SUBRANKS = ["", "I", "II", "III", "IV", "V", "VI"];
function rankOf(badge) {
  if (!badge) return null;
  const tier = Math.floor(badge / 10), sub = badge % 10;
  if (!RANK_NAMES[tier]) return null;
  return { tier, sub, name: tier === 0 || !SUBRANKS[sub] ? RANK_NAMES[tier] : `${RANK_NAMES[tier]} ${SUBRANKS[sub]}`, img: `assets/ranks/${tier}.png`,
    mark: tier === 0 ? "" : SUBRANKS[sub] || "" };
}
// Average as steps (tier * 6 + subrank), then back to a badge.
function avgBadge(badges) {
  const b = badges.filter(x => x && Math.floor(x / 10) > 0);
  if (!b.length) return 0;
  const steps = b.reduce((a, x) => a + Math.floor(x / 10) * 6 + (x % 10 - 1), 0) / b.length;
  const r = Math.round(steps);
  return Math.floor(r / 6) * 10 + (r % 6) + 1;
}
function rankHtml(badge, cls, plain) {
  const r = rankOf(badge);
  return r ? `<span class="${cls || "rank"}"><span class="rk" style="--glow:${RANK_GLOW[r.tier]};--drop:${RANK_DROP[r.tier]}"><img src="${r.img}" alt="">${r.mark && !plain ? `<b>${r.mark}</b>` : ""}</span><span>${esc(r.name)}</span></span>` : "";
}

// ---------- top bar ----------
function renderTop(tab = state.tab) {
  const summary = tab === "summary";
  const mvp = summary || tab === "mvp" || tab === "matchups"; // tabs that focus one hero
  const focused = summary ? window.Summary.selected().slot : state.mvpPick;
  const lanesG = !mvp && graphNow().kind === "lanes"; // Lane Stats: a portrait picks its lane
  const leadG = !mvp && !lanesG && (graphNow().kind === "lead" || grouped(graphNow())); // views where hero picks don't apply
  const curLane = lanesG ? laneNow() : null;
  const sel = lanesG ? new Set(state.players.filter(p => laneName(p) === curLane).map(p => p.slot))
    : mvp || leadG ? new Set(state.players.map(p => p.slot)) : selNow();
  for (const side of ["Left", "Right"]) {
    const team = side === "Left" ? state.leftTeam : 1 - state.leftTeam;
    const T = TEAMS[team];
    const ctn = $("team" + side);
    ctn.innerHTML = "";
    const ps = state.players.filter(p => p.team === team);
    for (const p of ps) {
      const dash2 = !mvp && !lanesG && brkView(graphNow()) === "overlay" && [...sel].indexOf(p.slot) === 1; // the dashed hero
      const d = el("button", "player" + (sel.has(p.slot) ? " sel" : "") + (mvp && focused === p.slot ? " pick" : "") + (dash2 ? " dash2" : ""));
      d.setAttribute("aria-pressed", mvp ? String(focused === p.slot) : String(sel.has(p.slot)));
      d.style.setProperty("--tc", T.c); d.style.setProperty("--coin", T.coin); d.style.setProperty("--pc", colorOf(p));
      const rk = rankOf(p.badge);
      const playerName = summary ? window.Summary.name(p) : p.hero;
      const action = summary ? "Click to open this player's Summary." : mvp ? "Click to see why they placed where they did."
        : lanesG ? "Click to see their lane. Hover to see their part." : "Click to add or remove. Ctrl+Click to show only this hero.";
      d.title = `${playerName}${rk ? " (" + rk.name + " going into the match)" : ""}${p.left ? "\nLeft the match at " + fmtTime(p.left) : ""}\n${action}`;
      if (summary) {
        d.dataset.summaryPortrait = p.slot;
        d.setAttribute("aria-label", `${playerName}${playerName !== p.hero ? " on " + p.hero : ""}${p === state.me ? ", you" : ""}`);
      }
      if (lanesG) {
        d.onmouseenter = () => { if (laneName(p) === curLane) { state.laneHover = p.slot; window.renderLanes(); } };
        d.onmouseleave = () => { if (state.laneHover === p.slot) { state.laneHover = null; window.renderLanes(); } };
      }
      const hi = el("div", "heroImg");
      const img = document.createElement("img"); img.src = p.img; img.alt = p.hero; img.onerror = () => { img.remove(); };
      hi.append(img);
      const souls = el("div", "souls");
      if (!state.awaitingValve || Number.isFinite(p.raw.net_worth)) souls.innerHTML = fmtSouls(p.souls);
      d.append(hi, souls, el("div", "pcolor"));
      if (p.mvp === 1) d.append(el("div", "badge", "MVP"));
      else if (p.mvp > 1) d.append(el("div", "badge key", "KEY"));
      d.onclick = ev => {
        if (summary) {
          window.Summary.select(p.slot);
          document.querySelector(`[data-summary-portrait="${p.slot}"]`)?.focus({ preventScroll: true });
          return;
        }
        if (mvp) { state.mvpPick = p.slot; state.muPair = null; renderAll(); return; }
        if (lanesG) { if (laneName(p)) { state.laneOf = laneName(p); state.laneHover = p.slot; renderAll(); } return; }
        if (leadG) return;
        const s = new Set(selNow());
        if (ev.ctrlKey || ev.metaKey) { setSel(new Set([p.slot])); }
        else { if (s.has(p.slot)) s.delete(p.slot); else s.add(p.slot); setSel(s); }
        renderAll();
      };
      ctn.append(d);
    }
    const sc = $("score" + side);
    const total = ps.reduce((a, p) => a + p.souls, 0);
    sc.style.setProperty("--tc", T.c);
    const hasTotal = !state.awaitingValve || ps.every(p => Number.isFinite(p.raw.net_worth));
    sc.innerHTML = `<span>${hasTotal ? fmtSouls(total) : "–"}</span><span class="icon" style="background-image:url(${T.icon})"></span>`;
    const tb = isStreetBrawl() ? 0
      : (team === 0 ? state.match.average_badge_team0 : state.match.average_badge_team1) || avgBadge(ps.map(p => p.badge));
    const ta = $("avg" + side);
    ta.innerHTML = tb ? `<span class="lbl">Avg</span>${rankHtml(tb, "", true)}` : "";
    sc.title = summary ? T.name : `${T.name}\nClick to show only this team. Click again to show everyone.`;
    const onlyThis = ps.length && ps.every(p => sel.has(p.slot)) && [...sel].every(s => ps.some(p => p.slot === s));
    sc.classList.toggle("dim", sel.size > 0 && !ps.some(p => sel.has(p.slot)));
    sc.onclick = () => { if (mvp || leadG || lanesG) return; setSel(onlyThis ? new Set(state.players.map(p => p.slot)) : new Set(ps.map(p => p.slot))); renderAll(); };
  }
}

// ---------- dropdown and options ----------
// Like the game's own menu: flat rows, one line each, section names on a darker band. A graph's note shows on hover.
function buildDropDown() {
  const menu = $("ddMenu");
  menu.innerHTML = "";
  let group = null, extra = false;
  for (const g of availableGraphs()) {
    if (g.group !== group) { group = g.group; extra = false; menu.append(el("div", "cat", group)); }
    if (g.extra && !extra) { extra = true; menu.append(el("div", "extraSep", "Added by Postmortem")); }
    const b = el("button", "item" + (g.id === state.graph ? " on" : ""), g.label);
    const note = g.sub || (g.kind === "breakdown" && GROUP_SUB[g.group]);
    if (note) b.title = note;
    b.onclick = ev => { ev.stopPropagation(); openGraph(g.id); closeMenu(); renderAll(); };
    menu.append(b);
  }
  $("ddLabel").textContent = graphNow().label;
}
function closeMenu() { $("ddMenu").hidden = true; $("graphDD").classList.remove("open"); }
function wireDropDown() {
  const dd = $("graphDD");
  dd.onclick = () => {
    const m = $("ddMenu");
    m.hidden = !m.hidden;
    dd.classList.toggle("open", !m.hidden);
    if (m.hidden) return;
    buildDropDown();
    const on = m.querySelector(".item.on"); // open with the current graph in view
    if (on && on.offsetTop + on.offsetHeight > m.clientHeight) m.scrollTop = on.offsetTop - m.clientHeight / 2;
  };
  dd.onkeydown = ev => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const graphs = availableGraphs();
      const i = graphs.findIndex(g => g.id === state.graph) + (ev.key === "ArrowDown" ? 1 : -1);
      openGraph(graphs[(i + graphs.length) % graphs.length].id); renderAll();
    } else if (ev.key === "Escape") closeMenu();
  };
  document.addEventListener("click", ev => { if (!dd.contains(ev.target)) closeMenu(); });
}
function seg(id, value, fn) {
  $(id).querySelectorAll(".graphOptionButton").forEach(b => {
    b.classList.toggle("on", b.dataset.v === value);
    b.onclick = () => fn(b.dataset.v);
  });
}
// Quick picks: you plus your lane opponents, everyone, or nobody.
function lanePick() {
  const me = state.me;
  if (!me || isStreetBrawl()) return null;
  const foes = state.players.filter(p => p.team !== me.team && p.lane && p.lane === me.lane);
  return [me.slot, ...foes.map(p => p.slot)];
}
function renderPicks() {
  const g = graphNow();
  const box = $("optPick");
  box.hidden = g.kind === "lead" || grouped(g);
  const lane = lanePick();
  const sel = selNow();
  const same = arr => arr && arr.length === sel.size && arr.every(x => sel.has(x));
  const all = state.players.map(p => p.slot);
  const btn = (id, label, arr, tip) => {
    const b = $(id);
    b.textContent = label;
    b.hidden = !arr;
    b.title = tip;
    b.classList.toggle("on", !!arr && same(arr));
    b.onclick = () => { setSel(new Set(arr)); renderAll(); };
  };
  btn("pickLane", "Me + Lane", lane, "You and the enemies in your lane");
  btn("pickAll", "All", all, `All ${all.length} players`);
  // Teams in the same order as the portraits: yours (or Hidden King) first.
  const L = state.leftTeam, team = t => state.players.filter(p => p.team === t).map(p => p.slot);
  const left = team(L), right = team(1 - L);
  btn("pickTeamL", TEAMS[L].name, left, `All ${left.length} players on ${TEAMS[L].name}${state.me ? " (your team)" : ""}`);
  btn("pickTeamR", TEAMS[1 - L].name, right, `All ${right.length} players on ${TEAMS[1 - L].name}`);
  btn("pickNone", "None", [], "Nobody, then click portraits to add them");
}
function renderOptions() {
  const g = graphNow(), sel = selNow();
  const lanes = g.kind === "lanes";
  const brawl = isStreetBrawl();
  document.body.classList.toggle("laneMode", lanes);
  $("optLane").hidden = $("optLaneTime").hidden = !lanes;
  if (lanes) {
    GraphMarkers.close();
    $("optPick").hidden = $("optMode").hidden = $("optDiff").hidden = $("optMarks").hidden = true;
    window.renderLaneOptions();
    $("ddLabel").textContent = g.label;
    return;
  }
  $("optMode").hidden = false;
  renderPicks();
  const modeOk = !g.ratio && !g.level && g.kind !== "lead";
  const okFor = v => v === "value" || (modeOk && (v === "permin" || g.kind === "general"));
  seg("optMode", modeNow(g), v => { state.mode = v; state.showGraph = true; renderAll(); });
  $("optMode").querySelectorAll("button").forEach(b => {
    b.hidden = brawl && b.dataset.v === "lane";
    b.disabled = !okFor(b.dataset.v);
    if (b.disabled) b.title = g.kind === "breakdown" ? "Only for the General graphs" : "Not for this graph";
  });
  const canDiff = g.kind !== "lead" && !grouped(g) && sel.size === 2 && (g.kind === "general" || visibleCats(g).length === 1);
  if (!canDiff) state.diff = false;
  $("optDiff").hidden = !canDiff;
  seg("optDiff", state.diff ? "on" : "off", v => { state.diff = v === "on"; renderAll(); });
  $("optMarks").hidden = false;
  $("markObj").closest(".markControl").hidden = brawl;
  GraphMarkers.renderOptions();
  $("ddLabel").textContent = g.label;
}

// ---------- series ----------
// How a graph's points are built for one hero. Totals start at 0 at 0:00 and the Power graphs at each hero's spawn values.
// Rates and percentages have no value until Valve's first snapshot (3:00), so their lines start at 0 and the first stretch
// is dotted (pts.real = index of the first real point).
function lineMaker(g, mode) {
  const perMin = mode === "permin";
  const lead = !g.start && (g.ratio || mode === "share" || perMin);
  const exact = mode === "value" && exactKda(g);
  const build = (p, get) => {
    if (exact) return stepPts(g.events(p));
    const pts = [];
    if (g.start) { const v0 = g.start(p); if (v0 != null) pts.push([0, v0]); }
    else pts.push([0, 0]);
    for (const s of graphStats(g, p)) {
      let v = get(s);
      if (v == null) continue;
      if (perMin) { if (s.time_stamp_s < 60) continue; v = v / (s.time_stamp_s / 60); }
      pts.push([s.time_stamp_s, v]);
    }
    if (lead && pts.length > 1) pts.real = 1;
    return pts;
  };
  // Line types built from the damage matrix or pickups bring their own points instead of reading the snapshots.
  const line = (p, ser) => {
    if (!ser.tl) return build(p, ser.get);
    const pts = [[0, 0]];
    for (const [t, v] of ser.tl(p)) {
      if (perMin) { if (t >= 60) pts.push([t, v / (t / 60)]); }
      else if (t > 0) pts.push([t, v]);
    }
    if (lead && pts.length > 1) pts.real = 1;
    if (ser.tl && pts.length && pts.every(([, v]) => v === pts[0][1])) pts.unused = true; // a source this hero never used
    return pts;
  };
  return { build, line };
}
const graphStats = (g, p) => g.events ? p.kdaGraphStats : p.stats;
// One line type for one hero, kept until the match, the graph's line types or the view changes. The legend needs every
// type's total for every hero it lists, so this keeps hover and toggling from rebuilding lines that did not change.
function typeLine(g, p, i) {
  const mode = modeNow(g), mi = state.match;
  const key = `${g.id}|${g._key || ""}|${mode}|${p.slot}|${i}|${g.series[i].label}`;
  const c = mi._lines || (mi._lines = new Map());
  if (!c.has(key)) c.set(key, lineMaker(g, mode).line(p, g.series[i]));
  return c.get(key);
}
const endOf = pts => (pts && pts.length ? pts[pts.length - 1][1] : 0);
// Each line type keeps one color for as long as the graph's types stay the same.
function typeColor(g, i) {
  if (!g._cols || g._cols.of !== g.series) {
    const cols = [], used = new Set();
    g.series.forEach((s, j) => { if (TYPE_FIXED[s.label]) { cols[j] = TYPE_FIXED[s.label]; used.add(cols[j]); } });
    const free = TYPE_PAL.filter(c => !used.has(c));
    let k = 0;
    g.series.forEach((s, j) => { if (!cols[j]) cols[j] = free[k++ % free.length]; });
    g._cols = { of: g.series, cols };
  }
  return g._cols.cols[i];
}
// Player-Specific graphs get a layout made for how many heroes are picked: one chart for 1 or 2 (solid and dashed),
// side-by-side panels for 3 or 4, and the overview (team totals and a ranked table) for 5 or more.
function brkView(g) {
  if (!g || g.kind !== "breakdown" || grouped(g)) return null;
  const n = selFor("breakdown").size;
  return n >= 5 ? "lobby" : n >= 3 ? "panels" : "overlay";
}
function seriesFor(g) {
  if (g.kind === "lead") return state.showGraph ? [leadLine()] : [];
  const sel = g.kind === "breakdown" ? pickedList("breakdown") : state.players.filter(p => selNow().has(p.slot));
  const mode = modeNow(g);
  if (mode === "team" || mode === "lane") return groupLines(g, mode).filter(se => !state.hiddenGroups.has(se.label));
  const { build } = lineMaker(g, mode);
  const diffOk = state.diff && sel.length === 2;
  if (g.kind === "general") {
    if (!state.showGraph) return [];
    const get = mode === "share" ? shareGet(g) : g.get;
    const lines = sel.map(p => ({ player: p, label: p.hero, color: colorOf(p), dash: "", key: "s" + p.slot, pts: build(p, get) }));
    if (diffOk) return [diffLine(lines[0], lines[1], null)];
    // Share of the whole lobby at a time, for the hover readout, like the game's own graph tooltip.
    if (!g.ratio && !g.level && mode !== "share") {
      const everyone = state.players.map(p => build(p, get));
      const total = t => everyone.reduce((a, pts) => a + (lerpAt(pts, t) || 0), 0);
      for (const l of lines) l.total = total;
    }
    return lines;
  }
  if (brkView(g) === "lobby") return []; // the overview draws its own table
  const cats = visibleCats(g);
  if (diffOk && cats.length === 1) {
    const i = cats[0];
    const [a, b] = sel.map(p => ({ player: p, label: p.hero, color: typeColor(g, i), pts: typeLine(g, p, i) }));
    return [diffLine(a, b, g.series[i].label)];
  }
  const out = [], two = sel.length <= 2;
  sel.forEach((p, hi) => {
    for (const i of cats) {
      const pts = typeLine(g, p, i);
      if (pts.unused && g.dyn) continue;
      out.push({ player: p, hi: two ? hi : 0, ti: i, key: "t" + i, label: p.hero, sub: g.series[i].label, color: typeColor(g, i), dash: two ? HERO_DASH[hi] : "", pts });
    }
  });
  return out;
}
// % of Team: a hero's value over the sum of their team's values at the same snapshot.
function shareGet(g) {
  const tot = {};
  for (const p of state.players) for (const s of graphStats(g, p)) {
    const k = p.team + ":" + s.time_stamp_s;
    tot[k] = (tot[k] || 0) + (Number(g.get(s)) || 0);
  }
  return function (s) {
    const p = state.players.find(q => graphStats(g, q).includes(s));
    const t = p ? tot[p.team + ":" + s.time_stamp_s] : 0;
    return t ? (100 * (Number(g.get(s)) || 0)) / t : null;
  };
}
const LANE_COLORS = { Yellow: "#FFD23F", Green: "#58D86A", Blue: "#5C9DFF" };
// Teams and Lanes: heroes added together at each snapshot. Lanes pair each team's two heroes in the same lane.
function groupLines(g, mode) {
  const times = [...new Set(state.players.flatMap(p => graphStats(g, p).map(s => s.time_stamp_s)))].sort((a, b) => a - b);
  const at = (p, t) => { const s = graphStats(g, p).find(x => x.time_stamp_s === t); return s ? g.get(s) ?? null : null; };
  const groups = [];
  for (const team of [state.leftTeam, 1 - state.leftTeam]) {
    const T = TEAMS[team], ps = state.players.filter(p => p.team === team);
    if (mode === "team") groups.push({ label: T.color, color: T.c, dash: "", ps, team });
    else {
      const lanes = [...new Set(ps.map(p => p.lane))].sort((a, b) => a - b);
      for (const ln of lanes) {
        const name = LANES_BY_COLOR[ln] || "No";
        groups.push({ label: `${T.color} ${name}`, sub: name + " lane", color: LANE_COLORS[name] || T.c, dash: team === state.leftTeam ? "" : "10 6", ps: ps.filter(p => p.lane === ln), team });
      }
    }
  }
  return groups.map(gr => {
    const pts = [[0, 0]];
    for (const t of times) {
      const vs = gr.ps.map(p => at(p, t)).filter(v => v != null);
      if (vs.length) pts.push([t, vs.reduce((a, v) => a + v, 0)]);
    }
    return { group: gr, label: gr.label, color: gr.color, dash: gr.dash, key: "g" + gr.label, pts };
  });
}
// Team Souls Lead: the viewer's team (left) minus the other team, at every stats snapshot.
function leadLine() {
  const L = state.leftTeam;
  const times = [...new Set(state.players.flatMap(p => p.stats.map(s => s.time_stamp_s)))].sort((a, b) => a - b);
  const at = (p, t) => { const s = p.stats.filter(x => x.time_stamp_s <= t).pop(); return s ? s.net_worth || 0 : 0; };
  const pts = [[0, 0]];
  for (const t of times) {
    let v = 0;
    for (const p of state.players) v += (p.team === L ? 1 : -1) * at(p, t);
    pts.push([t, v]);
  }
  return { lead: true, label: "Team Souls Lead", color: "#FFEFD7", dash: "", pts };
}
function diffLine(a, b, cat) {
  if (a.pts.step && b.pts.step) { // step graphs: the gap changes whenever either hero's count does
    const ts = [...new Set([...a.pts, ...b.pts].map(p => p[0]))].sort((x, y) => x - y), pts = [];
    let prev = 0;
    for (const t of ts) { const d = stepAt(a.pts, t) - stepAt(b.pts, t); pts.push([t, prev], [t, d]); prev = d; }
    pts.step = true;
    return { player: a.player, other: b.player, label: `${a.label} vs ${b.label}`, sub: cat, color: a.color, dash: "", diff: true, pts };
  }
  const pts = a.pts.map(([t, v]) => [t, v - (valueAt(b.pts, t) ?? 0)]);
  if (a.pts.real) pts.real = a.pts.real;
  return { player: a.player, other: b.player, label: `${a.label} vs ${b.label}`, sub: cat, color: a.color, dash: "", diff: true, pts };
}
// A line's value at any time, read off the straight segments between its points (null outside them).
function lerpAt(pts, t) {
  if (!pts.length || t < pts[0][0] || t > pts[pts.length - 1][0]) return null;
  if (pts.step) return stepAt(pts, t);
  for (let i = 1; i < pts.length; i++) {
    const [t1, v1] = pts[i - 1], [t2, v2] = pts[i];
    if (t <= t2) return t2 === t1 ? v2 : v1 + ((v2 - v1) * (t - t1)) / (t2 - t1);
  }
  return pts[pts.length - 1][1];
}
function valueAt(pts, t) {
  let best = null, bd = Infinity;
  for (const [x, v] of pts) { const d = Math.abs(x - t); if (d < bd) { bd = d; best = v; } }
  return best;
}

// ---------- chart ----------
function renderAll() {
  if (state.match) prepDynamicGraphs();
  if (!state.match) return;
  stopChartHover();
  const ctn = $("graphCtn"), overview = $("overview");
  if (ctn.parentElement === overview) overview.before(ctn);
  ctn.style.height = "";
  ctn.classList.remove("overviewMarkers");
  const t0 = performance.now();
  const activeTab = state.tab;
  const summary = activeTab === "summary";
  renderTabs();
  document.body.classList.toggle("tabMvp", activeTab === "mvp");
  document.body.classList.toggle("tabMu", activeTab === "matchups");
  document.body.classList.toggle("tabSummary", summary);
  document.body.classList.toggle("tabPick", activeTab !== "graphs");
  $("summaryView").hidden = !summary;
  $("summaryBackdrop").hidden = EMBED || !summary;
  if (!summary) window.Summary?.hideTip();
  const lb = avgBadge(state.players.map(p => p.badge));
  $("lobbyRank").innerHTML = lb ? `<span class="lbl">Lobby</span>${rankHtml(lb, "", true)}` : "";
  renderTop(activeTab);
  if (activeTab !== "graphs") {
    GraphMarkers.close();
    document.body.classList.remove("hasLegend", "lobbyView");
  }
  if (summary) { window.Summary.render(); return; }
  if (activeTab === "mvp") { window.renderMvp(); return; }
  if (activeTab === "matchups") { window.renderMatchups(); return; }
  renderOptions();
  const g0 = graphNow();
  if (g0.kind === "lanes") { $("tooltip").hidden = true; document.body.classList.remove("hasLegend", "lobbyView"); window.renderLanes(); return; }
  const series = seriesFor(g0);
  // % of Team reads as a percentage. Per Minute and % of Team are rates, so counts lose their whole-number readout there.
  const m0 = modeNow(g0);
  const g = m0 === "share" ? Object.assign({}, g0, { ratio: true, whole: false }) : m0 === "permin" ? Object.assign({}, g0, { whole: false }) : g0;
  const lobby = brkView(g0) === "lobby";
  document.body.classList.toggle("lobbyView", lobby);
  renderLegend(g0, g);
  const markers = GraphMarkers.layout(g0, brkView(g0));
  if (lobby) {
    renderOverview(g0, g);
    if (markers.visible) {
      ctn.classList.add("overviewMarkers");
      ctn.style.height = (GraphMarkers.height(markers.rows.concat(markers.teams)) + (markers.objectives.length ? 33 : 9) + 32) + "px";
      overview.querySelector(".ovTable").before(ctn);
      drawChart([], g, markers);
    }
  } else drawChart(series, g, markers);
  renderLines(series, g);
  perfNote("render", performance.now() - t0);
}

// The chart area holds one plot, or one panel per hero when 3 or 4 heroes are picked on a Player-Specific graph.
// Every plot shares the time axis and the value scale, so panels can be compared at a glance.
function plotLayout(W, H, m, view, series, markers) {
  if (view !== "panels") {
    return [{ l: m.l, r: W - m.r, t: m.t, b: H - m.b, labX: W - 4, timeY: H - 12, series }];
  }
  const heroes = pickedList("breakdown"), n = heroes.length, cols = n === 3 ? 3 : 2, rows = n === 3 ? 1 : 2;
  const gx = 28, gy = 26, top = 6, bottom = 6 + (markers.teams.length ? GraphMarkers.height(markers.teams) + 38 : 0);
  const gut = 62, head = markers.objectives.length ? 76 : 50, foot = 30;
  const cw = (W - m.l - gx * (cols - 1)) / cols, ch = (H - top - bottom - gy * (rows - 1)) / rows;
  return heroes.map((p, k) => {
    const cx = m.l + (k % cols) * (cw + gx), cy = top + Math.floor(k / cols) * (ch + gy);
    const rows = markers.rows.filter(row => row.p === p);
    return { p, cx, cy, cw, ch, rows, l: cx, r: cx + cw - gut, t: cy + head,
      b: cy + ch - foot - (rows.length ? GraphMarkers.height(rows) + 4 : 0), labX: cx + cw - 4, timeY: cy + ch - 8,
      series: series.filter(se => se.player === p) };
  });
}
function drawChart(series, g, markers) {
  const ctn = $("graphCtn"), svg = $("chart");
  const W = ctn.offsetWidth, H = ctn.offsetHeight;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const view = brkView(g);
  const timeline = view === "lobby", panels = view === "panels";
  const rows = markers.rows.concat(markers.teams);
  const m = { l: 18, r: timeline || (rows.length && !panels) ? 152 : 96, t: 34, b: timeline ? 32 : 40 };
  const keyH = view === "overlay" && pickedList("breakdown").length ? 36 : 0; // the solid/dashed key sits above everything
  m.t += keyH;
  if (!panels && rows.length) m.b += GraphMarkers.height(rows) + 6;
  if (timeline) m.t = Math.max(0, H - m.b - 1);
  const dur = state.match.duration_s || Math.max(60, ...series.flatMap(s => s.pts.map(p => p[0])));
  const vals = series.flatMap(s => s.pts.map(p => p[1]));
  let ymin = 0, ymax = 1;
  if (vals.length) { ymax = Math.max(...vals); ymin = Math.min(0, ...vals); }
  if (g.level && vals.length) ymin = Math.min(...vals);
  if (ymax === ymin) ymax = ymin + 1;
  const ticks = niceTicks(ymin, ymax, view === "panels" && pickedList("breakdown").length > 3 ? 3 : 4, (series.length > 0 && series.every(se => se.pts.step)) || !!g.whole);
  ymin = Math.min(ymin, ticks[0]); ymax = Math.max(ymax, ticks[ticks.length - 1]);
  const plots = plotLayout(W, H, m, view, series, markers);
  const evs = markers.objectives;
  const outline = series.length <= 12;
  let ls = ""; // a dark edge under each line helps a few lines; with many it only costs drawing time
  const two = view === "overlay" && series.some(se => se.hi === 1);
  let s = "";
  const layer = document.createDocumentFragment(), markerNodes = new Map();
  for (const [idx, P] of plots.entries()) {
    P.X = t => P.l + (Math.max(0, Math.min(t, dur)) / dur) * (P.r - P.l);
    P.Y = v => P.b - ((v - ymin) / (ymax - ymin)) * (P.b - P.t);
    const { X, Y } = P;
    for (const v of series.length ? ticks : []) {
      if (v === ymin && !g.level) continue;
      s += `<line x1="${P.l}" x2="${P.r + 8}" y1="${Y(v)}" y2="${Y(v)}" stroke="#ffffff" stroke-opacity="0.045"/>`;
      s += `<text class="ylab" x="${P.labX}" y="${Y(v) + 6}" text-anchor="end">${fmtNum(g.kind === "lead" ? Math.abs(v) : v, g)}</text>`;
    }
    const step = dur > 1500 ? (view === "panels" ? 900 : 600) : 300;
    s += `<text x="${X(0)}" y="${P.timeY}" text-anchor="start">${fmtTime(0)}</text>`;
    for (let t = step; t <= dur; t += step) {
      if (t < step * 0.45) continue;
      s += `<text x="${X(t)}" y="${P.timeY}" text-anchor="middle">${fmtTime(t)}</text>`;
    }
    const y0 = Y(ymin === 0 || ymin < 0 ? 0 : ymin);
    s += `<line x1="${P.l}" x2="${P.r + 8}" y1="${y0}" y2="${y0}" stroke="#ffffff" stroke-opacity="${ymin < 0 ? 0.35 : 0.12}"/>`;
    if (!timeline) for (const e of markers.guides) s += `<line class="objectiveGuide" x1="${X(e.t)}" x2="${X(e.t)}" y1="${P.t - 4}" y2="${P.b}" stroke="${e.color}" stroke-opacity="0.38" stroke-dasharray="3 5" stroke-width="1.5"/>`;
    const masks = GraphMarkers.deadMasks(P, idx);
    if (masks.svg) s += `<defs>${masks.svg}</defs>`;
    const lead = P.series.find(se => se.lead);
    if (lead && lead.pts.length > 1) {
      const z = Y(0), xs = lead.pts.map(([t, v]) => `${X(t).toFixed(1)} ${Y(v).toFixed(1)}`).join(" L");
      const area = `M${X(lead.pts[0][0]).toFixed(1)} ${z} L${xs} L${X(lead.pts[lead.pts.length - 1][0]).toFixed(1)} ${z}Z`;
      const cL = TEAMS[state.leftTeam].c, cR = TEAMS[1 - state.leftTeam].c;
      s += `<defs><clipPath id="clipUp"><rect x="0" y="0" width="${W}" height="${z}"/></clipPath><clipPath id="clipDn"><rect x="0" y="${z}" width="${W}" height="${H}"/></clipPath></defs>`;
      s += `<path d="${area}" fill="${cL}" fill-opacity="0.28" clip-path="url(#clipUp)"/><path d="${area}" fill="${cR}" fill-opacity="0.28" clip-path="url(#clipDn)"/>`;
      s += `<text x="${P.l + 10}" y="${P.t + 4}" style="fill:${cL};font-weight:600">${TEAMS[state.leftTeam].color} ahead</text>`;
      s += `<text x="${P.l + 10}" y="${P.b - 12}" style="fill:${cR};font-weight:600">${TEAMS[1 - state.leftTeam].color} ahead</text>`;
    }
    const path = pts => pts.map(([t, v], i) => `${i ? "L" : "M"}${X(t).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
    for (const se of P.series) {
      if (!se.pts.length) continue;
      const k = se.pts.real || 0, d = path(se.pts.slice(k));
      const mask = masks.ids.get(se.player);
      let s = `<g data-k="${esc(se.key || "")}"${mask ? ` mask="url(#${mask})"` : ""}>`;
      // Before Valve's first snapshot a rate has no value: that stretch is a faint dotted line from 0.
      if (k) s += `<path d="${path(se.pts.slice(0, k + 1))}" fill="none" stroke="${se.color}" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 6"/>`;
      if (outline) s += `<path d="${d}" fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="${se.dash}"/>`;
      s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="${se.dash}"/>`;
      // With two heroes on one chart, a line ends in a filled dot (solid hero) or a ring (dashed hero).
      if (two) {
        const [t, v] = se.pts[se.pts.length - 1];
        s += se.hi === 1 ? `<circle cx="${X(t)}" cy="${Y(v)}" r="3.6" fill="#10130D" stroke="${se.color}" stroke-width="2"/>` : `<circle cx="${X(t)}" cy="${Y(v)}" r="4" fill="${se.color}"/>`;
      }
      ls += s + `</g>`;
    }
    GraphMarkers.drawObjectives(layer, evs, P, panels ? P.cy + 44 : keyH);
    GraphMarkers.drawRows(layer, panels ? P.rows : rows, P, P.b + 6, dur, !panels, markerNodes);
  }
  if (panels && markers.teams.length) {
    const h = GraphMarkers.height(markers.teams);
    const P = { l: m.l, r: W - 152, t: H - h - 32, b: H - 32 };
    P.X = t => P.l + (Math.max(0, Math.min(t, dur)) / dur) * (P.r - P.l);
    GraphMarkers.drawRows(layer, markers.teams, P, P.t, dur, true, markerNodes);
    for (let t = 0; t <= dur; t += dur > 1500 ? 600 : 300) {
      s += `<text x="${P.X(t)}" y="${H - 8}" text-anchor="${t ? "middle" : "start"}">${fmtTime(t)}</text>`;
    }
  }
  // The lines sit on their own layer above the axes. Focus fades that whole layer (no redraw) and copies the focused
  // lines onto a small layer on top, so hovering stays cheap even with dozens of lines.
  svg.innerHTML = s;
  const lv = $("chartLines"), fv = $("chartFocus");
  lv.setAttribute("viewBox", `0 0 ${W} ${H}`); fv.setAttribute("viewBox", `0 0 ${W} ${H}`);
  lv.innerHTML = ls; fv.innerHTML = "";
  $("markers").replaceChildren(layer);
  drawHeads(plots, view, series);

  const emp = $("empty");
  const none = !selNow().size && g.kind !== "lead" && !grouped(g);
  emp.hidden = timeline || series.length > 0;
  if (!emp.hidden) {
    if (!state.showGraph && (g.kind === "lead" || (!none && g.kind === "general" && !grouped(g)))) {
      const show = el("button", "graphOptionButton", g.kind === "lead" ? "Show team lead" : "Show picked heroes");
      show.onclick = () => { state.showGraph = true; renderAll(); };
      emp.replaceChildren(show);
    } else {
      emp.textContent = none ? "Pick heroes at the top to add their lines." : grouped(g) ? "Every line is hidden. Pick lines on the right."
        : g.kind === "breakdown" ? "Pick lines on the right to start." : "Nothing to show for these heroes.";
    }
  }
  emp.classList.toggle("hint", series.length === 0);
  wireHover(plots, series, g, dur, W, H, evs, timeline, markerNodes);
}
// Hero names above each panel, or a small key in the corner saying which hero is solid and which is dashed.
function drawHeads(plots, view, series) {
  const box = $("plotHeads");
  box.innerHTML = "";
  if (view === "panels") {
    for (const P of plots) {
      const T = TEAMS[P.p.team];
      box.insertAdjacentHTML("beforeend", `<div class="panelHead" style="left:${P.cx}px;top:${P.cy}px;width:${P.cw}px;--tc:${T.c}">` +
        `${portraitImg(P.p)}<span class="hn">${esc(heroName(P.p))}</span><span class="tm">${esc(T.name)}</span></div>`);
    }
    return;
  }
  if (view !== "overlay") return;
  const heroes = pickedList("breakdown");
  if (!heroes.length) return;
  box.insertAdjacentHTML("beforeend", `<div class="heroKey">` + heroes.map((p, hi) =>
    `<span class="k">${portraitImg(p)}<svg viewBox="0 0 34 6"><line x1="0" x2="34" y1="3" y2="3" stroke="#FFEFD7" stroke-width="2.6" stroke-dasharray="${HERO_DASH[hi] || ""}"/></svg><span class="hn">${esc(heroName(p))}</span></span>`).join("") + `</div>`);
}

// ---------- hover ----------
// The hover box, the crosshair and the focus only change when the second under the mouse (or what it points at) changes,
// and at most once per screen refresh. The lines themselves are never redrawn on hover: the game's browser draws on the
// CPU, and redrawing 80 lines on every mouse move is what made it lag there.
let stopChartHover = () => {};
function wireHover(plots, series, g, dur, W, H, evs, timeline, markerNodes) {
  const ctn = $("graphCtn"), tip = $("tooltip"), xh = $("xhairs");
  xh.innerHTML = plots.map(P => `<i class="xhair" style="left:${P.l}px;top:${P.t}px;height:${P.b - P.t}px"></i>`).join("");
  const bars = [...xh.children];
  const times = [...new Set(series.flatMap(se => se.pts.map(p => p[0])))].sort((a, b) => a - b);
  const end = times.length ? times[times.length - 1] : dur;
  const first = times.length ? Math.min(...series.filter(se => se.pts.length).map(se => se.pts[se.pts.real || 0][0])) : 0;
  const itemHover = $("markerHover"), [owned, from, to] = itemHover.children;
  let raf = 0, lastKey = "", lastHit = null, active = [], tw = 0, th = 0;
  state.pinned = false;
  tip.classList.remove("pinned");
  state.hoverFocus = null;
  applyFocus();
  const hideX = () => bars.forEach(b => b.classList.remove("on"));
  const highlight = hit => {
    active.forEach(node => node.classList.remove("active"));
    active = [];
    itemHover.hidden = !hit || hit.type !== "item";
    if (itemHover.hidden) return;
    const { P, item, t, end, barY } = hit;
    const left = P.X(t), right = P.X(end);
    owned.style.cssText = `left:${left}px;top:${barY}px;width:${Math.max(0, right - left)}px`;
    for (const [el, x] of [[from, left], [to, right]]) {
      el.style.cssText = `left:${x}px;top:${P.t}px;height:${Math.max(0, P.b - P.t)}px`;
    }
    active = [markerNodes.get(item), markerNodes.get(item.next)].filter(Boolean);
    active.forEach(node => node.classList.add("active"));
  };
  const clear = () => {
    tip.hidden = true;
    hideX();
    setHoverFocus(null);
    if (lastHit) highlight(null);
    lastHit = null;
    lastKey = "";
  };
  const place = (px, py, hit) => {
    const left = Math.max(0, Math.min(W - tw, px + tw + 22 > W ? px - tw - 22 : px + 22));
    // A short timeline in the overview may need the space above it for a full card.
    const minY = timeline ? -ctn.offsetTop : 0;
    const top = Math.max(minY, Math.min(hit ? py - th - 16 : py - 20, H - th));
    tip.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
  };
  const hover = (ev, marker) => {
    const h0 = performance.now();
    const hit = marker?.markerHit || ev.target.closest?.(".graphMarker")?.markerHit || null;
    if (hit && hit === lastHit && !tip.hidden) return;
    const { x: px, y: py } = marker ? hit : mouseIn(ctn, ev);
    const P = hit?.P || plots.find(q => px >= q.l && px <= q.r + 10 && py >= q.t && py <= q.b + 6);
    if (!P) { clear(); return; }
    const t = Math.round(Math.max(0, Math.min(end, ((px - P.l) / (P.r - P.l)) * dur)));
    // The line nearest the mouse (within 12 pixels) is brought forward and the rest dim, on every graph.
    let best = null, bd = 12;
    if (!hit) for (const se of P.series) { const v = lerpAt(se.pts, t); if (v == null) continue; const d = Math.abs(P.Y(v) - py); if (d < bd) { bd = d; best = se.key; } }
    setHoverFocus(best);
    if (hit?.type === "item") hideX();
    else plots.forEach((Q, k) => { bars[k].style.transform = `translateX(${(Q.X(hit ? hit.t : t) - Q.l).toFixed(1)}px)`; bars[k].classList.add("on"); });
    const key = hit ? "" : `${plots.indexOf(P)}|${t}|${state.focus || state.hoverFocus || ""}`;
    if (key !== lastKey || hit !== lastHit) {
      if (hit !== lastHit) highlight(hit);
      lastKey = key;
      lastHit = hit;
      const near = hit ? [] : evs.filter(e => Math.abs(e.t - t) <= dur * 0.012);
      let html = "";
      if (hit) html = hit.tip();
      else if (times.length) {
        html += `<div class="t">${fmtTime(t)}</div>`;
        if (near.length) html += evHtml(near);
        if (t < first) html += `<div class="noData">No data until ${fmtTime(first)}, Valve's first snapshot.</div>`;
        // With panels, the box reads out the hovered hero only; the crosshair still marks the same second in every panel.
        else html += readoutHtml((plots.length > 1 ? P.series : series).map(se => ({ se, v: lerpAt(se.pts, t) })).filter(r => r.v != null), g, t);
      } else if (near.length) html = evHtml(near);
      if (!html) { tip.hidden = true; return; }
      tip.innerHTML = html;
      tip.classList.toggle("heroTip", html.includes('class="heroRows'));
      tip.classList.toggle("purchaseTip", hit?.type === "item");
      tip.hidden = false;
      tw = tip.offsetWidth; th = tip.offsetHeight;
    }
    if (!tip.hidden) place(hit ? hit.x : px, hit ? hit.y : py, hit);
    perfNote("hover", performance.now() - h0);
  };
  let pending;
  const schedule = action => {
    pending = action;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; pending(); });
  };
  ctn.onclick = ev => {
    if (tip.contains(ev.target)) return;
    const marker = ev.target.closest(".graphMarker");
    schedule(() => {
      if (state.pinned) { state.pinned = false; tip.classList.remove("pinned"); lastKey = "unpin"; lastHit = null; highlight(null); }
      else {
        hover(ev, marker);
        if (tip.hidden) return;
        state.pinned = true;
        tip.classList.add("pinned");
        tip.insertAdjacentHTML("beforeend", `<div class="pinNote">Pinned. Click the graph to unpin.</div>`);
        return;
      }
      hover(ev, marker);
    });
  };
  ctn.onmousemove = ev => { if (!state.pinned) schedule(() => hover(ev)); };
  ctn.onmouseleave = () => { if (!state.pinned) schedule(clear); };
  const focusMarker = ev => {
    const marker = ev.target.closest(".graphMarker");
    if (marker && !state.pinned) schedule(() => hover(ev, marker));
  };
  const blurMarker = () => { if (!state.pinned) schedule(clear); };
  ctn.addEventListener("focusin", focusMarker);
  ctn.addEventListener("focusout", blurMarker);
  stopChartHover = () => {
    if (raf) cancelAnimationFrame(raf);
    ctn.onclick = ctn.onmousemove = ctn.onmouseleave = null;
    ctn.removeEventListener("focusin", focusMarker);
    ctn.removeEventListener("focusout", blurMarker);
    tip.hidden = true;
    highlight(null);
  };
  state.plots = plots;
}
// Focus: the hovered legend row or the line nearest the mouse stays bright, everything else steps back,
// and the focused lines get a tag at their end with the hero and the value.
function setHoverFocus(k) {
  if (state.hoverFocus === k) return;
  state.hoverFocus = k;
  applyFocus();
}
function setFocus(k) {
  if (state.focus === k) return;
  state.focus = k;
  applyFocus();
}
function applyFocus() {
  const k = state.focus || state.hoverFocus;
  const lv = $("chartLines"), fv = $("chartFocus"), tags = $("focusTags");
  const hits = k ? [...lv.children].filter(e => e.dataset.k === k) : [];
  const hit = hits.length > 0;
  lv.classList.toggle("dim", hit);
  fv.innerHTML = hits.map(e => e.outerHTML).join("");
  document.querySelectorAll("#lineLegend .lgRow").forEach(r => r.classList.toggle("f", !!k && r.dataset.k === k));
  tags.innerHTML = "";
  if (!hit || !state.plots) return;
  const g = graphNow(), gm = modeNow(g) === "permin" ? Object.assign({}, g, { whole: false }) : g;
  let html = "";
  for (const P of state.plots) for (const se of P.series) {
    if (se.key !== k || !se.pts.length || !se.player) continue;
    const [t, v] = se.pts[se.pts.length - 1];
    const up = se.hi !== 1;
    html += `<div class="ftag${up ? " up" : ""}" style="left:${P.X(t)}px;top:${P.Y(v)}px;--c:${se.color}">${portraitImg(se.player)}<span class="v">${fmtNum(v, gm)}</span></div>`;
  }
  tags.innerHTML = html;
}
// Every line at the hovered time. Player comparison graphs group lines under each player; long lists use two columns.
function readoutHtml(rows, g, t) {
  const fk = state.focus || state.hoverFocus;
  if (g.kind === "breakdown" && rows.some(r => r.se.sub && !r.se.diff)) {
    const groups = [];
    for (const r of rows) {
      let gr = groups.find(x => x.p === r.se.player);
      if (!gr) groups.push(gr = { p: r.se.player, hi: r.se.hi, rows: [] });
      gr.rows.push(r);
    }
    // Official-style hero row (team tint, line color stripe, portrait, name), then one thin row per line type.
    // Heroes are sorted by their biggest value; more than four heroes use two columns.
    for (const gr of groups) gr.max = Math.max(...gr.rows.map(r => r.v));
    groups.sort((a, b) => b.max - a.max);
    return `<div class="heroRows brk${groups.length > 4 ? " two" : ""}"${groups.length > 4 ? ` style="grid-template-rows:repeat(${Math.ceil(groups.length / 2)},auto)"` : ""}>` + groups.map(gr => {
      const T = TEAMS[gr.p.team];
      return `<div class="grp"><div class="hr" style="--tc:${T.c};--pc:#FFEFD7"><i class="sw${gr.hi === 1 ? " dash" : ""}"></i><span class="face">${cardImg(gr.p)}</span><span class="v hn">${esc(heroName(gr.p))}</span></div>` +
        gr.rows.sort((a, b) => b.v - a.v).map(({ se, v }) => `<div class="sr${se.key && se.key === fk ? " f" : ""}"><svg viewBox="0 0 22 6"><line x1="0" x2="22" y1="3" y2="3" stroke="${se.color}" stroke-width="2.5" stroke-dasharray="${se.dash}"/></svg><span class="n">${esc(se.sub)}</span><span class="v">${fmtNum(v, g)}</span></div>`).join("") + `</div>`;
    }).join("") + `</div>`;
  }
  rows.sort((a, b) => b.v - a.v);
  if (rows.length && rows.every(r => r.se.player && !r.se.diff && !r.se.sub)) return heroRowsHtml(rows, g, t);
  const two = rows.length > 8; // fill down the first column, then the second, so rank order reads top to bottom
  return `<div class="cols${two ? " two" : ""}"${two ? ` style="grid-auto-flow:column;grid-template-rows:repeat(${Math.ceil(rows.length / 2)},auto)"` : ""}>` + rows.map(({ se, v }) => rowHtml(se, v, g)).join("") + `</div>`;
}
// One hero per line, highest first, like the game's graph tooltip: the row is tinted in the hero's team color,
// the stripe on the left is the hero's line color, and the right column is their share of the whole lobby.
function heroRowsHtml(rows, g, t) {
  return `<div class="heroRows">` + rows.map(({ se, v }) => {
    const p = se.player, T = TEAMS[p.team], tot = se.total ? se.total(t) : 0;
    const fk = state.focus || state.hoverFocus;
    return `<div class="hr${se.key && se.key === fk ? " f" : ""}" style="--tc:${T.c};--pc:${se.color}" title="${esc(heroName(p))}"><i class="sw"></i>` +
      `<span class="face">${cardImg(p)}</span>` +
      `<span class="v">${fmtNum(v, g)}</span>${tot ? `<span class="pc">${Math.round((100 * v) / tot)}%</span>` : ""}</div>`;
  }).join("") + `</div>`;
}
function evHtml(list) {
  return `<div class="ev">${list.map(e => `<div><b style="background:${e.color}"></b>${esc(e.text)} <small style="opacity:.55">${fmtTime(e.t)}</small></div>`).join("")}</div>`;
}
function rowHtml(se, v, g) {
  if (se.lead) {
    const T = TEAMS[v >= 0 ? state.leftTeam : 1 - state.leftTeam];
    return `<div class="row"><span class="sw" style="background:${T.c}"></span><span class="n">${v === 0 ? "Even" : T.color + " ahead"}</span><span class="v">${fmtNum(Math.abs(v), g)}</span></div>`;
  }
  if (se.group) {
    const T = TEAMS[se.group.team];
    return `<div class="row"><span class="tdot" style="background:${T.c}"></span><svg viewBox="0 0 22 6" class="dsw"><line x1="0" x2="22" y1="3" y2="3" stroke="${se.color}" stroke-width="2.5" stroke-dasharray="${se.dash}"/></svg><span class="n">${esc(se.label)}${se.group.sub ? ` <small>${se.group.ps.map(p => esc(p.hero)).join(" + ")}</small>` : ""}</span><span class="v">${fmtNum(v, g)}</span></div>`;
  }
  const p = se.player, T = TEAMS[p.team];
  let name = esc(se.label) + (se.sub ? ` <small>${esc(se.sub)}</small>` : "");
  let val = fmtNum(v, g);
  if (se.diff) {
    const lead = v >= 0 ? p : se.other;
    name = `${esc(lead.hero)} ahead` + (se.sub ? ` <small>${esc(se.sub)}</small>` : "");
    val = fmtNum(Math.abs(v), g);
  }
  return `<div class="row"><img src="${(se.diff ? (v >= 0 ? p : se.other) : p).img}" style="--coin:${T.coin}"><span class="sw" style="background:${se.color}"></span><span class="n">${name}</span><span class="v">${val}</span></div>`;
}

// The game's own painted card, uncropped, for the places Valve shows it as a rectangle (Lane Stats, the hover box, the MVP tab).
// The round chips keep the masked art. Heroes without card art leave the gray gradient empty.
function cardImg(p) { return p.card ? `<img src="${p.card}" alt="" onerror="this.remove()">` : ""; }
function portraitImg(p) { return `<img src="${p.img}" alt="" style="--coin:${TEAMS[p.team].coin}">`; }
// ---------- hints under the chart ----------
function renderLines(series, g) {
  const row = $("lineRow"), box = $("lines");
  box.innerHTML = "";
  const d = series.find(se => se.diff);
  const hints = [];
  if (g.events && series.length && !exactKda(g)) {
    hints.push(haveDeathDetails() ? "Event counts differ from the scoreboard. The chart uses snapshots and final totals." :
      "Exact event times are incomplete. The chart uses snapshots and final totals.");
  }
  if (g.kind === "lead") hints.push(`Above the line: ${TEAMS[state.leftTeam].color} ahead. Below: ${TEAMS[1 - state.leftTeam].color} ahead. Hero picks don't change this graph.`);
  if (d) hints.push(`Above the line: ${d.player.hero} ahead. Below: ${d.other.hero} ahead.`);
  if (hints.length) {
    const text = hints.join(" ");
    const note = el("span", "lineHint", text);
    note.title = text;
    box.append(note);
  }
  row.hidden = !hints.length;
  document.body.classList.toggle("noLines", row.hidden);
}

// ---------- legend: the line picker ----------
// On the Player-Specific graphs (and in the Teams and Lanes views) the panel on the right is both the legend and the
// picker: every line type with each picked hero's total, grouped by where it came from and sorted by size.
// Click a row to show or hide it, Only (on the hovered row) to show just that one. Hidden rows keep their numbers,
// so you can see what is worth turning on.
const MAP_SOURCES = ["Fountain", "Healing Troopers", "Health Orbs", "Survival Powerup", "Bushes"];
const LEGEND_GROUPS = ["From the map", "From items", "Built in", "From abilities"];
let itemNames = null;
function legendGroup(g, label) {
  if (!g.dyn || g.id === "perm_buffs") return "";
  if (MAP_SOURCES.includes(label)) return "From the map";
  if (label === "Base Regen") return "Built in";
  if (!itemNames) itemNames = new Set(Object.values(window.ITEMS || {}).map(x => x[0]));
  return itemNames.has(label) ? "From items" : "From abilities";
}
const FOLD_AT = 6, FOLD_SHOW = 4;
// Short numbers for the legend columns: 4.7k, 12k, 830.
function fmtShort(v, g) {
  if (v == null || !Number.isFinite(v) || v === 0) return "–";
  if (g && g.ratio) return v.toFixed(1) + "%";
  const a = Math.abs(v);
  if (a >= 100000) return Math.round(v / 1000) + "k";
  if (a >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  if (g && g.whole) return String(Math.round(v));
  return a < 10 && v % 1 ? v.toFixed(1) : String(Math.round(v));
}
function renderLegend(g0, g) {
  const box = $("lineLegend");
  const view = brkView(g0), grp = grouped(g0);
  const show = state.tab === "graphs" && (!!view || grp);
  document.body.classList.toggle("hasLegend", show);
  document.body.classList.toggle("wideLegend", show && view === "panels");
  box.hidden = !show;
  if (!show) { box.innerHTML = ""; return; }
  const dur = state.match.duration_s || 0;
  let h = `<div class="lgHead"><span class="cap">Lines</span><span class="at">Totals at ${fmtTime(dur)}</span></div>`;
  let rows = [], cols = [], body = "";
  const toggle = [], only = [];
  if (grp) {
    const all = groupLines(g0, modeNow(g0)), hid = state.hiddenGroups;
    cols = [{ head: "" }];
    body = `<div class="lgBody"><div class="lgGroup">` + all.map((se, j) => {
      const on = !hid.has(se.label);
      toggle[j] = () => { if (hid.has(se.label)) hid.delete(se.label); else hid.add(se.label); };
      only[j] = () => { hid.clear(); all.forEach(x => { if (x.label !== se.label) hid.add(x.label); }); };
      const tip = se.group.sub ? se.group.ps.map(p => p.hero).join(" + ") : "";
      return lgRow(j, se.key, on, `<svg class="smp" viewBox="0 0 26 8"><line x1="0" x2="26" y1="4" y2="4" stroke="${se.color}" stroke-width="3" stroke-dasharray="${se.dash}"/></svg>`, se.label, [fmtShort(endOf(se.pts), g)], [], tip);
    }).join("") + `</div></div>`;
    h += body;
    const anyOff = all.some(se => hid.has(se.label)), anyOn = all.some(se => !hid.has(se.label));
    h += lgFoot(anyOff, anyOn);
    box.innerHTML = h;
    wireLegend(box, toggle, only, () => hid.clear(), () => all.forEach(x => hid.add(x.label)));
    return;
  }
  const picked = pickedList("breakdown");
  const lobby = view === "lobby";
  const heroes = picked.length ? picked : state.players;
  // Column heads: each picked hero (with their solid or dashed line when there are two), the lobby's best, or the lobby total.
  if (lobby) cols = [{ head: `<span class="ch">Best</span>`, w: 96 }];
  else if (!picked.length) cols = [{ head: `<span class="ch">Lobby</span>` }];
  else cols = picked.map((p, hi) => ({ head: portraitImg(p) + (picked.length <= 2 ? `<svg viewBox="0 0 26 6"><line x1="0" x2="26" y1="3" y2="3" stroke="#FFEFD7" stroke-width="2.5" stroke-dasharray="${HERO_DASH[hi]}"/></svg>` : ""), w: picked.length > 2 ? 48 : 58 }));
  rows = g0.series.map((ser, i) => {
    const vals = heroes.map(p => endOf(typeLine(g0, p, i)));
    const tot = vals.reduce((a, v) => a + (v || 0), 0);
    let best = null;
    if (lobby) heroes.forEach((p, k) => { if (!best || vals[k] > best.v) best = { p, v: vals[k] }; });
    return { i, label: ser.label, on: lineOn(g0, i), group: legendGroup(g0, ser.label), vals: lobby || !picked.length ? [tot] : vals, tot, best };
  }).filter(r => r.on || !g0.dyn || r.tot > 0);
  const groups = [];
  for (const r of rows) { let gr = groups.find(x => x.name === r.group); if (!gr) groups.push(gr = { name: r.group, rows: [] }); gr.rows.push(r); }
  groups.sort((a, b) => LEGEND_GROUPS.indexOf(a.name) - LEGEND_GROUPS.indexOf(b.name));
  if (picked.length) h += `<div class="lgCols">` + cols.map(c => `<span class="lc" style="width:${c.w || 58}px">${c.head}</span>`).join("") + `</div>`;
  h += `<div class="lgBody">`;
  for (const gr of groups) {
    gr.rows.sort((a, b) => b.tot - a.tot);
    const fk = g0.id + "|" + gr.name, open = !!state.folds[fk];
    const fold = gr.rows.length > FOLD_AT && !open;
    const shown = fold ? gr.rows.filter((r, k) => k < FOLD_SHOW || r.on) : gr.rows;
    h += `<div class="lgGroup">` + (gr.name ? `<div class="lgName">${esc(gr.name)}</div>` : "");
    for (const r of shown) {
      toggle[r.i] = () => setLine(g0, r.i, !lineOn(g0, r.i));
      only[r.i] = () => g0.series.forEach((_, j) => setLine(g0, j, j === r.i));
      const c = typeColor(g0, r.i);
      const sw = `<i class="sw" style="--c:${c}"></i>`;
      const max = Math.max(...r.vals);
      const cells = lobby && r.best ? [`${portraitImg(r.best.p)}<b>${fmtShort(r.best.v, g)}</b>`] : r.vals.map(v => fmtShort(v, g));
      const lo = !lobby && r.vals.length > 1 ? r.vals.map(v => v < max) : [];
      h += lgRow(r.i, "t" + r.i, r.on, sw, r.label, cells, lo, "", cols.map(c => c.w || 58));
    }
    if (gr.rows.length > FOLD_AT) h += `<button class="lgMore" data-fold="${esc(fk)}">${open ? "Show fewer" : `+ ${gr.rows.length - shown.length} more${gr.name === "From items" ? " items" : ""}`}</button>`;
    h += `</div>`;
  }
  h += `</div>`;
  const anyOff = rows.some(r => !r.on), anyOn = rows.some(r => r.on);
  h += lgFoot(anyOff, anyOn);
  box.innerHTML = h;
  wireLegend(box, toggle, only, () => rows.forEach(r => setLine(g0, r.i, true)), () => g0.series.forEach((_, j) => setLine(g0, j, false)));
}
function lgRow(i, key, on, sw, label, cells, lo, tip, widths) {
  return `<div class="lgRow${on ? " on" : ""}" tabindex="0" role="button" aria-pressed="${on}" data-i="${i}" data-k="${esc(key)}"${tip ? ` title="${esc(tip)}"` : ""}>${sw}<span class="nm">${esc(label)}</span>` +
    `<button class="only" title="Show only this line">Only</button>` +
    cells.map((c, k) => `<span class="v${lo[k] ? " lo" : ""}"${widths ? ` style="width:${widths[k]}px"` : ""}>${c}</span>`).join("") + `</div>`;
}
function lgFoot(anyOff, anyOn) {
  return `<div class="lgFoot"><button class="graphOptionButton" data-act="all"${anyOff ? "" : " disabled"}>All</button><button class="graphOptionButton" data-act="clear"${anyOn ? "" : " disabled"}>Clear</button></div>`;
}
function wireLegend(box, toggle, only, all, clear) {
  box.onclick = ev => {
    const t = ev.target.closest("button, .lgRow");
    if (!t) return;
    if (t.dataset.fold) { state.folds[t.dataset.fold] = !state.folds[t.dataset.fold]; renderAll(); return; }
    if (t.dataset.act === "all") { all(); renderAll(); return; }
    if (t.dataset.act === "clear") { clear(); renderAll(); return; }
    const r = t.closest(".lgRow");
    if (!r) return;
    const i = Number(r.dataset.i);
    if (t.classList.contains("only")) only[i](); else toggle[i]();
    renderAll();
  };
  box.onkeydown = ev => {
    const r = ev.target.closest && ev.target.closest(".lgRow");
    if (!r || ev.target !== r || (ev.key !== "Enter" && ev.key !== " ")) return;
    ev.preventDefault();
    toggle[Number(r.dataset.i)]();
    renderAll();
    const again = box.querySelector(`.lgRow[data-i="${r.dataset.i}"]`); if (again) again.focus();
  };
  box.onmouseover = ev => { const r = ev.target.closest(".lgRow"); setFocus(r ? r.dataset.k : null); };
  box.onmouseleave = () => setFocus(null);
}

// ---------- overview: a whole team or the lobby on a Player-Specific graph ----------
// Five or more heroes with several line types each would be dozens of lines, so instead: team totals over time,
// then a ranked table (one row per hero, one column per line type you turned on, the lobby best in gold).
// Pick heroes from the table into the compare tray to see them side by side.
const OV_COLS = 6;
function heroTotalPts(g, p, times) {
  const lines = g.series.map((_, i) => typeLine(g, p, i));
  return times.map(t => [t, lines.reduce((a, pts) => a + (lerpAt(pts, t) || 0), 0)]);
}
function renderOverview(g0, g) {
  const box = $("overview");
  const heroes = pickedList("breakdown"), dur = state.match.duration_s || 1;
  const on = visibleCats(g0).filter(i => heroes.some(p => endOf(typeLine(g0, p, i)) > 0) || !g0.dyn);
  const cols = on.slice(0, OV_COLS);
  const total = p => g0.series.reduce((a, _, i) => a + endOf(typeLine(g0, p, i)), 0);
  const rowsOf = p => ({ p, tot: total(p), vals: cols.map(i => endOf(typeLine(g0, p, i))) });
  const all = heroes.map(rowsOf).sort((a, b) => b.tot - a.tot);
  all.forEach((r, k) => { r.rank = k + 1; });
  const colMax = cols.map((_, c) => Math.max(...all.map(r => r.vals[c]), 0));
  const totMax = Math.max(...all.map(r => r.tot), 0);
  const everyone = heroes.length === state.players.length;

  // Team totals over time, sampled every 30 seconds.
  const times = []; for (let t = 0; t < dur; t += 30) times.push(t); times.push(dur);
  const teams = (on.length ? [state.leftTeam, 1 - state.leftTeam] : []).map(tm => {
    const ps = heroes.filter(p => p.team === tm);
    const per = ps.map(p => heroTotalPts(g0, p, times));
    return { tm, n: ps.length, pts: times.map((t, k) => [t, per.reduce((a, pts) => a + pts[k][1], 0)]) };
  }).filter(x => x.n);
  const W = box.offsetWidth || 1480, CW = W - 28, CH = 176, l = 4, r = CW - 138, top = 40, bot = CH - 30;
  const ymax = Math.max(1, ...teams.flatMap(x => x.pts.map(q => q[1])));
  const X = t => l + (t / dur) * (r - l), Y = v => bot - (v / ymax) * (bot - top);
  let svg = `<svg class="ovChart" viewBox="0 0 ${CW} ${CH}" width="${CW}" height="${CH}">`;
  svg += `<line x1="${l}" x2="${r}" y1="${bot}" y2="${bot}" stroke="#fff" stroke-opacity=".12"/>`;
  for (let t = 0; t <= dur; t += dur > 1500 ? 600 : 300) svg += `<text x="${X(t)}" y="${CH - 8}" text-anchor="${t ? "middle" : "start"}">${fmtTime(t)}</text>`;
  const ends = teams.map(x => ({ x, y: Y(x.pts[x.pts.length - 1][1]) })).sort((a, b) => a.y - b.y);
  if (ends.length === 2 && ends[1].y - ends[0].y < 20) { const mid = (ends[0].y + ends[1].y) / 2; ends[0].y = mid - 10; ends[1].y = mid + 10; }
  for (const { x, y } of ends) {
    const c = TEAMS[x.tm].c, d = x.pts.map(([t, v], k) => `${k ? "L" : "M"}${X(t).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
    svg += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.6" stroke-linejoin="round"/>`;
    svg += `<text class="ovEnd" x="${r + 10}" y="${y + 6}" style="fill:${c}">${fmtShort(x.pts[x.pts.length - 1][1], g)}</text>`;
  }
  svg += `</svg>`;
  let h = on.length ? `<div class="ovTop"><div class="cap">${everyone ? "Team totals" : "Team totals, picked heroes"}<span class="sub">All line types added up</span></div>${svg}</div>` : "";

  // The ranked table, grouped by team.
  const colW = cols.length ? Math.min(150, Math.floor((W - 420) / cols.length)) : 0;
  h += `<div class="ovTable"><div class="ovHead"><span class="rk">Rank</span><span class="hero">Hero</span><span class="tot">Total</span>` +
    cols.map(i => `<span class="col" style="width:${colW}px"><i class="sw" style="--c:${typeColor(g0, i)}"></i>${esc(g0.series[i].label)}</span>`).join("") +
    (cols.length ? "" : `<span class="none">Pick lines on the right to add a column for each.</span>`) + `</div>`;
  for (const tm of [state.leftTeam, 1 - state.leftTeam]) {
    const rs = all.filter(x => x.p.team === tm);
    if (!rs.length) continue;
    const T = TEAMS[tm];
    h += `<div class="ovTeam" style="--tc:${T.c}"><span class="rk"></span><span class="hero">${esc(T.name)}</span><span class="tot">${fmtShort(rs.reduce((a, x) => a + x.tot, 0), g)}</span>` +
      cols.map((_, c) => `<span class="col" style="width:${colW}px">${fmtShort(rs.reduce((a, x) => a + x.vals[c], 0), g)}</span>`).join("") + `</div>`;
    for (const x of rs) {
      const inTray = state.tray.includes(x.p.slot);
      h += `<div class="ovRow${inTray ? " inTray" : ""}" tabindex="0" role="button" data-slot="${x.p.slot}"><span class="rk">${x.rank}</span><span class="hero">${portraitImg(x.p)}<span class="hn">${esc(heroName(x.p))}</span>` +
        `<button class="cmp">${inTray ? "In compare" : "+ Compare"}</button></span>` +
        `<span class="tot${x.tot === totMax ? " best" : ""}">${fmtShort(x.tot, g)}</span>` +
        x.vals.map((v, c) => `<span class="col${v && v === colMax[c] ? " best" : ""}" style="width:${colW}px"><b>${v ? fmtShort(v, g) : "–"}</b><i class="bar" style="width:${colMax[c] ? Math.round((v / colMax[c]) * 100) : 0}%;--c:${typeColor(g0, cols[c])}"></i></span>`).join("") + `</div>`;
    }
  }
  if (on.length > cols.length) h += `<div class="ovMore">${on.length - cols.length} more line ${on.length - cols.length === 1 ? "type is" : "types are"} on. The table shows the first ${OV_COLS}.</div>`;
  h += `</div>`;

  // The compare tray: up to four heroes, then Compare opens them side by side.
  const tray = state.tray.map(s => state.players.find(p => p.slot === s)).filter(Boolean);
  h += `<div class="ovTray"><span class="cap">Compare</span>` + (tray.length ? tray.map(p => `<span class="chip" data-slot="${p.slot}" style="--tc:${TEAMS[p.team].c}">${portraitImg(p)}<span>${esc(heroName(p))}</span><button class="x" title="Remove">×</button></span>`).join("") +
    `<button class="graphOptionButton go"${tray.length ? "" : " disabled"}>${tray.length === 1 ? "Show this hero" : `Compare these ${tray.length}`}</button>`
    : `<span class="hint">Click heroes in the table to compare up to 4 side by side.</span>`) + `</div>`;
  box.innerHTML = h;
  box.onkeydown = ev => { if ((ev.key === "Enter" || ev.key === " ") && ev.target.classList.contains("ovRow")) { ev.preventDefault(); ev.target.click(); } };
  box.onclick = ev => {
    const chipX = ev.target.closest(".chip .x");
    if (chipX) { const s = Number(chipX.closest(".chip").dataset.slot); state.tray = state.tray.filter(x => x !== s); renderAll(); return; }
    if (ev.target.closest(".go")) { setSel(new Set(state.tray)); state.tray = []; renderAll(); return; }
    const row = ev.target.closest(".ovRow");
    if (!row) return;
    const s = Number(row.dataset.slot);
    if (state.tray.includes(s)) state.tray = state.tray.filter(x => x !== s);
    else if (state.tray.length < 4) state.tray.push(s);
    renderAll();
  };
}

// ---------- speed check ----------
// Shift+P shows how long drawing and hover take, to check the in-game browser keeps up. It stays on until pressed again.
const perf = { on: false, render: [], hover: [], frames: [], last: 0 };
function perfNote(kind, ms) {
  if (!perf.on) return;
  const a = perf[kind]; a.push(ms); if (a.length > 240) a.shift();
}
function perfLoop(now) {
  if (!perf.on) return;
  if (perf.last) { perf.frames.push(now - perf.last); if (perf.frames.length > 240) perf.frames.shift(); }
  perf.last = now;
  requestAnimationFrame(perfLoop);
}
function perfShow() {
  if (!perf.on) return;
  const st = a => a.length ? { avg: a.reduce((x, y) => x + y, 0) / a.length, max: Math.max(...a) } : null;
  const f = st(perf.frames), hv = st(perf.hover), rd = st(perf.render);
  const slow = perf.frames.filter(x => x > 20).length;
  $("perf").innerHTML = `<b>Speed check</b> (Shift+P to hide)<br>` +
    (f ? `Screen: ${Math.round(1000 / f.avg)} fps, ${slow} of the last ${perf.frames.length} frames slow (over 20 ms)<br>` : "") +
    (hv ? `Hover update: ${hv.avg.toFixed(1)} ms average, ${hv.max.toFixed(1)} ms worst<br>` : "Move the mouse over the graph.<br>") +
    (rd ? `Graph draw: ${rd.avg.toFixed(0)} ms average, ${rd.max.toFixed(0)} ms worst` : "");
}
function perfToggle() {
  perf.on = !perf.on;
  try { localStorage.setItem("postmortem.perf", perf.on ? "1" : ""); } catch (e) { /* storage blocked */ }
  $("perf").hidden = !perf.on;
  perf.render = []; perf.hover = []; perf.frames = []; perf.last = 0;
  if (perf.on) { requestAnimationFrame(perfLoop); renderAll(); }
}
setInterval(perfShow, 500);
document.addEventListener("keydown", ev => { if (ev.shiftKey && (ev.key === "P" || ev.key === "p")) perfToggle(); });
try { if (localStorage.getItem("postmortem.perf") === "1") setTimeout(perfToggle, 0); } catch (e) { /* storage blocked */ }

// ---------- helpers ----------
function niceTicks(lo, hi, n, whole) {
  const span = hi - lo, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  let step = [1, 2, ...(whole ? [] : [2.5]), 5, 10].map(k => k * mag).find(s => span / s <= n) || 10 * mag;
  if (whole) step = Math.max(1, step); // counts (kills, deaths, buffs) never get a half tick
  const out = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.5; v += step) out.push(+v.toFixed(6));
  return out;
}
function fmtTime(s) { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function fmtSouls(v) { return v >= 1000 ? `${Math.round(v / 1000)}<span class="k">k</span>` : String(Math.round(v)); }
function fmtNum(v, g) {
  if (g && g.ratio) return v.toFixed(1) + "%";
  // Counts (kills, denies, level...) are whole numbers. Between Valve's 3-minute snapshots the line is a straight slope, so
  // the value read off it there (like 6.7 denies) is rounded to the nearest whole count.
  if (g && g.whole) return Math.round(v).toLocaleString("en-US");
  if (Math.abs(v) < 10 && v % 1) return v.toFixed(1);
  return Math.round(v).toLocaleString("en-US");
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function setStatus(msg, err, retry) {
  const s = $("status");
  s.textContent = msg;
  s.classList.toggle("err", !!err);
  if (retry) {
    const b = el("button", "graphOptionButton retry", "Retry");
    b.onclick = retry;
    s.append(document.createElement("br"), b);
  }
}

// ---------- boot ----------
if (!EMBED) document.body.classList.add("standalone");
GraphMarkers.load();
fit();
window.addEventListener("resize", () => { fit(); renderAll(); });
wireDropDown();
GraphMarkers.wireMenus();
tabs.forEach(b => b.onclick = () => {
  if (b.disabled || state.awaitingValve) return;
  state.requestedTab = state.tab = b.dataset.tab;
  closeMenu();
  renderAll();
});
buildDropDown();
if (params.get("graph") && GRAPHS.some(g => g.id === params.get("graph"))) state.graph = params.get("graph");
// Opened from a Profile page: a Back control returns to that profile. When the profile is the page just before this one,
// it uses the browser's own back, so the profile comes back exactly as it was (scroll, filters).
if (!EMBED && params.get("from") === "profile") {
  const back = $("backLink"), pid = (params.get("pid") || "").replace(/\D/g, "");
  back.href = pid ? "profile.html?id=" + pid : "profile.html";
  back.hidden = false;
  document.body.classList.add("hasBack");
  back.addEventListener("click", ev => {
    let prev = null;
    try { prev = document.referrer ? new URL(document.referrer) : null; } catch (e) { /* no referrer */ }
    if (prev && prev.origin === location.origin && /profile\.html$|\/$/.test(prev.pathname) && history.length > 1) { ev.preventDefault(); history.back(); }
  });
}
$("matchForm").onsubmit = ev => {
  ev.preventDefault();
  const id = $("matchInput").value.trim();
  if (!/^\d+$/.test(id)) return setStatus("Enter a numeric match ID.", true);
  if (viewerAccount?.matchId !== id) viewerAccount = null;
  const u = new URL(location.href);
  if (id !== params.get("match")) {
    params.delete("pick");
    u.searchParams.delete("pick");
  }
  params.set("match", id);
  params.delete("players");
  state.requestedTab = entryTab();
  u.searchParams.set("match", id);
  u.searchParams.delete("players");
  history.replaceState(history.state, "", u);
  loadMatch(id);
};
// In game, ESC or the overlay's own Close closes it. The page can also ask Panorama to close via the title.
document.addEventListener("keydown", ev => {
  if (ev.key !== "Escape") return;
  if (window.Summary?.dismissTip()) { ev.preventDefault(); return; }
  if (GraphMarkers.close(true)) { ev.preventDefault(); return; }
  if (EMBED && $("ddMenu").hidden) document.title = "DLC_CLOSE:" + Date.now();
});
window.addEventListener("hashchange", () => {
  consumeViewerAccount(activeMatchId);
  if (state.match) { applyViewer(); renderAll(); }
});
// Tell the mod the page has drawn, so it can show the panel without the browser's gray flash.
// A hidden browser may not run animation frames, so a timer backs it up.
// The match ID rides along so the mod can tell this page from an older one still on screen while a new match loads.
// After that, a heartbeat every 2 seconds: if the browser ever swaps the page for its error screen (the blue "-105" one),
// the heartbeat stops and the mod hides the browser, shows its own "Loading" text and loads the page again.
if (EMBED) {
  let told = false;
  const mid = /^\d+$/.test(params.get("match") || "") ? params.get("match") : "0";
  const ready = () => { if (!told) { told = true; document.title = "DLC_READY:" + mid + ":" + Date.now(); } };
  requestAnimationFrame(() => requestAnimationFrame(ready));
  setTimeout(ready, 400);
  setInterval(() => { if (told) document.title = "DLC_ALIVE:" + mid + ":" + Date.now(); }, 2000);
}
// The match can arrive from disk before the tab scripts below app.js have run.
document.addEventListener("DOMContentLoaded", () => {
  const startId = params.get("match");
  if (startId && /^\d+$/.test(startId)) loadMatch(startId);
  else {
    clearMatch();
    $("profileLookup").hidden = EMBED;
    setStatus(EMBED ? "No match ID was passed in." : "Enter a match ID to load it.");
  }
}, { once: true });
