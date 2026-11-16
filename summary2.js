"use strict";
// Summary tab, round 2 MOCKUP (planning thread). Not for merge.
// ?sum=2&view=one|stat|multi|lobby|early, &pick=slot[,slot..], &stat=kills
// Design bar: calm at rest, details on click, a layout per group size, nothing switched on that you didn't pick.

const S2_VIEW = params.get("view") || "one";
const S2_PICKS = (params.get("pick") || "").split(",").filter(x => /^\d+$/.test(x)).map(Number);
const S2_STAT = params.get("stat") || "kills";

// Normal CDF, for "Top 7% of Billy games". The real build uses each hero's measured spread (one more data pull).
function phi(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
function pctWord(s, hero) {
  const p = phi(s.z);
  if (p >= 0.65) return { cls: "pos", txt: `Top ${Math.max(1, Math.round((1 - p) * 100))}%`, long: `Top ${Math.max(1, Math.round((1 - p) * 100))}% of ${hero} games` };
  if (p <= 0.35) return { cls: "neg", txt: `Bottom ${Math.max(1, Math.round(p * 100))}%`, long: `Bottom ${Math.max(1, Math.round(p * 100))}% of ${hero} games` };
  return { cls: "even", txt: "Typical", long: `Typical for ${hero}` };
}
const arrowOf = c => c === "pos" ? UP : c === "neg" ? DOWN : "≈";
const S2_IDS = { 0: "kills", 2: "deaths", 1: "assists", 5: "damage", 4: "objectives", 3: "souls" };

function nemesis(p) {
  const evs = deathEvents(), by = new Map();
  for (const e of evs) {
    if (e.victim === p && e.killer) { const r = by.get(e.killer) || { q: e.killer, them: 0, you: 0 }; r.them++; by.set(e.killer, r); }
    if (e.killer === p) { const r = by.get(e.victim) || { q: e.victim, them: 0, you: 0 }; r.you++; by.set(e.victim, r); }
  }
  const rows = [...by.values()];
  const nem = rows.slice().sort((a, b) => b.them - a.them || a.you - b.you)[0];
  const prey = rows.slice().sort((a, b) => b.you - a.you || a.them - b.them)[0];
  return { nem, prey };
}
function damagePeak(p) {
  let prev = 0, pt = 0, best = { inc: 0, t0: 0, t1: 0 };
  for (const s of p.stats) { const inc = (s.player_damage || 0) - prev; if (inc > best.inc) best = { inc, t0: pt, t1: s.time_stamp_s }; prev = s.player_damage || 0; pt = s.time_stamp_s; }
  return Object.assign(best, { share: best.inc / Math.max(1, prev) });
}
function mvpGap(p) {
  const rows = valveRows(), r = rows.find(x => x.p.slot === p.slot);
  if (r.place === 1) { const n = rows[1]; return { r, txt: `${(r.score - n.score).toFixed(1)} pts ahead of ${n.p.hero}` }; }
  const a = rows[r.place - 2]; return { r, txt: `${(a.score - r.score).toFixed(1)} pts behind ${a.p.hero} (${ordinal(a.place)})` };
}
function faceHtml(q, cls) { return `<span class="s2face ${cls || ""}" style="--tc:${TEAMS[q.team].c}">${cardImg(q)}</span>`; }
function signTag(tone) { return tone === "g" ? "+" : tone === "r" ? "−" : "~"; }

// ---------- shared header: what you are looking at, and how to change it ----------
function controlBar(mode, p) {
  const t = matchTitle(), me = state.me || p;
  const seg = (k, label, on) => `<button class="graphOptionButton${on ? " on" : ""}">${label}</button>`;
  return `<div class="s2bar">
    <div class="graphOption"><span class="optionLabel">Show:</span>${seg("me", esc(me.hero) + " (You)", mode === "one" && p === me)}${seg("hk", "Hidden King", false)}${seg("am", "Archmother", false)}${seg("all", "Everyone", mode === "lobby")}</div>
    <span class="s2hint">${mode === "multi" ? `${S2_PICKS.length} heroes picked. Click a portrait up top to add or remove (up to 4).` : mode === "lobby" ? "Click a row to open that hero." : "Click portraits up top to compare up to 4."}</span>
    ${mode === "lobby" ? "" : `<button class="s2match" title="${esc(t.rule)}"><b>${esc(t.title)}</b><span>${esc(TEAMS[state.match.winning_team].name)} won in ${fmtTime(state.match.duration_s)}</span><i>›</i></button>`}
  </div>`;
}

// ---------- one hero ----------
function heroColumn(p, early) {
  const T = TEAMS[p.team], won = state.match.winning_team === p.team, k = p.raw;
  return `<div class="s2hero" style="--tc:${T.c}">
    <div class="s2art">${cardImg(p)}<span class="s2artTag ${won ? "won" : "lost"}">${won ? "VICTORY" : "DEFEAT"}</span></div>
    <div class="s2name"><span class="hn">${esc(heroName(p))}</span>${rankHtml(p.badge) || `<span class="rank none">Unranked</span>`}</div>
    <div class="s2meta"><span style="color:${T.c}">${T.color}</span> · ${p.lane && LANES_BY_COLOR[p.lane] ? LANES_BY_COLOR[p.lane] + " lane" : "No lane"} · ${fmtTime(state.match.duration_s)}</div>
    <div class="s2kda"><b>${k.kills}</b><i>/</i><b class="d">${k.deaths}</b><i>/</i><b>${k.assists}</b><span>${fmtStat(p.souls)} souls</span></div>
    ${early ? "" : accHtml(p).replace(/top \d+, hover for the stat/, "hover for the stat")}
    ${itemsHtml(p).replace(/\d+ items, hover for when/, "hover for when")}
  </div>`;
}
function verdictBlock(p, early) {
  const g = mvpGap(p);
  return `<div class="s2verdict">
    <div class="s2v"><p>${esc(verdict(p))}</p>${tagsRowHtml(p, 4, early)}</div>
    <div class="s2place"><b>${ordinal(g.r.place)}</b><span>of 12${p.mvp === 1 ? ` · <span class="badge">MVP</span>` : p.mvp > 1 ? ` · <span class="badge key">KEY</span>` : ""}</span><em>${early ? "Early estimate" : esc(g.txt)}</em></div>
  </div>`;
}
function tileHtml(s, hero, opts) {
  const w = pctWord(s, hero), sel = opts && opts.sel === S2_IDS[s.i];
  return `<button class="s2tile${opts && opts.compact ? " compact" : ""}${sel ? " sel" : ""}${s.place === 1 ? " best" : ""}" title="${esc(s.label)}: ${esc(fmtV(s, s.val))}. Average ${esc(hero)}: ${esc(fmtAvg(s, s.avg))}. ${ordinal(s.place)} of ${s.n} in this match. Click for how it happened.">
    <span class="tl">${esc(opts && opts.compact ? s.short || s.label : s.label)}</span>
    <span class="tv">${esc(fmtV(s, s.val))}</span>
    <span class="tp ${w.cls}">${arrowOf(w.cls)} ${esc(opts && opts.compact ? w.txt : w.long)}</span>
    ${opts && opts.compact ? "" : `<span class="tr">${s.place === 1 ? `<span class="topTag">Lobby best</span>` : `${ordinal(s.place)} in lobby`}</span>`}
  </button>`;
}
function highlightsHtml(p, early) {
  const ln = laneInfo(p), nm = nemesis(p), dp = damagePeak(p), fs = fightSummary(p);
  const card = (lbl, main, sub, extra) => `<button class="s2hl${early ? " wait" : ""}"><span class="hlL">${lbl}</span><span class="hlM">${main}</span><span class="hlS">${sub}</span>${extra || ""}</button>`;
  if (early) return `<div class="s2hls">${["Lane", "Nemesis", "Damage peak", "Fights"].map(l => card(l, `<span class="waitTxt">With full stats</span>`, "Needs the full match file")).join("")}</div>`;
  return `<div class="s2hls">
    ${card("Lane", `<span class="sumTag ${ln.tone}"><b>${signTag(ln.tone)}</b>${esc(ln.word)}</span>`, esc(ln.why), `<span class="hlFaces">${ln.mates.map(q => faceHtml(q, "xs")).join("")}<em>vs</em>${ln.opp.map(q => faceHtml(q, "xs")).join("")}</span>`)}
    ${card("Nemesis", `${faceHtml(nm.nem.q, "sm")}<span class="hlBig">${nm.nem.them}<i>–</i>${nm.nem.you}</span>`, `${esc(nm.nem.q.hero)} killed you ${nm.nem.them} times, you got them ${nm.nem.you}`)}
    ${card("Damage peak", `<span class="hlBig">${Math.round(dp.share * 100)}<i>%</i></span>`, `of your damage came ${fmtTime(dp.t0)} to ${fmtTime(dp.t1)}`)}
    ${card("Fights", `<span class="hlBig">${fs.mine.length}<i> of ${fs.fs.length}</i></span>`, `you were in, your team won ${fs.won}`)}
  </div>`;
}
function viewOne(p, early) {
  const hero = p.hero, g = gradedStats(p);
  return `${controlBar("one", p)}<div class="s2one">
    ${heroColumn(p, early)}
    <div class="s2main">
      ${verdictBlock(p, early)}
      <div class="s2tiles">${g.map(s => tileHtml(s, hero)).join("")}</div>
      ${highlightsHtml(p, early)}
      <div class="s2foot">${early ? `<span class="earlyTag">EARLY</span> From the game's scoreboard. Lane, fights and the rest fill in by themselves in about a minute.` : `Click any number for how it happened. Percentiles compare with every ${esc(hero)} game in the last two weeks.`}</div>
    </div>
  </div>`;
}

// ---------- one hero, a stat opened ----------
function killsDetail(p) {
  const dur = state.match.duration_s, evs = deathEvents(), fs = fights();
  const mine = evs.filter(e => e.killer === p || e.victim === p || e.assists.includes(p));
  const W = 780, H = 380, m = { l: 34, r: 14, t: 16, b: 28 };
  const X = t => m.l + (t / dur) * (W - m.l - m.r);
  const kT = evs.filter(e => e.killer === p).map(e => e.t), dT = evs.filter(e => e.victim === p).map(e => e.t);
  const ymax = Math.max(kT.length, dT.length, 1);
  const Y = v => m.t + (1 - v / ymax) * (H - m.t - m.b);
  const step = (ts, c) => { let d = `M${X(0)},${Y(0)}`, n = 0; for (const t of ts) { d += `H${X(t)}V${Y(++n)}`; } return `<path d="${d}H${X(dur)}" fill="none" stroke="${c}" stroke-width="2.5"/>`; };
  let svg = `<svg width="${W}" height="${H}" class="s2chart">`;
  for (const f of fs) { const r = fightRole(f, p); if (!r.in) continue; svg += `<rect x="${X(f.start) - 3}" y="${m.t}" width="${Math.max(6, X(f.end) - X(f.start) + 6)}" height="${H - m.t - m.b}" fill="${f.winner === p.team ? "#58D86A" : f.winner == null ? "#FFEFD7" : "#E8604C"}" opacity="0.10"/>`; }
  for (let v = 0; v <= ymax; v += Math.ceil(ymax / 4)) svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,239,215,0.07)"/><text x="${m.l - 8}" y="${Y(v) + 4}" class="tlTick" text-anchor="end" style="text-anchor:end">${v}</text>`;
  for (let t = 600; t < dur; t += 600) svg += `<text x="${X(t)}" y="${H - 6}" class="tlTick">${fmtTime(t)}</text>`;
  svg += step(kT, "#58D86A") + step(dT, "#E8604C");
  kT.forEach((t, i) => { svg += `<circle cx="${X(t)}" cy="${Y(i + 1)}" r="4" fill="#58D86A"/>`; });
  dT.forEach((t, i) => { svg += `<circle cx="${X(t)}" cy="${Y(i + 1)}" r="4" fill="#E8604C"/>`; });
  svg += `</svg>`;
  // the log: one row per event, grouped into fights
  let log = "", lastF = null;
  for (const e of mine) {
    const f = fs.find(x => e.t >= x.start && e.t <= x.end);
    if (f && f !== lastF) { log += `<div class="lgFight"><span>Fight at ${fmtTime(f.start)}</span><span class="${f.winner === p.team ? "pos" : f.winner == null ? "" : "neg"}">${f.winner === p.team ? "won" : f.winner == null ? "traded" : "lost"}, ${f.deaths[p.team]} for ${f.deaths[1 - p.team]}</span></div>`; }
    if (!f) lastF = null; else lastF = f;
    const kind = e.killer === p ? "k" : e.victim === p ? "d" : "a";
    const who = kind === "d" ? e.killer : e.victim;
    const txt = kind === "k" ? `Killed ${who.hero}` : kind === "d" ? (who ? `Died to ${who.hero}` : "Died to troopers or a Guardian") : `Assist on ${who.hero}`;
    log += `<div class="lgRow ${kind}${f ? " inF" : ""}"><span class="lt">${fmtTime(e.t)}</span><span class="lk">${kind === "k" ? "+" : kind === "d" ? "−" : "A"}</span>${who ? faceHtml(who, "xs") : `<span class="s2face xs"></span>`}<span class="ln">${esc(txt)}</span></div>`;
  }
  const s = gradedStats(p);
  return `<div class="s2detail">
    <div class="dHead"><span class="dTitle">Kills and deaths</span><span class="dSub">${p.raw.kills} kills, ${p.raw.deaths} deaths, ${p.raw.assists} assists. Shaded = a fight you were in: green won, red lost.</span><span class="dKey"><span><i style="background:#58D86A"></i>kills</span><span><i style="background:#E8604C"></i>deaths</span></span><button class="dClose" title="Close">×</button></div>
    <div class="dBody">${svg}<div class="dLog"><div class="lgHead">Every kill, death and assist <span>(assists are a best guess)</span></div>${log}</div></div>
  </div>`;
}
function viewStat(p) {
  const hero = p.hero, g = gradedStats(p);
  return `${controlBar("one", p)}<div class="s2one">
    ${heroColumn(p)}
    <div class="s2main open">
      ${verdictBlock(p)}
      <div class="s2tiles row">${g.map(s => tileHtml(s, hero, { compact: true, sel: S2_STAT })).join("")}</div>
      ${killsDetail(p)}
    </div>
  </div>`;
}

