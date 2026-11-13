"use strict";
// Lane Stats: Valve's lane screen (the two heroes of each team in one lane, side by side at a point in time, and when
// that lane's objectives fell), plus extra "who threw lane" stats, a verdict and the lane's soul lead over time.
// Everything comes from the per-hero stats snapshots (every 3 minutes) and the objectives list.

const LANE_TIMES = [360, 540, 720]; // 6:00, 9:00 (Valve's), 12:00; "end" = the last snapshot before the lane's first Guardian fell
const LANE_IDS = { Yellow: [1, 5, 12], Green: [2, 6, 13, 4, 8, 15], Blue: [3, 7, 14] }; // objective ids per lane color (Tier 1, Tier 2, Base)

// sum: the two heroes added, split by hero. avg: one number per side (rates, levels). low: lower is better.
const LANE_ROWS = [
  { label: "Kills", get: s => s.kills },
  { label: "Souls", get: s => s.net_worth },
  { label: "Last Hits", get: s => s.creep_kills, tip: "Lane troopers killed" },
  { label: "Denies", get: s => s.denies },
  { label: "Player Damage", get: s => s.player_damage },
];
const THREW_ROWS = [
  { label: "Deaths", get: s => s.deaths, low: true },
  { label: "Souls Lost to Deaths", get: s => s.gold_death_loss, low: true, tip: "Souls dropped when they died" },
  { label: "Last Hit Rate", rate: s => [s.creep_kills, s.possible_creeps], tip: "Troopers they killed, out of the troopers that died near them" },
  { label: "Damage Taken", get: s => s.player_damage_taken, low: true, tip: "From enemy heroes" },
  { label: "Healing", get: s => s.player_healing },
  { label: "Accuracy", rate: s => [s.shots_hit, (s.shots_hit || 0) + (s.shots_missed || 0)], tip: "All targets, troopers included" },
  { label: "Level", avg: s => s.level },
];

const laneName = p => (typeof LANES_BY_COLOR !== "undefined" && LANES_BY_COLOR[p.lane]) || null;
function laneList() {
  const seen = [];
  for (const p of [...state.players].sort((a, b) => a.lane - b.lane)) { const n = laneName(p); if (n && !seen.includes(n)) seen.push(n); }
  return seen;
}
function laneNow() {
  const lanes = laneList();
  if (state.laneOf && lanes.includes(state.laneOf)) return state.laneOf;
  return (state.me && laneName(state.me)) || lanes[0] || null;
}
// A hero's snapshot at time t: the last one at or before it.
function snapAt(p, t) { let best = null; for (const s of p.stats) if (s.time_stamp_s <= t && (!best || s.time_stamp_s > best.time_stamp_s)) best = s; return best; }

// When each team's own Tier 1, Tier 2 and Base Guardians in this lane fell (null: never).
function laneObjectives(lane) {
  const ids = LANE_IDS[lane] || [];
  const out = [["Tier 1", 0], ["Tier 2", 1], ["Base Guardians", 2]].map(([label, k]) => ({ label, t: { 0: null, 1: null } }));
  for (const o of state.match.objectives || []) {
    const i = ids.indexOf(o.team_objective_id);
    if (i < 0 || !o.destroyed_time_s) continue;
    const row = out[i % 3], tm = Number(o.team) === 1 ? 1 : 0;
    if (row.t[tm] == null || o.destroyed_time_s < row.t[tm]) row.t[tm] = o.destroyed_time_s;
  }
  return out;
}
function laneEndTime(lane) {
  const t1 = laneObjectives(lane)[0].t, ts = [t1[0], t1[1]].filter(x => x != null);
  return ts.length ? Math.min(...ts) : null;
}
// The snapshot time the screen shows: a fixed time, or the last snapshot before the lane's first Guardian fell.
function laneSnapTime(lane) {
  const times = [...new Set(state.players.flatMap(p => p.stats.map(s => s.time_stamp_s)))].sort((a, b) => a - b);
  if (state.laneTime !== "end") return state.laneTime;
  const end = laneEndTime(lane);
  if (end == null) return 540;
  return times.filter(t => t <= end).pop() || times[0];
}

function sideOf(lane, team) { return state.players.filter(p => p.team === team && laneName(p) === lane); }

