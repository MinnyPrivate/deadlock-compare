"use strict";
// Summary tab: MOCKUP ONLY (planning thread). Not for merge.
// ?sum=A|B|C picks the layout, ?early=1 draws the early (scoreboard-only) view of layout A.
// Everything here is computed from the real match file; tag cutoffs and verdict wording are placeholders.

const SUM_LAYOUT = (params.get("sum") || "A").toUpperCase();
const SUM_EARLY = params.get("early") === "1";
const UP = "▲", DOWN = "▼";
const SUM_STATS = [ // index into PM_SCORE.statValues / HERO_TABLE mean and sd
  { i: 0, label: "Kills", say: "kills" },
  { i: 2, label: "Deaths", say: "deaths", low: true },
  { i: 1, label: "Assists", say: "assists" },
  { i: 5, label: "Hero damage + ally healing", short: "Damage + healing", say: "damage" },
  { i: 4, label: "Objective damage", short: "Objective damage", say: "objective damage" },
  { i: 3, label: "Souls", say: "souls" },
];

if (/^\d+$/.test(params.get("pick") || "")) state.mvpPick = Number(params.get("pick"));
function sumPick() {
  if (state.mvpPick == null || !state.players.some(p => p.slot === state.mvpPick)) state.mvpPick = (state.me || state.players[0]).slot;
  return state.players.find(p => p.slot === state.mvpPick);
}
function heroRow(p) {
  const c = valveCache(), v = c.scored.players.find(r => r.slot === p.slot);
  return { v, row: window.HERO_TABLE.heroes[String(v.graded_hero)] || window.HERO_TABLE.fallback };
}
// Each of Valve's six stats against the hero's own average (z = how unusual, in standard deviations).
function gradedStats(p) {
  const { v, row } = heroRow(p);
  const all = valveCache().scored.players;
  return SUM_STATS.map(s => {
    const val = v.values[s.i], avg = row.mean[s.i], sd = row.sd[s.i] || 1;
    const z = (val - avg) / sd * (s.low ? -1 : 1);
    const vs = all.map(r => r.values[s.i]);
    const place = 1 + vs.filter(x => (s.low ? x < val : x > val)).length;
    return Object.assign({}, s, { val, avg, z, place, n: vs.length });
  });
}
const fmtV = (s, v) => s.i === 2 || s.i === 0 || s.i === 1 ? String(Math.round(v)) : fmtStat(v);
const fmtAvg = (s, v) => s.i <= 2 ? (Math.round(v * 10) / 10).toString() : fmtStat(v);

// ---------- match level: title, team tags, MVP top 3 ----------
function teamSoulsSeries() {
  const times = [...new Set(state.players.flatMap(p => p.stats.map(s => s.time_stamp_s)))].sort((a, b) => a - b);
  return times.map(t => {
    const by = [0, 0];
    for (const p of state.players) by[p.team] += (snapAt(p, t) || {}).net_worth || 0;
    return { t, lead: by[0] - by[1], tot: by[0] + by[1] };
  });
}
function matchTitle() {
  const mi = state.match, win = mi.winning_team, dur = mi.duration_s || 0;
  const ser = teamSoulsSeries();
  const sgn = win === 0 ? 1 : -1;
  let worst = 0, worstT = 0, maxLead = 0;
  for (const s of ser) { const l = s.lead * sgn; if (l < worst) { worst = l; worstT = s.t; } maxLead = Math.max(maxLead, Math.abs(s.lead)); }
  const W = TEAMS[win].name, L = TEAMS[1 - win].name, num = n => (Math.abs(n) / 1000).toFixed(1) + "k";
  if (worst <= -6000) return { title: "Comeback", sub: `${W} won in ${fmtTime(dur)} after trailing by ${num(worst)} souls at ${fmtTime(worstT)}.`, rule: "The winners were behind by 6,000 souls or more at some point." };
  const end = ser[ser.length - 1] || { lead: 0, tot: 1 };
  if (Math.abs(end.lead) / Math.max(1, end.tot) > 0.12 && dur < 1800) return { title: "Stomp", sub: `${W} led from start to finish and closed it in ${fmtTime(dur)}.`, rule: "The winners never trailed and ended 12% or more ahead." };
  if (dur >= 2400) return { title: "Marathon", sub: `${W} outlasted ${L} over ${fmtTime(dur)}.`, rule: "Longer than 40 minutes." };
  return { title: "Coin Flip", sub: `Neither team led by more than ${num(maxLead)} souls. ${W} took it in ${fmtTime(dur)}.`, rule: "The lead never passed 6,000 souls." };
}
function teamTags() {
  const tot = (team, f) => state.players.filter(p => p.team === team).reduce((a, p) => a + f(p), 0);
  const last = p => p.stats[p.stats.length - 1] || {};
  const tags = [];
  const k = [0, 1].map(t => tot(t, p => p.raw.kills || 0)), o = [0, 1].map(t => tot(t, p => last(p).boss_damage || 0));
  const win = state.match.winning_team, lose = 1 - win;
  if (k[lose] > k[win]) tags.push({ name: "Won the fights, lost the game", tone: "y", team: lose, rule: `${TEAMS[lose].name} got ${k[lose]} kills to ${k[win]} and still lost.` });
  else tags.push({ name: "Out-fought", tone: "g", team: win, rule: `${TEAMS[win].name} got ${k[win]} kills to ${k[lose]}.` });
  const ob = o[0] > o[1] ? 0 : 1;
  tags.push({ name: "Objective focused", tone: "g", team: ob, rule: `${TEAMS[ob].name} did ${fmtStat(o[ob])} objective damage to ${fmtStat(o[1 - ob])}.` });
  return tags;
}
function top3Html(cls) {
  const rows = valveRows();
  const me = sumPick(), mine = rows.find(r => r.p.slot === me.slot);
  return `<div class="sumTop3 ${cls || ""}"><span class="lbl">MVP</span>` + rows.slice(0, 3).map(r =>
    `<button class="t3" data-slot="${r.p.slot}" style="--tc:${TEAMS[r.p.team].c}" title="Open the MVP tab">${portrait(r.p, "pt")}<span class="t3n"><b>${r.place}. ${esc(r.p.hero)}</b><em>${r.score.toFixed(1)}${r.p.mvp === 1 ? ` <span class="badge">MVP</span>` : r.p.mvp > 1 ? ` <span class="badge key">KEY</span>` : ""}</em></span></button>`).join("") +
    (mine.place > 3 ? `<span class="t3you">You: ${ordinal(mine.place)}</span>` : "") + `</div>`;
}
function matchStripHtml() {
  const t = matchTitle();
  return `<div class="sumMatch">
    <div class="mt" title="${esc(t.rule)}"><span class="mtTitle">${esc(t.title)}</span><span class="mtSub">${esc(t.sub)}</span></div>
    <div class="mtTags">${teamTags().map(x => tagHtml(x, TEAMS[x.team].c)).join("")}</div>
    ${top3Html()}
  </div>`;
}

