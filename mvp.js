"use strict";
// MVP tab: our own lobby-relative scores (Impact and Raw), a 1-12 list and a "why" panel.
// Every stat is scaled against the best value in this lobby (best = 1.0), so scores only compare players in the same match.
// Deaths count the other way: fewest deaths = 1.0, most deaths = 0.

const MVP_CATS = {
  fight: { name: "Fighting", c: "#E8604C" },
  team: { name: "Teamwork", c: "#58D86A" },
  obj: { name: "Objectives", c: "#FFD23F" },
  farm: { name: "Farming", c: "#3FCBFF" },
  surv: { name: "Survival", c: "#A99BFF" },
};
const EARLY_S = 900; // stats up to the 15:00 snapshot count as "early"
const SPLIT_MIN_S = 1200; // only split early and late in games of 20:00 or longer, so "late" is at least 5 minutes

// get(p) returns the stat for player p. f = final snapshot, e = the 15:00 snapshot.
const MVP_STATS = {
  impact: [
    { id: "kills", cat: "fight", w: 1.0, label: "Kills", get: (f) => f.kills },
    { id: "dmgE", cat: "fight", w: 0.7, label: "Hero damage before 15:00", get: (f, e) => e.player_damage },
    { id: "dmgL", cat: "fight", w: 1.0, label: "Hero damage after 15:00", get: (f, e) => f.player_damage - e.player_damage },
    { id: "antiheal", cat: "fight", w: 0.3, label: "Healing prevented", role: true, get: (f) => f.heal_prevented },
    { id: "astE", cat: "team", w: 0.6, label: "Assists before 15:00", get: (f, e) => e.assists },
    { id: "astL", cat: "team", w: 0.8, label: "Assists after 15:00", get: (f, e) => f.assists - e.assists },
    { id: "heal", cat: "team", w: 0.6, label: "Healing on allies", role: true, get: (f) => f.teammate_healing },
    { id: "barrier", cat: "team", w: 0.4, label: "Barriers given", role: true, get: (f) => f.player_barriering },
    { id: "obj", cat: "obj", w: 1.0, label: "Objective damage", get: (f) => f.boss_damage },
    { id: "lane", cat: "farm", w: 0.6, label: "Souls from troopers", get: (f) => (f.gold_lane_creep || 0) + (f.gold_lane_creep_orbs || 0) },
    { id: "jungle", cat: "farm", w: 0.4, label: "Souls from neutrals", get: (f) => (f.gold_neutral_creep || 0) + (f.gold_neutral_creep_orbs || 0) },
    { id: "denies", cat: "farm", w: 0.2, label: "Denies", get: (f) => f.denies },
    { id: "deaths", cat: "surv", w: 1.0, label: "Deaths", say: "staying alive", get: (f) => f.deaths, low: true },
    { id: "taken", cat: "surv", w: 0.4, label: "Damage taken per death", say: "soaking damage without dying", get: (f) => (f.player_damage_taken || 0) / Math.max(1, f.deaths || 0) },
    { id: "mitig", cat: "surv", w: 0.4, label: "Damage mitigated", get: (f) => f.damage_mitigated },
  ],
  raw: [
    { id: "kills", cat: "fight", w: 1, label: "Kills", get: (f) => f.kills },
    { id: "deaths", cat: "surv", w: 1, label: "Deaths", say: "staying alive", get: (f) => f.deaths, low: true },
    { id: "assists", cat: "team", w: 1, label: "Assists", get: (f) => f.assists },
    { id: "dmg", cat: "fight", w: 1, label: "Hero damage", get: (f) => f.player_damage },
    { id: "obj", cat: "obj", w: 1, label: "Objective damage", get: (f) => f.boss_damage },
    { id: "souls", cat: "farm", w: 1, label: "Souls", get: (f) => f.net_worth },
    { id: "heal", cat: "team", w: 1, label: "Healing on allies", role: true, get: (f) => f.teammate_healing },
  ],
};
// Used instead of the early/late pairs when the game is too short to split.
const MVP_MERGED = [
  { id: "dmg", cat: "fight", w: 1.7, label: "Hero damage", get: (f) => f.player_damage },
  { id: "ast", cat: "team", w: 1.4, label: "Assists", get: (f) => f.assists },
];
const SURV_IDS = new Set(["deaths", "taken", "mitig"]);
const MVP_MODES = {
  impact: { name: "Impact", sub: "15 stats, weighted toward what wins fights and games" },
  raw: { name: "Raw", sub: "The scoreboard: every stat counts the same" },
};

