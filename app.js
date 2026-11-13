"use strict";
// Deadlock Compare: overlay and isolate post-match graphs, styled like Deadlock's own graph screen.
// Data: https://api.deadlock-api.com/v1/matches/{id}/metadata (Valve match metadata).

const API = "https://api.deadlock-api.com/v1/matches/";
const PLAYER_COLORS = [
  "#58D86A", "#8C83FF", "#F25CE0", "#FF5A5F", "#FFD23F", "#3FCBFF",
  "#FF9A3C", "#C3A6FF", "#38E8B0", "#FF8FB1", "#C6EE4A", "#5C9DFF",
];
// Player comparison graphs show few heroes, so they get the most distinct colors in pick order.
const PAIR_COLORS = ["#58D86A", "#8C83FF", "#FFD23F", "#F25CE0", "#3FCBFF", "#FF9A3C"];
const DASHES = ["", "10 6", "2 5", "14 5 3 5", "1 8", "22 6", "6 3 1 3 1 3"];
const TEAMS = {
  0: { name: "Hidden King", color: "Amber", c: "#D4860B", coin: "#6F3806", icon: "assets/ui/icon_team1.png" },
  1: { name: "Archmother", color: "Sapphire", c: "#4D75C3", coin: "#243265", icon: "assets/ui/icon_team2.png" },
};
// Objective lane index (ECitadelTeamObjective _LaneN) -> lane color. The current map uses lanes 1, 3 and 4.
const LANES = { 1: "Yellow", 2: "Green", 3: "Blue", 4: "Green" };

// Souls per source. Trooper and Haunt souls come in two parts: the kill itself and the orb you shoot, so add both.
const GS = (s, ids) => (s.gold_sources || []).reduce((a, g) => a + (ids.includes(g.source) ? (g.gold || 0) + (g.gold_orbs || 0) : 0), 0);
const GRAPHS = [
  { group: "General", id: "souls", label: "Souls Collected", kind: "general", get: s => s.net_worth },
  { group: "General", id: "souls_lead", label: "Team Souls Lead", kind: "lead", sub: "Which team was ahead on souls, and by how much" },
  { group: "General", id: "player_damage", label: "Damage to Players", kind: "general", get: s => s.player_damage },
  { group: "General", id: "damage_taken", label: "Damage from Players", kind: "general", get: s => s.player_damage_taken },
  { group: "General", id: "boss_damage", label: "Objective Damage", kind: "general", obj: true, get: s => s.boss_damage,
    sub: "Guardians, Walkers, Shrines, Patron and Mid Boss" },
  { group: "General", id: "healing", label: "Healing", kind: "general", get: s => s.player_healing, sub: "Yourself and allies" },
  { group: "General", id: "kills", label: "Kills", kind: "general", get: s => s.kills },
  { group: "General", id: "deaths", label: "Deaths", kind: "general", get: s => s.deaths },
  { group: "General", id: "assists", label: "Assists", kind: "general", get: s => s.assists },
  { group: "General", id: "last_hits", label: "Trooper and Haunt Kills", kind: "general", get: s => (s.creep_kills || 0) + (s.neutral_kills || 0), sub: "Not the scoreboard's Last Hits, which counts more" },
  { group: "General", id: "denies", label: "Denies", kind: "general", get: s => s.denies },
  { group: "General", id: "accuracy", label: "Accuracy", sub: "All targets, troopers included", kind: "general", ratio: true, get: s => pct(s.shots_hit, (s.shots_hit || 0) + (s.shots_missed || 0)) },
  { group: "General", id: "crit", label: "Headshot Rate", kind: "general", ratio: true, get: s => pct(s.hero_bullets_hit_crit, s.hero_bullets_hit), sub: "Crit bullets that hit heroes" },
  // Valve's first snapshot is at 3:00. The Power graphs start at 0:00 from what every hero spawns with:
  // level 1, the hero's base health (heroes.vdata, gamedata.js HERO_HP) and no bonus power.
  { group: "Power", id: "level", label: "Level", kind: "general", level: true, get: s => s.level, start: () => 1 },
  { group: "Power", id: "max_health", label: "Max Health", kind: "general", level: true, get: s => s.max_health, start: p => (window.HERO_HP || {})[p.heroId] },
  { group: "Power", id: "weapon_power", label: "Weapon Power", kind: "general", level: true, get: s => s.weapon_power, start: () => 0 },
  { group: "Power", id: "spirit_power", label: "Spirit Power", kind: "general", level: true, get: s => s.tech_power, start: () => 0 },
  { group: "Player Comparison", id: "dmg_breakdown", label: "Damage Breakdown", kind: "breakdown", obj: true, defaultOn: [0, 1, 3], series: [
      { label: "Enemy Players", get: s => s.player_damage },
      { label: "Troopers", get: s => s.creep_damage },
      { label: "Haunts", get: s => s.neutral_damage },
      { label: "Objectives", get: s => s.boss_damage },
  ] },
  { group: "Player Comparison", id: "souls_source", label: "Souls by Source", kind: "breakdown", defaultOn: [0, 2, 3], series: [
      { label: "Enemy Kills", get: s => GS(s, [1]) },
      { label: "Kill Assists", get: s => GS(s, [6]) },
      { label: "Troopers", get: s => GS(s, [2]) },
      { label: "Haunts", get: s => GS(s, [3]) },
      { label: "Objectives", get: s => GS(s, [4]) },
      { label: "Breakables", get: s => GS(s, [12]) },
      { label: "Other", get: s => GS(s, [5, 7, 8, 9, 10, 11, 13]) },
  ], sub: "These won't add up exactly to total souls" },
  { group: "Player Comparison", id: "support", label: "Support", kind: "breakdown", series: [
      { label: "Healing Allies", get: s => s.teammate_healing },
      { label: "Barriers Given", get: s => s.player_barriering },
      { label: "Healing Prevented", get: s => s.heal_prevented },
  ] },
  { group: "Player Comparison", id: "tanking", label: "Tanking", kind: "breakdown", series: [
      { label: "Damage Taken", get: s => s.player_damage_taken },
      { label: "Damage Mitigated", get: s => s.damage_mitigated },
  ] },
  { group: "Player Comparison", id: "kill_types", label: "Kills by Type", kind: "breakdown", series: [
      { label: "Gun", get: s => s.bullet_kills },
      { label: "Ability", get: s => s.ability_kills },
      { label: "Melee", get: s => s.melee_kills },
      { label: "Headshot (of Gun)", get: s => s.headshot_kills },
  ] },
];
const GROUP_SUB = { "Player Comparison": "Every line type for the heroes you pick" };