// One row's numbers for both sides: total and each hero's part (for sum rows), or one value per side.
function rowVals(row, sides, t) {
  return sides.map(ps => {
    const snaps = ps.map(p => snapAt(p, t));
    const parts = ps.map((p, i) => {
      const s = snaps[i];
      if (!s) return { p, v: 0 };
      if (row.rate) { const [a, b] = row.rate(s); return { p, v: b ? (100 * (a || 0)) / b : 0, a: a || 0, b: b || 0 }; }
      if (row.avg) return { p, v: Number(row.avg(s)) || 0 };
      return { p, v: Number(row.get(s)) || 0 };
    });
    let total;
    if (row.rate) { const a = parts.reduce((x, q) => x + q.a, 0), b = parts.reduce((x, q) => x + q.b, 0); total = b ? (100 * a) / b : 0; }
    else if (row.avg) total = parts.length ? parts.reduce((x, q) => x + q.v, 0) / parts.length : 0;
    else total = parts.reduce((x, q) => x + q.v, 0);
    return { total, parts };
  });
}
const laneFmt = (row, v) => row.rate ? v.toFixed(0) + "%" : row.avg ? (Math.round(v * 10) / 10).toString() : Math.round(v).toLocaleString("en-US");

// A split bar like Valve's: left team's share on the left, right team's on the right. In a sum row each side is
// cut into its two heroes; hovering a hero lights up their part and adds their own number next to the total.
function barHtml(row, vals, teams) {
  const [L, R] = vals, sum = L.total + R.total;
  const fr = sum > 0 ? L.total / sum : 0.5;
  const hov = state.laneHover;
  const side = (v, team, w, right) => {
    const T = TEAMS[team];
    let segs;
    const split = !row.rate && !row.avg && v.total > 0 && v.parts.length > 1;
    if (split) {
      // the hovered hero sits at the outer end, like the game's
      const parts = v.parts.slice().sort((a, b) => (b.p.slot === hov) - (a.p.slot === hov));
      segs = parts.map(q => `<i class="${hov == null ? "" : q.p.slot === hov ? "hi" : "lo"}" style="width:${(q.v / v.total) * 100}%" title="${esc(q.p.hero)}: ${laneFmt(row, q.v)}"></i>`);
      if (right) segs.reverse();
    } else {
      const lit = hov != null && v.parts.some(q => q.p.slot === hov);
      segs = [`<i class="${hov == null ? "" : lit ? "hi" : "lo"}" style="width:100%"></i>`];
    }
    const mine = hov != null && v.parts.find(q => q.p.slot === hov);
    const num = `<span class="lvNum${right ? " r" : ""}">${laneFmt(row, v.total)}${mine ? ` <small>(${laneFmt(row, mine.v)})</small>` : ""}</span>`;
    return `<span class="lvSide${right ? " r" : ""}" style="width:${w * 100}%;--tc:${T.c};--tcHi:${team ? "#7FA6F2" : "#FFB02E"};--tcLo:${team ? "#34508A" : "#8E5807"}">${segs.join("")}</span>${num}`;
  };
  return `<div class="lvBar"${row.tip ? ` title="${esc(row.tip)}${row.low ? " (lower is better)" : ""}"` : row.low ? ` title="Lower is better"` : ""}>` +
    side(L, teams[0], fr, false) + side(R, teams[1], 1 - fr, true) + `<span class="lvLab">${esc(row.label)}</span></div>`;
}
function objBarHtml(o, teams) {
  const dur = state.match.duration_s || 1;
  const [a, b] = teams.map(tm => o.t[tm]);
  // Held longer = more of the bar. A side that never lost it gets the whole bar, like the game's.
  let fr = 0.5;
  if (a == null && b != null) fr = 1; else if (b == null && a != null) fr = 0;
  else if (a != null && b != null) fr = a / (a + b);
  const side = (t, team, w, right) => `<span class="lvSide${right ? " r" : ""}" style="width:${w * 100}%;--tc:${TEAMS[team].c}"><i style="width:100%"></i></span><span class="lvNum${right ? " r" : ""}">${t == null ? "--" : fmtTime(t)}</span>`;
  return `<div class="lvBar" title="When each team's own ${esc(o.label)} in this lane fell (-- means it never did, out of ${fmtTime(dur)})">` +
    side(a, teams[0], fr, false) + side(b, teams[1], 1 - fr, true) + `<span class="lvLab">${esc(o.label)}</span></div>`;
}
function picsHtml(ps) {
  return ps.map(p => `<button class="lvPic${state.laneHover === p.slot ? " hi" : ""}" data-slot="${p.slot}" style="--tc:${TEAMS[p.team].c};--coin:${TEAMS[p.team].coin}" title="${esc(heroName(p))}"><img src="${p.img}" alt=""><span>${esc(heroName(p))}</span></button>`).join("");
}

