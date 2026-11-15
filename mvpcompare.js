"use strict";
// MVP side-by-side compare (MOCKUP). Pin up to 4 players in the MVP list and compare them.
// Three layouts for Zachary to pick from, switched with ?cmp=A|B|C (default A):
//   A: columns in the right panel, one per pinned player, one row per stat.
//   B: head-to-head for exactly 2 players, mirrored bars like Matchups.
//   C: its own full-width view, one card per player side by side.

const CMP_MAX = 4;
state.mvpPins = (params.get("pins") || "").split(",").filter(x => /^\d+$/.test(x)).map(Number);
state.cmpLayout = /^[ABC]$/.test(params.get("cmp") || "") ? params.get("cmp") : "A";

function cmpPlayers() {
  return state.mvpPins.map(s => state.players.find(p => p.slot === s)).filter(Boolean);
}
window.cmpToggle = cmpToggle;
function cmpToggle(slot) {
  const i = state.mvpPins.indexOf(slot);
  if (i >= 0) state.mvpPins.splice(i, 1);
  else {
    const max = state.cmpLayout === "B" ? 2 : CMP_MAX;
    if (state.mvpPins.length >= max) state.mvpPins.shift();
    state.mvpPins.push(slot);
  }
  renderAll();
}
window.cmpPinBtn = cmpPinBtn;
function cmpPinBtn(p) {
  const n = state.mvpPins.indexOf(p.slot);
  return `<span class="pinBtn${n >= 0 ? " on" : ""}" role="button" data-pin="${p.slot}" title="${n >= 0 ? "Unpin" : "Pin to compare side by side"}">${n >= 0 ? `<b>${n + 1}</b>` : PIN_SVG}</span>`;
}
const PIN_SVG = `<svg viewBox="0 0 16 16" width="15" height="15"><path d="M5 1h6l-1 5 3 3H9.5L8 15l-1.5-6H3l3-3z" fill="currentColor"/></svg>`;

// One record per pinned player with everything the layouts need, for the current score mode.
function cmpData(rows, mode) {
  const valve = mode === "valve";
  const phase = valveCache().phase;
  return cmpPlayers().map(p => {
    const r = rows.find(x => x.p.slot === p.slot);
    const ph = phase.find(x => x.slot === p.slot) || {};
    const st = p.stats, lossOf = st.length ? st[st.length - 1].gold_death_loss || 0 : 0;
    let stats;
    if (valve) {
      const row = window.HERO_TABLE.heroes[String(r.v.graded_hero)] || window.HERO_TABLE.fallback;
      stats = VALVE_ROWS.map(([label, i]) => ({ id: "v" + i, label, v: r.v.values[i], avg: row.mean[i], pts: r.v.points[i], low: i === 2 }));
    } else {
      stats = r.parts.map(x => ({ id: x.def.id, label: x.def.label, v: x.v, pts: x.on ? x.pts : null, max: x.maxPts, cat: x.def.cat, low: !!x.def.low, off: !x.on }));
    }
    return { p, r, stats, early: ph.early_valve, late: ph.late_valve, dropped: lossOf };
  });
}
const cmpScore = (r, valve) => valve ? r.score.toFixed(2) : String(Math.round(r.score));
const cmpPts = (v, valve) => v == null ? "" : valve ? signed(v, 2) : v.toFixed(1);
// Index of the best player for a row (by points), or -1 for a tie or nothing to compare.
function cmpLead(vals) {
  const ok = vals.filter(v => v != null);
  if (ok.length < 2) return -1;
  const m = Math.max(...ok);
  return ok.filter(v => v === m).length > 1 ? -1 : vals.indexOf(m);
}
function cmpHeadMini(d, valve, rows) {
  const p = d.p, T = TEAMS[p.team];
  return `<div class="cmpHd" style="--tc:${T.c}">
    <span class="cmpX" role="button" data-pin="${p.slot}" title="Unpin">×</span>
    ${cardFace(p, "cmp")}
    <div class="hn">${esc(p.hero)}</div>
    <div class="meta">${p.mvp === 1 ? `<span class="badge">MVP</span>` : p.mvp > 1 ? `<span class="badge key">KEY</span>` : ""}<span style="color:${T.c}">${T.color}</span> · ${state.match.winning_team === p.team ? "Won" : "Lost"}</div>
    <div class="cmpTot"><b>${cmpScore(d.r, valve)}</b><span>${ordinal(d.r.place)} of ${rows.length}</span></div>
  </div>`;
}

