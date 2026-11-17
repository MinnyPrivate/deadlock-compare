// Postmortem Profile (prototype). One player's form, heroes, patterns, rank journey and matches.
// Data: deadlock-api stored match history /v1/players/{account_id}/match-history (one call, 100 req/s per IP),
// Steam name and avatar from /v1/players/steam, name search from /v1/players/steam-search.
// Nothing here looks at live matches: it only reads finished games.
"use strict";

const API = "https://api.deadlock-api.com/v1/";
const STEAM64_BASE = 76561197960265728n;
const MAX_ACCOUNT_ID = 4294967295;
const $main = document.getElementById("main");
const $tip = document.getElementById("tip");
const $q = document.getElementById("q");

// ---------- small helpers ----------
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const fmt1 = x => (Math.round(x * 10) / 10).toFixed(1);
const kSouls = n => (n >= 1000 ? fmt1(n / 1000) + "k" : String(Math.round(n)));
const heroName = id => (window.HERO_NAMES && HERO_NAMES[id]) || "Hero " + id;
// Hero art. deadlock-api serves the game's own hero images (/v1/assets/heroes): small head icons for lists and
// the full card art for big tiles, at their real size. The local files are the fallback when that call fails.
let HERO_ART = {};
const heroImg = id => (HERO_ART[id] && HERO_ART[id].mini)
  || ((window.HERO_MM || []).includes(Number(id)) ? `assets/heroes_mm/${Number(id)}.png` : `assets/heroes/${Number(id) || 0}.png`);
// Match rows: the hero's gloat card on a win and its wounded ("critical") card on a loss, like the game's post-match screen.
const moodCard = (id, win) => (HERO_ART[id] && HERO_ART[id][win ? "gloat" : "crit"]) || heroCard(id);
const heroCard = id => (HERO_ART[id] && HERO_ART[id].card) || ((window.HERO_CARDS || []).includes(Number(id)) ? `assets/cards/${Number(id)}.webp` : `assets/heroes/${Number(id) || 0}.png`);
// A match opens on index.html. from=profile and pid let that page show "Back to profile" for this player.
const matchHref = id => `index.html?match=${id}&from=profile${P && P.id ? "&pid=" + P.id : ""}`;
// Hero theme: the page takes the official character-select backdrop and one accent colour from a hero
// (for now the player's most played one). The accent is decoration only: win/loss, team and gold colours never change.
function applyTheme(heroId) {
  const id = Number(heroId) || 0, root = document.documentElement, bd = document.getElementById("backdrop");
  const local = (window.HERO_BACKDROPS || []).includes(id);
  const art = HERO_ART[id] || {};
  const bg = local ? `assets/backdrops/${id}.webp` : art.bg || "assets/backdrops/generic.webp";
  const accent = (window.HERO_ACCENTS || {})[id] || art.ui || "";
  if (accent) root.style.setProperty("--accent", accent); else root.style.removeProperty("--accent");
  root.dataset.theme = id ? String(id) : "";
  if (bd) { bd.style.setProperty("--bd", `url("${bg}")`); bd.classList.add("on"); }
}
async function loadHeroArt() {
  try {
    const c = JSON.parse(localStorage.getItem("pm_hero_art3") || "null");
    if (c && c.t > Date.now() - 86400000 && c.art) { HERO_ART = c.art; return; }
  } catch (e) { /* no cache */ }
  try {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 3000);
    const r = await fetch("https://api.deadlock-api.com/v1/assets/heroes", { signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) return;
    const list = await r.json(), art = {};
    for (const h of Array.isArray(list) ? list : []) {
      const im = h.images || {};
      const pick = (...k) => k.map(x => safeUrl(im[x])).find(Boolean) || "";
      const ui = h.colors && Array.isArray(h.colors.ui) && h.colors.ui.length === 3 ? h.colors.ui.map(Number) : null;
      art[h.id] = { mini: pick("minimap_image_webp", "minimap_image", "icon_image_small_webp", "icon_image_small"), card: pick("icon_hero_card_webp", "icon_hero_card"),
        bg: pick("background_image_webp", "background_image"),
        gloat: pick("hero_card_gloat_webp", "hero_card_gloat"), crit: pick("hero_card_critical_webp", "hero_card_critical"), ui: ui && ui.every(n => n >= 0 && n <= 255) ? `rgb(${ui.join(",")})` : "" };
    }
    HERO_ART = art;
    try { localStorage.setItem("pm_hero_art3", JSON.stringify({ t: Date.now(), art })); } catch (e) { /* storage blocked */ }
  } catch (e) { /* keep the local images */ }
}
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
function accountId(value) {
  if (!value || /\D/.test(value)) return null;
  const id = Number(value);
  return id >= 1 && id <= MAX_ACCOUNT_ID ? id : null;
}

function setupAccountId(raw) {
  let value = raw.trim();
  if (!/^\d+$/.test(value)) {
    let link;
    try { link = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); } catch (e) { /* invalid URL */ }
    if (link && /^(www\.)?steamcommunity\.com$/.test(link.hostname) && !link.username && !link.password && !link.port) {
      if (/^\/id\//i.test(link.pathname)) throw new Error("Steam vanity links aren't supported yet. Use a Steam profiles link or paste the number.");
      const match = link.pathname.match(/^\/profiles\/(\d+)\/?$/i);
      if (match) value = match[1];
    }
  }
  const id = accountId(value);
  if (id !== null) return id;
  if (/^\d{17}$/.test(value)) {
    const converted = accountId(String(BigInt(value) - STEAM64_BASE));
    if (converted !== null) return converted;
  }
  throw new Error("Enter a valid account ID, SteamID64, or Steam profiles link.");
}

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
async function getJson(url, opts) {
  let r;
  try { r = await fetch(url, opts); } catch (e) { throw new ApiError(0, "Couldn't reach deadlock-api. Check your connection and try again."); }
  if (r.status === 429) throw new ApiError(429, "deadlock-api says we're asking too fast. Wait a minute, then try again.");
  if (!r.ok) throw new ApiError(r.status, `deadlock-api answered with error ${r.status}.`);
  return r.json();
}