// ---------- 2 to 4 heroes ----------
function viewMulti() {
  const ps = S2_PICKS.map(s => state.players.find(p => p.slot === s)).filter(Boolean);
  const G = ps.map(p => gradedStats(p));
  const cols = ps.length;
  const best = (vals, low) => { const b = low ? Math.min(...vals) : Math.max(...vals); return vals.map(v => v === b); };
  let h = `${controlBar("multi", ps[0])}<div class="s2multi" style="--n:${cols}">`;
  // header row
  h += `<div class="mLbl"></div>` + ps.map(p => {
    const T = TEAMS[p.team], won = state.match.winning_team === p.team, r = valveRows().find(x => x.p.slot === p.slot);
    return `<div class="mHead" style="--tc:${T.c}"><div class="mArt">${cardImg(p)}</div>
      <div class="mInfo"><div class="mName"><span class="hn">${esc(heroName(p))}</span><button class="mX" title="Remove">×</button></div>
      <div class="mMeta"><span class="s2artTag sm ${won ? "won" : "lost"}">${won ? "VICTORY" : "DEFEAT"}</span> ${ordinal(r.place)} of 12${p.mvp === 1 ? ` <span class="badge">MVP</span>` : p.mvp > 1 ? ` <span class="badge key">KEY</span>` : ""}</div>
      <div class="mKda">${p.raw.kills} / <span class="d">${p.raw.deaths}</span> / ${p.raw.assists}</div></div></div>`;
  }).join("");
  h += `<div class="mLbl">Verdict</div>` + ps.map(p => `<div class="mCell mVerd">${esc(verdict(p).split(". ").slice(0, 1).join(". ").replace(/\.$/, ""))}.</div>`).join("");
  h += `<div class="mLbl">Tags</div>` + ps.map(p => `<div class="mCell">${tagsRowHtml(p, 2)}</div>`).join("");
  SUM_STATS.forEach((st, k) => {
    const vals = G.map(g => st.i <= 2 ? Math.round(g[k].val) : g[k].val), b = best(vals, st.low); // counts compare as shown, so ties both turn gold
    h += `<div class="mLbl stat">${esc(st.short || st.label)}</div>` + ps.map((p, j) => {
      const s = G[j][k], w = pctWord(s, p.hero);
      return `<div class="mCell stat${b[j] ? " best" : ""}"><b>${esc(fmtV(s, s.val))}</b><span class="tp ${w.cls}">${arrowOf(w.cls)} ${esc(w.long)}</span></div>`;
    }).join("");
  });
  h += `<div class="mLbl">Lane</div>` + ps.map(p => { const ln = laneInfo(p); return `<div class="mCell"><span class="sumTag ${ln.tone}"><b>${signTag(ln.tone)}</b>${esc(ln.word.replace("Lost lane, not on you", "Lost lane"))}</span></div>`; }).join("");
  h += `<div class="mLbl">Nemesis</div>` + ps.map(p => { const n = nemesis(p).nem; return `<div class="mCell mNem">${faceHtml(n.q, "xs")}<span>${esc(n.q.hero)}, ${n.them} to ${n.you}</span></div>`; }).join("");
  h += `<div class="mLbl">Fights</div>` + ps.map(p => { const f = fightSummary(p); return `<div class="mCell">In ${f.mine.length} of ${f.fs.length}, won ${f.won}</div>`; }).join("");
  h += `</div><div class="s2foot">Gold = best of the heroes shown. Percentiles compare each hero with their own hero's games. Click a hero's picture to open their full Summary.</div>`;
  return h;
}

