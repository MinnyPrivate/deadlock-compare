import "../share-url.js";
import "../heroes.js";
import { readBounded, readJson, TooLarge } from "../companion/metadata.mjs";
import { renderShareCard, WIDTH, HEIGHT } from "./render.mjs";

const API = "https://api.deadlock-api.com/v1/";
const MAX_MATCH_BYTES = 8 * 1024 * 1024; // Same as the companion's official metadata lookup.
const MAX_PROFILE_BYTES = 16 * 1024;
const MAX_PNG_BYTES = 384 * 1024;
const MAX_HTML_BYTES = 128 * 1024;
const IMAGE_CACHE_VERSION = "1";
const escapeAttribute = value => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function error(status, message, headers = {}) {
  return new Response(message, { status, headers: {
    "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", ...headers,
  } });
}

const unavailable = () => error(503, "Share preview temporarily unavailable.", { "Retry-After": "60" });
const missing = () => error(404, "Match or player Summary unavailable.");

async function sharePage(env, canonical) {
  // The asset binding follows Cloudflare's HTML handling. The root serves index.html directly.
  const asset = await env.ASSETS.fetch(new URL("/", canonical));
  if (!asset.ok) return unavailable();
  const html = new TextDecoder().decode(await readBounded(asset.body, MAX_HTML_BYTES));
  const pageUrl = escapeAttribute(canonical.href);
  const imageUrl = pageUrl + "/image.png";
  const title = "Postmortem | Player Summary";
  const description = "See this player's Deadlock match summary.";
  const alt = "Player name, hero, kills, deaths, assists, and match result.";
  const tags = [
    `<link rel="canonical" href="${pageUrl}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${pageUrl}">`,
    `<meta property="og:image" content="${imageUrl}">`,
    '<meta property="og:image:type" content="image/png">',
    `<meta property="og:image:width" content="${WIDTH}">`,
    `<meta property="og:image:height" content="${HEIGHT}">`,
    `<meta property="og:image:alt" content="${alt}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${imageUrl}">`,
    `<meta name="twitter:image:alt" content="${alt}">`,
  ];
  return new Response(html.replace("</head>", () => tags.join("\n") + "\n</head>"), { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  } });
}

async function playerName(fetchUpstream, accountId) {
  try {
    const response = await fetchUpstream(API + "players/steam?account_ids=" + accountId,
      { signal: AbortSignal.timeout(2500), redirect: "error" });
    if (response.ok) {
      const profiles = await readJson(response.body, MAX_PROFILE_BYTES);
      const name = Array.isArray(profiles) && profiles
        .find(profile => String(profile?.account_id) === accountId)?.personaname;
      if (typeof name === "string" && name.trim()) return name.slice(0, 128);
    } else {
      await response.body?.cancel();
    }
  } catch (_) {
    // Steam profile data is optional. The fallback gets a shorter cache lifetime.
  }
  return null;
}

async function shareImage(request, env, canonical, { matchId, accountId }, cache, fetchUpstream, render) {
  const imageUrl = new URL(canonical.href + "/image.png");
  imageUrl.searchParams.set("v", IMAGE_CACHE_VERSION);
  const key = new Request(imageUrl);
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) return cached;

  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip || !env.SHARE_LIMIT) return unavailable();
  if (!(await env.SHARE_LIMIT.limit({ key: ip })).success) {
    return error(429, "Too many share preview requests.", { "Retry-After": "60" });
  }

  // Public, stored Valve metadata only. Never use the companion database or forward viewer headers.
  const response = await fetchUpstream(API + "matches/" + matchId + "/metadata?disable_steam=true",
    { signal: AbortSignal.timeout(6000), redirect: "error" });
  if (!response.ok) {
    await response.body?.cancel();
    return response.status === 404 || response.status === 410 ? missing() : unavailable();
  }
  const body = await readJson(response.body, MAX_MATCH_BYTES);
  const match = body?.match_info || body;
  if (String(match?.match_id) !== matchId || match.game_mode === 4 || match.not_scored ||
      ![0, 1].includes(match.winning_team) || !Array.isArray(match.players) ||
      !match.players.every(player => Array.isArray(player?.stats) && player.stats.length)) return missing();
  const player = match.players.find(entry => String(entry.account_id) === accountId);
  if (!player || ![0, 1].includes(player.team)) return missing();

  const name = await playerName(fetchUpstream, accountId);
  const kda = [player.kills, player.deaths, player.assists]
    .map(value => Number.isSafeInteger(value) && value >= 0 ? value : "-").join(" / ");
  const png = await render({
    name: name || "Player " + accountId,
    fallbackName: "Player " + accountId,
    hero: globalThis.HERO_NAMES[player.hero_id] || "Hero " + (Number(player.hero_id) || 0),
    kda,
    result: player.team === match.winning_team ? "Victory" : "Defeat",
  });
  if (png.byteLength > MAX_PNG_BYTES) throw new TooLarge();
  const result = new Response(png, { headers: {
    "Content-Type": "image/png", "Content-Length": String(png.byteLength),
    "Cache-Control": name ? "public, max-age=3600, s-maxage=86400" : "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  } });
  await cache?.put(key, result.clone()).catch(() => {});
  return result;
}

export async function handleShare(request, env, url, {
  cache = globalThis.caches?.default,
  fetchUpstream = (...args) => fetch(...args),
  render = renderShareCard,
} = {}) {
  const route = PostmortemShare.parsePath(url.pathname);
  const head = request.method === "HEAD";
  let response;
  try {
    if (!route) {
      response = missing();
    } else if (!head && request.method !== "GET") {
      response = error(405, "Method not allowed.", { Allow: "GET, HEAD" });
    } else {
      const canonical = new URL(route.path, url.origin);
      response = route.image
        ? await shareImage(request, env, canonical, route, cache, fetchUpstream, render)
        : await sharePage(env, canonical);
    }
  } catch (failure) {
    response = failure instanceof TooLarge ? error(413, "Share preview exceeded its size limit.") : unavailable();
  }
  if (!head) return response;
  // A cold HEAD stores the complete GET representation but returns headers only.
  void response.body?.cancel().catch(() => {});
  return new Response(null, { status: response.status, headers: response.headers });
}