function mvpSplit() {
  if ((state.match.duration_s || 0) < SPLIT_MIN_S) return false;
  return state.players.every(p => p.stats.some(s => s.time_stamp_s === EARLY_S));
}
function mvpDefs(mode) {
  const defs = MVP_STATS[mode];
  if (mode !== "impact" || mvpSplit()) return defs;
  const out = [];
  for (const d of defs) {
    if (d.id === "dmgE") out.push(MVP_MERGED[0]);
    else if (d.id === "astE") out.push(MVP_MERGED[1]);
    else if (d.id !== "dmgL" && d.id !== "astL") out.push(d);
  }
  return out;
}
function mvpScores(mode) {
  const defs = mvpDefs(mode);
  const rows = state.players.map(p => {
    const st = p.stats;
    // Kills, deaths and assists from the scoreboard: the last stats snapshot can be a few seconds early.
    const r = p.raw || {};
    const f = Object.assign({}, st[st.length - 1] || {}, { kills: r.kills ?? 0, deaths: r.deaths ?? 0, assists: r.assists ?? 0 });
    const e = st.find(s => s.time_stamp_s === EARLY_S) || {};
    return { p, vals: defs.map(d => Math.max(0, Number(d.get(f, e)) || 0)) };
  });
  // Lobby range per stat, from players who stayed. A stat nobody has (all zero, or all equal for deaths) is left out for everyone.
  const stayed = rows.filter(r => !r.p.left);
  const pool = stayed.length ? stayed : rows;
  const used = defs.map((d, i) => {
    const vs = pool.map(r => r.vals[i]);
    const max = Math.max(...vs), min = Math.min(...vs);
    const best = pool[vs.indexOf(d.low ? min : max)].p;
    return { d, i, max, min, best, on: d.low ? max > min : max > 0 };
  });
  const wSum = used.filter(u => u.on).reduce((a, u) => a + u.d.w, 0) || 1;
  for (const r of rows) {
    r.parts = used.map(u => {
      const v = r.vals[u.i];
      let n = !u.on ? 0 : u.d.low ? (u.max - v) / (u.max - u.min) : v / u.max;
      n = Math.max(0, Math.min(1, n));
      if (r.p.left && SURV_IDS.has(u.d.id)) n = 0; // leaving the match is not "staying alive"
      return { def: u.d, v, n, pts: u.on ? (u.d.w * n * 100) / wSum : 0, maxPts: u.on ? (u.d.w * 100) / wSum : 0, best: u.best, bestV: u.d.low ? u.min : u.max, on: u.on };
    });
    r.score = r.parts.reduce((a, x) => a + x.pts, 0);
    r.cats = {};
    for (const x of r.parts) r.cats[x.def.cat] = (r.cats[x.def.cat] || 0) + x.pts;
  }
  rows.sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => { r.place = i + 1; });
  return rows;
}

