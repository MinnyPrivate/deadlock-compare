import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { createWorker } from "../companion/worker.mjs";
import { renderShareCard } from "../share/render.mjs";

const { playerPath, parsePath } = globalThis.PostmortemShare;
const matchId = "137018749";
const accountId = "26864216";
const path = `/m/${matchId}/p/${accountId}`;
const image = path + "/image.png";
const origin = "https://postmortem.example";
const matchApi = "https://api.deadlock-api.com/v1/matches/" + matchId + "/metadata?disable_steam=true";
const steamApi = "https://api.deadlock-api.com/v1/players/steam?account_ids=";
const fixture = await readFile(new URL("./137018749.json", import.meta.url), "utf8");
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");

function harness(options = {}) {
  const entries = new Map(), calls = [], keys = [], cards = [];
  const cache = {
    match: async key => entries.get(key.url)?.clone(),
    put: async (key, response) => entries.set(key.url, response),
  };
  let allowed = true;
  const env = {
    ASSETS: { fetch: async url => {
      if (url.pathname === "/") return new Response(index);
      return new Response("static asset");
    } },
    SHARE_LIMIT: { limit: async ({ key }) => {
      keys.push(key);
      return { success: allowed };
    } },
  };
  const worker = createWorker({ share: {
    cache,
    async fetchUpstream(url, init) {
      calls.push([url, init]);
      if (url === matchApi) return options.match?.() ?? new Response(fixture);
      const id = url.slice(steamApi.length);
      return options.profile?.() ?? Response.json([{ account_id: Number(id), personaname: "Test Name" }]);
    },
    render(card) {
      cards.push(card);
      return (options.render || renderShareCard)(card);
    },
  } });
  return {
    entries, calls, cards, keys, deny: () => { allowed = false; },
    get: (requestPath, init = {}) => worker.fetch(new Request(origin + requestPath, {
      headers: { "CF-Connecting-IP": "192.0.2.123" }, ...init,
    }), env),
  };
}

test("share paths round-trip with canonical IDs and distinguish the PNG", () => {
  const page = { matchId, accountId, path, image: false };
  assert.equal(playerPath(Number(matchId), Number(accountId)), path);
  assert.deepEqual(parsePath(path), page);
  assert.deepEqual(parsePath(path + "/"), page);
  assert.deepEqual(parsePath(image), { ...page, image: true });
  assert.equal(playerPath(Number.MAX_SAFE_INTEGER, 0xffffffff), "/m/9007199254740991/p/4294967295");
  for (const invalid of [
    "/m/0/p/1", "/m/01/p/1", "/m/1/p/01", "/m/-1/p/1", "/m/1/p/0",
    "/m/9007199254740992/p/1", "/m/1/p/4294967296", "/m/1/p/%31",
    "/m/1/p/1e2", "/m/1/p/1/extra", "/m/1/p/1/image.png/", "/m/1/p/1//",
  ]) assert.equal(parsePath(invalid), null, invalid);
});

test("share HTML serves the app and gives crawlers canonical, absolute image metadata", async () => {
  const h = harness();
  const response = await h.get(path + "/?embed=1&me=123&pick=0");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes(`<meta property="og:url" content="${origin}${path}">`));
  assert.ok(html.includes(`<meta property="og:image" content="${origin}${image}">`));
  assert.ok(html.includes(`<meta name="twitter:image" content="${origin}${image}">`));
  assert.ok(html.indexOf('property="og:image"') < html.indexOf("</head>"));
  assert.ok(html.includes('<script src="/app.js"></script>'));
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.keys, []);
  assert.equal(await (await h.get("/style.css")).text(), "static asset");
});

test("a cold HEAD fills the PNG cache, GET hits skip upstream, rendering, and rate limiting", async () => {
  const h = harness();
  const head = await h.get(image, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
  assert.equal(head.headers.get("Content-Type"), "image/png");
  assert.match(head.headers.get("Cache-Control"), /s-maxage=86400/);
  h.deny();
  const hit = await h.get(image + "?v=untrusted&noise=unused", { headers: { Cookie: "viewer=ignored" } });
  assert.equal(hit.status, 200);
  const png = Buffer.from(await hit.arrayBuffer());
  assert.equal(png.length, Number(head.headers.get("Content-Length")));
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  const data = inflateSync(png.subarray(41, 41 + png.readUInt32BE(33)));
  assert.equal(data.length, 151 * 630);
  for (const line of [76, 196, 316, 436]) assert.ok(data.subarray(line * 151, (line + 7) * 151).some(Boolean));
  assert.deepEqual(h.keys, ["192.0.2.123"]);
  assert.deepEqual(h.calls.map(([url]) => url), [matchApi, steamApi + accountId]);
  for (const [, init] of h.calls) {
    assert.equal(init.headers, undefined);
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
  }
  assert.deepEqual(h.cards, [{ name: "Test Name", fallbackName: "Player " + accountId, hero: "Silver", kda: "11 / 8 / 13", result: "Victory" }]);
  assert.equal(h.entries.size, 1);
  assert.equal((await h.get(image.replace(accountId, "81646827"))).status, 429);
  assert.equal(h.calls.length, 2);
});

test("bad URLs, unsupported methods, and a missing rate-limit identity stop before upstream", async () => {
  const h = harness();
  assert.equal((await h.get("/m/01/p/2/image.png")).status, 404);
  const method = await h.get(image, { method: "POST", body: "ignored" });
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("Allow"), "GET, HEAD");
  assert.equal((await h.get(image, { headers: {} })).status, 503);
  h.deny();
  const limited = await h.get(image);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "60");
  assert.equal(limited.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(h.calls, []);
  assert.equal(h.entries.size, 0);
});

test("an absent account, a missing match, or an oversized match never fills the cache", async () => {
  const absent = harness();
  assert.equal((await absent.get(`/m/${matchId}/p/1/image.png`)).status, 404);
  assert.equal(absent.calls.length, 1);
  const missing = harness({ match: () => new Response(null, { status: 404 }) });
  const oversize = harness({ match: () => new Response(new Uint8Array(8 * 1024 * 1024 + 1)) });
  for (const [h, status] of [[missing, 404], [oversize, 413]]) {
    const first = await h.get(image);
    assert.equal(first.status, status);
    assert.equal(first.headers.get("Cache-Control"), "no-store");
    assert.equal((await h.get(image)).status, status);
    assert.equal(h.calls.length, 2);
    assert.equal(h.entries.size, 0);
    assert.equal(h.cards.length, 0);
  }
  assert.equal(absent.entries.size, 0);
});

test("oversized Steam data falls back briefly, and oversized PNGs are rejected uncached", async () => {
  const fallback = harness({ profile: () => new Response(new Uint8Array(16 * 1024 + 1)) });
  const degraded = await fallback.get(image);
  assert.equal(degraded.status, 200);
  assert.equal(degraded.headers.get("Cache-Control"), "public, max-age=300");
  assert.equal(fallback.cards[0].name, "Player " + accountId);
  const oversize = harness({ render: () => new Uint8Array(384 * 1024 + 1) });
  assert.equal((await oversize.get(image)).status, 413);
  assert.equal(oversize.entries.size, 0);
});
