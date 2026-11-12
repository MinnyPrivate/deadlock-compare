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
    { id: "barrier", cat: "team", w: 0.4, label: "Barriers on allies", role: true, get: (f) => f.teammate_barriering },
    { id: "obj", cat: "obj", w: 1.0, label: "Objective damage", get: (f) => f.boss_damage },
    { id: "lane", cat: "farm", w: 0.6, label: "Souls from troopers", get: (f) => f.gold_lane_creep },
    { id: "jungle", cat: "farm", w: 0.4, label: "Souls from neutrals", get: (f) => f.gold_neutral_creep },
    { id: "denies", cat: "farm", w: 0.2, label: "Denies", get: (f) => f.denies },
    { id: "deaths", cat: "surv", w: 1.0, label: "Deaths", say: "staying alive", get: (f) => f.deaths, low: true },
    { id: "taken", cat: "surv", w: 0.4, label: "Damage taken (tanking)", say: "tanking damage", get: (f) => f.player_damage_taken },
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
const MVP_MODES = {
  impact: { name: "Impact", sub: "15 stats, weighted toward what wins fights and games" },
  raw: { name: "Raw", sub: "The scoreboard: every stat counts the same" },
};

function mvpScores(mode) {
  const defs = MVP_STATS[mode];
  const rows = state.players.map(p => {
    const st = p.stats;
    const f = st[st.length - 1] || {};
    const e = st.filter(s => s.time_stamp_s <= EARLY_S).pop() || {};
    return { p, vals: defs.map(d => Math.max(0, Number(d.get(f, e)) || 0)) };
  });
  // Lobby range per stat. A stat nobody has (all zero, or all equal for deaths) is left out for everyone.
  const used = defs.map((d, i) => {
    const vs = rows.map(r => r.vals[i]);
    const max = Math.max(...vs), min = Math.min(...vs);
    const best = rows[vs.indexOf(d.low ? min : max)].p;
    return { d, i, max, min, best, on: d.low ? max > min : max > 0 };
  });
  const wSum = used.filter(u => u.on).reduce((a, u) => a + u.d.w, 0) || 1;
  for (const r of rows) {
    r.parts = used.map(u => {
      const v = r.vals[u.i];
      const n = !u.on ? 0 : u.d.low ? (u.max - v) / (u.max - u.min) : v / u.max;
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
      <span class="who"><span class="hn">${esc(heroName(p))}</span>${rankHtml(p.badge) || `<span class="rank none">Unranked</span>`}</span>
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
  const strong = parts.filter(x => x.n >= 0.75).sort((a, b) => b.pts - a.pts).slice(0, 3);
  const weak = parts.filter(x => !x.def.role && x.maxPts >= 4 && x.n < 0.35).sort((a, b) => (b.maxPts - b.pts) - (a.maxPts - a.pts)).slice(0, 2);
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
        <div class="meta"><span style="color:${T.c}">${T.color}</span> · ${won ? "Won" : "Lost"} · ${p.lane && LANES_BY_COLOR[p.lane] ? LANES_BY_COLOR[p.lane] + " lane" : "No lane"}</div>
        ${rankHtml(p.badge) || `<span class="rank none">Unranked</span>`}
      </div>
      <div class="whyScore"><b>${Math.round(pick.score)}</b><span>${ordinal(pick.place)} of ${rows.length}</span></div>
    </div>
    <p class="summary">${esc(summary)}${valveLine ? `<br><span class="vl">${esc(valveLine)}</span>` : ""}</p>
    <div class="whyTable">
      <div class="wr th"><span>Stat</span><span class="r">Value</span><span class="r">Lobby best</span><span>Points</span></div>`;
  for (const x of pick.parts) {
    const c = MVP_CATS[x.def.cat].c;
    const isBest = x.on && x.v === x.bestV;
    h += `<div class="wr${x.on ? "" : " off"}" title="${x.on ? `Weight ${x.def.w}. Worth up to ${x.maxPts.toFixed(1)} points.` : "Nobody in this match had any, so it doesn't count."}">
      <span class="sn"><b style="background:${c}"></b>${esc(x.def.label)}</span>
      <span class="r v${isBest ? " best" : ""}">${fmtStat(x.v)}</span>
      <span class="r lb">${x.on ? `${fmtStat(x.bestV)}${portrait(x.best, "mini")}` : "–"}</span>
      <span class="pb"><span class="track" style="width:${(x.maxPts / maxOf(pick.parts)) * 100}%"><i style="width:${x.maxPts ? (x.pts / x.maxPts) * 100 : 0}%;background:${c}"></i></span><em>${x.on ? x.pts.toFixed(1) : ""}</em></span>
    </div>`;
  }
  h += `</div><div class="whyFoot">${mode === "impact" ? "Deaths count in reverse: fewest deaths in the match gets full points." : "Raw counts each scoreboard stat the same. Deaths count in reverse."} Crowd control isn't in Valve's match data, so it can't be scored.</div></div>`;

  view.innerHTML = h;
  view.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { state.mvpMode = b.dataset.mode; renderAll(); });
  view.querySelectorAll(".mvpRow").forEach(b => b.onclick = () => { state.mvpPick = Number(b.dataset.slot); renderAll(); });
};

const LANES_BY_COLOR = { 1: "Yellow", 3: "Green", 4: "Blue", 6: "Green" };
function maxOf(parts) { return Math.max(...parts.map(x => x.maxPts), 1); }
function listJoin(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
function sayOf(x) { return x.def.say || x.def.label.toLowerCase(); }
