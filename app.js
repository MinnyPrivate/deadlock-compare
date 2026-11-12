"use strict";
// Deadlock Compare: overlay and isolate post-match graphs.
// Data: https://api.deadlock-api.com/v1/matches/{id}/metadata (Valve match metadata).

const API = "https://api.deadlock-api.com/v1/matches/";
const PLAYER_COLORS = [
  "#f2c14e", "#e86a5b", "#7bd389", "#5bc0eb", "#c792ea", "#ff9f6e",
  "#9be564", "#4ad7c8", "#f78fb3", "#a0a7ff", "#e4e47a", "#ffb4a2",
];
const DASHES = ["", "7 4", "2 3", "10 3 2 3", "1 5", "14 4"];

// Graphs. kind "general" = one line per player. kind "breakdown" = several lines per player.
const GRAPHS = [
  { group: "General", id: "souls", label: "Souls", kind: "general", get: s => s.net_worth },
  { group: "General", id: "player_damage", label: "Damage to players", kind: "general", get: s => s.player_damage },
  { group: "General", id: "damage_taken", label: "Damage taken from players", kind: "general", get: s => s.player_damage_taken },
  { group: "General", id: "boss_damage", label: "Boss and objective damage", kind: "general", get: s => s.boss_damage, midboss: true },
  { group: "General", id: "healing", label: "Healing", kind: "general", get: s => s.player_healing },
  { group: "General", id: "kills", label: "Kills", kind: "general", get: s => s.kills },
  { group: "General", id: "deaths", label: "Deaths", kind: "general", get: s => s.deaths },
  { group: "General", id: "assists", label: "Assists", kind: "general", get: s => s.assists },
  { group: "General", id: "last_hits", label: "Last hits (troopers + neutrals)", kind: "general", get: s => (s.creep_kills || 0) + (s.neutral_kills || 0) },
  { group: "General", id: "accuracy", label: "Accuracy %", kind: "general", ratio: true, get: s => pct(s.shots_hit, (s.shots_hit || 0) + (s.shots_missed || 0)) },
  { group: "General", id: "crit", label: "Crit bullet %", kind: "general", ratio: true, get: s => pct(s.hero_bullets_hit_crit, s.hero_bullets_hit) },
  { group: "Power curve", id: "level", label: "Level", kind: "general", level: true, get: s => s.level },
  { group: "Power curve", id: "max_health", label: "Max health", kind: "general", level: true, get: s => s.max_health },
  { group: "Power curve", id: "weapon_power", label: "Weapon power", kind: "general", level: true, get: s => s.weapon_power },
  { group: "Power curve", id: "spirit_power", label: "Spirit power", kind: "general", level: true, get: s => s.tech_power },
  { group: "Player-specific (overlay)", id: "dmg_breakdown", label: "Damage breakdown", kind: "breakdown", midboss: true, series: [
      { label: "Players", get: s => s.player_damage },
      { label: "Troopers", get: s => s.creep_damage },
      { label: "Neutrals", get: s => s.neutral_damage },
      { label: "Bosses and objectives", get: s => s.boss_damage },
  ] },
  { group: "Player-specific (overlay)", id: "souls_source", label: "Souls by source", kind: "breakdown", series: [
      { label: "Players", get: s => s.gold_player },
      { label: "Lane troopers", get: s => s.gold_lane_creep },
      { label: "Neutrals", get: s => s.gold_neutral_creep },
      { label: "Bosses", get: s => s.gold_boss },
      { label: "Treasure", get: s => s.gold_treasure },
  ] },
  { group: "Player-specific (overlay)", id: "support", label: "Support value", kind: "breakdown", series: [
      { label: "Teammate healing", get: s => s.teammate_healing },
      { label: "Teammate barriers", get: s => s.teammate_barriering },
      { label: "Heal prevented", get: s => s.heal_prevented },
      { label: "Damage mitigated", get: s => s.damage_mitigated },
  ] },
  { group: "Player-specific (overlay)", id: "kill_types", label: "Kills by type", kind: "breakdown", series: [
      { label: "Bullet", get: s => s.bullet_kills },
      { label: "Ability", get: s => s.ability_kills },
      { label: "Melee", get: s => s.melee_kills },
      { label: "Headshot", get: s => s.headshot_kills },
  ] },
];