function pct(a, b) { return b ? (100 * (a || 0)) / b : null; }

const params = new URLSearchParams(location.search);
const EMBED = params.get("embed") === "1";
const state = {
  match: null, players: [], events: [],
  selGen: new Set(), selBrk: new Set(),
  graph: "souls", mode: "value", diff: false,
  objPref: {}, itemPref: {}, hiddenCats: {}, hiddenGroups: new Set(),
  leftTeam: 0, me: null,
  tab: "graphs", mvpPick: null, mvpMode: "impact",
  muStat: "dmg", muWin: "all", muPair: null,
};
const $ = id => document.getElementById(id);
const graphNow = () => GRAPHS.find(g => g.id === state.graph);
const selNow = () => (graphNow().kind === "breakdown" ? state.selBrk : state.selGen);
const setSel = s => { if (graphNow().kind === "breakdown") state.selBrk = s; else state.selGen = s; };
function colorOf(p) {
  if (graphNow().kind !== "breakdown") return p.color;
  if (state.selBrk.size > PAIR_COLORS.length) return p.color; // more heroes than pair colors: everyone keeps their own
  const i = [...state.selBrk].indexOf(p.slot);
  return i >= 0 ? PAIR_COLORS[i] : p.color;
}
// Player comparison graphs open with at most 3 line types (g.defaultOn); the rest are one click away.
function hiddenFor(g) {
  if (!state.hiddenCats[g.id]) {
    const on = g.defaultOn || g.series.map((_, i) => i).slice(0, 3);
    state.hiddenCats[g.id] = new Set(g.series.map((_, i) => i).filter(i => !on.includes(i)));
  }
  return state.hiddenCats[g.id];
}
function visibleCats(g) { const h = hiddenFor(g); return g.series.map((s, i) => i).filter(i => !h.has(i)); }
function objOn(g) { return state.objPref[g.id] ?? !!g.obj; }
// View As: Value and Per Minute work on most graphs; % of Team, Teams and Lanes only on the General graphs that add up.
function modeNow(g) {
  const m = state.mode;
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
let loadSeq = 0;
async function loadMatch(id) {
  const my = ++loadSeq; // only the newest request may draw
  clearMatch();
  setStatus("Loading match " + id + "...");
  const src = params.get("src"); // local test file: only files in this repo's test/ folder
  const url = src && /^test\/[\w-]+\.json$/.test(src) ? src : API + encodeURIComponent(id) + "/metadata";
  let data;
  try {
    const r = await fetch(url);
    if (r.status === 404) throw new Error("This match isn't available yet. Try again in a few minutes.");
    if (!r.ok) throw new Error("Couldn't load the match (error " + r.status + ").");
    data = await r.json();
    if (my !== loadSeq) return;
    const mi = data.match_info || data;
    if (!mi || !Array.isArray(mi.players) || !mi.players.length) throw new Error("This match has no player data.");
    setup(mi);
  } catch (e) {
    if (my !== loadSeq) return;
    clearMatch();
    const msg = e instanceof TypeError ? "Couldn't reach the match server. Check your connection and try again." : e.message || String(e);
    setStatus(msg, true, () => loadMatch(id));
  }
}
function clearMatch() {
  state.match = null;
  document.body.classList.add("noMatch");
  $("tooltip").hidden = true;
}

// Viewer hints from the game (friendly team, local hero). They come in the query, or in the #hash: the mod preloads the
// page before the post-game screen knows them, then passes them by changing only the hash, which doesn't reload.
function hint(k) {
  const h = new URLSearchParams(location.hash.slice(1));
  return h.has(k) ? h.get(k) : params.get(k);
}
// Which team sits on the left: the viewer's team when the game tells us, else Amber.
function applyViewer() {
  const fr = Number(hint("friendly"));
  state.leftTeam = hint("friendly") != null && (fr === 0 || fr === 1) ? fr : 0;
  const meHero = Number(hint("me_hero")) || (window.HERO_CODES || {})[hint("me_name")] || 0;
  state.me = state.players.find(p => p.heroId === meHero && (hint("friendly") == null || p.team === state.leftTeam)) || null;
  if (state.me) state.leftTeam = state.me.team;
}

function setup(mi) {
  state.match = mi;
  document.body.classList.remove("noMatch");
  const ordered = [...mi.players].sort((a, b) => a.team - b.team || (a.assigned_lane || 0) - (b.assigned_lane || 0) || a.player_slot - b.player_slot);
  state.players = ordered.map((p, i) => ({
    slot: Number(p.player_slot) || 0, team: Number(p.team) === 1 ? 1 : 0, lane: p.assigned_lane || 0, heroId: Number(p.hero_id) || 0,
    hero: (window.HERO_NAMES || {})[p.hero_id] || "Hero " + (Number(p.hero_id) || 0),
    img: `assets/heroes/${Number(p.hero_id) || 0}.png`,
    left: Number(p.abandon_match_time_s) || 0,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    stats: scoreboardKda(p),
    souls: p.net_worth || 0, mvp: p.mvp_rank || 0,
    badge: Number(p.player_rank_data && p.player_rank_data.initial_display_rank) || 0,
    raw: p,
  }));
  applyViewer();

  const sel = (params.get("players") || "").split(",").filter(x => /^\d+$/.test(x.trim())).map(Number).filter(n => state.players.some(p => p.slot === n));
  state.selGen = new Set(sel.length ? sel : state.players.map(p => p.slot));
  state.selBrk = new Set(sel.length && sel.length <= 2 ? sel : defaultPair());
  state.events = buildEvents(mi);
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

// Two players for the player comparison graphs: you and your lane opponent, else each team's top earner.
function defaultPair() {
  const ps = state.players;
  const top = arr => arr.slice().sort((a, b) => b.souls - a.souls)[0];
  if (state.me) {
    const foes = ps.filter(p => p.team !== state.me.team);
    const opp = top(foes.filter(p => p.lane && p.lane === state.me.lane)) || top(foes);
    return [state.me.slot, opp.slot];
  }
  return [top(ps.filter(p => p.team === state.leftTeam)), top(ps.filter(p => p.team !== state.leftTeam))].filter(Boolean).map(p => p.slot);
}

function buildEvents(mi) {
  const ev = [];
  for (const o of mi.objectives || []) {
    const t = o.destroyed_time_s;
    if (!t) continue;
    const id = o.team_objective_id, team = TEAMS[o.team] || TEAMS[0];
    let what, icon, lane = null;
    if (id >= 1 && id <= 4) { what = "Guardian"; icon = "objective_t1"; lane = LANES[id]; }
    else if (id >= 5 && id <= 8) { what = "Walker"; icon = "objective_t2"; lane = LANES[id - 4]; }
    else if (id >= 12 && id <= 15) { what = "Base Guardians"; icon = "objective_t2"; lane = LANES[id - 11]; }
    else if (id === 10 || id === 11) { what = "Shrine"; icon = "team"; }
    else if (id === 9) { what = "Patron (first phase)"; icon = "team"; }
    else if (id === 0) { what = "Patron"; icon = "team"; }
    else continue;
    const name = lane ? `${team.color}'s ${lane} ${what}` : `${team.color}'s ${what}`;
    ev.push({ t, kind: what, text: `${name} destroyed`, color: team.c, icon: icon === "team" ? team.icon : `assets/ui/${icon}.svg`, team: o.team });
  }
  for (const mb of mi.mid_boss || []) {
    if (!mb.destroyed_time_s) continue;
    const tm = mb.team_claimed ?? mb.team_killed;
    const by = TEAMS[tm] ? TEAMS[tm].color : "";
    ev.push({ t: mb.destroyed_time_s, kind: "Mid Boss", text: `Mid Boss taken${by ? " by " + by : ""}`, color: "#70F8C1", icon: "assets/ui/icon_soul.svg", mid: true });
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
function renderTop() {
  const mvp = state.tab === "mvp" || state.tab === "matchups"; // tabs that focus one hero
  const leadG = !mvp && (graphNow().kind === "lead" || grouped(graphNow())); // views where hero picks don't apply
  const sel = mvp || leadG ? new Set(state.players.map(p => p.slot)) : selNow();
  for (const side of ["Left", "Right"]) {
    const team = side === "Left" ? state.leftTeam : 1 - state.leftTeam;
    const T = TEAMS[team];
    const ctn = $("team" + side);
    ctn.innerHTML = "";
    const ps = state.players.filter(p => p.team === team);
    for (const p of ps) {
      const d = el("button", "player" + (sel.has(p.slot) ? " sel" : "") + (mvp && state.mvpPick === p.slot ? " pick" : ""));
      d.setAttribute("aria-pressed", mvp ? String(state.mvpPick === p.slot) : String(sel.has(p.slot)));
      d.style.setProperty("--tc", T.c); d.style.setProperty("--coin", T.coin); d.style.setProperty("--pc", colorOf(p));
      const rk = rankOf(p.badge);
      d.title = `${p.hero}${rk ? " (" + rk.name + " going into the match)" : ""}${p.left ? "\nLeft the match at " + fmtTime(p.left) : ""}\n` + (mvp ? "Click to see why they placed where they did." : "Click to add or remove. Ctrl+Click to show only this hero.");
      const hi = el("div", "heroImg");
      const img = document.createElement("img"); img.src = p.img; img.alt = p.hero; img.onerror = () => { img.remove(); };
      hi.append(img);
      const souls = el("div", "souls"); souls.innerHTML = fmtSouls(p.souls);
      d.append(hi, souls, el("div", "pcolor"));
      if (p.mvp === 1) d.append(el("div", "badge", "MVP"));
      else if (p.mvp > 1) d.append(el("div", "badge key", "KEY"));
      d.onclick = ev => {
        if (mvp) { state.mvpPick = p.slot; state.muPair = null; renderAll(); return; }
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
    sc.innerHTML = `<span>${fmtSouls(total)}</span><span class="icon" style="background-image:url(${T.icon})"></span>`;
    const tb = (team === 0 ? state.match.average_badge_team0 : state.match.average_badge_team1) || avgBadge(ps.map(p => p.badge));
    const ta = $("avg" + side);
    ta.innerHTML = tb ? `<span class="lbl">Avg</span>${rankHtml(tb, "", true)}` : "";
    sc.title = `${T.name} (${T.color})\nClick to show only this team. Click again to show everyone.`;
    const onlyThis = ps.length && ps.every(p => sel.has(p.slot)) && [...sel].every(s => ps.some(p => p.slot === s));
    sc.classList.toggle("dim", sel.size > 0 && !ps.some(p => sel.has(p.slot)));
    sc.onclick = () => { if (mvp || leadG) return; setSel(onlyThis ? new Set(state.players.map(p => p.slot)) : new Set(ps.map(p => p.slot))); renderAll(); };
  }
}

// ---------- dropdown and options ----------
// Like the game's own menu: flat rows, one line each, section names on a darker band. A graph's note shows on hover.
function buildDropDown() {
  const menu = $("ddMenu");
  menu.innerHTML = "";
  let group = null;
  for (const g of GRAPHS) {
    if (g.group !== group) { group = g.group; menu.append(el("div", "cat", group)); }
    const b = el("button", "item" + (g.id === state.graph ? " on" : ""), g.label);
    const note = g.sub || (g.kind === "breakdown" && GROUP_SUB[g.group]);
    if (note) b.title = note;
    b.onclick = ev => { ev.stopPropagation(); state.graph = g.id; closeMenu(); renderAll(); };
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
      const i = GRAPHS.findIndex(g => g.id === state.graph) + (ev.key === "ArrowDown" ? 1 : -1);
      state.graph = GRAPHS[(i + GRAPHS.length) % GRAPHS.length].id; renderAll();
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
  if (!me) return null;
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
    b.classList.toggle("on", !!arr && arr.length > 0 && same(arr));
    b.onclick = () => { setSel(new Set(arr)); renderAll(); };
  };
  btn("pickLane", "Me + Lane", lane, "You and the enemies in your lane");
  btn("pickAll", "All", all, g.kind === "breakdown" ? "All twelve heroes. That's a lot of lines: hide line types below to thin it out." : "Every player");
  const L = state.leftTeam, team = t => state.players.filter(p => p.team === t).map(p => p.slot);
  const brk = g.kind === "breakdown";
  btn("pickTeamL", state.me ? "My Team" : TEAMS[L].color, brk ? team(L) : null, `All six heroes on ${state.me ? "your team" : "the " + TEAMS[L].color + " team"}`);
  btn("pickTeamR", state.me ? "Enemy Team" : TEAMS[1 - L].color, brk ? team(1 - L) : null, `All six heroes on ${state.me ? "the enemy team" : "the " + TEAMS[1 - L].color + " team"}`);
  btn("pickNone", "Clear", [], "Nobody, then click portraits to add them");
}
function renderOptions() {
  const g = graphNow(), sel = selNow();
  renderPicks();
  const modeOk = !g.ratio && !g.level && g.kind !== "lead";
  const okFor = v => v === "value" || (modeOk && (v === "permin" || g.kind === "general"));
  seg("optMode", modeNow(g), v => { state.mode = v; renderAll(); });
  $("optMode").querySelectorAll("button").forEach(b => {
    b.disabled = !okFor(b.dataset.v);
    if (b.disabled) b.title = g.kind === "breakdown" ? "Only for the General graphs" : "Not for this graph";
  });
  const canDiff = g.kind !== "lead" && !grouped(g) && sel.size === 2 && (g.kind === "general" || visibleCats(g).length === 1);
  if (!canDiff) state.diff = false;
  $("optDiff").hidden = !canDiff;
  seg("optDiff", state.diff ? "on" : "off", v => { state.diff = v === "on"; renderAll(); });
  // Objectives and item buys are both markers on the time axis, so they share one row of on/off toggles.
  const mo = $("markObj"), mi = $("markItems");
  mo.hidden = !state.events.length;
  mi.hidden = !itemsFit(g);
  $("optMarks").hidden = mo.hidden && mi.hidden;
  mo.classList.toggle("on", objOn(g)); mo.setAttribute("aria-pressed", String(objOn(g)));
  mi.classList.toggle("on", itemsOn(g)); mi.setAttribute("aria-pressed", String(itemsOn(g)));
  mo.onclick = () => { state.objPref[g.id] = !objOn(g); renderAll(); };
  mi.onclick = () => { state.itemPref[g.id] = !itemsOn(g); renderAll(); };
  $("ddLabel").textContent = g.label;
}

// ---------- series ----------
function seriesFor(g) {
  if (g.kind === "lead") return [leadLine()];
  const sel = g.kind === "breakdown"
    ? [...state.selBrk].map(s => state.players.find(p => p.slot === s)).filter(Boolean)
    : state.players.filter(p => selNow().has(p.slot));
  const mode = modeNow(g);
  if (mode === "team" || mode === "lane") return groupLines(g, mode).filter(se => !state.hiddenGroups.has(se.label));
  const perMin = mode === "permin";
  // Totals start at 0 at 0:00 and the Power graphs at each hero's spawn values. Rates and percentages have no value until
  // Valve's first snapshot (3:00), so their lines start at 0 and the first stretch is dotted (pts.real = index of the first real point).
  const lead = !g.start && (g.ratio || mode === "share" || perMin);
  const build = (p, get) => {
    const pts = [];
    if (g.start) { const v0 = g.start(p); if (v0 != null) pts.push([0, v0]); }
    else pts.push([0, 0]);
    for (const s of p.stats) {
      let v = get(s);
      if (v == null) continue;
      if (perMin) { if (s.time_stamp_s < 60) continue; v = v / (s.time_stamp_s / 60); }
      pts.push([s.time_stamp_s, v]);
    }
    if (lead && pts.length > 1) pts.real = 1;
    return pts;
  };
  const diffOk = state.diff && sel.length === 2;
  if (g.kind === "general") {
    const get = mode === "share" ? shareGet(g) : g.get;
    const lines = sel.map(p => ({ player: p, label: p.hero, color: colorOf(p), dash: "", pts: build(p, get) }));
    if (diffOk) return [diffLine(lines[0], lines[1], null)];
    // Share of the whole lobby at a time, for the hover readout, like the game's own graph tooltip.
    if (!g.ratio && !g.level && mode !== "share") {
      const everyone = state.players.map(p => build(p, get));
      const total = t => everyone.reduce((a, pts) => a + (lerpAt(pts, t) || 0), 0);
      for (const l of lines) l.total = total;
    }
    return lines;
  }
  const cats = visibleCats(g);
  if (diffOk && cats.length === 1) {
    const ser = g.series[cats[0]];
    const [a, b] = sel.map(p => ({ player: p, label: p.hero, color: colorOf(p), pts: build(p, ser.get) }));
    return [diffLine(a, b, ser.label)];
  }
  const out = [];
  for (const p of sel) for (const i of cats) {
    const ser = g.series[i];
    // With more than two heroes the colors alone don't say whose line it is, so the end label names the hero too.
    out.push({ player: p, label: p.hero, sub: ser.label, endLab: sel.length > 2 ? `${p.hero}: ${ser.label}` : null, color: colorOf(p), dash: DASHES[i % DASHES.length], pts: build(p, ser.get) });
  }
  return out;
}
// % of Team: a hero's value over the sum of their team's values at the same snapshot.
function shareGet(g) {
  const tot = {};
  for (const p of state.players) for (const s of p.stats) {
    const k = p.team + ":" + s.time_stamp_s;
    tot[k] = (tot[k] || 0) + (Number(g.get(s)) || 0);
  }
  return function (s) {
    const p = state.players.find(q => q.stats.includes(s));
    const t = p ? tot[p.team + ":" + s.time_stamp_s] : 0;
    return t ? (100 * (Number(g.get(s)) || 0)) / t : null;
  };
}
const LANE_COLORS = { Yellow: "#FFD23F", Green: "#58D86A", Blue: "#5C9DFF" };
// Teams and Lanes: heroes added together at each snapshot. Lanes pair each team's two heroes in the same lane.
function groupLines(g, mode) {
  const times = [...new Set(state.players.flatMap(p => p.stats.map(s => s.time_stamp_s)))].sort((a, b) => a - b);
  const at = (p, t) => { const s = p.stats.find(x => x.time_stamp_s === t); return s ? Number(g.get(s)) || 0 : null; };
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
    return { group: gr, label: gr.label, color: gr.color, dash: gr.dash, endLab: gr.label, pts };
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
  const pts = a.pts.map(([t, v]) => [t, v - (valueAt(b.pts, t) ?? 0)]);
  if (a.pts.real) pts.real = a.pts.real;
  return { player: a.player, other: b.player, label: `${a.label} vs ${b.label}`, sub: cat, color: a.color, dash: "", diff: true, pts };
}
// A line's value at any time, read off the straight segments between its points (null outside them).
function lerpAt(pts, t) {
  if (!pts.length || t < pts[0][0] || t > pts[pts.length - 1][0]) return null;
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
  if (!state.match) return;
  document.querySelectorAll("#tabs .tab").forEach(b => b.classList.toggle("on", b.dataset.tab === state.tab));
  document.body.classList.toggle("tabMvp", state.tab === "mvp");
  document.body.classList.toggle("tabMu", state.tab === "matchups");
  document.body.classList.toggle("tabPick", state.tab !== "graphs");
  const lb = avgBadge(state.players.map(p => p.badge));
  $("lobbyRank").innerHTML = lb ? `<span class="lbl">Lobby</span>${rankHtml(lb, "", true)}` : "";
  renderTop();
  if (state.tab === "mvp") { window.renderMvp(); return; }
  if (state.tab === "matchups") { window.renderMatchups(); return; }
  renderOptions();
  const g0 = graphNow();
  const series = seriesFor(g0);
  const g = modeNow(g0) === "share" ? Object.assign({}, g0, { ratio: true }) : g0; // % of Team reads as a percentage
  drawChart(series, g);
  renderLines(series, g);
}

function drawChart(series, g) {
  const ctn = $("graphCtn"), svg = $("chart");
  const W = ctn.offsetWidth, H = ctn.offsetHeight;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const endLabels = (g.kind === "breakdown" && series.some(se => se.sub && !se.diff)) || series.some(se => se.endLab);
  const m = { l: 18, r: endLabels ? 250 : 96, t: 34, b: 40 };
  const buyers = itemBuyers(g);
  if (buyers) m.b += buyers.length * 32 + 8; // item rows sit between the lines and the time axis
  const dur = state.match.duration_s || Math.max(60, ...series.flatMap(s => s.pts.map(p => p[0])));
  const t0 = 0;
  const vals = series.flatMap(s => s.pts.map(p => p[1]));
  let ymin = 0, ymax = 1;
  if (vals.length) { ymax = Math.max(...vals); ymin = Math.min(0, ...vals); }
  if (g.level && vals.length) ymin = Math.min(...vals);
  if (ymax === ymin) ymax = ymin + 1;
  const ticks = niceTicks(ymin, ymax, 4);
  ymin = Math.min(ymin, ticks[0]); ymax = Math.max(ymax, ticks[ticks.length - 1]);
  const X = t => m.l + ((Math.max(t, t0) - t0) / (dur - t0)) * (W - m.l - m.r);
  const Y = v => H - m.b - ((v - ymin) / (ymax - ymin)) * (H - m.t - m.b);
  let s = "";
  for (const v of ticks) {
    if (v === ymin && !g.level) continue;
    s += `<line x1="${m.l}" x2="${W - m.r + 8}" y1="${Y(v)}" y2="${Y(v)}" stroke="#ffffff" stroke-opacity="0.045"/>`;
    s += `<text class="ylab" x="${W - 4}" y="${Y(v) + 6}" text-anchor="end">${fmtNum(g.kind === "lead" ? Math.abs(v) : v, g)}</text>`;
  }
  const step = dur > 1500 ? 600 : 300;
  s += `<text x="${X(t0)}" y="${H - 12}" text-anchor="start">${fmtTime(t0)}</text>`;
  for (let t = step; t <= dur; t += step) {
    if (t - t0 < step * 0.45) continue; // keep clear of the start label
    s += `<text x="${X(t)}" y="${H - 12}" text-anchor="middle">${fmtTime(t)}</text>`;
  }
  s += `<line x1="${m.l}" x2="${W - m.r + 8}" y1="${Y(ymin === 0 || ymin < 0 ? 0 : ymin)}" y2="${Y(ymin === 0 || ymin < 0 ? 0 : ymin)}" stroke="#ffffff" stroke-opacity="${ymin < 0 ? 0.35 : 0.12}"/>`;
  const evs = objOn(g) ? state.events : [];
  for (const e of evs) s += `<line x1="${X(e.t)}" x2="${X(e.t)}" y1="${m.t - 4}" y2="${H - m.b}" stroke="${e.color}" stroke-opacity="0.38" stroke-dasharray="3 5" stroke-width="1.5"/>`;
  const lead = series.find(se => se.lead);
  if (lead && lead.pts.length > 1) {
    const y0 = Y(0), xs = lead.pts.map(([t, v]) => `${X(t).toFixed(1)} ${Y(v).toFixed(1)}`).join(" L");
    const area = `M${X(lead.pts[0][0]).toFixed(1)} ${y0} L${xs} L${X(lead.pts[lead.pts.length - 1][0]).toFixed(1)} ${y0}Z`;
    const cL = TEAMS[state.leftTeam].c, cR = TEAMS[1 - state.leftTeam].c;
    s += `<defs><clipPath id="clipUp"><rect x="0" y="0" width="${W}" height="${y0}"/></clipPath><clipPath id="clipDn"><rect x="0" y="${y0}" width="${W}" height="${H}"/></clipPath></defs>`;
    s += `<path d="${area}" fill="${cL}" fill-opacity="0.28" clip-path="url(#clipUp)"/><path d="${area}" fill="${cR}" fill-opacity="0.28" clip-path="url(#clipDn)"/>`;
    s += `<text x="${m.l + 10}" y="${m.t + 4}" fill="${TEAMS[state.leftTeam].c}" style="fill:${cL};font-weight:600">${TEAMS[state.leftTeam].color} ahead</text>`;
    s += `<text x="${m.l + 10}" y="${H - m.b - 12}" style="fill:${cR};font-weight:600">${TEAMS[1 - state.leftTeam].color} ahead</text>`;
  }
  s += `<g class="lineSet">`;
  const path = pts => pts.map(([t, v], i) => `${i ? "L" : "M"}${X(t).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
  for (const se of series) {
    if (!se.pts.length) continue;
    const k = se.pts.real || 0;
    // Before Valve's first snapshot a rate has no value: that stretch is a faint dotted line from 0.
    if (k) s += `<path d="${path(se.pts.slice(0, k + 1))}" fill="none" stroke="${se.color}" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 6"/>`;
    const d = path(se.pts.slice(k));
    s += `<path d="${d}" fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="${se.dash}"/>`;
    s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="${se.dash}"/>`;
  }
  s += `</g>`;
  if (endLabels) {
    // Name each line at its end so the dash styles don't need decoding. Labels are nudged apart when they collide.
    const labs = series.filter(se => se.pts.length).map(se => {
      const [t, v] = se.pts[se.pts.length - 1];
      return { x: X(t) + 10, y: Y(v) + 5, se };
    }).sort((a, b) => a.y - b.y);
    for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 17) labs[i].y = labs[i - 1].y + 17;
    for (const l of labs) s += `<text class="endLab" x="${l.x}" y="${l.y}" style="fill:${l.se.color}">${esc(l.se.endLab || l.se.sub)}</text>`;
  }
  s += `<line id="hoverLine" y1="${m.t}" y2="${H - m.b}" stroke="#FFEFD7" stroke-opacity="0" />`;
  svg.innerHTML = s;
  drawMarkers(evs, X, W);
  drawItems(buyers, X, H - 40 - (buyers ? buyers.length * 32 : 0), W - m.r);

  const emp = $("empty");
  emp.hidden = series.length > 0;
  if (!series.length) emp.textContent = selNow().size ? "Every line type is hidden. Turn one back on below." : "Click a hero portrait to add them to the graph.";

  const tip = $("tooltip"), line = svg.querySelector("#hoverLine");
  const times = [...new Set(series.flatMap(se => se.pts.map(p => p[0])))].sort((a, b) => a - b);
  state.pinned = false;
  tip.classList.remove("pinned");
  ctn.onclick = ev => {
    if (tip.contains(ev.target)) return;
    if (state.pinned) { state.pinned = false; tip.classList.remove("pinned"); ctn.onmousemove(ev); return; }
    if (tip.hidden) return;
    state.pinned = true;
    tip.classList.add("pinned");
    tip.insertAdjacentHTML("beforeend", `<div class="pinNote">Pinned. Click the graph to unpin.</div>`);
  };
  ctn.onmousemove = ev => {
    if (state.pinned) return;
    const { x: px, y: py } = mouseIn(ctn, ev);
    if (px < m.l || px > W - m.r + 10) { tip.hidden = true; line.setAttribute("stroke-opacity", 0); return; }
    const end = times.length ? times[times.length - 1] : dur;
    // The readout follows the mouse to the second, like the game's: values between Valve's snapshots are read off the drawn line.
    const t = Math.round(Math.max(0, Math.min(end, ((px - m.l) / (W - m.l - m.r)) * dur)));
    const near = evs.filter(e => Math.abs(e.t - t) <= dur * 0.012);
    let html = "";
    if (times.length) {
      line.setAttribute("x1", X(t)); line.setAttribute("x2", X(t)); line.setAttribute("stroke-opacity", 0.35);
      html += `<div class="t">${fmtTime(t)}</div>`;
      if (near.length) html += evHtml(near);
      const first = Math.min(...series.filter(se => se.pts.length).map(se => se.pts[se.pts.real || 0][0]));
      if (t < first) html += `<div class="noData">No data until ${fmtTime(first)}, Valve's first snapshot.</div>`;
      else html += readoutHtml(series.map(se => ({ se, v: lerpAt(se.pts, t) })).filter(r => r.v != null), g, t);
      if (buyers) { const prev = times.filter(x => x < t).pop(); html += boughtHtml(buyers, prev ?? -1, t); }
    } else if (near.length) html = evHtml(near);
    if (!html) { tip.hidden = true; return; }
    tip.innerHTML = html;
    tip.classList.toggle("heroTip", html.includes('class="heroRows'));
    tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = px + 22; if (left + tw > W) left = px - tw - 22;
    tip.style.left = left + "px";
    tip.style.top = Math.max(0, Math.min(py - 20, H - th)) + "px";
  };
  ctn.onmouseleave = () => { if (state.pinned) return; tip.hidden = true; line.setAttribute("stroke-opacity", 0); };
}
// Every line at the hovered time. Player comparison graphs group lines under each player; long lists use two columns.
function readoutHtml(rows, g, t) {
  if (g.kind === "breakdown" && rows.some(r => r.se.sub && !r.se.diff)) {
    const groups = [];
    for (const r of rows) {
      let gr = groups.find(x => x.p === r.se.player);
      if (!gr) groups.push(gr = { p: r.se.player, color: r.se.color, rows: [] });
      gr.rows.push(r);
    }
    // Official-style hero row (team tint, line color stripe, portrait, name), then one thin row per line type.
    // Heroes are sorted by their biggest value; more than four heroes use two columns.
    for (const gr of groups) gr.max = Math.max(...gr.rows.map(r => r.v));
    groups.sort((a, b) => b.max - a.max);
    return `<div class="heroRows brk${groups.length > 4 ? " two" : ""}"${groups.length > 4 ? ` style="grid-template-rows:repeat(${Math.ceil(groups.length / 2)},auto)"` : ""}>` + groups.map(gr => {
      const T = TEAMS[gr.p.team];
      return `<div class="grp"><div class="hr" style="--tc:${T.c};--pc:${gr.color}"><i class="sw"></i><span class="face"><img src="${gr.p.img}" alt=""></span><span class="v hn">${esc(heroName(gr.p))}</span></div>` +
        gr.rows.sort((a, b) => b.v - a.v).map(({ se, v }) => `<div class="sr"><svg viewBox="0 0 22 6"><line x1="0" x2="22" y1="3" y2="3" stroke="${se.color}" stroke-width="2.5" stroke-dasharray="${se.dash}"/></svg><span class="n">${esc(se.sub)}</span><span class="v">${fmtNum(v, g)}</span></div>`).join("") + `</div>`;
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
    return `<div class="hr" style="--tc:${T.c};--pc:${se.color}" title="${esc(heroName(p))}"><i class="sw"></i>` +
      `<span class="face"><img src="${p.img}" alt=""></span>` +
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

function drawMarkers(evs, X, W) {
  const box = $("markers");
  box.innerHTML = "";
  const placed = [];
  for (const e of evs) {
    const x = X(e.t);
    let row = 0;
    while (placed.some(q => q.row === row && Math.abs(q.x - x) < 22)) row++;
    placed.push({ x, row });
    const mk = el("div", "marker");
    mk.style.left = x + "px";
    mk.style.top = (-6 + row * 24) + "px";
    const i = el("i", e.mid ? "mid" : "");
    i.style.setProperty("--mc", e.color);
    i.style.setProperty("--icon", `url("${e.icon}")`);
    mk.title = `${e.text} at ${fmtTime(e.t)}`;
    mk.append(i);
    box.append(mk);
  }
}

// ---------- item purchases ----------
// players[].items holds every purchase with its time; item_id is a hash of the item's class name (gamedata.js ITEMS).
// Any graph that draws heroes can show them, for 1 to 3 picked heroes, one row each, so the icons stay readable.
// On by default where buys explain the line: the Power graphs and the damage graphs.
const ITEMS_DEFAULT = ["player_damage", "damage_taken", "dmg_breakdown"];
const itemsFit = g => g.kind !== "lead" && !grouped(g);
const itemsOn = g => itemsFit(g) && (state.itemPref[g.id] ?? (g.group === "Power" || ITEMS_DEFAULT.includes(g.id)));
const ITEM_SLOTS = { w: { name: "Weapon", c: "#E89A3C" }, v: { name: "Vitality", c: "#7FC241" }, s: { name: "Spirit", c: "#B77CF0" } };
function itemsOf(p) {
  const I = window.ITEMS || {};
  return (p.raw.items || []).filter(it => I[it.item_id]).map(it => {
    const [name, slot, tier, icon] = I[it.item_id];
    return { t: Number(it.game_time_s) || 0, sold: Number(it.sold_time_s) || 0, name, slot, tier, icon };
  }).sort((a, b) => a.t - b.t);
}
function itemBuyers(g) {
  if (!itemsOn(g)) return null;
  const sel = g.kind === "breakdown" ? [...state.selBrk].map(s => state.players.find(p => p.slot === s)).filter(Boolean) : state.players.filter(p => state.selGen.has(p.slot));
  return sel.length >= 1 && sel.length <= 3 ? sel : null;
}
function drawItems(buyers, X, top, right) {
  const box = $("itemRows");
  box.innerHTML = "";
  if (!buyers) return;
  buyers.forEach((p, r) => {
    const y = top + r * 32;
    const row = el("div", "itemRow");
    row.style.top = y + "px";
    row.innerHTML = `<span class="who" style="left:${right + 14}px;--pc:${colorOf(p)}">${portraitImg(p)}</span>`;
    let lastX = -99;
    for (const it of itemsOf(p)) {
      const x = Math.max(X(it.t), lastX + 25); // X clamps buys before the axis start to its left edge
      lastX = x;
      const i = el("i", "itemIcon" + (it.sold ? " sold" : "")); // sold later: full color, with a corner mark
      i.style.left = x + "px";
      i.style.setProperty("--sc", ITEM_SLOTS[it.slot].c);
      i.style.backgroundImage = `url("assets/items/${it.icon}.webp")`;
      i.title = `${p.hero}: ${it.name} (${ITEM_SLOTS[it.slot].name}, tier ${it.tier})\nBought ${fmtTime(it.t)}${it.sold ? ", sold " + fmtTime(it.sold) : ""}`;
      row.append(i);
    }
    box.append(row);
  });
}
function portraitImg(p) { return `<img src="${p.img}" alt="" style="--coin:${TEAMS[p.team].coin}">`; }
function boughtHtml(buyers, t0, t1) {
  const rows = [];
  for (const p of buyers) for (const it of itemsOf(p)) if (it.t > t0 && it.t <= t1) rows.push({ p, it });
  if (!rows.length) return "";
  rows.sort((a, b) => a.it.t - b.it.t);
  return `<div class="bought"><div class="bh">Bought since ${fmtTime(Math.max(0, t0))}</div>` + rows.map(({ p, it }) =>
    `<div class="row"><span class="sw" style="background:${colorOf(p)}"></span><i class="itemIcon sm" style="--sc:${ITEM_SLOTS[it.slot].c};background-image:url('assets/items/${it.icon}.webp')"></i><span class="n">${esc(it.name)}${buyers.length > 1 ? ` <small>${esc(p.hero)}</small>` : ""}</span><span class="v t">${fmtTime(it.t)}</span></div>`).join("") + `</div>`;
}

function renderLines(series, g) {
  const row = $("lineRow"), box = $("lines");
  box.innerHTML = "";
  const d = series.find(se => se.diff);
  $("lineHintStatic").hidden = g.kind !== "breakdown";
  $("lineHintStatic").textContent = grouped(g) ? "Click to hide a line. Ctrl+Click to show only that one."
    : "Click to hide a line type. Ctrl+Click to show only that one." + (itemsOn(g) && !itemBuyers(g) ? " Item buys show for 1 to 3 heroes." : "");
  if (g.kind === "lead") {
    row.hidden = false;
    box.append(el("span", "lineHint", `Above the line: ${TEAMS[state.leftTeam].color} ahead. Below: ${TEAMS[1 - state.leftTeam].color} ahead. Hero picks don't change this graph.`));
    document.body.classList.remove("noLines");
    return;
  }
  if (grouped(g)) {
    // One button per team or lane line, like the line types on the Player Comparison graphs.
    row.hidden = false;
    $("lineHintStatic").hidden = false;
    const all = groupLines(g, modeNow(g)), h = state.hiddenGroups;
    for (const se of all) {
      const b = el("button", "graphOptionButton" + (h.has(se.label) ? " off" : ""));
      b.innerHTML = `<svg viewBox="0 0 30 8"><line x1="0" x2="30" y1="4" y2="4" stroke="${se.color}" stroke-width="3" stroke-dasharray="${se.dash}"/></svg><span>${esc(se.label)}</span>`;
      b.title = (se.group.sub ? se.group.ps.map(p => p.hero).join(" + ") + "\n" : "") + "Click to show or hide. Ctrl+Click to show only this line.";
      b.onclick = ev => {
        if (ev.ctrlKey || ev.metaKey) { h.clear(); all.forEach(x => { if (x.label !== se.label) h.add(x.label); }); }
        else if (h.has(se.label)) h.delete(se.label); else h.add(se.label);
        renderAll();
      };
      box.append(b);
    }
    if (all.some(se => h.has(se.label))) { const b = el("button", "graphOptionButton", "Show All"); b.onclick = () => { h.clear(); renderAll(); }; box.append(b); }
    document.body.classList.remove("noLines");
    return;
  }
  if (g.kind !== "breakdown") {
    const itemHint = itemsOn(g) && !itemBuyers(g);
    row.hidden = !d && !itemHint;
    if (d) box.append(el("span", "lineHint", `Above the line: ${d.player.hero} ahead. Below: ${d.other.hero} ahead.`));
    if (itemHint) box.append(el("span", "lineHint", "Pick 1 to 3 heroes to see when they bought each item."));
    document.body.classList.toggle("noLines", row.hidden);
    return;
  }
  row.hidden = false;
  document.body.classList.remove("noLines");
  const h = hiddenFor(g);
  g.series.forEach((ser, i) => {
    const b = el("button", "graphOptionButton" + (h.has(i) ? " off" : ""));
    b.innerHTML = `<svg viewBox="0 0 30 8"><line x1="0" x2="30" y1="4" y2="4" stroke="#FFEFD7" stroke-width="2.5" stroke-dasharray="${DASHES[i % DASHES.length]}"/></svg><span>${esc(ser.label)}</span>`;
    b.title = "Click to show or hide. Ctrl+Click to show only this line type.";
    b.onclick = ev => {
      if (ev.ctrlKey || ev.metaKey) { h.clear(); g.series.forEach((_, j) => { if (j !== i) h.add(j); }); }
      else if (h.has(i)) h.delete(i); else h.add(i);
      renderAll();
    };
    box.append(b);
  });
  if (h.size) { const all = el("button", "graphOptionButton", "Show All"); all.onclick = () => { h.clear(); renderAll(); }; box.append(all); }
}

// ---------- helpers ----------
function niceTicks(lo, hi, n) {
  const span = hi - lo, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => span / s <= n) || 10 * mag;
  const out = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.5; v += step) out.push(+v.toFixed(6));
  return out;
}
function fmtTime(s) { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function fmtSouls(v) { return v >= 1000 ? `${Math.round(v / 1000)}<span class="k">k</span>` : String(Math.round(v)); }
function fmtNum(v, g) {
  if (g && g.ratio) return v.toFixed(1) + "%";
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
fit();
window.addEventListener("resize", () => { fit(); renderAll(); });
wireDropDown();
document.querySelectorAll("#tabs .tab").forEach(b => b.onclick = () => { state.tab = b.dataset.tab; closeMenu(); renderAll(); });
if (["mvp", "matchups"].includes(params.get("tab"))) state.tab = params.get("tab");
buildDropDown();
if (params.get("graph") && GRAPHS.some(g => g.id === params.get("graph"))) state.graph = params.get("graph");
$("matchForm").onsubmit = ev => {
  ev.preventDefault();
  const id = $("matchInput").value.trim();
  if (!/^\d+$/.test(id)) return setStatus("Enter a numeric match ID.", true);
  const u = new URL(location.href); u.searchParams.set("match", id); u.searchParams.delete("players"); history.replaceState(null, "", u);
  loadMatch(id);
};
// In game, ESC or the overlay's own Close closes it. The page can also ask Panorama to close via the title.
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && EMBED && $("ddMenu").hidden) document.title = "DLC_CLOSE:" + Date.now(); });
window.addEventListener("hashchange", () => { if (state.match) { applyViewer(); renderAll(); } });
// Tell the mod the page has drawn, so it can show the panel without the browser's gray flash.
// A hidden browser may not run animation frames, so a timer backs it up.
if (EMBED) {
  let told = false;
  const ready = () => { if (!told) { told = true; document.title = "DLC_READY:" + Date.now(); } };
  requestAnimationFrame(() => requestAnimationFrame(ready));
  setTimeout(ready, 400);
}
const startId = params.get("match");
if (startId && /^\d+$/.test(startId)) loadMatch(startId);
else { clearMatch(); setStatus(EMBED ? "No match ID was passed in." : "Enter a match ID to load it."); }