function fmtStat(v) {
  v = Math.round(v);
  if (v >= 10000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return v.toLocaleString("en-US");
}
function ordinal(n) { return n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"); }
function valveLabel(p) { return p.mvp === 1 ? "MVP" : p.mvp > 1 ? "Key Player" : ""; }
function heroName(p) { return p.hero + (state.me && state.me.slot === p.slot ? " (You)" : ""); }
function portrait(p, cls) {
  const T = TEAMS[p.team];
  return `<span class="${cls}" style="--coin:${T.coin};--tc:${T.c}"><img src="${p.img}" alt="" onerror="this.remove()"></span>`;
}
function catBar(r, scale) {
  return `<div class="catBar">` + Object.keys(MVP_CATS).map(k => {
    const w = ((r.cats[k] || 0) / scale) * 100;
    return w > 0 ? `<i style="width:${w}%;background:${MVP_CATS[k].c}" title="${MVP_CATS[k].name}: ${Math.round(r.cats[k])} pts"></i>` : "";
  }).join("") + `</div>`;
}

window.renderMvp = function renderMvp() {
  const view = $("mvpView");
  const mode = state.mvpMode;
  const rows = mvpScores(mode);
  if (!rows.length) { view.innerHTML = `<div class="empty">No players in this match.</div>`; return; }
  if (state.mvpPick == null || !rows.some(r => r.p.slot === state.mvpPick)) { state.mvpPick = (state.me || rows[0].p).slot; renderTop(); }
  const pick = rows.find(r => r.p.slot === state.mvpPick);
  const top = rows[0].score || 1;

  // ---- header: score mode + legend ----
  let h = `<div class="mvpHead">
    <div class="graphOption"><span class="optionLabel">Score:</span>${Object.keys(MVP_MODES).map(m =>
      `<button class="graphOptionButton${m === mode ? " on" : ""}" data-mode="${m}">${MVP_MODES[m].name}</button>`).join("")}</div>
    <span class="mvpSub">${esc(MVP_MODES[mode].sub)}. Scored against the best player in this match on each stat.</span>
    <div class="legend">${Object.values(MVP_CATS).map(c => `<span><b style="background:${c.c}"></b>${c.name}</span>`).join("")}</div>
  </div>`;

  // ---- left: ranked list ----
  h += `<div class="mvpList">`;
  for (const r of rows) {
    const p = r.p, T = TEAMS[p.team];
    const v = valveLabel(p);
    h += `<button class="mvpRow${p.slot === state.mvpPick ? " on" : ""}" data-slot="${p.slot}" style="--tc:${T.c}">
      <span class="place">${r.place}</span>
      ${portrait(p, "pt")}
      <span class="who"><span class="hn">${esc(heroName(p))}${p.left ? ` <span class="leftTag" title="Left the match at ${fmtTime(p.left)}">LEFT</span>` : ""}</span>${rankHtml(p.badge) || `<span class="rank none">Unranked</span>`}</span>
      ${catBar(r, top)}
      <span class="score">${Math.round(r.score)}</span>
      <span class="valve">${v ? `<span class="badge${p.mvp > 1 ? " key" : ""}" title="Valve's pick">${p.mvp === 1 ? "MVP" : "KEY"}</span>` : ""}</span>
    </button>`;
  }
  h += `</div>`;

  // ---- right: why panel ----
  const p = pick.p, T = TEAMS[p.team];
  const won = state.match.winning_team === p.team;
  const parts = pick.parts.filter(x => x.on);
  // Compact view: the 3 stats that earned the most points, then the 2 that lost the most. "Show all stats" opens the full table.
  const onParts = parts;
  const topParts = onParts.slice().sort((a, b) => b.pts - a.pts).slice(0, 3);
  const lostParts = onParts.filter(x => !x.def.role && !topParts.includes(x)).sort((a, b) => (b.maxPts - b.pts) - (a.maxPts - a.pts)).slice(0, 2);
  // The summary names the same stats the compact table shows.
  const strong = topParts.filter(x => x.n >= 0.5);
  const weak = lostParts.filter(x => x.n < 0.6);
  const valveTop = rows.find(r => r.p.mvp === 1);
  let summary = `${ordinal(pick.place)} of ${rows.length} with ${Math.round(pick.score)} points`;
  summary += strong.length ? `, carried by ${listJoin(strong.map(sayOf))}.` : ".";
  if (weak.length) summary += ` Lost the most ground on ${listJoin(weak.map(sayOf))}.`;
  let valveLine = "";
  if (p.mvp === 1) valveLine = pick.place === 1 ? "Valve also named them MVP." : `Valve named them MVP; our ${MVP_MODES[mode].name} score puts them ${ordinal(pick.place)}.`;
  else if (p.mvp > 1) valveLine = `Valve named them a Key Player; our score puts them ${ordinal(pick.place)}.`;
  else if (valveTop && pick.place === 1) valveLine = `Valve's MVP was ${valveTop.p.hero} (our ${ordinal(valveTop.place)}).`;

  h += `<div class="mvpWhy" style="--tc:${T.c}">
    <div class="whyHead">
      ${portrait(p, "big")}
      <div class="whyName">
        <div class="hn">${esc(heroName(p))}</div>
        <div class="meta"><span style="color:${T.c}">${T.color}</span> · ${won ? "Won" : "Lost"} · ${p.lane && LANES_BY_COLOR[p.lane] ? LANES_BY_COLOR[p.lane] + " lane" : "No lane"}${p.left ? ` · <span class="leftTag">Left at ${fmtTime(p.left)}</span>` : ""}</div>
        ${rankHtml(p.badge) || `<span class="rank none">Unranked</span>`}
      </div>
      <div class="whyScore"><b>${Math.round(pick.score)}</b><span>${ordinal(pick.place)} of ${rows.length}</span></div>
    </div>
    <p class="summary">${esc(summary)}${valveLine ? `<br><span class="vl">${esc(valveLine)}</span>` : ""}</p>
    <div class="whyTable${state.mvpAll ? "" : " compact"}">
      <div class="wr th"><span>${state.mvpAll ? "Stat" : "Best at"}</span><span class="r">Value</span><span class="r">Lobby best</span><span>Points</span></div>`;
  const shown = state.mvpAll ? pick.parts : [...topParts, "lost", ...lostParts];
  for (const x of shown) {
    if (x === "lost") { h += `<div class="wr th sec"><span>Lost the most on</span><span></span><span></span><span></span></div>`; continue; }
    const c = MVP_CATS[x.def.cat].c;
    const isBest = x.on && x.v === x.bestV;
    h += `<div class="wr${x.on ? "" : " off"}" title="${x.on ? `Weight ${x.def.w}. Worth up to ${x.maxPts.toFixed(1)} points.` : "Nobody in this match had any, so it doesn't count."}">
      <span class="sn"><b style="background:${c}"></b>${esc(x.def.label)}</span>
      <span class="r v${isBest ? " best" : ""}">${fmtStat(x.v)}</span>
      <span class="r lb">${x.on ? `${fmtStat(x.bestV)}${portrait(x.best, "mini")}` : "–"}</span>
      <span class="pb"><span class="track" style="width:${(x.maxPts / maxOf(pick.parts)) * 100}%"><i style="width:${x.maxPts ? (x.pts / x.maxPts) * 100 : 0}%;background:${c}"></i></span><em>${x.on ? x.pts.toFixed(1) : ""}</em></span>
    </div>`;
  }
  h += `</div><button class="graphOptionButton allBtn" id="mvpAll">${state.mvpAll ? "Show fewer" : `Show all stats (${pick.parts.length})`}</button><div class="whyFoot">${mode === "impact" ? `Deaths count in reverse: fewest deaths in the match gets full points.${mvpSplit() ? "" : " This game was too short to split early and late, so damage and assists count once."}` : "Raw counts each scoreboard stat the same. Deaths count in reverse."} Crowd control isn't in Valve's match data, so it can't be scored.</div></div>`;

  view.innerHTML = h;
  view.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { state.mvpMode = b.dataset.mode; renderAll(); });
  $("mvpAll").onclick = () => { state.mvpAll = !state.mvpAll; renderAll(); };
  view.querySelectorAll(".mvpRow").forEach(b => b.onclick = () => { state.mvpPick = Number(b.dataset.slot); renderAll(); });
};

const LANES_BY_COLOR = { 1: "Yellow", 3: "Green", 4: "Blue", 6: "Green" };
function maxOf(parts) { return Math.max(...parts.map(x => x.maxPts), 1); }
function listJoin(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
function sayOf(x) { return x.def.say || x.def.label.toLowerCase(); }
