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
  { group: "Power", id: "level", label: "Level", kind: "general", level: true, get: s => s.level },
  { group: "Power", id: "max_health", label: "Max Health", kind: "general", level: true, get: s => s.max_health },
  { group: "Power", id: "weapon_power", label: "Weapon Power", kind: "general", level: true, get: s => s.weapon_power },
  { group: "Power", id: "spirit_power", label: "Spirit Power", kind: "general", level: true, get: s => s.tech_power },
  { group: "Player Comparison", id: "dmg_breakdown", label: "Damage Breakdown", kind: "breakdown", obj: true, series: [
      { label: "Enemy Players", get: s => s.player_damage },
      { label: "Troopers", get: s => s.creep_damage },
      { label: "Haunts", get: s => s.neutral_damage },
      { label: "Objectives", get: s => s.boss_damage },
  ] },
  { group: "Player Comparison", id: "souls_source", label: "Souls by Source", kind: "breakdown", series: [
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
  objPref: {}, hiddenCats: {},
  leftTeam: 0, me: null,
  tab: "graphs", mvpPick: null, mvpMode: "impact",
};
const $ = id => document.getElementById(id);
const graphNow = () => GRAPHS.find(g => g.id === state.graph);
const selNow = () => (graphNow().kind === "breakdown" ? state.selBrk : state.selGen);
const setSel = s => { if (graphNow().kind === "breakdown") state.selBrk = s; else state.selGen = s; };
function colorOf(p) {
  if (graphNow().kind !== "breakdown") return p.color;
  const i = [...state.selBrk].indexOf(p.slot);
  return i >= 0 && i < PAIR_COLORS.length ? PAIR_COLORS[i] : p.color;
}
function hiddenFor(g) { return state.hiddenCats[g.id] || (state.hiddenCats[g.id] = new Set()); }
function visibleCats(g) { const h = hiddenFor(g); return g.series.map((s, i) => i).filter(i => !h.has(i)); }
function objOn(g) { return state.objPref[g.id] ?? !!g.obj; }

// ---------- layout scaling: Deadlock lays out in 1080p units ----------
function fit() {
  const H = EMBED ? 996 : 1080;
  const z = Math.min(innerWidth / 1920, innerHeight / H);
  const st = $("stage");
  st.style.transform = `scale(${z})`;
  st.style.left = Math.max(0, (innerWidth - 1920 * z) / 2) + "px";
  state.zoom = z;
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
  // Which team sits on the left: the viewer's team when the game tells us, else Amber.
  const fr = Number(params.get("friendly"));
  state.leftTeam = fr === 0 || fr === 1 ? fr : 0;
  const meHero = Number(params.get("me_hero")) || (window.HERO_CODES || {})[params.get("me_name")] || 0;
  state.me = state.players.find(p => p.heroId === meHero && (params.get("friendly") == null || p.team === state.leftTeam)) || null;
  if (state.me) state.leftTeam = state.me.team;

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
const RANK_NAMES = ["Obscurus", "Initiate", "Seeker", "Alchemist", "Arcanist", "Ritualist", "Emissary", "Archon", "Oracle", "Phantom", "Ascendant", "Eternus"];
function rankOf(badge) {
  if (!badge) return null;
  const tier = Math.floor(badge / 10), sub = badge % 10;
  if (!RANK_NAMES[tier]) return null;
  return { tier, sub, name: tier === 0 ? RANK_NAMES[0] : `${RANK_NAMES[tier]} ${sub}`, img: `assets/ranks/${tier}_${tier === 0 ? 0 : Math.min(6, Math.max(1, sub))}.png` };
}
// Average as steps (tier * 6 + subrank), then back to a badge.
function avgBadge(badges) {
  const b = badges.filter(x => x && Math.floor(x / 10) > 0);
  if (!b.length) return 0;
  const steps = b.reduce((a, x) => a + Math.floor(x / 10) * 6 + (x % 10 - 1), 0) / b.length;
  const r = Math.round(steps);
  return Math.floor(r / 6) * 10 + (r % 6) + 1;
}
function rankHtml(badge, cls) {
  const r = rankOf(badge);
  return r ? `<span class="${cls || "rank"}"><img src="${r.img}" alt=""><span>${esc(r.name)}</span></span>` : "";
}

// ---------- top bar ----------
function renderTop() {
  const mvp = state.tab === "mvp";
  const leadG = !mvp && graphNow().kind === "lead";
  const sel = mvp || leadG ? new Set(state.players.map(p => p.slot)) : selNow();
  for (const side of ["Left", "Right"]) {
    const team = side === "Left" ? state.leftTeam : 1 - state.leftTeam;
    const T = TEAMS[team];
    const ctn = $("team" + side);
    ctn.innerHTML = "";
    const ps = state.players.filter(p => p.team === team);
    for (const p of ps) {
      const d = el("div", "player" + (sel.has(p.slot) ? " sel" : "") + (mvp && state.mvpPick === p.slot ? " pick" : ""));
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
        if (mvp) { state.mvpPick = p.slot; renderAll(); return; }
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
    ta.innerHTML = tb ? `<span class="lbl">Avg</span>${rankHtml(tb)}` : "";
    sc.title = `${T.name} (${T.color})\nClick to show only this team. Click again to show everyone.`;
    const onlyThis = ps.length && ps.every(p => sel.has(p.slot)) && [...sel].every(s => ps.some(p => p.slot === s));
    sc.classList.toggle("dim", sel.size > 0 && !ps.some(p => sel.has(p.slot)));
    sc.onclick = () => { if (mvp || leadG) return; setSel(onlyThis ? new Set(state.players.map(p => p.slot)) : new Set(ps.map(p => p.slot))); renderAll(); };
  }
}

// ---------- dropdown and options ----------
function buildDropDown() {
  const dd = $("graphDD"), menu = $("ddMenu");
  menu.innerHTML = "";
  let group = null;
  for (const g of GRAPHS) {
    if (g.group !== group) { group = g.group; menu.append(el("div", "cat", group)); }
    const b = el("button", "item" + (g.id === state.graph ? " on" : ""));
    b.innerHTML = esc(g.label) + (g.sub || (g.kind === "breakdown" && GROUP_SUB[g.group]) ? `<span class="sub">${esc(g.sub || GROUP_SUB[g.group])}</span>` : "");
    b.onclick = ev => { ev.stopPropagation(); state.graph = g.id; closeMenu(); renderAll(); };
    menu.append(b);
  }
  $("ddLabel").textContent = graphNow().label;
}
function closeMenu() { $("ddMenu").hidden = true; $("graphDD").classList.remove("open"); }
function wireDropDown() {
  const dd = $("graphDD");
  dd.onclick = () => { const m = $("ddMenu"); m.hidden = !m.hidden; dd.classList.toggle("open", !m.hidden); if (!m.hidden) buildDropDown(); };
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
function renderOptions() {
  const g = graphNow(), sel = selNow();
  const modeOk = !g.ratio && !g.level && g.kind !== "lead";
  seg("optMode", modeOk ? state.mode : "value", v => { state.mode = v; renderAll(); });
  $("optMode").querySelectorAll("button").forEach(b => { b.disabled = !modeOk; });
  const canDiff = g.kind !== "lead" && sel.size === 2 && (g.kind === "general" || visibleCats(g).length === 1);
  if (!canDiff) state.diff = false;
  $("optDiff").hidden = !canDiff;
  seg("optDiff", state.diff ? "on" : "off", v => { state.diff = v === "on"; renderAll(); });
  $("optObj").hidden = !state.events.length;
  seg("optObj", objOn(g) ? "on" : "off", v => { state.objPref[g.id] = v === "on"; renderAll(); });
  $("ddLabel").textContent = g.label;
}

// ---------- series ----------
function seriesFor(g) {
  if (g.kind === "lead") return [leadLine()];
  const sel = g.kind === "breakdown"
    ? [...state.selBrk].map(s => state.players.find(p => p.slot === s)).filter(Boolean)
    : state.players.filter(p => selNow().has(p.slot));
  const perMin = state.mode === "permin" && !g.ratio && !g.level;
  const build = (p, get) => {
    const pts = [];
    if (!g.ratio && !g.level) pts.push([0, 0]);
    for (const s of p.stats) {
      let v = get(s);
      if (v == null) continue;
      if (perMin) { if (s.time_stamp_s < 60) continue; v = v / (s.time_stamp_s / 60); }
      pts.push([s.time_stamp_s, v]);
    }
    if (perMin && pts.length && pts[0][0] === 0) pts.shift();
    return pts;
  };
  const diffOk = state.diff && sel.length === 2;
  if (g.kind === "general") {
    const lines = sel.map(p => ({ player: p, label: p.hero, color: colorOf(p), dash: "", pts: build(p, g.get) }));
    if (diffOk) return [diffLine(lines[0], lines[1], null)];
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
    out.push({ player: p, label: p.hero, sub: ser.label, color: colorOf(p), dash: DASHES[i % DASHES.length], pts: build(p, ser.get) });
  }
  return out;
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
  return { player: a.player, other: b.player, label: `${a.label} vs ${b.label}`, sub: cat, color: a.color, dash: "", diff: true,
    pts: a.pts.map(([t, v]) => [t, v - (valueAt(b.pts, t) ?? 0)]) };
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
  const lb = avgBadge(state.players.map(p => p.badge));
  $("lobbyRank").innerHTML = lb ? `<span class="lbl">Lobby</span>${rankHtml(lb)}` : "";
  renderTop();
  if (state.tab === "mvp") { window.renderMvp(); return; }
  renderOptions();
  const g = graphNow();
  const series = seriesFor(g);
  drawChart(series, g);
  renderLines(series, g);
}

function drawChart(series, g) {
  const ctn = $("graphCtn"), svg = $("chart");
  const W = ctn.offsetWidth, H = ctn.offsetHeight;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const m = { l: 18, r: 96, t: 34, b: 40 };
  const dur = state.match.duration_s || Math.max(60, ...series.flatMap(s => s.pts.map(p => p[0])));
  const vals = series.flatMap(s => s.pts.map(p => p[1]));
  let ymin = 0, ymax = 1;
  if (vals.length) { ymax = Math.max(...vals); ymin = Math.min(0, ...vals); }
  if (g.level && vals.length) ymin = Math.min(...vals);
  if (ymax === ymin) ymax = ymin + 1;
  const ticks = niceTicks(ymin, ymax, 4);
  ymin = Math.min(ymin, ticks[0]); ymax = Math.max(ymax, ticks[ticks.length - 1]);
  const X = t => m.l + (t / dur) * (W - m.l - m.r);
  const Y = v => H - m.b - ((v - ymin) / (ymax - ymin)) * (H - m.t - m.b);
  let s = "";
  for (const v of ticks) {
    if (v === ymin && !g.level) continue;
    s += `<line x1="${m.l}" x2="${W - m.r + 8}" y1="${Y(v)}" y2="${Y(v)}" stroke="#ffffff" stroke-opacity="0.045"/>`;
    s += `<text class="ylab" x="${W - 4}" y="${Y(v) + 6}" text-anchor="end">${fmtNum(g.kind === "lead" ? Math.abs(v) : v, g)}</text>`;
  }
  const step = dur > 1500 ? 600 : 300;
  for (let t = 0; t <= dur; t += step) {
    s += `<text x="${X(t)}" y="${H - m.b + 28}" text-anchor="${t === 0 ? "start" : "middle"}">${fmtTime(t)}</text>`;
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
  for (const se of series) {
    if (!se.pts.length) continue;
    const d = se.pts.map(([t, v], i) => `${i ? "L" : "M"}${X(t).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
    s += `<path d="${d}" fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="${se.dash}"/>`;
    s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="${se.dash}"/>`;
  }
  s += `</g><line id="hoverLine" y1="${m.t}" y2="${H - m.b}" stroke="#FFEFD7" stroke-opacity="0" />`;
  svg.innerHTML = s;
  drawMarkers(evs, X, W);

  const emp = $("empty");
  emp.hidden = series.length > 0;
  if (!series.length) emp.textContent = selNow().size ? "Every line type is hidden. Turn one back on below." : "Click a hero portrait to add them to the graph.";

  const tip = $("tooltip"), line = svg.querySelector("#hoverLine");
  const times = [...new Set(series.flatMap(se => se.pts.map(p => p[0])))].sort((a, b) => a - b);
  ctn.onmousemove = ev => {
    const r = ctn.getBoundingClientRect(), z = r.width / W;
    const px = (ev.clientX - r.left) / z, py = (ev.clientY - r.top) / z;
    if (px < m.l || px > W - m.r + 10) { tip.hidden = true; line.setAttribute("stroke-opacity", 0); return; }
    const tRaw = ((px - m.l) / (W - m.l - m.r)) * dur;
    const near = evs.filter(e => Math.abs(e.t - tRaw) <= dur * 0.012);
    let html = "";
    if (times.length) {
      const t = times.reduce((a, b) => (Math.abs(b - tRaw) < Math.abs(a - tRaw) ? b : a));
      line.setAttribute("x1", X(t)); line.setAttribute("x2", X(t)); line.setAttribute("stroke-opacity", 0.35);
      const rows = series.map(se => ({ se, v: valueAt(se.pts, t) })).filter(r => r.v != null);
      html += `<div class="t">${fmtTime(t)}</div>`;
      if (near.length) html += evHtml(near);
      html += readoutHtml(rows, g);
    } else if (near.length) html = evHtml(near);
    if (!html) { tip.hidden = true; return; }
    tip.innerHTML = html;
    tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = px + 22; if (left + tw > W) left = px - tw - 22;
    tip.style.left = left + "px";
    tip.style.top = Math.max(0, Math.min(py - 20, H - th)) + "px";
  };
  ctn.onmouseleave = () => { tip.hidden = true; line.setAttribute("stroke-opacity", 0); };
}
// Every line at the hovered time. Player comparison graphs group lines under each player; long lists use two columns.
function readoutHtml(rows, g) {
  if (g.kind === "breakdown" && rows.some(r => r.se.sub && !r.se.diff)) {
    const groups = [];
    for (const r of rows) {
      let gr = groups.find(x => x.p === r.se.player);
      if (!gr) groups.push(gr = { p: r.se.player, color: r.se.color, rows: [] });
      gr.rows.push(r);
    }
    return `<div class="cols${groups.length > 1 ? " two" : ""}">` + groups.map(gr => {
      const T = TEAMS[gr.p.team];
      return `<div class="grp"><div class="row gh"><img src="${gr.p.img}" style="--coin:${T.coin}"><span class="sw" style="background:${gr.color}"></span><span class="n">${esc(heroName(gr.p))}</span></div>` +
        gr.rows.sort((a, b) => b.v - a.v).map(({ se, v }) => `<div class="row sub"><svg viewBox="0 0 22 6"><line x1="0" x2="22" y1="3" y2="3" stroke="${se.color}" stroke-width="2.5" stroke-dasharray="${se.dash}"/></svg><span class="n">${esc(se.sub)}</span><span class="v">${fmtNum(v, g)}</span></div>`).join("") + `</div>`;
    }).join("") + `</div>`;
  }
  rows.sort((a, b) => b.v - a.v);
  const two = rows.length > 8; // fill down the first column, then the second, so rank order reads top to bottom
  return `<div class="cols${two ? " two" : ""}"${two ? ` style="grid-auto-flow:column;grid-template-rows:repeat(${Math.ceil(rows.length / 2)},auto)"` : ""}>` + rows.map(({ se, v }) => rowHtml(se, v, g)).join("") + `</div>`;
}
function evHtml(list) {
  return `<div class="ev">${list.map(e => `<div><b style="background:${e.color}"></b>${esc(e.text)} <small style="opacity:.55">${fmtTime(e.t)}</small></div>`).join("")}</div>`;
}
function rowHtml(se, v, g) {
  if (se.lead) {
    const T = TEAMS[v >= 0 ? state.leftTeam : 1 - state.leftTeam];
    return `<div class="row"><span class="sw" style="background:${T.c}"></span><span class="n">${v === 0 ? "Even" : T.color + " ahead"}</span><span class="v">${fmtNum(Math.abs(v), g)}</span></div>`;
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

function renderLines(series, g) {
  const row = $("lineRow"), box = $("lines");
  box.innerHTML = "";
  const d = series.find(se => se.diff);
  $("lineHintStatic").hidden = g.kind !== "breakdown";
  if (g.kind === "lead") {
    row.hidden = false;
    box.append(el("span", "lineHint", `Above the line: ${TEAMS[state.leftTeam].color} ahead. Below: ${TEAMS[1 - state.leftTeam].color} ahead. Hero picks don't change this graph.`));
    document.body.classList.remove("noLines");
    return;
  }
  if (g.kind !== "breakdown") {
    row.hidden = !d;
    if (d) box.append(el("span", "lineHint", `Above the line: ${d.player.hero} ahead. Below: ${d.other.hero} ahead.`));
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
if (params.get("tab") === "mvp") state.tab = "mvp";
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
const startId = params.get("match");
if (startId && /^\d+$/.test(startId)) loadMatch(startId);
else { clearMatch(); setStatus(EMBED ? "No match ID was passed in." : "Enter a match ID to load it."); }