// ---------------------------------------------------------------------------------------------
// Layout A: columns in the right panel.
// ---------------------------------------------------------------------------------------------
function cmpColumns(rows, mode) {
  const valve = mode === "valve", D = cmpData(rows, mode), n = D.length;
  let h = `<div class="mvpWhy cmpPanel${valve ? "" : " dense"}" style="--tc:#FFEFD7;--n:${n}">
    <div class="cmpTop"><span class="cmpTitle">Side by side</span><span class="cmpSub">${valve ? "Value, then points against that hero's average." : "Value, then points in this match."} Brightest = best of the ${n === 2 ? "two" : n}.</span><button class="graphOptionButton cmpClear" data-clear="1">Clear</button></div>
    <div class="cmpGrid"><div class="cmpCorner"></div>${D.map(d => cmpHeadMini(d, valve, rows)).join("")}`;
  const nStats = D[0].stats.length;
  for (let k = 0; k < nStats; k++) {
    const s0 = D[0].stats[k];
    if (!valve && s0.off && D.every(d => d.stats[k].off)) continue;
    const lead = cmpLead(D.map(d => d.stats[k].pts));
    h += `<div class="cmpLbl">${!valve ? `<b style="background:${MVP_CATS[s0.cat].c}"></b>` : ""}${esc(s0.label)}</div>`;
    D.forEach((d, i) => {
      const s = d.stats[k];
      const pc = s.pts == null ? "" : valve ? (s.pts >= 0 ? "pos" : "neg") : "";
      h += `<div class="cmpCell${i === lead ? " lead" : ""}" title="${valve ? `${esc(d.p.hero)} average: ${fmtStat(s.avg)}` : ""}"><b>${fmtStat(s.v)}</b><em class="${pc}">${cmpPts(s.pts, valve)}</em>${valve ? `<i class="avg">avg ${fmtStat(s.avg)}</i>` : `<span class="track"><i style="width:${s.max ? (s.pts / s.max) * 100 : 0}%;background:${MVP_CATS[s.cat].c}"></i></span>`}</div>`;
    });
  }
  // When they contributed + souls dropped
  if (D.some(d => d.early != null)) {
    h += `<div class="cmpSec">When they contributed</div>`;
    for (const [label, key] of [["Before 15:00", "early"], ["After 15:00", "late"]]) {
      if (D.every(d => d[key] == null)) continue;
      const lead = cmpLead(D.map(d => d[key]));
      h += `<div class="cmpLbl">${label}</div>` + D.map((d, i) => `<div class="cmpCell sm${i === lead ? " lead" : ""}">${d[key] == null ? "–" : `<em class="${d[key] >= 0 ? "pos" : "neg"}">${signed(d[key], 1)}</em>`}</div>`).join("");
    }
  }
  const dl = cmpLead(D.map(d => -d.dropped));
  h += `<div class="cmpLbl">Souls dropped on death</div>` + D.map((d, i) => `<div class="cmpCell sm${i === dl ? " lead" : ""}"><b>${fmtStat(d.dropped)}</b></div>`).join("");
  h += `</div><div class="whyFoot">Pin up to ${CMP_MAX} players with the pin on each row. Click a column's portrait to open that player's own breakdown.</div></div>`;
  return h;
}

