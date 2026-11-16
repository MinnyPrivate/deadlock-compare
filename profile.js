// Postmortem Profile (prototype). One player's form, heroes, patterns, rank journey and matches.
// Data: deadlock-api stored match history /v1/players/{account_id}/match-history (one call, 100 req/s per IP),
// Steam name and avatar from /v1/players/steam, name search from /v1/players/steam-search.
// Nothing here looks at live matches: it only reads finished games.
"use strict";

const API = "https://api.deadlock-api.com/v1/";
const STEAM64_BASE = 76561197960265728n;
const $main = document.getElementById("main");
const $tip = document.getElementById("tip");
const $q = document.getElementById("q");

// ---------- small helpers ----------
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const fmt1 = x => (Math.round(x * 10) / 10).toFixed(1);
const kSouls = n => (n >= 1000 ? fmt1(n / 1000) + "k" : String(Math.round(n)));
const heroName = id => (window.HERO_NAMES && HERO_NAMES[id]) || "Hero " + id;
const heroImg = id => `assets/heroes/${Number(id) || 0}.png`;
const safeUrl = u => (typeof u === "string" && /^https:\/\//.test(u) ? u : "");
const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many || one + "s"}`;
function mmss(s) { const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; }
function ago(t) {
  const s = Date.now() / 1000 - t;
  if (s < 3600) return plural(Math.max(1, Math.round(s / 60)), "minute") + " ago";
  if (s < 86400) return plural(Math.round(s / 3600), "hour") + " ago";
  if (s < 86400 * 45) return plural(Math.round(s / 86400), "day") + " ago";
  return new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function dayKey(t) { const d = new Date(t * 1000); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }
function dayLabel(t) {
  const d = new Date(t * 1000), now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(t) === dayKey(now / 1000)) return "Today";
  if (dayKey(t) === dayKey(y / 1000)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
const clock = t => new Date(t * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// ---------- ranks (same art and rules as the Compare page, see app.js) ----------
const RANK_GLOW = ["#fff6", "#6b4e2f", "#7c6e63", "#8b9092", "#a57941", "#b9d0e0", "#ddb854", "#e3eade", "#d7e1eb", "#d2dcef", "#f2fed6", "#fafdfc"];
const RANK_DROP = [68, 68, 62, 68, 68, 68, 68, 42, 68, 46, 48, 30];
const RANK_NAMES = ["Obscurus", "Initiate", "Seeker", "Acolyte", "Sentinel", "Mystic", "Ritualist", "Emissary", "Oracle", "Phantom", "Ascendant", "Eternus"];
const SUBRANKS = ["", "I", "II", "III", "IV", "V", "VI"];
function rankOf(badge) {
  if (!badge) return null;
  const tier = Math.floor(badge / 10), sub = badge % 10;
  if (!RANK_NAMES[tier] || tier === 0) return null;
  return { tier, sub, name: SUBRANKS[sub] ? `${RANK_NAMES[tier]} ${SUBRANKS[sub]}` : RANK_NAMES[tier], img: `assets/ranks/${tier}.png`, mark: SUBRANKS[sub] || "" };
}
function rankHtml(badge, size) {
  const r = rankOf(badge);
  if (!r) return "";
  return `<span class="rank" style="--b:${size || 40}px"><span class="rk" style="--glow:${RANK_GLOW[r.tier]};--drop:${RANK_DROP[r.tier]}"><img src="${r.img}" alt="">${r.mark ? `<b>${r.mark}</b>` : ""}</span><span class="rn">${esc(r.name)}</span></span>`;
}
const badgeStep = b => Math.floor(b / 10) * 6 + (Math.max(1, b % 10) - 1);

// ---------- reading the player's input ----------
// Accepts a Steam profile link, a SteamID64, a SteamID3 ([U:1:123]), a plain account id, or a name.
function parseQuery(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  let m = s.match(/steamcommunity\.com\/profiles\/(\d{17})/i) || s.match(/^(7656\d{13})$/);
  if (m) return { id: Number(BigInt(m[1]) - STEAM64_BASE) };
  m = s.match(/^\[?U:1:(\d+)\]?$/i);
  if (m) return { id: Number(m[1]) };
  if (/^\d{1,10}$/.test(s)) return { id: Number(s) };
  m = s.match(/steamcommunity\.com\/id\/([^/?#]+)/i); // a custom Steam URL can't be turned into an id without Steam's key, so search its name
  return { q: m ? decodeURIComponent(m[1]) : s };
}

// ---------- network ----------
class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function getJson(url) {
  let r;
  try { r = await fetch(url); } catch (e) { throw new ApiError(0, "Couldn't reach deadlock-api. Check your connection and try again."); }
  if (r.status === 429) throw new ApiError(429, "deadlock-api says we're asking too fast. Wait a minute, then try again.");
  if (!r.ok) throw new ApiError(r.status, `deadlock-api answered with error ${r.status}.`);
  return r.json();
}

// ---------- recent profiles (this browser only) ----------
function recentGet() { try { return JSON.parse(localStorage.getItem("pm_recent_profiles") || "[]").slice(0, 6); } catch (e) { return []; } }
function recentAdd(p) {
  try {
    const list = recentGet().filter(x => x.id !== p.id);
    list.unshift(p);
    localStorage.setItem("pm_recent_profiles", JSON.stringify(list.slice(0, 6)));
  } catch (e) { /* storage blocked: fine */ }
}

// ---------- routing ----------
let loadSeq = 0;
function go(params, push) {
  const u = new URL(location.href);
  u.search = "";
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") u.searchParams.set(k, v);
  if (push) history.pushState(null, "", u); else history.replaceState(null, "", u);
  route();
}
function route() {
  const p = new URLSearchParams(location.search);
  hideTip();
  if (p.get("id")) return loadProfile(Number(p.get("id")), p.get("src"));
  if (p.get("q")) return searchPlayers(p.get("q"));
  renderHome();
}
window.addEventListener("popstate", route);
document.getElementById("search").addEventListener("submit", e => {
  e.preventDefault();
  const r = parseQuery($q.value);
  if (!r) return $q.focus();
  $q.blur();
  go(r.id != null ? { id: r.id } : { q: r.q }, true);
});
document.getElementById("home").addEventListener("click", e => { e.preventDefault(); $q.value = ""; go({}, true); });

// ---------- views: home, search, states ----------
function renderHome() {
  document.title = "Profile · Postmortem";
  const recent = recentGet();
  $main.innerHTML = `
    <section class="hero-empty">
      <h1>Find a player</h1>
      <p>Type a Steam name, or paste a Steam profile link or account ID in the box above.</p>
      <form class="search big" id="bigSearch" role="search" autocomplete="off">
        <input id="q2" type="search" placeholder="Name, Steam link or account ID" aria-label="Find a player" spellcheck="false">
        <button type="submit">Find</button>
      </form>
      ${recent.length ? `<div class="recent"><span class="lbl">Recently viewed</span>${recent.map(r => `
        <a class="chip person" href="?id=${r.id}" data-id="${r.id}">${safeUrl(r.avatar) ? `<img src="${esc(safeUrl(r.avatar))}" alt="">` : ""}${esc(r.name)}</a>`).join("")}</div>` : ""}
      <p class="fine">Built from public match data on deadlock-api. Only finished games, never live ones.</p>
    </section>`;
  const f = document.getElementById("bigSearch"), q2 = document.getElementById("q2");
  f.addEventListener("submit", e => { e.preventDefault(); $q.value = q2.value; document.getElementById("search").requestSubmit(); });
  $main.querySelectorAll("a[data-id]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); go({ id: a.dataset.id }, true); }));
  q2.focus();
}
function renderState(title, text, action) {
  $main.innerHTML = `<section class="state"><h2>${esc(title)}</h2>${text ? `<p>${text}</p>` : ""}${action ? `<button class="btn" id="stateAct">${esc(action.label)}</button>` : ""}</section>`;
  if (action) document.getElementById("stateAct").addEventListener("click", action.run);
}
function renderLoading(text) { $main.innerHTML = `<section class="state"><div class="spin" aria-hidden="true"></div><p>${esc(text)}</p></section>`; }

async function searchPlayers(q) {
  const my = ++loadSeq;
  $q.value = q;
  document.title = `"${q}" · Postmortem`;
  renderLoading(`Looking for "${q}"...`);
  try {
    const list = await getJson(`${API}players/steam-search?search_query=${encodeURIComponent(q)}&limit=12`);
    if (my !== loadSeq) return;
    if (!Array.isArray(list) || !list.length) {
      return renderState(`No players found for "${q}"`, "Name search only lists players with 5 or more games in the last 30 days. Paste their Steam profile link or account ID instead.");
    }
    $main.innerHTML = `<section class="card results"><div class="cardHead"><h2>Players matching "${esc(q)}"</h2><span class="sub">${plural(list.length, "result")}</span></div>
      <div class="resultList">${list.map(p => `
        <a class="result" href="?id=${Number(p.account_id)}" data-id="${Number(p.account_id)}">
          ${safeUrl(p.avatarmedium) ? `<img src="${esc(safeUrl(p.avatarmedium))}" alt="">` : `<span class="noAv"></span>`}
          <span class="rName">${esc(p.personaname)}</span>
          <span class="rMeta">${plural(Number(p.matches_played_last_30d) || 0, "game")} in the last 30 days</span>
          <span class="rId">ID ${Number(p.account_id)}</span>
        </a>`).join("")}</div></section>`;
    $main.querySelectorAll("a[data-id]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); go({ id: a.dataset.id }, true); }));
  } catch (e) {
    if (my !== loadSeq) return;
    renderState("Search didn't work", esc(e.message), { label: "Try again", run: () => searchPlayers(q) });
  }
}

// ---------- the profile ----------
// Only normal Deadlock games count: Street Brawl, bot games and private lobbies are left out.
const COUNTED_MODES = new Set([0, 1, 4, 8]); // invalid/old, unranked, ranked, new player placement
const isWin = m => (m.player_match_outcome === 1 ? true : m.player_match_outcome === 2 ? false : m.match_result === m.player_team);
let P = null; // the loaded profile and the user's choices on it

async function loadProfile(id, src) {
  const my = ++loadSeq;
  if (!Number.isFinite(id) || id <= 0 || id > 4294967295) return renderState("That ID doesn't look right", "Account IDs are numbers like 135548265. A Steam profile link works too.");
  $q.value = "";
  renderLoading("Loading match history...");
  const local = src && /^test\/[\w-]+\.json$/.test(src); // local test file: only files in this repo's test/ folder
  try {
    let profile = null, history;
    if (local) {
      const fx = await getJson(src);
      profile = fx.profile; history = fx.history;
    } else {
      const [h, prof] = await Promise.all([
        getJson(`${API}players/${id}/match-history`).catch(e => { if (e.status === 404) return []; throw e; }),
        getJson(`${API}players/steam?account_ids=${id}`).then(r => (Array.isArray(r) ? r[0] : null)).catch(() => null),
      ]);
      history = h; profile = prof;
    }
    if (my !== loadSeq) return;
    const all = (Array.isArray(history) ? history : []).slice().sort((a, b) => b.start_time - a.start_time);
    const games = all.filter(m => (m.game_mode == null || m.game_mode === 1) && COUNTED_MODES.has(m.match_mode ?? 0));
    const name = (profile && profile.personaname) || `Player ${id}`;
    document.title = `${name} · Postmortem`;
    if (!games.length) {
      return renderState(`No games found for ${name}`, all.length
        ? "This player only has Street Brawl, bot or private lobby games on record."
        : "deadlock-api has no stored games for this account yet. Very new or private accounts can show nothing.",
        { label: "Find someone else", run: () => { go({}, true); } });
    }
    recentAdd({ id, name, avatar: profile && safeUrl(profile.avatarmedium) });
    P = { id, profile, name, games, skipped: all.length - games.length, range: "all", hero: null, shown: 20 };
    renderProfile();
  } catch (e) {
    if (my !== loadSeq) return;
    renderState("Couldn't load this profile", esc(e.message), { label: "Try again", run: () => loadProfile(id, src) });
  }
}

const RANGES = [["all", "All games"], ["200", "Last 200"], ["50", "Last 50"]];
function inRange() { return P.range === "all" ? P.games : P.games.slice(0, Number(P.range)); }

// Hero averages from heronorms.js (23,968 recent matches): index 0 kills, 1 assists, 2 deaths.
function heroAvg(h) {
  const t = window.HERO_TABLE && HERO_TABLE.heroes[h];
  return t ? { k: t.mean[0], a: t.mean[1], d: t.mean[2], sdD: t.sd[2] } : { k: 6.5, a: 11.5, d: 7, sdD: 3.7 };
}
// (Kills + assists) per death, as a multiple of what this hero usually gets.
function kdaVsHero(m) {
  const a = heroAvg(m.hero_id);
  return ((m.player_kills + m.player_assists) / Math.max(1, m.player_deaths)) / ((a.k + a.a) / Math.max(1, a.d));
}

// One blunt word per match, graded against the hero's own average. Never "threw" or anything meaner.
function verdict(m) {
  const r = kdaVsHero(m), win = isWin(m), min = m.match_duration_s / 60;
  const tail = "Compares (kills + assists) per death with the average for " + heroName(m.hero_id) + ".";
  if (m.abandoned_time_s) return { w: "Left early", c: "neutral", rule: "Left the match before it ended." };
  if (win && r >= 1.6) return { w: "Unstoppable", c: "good", rule: `Won with ${fmt1(r)}x the usual K+A per death. ${tail}` };
  if (!win && r >= 1.6) return { w: "Unlucky", c: "good", rule: `Lost, but with ${fmt1(r)}x the usual K+A per death. ${tail}` };
  if (win && min < 25) return { w: "Stomp", c: "neutral", rule: "Won in under 25 minutes." };
  if (win && r < 0.6) return { w: "Along for the ride", c: "bad", rule: `Won with ${fmt1(r)}x the usual K+A per death. The team carried this one. ${tail}` };
  if (!win && r < 0.6) return { w: "Rough one", c: "bad", rule: `Lost with ${fmt1(r)}x the usual K+A per death. ${tail}` };
  if (min >= 45) return { w: "Marathon", c: "neutral", rule: "Went past 45 minutes." };
  return win ? { w: "Solid", c: "neutral", rule: `Won with about the usual K+A per death (${fmt1(r)}x). ${tail}` }
    : { w: "Close-ish", c: "neutral", rule: `Lost with about the usual K+A per death (${fmt1(r)}x). ${tail}` };
}

function summarize(list) {
  const n = list.length;
  if (!n) return null;
  let w = 0, k = 0, d = 0, a = 0, souls = 0, mins = 0;
  for (const m of list) { if (isWin(m)) w++; k += m.player_kills; d += m.player_deaths; a += m.player_assists; souls += m.net_worth; mins += m.match_duration_s / 60; }
  return { n, w, wr: w / n, kda: (k + a) / Math.max(1, d), k: k / n, d: d / n, a: a / n, spm: souls / Math.max(1, mins), mins: mins / n };
}
function streaks(list) { // list newest first
  let cur = 0, curWin = null;
  for (const m of list) { const w = isWin(m); if (curWin === null) curWin = w; if (w !== curWin) break; cur++; }
  let best = 0, run = 0;
  for (const m of list) { if (isWin(m)) { run++; best = Math.max(best, run); } else run = 0; }
  return { cur, curWin, best };
}
// Sessions: games less than 60 minutes apart (end of one to start of the next) belong together.
function withSessions(list) { // newest first in, oldest first out
  const out = list.slice().reverse();
  let idx = 0;
  out.forEach((m, i) => {
    const prev = out[i - 1];
    idx = prev && m.start_time - (prev.start_time + prev.match_duration_s) < 3600 ? idx + 1 : 1;
    m._game = idx; m._prev = prev && idx > 1 ? prev : null;
  });
  return out;
}

function profileTags(games) {
  const tags = [];
  const last50 = games.slice(0, 50), last20 = games.slice(0, 20);
  const s = streaks(games);
  if (s.cur >= 3 && s.curWin) tags.push({ t: "On a heater", c: "good", rule: `Won the last ${s.cur} games in a row.` });
  if (s.cur >= 3 && !s.curWin) tags.push({ t: "Cold streak", c: "bad", rule: `Lost the last ${s.cur} games in a row. It happens.` });
  const counts = {};
  for (const m of last50) counts[m.hero_id] = (counts[m.hero_id] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (top && last50.length >= 10) {
    const share = top[1] / last50.length;
    if (share >= 0.6) tags.push({ t: `${heroName(top[0])} one-trick`, c: "neutral", rule: `${heroName(top[0])} in ${pct(top[1], last50.length)}% of the last ${last50.length} games.` });
    else if (share >= 0.3) tags.push({ t: `${heroName(top[0])} main`, c: "neutral", rule: `${heroName(top[0])} in ${pct(top[1], last50.length)}% of the last ${last50.length} games.` });
  }
  const flex = Object.values(counts).filter(c => c >= 3).length;
  if (flex >= 7) tags.push({ t: "Flex pick", c: "neutral", rule: `${flex} different heroes with 3 or more games each in the last ${last50.length}.` });
  const ses = withSessions(games.slice(0, 300));
  const afterL = ses.filter(m => m._prev && !isWin(m._prev));
  if (afterL.length >= 10) {
    const wr = afterL.filter(isWin).length / afterL.length;
    if (wr >= 0.58) tags.push({ t: "Bounces back", c: "good", rule: `Won ${pct(wr * afterL.length, afterL.length)}% of games played right after a loss (${afterL.length} games).` });
    if (wr <= 0.4) tags.push({ t: "Losses come in pairs", c: "bad", rule: `Won only ${pct(wr * afterL.length, afterL.length)}% of games played right after a loss (${afterL.length} games). Maybe take a break after one.` });
  }
  if (last20.length >= 10) {
    let z = 0;
    for (const m of last20) { const a = heroAvg(m.hero_id); z += (m.player_deaths - a.d) / a.sdD; }
    z /= last20.length;
    if (z <= -0.4) tags.push({ t: "Hard to kill", c: "good", rule: `Died less than the average player on the same heroes over the last ${last20.length} games.` });
    if (z >= 0.4) tags.push({ t: "Respawn regular", c: "bad", rule: `Died more than the average player on the same heroes over the last ${last20.length} games.` });
  }
  const late = last50.filter(m => new Date(m.start_time * 1000).getHours() < 5).length;
  if (last50.length >= 15 && late / last50.length >= 0.35) tags.push({ t: "Night owl", c: "neutral", rule: `${pct(late, last50.length)}% of the last ${last50.length} games started between midnight and 5 AM (your time).` });
  const recent14 = games.filter(m => m.start_time > Date.now() / 1000 - 14 * 86400).length;
  if (recent14 >= 40) tags.push({ t: "Grinder", c: "neutral", rule: `${recent14} games in the last 14 days.` });
  return tags.slice(0, 5);
}

// ---------- rendering the profile ----------
function renderProfile() {
  const g = inRange(), all = P.games;
  const prof = P.profile || {};
  const latestRanked = all.find(m => m.ranked_display_badge && Math.floor(m.ranked_display_badge / 10) > 0);
  const st = streaks(all);
  const heroCounts = {};
  for (const m of g) heroCounts[m.hero_id] = (heroCounts[m.hero_id] || 0) + 1;
  const topHero = Object.entries(heroCounts).sort((a, b) => b[1] - a[1])[0];
  const art = topHero && (window.HERO_CARDS || []).includes(Number(topHero[0])) ? `assets/cards/${Number(topHero[0])}.webp` : "";
  const tags = profileTags(all);
  const sAll = summarize(all);

  $main.innerHTML = `
  <section class="card head" ${art ? `style="--art:url('${art}')"` : ""}>
    <div class="who">
      ${safeUrl(prof.avatarfull || prof.avatarmedium) ? `<img class="avatar" src="${esc(safeUrl(prof.avatarfull || prof.avatarmedium))}" alt="">` : `<span class="avatar none"></span>`}
      <div class="whoText">
        <h1>${esc(P.name)}</h1>
        <div class="line">
          ${latestRanked ? `<span data-tip="Badge after their latest ranked game (${esc(ago(latestRanked.start_time))}).">${rankHtml(latestRanked.ranked_display_badge, 34)}</span>` : `<span class="muted">No ranked badge yet</span>`}
          <span class="dot"></span><span>${plural(sAll.n, "game")}</span>
          <span class="dot"></span><span>${pct(sAll.w, sAll.n)}% won</span>
          <span class="dot"></span><span class="muted">Last played ${esc(ago(all[0].start_time))}</span>
        </div>
        ${tags.length ? `<div class="tags">${tags.map(t => `<button class="tag ${t.c}" data-tip="${esc(t.rule)}">${esc(t.t)}</button>`).join("")}</div>` : ""}
      </div>
    </div>
    <div class="headSide">
      <div class="streak ${st.curWin ? "good" : "bad"}" data-tip="Best win streak on record: ${st.best}.">
        <b>${st.cur}</b><span>${st.cur === 1 ? (st.curWin ? "win" : "loss") : (st.curWin ? "wins" : "losses")} in a row</span>
      </div>
      <button class="btn ghost" id="copyLink" data-tip="Copy a link to this profile to send to friends.">Copy link</button>
    </div>
  </section>

  ${formHtml(all)}

  <div class="rangeRow">
    <span class="lbl">Heroes and patterns from</span>
    <div class="seg" role="group" aria-label="Which games to count">${RANGES.map(([v, l]) => `<button data-range="${v}" class="${P.range === v ? "on" : ""}" aria-pressed="${P.range === v}" ${v !== "all" && P.games.length <= Number(v) ? "disabled" : ""}>${l}</button>`).join("")}</div>
    <span class="muted">${plural(g.length, "game")}</span>
  </div>

  <div class="cols">
    <div class="col">${heroesHtml(g)}${rankHtmlSection(g)}</div>
    <div class="col">${patternsHtml(g)}</div>
  </div>

  <section class="card" id="matches"></section>

  <p class="foot">Data: deadlock-api's stored match history${P.skipped ? `. ${plural(P.skipped, "Street Brawl, bot or private lobby game")} left out` : ""}. A game you just finished can take a while to show up. Verdicts and tags are graded against each hero's average from about 24,000 recent matches. Click any match to open it in Postmortem.</p>`;

  renderMatches();
  wireProfile();
}

function delta(now, before, better, fmt, unit) {
  if (before == null) return "";
  const d = now - before;
  const shown = fmt(Math.abs(d));
  if (shown === fmt(0)) return `<span class="delta flat">same</span>`;
  const good = better === "up" ? d > 0 : d < 0;
  return `<span class="delta ${good ? "good" : "bad"}">${d > 0 ? "+" : "-"}${shown}${unit || ""}</span>`;
}
function formHtml(all) {
  const last = all.slice(0, 20), prev = all.slice(20, 40);
  const a = summarize(last), b = prev.length >= 5 ? summarize(prev) : null;
  const sq = last.slice().reverse();
  const cmp = b ? `vs the ${prev.length} before` : "";
  return `
  <section class="card form">
    <div class="cardHead"><h2>Form</h2><span class="sub">Last ${a.n} games${cmp ? " " + cmp : ""}</span></div>
    <div class="formGrid">
      <div class="formMain">
        <div class="big">${pct(a.w, a.n)}<small>%</small></div>
        <div class="bigLbl">won ${b ? delta(a.wr * 100, b.wr * 100, "up", x => String(Math.round(x)), "%") : ""}</div>
      </div>
      <div class="formStats">
        <div class="fs" data-tip="(Kills + assists) per death.${b ? ` Before: ${fmt1(b.kda)}.` : ""}"><span class="v">${fmt1(a.kda)}</span><span class="l">KDA</span>${b ? delta(a.kda, b.kda, "up", fmt1) : ""}</div>
        <div class="fs" data-tip="Average souls per minute.${b ? ` Before: ${Math.round(b.spm).toLocaleString()}.` : ""}"><span class="v">${Math.round(a.spm).toLocaleString()}</span><span class="l">Souls / min</span>${b ? delta(a.spm, b.spm, "up", x => Math.round(x).toLocaleString()) : ""}</div>
        <div class="fs" data-tip="Average deaths per game.${b ? ` Before: ${fmt1(b.d)}.` : ""}"><span class="v">${fmt1(a.d)}</span><span class="l">Deaths / game</span>${b ? delta(a.d, b.d, "down", fmt1) : ""}</div>
        <div class="fs" data-tip="Average game length.${b ? ` Before: ${mmss(Math.round(b.mins * 60))}.` : ""}"><span class="v">${mmss(Math.round(a.mins * 60))}</span><span class="l">Game length</span></div>
      </div>
    </div>
    <div class="wl" aria-label="Last ${a.n} results, oldest first">
      ${sq.map(m => `<a class="sq ${isWin(m) ? "w" : "l"}" href="index.html?match=${m.match_id}" data-tip="${isWin(m) ? "Win" : "Loss"} as ${esc(heroName(m.hero_id))}, ${m.player_kills}/${m.player_deaths}/${m.player_assists}, ${esc(ago(m.start_time))}. Click to open."><img src="${heroImg(m.hero_id)}" alt="${esc(heroName(m.hero_id))}" loading="lazy"></a>`).join("")}
    </div>
    <div class="wlAxis"><span>Older</span><span>Newest</span></div>
  </section>`;
}

function heroesHtml(g) {
  const by = {};
  for (const m of g) (by[m.hero_id] = by[m.hero_id] || []).push(m);
  const rows = Object.entries(by).map(([h, list]) => ({ h: Number(h), s: summarize(list), last: list[0].start_time })).sort((a, b) => b.s.n - a.s.n || b.last - a.last);
  const max = rows[0] ? rows[0].s.n : 1;
  const showAll = P.heroesAll || rows.length <= 8;
  const wrCls = r => (r.s.n < 5 ? "faint" : r.s.wr >= 0.55 ? "good" : r.s.wr <= 0.45 ? "bad" : "");
  return `
  <section class="card heroes">
    <div class="cardHead"><h2>Heroes</h2><span class="sub">${plural(rows.length, "hero", "heroes")}. Click one to see only their games.</span></div>
    <div class="hTable">
      <div class="hRow hHead"><span>Hero</span><span>Games</span><span>Won</span><span data-tip="(Kills + assists) per death">KDA</span><span>Souls / min</span></div>
      ${rows.slice(0, showAll ? rows.length : 8).map(r => `
      <button class="hRow ${P.hero === r.h ? "sel" : ""}" data-hero="${r.h}" aria-pressed="${P.hero === r.h}" data-tip="Last played ${esc(ago(r.last))}. Average ${fmt1(r.s.k)} / ${fmt1(r.s.d)} / ${fmt1(r.s.a)}.">
        <span class="hName"><img src="${heroImg(r.h)}" alt="" loading="lazy">${esc(heroName(r.h))}</span>
        <span class="hGames"><b>${r.s.n}</b><i style="width:${Math.max(4, (r.s.n / max) * 100)}%"></i></span>
        <span class="${wrCls(r)}">${pct(r.s.w, r.s.n)}%</span>
        <span>${fmt1(r.s.kda)}</span>
        <span>${Math.round(r.s.spm).toLocaleString()}</span>
      </button>`).join("")}
    </div>
    ${rows.length > 8 ? `<button class="more" id="heroesAll">${showAll ? "Show top 8" : `Show all ${rows.length} heroes`}</button>` : ""}
  </section>`;
}

// Pattern blocks: each answers one question. A bar shows only with 5+ games, and its count is always printed.
function patternsHtml(g) {
  const ses = withSessions(g);
  const overall = summarize(g).wr;
  const block = (title, rule, buckets) => {
    const ok = buckets.filter(b => b.list.length >= 5);
    if (ok.length < 2) return "";
    return `<div class="pat"><h3 data-tip="${esc(rule)}">${esc(title)}</h3>${ok.map(b => {
      const s = summarize(b.list), v = s.wr * 100;
      const cls = s.n >= 10 && v >= overall * 100 + 5 ? "good" : s.n >= 10 && v <= overall * 100 - 5 ? "bad" : "";
      return `<div class="bar ${b.cls || ""}"><span class="bl">${esc(b.label)}</span><span class="track"><i class="${cls}" style="width:${v}%"></i><em style="left:${overall * 100}%"></em></span><span class="bv ${cls}">${Math.round(v)}%</span><span class="bn">${s.n}</span></div>`;
    }).join("")}</div>`;
  };
  const hr = m => new Date(m.start_time * 1000).getHours();
  const blocks = [
    block("Right after a game", "The next game you started within an hour of the last one ending.", [
      { label: "After a win", list: ses.filter(m => m._prev && isWin(m._prev)) },
      { label: "After a loss", list: ses.filter(m => m._prev && !isWin(m._prev)) },
    ]),
    block("Game in a session", "A session is games less than an hour apart.", [
      { label: "1st game", list: ses.filter(m => m._game === 1) },
      { label: "2nd game", list: ses.filter(m => m._game === 2) },
      { label: "3rd game", list: ses.filter(m => m._game === 3) },
      { label: "4th or later", list: ses.filter(m => m._game >= 4) },
    ]),
    block("Time of day", "When the game started, in your own time zone.", [
      { label: "Morning", list: g.filter(m => hr(m) >= 6 && hr(m) < 12) },
      { label: "Afternoon", list: g.filter(m => hr(m) >= 12 && hr(m) < 18) },
      { label: "Evening", list: g.filter(m => hr(m) >= 18) },
      { label: "Late night", list: g.filter(m => hr(m) < 6) },
    ]),
    block("Game length", "How long the whole match lasted.", [
      { label: "Under 25 min", list: g.filter(m => m.match_duration_s < 1500) },
      { label: "25 to 35 min", list: g.filter(m => m.match_duration_s >= 1500 && m.match_duration_s < 2100) },
      { label: "35 to 45 min", list: g.filter(m => m.match_duration_s >= 2100 && m.match_duration_s < 2700) },
      { label: "Over 45 min", list: g.filter(m => m.match_duration_s >= 2700) },
    ]),
    block("Side", "Which patron you played for.", [
      { label: "Hidden King", list: g.filter(m => m.player_team === 0), cls: "t1" },
      { label: "Archmother", list: g.filter(m => m.player_team === 1), cls: "t2" },
    ]),
  ].filter(Boolean);
  return `
  <section class="card patterns">
    <div class="cardHead"><h2>Patterns</h2><span class="sub">Win rate. The dashed line is your overall ${Math.round(overall * 100)}%.</span></div>
    ${blocks.length ? `<div class="barHead"><span></span><span></span><span>Won</span><span>Games</span></div>${blocks.join("")}` : `<p class="muted pad">Patterns show up after about 20 games.</p>`}
  </section>`;
}

function rankHtmlSection(g) {
  const ranked = g.filter(m => m.ranked_display_badge && Math.floor(m.ranked_display_badge / 10) > 0).slice().reverse();
  if (ranked.length < 3) return "";
  const steps = ranked.map(m => badgeStep(m.ranked_display_badge));
  const lo = Math.min(...steps) - 1, hi = Math.max(...steps) + 1;
  const peakI = steps.indexOf(Math.max(...steps));
  const saved = ranked.filter(m => m.ranked_used_demotion_protection).length;
  const W = 1000, H = 100, n = ranked.length;
  const x = i => (n === 1 ? W / 2 : (i / (n - 1)) * W), y = s => H - ((s - lo) / (hi - lo)) * H;
  let d = `M${x(0)},${y(steps[0])}`;
  for (let i = 1; i < n; i++) d += `H${x(i)}V${y(steps[i])}`;
  const tiers = [];
  for (let t = Math.floor(lo / 6); t <= Math.floor(hi / 6); t++) { const s = t * 6; if (s > lo && s < hi && RANK_NAMES[t]) tiers.push({ t, top: (y(s) / H) * 100 }); }
  P.rankData = { ranked, steps, x, y, W, H };
  return `
  <section class="card rankJ">
    <div class="cardHead"><h2>Rank journey</h2><span class="sub">Badge after each of ${plural(n, "ranked game")}</span></div>
    <div class="rjStats">
      <div><span class="lbl">Now</span>${rankHtml(ranked[n - 1].ranked_display_badge, 44)}</div>
      <div data-tip="${esc(new Date(ranked[peakI].start_time * 1000).toLocaleDateString())}"><span class="lbl">Peak</span>${rankHtml(ranked[peakI].ranked_display_badge, 44)}</div>
      ${saved ? `<div data-tip="Losses where demotion protection kept the badge from dropping."><span class="lbl">Saved by protection</span><span class="rjNum">${saved}</span></div>` : ""}
    </div>
    <div class="rjChart" id="rjChart">
      ${tiers.map(t => `<span class="rjTier" style="top:${t.top}%"><span>${esc(RANK_NAMES[t.t])}</span></span>`).join("")}
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" /></svg>
      <span class="rjCursor" id="rjCursor" hidden></span>
    </div>
  </section>`;
}

function verdictChip(v) { return `<span class="verdict ${v.c}" data-tip="${esc(v.rule)}" tabindex="0">${esc(v.w)}</span>`; }
function renderMatches() {
  const el = document.getElementById("matches");
  const list = P.hero ? P.games.filter(m => m.hero_id === P.hero) : P.games;
  const shown = list.slice(0, P.shown);
  const days = [];
  for (const m of shown) {
    const k = dayKey(m.start_time);
    if (!days.length || days[days.length - 1].k !== k) days.push({ k, t: m.start_time, list: [] });
    days[days.length - 1].list.push(m);
  }
  el.innerHTML = `
    <div class="cardHead"><h2>Matches</h2>
      ${P.hero ? `<button class="chip filter" id="clearHero" aria-label="Show all heroes again"><img src="${heroImg(P.hero)}" alt="">${esc(heroName(P.hero))} only<span class="x" aria-hidden="true">✕</span></button>` : ""}
      <span class="sub">${plural(list.length, "game")}</span></div>
    ${days.map(day => {
      const w = day.list.filter(isWin).length, l = day.list.length - w;
      const pts = day.list.reduce((s, m) => s + (m.ranked_delta || 0), 0);
      const hasPts = day.list.some(m => m.ranked_delta != null);
      return `<div class="day"><div class="dayHead"><span class="dl">${esc(dayLabel(day.t))}</span><span class="dwl"><b class="good">${w}W</b> <b class="bad">${l}L</b></span>${hasPts ? `<span class="dpts ${pts >= 0 ? "good" : "bad"}" data-tip="Rank progress from that day's ranked games.">${pts >= 0 ? "+" : ""}${pts} rank</span>` : ""}</div>
      ${day.list.map(m => {
        const win = isWin(m), v = verdict(m);
        const mode = m.match_mode === 4 ? "Ranked" : m.match_mode === 8 ? "Placement" : "Unranked";
        return `<a class="match ${win ? "w" : "l"}" href="index.html?match=${m.match_id}" aria-label="${win ? "Win" : "Loss"} as ${esc(heroName(m.hero_id))}. Open in Postmortem.">
          <img class="mHero" src="${heroImg(m.hero_id)}" alt="" loading="lazy">
          <span class="mRes"><b>${win ? "Victory" : "Defeat"}</b><span>${esc(heroName(m.hero_id))}</span></span>
          <span class="mKda"><b>${m.player_kills} / ${m.player_deaths} / ${m.player_assists}</b><span>${fmt1((m.player_kills + m.player_assists) / Math.max(1, m.player_deaths))} KDA</span></span>
          <span class="mSouls"><b>${kSouls(m.net_worth)}</b><span>souls</span></span>
          <span class="mVerdict">${verdictChip(v)}</span>
          <span class="mMeta"><b>${mode}${m.ranked_delta != null ? ` <i class="${m.ranked_delta >= 0 ? "good" : "bad"}">${m.ranked_delta >= 0 ? "+" : ""}${m.ranked_delta}</i>` : ""}</b><span>${mmss(m.match_duration_s)} · ${esc(clock(m.start_time))}</span></span>
          <span class="mGo" aria-hidden="true"></span>
        </a>`;
      }).join("")}</div>`;
    }).join("")}
    ${list.length > P.shown ? `<button class="more" id="moreMatches">Show ${Math.min(20, list.length - P.shown)} more</button>` : ""}`;
  const more = document.getElementById("moreMatches");
  if (more) more.addEventListener("click", () => { P.shown += 20; renderMatches(); });
  const clr = document.getElementById("clearHero");
  if (clr) clr.addEventListener("click", () => { P.hero = null; P.shown = 20; refreshHeroes(); renderMatches(); });
}
function refreshHeroes() {
  const old = $main.querySelector(".heroes");
  if (!old) return;
  old.outerHTML = heroesHtml(inRange());
  wireHeroes();
}
function wireHeroes() {
  $main.querySelectorAll(".hRow[data-hero]").forEach(b => b.addEventListener("click", () => {
    const h = Number(b.dataset.hero);
    P.hero = P.hero === h ? null : h; P.shown = 20;
    refreshHeroes(); renderMatches();
    if (P.hero) document.getElementById("matches").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }));
  const all = document.getElementById("heroesAll");
  if (all) all.addEventListener("click", () => { P.heroesAll = !P.heroesAll; refreshHeroes(); });
}
function wireProfile() {
  wireHeroes();
  $main.querySelectorAll("[data-range]").forEach(b => b.addEventListener("click", () => {
    if (P.range === b.dataset.range) return;
    const y = window.scrollY;
    P.range = b.dataset.range; renderProfile(); window.scrollTo(0, y);
  }));
  const copy = document.getElementById("copyLink");
  copy.addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}?id=${P.id}`;
    try { await navigator.clipboard.writeText(url); copy.textContent = "Link copied"; } catch (e) { prompt("Copy this link:", url); }
    setTimeout(() => { copy.textContent = "Copy link"; }, 1800);
  });
  const ch = document.getElementById("rjChart");
  if (ch && P.rankData) {
    const cur = document.getElementById("rjCursor");
    const move = e => {
      const r = ch.getBoundingClientRect(), { ranked, steps, x, y, W, H } = P.rankData;
      const i = Math.max(0, Math.min(ranked.length - 1, Math.round(((e.clientX - r.left) / r.width) * (ranked.length - 1))));
      const m = ranked[i];
      cur.hidden = false;
      cur.style.left = (x(i) / W) * 100 + "%"; cur.style.top = (y(steps[i]) / H) * 100 + "%";
      const rk = rankOf(m.ranked_display_badge);
      showTip(`${rk ? rk.name : ""} after a ${isWin(m) ? "win" : "loss"} as ${heroName(m.hero_id)}${m.ranked_delta != null ? ` (${m.ranked_delta >= 0 ? "+" : ""}${m.ranked_delta})` : ""}, ${ago(m.start_time)}`, cur);
    };
    ch.addEventListener("pointermove", move);
    ch.addEventListener("pointerdown", move);
    ch.addEventListener("pointerleave", () => { cur.hidden = true; hideTip(); });
  }
}

