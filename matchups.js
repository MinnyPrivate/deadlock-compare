"use strict";
// Matchups tab: who damaged whom, from Valve's damage matrix (match_info.damage_matrix).
// damage_dealers[].damage_sources[].damage_to_players[].damage holds cumulative values that line up with the END of
// sample_time_s (a shorter array starts later). source_details gives each source a stat type and a name.
// Checked against the test match: for every player, stat type 0 summed over enemy targets equals the scoreboard's
// player_damage exactly. Valve also sends the per-category totals ("Bullet", "Ability", "Melee", "Misc"),
// which repeat the named sources, so the totals use only one of the two.
// Crowd control (stat type 6) is in milliseconds: every value is a whole number of 1/64 s server ticks.

const MU_CATS = [
  { id: "Bullet", label: "Gun", c: "#F0A33A" },
  { id: "Ability", label: "Ability", c: "#B784F0" },
  { id: "Melee", label: "Melee", c: "#E8604C" },
  { id: "Misc", label: "Other", c: "#9AA0A6" },
];
const MU_CC = {
  Stun: { label: "Stun", c: "#FFD23F" },
  Root: { label: "Root", c: "#58D86A" },
  Silence: { label: "Silence", c: "#B784F0" },
  Disarm: { label: "Disarm", c: "#FF9A3C" },
  Sleep: { label: "Sleep", c: "#8C83FF" },
  Slow: { label: "Slow", c: "#3FCBFF" },
};
const MU_STATS = {
  dmg: { name: "Hero Damage", sub: "Damage each hero dealt to each enemy hero" },
  cc: { name: "Hard Crowd Control", sub: "Seconds of stun, root, silence, disarm and sleep" },
  slow: { name: "Slows", sub: "Seconds each hero slowed each enemy hero" },
};
const MU_WINDOWS = {
  all: { name: "Whole Match" },
  early: { name: "Before 15:00" },
  late: { name: "After 15:00" },
};

// Parse once per match. Every leaf keeps its cumulative array so any time window can be read from it.
function muParse(mi) {
  if (mi._mu !== undefined) return mi._mu;
  const dm = mi.damage_matrix;
  if (!dm || !Array.isArray(dm.damage_dealers) || !dm.source_details) return (mi._mu = null);
  const times = dm.sample_time_s || [];
  const types = dm.source_details.stat_type || [], names = dm.source_details.source_name || [];
  const team = {};
  for (const p of state.players) team[p.slot] = p.team;
  const out = { times, dmg: {}, cc: {}, src: {}, srcTo: {}, world: {} };
  const put = (o, a, b, k, arr) => { ((o[a] = o[a] || {})[b] = o[a][b] || {})[k] = arr; };
  for (const d of dm.damage_dealers) {
    const a = Number(d.dealer_player_slot);
    for (const s of d.damage_sources || []) {
      const i = s.source_details_index, t = types[i], n = names[i] || "";
      for (const tp of s.damage_to_players || []) {
        const b = Number(tp.target_player_slot), arr = tp.damage || [];
        if (!arr.length) continue;
        if (!(a in team)) { // not a hero: troopers, guardians, haunts, the mid boss
          if (t === 0 && MU_CATS.some(c => c.id === n) && b in team) put(out.world, b, "all", n, arr);
          continue;
        }
        if (!(b in team) || team[a] === team[b]) continue; // enemy heroes only
        if (t === 0 && MU_CATS.some(c => c.id === n)) put(out.dmg, a, b, n, arr);
        else if (t === 0) {
          const o = (out.src[a] = out.src[a] || {}); (o[n] = o[n] || []).push(arr);
          const to = ((out.srcTo[b] = out.srcTo[b] || {})[a] = out.srcTo[b][a] || {}); (to[n] = to[n] || []).push(arr); // who hit b with what
        }
        else if (t === 6) put(out.cc, a, b, n.replace(/^Citadel_Graph_CrowdControl_/, ""), arr);
      }
    }
  }
  return (mi._mu = out);
}