// ---------------------------------------------------------------------------------------------
// Layout B: head-to-head for 2 players.
// ---------------------------------------------------------------------------------------------
function cmpH2H(rows, mode) {
  const valve = mode === "valve", D = cmpData(rows, mode).slice(0, 2);
  const [a, b] = D, Ta = TEAMS[a.p.team], Tb = TEAMS[b.p.team];
  const stats = a.stats.map((s, k) => ({ s, t: b.stats[k] })).filter(x => valve || !(x.s.off && x.t.off));
  const scale = Math.max(0.5, ...stats.map(x => Math.abs(x.s.pts || 0)), ...stats.map(x => Math.abs(x.t.pts || 0)));
  const bar = (v, c, side) => `<span class="h2hTrack ${side}"><i style="width:${Math.min(100, (Math.abs(v || 0) / scale) * 100)}%;background:${(v || 0) < 0 ? RED : c}"></i></span>`;
  let aWins = 0, bWins = 0, bigA = null, bigB = null;
  for (const x of stats) {
    const g = (x.s.pts || 0) - (x.t.pts || 0);
    if (g > 0.005) { aWins++; if (!bigA || g > bigA.g) bigA = { g, l: x.s.label }; }
    else if (g < -0.005) { bWins++; if (!bigB || -g > bigB.g) bigB = { g: -g, l: x.s.label }; }
  }
  const side = (d, T, right) => `<div class="cmpSide${right ? " r" : ""}" style="--tc:${T.c}">
      ${right ? "" : cardFace(d.p, "lg")}
      <div><div class="hn">${esc(d.p.hero)}</div><div class="meta">${d.p.mvp === 1 ? `<span class="badge">MVP</span> ` : d.p.mvp > 1 ? `<span class="badge key">KEY</span> ` : ""}<span style="color:${T.c}">${T.color}</span> · ${state.match.winning_team === d.p.team ? "Won" : "Lost"}</div>
      <div class="cmpBig"><b>${cmpScore(d.r, valve)}</b><span>${ordinal(d.r.place)} of ${rows.length}</span></div></div>
      ${right ? cardFace(d.p, "lg") : ""}
    </div>`;
  let summary = `${a.p.hero} is ahead on ${aWins} of ${stats.length} stats, ${b.p.hero} on ${bWins}.`;
  if (bigA) summary += ` ${a.p.hero}'s biggest edge: ${bigA.l.toLowerCase()} (${valve ? "+" + bigA.g.toFixed(2) : "+" + bigA.g.toFixed(1)}).`;
  if (bigB) summary += ` ${b.p.hero}'s: ${bigB.l.toLowerCase()} (${valve ? "+" + bigB.g.toFixed(2) : "+" + bigB.g.toFixed(1)}).`;
  let h = `<div class="mvpWhy cmpPanel h2hPanel" style="--tc:${Ta.c}">
    <div class="h2hHead">${side(a, Ta, false)}<div class="vs">VS<button class="graphOptionButton cmpClear" data-clear="1">Clear</button></div>${side(b, Tb, true)}</div>
    <p class="summary">${esc(summary)}</p>
    <div class="h2hRows"><div class="h2hR th"><span></span><span></span><span class="n">${valve ? "Points vs hero avg" : "Points"}</span><span></span><span></span></div>`;
  for (const x of stats) {
    const la = (x.s.pts || 0) > (x.t.pts || 0) + 0.005, lb = (x.t.pts || 0) > (x.s.pts || 0) + 0.005;
    h += `<div class="h2hR">
      <span class="v${la ? " lead" : ""}"><b>${fmtStat(x.s.v)}</b><em class="${valve ? ((x.s.pts || 0) >= 0 ? "pos" : "neg") : ""}">${cmpPts(x.s.pts, valve)}</em></span>
      ${bar(x.s.pts, Ta.c, "l")}<span class="n">${esc(x.s.label)}</span>${bar(x.t.pts, Tb.c, "r")}
      <span class="v r${lb ? " lead" : ""}"><em class="${valve ? ((x.t.pts || 0) >= 0 ? "pos" : "neg") : ""}">${cmpPts(x.t.pts, valve)}</em><b>${fmtStat(x.t.v)}</b></span>
    </div>`;
  }
  h += `</div><div class="h2hRows sm"><div class="cmpSec">When they contributed</div>`;
  for (const [label, key] of [["Before 15:00", "early"], ["After 15:00", "late"]]) {
    if (a[key] == null && b[key] == null) continue;
    h += `<div class="h2hR"><span class="v${(a[key] || 0) > (b[key] || 0) ? " lead" : ""}"><em class="${(a[key] || 0) >= 0 ? "pos" : "neg"}">${a[key] == null ? "–" : signed(a[key], 1)}</em></span>${bar(a[key] / (valve ? 1 : 1), Ta.c, "l")}<span class="n">${label}</span>${bar(b[key], Tb.c, "r")}<span class="v r${(b[key] || 0) > (a[key] || 0) ? " lead" : ""}"><em class="${(b[key] || 0) >= 0 ? "pos" : "neg"}">${b[key] == null ? "–" : signed(b[key], 1)}</em></span></div>`;
  }
  h += `<div class="h2hR"><span class="v${a.dropped < b.dropped ? " lead" : ""}"><b>${fmtStat(a.dropped)}</b></span><span></span><span class="n">Souls dropped on death</span><span></span><span class="v r${b.dropped < a.dropped ? " lead" : ""}"><b>${fmtStat(b.dropped)}</b></span></div>`;
  h += `</div><div class="whyFoot">Pin two players with the pin on each row. A third pin replaces the oldest.</div></div>`;
  return h;
}