// ---------- hero level ----------
function laneInfo(p) {
  const S = window.PM_SCORE, norms = window.SNAP_NORMS, t = 540;
  const mates = state.players.filter(q => q.team === p.team && q.lane === p.lane);
  const opp = state.players.filter(q => q.team !== p.team && q.lane === p.lane);
  if (!opp.length || !p.lane) return null;
  const souls = ps => ps.reduce((a, q) => a + ((snapAt(q, t) || {}).net_worth || 0), 0);
  const a = souls(mates), b = souls(opp), gap = (a - b) / Math.max(1, a, b);
  const me = S.laneScore(p.raw, norms, t), mate = mates.find(q => q !== p);
  const mateS = mate ? S.laneScore(mate.raw, norms, t) : null;
  let word, tone, why;
  if (Math.abs(gap) < 0.10) { word = "Even lane"; tone = "y"; why = `Within ${Math.max(1, Math.floor(Math.abs(gap) * 100))}% on souls at 9:00.`; }
  else if (gap > 0) { word = "Won lane"; tone = "g"; why = `Up ${Math.round(gap * 100)}% on souls at 9:00 (${num0(a)} to ${num0(b)}).`; }
  else {
    tone = "r";
    word = mate && mateS != null && me - mateS <= -1.0 ? "Fell behind" : mate && mateS != null && mateS - me <= -1.0 ? "Lost lane, not on you" : "Lost as a duo";
    why = `Down ${Math.round(-gap * 100)}% on souls at 9:00 (${num0(a)} to ${num0(b)}).`;
  }
  const lane = LANES_BY_COLOR[p.lane] || "";
  return { mates, opp, a, b, gap, word, tone, why, lane };
}
const num0 = n => Math.round(n).toLocaleString("en-US");
// Fights: every death in the lobby, grouped while they are less than 15 s apart. 3 or more deaths = a fight.
function fights() {
  const evs = deathEvents();
  const out = [];
  let cur = null;
  for (const e of evs) {
    if (cur && e.t - cur.end <= 15) { cur.evs.push(e); cur.end = e.t; }
    else { cur = { start: e.t, end: e.t, evs: [e] }; out.push(cur); }
  }
  return out.filter(f => f.evs.length >= 3).map(f => {
    const d = [0, 0];
    for (const e of f.evs) d[e.victim.team]++;
    return Object.assign(f, { deaths: d, winner: d[0] === d[1] ? null : d[0] < d[1] ? 0 : 1 });
  });
}
function fightRole(f, p) {
  const k = f.evs.filter(e => e.killer === p).length, d = f.evs.filter(e => e.victim === p).length, a = f.evs.filter(e => e.assists.includes(p)).length;
  return { k, d, a, in: k + d + a > 0 };
}
function fightSummary(p) {
  const fs = fights(), mine = fs.filter(f => fightRole(f, p).in);
  const won = mine.filter(f => f.winner === p.team).length;
  let best = null;
  for (const f of mine) { const r = fightRole(f, p); if (!best || r.k + r.a * 0.5 > best.r.k + best.r.a * 0.5) best = { f, r }; }
  const first = fs.filter(f => f.evs[0].killer === p).length;
  return { fs, mine, won, best, first };
}
function tagsFor(p, early) {
  const g = gradedStats(p), tags = [];
  const by = i => g.find(s => s.i === i);
  const hero = (window.HERO_NAMES || {})[heroRow(p).v.graded_hero] || p.hero;
  const say = (s, extra) => `${s.label}: ${fmtV(s, s.val)}, an average ${hero} gets ${fmtAvg(s, s.avg)}.${extra ? " " + extra : ""}`;
  const K = by(0), D = by(2), A = by(1), DM = by(5), O = by(4), S = by(3);
  if (K.z >= 1.5) tags.push({ name: K.place === 1 ? "Top fragger" : "Killing spree", tone: "g", z: K.z, rule: say(K, `Top 7% for this hero.`) });
  if (K.z >= 1.0 && A.z <= -0.5) tags.push({ name: "Lone wolf", tone: "y", z: 1.2, rule: `${fmtV(K, K.val)} kills but ${fmtV(A, A.val)} assists. An average ${hero} gets ${fmtAvg(K, K.avg)} and ${fmtAvg(A, A.avg)}.` });
  if (A.z >= 1.2) tags.push({ name: "Team player", tone: "g", z: A.z, rule: say(A) });
  if (D.z >= 1.0) tags.push({ name: "Hard to kill", tone: "g", z: D.z, rule: say(D) });
  if (D.z <= -1.3) tags.push({ name: "Respawn regular", tone: "r", z: -D.z, rule: say(D, "Red tags need a bigger gap than green ones.") });
  if (DM.z >= 1.2) tags.push({ name: "Damage dealer", tone: "g", z: DM.z, rule: say(DM) });
  if (DM.z <= -1.3) tags.push({ name: "Low damage", tone: "r", z: -DM.z, rule: say(DM) });
  if (O.z >= 1.2) tags.push({ name: "Tower taker", tone: "g", z: O.z, rule: say(O) });
  if (S.z >= 1.2) tags.push({ name: "Soul hoarder", tone: "g", z: S.z, rule: say(S) });
  if (early) return tags.sort((a, b) => (b.tone === "r") - (a.tone === "r") || b.z - a.z);
  const ph = valveCache().phase.find(r => r.slot === p.slot);
  if (ph && ph.late_valve != null) {
    if (ph.late_valve - ph.early_valve >= 3) tags.push({ name: "Late bloomer", tone: "y", z: 1, rule: `Before 15:00 ${signed(ph.early_valve, 1)}, after 15:00 ${signed(ph.late_valve, 1)}, against this hero's normal for each half.` });
    if (ph.early_valve - ph.late_valve >= 3) tags.push({ name: "Fast starter", tone: "y", z: 1, rule: `Before 15:00 ${signed(ph.early_valve, 1)}, after 15:00 ${signed(ph.late_valve, 1)}.` });
  }
  const ln = laneInfo(p);
  if (ln && ln.tone === "g" && ln.gap >= 0.2) tags.push({ name: "Lane bully", tone: "g", z: 1.1, rule: ln.why });
  const fsum = fightSummary(p);
  if (fsum.first >= 3) tags.push({ name: "Fight starter", tone: "g", z: 1.0, rule: `Got the first kill in ${fsum.first} of the ${fsum.fs.length} fights.` });
  // No "Dropped the bag" tag: Valve's counter includes bags picked up from others (Graphs plan, answer 23A).
  // Red always shows; then the strongest greens and yellows. At most 4 on the card, the rest behind "+N".
  return tags.sort((a, b) => (b.tone === "r") - (a.tone === "r") || b.z - a.z);
}
function tagHtml(t, dot) {
  const sign = t.tone === "g" ? "+" : t.tone === "r" ? "−" : "~";
  return `<span class="sumTag ${t.tone}" title="${esc(t.rule)}">${dot ? `<i style="background:${dot}"></i>` : `<b>${sign}</b>`}${esc(t.name)}</span>`;
}
function tagsRowHtml(p, max, early) {
  const t = tagsFor(p, early), shown = t.slice(0, max || 4), rest = t.length - shown.length;
  return `<div class="sumTags">${shown.map(x => tagHtml(x)).join("")}${rest > 0 ? `<span class="sumTag more" title="${esc(t.slice(shown.length).map(x => x.name).join(", "))}">+${rest}</span>` : ""}</div>`;
}
function verdict(p) {
  const rows = valveRows(), r = rows.find(x => x.p.slot === p.slot);
  const won = state.match.winning_team === p.team;
  const g = gradedStats(p), best = g.slice().sort((a, b) => b.z - a.z)[0], worst = g.slice().sort((a, b) => a.z - b.z)[0];
  const teamPlace = 1 + rows.filter(x => x.p.team === p.team && x.score > r.score).length;
  const lobbyBest = g.filter(s => s.place === 1);
  if (!won && teamPlace === 1 && r.score > 1.5) return `Did your job. The team didn't. ${fmtV(best, best.val)} ${best.say}, ${lobbyBest.includes(best) ? "most in the lobby" : "well above a normal game"}.`;
  if (won && p.mvp === 1) return `Carried, and Valve agrees. ${fmtV(best, best.val)} ${best.say} against a hero average of ${fmtAvg(best, best.avg)}.`;
  if (won && r.score < -1.5) return `Got carried. It happens. ${fmtV(worst, worst.val)} ${worst.say}, a normal game is ${fmtAvg(worst, worst.avg)}.`;
  if (r.score < -2) return `Rough one. ${fmtV(worst, worst.val)} ${worst.say} where this hero usually has ${fmtAvg(worst, worst.avg)}.`;
  return `${r.score >= 0 ? "Solid" : "Quiet"} game. Best at ${best.say} (${fmtV(best, best.val)}), weakest at ${worst.say} (${fmtV(worst, worst.val)}).`;
}
function statCardHtml(s, compact) {
  const up = s.z >= 0, cls = Math.abs(s.z) < 0.25 ? "even" : up ? "pos" : "neg";
  const diff = s.low ? s.avg - s.val : s.val - s.avg;
  const arrow = cls === "even" ? "≈" : up ? UP : DOWN;
  const word = cls === "even" ? "about average" : s.low ? `${fmtAvg(s, Math.abs(diff))} ${up ? "fewer" : "more"} than avg` : `${fmtAvg(s, Math.abs(diff))} ${up ? "above" : "below"} avg`;
  return `<div class="sumStat${compact ? " compact" : ""}${s.place === 1 ? " best" : ""}" title="${esc(s.label)}: ${esc(fmtV(s, s.val))}. Hero average ${esc(fmtAvg(s, s.avg))}. ${ordinal(s.place)} of ${s.n} in this match.${s.low ? " Fewer is better." : ""}">
    <span class="sl">${esc(compact ? s.short || s.label : s.label)}</span>
    <span class="sv">${esc(fmtV(s, s.val))}</span>
    <span class="sd ${cls}">${arrow} ${esc(word)}</span>
    <span class="sp">${s.place === 1 ? `<span class="topTag">Lobby best</span>` : `${ordinal(s.place)} of ${s.n}`}</span>
  </div>`;
}
function heroHeadHtml(p, opts) {
  const T = TEAMS[p.team], won = state.match.winning_team === p.team;
  const r = valveRows().find(x => x.p.slot === p.slot);
  const k = p.raw;
  return `<div class="sumHead" style="--tc:${T.c}">
    ${cardFace(p, opts && opts.small ? "lg" : "xl")}
    <div class="whyName">
      <div class="hn">${esc(heroName(p))}</div>
      <div class="meta"><span style="color:${T.c}">${T.color}</span> · <span class="${won ? "wonW" : "lostW"}">${won ? "Won" : "Lost"}</span> · ${p.lane && LANES_BY_COLOR[p.lane] ? LANES_BY_COLOR[p.lane] + " lane" : "No lane"}</div>
      ${rankHtml(p.badge) || `<span class="rank none">Unranked</span>`}
      <div class="kda"><b>${k.kills}</b> / <b class="d">${k.deaths}</b> / <b>${k.assists}</b><span>${fmtStat(p.souls)} souls</span></div>
    </div>
    <div class="whyScore">${opts && opts.early ? `<span>Valve's pick</span>` : `<b>${ordinal(r.place)}</b><span>of 12 · ${r.score.toFixed(1)} pts</span>`}${p.mvp === 1 ? `<span class="badge">MVP</span>` : p.mvp > 1 ? `<span class="badge key">KEY PLAYER</span>` : ""}</div>
  </div>`;
}
function itemsHtml(p) {
  const its = itemsOf(p).filter(it => !it.sold);
  return `<div class="sumItems"><div class="accHead"><span>Final build</span><span class="accSub">${its.length} items, hover for when</span></div><div class="icons">` +
    its.map(it => `<i class="sumItem" style="--sc:${ITEM_SLOTS[it.slot].c};background-image:url('assets/items/${it.icon}.webp')" title="${esc(it.name)}, bought ${fmtTime(it.t)}"></i>`).join("") + `</div></div>`;
}
// Valve's accolades, short: tier pips, name, and whether it was the lobby best. Full text on hover.
function accHtml(p) {
  const A = window.ACCOLADES || {}, best = {};
  for (const q of state.players) for (const a of q.raw.accolades || []) {
    const v = Number(a.accolade_stat_value) || 0;
    if (!best[a.accolade_id] || v > best[a.accolade_id]) best[a.accolade_id] = v;
  }
  const mine = (p.raw.accolades || []).filter(a => A[a.accolade_id] && a.accolade_threshold_achieved >= 0)
    .map(a => ({ def: A[a.accolade_id], tier: Math.min(3, a.accolade_threshold_achieved + 1), v: Number(a.accolade_stat_value) || 0, top: (Number(a.accolade_stat_value) || 0) >= best[a.accolade_id] }))
    .sort((x, y) => y.top - x.top || y.tier - x.tier).slice(0, 4);
  if (!mine.length) return "";
  return `<div class="sumAcc"><div class="accHead"><span>Valve's accolades</span><span class="accSub">top ${mine.length}, hover for the stat</span></div>` + mine.map(x =>
    `<div class="saRow" title="${esc((x.v === 1 ? x.def[1] : x.def[2]).replace("{v}", fmtStat(x.v)))}"><span class="pips">${[1, 2, 3].map(i => `<i class="${i <= x.tier ? "on" : ""}"></i>`).join("")}</span><span class="an">${esc(x.def[0])}</span>${x.top ? `<span class="topTag">Lobby best</span>` : ""}</div>`).join("") + `</div>`;
}
function laneHtml(p) {
  const ln = laneInfo(p);
  if (!ln) return "";
  const face = q => `<span class="face" style="--tc:${TEAMS[q.team].c}">${cardImg(q)}</span>`;
  return `<div class="sumBlock sumLane"><div class="accHead"><span>Lane</span><span class="accSub">${esc(ln.lane)} lane, souls at 9:00</span></div>
    <div class="lnRow"><span class="faces">${ln.mates.map(face).join("")}</span><span class="lnVs"><b>${num0(ln.a)}</b><em>vs</em><b>${num0(ln.b)}</b></span><span class="faces">${ln.opp.map(face).join("")}</span></div>
    <div class="lnVerdict ${ln.tone}"><span class="sumTag ${ln.tone}"><b>${ln.tone === "g" ? "+" : ln.tone === "r" ? "−" : "~"}</b>${esc(ln.word)}</span><span>${esc(ln.why)}</span></div></div>`;
}
function foughtHtml(p) {
  const mu = muParse(state.match);
  if (!mu) return "";
  const n = mu.times.length, tot = o => Object.values(o || {}).reduce((a, arr) => a + muAt(arr, n - 1, n), 0);
  const enemies = state.players.filter(q => q.team !== p.team);
  const out = enemies.map(q => ({ q, v: tot((mu.dmg[p.slot] || {})[q.slot]) })).sort((a, b) => b.v - a.v);
  const inc = enemies.map(q => ({ q, v: tot((mu.dmg[q.slot] || {})[p.slot]) })).sort((a, b) => b.v - a.v);
  const row = (lbl, x) => `<div class="fRow"><span class="fl">${lbl}</span>${portrait(x.q, "mini")}<span class="fn">${esc(x.q.hero)}</span><span class="fv">${fmtStat(x.v)}</span></div>`;
  return `<div class="sumBlock"><div class="accHead"><span>Who you fought</span><span class="accSub">hero damage, whole match</span></div>${row("Hit hardest", out[0])}${row("Hurt most by", inc[0])}</div>`;
}
// The match on one line: team soul lead behind, fights as markers (filled = your team won it, ring = you were in it),
// your kills and deaths on their own row, objectives on top.
function timelineHtml(p, W, H, opts) {
  opts = opts || {};
  const dur = state.match.duration_s || 1, ser = teamSoulsSeries(), fs = fights();
  const m = { l: 10, r: 10 }, X = t => m.l + (t / dur) * (W - m.l - m.r);
  const top = 30, mid = top + (H - top - 44) / 2, amp = (H - top - 44) / 2 - 4;
  const vmax = Math.max(3000, ...ser.map(s => Math.abs(s.lead)));
  const sgn = p.team === 0 ? 1 : -1; // your team's lead points up
  const pts = [[0, 0], ...ser.map(s => [s.t, s.lead * sgn])];
  const path = pts.map(([t, v], i) => `${i ? "L" : "M"}${X(t).toFixed(1)},${(mid - (v / vmax) * amp).toFixed(1)}`).join("");
  const area = `${path}L${X(pts[pts.length - 1][0]).toFixed(1)},${mid}L${X(0)},${mid}Z`;
  const T = TEAMS[p.team], O = TEAMS[1 - p.team];
  let svg = `<svg class="tlSvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><clipPath id="tlUp"><rect x="0" y="0" width="${W}" height="${mid}"/></clipPath><clipPath id="tlDn"><rect x="0" y="${mid}" width="${W}" height="${H}"/></clipPath></defs>
    <path d="${area}" fill="${T.c}" opacity="0.28" clip-path="url(#tlUp)"/><path d="${area}" fill="${O.c}" opacity="0.28" clip-path="url(#tlDn)"/>
    <path d="${path}" fill="none" stroke="rgba(255,239,215,0.5)" stroke-width="1.5"/>
    <line x1="${m.l}" x2="${W - m.r}" y1="${mid}" y2="${mid}" stroke="rgba(255,239,215,0.25)"/>`;
  for (let t = 300; t < dur; t += 300) svg += `<line x1="${X(t)}" x2="${X(t)}" y1="${top}" y2="${H - 20}" stroke="rgba(255,239,215,0.06)"/><text x="${X(t)}" y="${H - 4}" class="tlTick">${fmtTime(t)}</text>`;
  if (opts.phases) for (const [t0, t1, lbl] of [[0, 540, "Lane"], [540, 1500, "Mid game"], [1500, dur, "Late game"]]) {
    if (t0 >= dur) continue;
    svg += `<line x1="${X(t1)}" x2="${X(t1)}" y1="${top - 6}" y2="${H - 20}" stroke="rgba(255,239,215,0.3)" stroke-dasharray="3 4"/><text x="${(X(t0) + X(Math.min(t1, dur))) / 2}" y="${top + 12}" class="tlPhase">${lbl}</text>`;
  }
  for (const f of fs) {
    const r = fightRole(f, p), x = X((f.start + f.end) / 2), sz = 5 + Math.min(8, f.evs.length);
    const c = f.winner == null ? "#bbb" : TEAMS[f.winner].c;
    svg += `<circle cx="${x}" cy="${mid}" r="${sz}" fill="${c}" stroke="${r.in ? "#FFEFD7" : "#000a"}" stroke-width="${r.in ? 2.5 : 1}"><title>Fight at ${fmtTime(f.start)}: ${f.evs.length} deaths (${TEAMS[p.team].name} lost ${f.deaths[p.team]}, ${TEAMS[1 - p.team].name} lost ${f.deaths[1 - p.team]}).${r.in ? ` You: ${r.k} kills, ${r.a} assists, ${r.d} deaths.` : " You weren't in it."}</title></circle>`;
  }
  // your own kills and deaths
  const rowY = H - 30;
  for (const e of deathEvents()) {
    if (e.killer === p) svg += `<path d="M${X(e.t) - 5},${rowY + 4}L${X(e.t)},${rowY - 5}L${X(e.t) + 5},${rowY + 4}Z" fill="#58D86A"><title>Killed ${esc(e.victim.hero)} at ${fmtTime(e.t)}</title></path>`;
    if (e.victim === p) svg += `<g transform="translate(${X(e.t)},${rowY})"><path d="M-4,-4L4,4M4,-4L-4,4" stroke="#E8604C" stroke-width="2.5"/><title>Died to ${esc(e.killer ? e.killer.hero : "troopers or a guardian")} at ${fmtTime(e.t)}</title></g>`;
  }
  svg += `</svg>`;
  let marks = "";
  for (const ev of state.events) marks += `<img class="tlObj" src="${ev.icon}" style="left:${X(ev.t) - 9}px;${ev.mid ? "" : `filter:drop-shadow(0 0 2px ${ev.color})`}" title="${esc(ev.text)} at ${fmtTime(ev.t)}">`;
  return `<div class="tlWrap" style="width:${W}px;height:${H}px">${svg}${marks}</div>`;
}
function fightsBlockHtml(p, W, H, opts) {
  const s = fightSummary(p);
  const bestTxt = s.best ? `Best fight: ${fmtTime(s.best.f.start)}, ${s.best.r.k} kill${s.best.r.k === 1 ? "" : "s"} and ${s.best.r.a} assist${s.best.r.a === 1 ? "" : "s"}${s.best.f.winner === p.team ? ", won it" : ""}.` : "";
  return `<div class="sumBlock sumFights">
    <div class="accHead"><span>Fights</span><span class="accSub">${s.fs.length} fights of 3+ deaths. You were in ${s.mine.length}, your team won ${s.won} of those. ${esc(bestTxt)}</span>
      <span class="tlKey"><span><i class="kTri"></i>your kills</span><span><i class="kX"></i>your deaths</span><span><i class="kRing"></i>you were in it</span><span><i class="kFill"></i>fill = who won it</span></span></div>
    ${timelineHtml(p, W, H, opts)}
  </div>`;
}
function earlyLateHtml(p) {
  const h = whenHtml(p);
  return h ? `<div class="sumBlock">${h.replace("When they contributed", "Before and after 15:00")}</div>` : "";
}
function droppedHtml(p) {
  const h = soulsDropHtml(p);
  return h ? `<div class="sumBlock">${h}</div>` : "";
}