// Who threw: on the side behind on souls, the hero with the most deaths (then fewest souls). Who won it: the top
// earner on the side ahead. Within 5% on souls the lane counts as even.
function verdictHtml(lane, sides, t) {
  const at = p => snapAt(p, t) || {};
  const souls = ps => ps.reduce((x, p) => x + (at(p).net_worth || 0), 0);
  const [sl, sr] = sides.map(souls);
  if (!sides[0].length || !sides[1].length) return "";
  const gap = Math.abs(sl - sr) / Math.max(1, sl, sr);
  const all = sides.flat(), laneSouls = sl + sr;
  const line = p => {
    const s = at(p), sh = laneSouls ? Math.round((100 * (s.net_worth || 0)) / laneSouls) : 0;
    return `${s.deaths || 0} death${s.deaths === 1 ? "" : "s"}, ${(s.gold_death_loss || 0).toLocaleString("en-US")} souls lost, ${(s.net_worth || 0).toLocaleString("en-US")} souls (${sh}% of the lane)`;
  };
  const card = (p, tag, cls) => `<div class="lvVerdict ${cls}" style="--tc:${TEAMS[p.team].c}"><span class="face"><img src="${p.img}" alt=""></span><div><div class="tag">${tag}</div><div class="who">${esc(heroName(p))}</div><div class="why">${line(p)}</div></div></div>`;
  let h = `<h3>Who threw lane?</h3>`;
  if (gap < 0.05) {
    const worst = all.slice().sort((a, b) => (at(b).deaths || 0) - (at(a).deaths || 0) || (at(a).net_worth || 0) - (at(b).net_worth || 0))[0];
    h += `<div class="lvEven">Even lane: the two sides were within ${Math.max(1, Math.round(gap * 100))}% on souls.</div>`;
    if (worst && (at(worst).deaths || 0) > 0) h += card(worst, "Most deaths", "threw");
    return h;
  }
  const lose = sl < sr ? sides[0] : sides[1], win = sl < sr ? sides[1] : sides[0];
  const threw = lose.slice().sort((a, b) => (at(b).deaths || 0) - (at(a).deaths || 0) || (at(a).net_worth || 0) - (at(b).net_worth || 0))[0];
  const carry = win.slice().sort((a, b) => (at(b).net_worth || 0) - (at(a).net_worth || 0) || (at(b).kills || 0) - (at(a).kills || 0))[0];
  h += `<div class="lvEven">${esc(TEAMS[win[0].team].name)} won this lane by ${Math.abs(sl - sr).toLocaleString("en-US")} souls (${Math.round(gap * 100)}%).</div>`;
  h += card(threw, "Threw lane", "threw") + card(carry, "Won lane", "won");
  return h;
}
// The lane's soul lead: left pair minus right pair at every snapshot up to 15:00, with the shown time marked.
function leadChartHtml(lane, sides, t) {
  const times = [0, ...new Set(state.players.flatMap(p => p.stats.map(s => s.time_stamp_s)))].filter(x => x <= Math.max(900, t)).sort((a, b) => a - b);
  const souls = (ps, x) => ps.reduce((a, p) => a + ((((x && snapAt(p, x)) || {}).net_worth) || 0), 0);
  const pts = times.map(x => [x, x ? souls(sides[0], x) - souls(sides[1], x) : 0]);
  const W = 560, H = 190, m = { l: 8, r: 8, t: 12, b: 26 };
  const tmax = times[times.length - 1] || 1, vmax = Math.max(500, ...pts.map(p => Math.abs(p[1])));
  const X = x => m.l + (x / tmax) * (W - m.l - m.r), Y = v => m.t + (1 - (v + vmax) / (2 * vmax)) * (H - m.t - m.b);
  const y0 = Y(0), d = pts.map(([x, v], i) => `${i ? "L" : "M"}${X(x).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
  const area = `${d}L${X(tmax).toFixed(1)} ${y0}L${X(0)} ${y0}Z`;
  const cL = TEAMS[state.leftTeam].c, cR = TEAMS[1 - state.leftTeam].c;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="lvLead"><defs><clipPath id="lvUp"><rect x="0" y="0" width="${W}" height="${y0}"/></clipPath><clipPath id="lvDn"><rect x="0" y="${y0}" width="${W}" height="${H}"/></clipPath></defs>`;
  s += `<path d="${area}" fill="${cL}" fill-opacity="0.3" clip-path="url(#lvUp)"/><path d="${area}" fill="${cR}" fill-opacity="0.3" clip-path="url(#lvDn)"/>`;
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y0}" y2="${y0}" stroke="#fff" stroke-opacity="0.25"/>`;
  s += `<path d="${d}" fill="none" stroke="#FFEFD7" stroke-width="2.4" stroke-linejoin="round"/>`;
  s += `<line x1="${X(t)}" x2="${X(t)}" y1="${m.t}" y2="${H - m.b}" stroke="#FFEFD7" stroke-opacity="0.5" stroke-dasharray="3 4"/>`;
  for (let x = 0; x <= tmax; x += 180) s += `<text x="${X(x)}" y="${H - 6}" text-anchor="${x === 0 ? "start" : x >= tmax ? "end" : "middle"}">${fmtTime(x)}</text>`;
  s += `<text x="${m.l + 4}" y="${m.t + 12}" style="fill:${cL}" class="lvAhead">${esc(TEAMS[state.leftTeam].name)} ahead</text><text x="${m.l + 4}" y="${H - m.b - 6}" style="fill:${cR}" class="lvAhead">${esc(TEAMS[1 - state.leftTeam].name)} ahead</text>`;
  return `<h3>Lane soul lead</h3>` + s + `</svg>`;
}