function pct(a, b) { return b ? (100 * (a || 0)) / b : null; }

const state = {
  match: null,
  players: [],      // {slot, team, hero, color, stats[], mvp}
  selected: new Set(),
  graph: "souls",
  mode: "value",
  diff: false,
  hiddenCats: {},   // graph id -> Set of hidden category indexes
};

function hiddenFor(graph) { return state.hiddenCats[graph.id] || (state.hiddenCats[graph.id] = new Set()); }
function visibleCats(graph) { const h = hiddenFor(graph); return graph.series.map((s, i) => i).filter(i => !h.has(i)); }

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ---------- loading ----------
async function loadMatch(id) {
  setStatus("Loading match " + id + "...");
  const src = params.get("src"); // local test file, relative path only
  const url = src && /^[\w./-]+$/.test(src) && !src.includes("..") ? src : API + encodeURIComponent(id) + "/metadata";
  let data;
  try {
    const r = await fetch(url);
    if (r.status === 404) throw new Error("Match not found yet. The API may not have fetched it. Try again in a few minutes.");
    if (!r.ok) throw new Error("API error " + r.status);
    data = await r.json();
  } catch (e) {
    setStatus(e.message || String(e), true);
    return;
  }
  setup(data.match_info || data);
}

function setup(mi) {
  state.match = mi;
  const ordered = [...mi.players].sort((a, b) => a.team - b.team || a.player_slot - b.player_slot);
  state.players = ordered.map((p, i) => ({
    slot: p.player_slot,
    team: p.team,
    hero: (window.HERO_NAMES || {})[p.hero_id] || "Hero " + p.hero_id,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    stats: (p.stats || []).slice().sort((a, b) => a.time_stamp_s - b.time_stamp_s),
    kda: `${p.kills || 0}/${p.deaths || 0}/${p.assists || 0}`,
    souls: p.net_worth || 0,
    mvp: p.mvp_rank || 0,
  }));
  const sel = (params.get("players") || "").split(",").map(Number).filter(Boolean);
  state.selected = new Set(sel.length ? sel : state.players.map(p => p.slot));
  $("matchInput").value = mi.match_id || "";
  const dur = mi.duration_s || 0;
  $("matchMeta").textContent = `Match ${mi.match_id} · ${fmtTime(dur)}`;
  renderTeams();
  render();
  setStatus("");
}

// ---------- UI ----------
function renderTeams() {
  const wrap = $("teams");
  wrap.innerHTML = "";
  const mi = state.match;
  for (const team of [0, 1]) {
    const ps = state.players.filter(p => p.team === team);
    const total = ps.reduce((a, p) => a + p.souls, 0);
    const box = el("div", "team " + (team === 0 ? "amber" : "sapphire"));
    const head = el("div", "teamHead");
    const name = el("span", "name" + (mi.winning_team === team ? " won" : ""), team === 0 ? "Hidden King" : "Archmother");
    head.append(name, el("span", "souls", fmtK(total) + " souls"), el("span", "spacer"));
    const all = el("button", "", "All"); all.onclick = () => { ps.forEach(p => state.selected.add(p.slot)); refresh(); };
    const none = el("button", "", "None"); none.onclick = () => { ps.forEach(p => state.selected.delete(p.slot)); refresh(); };
    const only = el("button", "", "Only"); only.onclick = () => { state.selected = new Set(ps.map(p => p.slot)); refresh(); };
    head.append(all, none, only);
    const grid = el("div", "players");
    for (const p of ps) {
      const c = el("div", "player" + (state.selected.has(p.slot) ? " sel" : ""));
      c.style.setProperty("--pc", p.color);
      c.title = "Click to toggle. Ctrl+Click to show only this player.";
      c.append(el("div", "swatch"), el("div", "hero", p.hero), el("div", "sub", p.kda + " · " + fmtK(p.souls)));
      if (p.mvp) c.append(el("div", "mvp", p.mvp === 1 ? "MVP" : "KEY PLAYER"));
      c.onclick = ev => {
        if (ev.ctrlKey || ev.metaKey) state.selected = new Set([p.slot]);
        else if (state.selected.has(p.slot)) state.selected.delete(p.slot);
        else state.selected.add(p.slot);
        refresh();
      };
      grid.append(c);
    }
    box.append(head, grid);
    wrap.append(box);
  }
}