// ---------- tooltips: hover or keyboard focus shows the rule; a tap on a touch screen toggles it ----------
let tipFor = null;
function showTip(text, el) {
  $tip.textContent = text;
  $tip.hidden = false;
  const r = el.getBoundingClientRect(), t = $tip.getBoundingClientRect();
  let left = r.left + r.width / 2 - t.width / 2;
  left = Math.max(8, Math.min(window.innerWidth - t.width - 8, left));
  let top = r.top - t.height - 8;
  if (top < 8) top = r.bottom + 8;
  $tip.style.left = left + "px"; $tip.style.top = top + "px";
  tipFor = el;
}
function hideTip() { $tip.hidden = true; tipFor = null; }
document.addEventListener("pointerover", e => { const el = e.target.closest("[data-tip]"); if (el && e.pointerType !== "touch") showTip(el.dataset.tip, el); });
document.addEventListener("pointerout", e => { const el = e.target.closest("[data-tip]"); if (el && el === tipFor && !el.contains(e.relatedTarget)) hideTip(); });
document.addEventListener("focusin", e => { const el = e.target.closest("[data-tip]"); if (el && el.matches(":focus-visible")) showTip(el.dataset.tip, el); });
document.addEventListener("focusout", () => hideTip());
document.addEventListener("click", e => {
  const el = e.target.closest(".tag, .verdict, .fs, .pat h3");
  if (el && el.dataset.tip && matchMedia("(hover: none)").matches) {
    if (el.closest("a")) e.preventDefault();
    if (tipFor === el) hideTip(); else showTip(el.dataset.tip, el);
  }
});
window.addEventListener("scroll", hideTip, { passive: true });

route();