// ---------- team or lobby ----------
function verdictWord(p) {
  const r = valveRows().find(x => x.p.slot === p.slot), won = state.match.winning_team === p.team;
  if (p.mvp === 1) return ["Carried", "g"];
  if (r.score >= 2.5) return [won ? "Big game" : "Did their job", "g"];
  if (r.score >= 0.5) return ["Solid", "g"];
  if (r.score >= -1.5) return ["Quiet", "y"];
  return ["Rough one", "r"];
}
function viewLobby() {
  const t = matchTitle(), rows = valveRows();
  const tot = (team, f) => state.players.filter(p => p.team === team).reduce((a, p) => a + f(p), 0);
  const last = p => p.stats[p.stats.length - 1] || {};
  const TT = [
    ["Kills", p => p.raw.kills || 0, v => String(v)],
    ["Souls", p => p.souls, v => fmtStat(v)],
    ["Hero damage", p => last(p).player_damage || 0, v => fmtStat(v)],
    ["Objective damage", p => last(p).boss_damage || 0, v => fmtStat(v)],
    ["Healing on allies", p => last(p).teammate_healing || 0, v => fmtStat(v)],
  ];
  const a = state.leftTeam, b = 1 - a;
  let h = `${controlBar("lobby", state.me)}<div class="s2lobby">
    <div class="lbTop"><span class="mtTitle">${esc(t.title)}</span><span class="mtSub">${esc(t.sub)}</span><div class="mtTags">${teamTags().map(x => tagHtml(x, TEAMS[x.team].c)).join("")}</div></div>
    <div class="lbLeft">
      <div class="sumBlock lbTeams"><div class="accHead"><span>Team totals</span></div>
        <div class="ttRow th"><span></span><span style="color:${TEAMS[a].c}">${esc(TEAMS[a].name)}</span><span style="color:${TEAMS[b].c}">${esc(TEAMS[b].name)}</span></div>
        ${TT.map(([l, f, fm]) => { const x = tot(a, f), y = tot(b, f); return `<div class="ttRow"><span>${l}</span><span class="${x > y ? "lead" : ""}">${fm(x)}</span><span class="${y > x ? "lead" : ""}">${fm(y)}</span></div>`; }).join("")}
      </div>
      <div class="lbLanes">${laneCardsHtml()}</div>
    </div>
    <div class="lbTable">
      <div class="lbr th"><span>#</span><span>Hero</span><span>Verdict</span><span class="r">K / D / A</span><span class="r">Souls</span><span class="r">Damage + heal</span><span class="r">Objectives</span><span>Top tag</span><span class="r">Score</span></div>`;
  const G = state.players.map(p => ({ p, g: gradedStats(p) }));
  const lobbyBest = (i, low) => { const vs = G.map(x => x.g.find(s => s.i === i).val); return low ? Math.min(...vs) : Math.max(...vs); };
  const bS = lobbyBest(3), bD = lobbyBest(5), bO = lobbyBest(4);
  for (const r of rows) {
    const p = r.p, g = gradedStats(p), [w, tone] = verdictWord(p), all = tagsFor(p), tg = all.find(x => x.tone !== "r") || all[0];
    const v = i => g.find(s => s.i === i).val;
    h += `<button class="lbr${state.me && state.me.slot === p.slot ? " me" : ""}" style="--tc:${TEAMS[p.team].c}">
      <span class="pl">${r.place}</span><span class="hc">${faceHtml(p, "xs")}<b>${esc(heroName(p))}</b>${p.mvp === 1 ? `<span class="badge">MVP</span>` : p.mvp > 1 ? `<span class="badge key">KEY</span>` : ""}</span>
      <span><span class="sumTag ${tone}"><b>${signTag(tone)}</b>${w}</span></span>
      <span class="r">${p.raw.kills} / ${p.raw.deaths} / ${p.raw.assists}</span>
      <span class="r${v(3) === bS ? " gold" : ""}">${fmtStat(v(3))}</span><span class="r${v(5) === bD ? " gold" : ""}">${fmtStat(v(5))}</span><span class="r${v(4) === bO ? " gold" : ""}">${fmtStat(v(4))}</span>
      <span>${tg ? tagHtml(tg) : ""}</span><span class="r sc">${r.score.toFixed(1)}</span></button>`;
  }
  h += `</div></div>`;
  return h;
}