function refresh() { renderTeams(); render(); }

function buildGraphSelect() {
  const s = $("graphType");
  let group = null, og = null;
  for (const g of GRAPHS) {
    if (g.group !== group) { og = document.createElement("optgroup"); og.label = group = g.group; s.append(og); }
    const o = document.createElement("option"); o.value = g.id; o.textContent = g.label; og.append(o);
  }
  s.value = state.graph;
  s.onchange = () => { state.graph = s.value; render(); };
  segment("modeSeg", "mode", v => { state.mode = v; render(); });
  segment("diffSeg", "diff", v => { state.diff = v === "on"; render(); });
}

function segment(id, key, fn) {
  const seg = $(id);
  seg.querySelectorAll("button").forEach(b => b.onclick = () => {
    seg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    fn(b.dataset[key]);
  });
}

// ---------- series ----------
function seriesFor(graph) {
  const sel = state.players.filter(p => state.selected.has(p.slot));
  const out = [];
  const perMin = state.mode === "permin" && !graph.ratio && !graph.level;
  const build = (p, get) => {
    const pts = [];
    if (!graph.ratio && !graph.level) pts.push([0, 0]);
    for (const s of p.stats) {
      let v = get(s);
      if (v == null) continue;
      if (perMin) v = s.time_stamp_s > 0 ? v / (s.time_stamp_s / 60) : 0;
      pts.push([s.time_stamp_s, v]);
    }
    return pts;
  };
  if (graph.kind === "general") {
    const lines = sel.map(p => ({ player: p, label: p.hero, color: p.color, dash: "", pts: build(p, graph.get) }));
    if (state.diff && lines.length === 2) {
      const [a, b] = lines;
      const pts = a.pts.map(([t, v]) => [t, v - (valueAt(b.pts, t) ?? 0)]);
      out.push({ label: `${a.label} minus ${b.label}`, aName: a.label, bName: b.label, color: a.color, dash: "", pts, diff: true });
    } else out.push(...lines);
  } else {
    const cats = visibleCats(graph);
    if (state.diff && sel.length === 2 && cats.length === 1) {
      const ser = graph.series[cats[0]];
      const [a, b] = sel.map(p => build(p, ser.get));
      out.push({ label: `${sel[0].hero} minus ${sel[1].hero} (${ser.label})`, aName: sel[0].hero, bName: sel[1].hero, color: sel[0].color, dash: "", diff: true,
        pts: a.map(([t, v]) => [t, v - (valueAt(b, t) ?? 0)]) });
    } else for (const p of sel) for (const i of cats) {
      const ser = graph.series[i];
      out.push({ player: p, label: `${p.hero}: ${ser.label}`, sub: ser.label, color: p.color, dash: DASHES[i % DASHES.length], pts: build(p, ser.get) });
    }
  }
  return out;
}

function valueAt(pts, t) {
  let best = null, bd = Infinity;
  for (const [x, v] of pts) { const d = Math.abs(x - t); if (d < bd) { bd = d; best = v; } }
  return best;
}