// ---------- layouts ----------
function layoutA(p) {
  const g = gradedStats(p);
  return `<div class="sumA">
    ${matchStripHtml()}
    <div class="colHero sumPanel" style="--tc:${TEAMS[p.team].c}">
      ${heroHeadHtml(p)}
      <p class="sumVerdict">${esc(verdict(p))}</p>
      ${tagsRowHtml(p)}
      ${itemsHtml(p)}
      ${accHtml(p)}
      <div class="sumActions"><button class="graphOptionButton">Compare with…</button><button class="graphOptionButton">Open in MVP</button><button class="graphOptionButton">Copy link</button></div>
    </div>
    <div class="colStats">
      <div class="accHead"><span>Against an average ${esc(p.hero)}</span><span class="accSub">${UP} better, ${DOWN} worse than this hero's average. Gold = best in the lobby.</span></div>
      <div class="statGrid">${g.map(s => statCardHtml(s)).join("")}</div>
      ${fightsBlockHtml(p, 870, 330)}
    </div>
    <div class="colSide">
      ${laneHtml(p)}
      ${earlyLateHtml(p)}
      ${foughtHtml(p)}
      ${droppedHtml(p)}
    </div>
  </div>`;
}
function laneCardsHtml() {
  const lanes = [...new Set(state.players.filter(q => q.team === state.leftTeam && q.lane).map(q => q.lane))];
  return lanes.map(l => {
    const p = state.players.find(q => q.team === state.leftTeam && q.lane === l);
    const ln = laneInfo(p);
    if (!ln) return "";
    const face = q => `<span class="face" style="--tc:${TEAMS[q.team].c}">${cardImg(q)}</span>`;
    return `<div class="sumBlock laneCard"><div class="accHead"><span>${esc(ln.lane)} lane</span><span class="accSub">souls at 9:00</span></div>
      <div class="lnRow"><span class="faces">${ln.mates.map(face).join("")}</span><span class="lnVs"><b>${num0(ln.a)}</b><em>vs</em><b>${num0(ln.b)}</b></span><span class="faces">${ln.opp.map(face).join("")}</span></div>
      <div class="lnVerdict ${ln.tone}"><span class="sumTag ${ln.tone}"><b>${ln.tone === "g" ? "+" : ln.tone === "r" ? "−" : "~"}</b>${esc(ln.word.replace("Lost lane, not on you", "Lost lane"))}</span><span>${esc(ln.why)}</span></div></div>`;
  }).join("");
}
function podiumHtml() {
  const rows = valveRows().slice(0, 3);
  const order = [rows[1], rows[0], rows[2]];
  return `<div class="podium">` + order.map(r => `<div class="pod p${r.place}" style="--tc:${TEAMS[r.p.team].c}">
    ${cardFace(r.p, "lg")}<div class="pn">${r.place}. ${esc(r.p.hero)}</div><div class="ps">${r.score.toFixed(1)} pts${r.p.mvp === 1 ? ` <span class="badge">MVP</span>` : r.p.mvp > 1 ? ` <span class="badge key">KEY</span>` : ""}</div>
    <div class="pw">${esc(shortWhy(r.p))}</div></div>`).join("") + `</div>`;
}
function shortWhy(p) { const b = gradedStats(p).sort((a, b) => b.z - a.z)[0]; return `${fmtV(b, b.val)} ${b.say} (avg ${fmtAvg(b, b.avg)})`; }
function layoutB(p) {
  const t = matchTitle(), g = gradedStats(p);
  return `<div class="sumB">
    <div class="bTop">
      <div class="bTitle" title="${esc(t.rule)}"><span class="mtTitle mtBig">${esc(t.title)}</span><span class="mtSub">${esc(t.sub)}</span>
        <div class="mtTags">${teamTags().map(x => tagHtml(x, TEAMS[x.team].c)).join("")}</div>
        ${timelineHtml(p, 600, 120)}
      </div>
      ${podiumHtml()}
      <div class="bLanes">${laneCardsHtml()}</div>
    </div>
    <div class="bYou sumPanel" style="--tc:${TEAMS[p.team].c}">
      <div class="bYouL">${heroHeadHtml(p, { small: true })}<p class="sumVerdict">${esc(verdict(p))}</p>${tagsRowHtml(p)}${itemsHtml(p)}</div>
      <div class="bYouR"><div class="accHead"><span>Against an average ${esc(p.hero)}</span><span class="accSub">${UP} better, ${DOWN} worse. Click any player up top to switch.</span></div>
        <div class="statGrid six">${g.map(s => statCardHtml(s, true)).join("")}</div>
        <div class="bYouMore">${earlyLateHtml(p)}${foughtHtml(p)}</div></div>
    </div>
  </div>`;
}
function phaseCaps(p) {
  const at = t => snapAt(p, t) || {};
  const ev = deathEvents();
  const cnt = (t0, t1) => ({ k: ev.filter(e => e.killer === p && e.t >= t0 && e.t < t1).length, d: ev.filter(e => e.victim === p && e.t >= t0 && e.t < t1).length });
  const ln = laneInfo(p), dur = state.match.duration_s;
  const ph = valveCache().phase.find(r => r.slot === p.slot) || {};
  const a = cnt(0, 540), b = cnt(540, 1500), c = cnt(1500, dur + 1);
  const objs = state.events.filter(e => !e.mid && e.team !== p.team);
  return [
    { lbl: "Lane, 0:00 to 9:00", tone: ln ? ln.tone : "y", head: ln ? ln.word : "No lane", body: `${a.k} kills, ${a.d} deaths. ${ln ? ln.why : ""}` },
    { lbl: "Mid game, 9:00 to 25:00", tone: b.k > b.d ? "g" : b.k < b.d ? "r" : "y", head: b.k > b.d + 2 ? "Took over" : b.k < b.d ? "Rough stretch" : "Trading", body: `${b.k} kills, ${b.d} deaths. Souls at 25:00: ${num0(at(1440).net_worth || 0)}.` },
    { lbl: `Late game, 25:00 to ${fmtTime(dur)}`, tone: ph.late_valve >= 1 ? "g" : ph.late_valve <= -1 ? "r" : "y", head: ph.late_valve >= 3 ? "Best stretch of the game" : ph.late_valve >= 1 ? "Strong finish" : ph.late_valve <= -1 ? "Faded" : "Held steady", body: `${c.k} kills, ${c.d} deaths. After 15:00 graded ${signed(ph.late_valve || 0, 1)} against a normal ${p.hero}.` },
  ];
}
function layoutC(p) {
  const g = gradedStats(p), t = matchTitle();
  return `<div class="sumC">
    <div class="cHead sumPanel" style="--tc:${TEAMS[p.team].c}">${heroHeadHtml(p, { small: true })}
      <div class="cMid"><p class="sumVerdict">${esc(verdict(p))}</p>${tagsRowHtml(p, 5)}</div>
      <div class="cMatch" title="${esc(t.rule)}"><span class="mtTitle">${esc(t.title)}</span><span class="mtSub">${esc(t.sub)}</span>${top3Html("vert")}</div>
    </div>
    <div class="cStory">
      ${fightsBlockHtml(p, 1844 - 32, 330, { phases: true })}
      <div class="cCaps">${phaseCaps(p).map(c => `<div class="sumBlock cap"><div class="accHead"><span>${esc(c.lbl)}</span></div><div class="capHead"><span class="sumTag ${c.tone}"><b>${c.tone === "g" ? "+" : c.tone === "r" ? "−" : "~"}</b>${esc(c.head)}</span></div><div class="capBody">${esc(c.body)}</div></div>`).join("")}</div>
    </div>
    <div class="cStats">${g.map(s => statCardHtml(s, true)).join("")}</div>
  </div>`;
}
// Early view: only what the game's own scoreboard has (K/D/A, souls, damage, objective damage, healing, items, MVP marks).
function layoutEarly(p) {
  const g = gradedStats(p);
  const wait = (title, what) => `<div class="sumBlock waitBlock"><div class="accHead"><span>${title}</span></div><div class="waitTxt">${what}</div></div>`;
  return `<div class="sumA early">
    <div class="sumMatch"><div class="mt"><span class="earlyTag" title="Numbers from the game's own scoreboard. Full stats replace them when the match file arrives.">EARLY</span><span class="mtSub">${esc(TEAMS[state.match.winning_team].name)} won in ${fmtTime(state.match.duration_s)}. Full stats in about a minute: lane, fights, MVP and Matchups fill in by themselves.</span></div>
      <div class="loadBar"><i style="width:38%"></i><span>Full stats: about 55 s left</span></div></div>
    <div class="colHero sumPanel" style="--tc:${TEAMS[p.team].c}">
      ${heroHeadHtml(p, { early: true })}
      <p class="sumVerdict">${esc(verdict(p))}</p>
      ${tagsRowHtml(p, 4, true)}
      ${itemsHtml(p)}
    </div>
    <div class="colStats">
      <div class="accHead"><span>Against an average ${esc(p.hero)}</span><span class="accSub">From the scoreboard. Hover a number for the hero average.</span></div>
      <div class="statGrid">${g.map(s => statCardHtml(s)).join("")}</div>
      ${wait("Fights", "Needs the full match file: when each death happened and who was there.")}
    </div>
    <div class="colSide">
      ${wait("Lane", "Needs souls at 9:00. Coming with full stats.")}
      ${wait("Before and after 15:00", "Needs the 3-minute snapshots. Coming with full stats.")}
      ${wait("Who you fought", "Needs the damage matrix. Coming with full stats.")}
    </div>
  </div>`;
}

window.renderSummary = function renderSummary() {
  const view = $("sumView"), p = sumPick();
  view.className = "sumView";
  view.innerHTML = SUM_EARLY ? layoutEarly(p) : SUM_LAYOUT === "B" ? layoutB(p) : SUM_LAYOUT === "C" ? layoutC(p) : layoutA(p);
  document.querySelectorAll("#tabs .tab").forEach(b => {
    const wait = SUM_EARLY && ["mvp", "matchups"].includes(b.dataset.tab);
    b.classList.toggle("wait", wait);
    b.title = wait ? "Waiting for full stats" : "";
  });
  view.querySelectorAll(".t3").forEach(b => b.onclick = () => { state.tab = "mvp"; state.mvpPick = Number(b.dataset.slot); renderAll(); });
};