window.renderLanes = function renderLanes() {
  const view = $("laneView");
  const lane = laneNow();
  if (!lane) { view.innerHTML = `<div class="empty">Valve didn't send lane assignments for this match.</div>`; return; }
  const teams = [state.leftTeam, 1 - state.leftTeam];
  const sides = teams.map(tm => sideOf(lane, tm));
  const t = laneSnapTime(lane);
  const end = laneEndTime(lane);
  const vals = LANE_ROWS.map(r => [r, rowVals(r, sides, t)]);
  const extra = THREW_ROWS.map(r => [r, rowVals(r, sides, t)]);
  const title = state.laneTime === "end" && end != null ? `Stats at ${fmtTime(t)} <small>(Guardian fell ${fmtTime(end)})</small>` : `Stats at ${fmtTime(t)}`;
  view.style.setProperty("--tcL", TEAMS[teams[0]].c); view.style.setProperty("--tcR", TEAMS[teams[1]].c);
  view.innerHTML =
    `<div class="lvZone lvL">${verdictHtml(lane, sides, t)}${leadChartHtml(lane, sides, t)}</div>` +
    `<div class="lvZone lvM"><div class="lvPics">${picsHtml(sides[0])}</div><div class="lvCol"><h2>${title}</h2>${vals.map(([r, v]) => barHtml(r, v, teams)).join("")}` +
    `<h2>Objectives</h2>${laneObjectives(lane).map(o => objBarHtml(o, teams)).join("")}</div><div class="lvPics">${picsHtml(sides[1])}</div></div>` +
    `<div class="lvZone lvR"><h3>Who threw stats</h3>${extra.map(([r, v]) => barHtml(r, v, teams)).join("")}<div class="lvFoot">Hover a hero to see their part. Valve's numbers come every 3 minutes.</div></div>`;
  view.querySelectorAll(".lvPic").forEach(b => {
    const slot = Number(b.dataset.slot);
    // Redrawing replaces the portrait under the mouse, so only redraw when the hovered hero actually changes.
    b.onmouseenter = () => { if (state.laneHover !== slot) { state.laneHover = slot; renderLanes(); } };
    b.onmouseleave = () => { if (state.laneHover === slot) { state.laneHover = null; renderLanes(); } };
  });
};

// Lane and time pickers in the options row.
window.renderLaneOptions = function renderLaneOptions() {
  const lane = laneNow();
  const lb = $("optLane");
  lb.innerHTML = `<span class="optionLabel">Lane:</span>`;
  for (const n of laneList()) {
    const b = el("button", "graphOptionButton" + (n === lane ? " on" : ""), n);
    b.onclick = () => { state.laneOf = n; state.laneHover = null; renderAll(); };
    lb.append(b);
  }
  const tb = $("optLaneTime");
  tb.innerHTML = `<span class="optionLabel">Stats at:</span>`;
  for (const v of [...LANE_TIMES, "end"]) {
    const b = el("button", "graphOptionButton" + (state.laneTime === v ? " on" : ""), v === "end" ? "Lane End" : fmtTime(v));
    if (v === "end") { b.title = "The last snapshot before this lane's first Guardian fell"; b.disabled = laneEndTime(lane) == null; }
    b.onclick = () => { state.laneTime = v; renderAll(); };
    tb.append(b);
  }
};