// ---------- chart ----------
function render() {
  if (!state.match) return;
  const graph = GRAPHS.find(g => g.id === state.graph);
  const sel = state.players.filter(p => state.selected.has(p.slot));
  $("diffCtl").hidden = !(sel.length === 2 && (graph.kind === "general" || visibleCats(graph).length === 1));
  $("modeCtl").style.opacity = graph.ratio || graph.level ? 0.4 : 1;
  $("hint").textContent = graph.kind === "breakdown"
    ? "Color = player, line style = category. Click a category below to hide it. Ctrl+Click shows only that one."
    : "Click heroes to show or hide them. Ctrl+Click shows only that hero.";
  const series = seriesFor(graph);
  drawChart(series, graph);
  drawLegend(series, graph);
}

function drawChart(series, graph) {
  const svg = $("chart");
  const W = svg.clientWidth || 1000, H = svg.clientHeight || 460;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const m = { l: 64, r: 20, t: 16, b: 34 };
  const dur = state.match.duration_s || Math.max(...series.flatMap(s => s.pts.map(p => p[0])), 60);
  let ymin = 0, ymax = 1;
  const vals = series.flatMap(s => s.pts.map(p => p[1]));
  if (vals.length) { ymax = Math.max(...vals); ymin = Math.min(0, ...vals); }
  if (graph.level && vals.length) ymin = Math.min(...vals) * 0.9;
  if (ymax === ymin) ymax = ymin + 1;
  const ticks = niceTicks(ymin, ymax, 5);
  ymin = Math.min(ymin, ticks[0]); ymax = Math.max(ymax, ticks[ticks.length - 1]);
  const X = t => m.l + (t / dur) * (W - m.l - m.r);
  const Y = v => H - m.b - ((v - ymin) / (ymax - ymin)) * (H - m.t - m.b);
  let g = "";
  for (const v of ticks) {
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#2f2b26"/>`;
    g += `<text x="${m.l - 8}" y="${Y(v) + 4}" fill="#9b9286" font-size="11" text-anchor="end">${fmtNum(v, graph)}</text>`;
  }
  for (let t = 0; t <= dur; t += 300) {
    g += `<line x1="${X(t)}" x2="${X(t)}" y1="${m.t}" y2="${H - m.b}" stroke="#24211d"/>`;
    g += `<text x="${X(t)}" y="${H - m.b + 18}" fill="#9b9286" font-size="11" text-anchor="middle">${fmtTime(t)}</text>`;
  }
  if (ymin < 0) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="#6b6358"/>`;
  if (graph.midboss) for (const mb of state.match.mid_boss || []) {
    if (!mb.destroyed_time_s) continue;
    const x = X(mb.destroyed_time_s);
    g += `<line x1="${x}" x2="${x}" y1="${m.t}" y2="${H - m.b}" stroke="#d9c7a3" stroke-dasharray="4 4" opacity="0.7"/>`;
    g += `<text x="${x + 6}" y="${m.t + 12}" fill="#d9c7a3" font-size="11">Mid Boss killed ${fmtTime(mb.destroyed_time_s)}</text>`;
  }
  for (const s of series) {
    if (!s.pts.length) continue;
    const d = s.pts.map(([t, v], i) => `${i ? "L" : "M"}${X(t).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.25" stroke-dasharray="${s.dash}" stroke-linejoin="round"/>`;
  }
  g += `<line id="hoverLine" y1="${m.t}" y2="${H - m.b}" stroke="#d9c7a3" opacity="0" />`;
  svg.innerHTML = g;

  const tip = $("tooltip"), line = svg.querySelector("#hoverLine");
  svg.onmousemove = ev => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    const times = [...new Set(series.flatMap(s => s.pts.map(p => p[0])))].sort((a, b) => a - b);
    if (!times.length) return;
    const tRaw = ((px - m.l) / (W - m.l - m.r)) * dur;
    const t = times.reduce((a, b) => (Math.abs(b - tRaw) < Math.abs(a - tRaw) ? b : a));
    line.setAttribute("x1", X(t)); line.setAttribute("x2", X(t)); line.setAttribute("opacity", 0.6);
    const rows = series.map(s => ({ s, v: valueAt(s.pts, t) })).filter(r => r.v != null).sort((a, b) => b.v - a.v);
    tip.innerHTML = `<div class="t">${fmtTime(t)}</div>` + rows.map(({ s, v }) =>
      `<div class="row"><span class="k"><span class="dot" style="background:${s.color}"></span>${esc(s.label)}</span><b>${fmtNum(v, graph)}</b></div>`).join("");
    tip.hidden = false;
    const left = ev.clientX - r.left + 16;
    tip.style.left = Math.min(left, r.width - tip.offsetWidth - 8) + "px";
    tip.style.top = (ev.clientY - r.top + 12) + "px";
  };
  svg.onmouseleave = () => { tip.hidden = true; line.setAttribute("opacity", 0); };
}

