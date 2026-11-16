// Postmortem's Cloudflare Worker. Static files (the page) are served straight from the assets; this script only sees requests
// that match no file, which is the early-data relay for the Postmortem companion app:
//
//   GET /api/early/status       {"enabled": true|false}. The app's kill switch: anything but true and it reads nothing.
//   PUT /api/early/<match id>   The app uploads a finished match it read from the game, about 9 s after the match ended.
//                               Body: gzip of the same JSON deadlock-api's /v1/matches/<id>/metadata returns (minus match_paths).
//                               Header X-Postmortem-Key must equal the EARLY_UPLOAD_KEY secret.
//   GET /api/early/<match id>   The page asks for it while deadlock-api doesn't have the match yet.
//
// Each match is kept in its own small Durable Object and deleted 15 minutes after upload; by then Valve's official file has
// replaced it on the page. While the app is private (phase 2), the upload key is the gate: nobody without it can store anything.
// The page treats relay data as outside data and checks it before drawing (match id, 12 players).
// Off switch: set the EARLY_ENABLED variable to "false" (wrangler.jsonc or the Cloudflare dashboard). The relay then stores
// and serves nothing, and every app pauses at its next match.

const KEEP_MS = 15 * 60 * 1000;
const MAX_UPLOAD = 1024 * 1024; // gzip bytes. A full match is about 0.2 MB gzipped.
const ID_RE = /^\d{1,12}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/early/")) {
      try {
        return await early(request, env, url.pathname.slice("/api/early/".length));
      } catch (e) {
        return text("relay error", 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};

const enabled = env => env.EARLY_ENABLED !== "false" && !!env.EARLY_UPLOAD_KEY;

function text(msg, status, extra) {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...extra } });
}

async function early(request, env, rest) {
  if (rest === "status") {
    if (request.method !== "GET") return text("method not allowed", 405, { Allow: "GET" });
    return new Response(JSON.stringify({ enabled: enabled(env) }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  if (!ID_RE.test(rest)) return text("not found", 404);
  if (!enabled(env)) return text("paused", request.method === "PUT" ? 503 : 404);
  const stub = env.EARLY.get(env.EARLY.idFromName(rest));

  if (request.method === "GET") return stub.fetch("https://early/get");

  if (request.method !== "PUT") return text("method not allowed", 405, { Allow: "GET, PUT" });
  if (!(await keyOk(request.headers.get("X-Postmortem-Key"), env.EARLY_UPLOAD_KEY))) return text("bad key", 401);
  const len = Number(request.headers.get("Content-Length"));
  if (len > MAX_UPLOAD) return text("too big", 413);
  const body = await readCapped(request, MAX_UPLOAD);
  if (!body) return text("too big", 413);
  const b = new Uint8Array(body);
  if (b.length < 18 || b[0] !== 0x1f || b[1] !== 0x8b) return text("body must be gzip", 400);
  return stub.fetch("https://early/put", { method: "PUT", body });
}

// Constant-time key check, so response timing can't leak the key a character at a time.
async function keyOk(given, want) {
  if (!given || !want) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, want].map(s => crypto.subtle.digest("SHA-256", enc.encode(s))));
  return crypto.subtle.timingSafeEqual(a, b);
}

// Read the body, giving up (null) as soon as it passes `cap` bytes, whatever Content-Length claimed.
async function readCapped(request, cap) {
  if (!request.body) return null;
  const reader = request.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > cap) { reader.cancel(); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}

// One per match id. Stores the gzipped JSON once (the first upload wins) and deletes it after KEEP_MS.
export class EarlyMatch {
  constructor(ctx) { this.ctx = ctx; }

  async fetch(request) {
    const s = this.ctx.storage;
    const at = await s.get("at");
    const live = at && Date.now() - at < KEEP_MS;
    if (request.method === "PUT") {
      if (live) return text("already stored", 200);
      await s.put({ gz: await request.arrayBuffer(), at: Date.now() });
      await s.setAlarm(Date.now() + KEEP_MS);
      return text("stored", 201);
    }
    const gz = live && (await s.get("gz"));
    if (!gz) return text("not found", 404);
    // Already gzipped: pass it through as is, and the browser unpacks it.
    return new Response(gz, {
      encodeBody: "manual",
      headers: { "Content-Type": "application/json", "Content-Encoding": "gzip", "Cache-Control": "no-store", "X-Postmortem-Early": "1" },
    });
  }

  async alarm() { await this.ctx.storage.deleteAll(); }
}