// Value of a right-aligned cumulative array at sample index k (0 before it starts).
function muAt(arr, k, n) {
  const j = k - (n - arr.length);
  return j < 0 ? 0 : arr[Math.min(j, arr.length - 1)] || 0;
}
function muSplitOk(mu) {
  return (state.match.duration_s || 0) >= SPLIT_MIN_S && mu.times.includes(EARLY_S);
}
function muVal(mu, arr) {
  const n = mu.times.length, end = n - 1;
  const w = state.muWin;
  if (w === "all" || !muSplitOk(mu)) return muAt(arr, end, n);
  const k = mu.times.indexOf(EARLY_S);
  return w === "early" ? muAt(arr, k, n) : muAt(arr, end, n) - muAt(arr, k, n);
}
// Parts of one directed pair (a hits b) for the current stat: [{label, c, v}].
function muParts(mu, a, b) {
  if (state.muStat === "dmg") {
    const o = (mu.dmg[a] || {})[b] || {};
    return MU_CATS.map(c => ({ label: c.label, c: c.c, v: o[c.id] ? muVal(mu, o[c.id]) : 0 }));
  }
  const o = (mu.cc[a] || {})[b] || {};
  const keys = state.muStat === "slow" ? ["Slow"] : Object.keys(MU_CC).concat(Object.keys(o)).filter(k => k !== "Slow");
  return [...new Set(keys)].map(k => ({ label: (MU_CC[k] || { label: k }).label, c: (MU_CC[k] || { c: "#9AA0A6" }).c, v: o[k] ? muVal(mu, o[k]) / 1000 : 0 }));
}
const muSum = parts => parts.reduce((x, p) => x + p.v, 0);
function muFmt(v) {
  if (!v) return state.muStat === "dmg" ? "0" : "0s";
  if (state.muStat !== "dmg") return v >= 100 ? Math.round(v) + "s" : v.toFixed(1) + "s";
  if (v >= 10000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return Math.round(v).toLocaleString("en-US");
}
function muBar(parts, scale) {
  return `<span class="muBar">${parts.filter(p => p.v > 0).map(p => `<i style="width:${(p.v / scale) * 100}%;background:${p.c}" title="${esc(p.label)}: ${muFmt(p.v)}"></i>`).join("")}</span>`;
}
// Damage source names: the game's own names, falling back to the parent ability (strip _dot, _bloodspill and so on).
function muSourceName(n) {
  const S = window.SOURCE_NAMES || {};
  let crit = false, k = n;
  if (/_crit$/.test(k)) { crit = true; k = k.slice(0, -5); }
  let name = null;
  for (let t = k; t && !name; t = t.includes("_") ? t.slice(0, t.lastIndexOf("_")) : "") {
    if (S[t]) name = S[t];
    if (/^(citadel_)?(ability|weapon|upgrade)$/.test(t)) break;
  }
  if (/melee/.test(k)) name = "Melee";
  else if (!name && /^citadel_weapon_/.test(k)) name = "Gun";
  else if (/^citadel_weapon_/.test(k)) name += " (gun)"; // a gun's own name, like Wraith's The Rake, doesn't say it's the gun
  if (!name) name = k.replace(/^(citadel_)?(ability_|upgrade_)?/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return crit ? name + " (headshots)" : name;
}

// Damage by source, merged under the game's names. by: { dealerSlot: { sourceName: [arrays] } }.
function muSources(mu, by) {
  const m = {};
  for (const [a, srcs] of Object.entries(by || {})) for (const [n, arrs] of Object.entries(srcs)) {
    const name = muSourceName(n), k = a + "|" + name;
    const v = arrs.reduce((x, arr) => x + muVal(mu, arr), 0);
    if (!m[k]) m[k] = { slot: Number(a), n: name, v: 0 };
    m[k].v += v;
  }
  return Object.values(m).filter(r => r.v > 0).sort((x, y) => y.v - x.v);
}
function muSrcList(title, rows, opts) {
  if (!rows.length) return `<div class="muSrc"><div class="wr th"><span>${title}</span></div><div class="muNone">None.</div></div>`;
  const all = rows.reduce((x, r) => x + r.v, 0) || 1, top = rows.slice(0, opts.n || 5);
  return `<div class="muSrc"><div class="wr th"><span>${title}</span><span class="r">Share</span></div>` + top.map(r => {
    const p = opts.who ? state.players.find(q => q.slot === r.slot) : null;
    return `<div class="muSrcRow" title="${p ? esc(p.hero) + ": " : ""}${esc(r.n)}, ${muFmt(r.v)}"><i class="fill" style="width:${(r.v / top[0].v) * 100}%"></i>` +
      `<span class="n">${p ? portrait(p, "mini") : ""}<span>${esc(r.n)}</span></span><span class="v">${muFmt(r.v)}</span><span class="pc">${Math.round((r.v / all) * 100)}%</span></div>`;
  }).join("") + `</div>`;
}

window.renderMatchups = function renderMatchups() {
  const view = $("muView");
  const mu = muParse(state.match);
  if (!mu) { view.innerHTML = `<div class="empty">Valve didn't send matchup data for this match.</div>`; return; }
  if (!muSplitOk(mu)) state.muWin = "all";
  const L = state.leftTeam;
  const left = state.players.filter(p => p.team === L), right = state.players.filter(p => p.team !== L);
  if (state.mvpPick == null || !state.players.some(p => p.slot === state.mvpPick)) { state.mvpPick = (state.me || left[0] || state.players[0]).slot; renderTop(); }
  const pair = state.muPair && state.muPair.every(s => state.players.some(p => p.slot === s)) ? state.muPair : null;

  // ---- header ----
  let h = `<div class="mvpHead">
    <div class="graphOption"><span class="optionLabel">Show:</span>${Object.keys(MU_STATS).map(k =>
      `<button class="graphOptionButton${k === state.muStat ? " on" : ""}" data-stat="${k}">${MU_STATS[k].name}</button>`).join("")}</div>
    <div class="graphOption"><span class="optionLabel">Time:</span>${Object.keys(MU_WINDOWS).map(k =>
      `<button class="graphOptionButton${k === state.muWin ? " on" : ""}" data-win="${k}"${k !== "all" && !muSplitOk(mu) ? " disabled title=\"Only for games of 20:00 or longer\"" : ""}>${MU_WINDOWS[k].name}</button>`).join("")}</div>
    <span class="mvpSub">${esc(MU_STATS[state.muStat].sub)}.</span>
  </div>`;

  // ---- left: the duel grid. Each cell is one pair of opponents: the row hero's number on top, the column hero's below. ----
  const cell = (a, b) => { const x = muSum(muParts(mu, a.slot, b.slot)), y = muSum(muParts(mu, b.slot, a.slot)); return { x, y }; };
  let maxPair = 0;
  for (const a of left) for (const b of right) { const c = cell(a, b); maxPair = Math.max(maxPair, c.x + c.y); }
  const TL = TEAMS[L], TR = TEAMS[1 - L];
  const focus = state.mvpPick;
  h += `<div class="muGrid" style="--tl:${TL.c};--tr:${TR.c}">`;
  h += `<div class="muCorner"><span style="color:${TL.c}">${TL.color}</span> rows<br><span style="color:${TR.c}">${TR.color}</span> columns</div>`;
  for (const b of right) h += `<button class="muHead col${b.slot === focus ? " on" : ""}" data-slot="${b.slot}">${portrait(b, "pt")}<span class="hn">${esc(heroName(b))}</span></button>`;
  for (const a of left) {
    h += `<button class="muHead row${a.slot === focus ? " on" : ""}" data-slot="${a.slot}">${portrait(a, "pt")}<span class="hn">${esc(heroName(a))}</span></button>`;
    for (const b of right) {
      const { x, y } = cell(a, b);
      const tot = x + y, share = tot ? (x / tot) * 100 : 50;
      const lane = a.lane && a.lane === b.lane;
      const on = pair && pair.includes(a.slot) && pair.includes(b.slot);
      const dim = !pair && focus !== a.slot && focus !== b.slot;
      h += `<button class="muCell${lane ? " lane" : ""}${on ? " on" : ""}${dim ? " dim" : ""}" data-a="${a.slot}" data-b="${b.slot}" style="--heat:${maxPair ? (0.04 + 0.22 * tot / maxPair).toFixed(3) : 0.04}"
        title="${esc(a.hero)} to ${esc(b.hero)}: ${muFmt(x)}\n${esc(b.hero)} to ${esc(a.hero)}: ${muFmt(y)}${lane ? "\nSame lane" : ""}\nClick for the head-to-head.">
        ${tot ? `<span class="v l${x >= y ? " win" : ""}">${muFmt(x)}</span><span class="split"><i style="width:${share}%"></i></span><span class="v r${y > x ? " win" : ""}">${muFmt(y)}</span>` : `<span class="none">–</span>`}
        ${lane ? `<span class="laneTag">Lane</span>` : ""}
      </button>`;
    }
  }
  h += `</div>`;

  // ---- right: one hero's matchups, or one pair head-to-head ----
  h += pair ? muPairPanel(mu, pair) : muHeroPanel(mu, state.players.find(p => p.slot === focus));

  view.innerHTML = h;
  view.querySelectorAll("[data-stat]").forEach(b => b.onclick = () => { state.muStat = b.dataset.stat; renderAll(); });
  view.querySelectorAll("[data-win]").forEach(b => b.onclick = () => { state.muWin = b.dataset.win; renderAll(); });
  view.querySelectorAll(".muHead, [data-hero]").forEach(b => b.onclick = () => { state.mvpPick = Number(b.dataset.slot || b.dataset.hero); state.muPair = null; renderAll(); });
  view.querySelectorAll(".muCell").forEach(b => b.onclick = () => {
    const a = Number(b.dataset.a), c = Number(b.dataset.b);
    const p = [a, c];
    if (state.mvpPick === c) p.reverse(); // keep the focused hero on the left of the head-to-head
    state.muPair = state.muPair && state.muPair.includes(a) && state.muPair.includes(c) ? null : p;
    renderAll();
  });
  const back = $("muBack");
  if (back) back.onclick = () => { state.muPair = null; renderAll(); };
};

function muLegend() {
  const items = state.muStat === "dmg" ? MU_CATS.map(c => [c.label, c.c]) : state.muStat === "slow" ? [] : Object.keys(MU_CC).filter(k => k !== "Slow").map(k => [MU_CC[k].label, MU_CC[k].c]);
  return items.length ? `<div class="legend">${items.map(([l, c]) => `<span><b style="background:${c}"></b>${l}</span>`).join("")}</div>` : "";
}

function muHeroPanel(mu, p) {
  const T = TEAMS[p.team];
  const foes = state.players.filter(q => q.team !== p.team);
  const dealt = foes.map(q => ({ q, parts: muParts(mu, p.slot, q.slot) }));
  const took = foes.map(q => ({ q, parts: muParts(mu, q.slot, p.slot) }));
  if (state.muStat === "dmg") {
    const w = (mu.world[p.slot] || {}).all || {};
    took.push({ world: true, parts: MU_CATS.map(c => ({ label: c.label, c: c.c, v: w[c.id] ? muVal(mu, w[c.id]) : 0 })) });
  }
  const sd = dealt.reduce((a, r) => a + muSum(r.parts), 0), st = took.filter(r => !r.world).reduce((a, r) => a + muSum(r.parts), 0);
  const scale = Math.max(1, ...dealt.concat(took).map(r => muSum(r.parts)));
  const verb = state.muStat === "dmg" ? ["Dealt to", "Took from"] : state.muStat === "slow" ? ["They slowed", "Slowed them"] : ["They crowd controlled", "Crowd controlled them"];
  const list = (rows, title, total) => `<div class="muList"><div class="wr th"><span>${title}</span><span class="r">${muFmt(total)}</span></div>` +
    rows.sort((a, b) => muSum(b.parts) - muSum(a.parts)).map(r => {
      const v = muSum(r.parts);
      if (r.world) return `<div class="muRow world" title="Troopers, guardians, walkers, haunts and the mid boss. Not counted in the total above."><span class="who"><span class="pt sm noimg"></span><span class="hn">Non-heroes</span></span>${muBar(r.parts, scale)}<span class="v">${muFmt(v)}</span></div>`;
      const lane = r.q.lane && r.q.lane === p.lane;
      return `<button class="muRow" data-hero="${r.q.slot}" title="Click to see ${esc(r.q.hero)}'s matchups"><span class="who">${portrait(r.q, "pt sm")}<span class="hn">${esc(heroName(r.q))}</span>${lane ? `<span class="laneTag">Lane</span>` : ""}</span>${muBar(r.parts, scale)}<span class="v">${muFmt(v)}</span></button>`;
    }).join("") + `</div>`;

  let h = `<div class="mvpWhy muPanel" style="--tc:${T.c}">
    <div class="whyHead">
      ${portrait(p, "big")}
      <div class="whyName"><div class="hn">${esc(heroName(p))}</div>
        <div class="meta"><span style="color:${T.c}">${T.color}</span> · ${p.lane && LANES_BY_COLOR[p.lane] ? LANES_BY_COLOR[p.lane] + " lane" : "No lane"} · ${MU_WINDOWS[state.muWin].name}</div></div>
    </div>
    ${muLegend()}
    <div class="muCols">${list(dealt, verb[0], sd)}${list(took, verb[1], st)}</div>`;
  if (state.muStat === "dmg") {
    // Left: what this hero hit enemies with. Right: which enemy hero hit them, and with what.
    const own = muSources(mu, { [p.slot]: mu.src[p.slot] }).map(r => Object.assign(r, { slot: p.slot }));
    h += `<div class="muCols">${muSrcList("Top damage sources", own, {})}${muSrcList("What hit them", muSources(mu, mu.srcTo[p.slot]), { who: true })}</div>`;
  }
  h += `<div class="whyFoot">Click a cell in the grid for a head-to-head. ${state.muStat === "dmg" ? "From Valve's damage matrix; totals match the scoreboard." : "From Valve's damage matrix. Effects can overlap, so seconds can add up to more than the time spent stunned."}</div></div>`;
  return h;
}

function muPairPanel(mu, pair) {
  const [a, b] = pair.map(s => state.players.find(p => p.slot === s));
  const pa = muParts(mu, a.slot, b.slot), pb = muParts(mu, b.slot, a.slot);
  const sa = muSum(pa), sb = muSum(pb), scale = Math.max(1, ...pa.map(x => x.v), ...pb.map(x => x.v));
  const TA = TEAMS[a.team], TB = TEAMS[b.team];
  const lane = a.lane && a.lane === b.lane;
  // Always say who did it to whom: "Wraith crowd controlled Bebop for 5.0s", never just a number beside a name.
  const did = (x, y, v) => state.muStat === "dmg" ? `${x.hero} dealt ${muFmt(v)} damage to ${y.hero}`
    : `${x.hero} ${state.muStat === "slow" ? "slowed" : "crowd controlled"} ${y.hero} for ${muFmt(v)}`;
  const onWord = state.muStat === "dmg" ? "to" : "on";
  const ratio = Math.max(sa, sb) / Math.max(1e-9, Math.min(sa, sb));
  const more = sa && sb && sa !== sb ? ` (${(sa > sb ? a : b).hero}: ${ratio >= 2 ? (ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)) + " times as much" : Math.round((ratio - 1) * 100) + "% more"})` : "";
  let h = `<div class="mvpWhy muPanel" style="--tc:${TA.c}">
    <div class="whyHead h2h">
      <button class="muSide" data-hero="${a.slot}">${portrait(a, "big")}<span class="nm"><span class="hn">${esc(heroName(a))}</span><span class="cap">${onWord} ${esc(b.hero)}</span></span><b style="color:${TA.c}">${muFmt(sa)}</b></button>
      <span class="vs">VS${lane ? `<span class="laneTag">Lane</span>` : ""}</span>
      <button class="muSide r" data-hero="${b.slot}"><b style="color:${TB.c}">${muFmt(sb)}</b><span class="nm"><span class="hn">${esc(heroName(b))}</span><span class="cap">${onWord} ${esc(a.hero)}</span></span>${portrait(b, "big")}</button>
    </div>
    <p class="summary">${esc(MU_WINDOWS[state.muWin].name)}: ${esc(did(a, b, sa))}. ${esc(did(b, a, sb))}.${esc(more)}</p>
    <div class="muH2H"><div class="h2hRow th"><span></span><span class="l">${esc(a.hero)} ${onWord} ${esc(b.hero)}</span><span></span><span>${esc(b.hero)} ${onWord} ${esc(a.hero)}</span><span></span></div>${pa.map((x, i) => `<div class="h2hRow"><span class="v">${muFmt(x.v)}</span><span class="track l"><i style="width:${(x.v / scale) * 100}%;background:${x.c}"></i></span><span class="n">${esc(x.label)}</span><span class="track"><i style="width:${(pb[i].v / scale) * 100}%;background:${pb[i].c}"></i></span><span class="v r">${muFmt(pb[i].v)}</span></div>`).filter((_, i) => pa[i].v || pb[i].v).join("") || `<div class="muNone">Nothing to compare.</div>`}</div>
    ${state.muStat === "dmg" ? `<div class="muCols">${muSrcList(`What ${esc(a.hero)} hit ${esc(b.hero)} with`, muSources(mu, { [a.slot]: (mu.srcTo[b.slot] || {})[a.slot] }), { n: 4 })}${muSrcList(`What ${esc(b.hero)} hit ${esc(a.hero)} with`, muSources(mu, { [b.slot]: (mu.srcTo[a.slot] || {})[b.slot] }), { n: 4 })}</div>` : ""}
    ${muSpark(mu, a, b)}
    <button class="graphOptionButton allBtn" id="muBack">Back to ${esc(state.players.find(p => p.slot === state.mvpPick).hero)}</button>
    <div class="whyFoot">From Valve's damage matrix, sampled every 3 minutes.${state.muStat === "dmg" ? "" : " Effects can overlap, so seconds can add up to more than the time spent stunned."}</div></div>`;
  return h;
}

// Both directions over the match, at Valve's sample times.
function muSpark(mu, a, b) {
  const n = mu.times.length;
  if (n < 2) return "";
  const series = [a, b].map((x, i) => {
    const y = i ? a : b;
    return mu.times.map((t, k) => {
      let v = 0;
      if (state.muStat === "dmg") { const o = (mu.dmg[x.slot] || {})[y.slot] || {}; for (const c of MU_CATS) if (o[c.id]) v += muAt(o[c.id], k, n); }
      else { const o = (mu.cc[x.slot] || {})[y.slot] || {}; for (const key in o) if ((key === "Slow") === (state.muStat === "slow")) v += muAt(o[key], k, n) / 1000; }
      return [t, v];
    });
  });
  const W = 700, H = 150, m = { l: 8, r: 150, t: 14, b: 26 };
  const dur = mu.times[n - 1], max = Math.max(1, ...series.flat().map(p => p[1]));
  const X = t => m.l + (t / dur) * (W - m.l - m.r), Y = v => H - m.b - (v / max) * (H - m.t - m.b);
  let s = `<svg class="muSpark" viewBox="0 0 ${W} ${H}">`;
  if (state.muWin !== "all" && muSplitOk(mu)) s += `<rect x="${state.muWin === "early" ? X(0) : X(EARLY_S)}" y="${m.t}" width="${state.muWin === "early" ? X(EARLY_S) - X(0) : X(dur) - X(EARLY_S)}" height="${H - m.t - m.b}" fill="#FFEFD7" fill-opacity="0.05"/>`;
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="#fff" stroke-opacity="0.12"/>`;
  for (let t = 0; t <= dur; t += 600) s += `<text x="${X(t)}" y="${H - 6}" text-anchor="${t ? "middle" : "start"}">${fmtTime(t)}</text>`;
  [a, b].forEach((x, i) => {
    const pts = [[0, 0], ...series[i]];
    s += `<path d="${pts.map(([t, v], j) => `${j ? "L" : "M"}${X(t).toFixed(1)} ${Y(v).toFixed(1)}`).join("")}" fill="none" stroke="${TEAMS[x.team].c}" stroke-width="2.6" stroke-linejoin="round"/>`;
    const last = pts[pts.length - 1];
    s += `<text class="endLab" x="${X(last[0]) + 8}" y="${Y(last[1]) + (i ? 14 : -4)}" style="fill:${TEAMS[x.team].c}">${esc(x.hero)} ${state.muStat === "dmg" ? "to" : "on"} ${esc((i ? a : b).hero)}</text>`;
  });
  return s + `</svg>`;
}