// ---------------------------------------------------------------------------------------------
// Layout C: its own full-width view, one card per player.
// ---------------------------------------------------------------------------------------------
function cmpCards(rows, mode) {
  const valve = mode === "valve", D = cmpData(rows, mode);
  const nStats = D.length ? D[0].stats.length : 0;
  const leads = [];
  for (let k = 0; k < nStats; k++) leads.push(cmpLead(D.map(d => d.stats[k].pts)));
  const scale = Math.max(0.5, ...D.flatMap(d => d.stats.map(s => Math.abs(s.pts || 0))));
  const eLead = cmpLead(D.map(d => d.early)), lLead = cmpLead(D.map(d => d.late)), dLead = cmpLead(D.map(d => -d.dropped));
  let h = `<div class="cmpCards" style="--n:${Math.max(D.length, 2)}">`;
  D.forEach((d, i) => {
    const p = d.p, T = TEAMS[p.team];
    h += `<div class="mvpWhy cmpCard" style="--tc:${T.c}">
      <div class="whyHead">${cardFace(p, "lg")}<div class="whyName"><div class="hn">${esc(p.hero)}</div>
        <div class="meta">${p.mvp === 1 ? `<span class="badge">MVP</span> ` : p.mvp > 1 ? `<span class="badge key">KEY</span> ` : ""}<span style="color:${T.c}">${T.color}</span> · ${state.match.winning_team === p.team ? "Won" : "Lost"}</div>
        ${rankHtml(p.badge) || `<span class="rank none">Unranked</span>`}</div>
        <div class="whyScore"><b>${cmpScore(d.r, valve)}</b><span>${ordinal(d.r.place)} of ${rows.length}</span></div>
        <span class="cmpX" role="button" data-pin="${p.slot}" title="Remove">×</span></div>
      <p class="summary cs">${esc(cmpSummary(d, valve))}</p>
      <div class="cardRows">`;
    d.stats.forEach((s, k) => {
      if (!valve && s.off) return;
      h += `<div class="cr${leads[k] === i ? " lead" : ""}"><span class="sn">${esc(s.label)}</span><span class="v">${fmtStat(s.v)}</span>${valve ? divBar(s.pts, scale, "") : `<span class="track"><i style="width:${s.max ? (s.pts / s.max) * 100 : 0}%;background:${MVP_CATS[s.cat].c}"></i></span>`}<em class="${valve ? (s.pts >= 0 ? "pos" : "neg") : ""}">${cmpPts(s.pts, valve)}</em></div>`;
    });
    h += `</div><div class="accHead"><span>When they contributed</span></div>
      <div class="cr sm${eLead === i ? " lead" : ""}"><span class="sn">Before 15:00</span><span class="v"></span>${d.early == null ? "<span></span>" : divBar(d.early, 6, "")}<em class="${(d.early || 0) >= 0 ? "pos" : "neg"}">${d.early == null ? "–" : signed(d.early, 1)}</em></div>
      <div class="cr sm${lLead === i ? " lead" : ""}"><span class="sn">After 15:00</span><span class="v"></span>${d.late == null ? "<span></span>" : divBar(d.late, 6, "")}<em class="${(d.late || 0) >= 0 ? "pos" : "neg"}">${d.late == null ? "–" : signed(d.late, 1)}</em></div>
      <div class="cr sm${dLead === i ? " lead" : ""}"><span class="sn">Souls dropped</span><span class="v">${fmtStat(d.dropped)}</span><span></span><em></em></div>
      ${accoladesHtml(p)}
    </div>`;
  });
  if (D.length < CMP_MAX) h += `<div class="cmpAdd"><b>+</b><span>Add a player</span><span class="cmpAddSub">Click a portrait in the top bar</span></div>`;
  return h + `</div>`;
}

function cmpSummary(d, valve) {
  const ps = d.stats.filter(s => s.pts != null).slice().sort((a, b) => b.pts - a.pts);
  const best = ps.filter(s => s.pts > 0).slice(0, 2);
  const worst = valve ? ps.filter(s => s.pts < -0.15 && !best.includes(s)).reverse().slice(0, 2) : [];
  let t = best.length ? `Carried by ${listJoin(best.map(s => s.label.toLowerCase()))}.` : "Nothing above average.";
  if (worst.length) t += ` Behind on ${listJoin(worst.map(s => s.label.toLowerCase()))}.`;
  return t;
}
window.renderCompareHook = function (rows, mode) {
  const n = cmpPlayers().length;
  if (state.cmpLayout === "C") return n >= 1 ? cmpCards(rows, mode) : null;
  if (n < 2) return null;
  return state.cmpLayout === "B" ? cmpH2H(rows, mode) : cmpColumns(rows, mode);
};
window.bindCompare = function (view) {
  view.querySelectorAll("[data-pin]").forEach(b => b.onclick = ev => { ev.stopPropagation(); cmpToggle(Number(b.dataset.pin)); });
  view.querySelectorAll("[data-clear]").forEach(b => b.onclick = () => { state.mvpPins = []; renderAll(); });
};