const _renderSummaryV1 = window.renderSummary;
window.renderSummary = function () {
  if (params.get("sum") !== "2") return _renderSummaryV1();
  const view = $("sumView");
  if (S2_VIEW === "multi") { state.mvpPick = S2_PICKS[0]; }
  const p = sumPick();
  view.className = "sumView s2";
  view.innerHTML = S2_VIEW === "stat" ? viewStat(p) : S2_VIEW === "multi" ? viewMulti() : S2_VIEW === "lobby" ? viewLobby() : viewOne(p, S2_VIEW === "early");
  // top bar shows the picked heroes as picked
  if (S2_VIEW === "multi" || S2_VIEW === "lobby") document.querySelectorAll("#teamLeft .player, #teamRight .player").forEach(b => b.classList.remove("pick"));
  if (S2_VIEW === "multi") {
    const ps = S2_PICKS.map(s => state.players.find(q => q.slot === s));
    document.querySelectorAll("#teamLeft .player, #teamRight .player").forEach(b => {
      const img = b.querySelector("img"); const q = state.players.find(x => img && img.alt === x.hero);
      if (q && ps.includes(q)) b.classList.add("pick");
    });
  }
  if (S2_VIEW === "lobby") document.querySelectorAll("#teamLeft .player, #teamRight .player").forEach(b => b.classList.add("pick"));
  if (S2_VIEW === "early") document.querySelectorAll("#tabs .tab").forEach(b => { const w = ["mvp", "matchups"].includes(b.dataset.tab); b.classList.toggle("wait", w); });
};