async function getSteamProfile(id) {
  const list = await getJson(`${API}players/steam?account_ids=${id}`);
  return Array.isArray(list) ? list.find(p => Number(p.account_id) === id) : null;
}
const steamAvatar = p => safeUrl(p.avatarfull) || safeUrl(p.avatarmedium) || safeUrl(p.avatar);

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
  const u = new URL(location.href), p = u.searchParams;
  hideTip();
  const me = accountId(p.get("me"));
  if (me !== null) {
    // ?me= wins over everything else and is remembered. When this browser can't store it, ?me= stays in the
    // address so a reload still opens the right profile.
    let saved = true;
    try { localStorage.setItem("pm_me", String(me)); } catch (e) { saved = false; }
    if (saved) p.delete("me");
    p.delete("id");
    p.delete("q");
    history.replaceState(null, "", u);
    return loadProfile(me, p.get("src"), null, saved);
  }
  if (p.get("id")) return loadProfile(Number(p.get("id")), p.get("src"));
  if (p.get("q")) return searchPlayers(p.get("q"));
  let saved;
  try { saved = accountId(localStorage.getItem("pm_me")); } catch (e) { return renderSetup(); }
  if (saved !== null) return loadProfile(saved, p.get("src"));
  renderSetup();
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
function renderSetup(changing = false) {
  ++loadSeq;
  hideTip();
  applyTheme(0);
  document.title = "Profile · Postmortem";
  const recent = changing ? [] : recentGet();
  $main.innerHTML = `
    <section class="card accountSetup" aria-labelledby="accountTitle">
      <h1 id="accountTitle">${changing ? "Change account" : "Set up your profile"}</h1>
      <label for="accountInput">Enter your account ID, SteamID64, or Steam profiles link.</label>
      <form class="search" id="accountForm" autocomplete="off">
        <input id="accountInput" type="text" placeholder="Account ID or Steam profiles link" spellcheck="false" autocapitalize="none" maxlength="256" aria-describedby="accountError">
        <button type="submit">Look up</button>
      </form>
      <p class="accountError" id="accountError" role="status"></p>
      ${changing ? "" : `<p class="accountHint muted">Saved in this browser only. Your SteamID64 or account ID is easy to find at <a class="link" href="https://steamid.io" target="_blank" rel="noopener">steamid.io</a>. To look up someone else, use the search box above.</p>`}
      <div class="accountPreview" id="accountPreview" hidden>
        <img alt="" referrerpolicy="no-referrer"><div><strong></strong><span class="muted"></span></div>
        <button class="btn" type="button" id="confirmAccount">Confirm</button>
      </div>
      ${changing ? `<button class="link" type="button" id="cancelAccount">Cancel</button>` : ""}
    </section>
    ${recent.length ? `
    <div class="recent"><span class="lbl">Recently viewed</span>${recent.map(r => `
      <a class="chip person" href="?id=${r.id}" data-id="${r.id}">${safeUrl(r.avatar) ? `<img src="${esc(safeUrl(r.avatar))}" alt="">` : ""}${esc(r.name)}</a>`).join("")}</div>` : ""}`;
  const form = document.getElementById("accountForm"), input = document.getElementById("accountInput");
  const error = document.getElementById("accountError"), preview = document.getElementById("accountPreview");
  const confirm = document.getElementById("confirmAccount"), lookup = form.querySelector("button");
  let profile = null, lookupSeq = 0;
  function clearPreview() {
    lookupSeq++;
    profile = null;
    preview.hidden = true;
    error.textContent = "";
    input.removeAttribute("aria-invalid");
    lookup.disabled = false;
    lookup.textContent = "Look up";
  }
  input.addEventListener("input", clearPreview);
  form.addEventListener("submit", async e => {
    e.preventDefault();
    clearPreview();
    let id;
    try { id = setupAccountId(input.value); } catch (e) {
      error.textContent = e.message;
      input.setAttribute("aria-invalid", "true");
      return;
    }
    const current = lookupSeq;
    lookup.disabled = true;
    lookup.textContent = "Looking up...";
    try {
      const found = await getSteamProfile(id);
      if (!form.isConnected || current !== lookupSeq) return;
      if (!found?.personaname || !steamAvatar(found)) {
        error.textContent = "Couldn't find that Steam profile. Check the number and try again.";
        return;
      }
      profile = found;
      preview.querySelector("img").src = steamAvatar(found);
      preview.querySelector("strong").textContent = found.personaname;
      preview.querySelector("span").textContent = `Account ID ${id}`;
      preview.hidden = false;
      confirm.focus();
    } catch (e) {
      if (form.isConnected && current === lookupSeq) error.textContent = "Couldn't load the Steam profile. Try again in a moment.";
    } finally {
      if (current === lookupSeq) {
        lookup.disabled = false;
        lookup.textContent = "Look up";
      }
    }
  });
  confirm.addEventListener("click", () => {
    if (!profile) return;
    const id = Number(profile.account_id);
    let saved = true;
    try { localStorage.setItem("pm_me", String(id)); } catch (e) { saved = false; }
    history.replaceState(null, "", location.pathname);
    loadProfile(id, null, profile, saved);
  });
  if (changing) document.getElementById("cancelAccount").addEventListener("click", route);
  $main.querySelectorAll("a[data-id]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); go({ id: a.dataset.id }, true); }));
  if (changing) input.focus();
}
function renderState(title, text, action) {
  applyTheme(0);
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
const MODES = [["all", "All"], ["ranked", "Ranked"], ["unranked", "Unranked"]];
const modeTip = v => {
  const n = P ? gamesForMode(P.allGames, v).length : 0;
  return v === "all" ? `Every game: ${n.toLocaleString()}.` : v === "ranked" ? `${plural(n, "ranked game")}, including placement games.` : `${plural(n, "unranked game")}.`;
};
function savedMode() {
  try {
    const mode = localStorage.getItem("pm_mode");
    if (MODES.some(([value]) => value === mode)) return mode;
  } catch (e) { /* use the default */ }
  return "all";
}
function matchMode(match) {
  if (match.match_mode === 4) return "ranked";
  if (match.match_mode === 8) return "placement";
  return "unranked";
}
// Placement (calibration) games are ranked games, so the Ranked chip includes them.
const modeGroup = match => (match.match_mode === 4 || match.match_mode === 8 ? "ranked" : "unranked");
function gamesForMode(games, mode) {
  return mode === "all" ? games : games.filter(match => modeGroup(match) === mode);
}
function savedMe() { try { return accountId(localStorage.getItem("pm_me")); } catch (e) { return null; } }
const isWin = m => (m.player_match_outcome === 1 ? true : m.player_match_outcome === 2 ? false : m.match_result === m.player_team);
let P = null; // the loaded profile and the user's choices on it
let FX = null; // local test file, when ?src= is used

// deadlock-api's bulk endpoint returns ClickHouse rows, so a few fields can come back as enum names or
// nested columns in more than one layout. These read every layout we know of.
const teamNum = t => (t === 1 || t === "Team1" || t === "1" ? 1 : t === 0 || t === "Team0" || t === "0" ? 0 : null);
function nested(p, key, fields) { // -> array of objects with `fields`
  let v = p[key];
  if (typeof v === "string") { try { v = JSON.parse(v); } catch (e) { v = null; } }
  if (Array.isArray(v)) return v.map(x => (Array.isArray(x) ? Object.fromEntries(fields.map((f, i) => [f, x[i]])) : x || {}));
  const cols = fields.map(f => (v && Array.isArray(v[f]) ? v[f] : Array.isArray(p[`${key}.${f}`]) ? p[`${key}.${f}`] : Array.isArray(p[`${key}_${f}`]) ? p[`${key}_${f}`] : null));
  if (!cols[0]) return [];
  return cols[0].map((_, i) => Object.fromEntries(fields.map((f, j) => [f, cols[j] ? cols[j][i] : undefined])));
}
function normPlayer(raw) {
  let p = raw;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch (e) { return null; } }
  if (!p) return null;
  const up = nested(p, "upgrades", ["item_id", "sold_time_s", "game_time_s"]);
  const items = (up.length ? up : nested(p, "items", ["item_id", "sold_time_s", "game_time_s"]))
    .map(i => ({ id: Number(i.item_id), sold: Number(i.sold_time_s) || 0, t: Number(i.game_time_s) || 0 }));
  return {
    account_id: Number(p.account_id) || 0, hero_id: Number(p.hero_id) || 0, team: teamNum(p.team), slot: Number(p.player_slot) || 0,
    mvp: Number(p.mvp_rank) || 0, items,
    acc: nested(p, "accolades", ["accolade_id", "accolade_stat_value", "accolade_threshold_achieved"])
      .map(a => ({ id: Number(a.accolade_id), v: Number(a.accolade_stat_value) || 0, tier: Number(a.accolade_threshold_achieved) })),
  };
}
function normMatch(m) {
  const players = (Array.isArray(m.players) ? m.players : (m.match_info && m.match_info.players) || []).map(normPlayer).filter(Boolean);
  return { match_id: Number(m.match_id || (m.match_info && m.match_info.match_id)), players };
}

// ---------- extra data, loaded after the page shows ----------
const META = new Map(); // match_id -> normalized match, or null when deadlock-api has none
const NAMES = new Map(); // account_id -> { name, avatar }
let metaNote = ""; // shown under the match list when match details could not load

async function fetchMeta(ids) {
  if (FX) return (FX.meta || []).filter(m => ids.includes(Number(m.match_id)));
  const q = `match_ids=${ids.join(",")}&include_player_info=true&include_player_items=true&extra_player_columns=upgrades.item_id,upgrades.sold_time_s,upgrades.game_time_s&limit=${ids.length}`;
  try {
    const r = await getJson(`${API}matches/metadata?${q}`);
    if (Array.isArray(r) && r.length) return r;
  } catch (e) {
    if (e.status === 429) throw e;
  }
  // Fallback: the one-match endpoint the Compare page already uses (bigger downloads, so only a few at a time).
  const out = [];
  for (const id of ids.slice(0, 8)) {
    try { out.push(await getJson(`${API}matches/${id}/metadata?disable_steam=true`)); } catch (e) { if (e.status === 429) break; }
  }
  return out;
}
let metaBusy = false;
let pendingMeta = null;
async function loadMetaFor(list) {
  const ids = list.map(m => m.match_id).filter(id => !META.has(id)).slice(0, 20);
  if (!ids.length) return;
  if (metaBusy) {
    pendingMeta = { list, seq: loadSeq };
    return;
  }
  metaBusy = true;
  const my = loadSeq;
  try {
    const rows = await fetchMeta(ids);
    if (my !== loadSeq) return;
    for (const r of rows) { const m = normMatch(r); if (m.match_id) META.set(m.match_id, m); }
    for (const id of ids) if (!META.has(id)) META.set(id, null);
    metaNote = "";
    await loadNames([...META.values()].filter(Boolean).flatMap(m => m.players.map(p => p.account_id)));
  } catch (e) {
    if (my !== loadSeq) return;
    metaNote = e.status === 429 ? "deadlock-api is busy, so items and players are missing on some matches." : "";
  } finally {
    metaBusy = false;
    const next = pendingMeta;
    pendingMeta = null;
    if (next && next.seq === loadSeq) loadMetaFor(next.list);
  }
  if (my === loadSeq && P) { renderMatches(); renderSide(); }
}
async function loadNames(ids) {
  const need = [...new Set(ids)].filter(id => id && !NAMES.has(id)).slice(0, 900);
  if (!need.length) return;
  let list = [];
  try { list = FX ? FX.names || [] : await getJson(`${API}players/steam?account_ids=${need.join(",")}`); } catch (e) { return; }
  for (const s of Array.isArray(list) ? list : []) NAMES.set(Number(s.account_id), { name: s.personaname || "", avatar: safeUrl(s.avatarmedium || s.avatar) });
  for (const id of need) if (!NAMES.has(id)) NAMES.set(id, { name: "", avatar: "" });
}
async function loadMates() {
  const my = loadSeq;
  const get = party => (FX ? Promise.resolve((FX.mates || {})[party ? "party" : "all"] || [])
    : getJson(`${API}players/${P.id}/mate-stats?same_party=${party}`));
  const [party, all] = await Promise.all([get(true).catch(() => null), get(false).catch(() => null)]);
  if (my !== loadSeq) return;
  P.mates = { party: Array.isArray(party) ? party : null, all: Array.isArray(all) ? all : null };
  await loadNames([...(P.mates.party || []), ...(P.mates.all || [])].filter(m => m.matches_played >= MATE_MIN).map(m => Number(m.mate_id)));
  if (my !== loadSeq) return;
  if (P.withId) { recomputeGames(); renderProfile(); loadMetaFor(matchList().slice(0, 20)); } else renderSide();
}
async function loadSeasons() {
  const my = loadSeq;
  try {
    const s = FX ? FX.seasons || [] : await getJson(`${API}assets/ranked-seasons`);
    if (my !== loadSeq || !Array.isArray(s)) return;
    P.seasons = s;
    renderSide();
  } catch (e) { /* the season table just stays hidden */ }
}

// ---------- match history: how fresh it is, and the Refresh control ----------
// Why a game can be missing or late: deadlock-api's match-history is its stored copy. A game lands there only after
// deadlock-api has received that match's keys (from someone's uploader or the app). Its answers are also cached for 5 minutes
// by its CDN and by the browser. So: the first load asks for a copy no older than a minute (the address changes
// each minute, so the cache can't hand back something older), and Refresh asks for the newest copy, at most
// once every 2 minutes. force_refetch is not used: it only reaches Steam for accounts that are friends with
// one of deadlock-api's bots, and is limited to 1 call an hour per IP address.
const REFRESH_COOLDOWN = 120000;
async function fetchHistory(id, fresh) {
  const stamp = fresh ? Date.now() : Math.floor(Date.now() / 60000);
  return getJson(`${API}players/${id}/match-history?_r=${stamp}`, { cache: fresh ? "reload" : "no-cache" });
}
function splitHistory(history) {
  const all = (Array.isArray(history) ? history : []).slice().sort((a, b) => b.start_time - a.start_time);
  const allGames = all.filter(m => (m.game_mode == null || m.game_mode === 1) && COUNTED_MODES.has(m.match_mode ?? 0));
  return { all, allGames };
}
function ageText(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return plural(Math.max(1, Math.round(s / 60)), "min") + " ago";
  return plural(Math.round(s / 3600), "hour") + " ago";
}
function refreshWaitMs() { return P ? Math.max(0, P.fetchedAt + REFRESH_COOLDOWN - Date.now()) : 0; }
function refreshHtml() {
  const wait = refreshWaitMs();
  const tip = `data-tip="Asks deadlock-api for the newest list of games. A game can take a few minutes to show up after it ends."`;
  return `<span class="fresh"><span id="updated" class="muted">${P.refreshMsg ? esc(P.refreshMsg) : "Updated " + ageText(Date.now() - P.fetchedAt)}</span>
    <button class="btn ghost small ${wait ? "cool" : ""}" id="refreshBtn" type="button" ${P.refreshing ? "disabled" : ""} aria-disabled="${wait ? "true" : "false"}" ${tip}>${P.refreshing ? "Refreshing..." : "Refresh"}</button></span>`;
}
function paintFresh() { // keeps "Updated 3 min ago" and the button state current without redrawing the page
  const el = document.getElementById("updated"), btn = document.getElementById("refreshBtn");
  if (!P || !el || !btn) return;
  if (!P.refreshMsg) el.textContent = "Updated " + ageText(Date.now() - P.fetchedAt);
  btn.disabled = P.refreshing;
  const cool = refreshWaitMs() > 0;
  btn.classList.toggle("cool", cool); btn.setAttribute("aria-disabled", String(cool));
}
setInterval(paintFresh, 15000);
async function refreshProfile() {
  if (!P || P.refreshing) return;
  const wait = refreshWaitMs();
  if (wait > 0) { // just checked: say so instead of asking deadlock-api again
    const p0 = P;
    P.refreshMsg = `Checked a moment ago. Try again in ${Math.ceil(wait / 1000)} seconds.`;
    paintFreshNow();
    setTimeout(() => { if (P === p0 && p0.refreshMsg && !p0.refreshing) { p0.refreshMsg = ""; paintFresh(); } }, 4000);
    return;
  }
  const p = P, my = loadSeq;
  p.refreshing = true; p.refreshMsg = ""; paintFreshNow();
  try {
    const history = p.src ? FX.history : await fetchHistory(p.id, true);
    if (my !== loadSeq || p !== P) return;
    const before = new Set(p.allGames.map(m => m.match_id));
    const { all, allGames } = splitHistory(history);
    const fresh = allGames.filter(m => !before.has(m.match_id)), added = fresh.length;
    const hidden = added - gamesForMode(fresh, p.mode).length; // (the played-with filter can hide more; the list below says so)
    // keep the list we already have if the answer comes back empty or shorter: never swap good data for a blank
    if (allGames.length >= p.allGames.length) {
      p.allGames = allGames; p.skipped = all.length - allGames.length;
      recomputeGames();
    }
    p.fetchedAt = Date.now();
    p.refreshMsg = added ? `${plural(added, "new game")} found${hidden ? `, ${hidden} hidden by the ${p.mode} filter` : ""}` : "No new games yet. A game can take a few minutes to show up.";
    const y = window.scrollY;
    p.refreshing = false;
    renderProfile();
    window.scrollTo(0, y);
    loadMetaFor(matchList().slice(0, 20));
    setTimeout(() => { if (P === p && p.refreshMsg) { p.refreshMsg = ""; paintFresh(); } }, 8000);
  } catch (e) {
    if (p !== P) return;
    p.refreshing = false;
    p.fetchedAt = Date.now() - REFRESH_COOLDOWN + 30000; // allow another try in 30 seconds
    p.refreshMsg = e.status === 429 ? "deadlock-api is busy. Try again in a minute." : "Couldn't reach deadlock-api. Try again in a minute.";
    paintFreshNow();
    setTimeout(() => { if (P === p && p.refreshMsg) { p.refreshMsg = ""; paintFresh(); } }, 8000);
  }
}
function paintFreshNow() { const el = document.getElementById("freshBox"); if (el && P) { el.innerHTML = refreshHtml(); wireRefresh(); } }
function wireRefresh() { const b = document.getElementById("refreshBtn"); if (b) b.addEventListener("click", refreshProfile); }

async function loadProfile(id, src, confirmedProfile = null, accountSaved = true) {
  const my = ++loadSeq;
  if (!Number.isInteger(id) || id <= 0 || id > MAX_ACCOUNT_ID) return renderState("That ID doesn't look right", "Account IDs are numbers like 135548265. A Steam profile link works too.");
  $q.value = "";
  renderLoading("Loading match history...");
  const local = src && /^test\/[\w-]+\.json$/.test(src); // local test file: only files in this repo's test/ folder
  FX = null; META.clear(); metaNote = "";
  try {
    let profile = null, history;
    if (local) {
      const fixture = await getJson(src);
      if (my !== loadSeq) return;
      FX = fixture;
      profile = FX.profile; history = FX.history;
    } else {
      const [, h, prof] = await Promise.all([
        loadHeroArt().then(() => null),
        fetchHistory(id).catch(e => { if (e.status === 404) return []; throw e; }),
        confirmedProfile || getSteamProfile(id).catch(() => null),
      ]);
      history = h; profile = prof;
    }
    if (my !== loadSeq) return;
    const { all, allGames } = splitHistory(history);
    const mode = savedMode(), games = gamesForMode(allGames, mode);
    const withSaved = savedWith(id); // the played-with filter, kept for this profile
    const name = (profile && profile.personaname) || `Player ${id}`;
    document.title = `${name} · Postmortem`;
    if (profile) NAMES.set(id, { name, avatar: steamAvatar(profile) });
    recentAdd({ id, name, avatar: profile && steamAvatar(profile) });
    P = { id, profile, name, allGames, games, mode, accountSaved, skipped: all.length - allGames.length, range: "all", hero: null, shown: 20, mates: null, mateMode: "party", seasons: null,
      fetchedAt: Date.now(), refreshing: false, refreshMsg: "", src: local ? src : null,
      withId: withSaved ? withSaved.id : null, withKind: withSaved ? withSaved.kind : "party" };
    closeWith();
    if (P.withId) { recomputeGames(); loadNames([P.withId]); }
    renderProfile();
    loadMetaFor(matchList().slice(0, 20));
    if (allGames.length) {
      loadMates();
      loadSeasons();
    }
  } catch (e) {
    if (my !== loadSeq) return;
    renderState("Couldn't load this profile", esc(e.message), { label: "Try again", run: () => loadProfile(id, src, confirmedProfile, accountSaved) });
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

// ---------- page layout: header, then a sidebar (left) and the matches (right) ----------
const HERO_NAMES_OK = id => !!(window.HERO_NAMES || {})[id];
function mostPlayed(g) {
  const n = {};
  for (const m of g) n[m.hero_id] = (n[m.hero_id] || 0) + 1;
  return Number(Object.keys(n).sort((a, b) => n[b] - n[a])[0]) || 0;
}
function renderProfile() {
  const all = P.games, prof = P.profile || {};
  // ?theme=<hero id> previews another hero's theme; picking your own theme needs Steam sign-in, so later.
  const pick = Number(new URLSearchParams(location.search).get("theme"));
  applyTheme(pick && HERO_NAMES_OK(pick) ? pick : mostPlayed(P.allGames)); // the player's overall main, so a filter never changes the colours
  const latestRanked = all.find(m => m.ranked_display_badge && Math.floor(m.ranked_display_badge / 10) > 0);
  const st = streaks(all), tags = profileTags(all), sAll = summarize(all);
  const rank = latestRanked
    ? `<span data-tip="Badge after their latest ranked game (${esc(ago(latestRanked.start_time))}).">${rankHtml(latestRanked.ranked_display_badge, 34)}</span>`
    : `<span class="muted">No ranked badge yet</span>`;
  $main.innerHTML = `
  <section class="card head">
    <div class="who">
      ${steamAvatar(prof) ? `<img class="avatar" src="${esc(steamAvatar(prof))}" alt="">` : `<span class="avatar none"></span>`}
      <div class="whoText">
        <h1>${esc(P.name)}</h1>
        <div class="line">
          ${P.mode !== "unranked" && all.length ? `${rank}<span class="dot"></span>` : ""}
          <span>${plural(all.length, "game")}</span>
          ${sAll ? `<span class="dot"></span><span>${pct(sAll.w, sAll.n)}% won</span>
          <span class="dot"></span><span class="muted">Last played ${esc(ago(all[0].start_time))}</span>` : ""}
        </div>
        ${tags.length ? `<div class="tags">${tags.map(t => `<button class="tag ${t.c}" data-tip="${esc(t.rule)}">${esc(t.t)}</button>`).join("")}</div>` : ""}
      </div>
    </div>
    <div class="headSide">
      ${st.cur ? `<div class="streak ${st.curWin ? "good" : "bad"}" data-tip="Best win streak on record: ${st.best}.">
        <b>${st.cur}</b><span>${st.cur === 1 ? (st.curWin ? "win" : "loss") : (st.curWin ? "wins" : "losses")} in a row</span>
      </div>` : ""}
      <button class="btn ghost" id="copyLink" data-tip="Copy a link to this profile to send to friends.">Copy link</button>
      ${P.id === savedMe()
        ? `<button class="link changeAccount" id="changeAccount" type="button">Change account</button>`
        : `<button class="btn ghost" id="saveMe" type="button" data-tip="Open this profile every time you visit Postmortem Profile.">Save as me</button>`}
    </div>
  </section>
  ${P.accountSaved ? "" : `<p class="accountStorage muted">This browser can't remember your account. ${location.search.includes("me=") ? "Bookmark this page to come back to it." : "Set it up again next time."}</p>`}
  <div class="layout">
    <aside class="side" id="side" aria-label="Stats"></aside>
    <div class="mainCol">
      ${all.length ? formHtml(all) : ""}
      <section class="card" id="matches"></section>
    </div>
  </div>
  <p class="foot">Data: deadlock-api${P.skipped ? `. ${plural(P.skipped, "Street Brawl, bot or private lobby game")} left out` : ""}. Stats count the ${plural(P.allGames.length, "game")} deadlock-api has for this player; a game it never received can't be counted, and a new one can take a few minutes to show up. Verdicts are graded against each hero's average from about 24,000 recent matches; tags on a match are Valve's own accolades at their top tier. Click a match to open it in Postmortem.</p>`;
  renderSide();
  renderMatches();
  const change = document.getElementById("changeAccount");
  if (change) change.addEventListener("click", () => renderSetup(true));
  const saveMe = document.getElementById("saveMe");
  if (saveMe) saveMe.addEventListener("click", () => {
    let ok = true;
    try { localStorage.setItem("pm_me", String(P.id)); } catch (e) { ok = false; }
    P.accountSaved = ok;
    renderProfile();
    if (ok) { const c = document.getElementById("changeAccount"); if (c) c.focus(); }
  });
  const copy = document.getElementById("copyLink");
  copy.addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}?id=${P.id}`;
    try { await navigator.clipboard.writeText(url); copy.textContent = "Link copied"; } catch (e) { prompt("Copy this link:", url); }
    setTimeout(() => { copy.textContent = "Copy link"; }, 1800);
  });
}

function renderSide() {
  const el = document.getElementById("side");
  if (!el) return;
  const g = inRange();
  el.hidden = !g.length;
  P.rankData = null;
  if (!g.length) return;
  el.innerHTML = `
    <div class="rangeRow">
      <span class="lbl">Counting</span>
      <div class="seg" role="group" aria-label="Which games the sidebar counts">${RANGES.map(([v, l]) => `<button data-range="${v}" class="${P.range === v ? "on" : ""}" aria-pressed="${P.range === v}" ${v !== "all" && P.games.length <= Number(v) ? "disabled" : ""}>${l}</button>`).join("")}</div>
    </div>
    ${mainHeroHtml(g)}
    ${P.mode === "unranked" ? "" : rankCardHtml(g)}
    ${heroesHtml(g)}
    ${P.mode === "all" ? matesHtml() : ""}
    ${patternsHtml(g)}`;
  wireSide();
}

function mainHeroHtml(g) {
  const by = {};
  for (const m of g) (by[m.hero_id] = by[m.hero_id] || []).push(m);
  const top = Object.entries(by).sort((a, b) => b[1].length - a[1].length)[0];
  if (!top) return "";
  const h = Number(top[0]), s = summarize(top[1]);
  const art = heroCard(h);
  return `
  <section class="card mainHero">
    <img class="mhArt" src="${art}" alt="">
    <div class="mhText">
      <span class="lbl">Main hero</span>
      <h2>${esc(heroName(h))}</h2>
      <div class="mhStats">
        <div><b>${s.n}</b><span>games (${pct(s.n, g.length)}%)</span></div>
        <div><b class="${s.n >= 5 ? (s.wr >= 0.55 ? "good" : s.wr <= 0.45 ? "bad" : "") : ""}">${pct(s.w, s.n)}%</b><span>won</span></div>
        <div><b>${fmt1(s.kda)}</b><span>KDA</span></div>
      </div>
    </div>
  </section>`;
}

function delta(now, before, better, fmt, unit) {
  if (before == null) return "";
  const d = now - before;
  const shown = fmt(Math.abs(d));
  if (shown === fmt(0)) return `<span class="delta flat">same</span>`;
  const good = better === "up" ? d > 0 : d < 0;
  return `<span class="delta ${good ? "good" : "bad"}">${d > 0 ? "+" : "-"}${shown}${unit || ""}</span>`;
}
// Recent form: the last 20 games against this player's usual (all their games), said in one sentence first.
function formHtml(all) {
  const last = all.slice(0, 20), a = summarize(last), u = summarize(all);
  const enough = all.length >= 40; // with fewer games, "usual" is mostly these same games
  const wrD = (a.wr - u.wr) * 100;
  let head = `${pctS(a.wr)} won in the last ${a.n} games.`;
  if (enough) {
    head = wrD >= 8 ? `Hot stretch: ${pctS(a.wr)} won lately, up from your usual ${pctS(u.wr)}.`
      : wrD <= -8 ? `Rough stretch: ${pctS(a.wr)} won lately, down from your usual ${pctS(u.wr)}.`
      : `Business as usual: ${pctS(a.wr)} won lately, close to your usual ${pctS(u.wr)}.`;
    const ch = [
      { r: a.d / Math.max(0.1, u.d) - 1, up: `Dying more than usual (${fmt1(a.d)} a game vs ${fmt1(u.d)}).`, down: `Dying less than usual (${fmt1(a.d)} a game vs ${fmt1(u.d)}).` },
      { r: a.kda / Math.max(0.1, u.kda) - 1, up: `KDA is up (${fmt1(a.kda)} vs ${fmt1(u.kda)}).`, down: `KDA is down (${fmt1(a.kda)} vs ${fmt1(u.kda)}).` },
      { r: a.spm / Math.max(1, u.spm) - 1, up: `Farming faster than usual (${Math.round(a.spm).toLocaleString()} souls a minute).`, down: `Farming slower than usual (${Math.round(a.spm).toLocaleString()} souls a minute vs ${Math.round(u.spm).toLocaleString()}).` },
    ].sort((x, y) => Math.abs(y.r) - Math.abs(x.r))[0];
    if (Math.abs(ch.r) >= 0.15) head += " " + (ch.r > 0 ? ch.up : ch.down);
  }
  const vs = (now, usual, better, fmt) => enough ? delta(now, usual, better, fmt) + `<span class="vsU">vs ${fmt(usual)} usual</span>` : "";
  const top = {};
  for (const m of last) top[m.hero_id] = (top[m.hero_id] || 0) + 1;
  const top3 = Object.entries(top).sort((x, y) => y[1] - x[1]).slice(0, 3);
  return `
  <section class="card form">
    <div class="cardHead"><h2>Recent form</h2><span class="sub">Last ${a.n} games${enough ? `, compared with all ${all.length.toLocaleString()} of your games` : ""}</span></div>
    <p class="take big2">${esc(head)}</p>
    <div class="formGrid">
      <div class="formMain" data-tip="Won ${a.w} of the last ${a.n}.">
        <div class="big">${pct(a.w, a.n)}<small>%</small></div>
        <div class="bigLbl">won ${vs(a.wr * 100, u.wr * 100, "up", x => Math.round(x) + "%")}</div>
      </div>
      <div class="formStats">
        <div class="fs" data-tip="(Kills + assists) per death."><span class="v">${fmt1(a.kda)}</span><span class="l">KDA</span><span class="dl2">${vs(a.kda, u.kda, "up", fmt1)}</span></div>
        <div class="fs" data-tip="Average souls per minute."><span class="v">${Math.round(a.spm).toLocaleString()}</span><span class="l">Souls / min</span><span class="dl2">${vs(a.spm, u.spm, "up", x => Math.round(x).toLocaleString())}</span></div>
        <div class="fs" data-tip="Average deaths per game."><span class="v">${fmt1(a.d)}</span><span class="l">Deaths / game</span><span class="dl2">${vs(a.d, u.d, "down", fmt1)}</span></div>
        <div class="fs top3" data-tip="Most played in these ${a.n} games.">
          <span class="tops">${top3.map(([h, n]) => `<span><img src="${heroImg(h)}" alt="">${n}</span>`).join("")}</span><span class="l">Most played</span>
        </div>
      </div>
    </div>
    <div class="wlLbl">The last ${a.n} games, oldest to newest. Green won, red lost. Click one to open it.</div>
    <div class="wl" aria-label="Last ${a.n} results, oldest first">
      ${last.slice().reverse().map(m => `<a class="sq ${isWin(m) ? "w" : "l"}" href="${matchHref(m.match_id)}" data-tip="${isWin(m) ? "Win" : "Loss"} as ${esc(heroName(m.hero_id))}, ${m.player_kills}/${m.player_deaths}/${m.player_assists}, ${esc(ago(m.start_time))}. Click to open."><img src="${heroImg(m.hero_id)}" alt="${esc(heroName(m.hero_id))}" loading="lazy"></a>`).join("")}
    </div>
  </section>`;
}

function heroesHtml(g) {
  const by = {};
  for (const m of g) (by[m.hero_id] = by[m.hero_id] || []).push(m);
  const rows = Object.entries(by).map(([h, list]) => ({ h: Number(h), s: summarize(list), last: list[0].start_time })).sort((a, b) => b.s.n - a.s.n || b.last - a.last);
  const max = rows[0] ? rows[0].s.n : 1;
  const showAll = P.heroesAll || rows.length <= 6;
  const wrCls = r => (r.s.n < 5 ? "faint" : r.s.wr >= 0.55 ? "good" : r.s.wr <= 0.45 ? "bad" : "");
  return `
  <section class="card heroes">
    <div class="cardHead"><h2>Heroes</h2><span class="sub">${plural(rows.length, "hero", "heroes")}</span></div>
    <div class="hTable">
      <div class="hRow hHead"><span>Hero</span><span>Games</span><span>Won</span><span data-tip="(Kills + assists) per death">KDA</span></div>
      ${rows.slice(0, showAll ? rows.length : 6).map(r => `
      <button class="hRow ${P.hero === r.h ? "sel" : ""}" data-hero="${r.h}" aria-pressed="${P.hero === r.h}" data-tip="Click to see only ${esc(heroName(r.h))} games. Average ${fmt1(r.s.k)} / ${fmt1(r.s.d)} / ${fmt1(r.s.a)}, ${Math.round(r.s.spm).toLocaleString()} souls a minute, last played ${esc(ago(r.last))}.">
        <span class="hName"><img src="${heroImg(r.h)}" alt="" loading="lazy">${esc(heroName(r.h))}</span>
        <span class="hGames"><b>${r.s.n}</b><i style="width:${Math.max(6, (r.s.n / max) * 100)}%"></i></span>
        <span class="${wrCls(r)}">${pct(r.s.w, r.s.n)}%</span>
        <span>${fmt1(r.s.kda)}</span>
      </button>`).join("")}
    </div>
    ${rows.length > 6 ? `<button class="more" id="heroesAll">${showAll ? "Show top 6" : `Show all ${rows.length} heroes`}</button>` : ""}
  </section>`;
}

// Teammates: deadlock-api's mate-stats. Only people with MATE_MIN+ games together, best and worst win rates.
const MATE_MIN = 5;
function matesHtml() {
  if (!P.mates) return `<section class="card mates"><div class="cardHead"><h2>Teammates</h2></div><p class="muted pad">Loading...</p></section>`;
  const src = P.mates[P.mateMode];
  const list = (src || []).filter(m => m.matches_played >= MATE_MIN && Number(m.mate_id) !== P.id)
    .map(m => ({ id: Number(m.mate_id), n: m.matches_played, w: m.wins, wr: m.wins / m.matches_played }))
    .sort((a, b) => b.wr - a.wr || b.n - a.n);
  const half = Math.ceil(list.length / 2);
  const best = list.slice(0, Math.min(3, half)), worst = list.slice(Math.max(half, list.length - 3)).reverse();
  const row = m => {
    const nm = NAMES.get(m.id) || {};
    return `<a class="mate" href="?id=${m.id}" data-with="${m.id}" data-kind="${P.mateMode === "party" ? "party" : "team"}" data-tip="${m.w} wins and ${m.n - m.w} losses together. Click to show only your games with them. Ctrl-click opens their profile.">
      ${nm.avatar ? `<img src="${esc(nm.avatar)}" alt="">` : `<span class="noAv"></span>`}
      <span class="mName">${esc(nm.name || "Player " + m.id)}</span>
      <span class="mN">${m.n}</span>
      <span class="mWr ${m.wr >= 0.55 ? "good" : m.wr <= 0.45 ? "bad" : ""}">${pct(m.w, m.n)}%</span></a>`;
  };
  const seg = `<div class="seg small" role="group" aria-label="Which teammates">
    <button data-mates="party" class="${P.mateMode === "party" ? "on" : ""}" aria-pressed="${P.mateMode === "party"}" data-tip="Friends who queued in the same party.">Queued with you</button>
    <button data-mates="all" class="${P.mateMode === "all" ? "on" : ""}" aria-pressed="${P.mateMode === "all"}" data-tip="Anyone who was on your team, party or not.">Any teammate</button></div>`;
  let body;
  if (!src) body = `<p class="muted pad">Couldn't load teammates right now.</p>`;
  else if (!list.length) body = `<p class="muted pad">Nobody with ${MATE_MIN} or more games together yet${P.mateMode === "party" ? ". Try Any teammate." : "."}</p>`;
  else {
    const showAll = P.matesAll;
    body = showAll
      ? `<div class="mHead"><span>Everyone, best first</span><span>Games</span><span>Won</span></div>${list.map(row).join("")}`
      : `<div class="mHead"><span>Best together</span><span>Games</span><span>Won</span></div>${best.map(row).join("")}
         ${worst.length ? `<div class="mHead"><span>Worst together</span><span></span><span></span></div>${worst.map(row).join("")}` : ""}`;
    if (list.length > best.length + worst.length || showAll) body += `<button class="more" id="matesAll">${showAll ? "Show best and worst" : `Show all ${list.length}`}</button>`;
  }
  return `<section class="card mates"><div class="cardHead"><h2>Teammates</h2><span class="sub" data-tip="Only people you played ${MATE_MIN} or more games with, all time.">${MATE_MIN}+ games together</span></div>${seg}${body}</section>`;
}

// Patterns: each one answers one question with the picture that suits it, and says the answer in words first.
// Buckets need 5+ games to show (10+ to be called out), and the game count is always there on hover.
// They are sorted so the most striking one comes first; the rest wait behind "More patterns".
const MIN_SHOW = 5, MIN_CALL = 10;
const pctS = x => Math.round(x * 100) + "%";
const hourName = h => (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? " AM" : " PM");
function bucketStats(buckets, overall) {
  return buckets.map(b => { const s = summarize(b.list); return { ...b, n: b.list.length, wr: s ? s.wr : 0, w: s ? s.w : 0 }; })
    .map(b => ({ ...b, ok: b.n >= MIN_SHOW, call: b.n >= MIN_CALL, cls: b.n >= MIN_CALL && b.wr >= overall + 0.05 ? "good" : b.n >= MIN_CALL && b.wr <= overall - 0.05 ? "bad" : "" }));
}
const strength = (bs, overall) => Math.max(0, ...bs.filter(b => b.call).map(b => Math.abs(b.wr - overall) * Math.sqrt(b.n)));
function columnsViz(bs, overall) { // small column chart: height = win rate on a 30% to 70% scale, dashed line = overall
  const y = v => Math.max(4, Math.min(100, ((v - 0.3) / 0.4) * 100));
  const tip = b => `${esc(b.label)}: ${b.ok ? `won ${b.w} of ${b.n} (${pctS(b.wr)})` : `only ${b.n} games, not enough to count`}.`;
  return `<div class="colsViz" style="--n:${bs.length}">
    <div class="cvRow">${bs.map(b => `<span class="cv ${b.ok ? b.cls : ""}">${b.ok ? pctS(b.wr) : ""}</span>`).join("")}</div>
    <div class="cbRow"><span class="avgLine" style="bottom:${y(overall)}%" aria-hidden="true"></span>${bs.map(b => `<span class="cb ${b.ok ? b.cls : "few"}" data-tip="${tip(b)}"><i style="height:${b.ok ? y(b.wr) : 0}%"></i></span>`).join("")}</div>
    <div class="clRow">${bs.map(b => `<span class="cl ${b.ok ? b.cls : "few"}" data-tip="${tip(b)}">${esc(b.short || b.label)}<small>${b.n}</small></span>`).join("")}</div>
  </div>`;
}
function patternsHtml(g) {
  const overall = summarize(g).wr;
  const ses = withSessions(g);
  const pats = [];

  // 1. Momentum: right after a win vs right after a loss.
  {
    const bs = bucketStats([
      { label: "After a win", list: ses.filter(m => m._prev && isWin(m._prev)) },
      { label: "After a loss", list: ses.filter(m => m._prev && !isWin(m._prev)) }], overall);
    const [aw, al] = bs;
    if (aw.ok && al.ok) {
      const d = aw.wr - al.wr;
      const head = d >= 0.06 ? `Losses stick: ${pctS(al.wr)} right after a loss, ${pctS(aw.wr)} after a win.`
        : d <= -0.04 ? `You bounce back: ${pctS(al.wr)} right after a loss.`
        : `Unfazed: about the same after a win (${pctS(aw.wr)}) or a loss (${pctS(al.wr)}).`;
      pats.push({ s: strength(bs, overall), html: `<div class="pat" data-k="momentum">
        <h3 data-tip="Your next game when you queued again within an hour.">Right after a game</h3><p class="take">${esc(head)}</p>
        <div class="duo">${bs.map(b => `<div class="duoBox ${b.cls}" data-tip="Won ${b.w} of ${b.n}."><b>${pctS(b.wr)}</b><span>${esc(b.label)}</span><small>${b.n} games</small></div>`).join("")}</div></div>` });
    }
  }
  // 2. Game number in a session.
  {
    const bs = bucketStats([1, 2, 3, 4].map(k => ({ label: k === 4 ? "4th game or later" : ["1st", "2nd", "3rd"][k - 1] + " game", short: k === 4 ? "4th+" : ["1st", "2nd", "3rd"][k - 1], list: ses.filter(m => (k === 4 ? m._game >= 4 : m._game === k)) })), overall);
    if (bs.filter(b => b.ok).length >= 2) {
      const ok = bs.filter(b => b.call);
      let head = "Steady from the first game to the last.";
      if (ok.length >= 2) {
        const best = ok.reduce((a, b) => (b.wr > a.wr ? b : a)), worst = ok.reduce((a, b) => (b.wr < a.wr ? b : a));
        const bi = bs.indexOf(best), wi = bs.indexOf(worst);
        if (best.wr - worst.wr >= 0.06) {
          if (wi > bi && wi >= 2) head = `You fade after the ${["1st", "2nd", "3rd"][Math.max(0, wi - 1)]} game: ${pctS(worst.wr)} from then on. Call it there?`;
          else if (wi === 0) head = `Slow starter: your first game of a session is your worst (${pctS(worst.wr)}).`;
          else head = `Your sweet spot is the ${best.short} game (${pctS(best.wr)}).`;
        }
      }
      pats.push({ s: strength(bs, overall), html: `<div class="pat"><h3 data-tip="A session is games less than an hour apart.">Game in a session</h3><p class="take">${esc(head)}</p>${columnsViz(bs, overall)}</div>` });
    }
  }
  // 3. Time of day: a 24-hour grid, each hour shaded by win rate.
  {
    const hrs = Array.from({ length: 24 }, (_, h) => g.filter(m => new Date(m.start_time * 1000).getHours() === h));
    const cells = hrs.map((list, h) => { const s = summarize(list); return { h, n: list.length, w: s ? s.w : 0, wr: s ? s.wr : 0 }; });
    // Best and worst 3-hour windows with enough games.
    const win3 = cells.map((c, h) => { const n = c.n + cells[(h + 1) % 24].n + cells[(h + 2) % 24].n, w = c.w + cells[(h + 1) % 24].w + cells[(h + 2) % 24].w; return { h, n, wr: n ? w / n : 0 }; }).filter(x => x.n >= MIN_CALL);
    if (g.length >= 20 && win3.length) {
      const best = win3.reduce((a, b) => (b.wr > a.wr ? b : a)), worst = win3.reduce((a, b) => (b.wr < a.wr ? b : a));
      const span = x => `${hourName(x.h)} to ${hourName((x.h + 3) % 24)}`;
      const head = best.wr - worst.wr >= 0.08 ? `Best from ${span(best)} (${pctS(best.wr)}), worst from ${span(worst)} (${pctS(worst.wr)}).` : "The clock doesn't matter much for you.";
      const busiest = Math.max(...cells.map(c => c.n));
      const cell = c => {
        if (!c.n) return `<i class="hr empty" data-tip="${hourName(c.h)}: no games.">${c.h % 12 === 0 ? 12 : c.h % 12}</i>`;
        const d = c.wr - overall, col = c.n < MIN_SHOW ? "var(--neutralCell)" : d >= 0.03 ? "var(--good)" : d <= -0.03 ? "var(--bad)" : "var(--neutralCell)";
        const a = (0.25 + 0.75 * Math.min(1, c.n / Math.max(10, busiest * 0.6))) * (c.n < MIN_SHOW ? 0.5 : 1);
        return `<i class="hr" style="--hc:${col};--ha:${a.toFixed(2)}" data-tip="${hourName(c.h)}: ${c.n < MIN_SHOW ? `${c.n} games, too few to count` : `won ${c.w} of ${c.n} (${pctS(c.wr)})`}.">${c.h % 12 === 0 ? 12 : c.h % 12}</i>`;
      };
      pats.push({ s: Math.max(Math.abs(best.wr - overall) * Math.sqrt(best.n), Math.abs(worst.wr - overall) * Math.sqrt(worst.n)), html: `<div class="pat">
        <h3 data-tip="When the game started, in your own time zone.">Time of day</h3><p class="take">${esc(head)}</p>
        <div class="clock24"><span class="ap">AM</span>${cells.slice(0, 12).map(cell).join("")}<span class="ap">PM</span>${cells.slice(12).map(cell).join("")}</div>
        <p class="legend"><i class="lg good"></i>above your average <i class="lg bad"></i>below <span>Paler squares mean fewer games.</span></p></div>` });
    }
  }
  // 4. Game length.
  {
    const bs = bucketStats([
      { label: "Under 25 min", short: "<25", list: g.filter(m => m.match_duration_s < 1500) },
      { label: "25 to 35 min", short: "25-35", list: g.filter(m => m.match_duration_s >= 1500 && m.match_duration_s < 2100) },
      { label: "35 to 45 min", short: "35-45", list: g.filter(m => m.match_duration_s >= 2100 && m.match_duration_s < 2700) },
      { label: "Over 45 min", short: "45+", list: g.filter(m => m.match_duration_s >= 2700) }], overall);
    if (bs.filter(b => b.ok).length >= 2) {
      const ok = bs.filter(b => b.call);
      let head = "Short or long, it makes little difference.";
      if (ok.length >= 2) {
        const best = ok.reduce((a, b) => (b.wr > a.wr ? b : a)), worst = ok.reduce((a, b) => (b.wr < a.wr ? b : a));
        if (best.wr - worst.wr >= 0.06) {
          const bi = bs.indexOf(best), wi = bs.indexOf(worst), lw = s => s.label.toLowerCase();
          head = bi === bs.length - 1 ? `Late-game player: ${pctS(best.wr)} when it goes ${lw(best)}, ${pctS(worst.wr)} in ${lw(worst)} games.`
            : wi === bs.length - 1 ? `Long games wear you down: ${pctS(worst.wr)} past 45 minutes, ${pctS(best.wr)} at ${lw(best)}.`
            : wi === 0 ? `Quick losses: ${pctS(worst.wr)} in games under 25 minutes, ${pctS(best.wr)} at ${lw(best)}.`
            : `Best at ${lw(best)} (${pctS(best.wr)}), worst at ${lw(worst)} (${pctS(worst.wr)}).`;
        }
      }
      pats.push({ s: strength(bs, overall), html: `<div class="pat"><h3 data-tip="How long the whole match lasted, in minutes.">Game length</h3><p class="take">${esc(head)}</p>${columnsViz(bs, overall)}</div>` });
    }
  }
  // 5. Side: Hidden King vs Archmother as one split bar.
  {
    const hk = g.filter(m => m.player_team === 0), am = g.filter(m => m.player_team === 1);
    if (hk.length >= MIN_SHOW && am.length >= MIN_SHOW) {
      const a = summarize(hk), b = summarize(am);
      const head = a.wr - b.wr >= 0.05 ? `Better for the Hidden King (${pctS(a.wr)} vs ${pctS(b.wr)}).` : b.wr - a.wr >= 0.05 ? `Better for the Archmother (${pctS(b.wr)} vs ${pctS(a.wr)}).` : "No favorite side.";
      pats.push({ s: Math.abs(a.wr - b.wr) * Math.sqrt(Math.min(a.n, b.n)), html: `<div class="pat"><h3 data-tip="Which patron you played for.">Side</h3><p class="take">${esc(head)}</p>
        <div class="sides"><span class="sd t1" style="flex:${a.n}" data-tip="Hidden King: won ${a.w} of ${a.n}."><b>${pctS(a.wr)}</b> Hidden King · ${a.n}</span><span class="sd t2" style="flex:${b.n}" data-tip="Archmother: won ${b.w} of ${b.n}."><b>${pctS(b.wr)}</b> Archmother · ${b.n}</span></div></div>` });
    }
  }

  pats.sort((a, b) => b.s - a.s);
  const shown = P.patsAll ? pats : pats.slice(0, 3);
  return `
  <section class="card patterns">
    <div class="cardHead"><h2>Patterns</h2><span class="sub" data-tip="Every number here is a win rate. Your overall is ${pctS(overall)}.">vs your ${pctS(overall)} overall</span></div>
    ${pats.length ? shown.map(p => p.html).join("") : `<p class="muted pad">Patterns show up after about 20 games.</p>`}
    ${pats.length > 3 ? `<button class="more" id="patsAll">${P.patsAll ? "Fewer patterns" : `${pats.length - 3} more patterns`}</button>` : ""}
  </section>`;
}

// Rank: now, peak, one row per ranked season, and the badge after every ranked game.
function seasonOf(t) {
  for (const s of P.seasons || []) for (const iv of s.intervals || []) if (t >= iv.start_timestamp && t < iv.end_timestamp) return s.name;
  return null;
}
function rankCardHtml(g) {
  const ranked = g.filter(m => m.ranked_display_badge && Math.floor(m.ranked_display_badge / 10) > 0).slice().reverse();
  if (ranked.length < 2) return "";
  const steps = ranked.map(m => badgeStep(m.ranked_display_badge));
  const lo = Math.min(...steps) - 1, hi = Math.max(...steps) + 1;
  const peakI = steps.lastIndexOf(Math.max(...steps));
  const saved = ranked.filter(m => m.ranked_used_demotion_protection).length;
  const W = 1000, H = 100, n = ranked.length;
  const x = i => (n === 1 ? W / 2 : (i / (n - 1)) * W), y = s => H - ((s - lo) / (hi - lo)) * H;
  let d = `M${x(0)},${y(steps[0])}`;
  for (let i = 1; i < n; i++) d += `H${x(i)}V${y(steps[i])}`;
  const tiers = [];
  for (let t = Math.floor(lo / 6); t <= Math.floor(hi / 6); t++) { const s = t * 6; if (s > lo && s < hi && RANK_NAMES[t]) tiers.push({ t, top: (y(s) / H) * 100 }); }
  P.rankData = { ranked, steps, x, y, W, H };
  // Seasons, newest first. Without season dates the table stays hidden.
  let seasons = "";
  if (P.seasons) {
    const by = new Map();
    for (const m of ranked) {
      const s = seasonOf(m.start_time);
      if (!s) continue;
      const r = by.get(s) || { name: s, n: 0, w: 0, peak: 0, end: 0, t: 0 };
      r.n++; if (isWin(m)) r.w++;
      if (badgeStep(m.ranked_display_badge) >= badgeStep(r.peak || 11)) r.peak = m.ranked_display_badge;
      r.end = m.ranked_display_badge; r.t = m.start_time;
      by.set(s, r);
    }
    const rows = [...by.values()].sort((a, b) => b.t - a.t);
    const short = n => { const d = String(n).match(/(\d+)\s*$/); return d ? "S" + d[1] : String(n); };
    const badge = (b, what) => { const r = rankOf(b); return r ? `<span class="sBadge" data-tip="${what}: ${esc(r.name)}" tabindex="0">${rankHtml(b, 26)}</span>` : "<span></span>"; };
    if (rows.length) seasons = `<div class="seasons"><div class="sRow sHead"><span>Season</span><span>W-L</span><span>Won</span><span>Peak</span><span>Last</span></div>${rows.map(r => `
      <div class="sRow"><span class="sName" data-tip="${esc(r.name)}: ${plural(r.n, "ranked game")}" tabindex="0">${esc(short(r.name))}</span><span class="num">${r.w}-${r.n - r.w}</span><span class="num">${pct(r.w, r.n)}%</span>${badge(r.peak, "Peak")}${badge(r.end, "Last game")}</div>`).join("")}</div>`;
  }
  return `
  <section class="card rankJ">
    <div class="cardHead"><h2>Rank</h2><span class="sub">${plural(n, "ranked game")}</span></div>
    <div class="rjStats">
      <div><span class="lbl">Now</span>${rankHtml(ranked[n - 1].ranked_display_badge, 34)}</div>
      <div data-tip="Reached ${esc(new Date(ranked[peakI].start_time * 1000).toLocaleDateString())}."><span class="lbl">Peak</span>${rankHtml(ranked[peakI].ranked_display_badge, 34)}</div>
      ${saved ? `<div data-tip="Losses where demotion protection kept the badge from dropping."><span class="lbl">Saved</span><span class="rjNum">${saved}</span></div>` : ""}
    </div>
    <div class="rjChart" id="rjChart" data-hint="Badge after each ranked game, oldest on the left">
      ${tiers.map(t => `<span class="rjTier" style="top:${t.top}%"><span>${esc(RANK_NAMES[t.t])}</span></span>`).join("")}
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" /></svg>
      <span class="rjCursor" id="rjCursor" hidden></span>
    </div>
    ${seasons}
  </section>`;
}

// ---------- matches ----------
const ITEM_COL = { w: "#E89A3C", v: "#7FC241", s: "#B77CF0" }; // same slot colors as the Compare page
const ITEM_SLOT_NAME = { w: "Weapon", v: "Vitality", s: "Spirit" };
function buildOf(p) { // final build: items still owned at the end, weapon then vitality then spirit, like the game
  const I = window.ITEMS || {};
  const seen = new Set();
  return p.items.filter(i => I[i.id] && !i.sold && !seen.has(i.id) && seen.add(i.id))
    .map(i => ({ id: i.id, name: I[i.id][0], slot: I[i.id][1], tier: I[i.id][2], icon: I[i.id][3], t: i.t }))
    .sort((a, b) => "wvs".indexOf(a.slot) - "wvs".indexOf(b.slot) || b.tier - a.tier || a.t - b.t).slice(0, 12);
}
function itemGrid(meta, me) {
  if (meta === undefined) return `<span class="items loading" aria-hidden="true">${"<i></i>".repeat(12)}</span>`;
  if (!me) return `<span class="items none" data-tip="deadlock-api doesn't have the details of this match yet.">${"<i></i>".repeat(12)}</span>`;
  const b = buildOf(me);
  const cells = b.map(it => `<i class="it" style="--sc:${ITEM_COL[it.slot]};background-image:url('assets/items/${esc(it.icon)}.webp')" data-tip="${esc(it.name)} (${ITEM_SLOT_NAME[it.slot]}, tier ${it.tier}), bought at ${mmss(it.t)}"></i>`);
  while (cells.length < 12) cells.push("<i></i>");
  return `<span class="items">${cells.join("")}</span>`;
}
// Valve's accolades come with 1 to 3 stars (accolade_threshold_achieved). A strong game can earn a dozen
// 2-star ones, so a row only shows the 3-star ones.
const ACC_TOP = 3;
function topAccolades(me) {
  const A = window.ACCOLADES || {};
  const seen = new Set();
  return (me ? me.acc : []).filter(a => A[a.id] && a.tier >= ACC_TOP && !seen.has(a.id) && seen.add(a.id)).sort((a, b) => b.tier - a.tier).map(a => {
    const d = A[a.id], txt = (a.v === 1 ? d[1] : d[2]).replace("{v}", a.v.toLocaleString());
    return { name: d[0], rule: `${d[0]}: ${txt}. Valve's top (3-star) accolade tier for this hero.` };
  });
}
function playersCol(meta, team, m) {
  const ps = meta.players.filter(p => p.team === team).sort((a, b) => a.slot - b.slot);
  return `<span class="pCol t${team + 1}">${ps.map(p => {
    const nm = (NAMES.get(p.account_id) || {}).name || (p.account_id ? "Player " + p.account_id : "Bot");
    const me = p.account_id === P.id, mate = !me && p.account_id && p.team === teamNum(m.player_team);
    if (mate) return `<a class="pl" href="?id=${p.account_id}" data-with="${p.account_id}" data-match="${m.match_id}" data-tip="${esc(nm)} on ${esc(heroName(p.hero_id))}. Click to show only your games with them. Ctrl-click opens their profile."><img src="${heroImg(p.hero_id)}" alt=""><span class="pn">${esc(nm)}</span></a>`;
    return me ? `<span class="pl me" data-tip="${esc(nm)} on ${esc(heroName(p.hero_id))} (this profile)."><img src="${heroImg(p.hero_id)}" alt=""><span class="pn">${esc(nm)}</span></span>`
      : `<a class="pl" href="?id=${p.account_id}" data-id="${p.account_id}" data-tip="${esc(nm)} on ${esc(heroName(p.hero_id))}. Click to open their profile."><img src="${heroImg(p.hero_id)}" alt=""><span class="pn">${esc(nm)}</span></a>`;
  }).join("")}</span>`;
}
function matchRow(m) {
  const win = isWin(m), v = verdict(m);
  const meta = META.get(m.match_id); // undefined: still loading, null: not available
  const me = meta ? meta.players.find(p => p.account_id === P.id) : null;
  const mode = matchMode(m);
  const modeLabel = mode[0].toUpperCase() + mode.slice(1);
  const mvp = me && me.mvp ? (me.mvp === 1 ? `<span class="chipMvp gold" data-tip="Valve's MVP for this match.">MVP</span>` : `<span class="chipMvp" data-tip="Valve's Key Player: ${me.mvp === 2 ? "2nd" : "3rd"} best in the lobby.">#${me.mvp}</span>`) : "";
  const acc = topAccolades(me);
  const art = moodCard(m.hero_id, win);
  const teams = meta && meta.players.length >= 2 ? `<span class="players">${playersCol(meta, 0, m)}${playersCol(meta, 1, m)}</span>` : `<span class="players"></span>`;
  return `<div class="match ${win ? "w" : "l"}">
    <a class="mLink" href="${matchHref(m.match_id)}" aria-label="${win ? "Win" : "Loss"} as ${esc(heroName(m.hero_id))}, ${esc(ago(m.start_time))}. Open in Postmortem."></a>
    <span class="mArt"><img src="${art}" alt="" loading="lazy"></span>
    <span class="mRes"><b>${win ? "Victory" : "Defeat"}</b><span>${modeLabel}${m.ranked_delta != null ? ` <i class="${m.ranked_delta >= 0 ? "good" : "bad"}">${m.ranked_delta >= 0 ? "+" : ""}${m.ranked_delta}</i>` : ""}</span><span>${mmss(m.match_duration_s)} · ${esc(clock(m.start_time))}</span></span>
    <span class="mKda"><b>${m.player_kills} / ${m.player_deaths} / ${m.player_assists}</b><span>${fmt1((m.player_kills + m.player_assists) / Math.max(1, m.player_deaths))} KDA</span><span>${kSouls(m.net_worth)} souls</span></span>
    <span class="mBadges">${mvp}<span class="verdict ${v.c}" data-tip="${esc(v.rule)}" tabindex="0">${esc(v.w)}</span>${acc.slice(0, 1).map(a => `<span class="acc" data-tip="${esc(a.rule)}" tabindex="0">${esc(a.name)}</span>`).join("")}${acc.length > 1 ? `<span class="acc accMore" data-tip="Also: ${esc(acc.slice(1).map(a => a.name).join(", "))}" tabindex="0">+${acc.length - 1}</span>` : ""}</span>
    ${itemGrid(meta, me)}
    ${teams}
  </div>`;
}
// ---------- "Played with": only the games with one teammate ----------
// deadlock-api's mate-stats lists, for every teammate, the ids of the matches you shared. Called twice: same_party=true
// ("queued together") and same_party=false (anyone on your team, queued with you or not). The filter keeps the games
// whose ids are in that list. Saved per profile as pm_with.
const WITH_MIN = 2; // fewest shared games for a teammate to be offered in the list
const withKinds = [["party", "Queued together", "Games where you queued in the same party."], ["team", "Same team", "Games where you were on the same team, queued together or not."]];
const withList = kind => (P && P.mates && P.mates[kind === "party" ? "party" : "all"]) || null;
function withSet() {
  if (!P || !P.withId) return null;
  const list = withList(P.withKind);
  if (!list) return null;
  const m = list.find(x => Number(x.mate_id) === P.withId);
  return new Set(m && Array.isArray(m.matches) ? m.matches.map(Number) : []);
}
function recomputeGames() {
  let g = gamesForMode(P.allGames, P.mode);
  if (P.withId) { const set = withSet(); g = set ? g.filter(m => set.has(Number(m.match_id))) : []; }
  P.games = g;
}
const withLoading = () => !!(P && P.withId && !withList(P.withKind));
const nameOf = id => (NAMES.get(id) || {}).name || `Player ${id}`;
function savedWith(profileId) {
  try { const v = JSON.parse(localStorage.getItem("pm_with") || "null"); if (v && v.p === profileId && Number.isInteger(v.id) && v.id > 0 && ["party", "team"].includes(v.kind)) return v; } catch (e) { /* none */ }
  return null;
}
function setWith(id, kind) {
  hideTip();
  P.withId = id ? Number(id) : null;
  if (kind) P.withKind = kind;
  try { if (P.withId) localStorage.setItem("pm_with", JSON.stringify({ p: P.id, id: P.withId, kind: P.withKind })); else localStorage.removeItem("pm_with"); } catch (e) { /* this visit only */ }
  if (P.withId) loadNames([P.withId]).then(() => { if (P && P.withId) renderMatches(); });
  recomputeGames();
  if (P.hero && !P.games.some(m => m.hero_id === P.hero)) P.hero = null;
  if (P.range !== "all" && P.games.length <= Number(P.range)) P.range = "all";
  P.shown = 20;
  const y = window.scrollY;
  renderProfile();
  window.scrollTo(0, y);
  loadMetaFor(matchList().slice(0, 20));
}
// Clicking a teammate's name in a match or in the Teammates card: "queued together" if you queued with them in
// that game (or, from the card, whichever list is showing), otherwise "same team".
function kindFor(id, matchId) {
  const party = withList("party");
  const m = party && party.find(x => Number(x.mate_id) === Number(id));
  return m && Array.isArray(m.matches) && (matchId == null || m.matches.map(Number).includes(Number(matchId))) ? "party" : "team";
}

let wpEl = null;
function closeWith() { if (wpEl) wpEl.hidden = true; const b = document.getElementById("withBtn"); if (b) b.setAttribute("aria-expanded", "false"); }
function withRows(q) {
  const list = (withList(P.withKind) || []).filter(m => m.matches_played >= WITH_MIN && Number(m.mate_id) !== P.id)
    .sort((a, b) => b.matches_played - a.matches_played || b.wins - a.wins);
  const needle = q.trim().toLowerCase();
  const rows = needle ? list.filter(m => nameOf(Number(m.mate_id)).toLowerCase().includes(needle)) : list;
  return { rows: rows.slice(0, needle ? 12 : 8), total: rows.length, any: list.length };
}
function withRowHtml(m) {
  const id = Number(m.mate_id), nm = NAMES.get(id) || {};
  return `<button type="button" class="wRow ${P.withId === id ? "sel" : ""}" data-pick="${id}">
    ${nm.avatar ? `<img src="${esc(nm.avatar)}" alt="">` : `<span class="noAv"></span>`}
    <span class="wName">${esc(nameOf(id))}</span>
    <span class="wMeta">${plural(m.matches_played, "game")} · ${pct(m.wins, m.matches_played)}% won</span></button>`;
}
function paintWithList() {
  if (!wpEl || wpEl.hidden) return;
  const input = wpEl.querySelector("#withQ"), box = wpEl.querySelector("#withList");
  const q = input ? input.value : "";
  if (!withList(P.withKind)) { box.innerHTML = `<p class="muted pad">${P.mates ? "Couldn't load your teammates right now." : "Loading your teammates..."}</p>`; return; }
  const { rows, total, any } = withRows(q);
  box.innerHTML = !any ? `<p class="muted pad">Nobody with ${WITH_MIN} or more games together${P.withKind === "party" ? " in a party yet. Try Same team." : " yet."}</p>`
    : !rows.length ? `<p class="muted pad">No teammate with that name among the people you've played with most.</p>`
    : `${q.trim() ? "" : `<div class="wHead">Most games together</div>`}${rows.map(withRowHtml).join("")}${total > rows.length && q.trim() ? `<p class="muted pad">Showing ${rows.length} of ${total}. Type more of the name.</p>` : ""}`;
}
function openWith(btn) {
  if (!wpEl) {
    wpEl = document.createElement("div");
    wpEl.className = "withPop"; wpEl.setAttribute("role", "dialog"); wpEl.setAttribute("aria-label", "Played with"); wpEl.hidden = true;
    document.body.appendChild(wpEl);
    document.addEventListener("pointerdown", e => { if (!wpEl.hidden && !wpEl.contains(e.target) && !e.target.closest("#withBtn")) closeWith(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !wpEl.hidden) { closeWith(); const b = document.getElementById("withBtn"); if (b) b.focus(); } });
    wpEl.addEventListener("click", e => {
      const k = e.target.closest("[data-wkind]"), p = e.target.closest("[data-pick]");
      if (k) { P.withKind = k.dataset.wkind; if (P.withId) { setWith(P.withId, P.withKind); } paintWithShell(); }
      if (p) { setWith(Number(p.dataset.pick), P.withKind); closeWith(); const b = document.getElementById("withBtn"); if (b) b.focus(); }
      if (e.target.closest("#withClear")) { setWith(null); closeWith(); }
      const pr = e.target.closest("a[data-id]");
      if (pr && !(e.ctrlKey || e.metaKey || e.shiftKey || e.button)) { e.preventDefault(); closeWith(); go({ id: pr.dataset.id }, true); window.scrollTo(0, 0); }
    });
    wpEl.addEventListener("input", e => { if (e.target.id === "withQ") paintWithList(); });
  }
  paintWithShell();
  const r = btn.getBoundingClientRect(), w = Math.min(360, window.innerWidth - 16);
  wpEl.style.width = w + "px";
  wpEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + window.scrollX + "px";
  wpEl.style.top = r.bottom + 6 + window.scrollY + "px";
  wpEl.hidden = false;
  btn.setAttribute("aria-expanded", "true");
  paintWithList();
  const input = wpEl.querySelector("#withQ"); if (input) input.focus();
  // names for the people shown, then again for search: only the most frequent teammates, in one call
  const ids = new Set();
  for (const kind of ["party", "team"]) (withList(kind) || []).filter(m => m.matches_played >= WITH_MIN).sort((a, b) => b.matches_played - a.matches_played).slice(0, 150).forEach(m => ids.add(Number(m.mate_id)));
  loadNames([...ids]).then(paintWithList);
}
function paintWithShell() {
  const q = wpEl.querySelector("#withQ") ? wpEl.querySelector("#withQ").value : "";
  wpEl.innerHTML = `
    <div class="seg small wKind" role="group" aria-label="What counts as played with">${withKinds.map(([v, l, tip]) => `<button type="button" data-wkind="${v}" class="${P.withKind === v ? "on" : ""}" aria-pressed="${P.withKind === v}" data-tip="${tip}">${l}</button>`).join("")}</div>
    <input id="withQ" type="search" placeholder="Find a teammate by name" aria-label="Find a teammate by name" autocomplete="off" spellcheck="false" value="${esc(q)}">
    <div id="withList" class="wList"></div>
    ${P.withId ? `<div class="wFoot"><a class="link" href="?id=${P.withId}" data-id="${P.withId}">Open ${esc(nameOf(P.withId))}'s profile</a><button type="button" class="link" id="withClear">Show everyone</button></div>` : ""}`;
  paintWithList();
}

function setMode(mode) {
  if (P.mode === mode) return;
  hideTip();
  P.mode = mode;
  recomputeGames();
  if (P.hero && !P.games.some(m => m.hero_id === P.hero)) P.hero = null;
  if (P.range !== "all" && P.games.length <= Number(P.range)) P.range = "all";
  P.shown = 20;
  try { localStorage.setItem("pm_mode", mode); } catch (e) { /* use the selection for this visit */ }
  renderProfile();
  const b = $main.querySelector(`[data-mode="${mode}"]`);
  if (b) b.focus({ preventScroll: true });
  loadMetaFor(matchList().slice(0, 20));
}
function matchList() {
  return P.hero ? P.games.filter(m => m.hero_id === P.hero) : P.games;
}
function renderMatches() {
  const el = document.getElementById("matches");
  if (!el) return;
  const list = matchList();
  const shown = list.slice(0, P.shown);
  const days = new Map();
  for (const [i, m] of list.entries()) {
    const k = dayKey(m.start_time);
    if (!days.has(k)) {
      if (i >= P.shown) break;
      days.set(k, { t: m.start_time, shown: [], wins: 0, losses: 0, points: 0, hasPoints: false });
    }
    const day = days.get(k);
    if (isWin(m)) day.wins++; else day.losses++;
    if (m.ranked_delta != null) { day.points += m.ranked_delta; day.hasPoints = true; }
    if (i < P.shown) day.shown.push(m);
  }
  const noDetails = shown.filter(m => META.get(m.match_id) === null).length;
  const wk = P.withKind === "party" ? "queued together" : "on your team";
  const empty = !P.allGames.length
    ? (P.skipped ? "This player only has Street Brawl, bot or private lobby games on record." : "deadlock-api has no stored games for this account yet.")
    : withLoading() ? `Finding your games with ${esc(nameOf(P.withId))}...`
    : P.withId && !withList(P.withKind) ? "Couldn't load your teammates, so the played-with filter can't run. Reload to try again."
    : P.withId ? `No ${P.mode === "all" ? "" : P.mode + " "}games with ${esc(nameOf(P.withId))} ${wk}. ${P.withKind === "party" ? "Try Same team, or " : "Try "}${P.mode === "all" ? "" : "All modes, or "}clear the filter.`
    : "No games match this filter. Select All to see every match mode.";
  el.innerHTML = `
    <div class="cardHead"><h2>Matches</h2>
      ${P.hero ? `<button class="chip filter" id="clearHero" aria-label="Show all heroes again"><img src="${heroImg(P.hero)}" alt="">${esc(heroName(P.hero))} only<span class="x" aria-hidden="true">✕</span></button>` : ""}
      ${P.withId ? `<span class="chip filter withChip"><button type="button" id="withBtn" class="withMain" aria-haspopup="dialog" aria-expanded="false" data-tip="Change who you played with, or switch between queued together and same team.">${(NAMES.get(P.withId) || {}).avatar ? `<img src="${esc(NAMES.get(P.withId).avatar)}" alt="">` : ""}With ${esc(nameOf(P.withId))}<small>${P.withKind === "party" ? "queued together" : "same team"}</small></button><button type="button" id="clearWith" class="x" aria-label="Show every game again">✕</button></span>` : ""}
      <span class="sub">${plural(list.length, "game")}</span>
      <span class="hdTools">${P.withId ? "" : `<button type="button" id="withBtn" class="btn ghost small withOpen" aria-haspopup="dialog" aria-expanded="false" data-tip="Only games with one teammate, for example a friend you queue with.">Played with</button>`}
      <div class="seg modeSeg" role="group" aria-label="Match mode">${MODES.map(([value, label]) => `<button type="button" data-mode="${value}" class="${P.mode === value ? "on" : ""}" aria-pressed="${P.mode === value}" data-tip="${modeTip(value)}">${label}</button>`).join("")}</div></span></div>
    <div class="matchBar"><span id="freshBox">${refreshHtml()}</span><span class="dot" aria-hidden="true"></span><button class="link" id="openUpload" type="button">Missing a game?</button></div>
    ${list.length ? "" : `<p class="muted pad">${empty}</p>`}
    ${[...days.values()].map(({ t, shown, wins, losses, points, hasPoints }) => {
      return `<div class="day"><div class="dayHead"><span class="dl">${esc(dayLabel(t))}</span><span class="dwl"><b class="good">${wins}W</b> <b class="bad">${losses}L</b></span>${hasPoints ? `<span class="dpts ${points >= 0 ? "good" : "bad"}" data-tip="Rank progress from that day's ranked games.">${points >= 0 ? "+" : ""}${points} rank</span>` : ""}</div>
      ${shown.map(matchRow).join("")}</div>`;
    }).join("")}
    ${metaNote ? `<p class="metaNote">${esc(metaNote)} <button class="link" id="metaRetry">Try again</button></p>` : ""}
    ${noDetails ? `<p class="metaNote">${plural(noDetails, "match", "matches")} above ${noDetails === 1 ? "is" : "are"} missing item and player details. Your stats still count ${noDetails === 1 ? "it" : "them"}. <button class="link" id="openUpload2" type="button">Add missing matches</button></p>` : ""}
    ${list.length > P.shown ? `<button class="more" id="moreMatches">Show ${Math.min(20, list.length - P.shown)} more</button>` : ""}`;
  const more = document.getElementById("moreMatches");
  if (more) more.addEventListener("click", () => { P.shown += 20; renderMatches(); loadMetaFor(list.slice(P.shown - 20, P.shown)); });
  const clr = document.getElementById("clearHero");
  if (clr) clr.addEventListener("click", () => { P.hero = null; P.shown = 20; renderSide(); renderMatches(); loadMetaFor(P.games.slice(0, 20)); });
  el.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  const wb = document.getElementById("withBtn");
  if (wb) wb.addEventListener("click", () => { if (wpEl && !wpEl.hidden) closeWith(); else openWith(wb); });
  const cw = document.getElementById("clearWith");
  if (cw) cw.addEventListener("click", () => { closeWith(); setWith(null); });
  el.querySelectorAll("a[data-with]").forEach(a => a.addEventListener("click", e => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return; // ctrl-click and the like keep opening the profile
    e.preventDefault(); setWith(Number(a.dataset.with), a.dataset.kind || kindFor(a.dataset.with, a.dataset.match));
  }));
  wireRefresh();
  for (const id of ["openUpload", "openUpload2"]) { const b = document.getElementById(id); if (b) b.addEventListener("click", () => openUpload(b)); }
  const retry = document.getElementById("metaRetry");
  if (retry) retry.addEventListener("click", () => { for (const m of shown) if (META.get(m.match_id) === null) META.delete(m.match_id); metaNote = ""; renderMatches(); loadMetaFor(shown); });
  el.querySelectorAll("a[data-id]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); go({ id: a.dataset.id }, true); window.scrollTo(0, 0); }));
}

function wireSide() {
  const side = document.getElementById("side");
  side.querySelectorAll(".hRow[data-hero]").forEach(b => b.addEventListener("click", () => {
    const h = Number(b.dataset.hero);
    P.hero = P.hero === h ? null : h; P.shown = 20;
    renderSide(); renderMatches();
    loadMetaFor(matchList().slice(0, 20));
    if (P.hero && window.innerWidth < 900) document.getElementById("matches").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }));
  const all = document.getElementById("heroesAll");
  if (all) all.addEventListener("click", () => { P.heroesAll = !P.heroesAll; renderSide(); });
  side.querySelectorAll("[data-range]").forEach(b => b.addEventListener("click", () => { if (P.range !== b.dataset.range) { P.range = b.dataset.range; renderSide(); } }));
  side.querySelectorAll("[data-mates]").forEach(b => b.addEventListener("click", () => { P.mateMode = b.dataset.mates; P.matesAll = false; renderSide(); loadNames(((P.mates || {})[P.mateMode] || []).filter(m => m.matches_played >= MATE_MIN).map(m => Number(m.mate_id))).then(renderSide); }));
  const pa = document.getElementById("patsAll");
  if (pa) pa.addEventListener("click", () => { P.patsAll = !P.patsAll; renderSide(); });
  const ma = document.getElementById("matesAll");
  if (ma) ma.addEventListener("click", () => { P.matesAll = !P.matesAll; renderSide(); });
  side.querySelectorAll("a[data-with]").forEach(a => a.addEventListener("click", e => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault(); setWith(Number(a.dataset.with), a.dataset.kind);
    const m = document.getElementById("matches"); if (m && window.innerWidth < 900) m.scrollIntoView({ block: "start" });
  }));
  side.querySelectorAll("a[data-id]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); go({ id: a.dataset.id }, true); window.scrollTo(0, 0); }));
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

// ---------- "Add a missing match": upload match keys from Steam's cache ----------
// deadlock-api only learns about a game when someone sends it that match's keys (a "salt" for the match info and one for
// the replay). Deadlock leaves them in Steam's web cache as file names like
//   http://replay410.valve.net/1422450/138427763_1163193658.meta.bz2   (and .dem.bz2 for the replay key)
// This reads only those cache entries, takes out three numbers per match (the server number, the match id and the key),
// shows how many it found, and sends them to deadlock-api's public POST /v1/matches/salts only after the player presses Send.
// Nothing else from the files is kept or sent.
const COMPANION_APP = ""; // the Postmortem app's page, once it exists; empty shows "Coming soon"
const CACHE_ENTRY = /^[0-9a-f]{40}_[0-9a-f]{40}$/i; // how Steam names httpcache files; anything else is never opened
const SALT_URL = /replay(\d{1,5})\.valve\.net\W{0,8}1422450\/(\d{1,12})_(\d{1,10})\.(meta|dem)\.bz2/gi;
const U32 = 4294967295;
function readSalts(text, into) { // text -> Map(match_id -> { match_id, cluster_id, metadata_salt, replay_salt })
  for (const m of text.matchAll(SALT_URL)) {
    const cluster = Number(m[1]), id = Number(m[2]), salt = Number(m[3]);
    if (!(id > 0) || !(salt > 0) || salt > U32) continue;
    const r = into.get(id) || { match_id: id, cluster_id: cluster, metadata_salt: null, replay_salt: null };
    if (m[4].toLowerCase() === "meta") r.metadata_salt = salt; else r.replay_salt = salt;
    into.set(id, r);
  }
  return into;
}
async function scanCache(files, onProgress) { // files: File objects; only Steam cache entries are opened, and only their first 16 KB
  const found = new Map(), list = files.filter(f => CACHE_ENTRY.test(f.name) && f.size > 0);
  for (let i = 0; i < list.length; i += 40) {
    await Promise.all(list.slice(i, i + 40).map(async f => {
      try { readSalts(new TextDecoder("latin1").decode(await f.slice(0, 16384).arrayBuffer()), found); } catch (e) { /* unreadable file: skip */ }
    }));
    if (onProgress) onProgress(Math.min(i + 40, list.length), list.length);
  }
  return { matches: [...found.values()].filter(r => r.metadata_salt || r.replay_salt), looked: list.length };
}
async function pickCacheFolder() { // -> File[] (null when cancelled). Chromium's folder picker where it has one, else a folder input.
  if (window.showDirectoryPicker) {
    const dir = await window.showDirectoryPicker({ id: "steam-httpcache", mode: "read" });
    const out = [];
    const walk = async (d, depth) => {
      for await (const [name, h] of d.entries()) {
        if (h.kind === "file") { if (CACHE_ENTRY.test(name)) out.push(await h.getFile()); }
        else if (depth < 2) await walk(h, depth + 1);
      }
    };
    await walk(dir, 0);
    return out;
  }
  return new Promise(resolve => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.multiple = true; inp.setAttribute("webkitdirectory", "");
    inp.addEventListener("change", () => resolve(inp.files && inp.files.length ? [...inp.files] : null));
    inp.addEventListener("cancel", () => resolve(null));
    inp.click();
  });
}
async function sendSalts(matches, onProgress) { // -> { sent, rejected, error }
  let sent = 0, rejected = 0;
  const post = batch => fetch(`${API}matches/salts`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(batch.map(r => ({ match_id: r.match_id, cluster_id: r.cluster_id, metadata_salt: r.metadata_salt, replay_salt: r.replay_salt, username: "postmortem" }))) });
  for (let i = 0; i < matches.length; i += 25) {
    const batch = matches.slice(i, i + 25);
    let r;
    try { r = await post(batch); } catch (e) { return { sent, rejected, error: "Couldn't reach deadlock-api. Check your connection and try again." }; }
    if (r.status === 429) return { sent, rejected, error: "deadlock-api says we're sending too fast. Wait a minute and try again." };
    if (r.ok) sent += batch.length;
    else if (r.status === 400 && batch.length > 1) { // one bad key can fail the whole batch, so find which ones it is
      for (const one of batch) { try { const q = await post([one]); if (q.ok) sent++; else rejected++; } catch (e) { rejected++; } }
    } else if (r.status === 400) rejected++;
    else return { sent, rejected, error: `deadlock-api answered with error ${r.status}. Try again later.` };
    if (onProgress) onProgress(Math.min(i + 25, matches.length), matches.length);
  }
  return { sent, rejected, error: "" };
}

let upDlg = null;
function openUpload(opener) {
  if (!upDlg) {
    upDlg = document.createElement("dialog");
    upDlg.className = "upDlg";
    upDlg.setAttribute("aria-labelledby", "upTitle");
    document.body.appendChild(upDlg);
    upDlg.addEventListener("click", e => { if (e.target === upDlg) upDlg.close(); }); // a click on the dim area closes it
  }
  const dlg = upDlg;
  const onWin = /Windows/i.test(navigator.userAgent), isMac = /Mac/i.test(navigator.userAgent);
  const path = onWin ? "C:\\Program Files (x86)\\Steam\\appcache\\httpcache" : isMac ? "~/Library/Application Support/Steam/appcache/httpcache" : "~/.steam/steam/appcache/httpcache";
  dlg.innerHTML = `
    <div class="upHead"><h2 id="upTitle">Add a missing match</h2><button class="x" id="upClose" type="button" aria-label="Close">✕</button></div>
    <p class="upLead">deadlock-api can only show a game after someone sends it that game's match keys. If a game of yours is missing, you can send the keys yourself.</p>
    <div class="upOpt primary">
      <div><h3>Postmortem app</h3><p>Sends every game by itself, right after it ends. Nothing to do by hand.</p></div>
      ${COMPANION_APP ? `<a class="btn" href="${esc(COMPANION_APP)}" target="_blank" rel="noopener">Get the app</a>` : `<button class="btn" type="button" disabled>Coming soon</button>`}
    </div>
    <div class="upOpt">
      <div><h3>Upload from Steam cache</h3>
        <p>Choose Steam's <b>httpcache</b> folder. It is usually at <code>${esc(path)}</code>. This page only looks for match keys inside it and shows you what it found before sending anything.</p>
      </div>
      <button class="btn" id="upPick" type="button">Choose folder</button>
    </div>
    <div class="upStatus" id="upStatus" role="status" aria-live="polite"></div>
    <div class="faq">
      <details><summary>Why do games go missing?</summary><p>Valve only lets a stats site fetch a match when it knows that match's keys, and it limits how fast sites can ask. deadlock-api collects keys from players who share them, so a game nobody shared can stay missing, and a new one can take a few minutes.</p></details>
      <details><summary>What gets sent?</summary><p>Three numbers per match: the server number, the match id and one or two keys, plus the label "postmortem". No names, accounts, file contents or file names. Nothing is sent until you press Send.</p></details>
      <details><summary>Is it free? Will it slow my game?</summary><p>It is free. Reading the folder takes a few seconds on this page, and nothing runs while you play.</p></details>
      <details><summary>My browser won't open that folder</summary><p>Some browsers refuse folders inside Program Files. Copy the <b>httpcache</b> folder to your Desktop, then choose the copy. After sending, wait a few minutes and press Refresh on your profile.</p></details>
    </div>`;
  const status = dlg.querySelector("#upStatus"), pick = dlg.querySelector("#upPick");
  dlg.querySelector("#upClose").addEventListener("click", () => dlg.close());
  const say = (html, cls) => { status.className = "upStatus" + (cls ? " " + cls : ""); status.innerHTML = html; };
  pick.addEventListener("click", async () => {
    pick.disabled = true; say("");
    let files;
    try { files = await pickCacheFolder(); } catch (e) {
      pick.disabled = false;
      return say(e && e.name === "AbortError" ? "" : "Your browser wouldn't open that folder. Copy the <b>httpcache</b> folder to your Desktop and choose the copy.", "err");
    }
    if (!files) { pick.disabled = false; return; }
    say("Reading the folder...");
    const { matches, looked } = await scanCache(files, (n, t) => say(`Reading the folder... ${n.toLocaleString()} of ${t.toLocaleString()} files`));
    pick.disabled = false;
    if (!looked) return say("That doesn't look like Steam's httpcache folder. It should hold folders named 00 to ff full of long file names.", "err");
    if (!matches.length) return say(`Looked through ${plural(looked, "file")} and found no match keys. Check that this is the Steam folder on the computer that plays Deadlock.`, "err");
    say(`Found <b>${plural(matches.length, "match", "matches")}</b> with keys. <button class="btn" id="upSend" type="button">Send ${matches.length.toLocaleString()}</button><span class="muted">Only match numbers and keys are sent.</span>`);
    dlg.querySelector("#upSend").addEventListener("click", async e => {
      e.currentTarget.disabled = true;
      const r = await sendSalts(matches, (n, t) => say(`Sending... ${n} of ${t}`));
      if (r.error) return say(`${r.sent ? `Sent ${plural(r.sent, "match", "matches")}. ` : ""}${esc(r.error)}`, "err");
      say(`Sent ${plural(r.sent, "match", "matches")}${r.rejected ? `. deadlock-api turned down ${r.rejected}, which usually means its keys are too old` : ""}. They usually show up within a few minutes. Press Refresh on your profile after that.`, "ok");
    });
  });
  if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  dlg.addEventListener("close", () => { if (opener && opener.isConnected) opener.focus(); }, { once: true });
  hideTip();
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
  const el = e.target.closest(".tag, .verdict, .acc, .chipMvp, .it, .fs, .pat h3");
  if (el && el.dataset.tip && matchMedia("(hover: none)").matches) {
    e.preventDefault();
    if (tipFor === el) hideTip(); else showTip(el.dataset.tip, el);
  }
});
window.addEventListener("scroll", hideTip, { passive: true });

route();