function drawLegend(series, graph) {
  const lg = $("legend");
  lg.innerHTML = "";
  if (graph.kind === "breakdown") {
    const h = hiddenFor(graph);
    lg.append(el("span", "lgLabel", "Lines"));
    graph.series.forEach((ser, i) => {
      const it = el("button", "item cat" + (h.has(i) ? " off" : ""));
      it.innerHTML = `<svg width="30" height="8"><line x1="0" x2="30" y1="4" y2="4" stroke="#ece4d6" stroke-width="2" stroke-dasharray="${DASHES[i % DASHES.length]}"/></svg>${esc(ser.label)}`;
      it.title = "Click to show or hide. Ctrl+Click shows only this line type.";
      it.onclick = ev => {
        if (ev.ctrlKey || ev.metaKey) { h.clear(); graph.series.forEach((_, j) => { if (j !== i) h.add(j); }); }
        else if (h.has(i)) h.delete(i); else h.add(i);
        render();
      };
      lg.append(it);
    });
    if (h.size) { const all = el("button", "item", "Show all"); all.onclick = () => { h.clear(); render(); }; lg.append(all); }
  }
  if (!series.length) lg.textContent = "No players selected. Click a hero above.";
  const d = series.find(s => s.diff);
  if (d) lg.append(el("span", "item", `Above zero = ${d.aName} ahead. Below zero = ${d.bName} ahead.`));
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
function fmtK(v) { return v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(Math.round(v)); }
function fmtNum(v, graph) {
  if (graph && graph.ratio) return v.toFixed(1) + "%";
  if (Math.abs(v) >= 10000) return (v / 1000).toFixed(1) + "k";
  if (Math.abs(v) < 10 && v % 1) return v.toFixed(2);
  return Math.round(v).toLocaleString();
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function setStatus(msg, err) { const s = $("status"); s.textContent = msg; s.classList.toggle("err", !!err); }

// ---------- boot ----------
buildGraphSelect();
if (params.get("graph") && GRAPHS.some(g => g.id === params.get("graph"))) { state.graph = params.get("graph"); $("graphType").value = state.graph; }
$("matchForm").onsubmit = ev => {
  ev.preventDefault();
  const id = $("matchInput").value.trim();
  if (!/^\d+$/.test(id)) return setStatus("Enter a numeric match ID.", true);
  const u = new URL(location.href); u.searchParams.set("match", id); u.searchParams.delete("players"); history.replaceState(null, "", u);
  loadMatch(id);
};
// Close: the in-game overlay listens for this title change (Panorama HTMLTitle event).
$("closeBtn").hidden = params.get("embed") !== "1";
$("closeBtn").onclick = () => { document.title = "DLC_CLOSE:" + Date.now(); };
window.addEventListener("resize", render);
const startId = params.get("match");
if (startId && /^\d+$/.test(startId)) loadMatch(startId);
else setStatus("Enter a match ID to load it.");
