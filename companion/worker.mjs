import { core, matchIdentity, normalizeUpload, pack, readJson, TooLarge, unpack } from "./metadata.mjs";

const prefix = "/api/v1/companion";
const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const tokenPattern = /^[a-f0-9]{64}$/;
const codePattern = /^[0-9A-HJKMNP-TV-Z]{6}$/;
const cookieName = "pm_companion_view";
const minute = 60_000;
const codeTime = 10 * minute;
const codeFailureLimit = 120;
const codeBucket = now => Math.floor(now / codeTime) * codeTime;
const text = new TextEncoder();

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function digest(value) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", text.encode(value))));
}

async function pairingHash(secret, code) {
  const key = await crypto.subtle.importKey("raw", text.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, text.encode(code))));
}

function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", ...extra },
  });
}

function missing() { return json({ state: "missing" }, 404); }
function paused() { return json({ state: "paused" }, 503, { "Retry-After": "60" }); }
function limited(seconds = 60) {
  return json({ state: "limited" }, 429, { "Retry-After": String(seconds) });
}

function installation(request) {
  const token = request.headers.get("Authorization")?.slice(7);
  return request.headers.get("Authorization")?.startsWith("Bearer ") && tokenPattern.test(token) ? token : null;
}

function viewerCookie(token, age = null) {
  return cookieName + "=" + token + "; Path=" + prefix + "; Secure; HttpOnly; SameSite=Strict" +
    (age === null ? "" : "; Max-Age=" + age);
}

function viewerToken(request) {
  const cookies = (request.headers.get("Cookie") || "").split(";").map(cookie => cookie.trim());
  const values = cookies.filter(cookie => cookie.startsWith(cookieName + "="));
  const token = values.length === 1 ? values[0].slice(cookieName.length + 1) : "";
  return tokenPattern.test(token) ? token : null;
}

async function findViewer(db, request, now) {
  const token = viewerToken(request);
  if (!token) return null;
  return db.prepare("SELECT destination FROM companion_sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(await digest(token), now).first();
}

async function issue(env, request, now) {
  const token = installation(request);
  if (!token) return missing();
  const body = await readJson(request.body, 1024);
  if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).length) return missing();
  const destination = await digest(token);
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => alphabet[byte & 31]).join("");
    const hash = await pairingHash(env.PAIRING_SECRET, code);
    const row = await env.DB.prepare("INSERT INTO companion_pairing (destination, code_hash, expires_at) " +
      "SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM companion_pairing WHERE code_hash = ?) " +
      "AND NOT EXISTS (SELECT 1 FROM companion_pair_code_failures WHERE bucket = ? AND code_hash = ? AND failures >= ?) " +
      "ON CONFLICT(destination) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at RETURNING destination")
      .bind(destination, hash, now + codeTime, hash, codeBucket(now), hash, codeFailureLimit).first();
    if (row) return json({ code, expires_in: 600 }, 201);
  }
  return paused();
}

async function redeem(env, request, now) {
  const body = await readJson(request.body, 1024);
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!codePattern.test(code)) return missing();
  const hash = await pairingHash(env.PAIRING_SECRET, code);
  const bucket = codeBucket(now);
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await digest(token);
  const age = body.remember === true ? 7 * 86_400 : 86_400;
  // Use the new session as the success marker within the transaction, including for concurrent redemptions.
  const [session, , failure] = await env.DB.batch([
    env.DB.prepare("INSERT INTO companion_sessions (token_hash, destination, expires_at) " +
      "SELECT ?, destination, ? FROM companion_pairing WHERE code_hash = ? AND expires_at > ? " +
      "AND NOT EXISTS (SELECT 1 FROM companion_pair_code_failures WHERE bucket = ? AND code_hash = ? AND failures >= ?)")
      .bind(tokenHash, now + age * 1000, hash, now, bucket, hash, codeFailureLimit),
    env.DB.prepare("DELETE FROM companion_pairing WHERE code_hash = ? " +
      "AND EXISTS (SELECT 1 FROM companion_sessions WHERE token_hash = ?)").bind(hash, tokenHash),
    env.DB.prepare("INSERT INTO companion_pair_code_failures (bucket, code_hash, failures) " +
      "SELECT ?, ?, 1 WHERE NOT EXISTS (SELECT 1 FROM companion_sessions WHERE token_hash = ?) " +
      "ON CONFLICT(bucket, code_hash) DO UPDATE SET failures = failures + 1 WHERE failures < ?")
      .bind(bucket, hash, tokenHash, codeFailureLimit),
  ]);
  if (session.meta.changes !== 1) {
    return failure.meta.changes === 1 ? missing() : limited(Math.ceil((bucket + codeTime - now) / 1000));
  }
  return json({ paired: true }, 200, { "Set-Cookie": viewerCookie(token, body.remember === true ? age : null) });
}

async function upload(env, request, now, id) {
  const token = installation(request);
  if (!token) return missing();
  if (request.headers.get("Content-Type") !== "application/json" || request.headers.get("Content-Encoding") !== "gzip") {
    return json({ state: "unsupported_format" }, 415);
  }
  const data = normalizeUpload(await unpack(request), id, now);
  const destination = await digest(token);
  const fingerprint = await digest(JSON.stringify([data.viewer_slot, data.match_info]));
  const summary = JSON.stringify(core(data.match_info));
  const bytes = await pack(data);
  const database = env.DB;
  const [, inserted, existing, check] = await database.batch([
    database.prepare("INSERT INTO companion_checks (match_id, next_check, expires_at) VALUES (?, ?, ?) " +
      "ON CONFLICT(match_id) DO UPDATE SET expires_at = MAX(expires_at, excluded.expires_at) WHERE official_core IS NULL")
      .bind(id, now, data.expires_at),
    database.prepare("INSERT INTO companion_previews (destination, match_id, digest, core, expires_at, payload) " +
      "SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM companion_checks WHERE match_id = ? AND official_core IS NULL AND expires_at > ?) " +
      "ON CONFLICT(destination, match_id) DO NOTHING")
      .bind(destination, id, fingerprint, summary, data.expires_at, bytes.buffer, id, now),
    database.prepare("SELECT digest, expires_at, state FROM companion_previews WHERE destination = ? AND match_id = ?")
      .bind(destination, id),
    database.prepare("SELECT official_core FROM companion_checks WHERE match_id = ? AND expires_at > ?").bind(id, now),
  ]);
  const preview = existing.results[0];
  if (preview?.digest && preview.digest !== fingerprint) return json({ state: "conflict" }, 409);
  if (preview && preview.expires_at > now) {
    return json({ state: preview.state, expires_at: preview.expires_at }, inserted.meta.changes === 1 ? 202 : 200);
  }
  if (check.results[0]?.official_core) return json({ state: "official" });
  return missing();
}

async function preview(env, request, now, id, url) {
  const viewer = await findViewer(env.DB, request, now);
  if (!viewer) return missing();
  const fields = url.searchParams.get("status") === "1" ? "state, expires_at" : "state, expires_at, payload";
  const row = await env.DB.prepare("SELECT " + fields + " FROM companion_previews WHERE destination = ? AND match_id = ? AND expires_at > ?")
    .bind(viewer.destination, id, now).first();
  if (!row) return missing();
  if (!row.payload) return json({ state: row.state, expires_at: row.expires_at });
  return new Response(new Uint8Array(row.payload), {
    encodeBody: "manual",
    headers: { "Content-Type": "application/json", "Content-Encoding": "gzip",
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function cleanup(db, now) {
  await db.batch([
    db.prepare("DELETE FROM companion_previews WHERE rowid IN (SELECT rowid FROM companion_previews WHERE expires_at <= ? LIMIT 100)").bind(now),
    db.prepare("DELETE FROM companion_checks WHERE rowid IN (SELECT rowid FROM companion_checks WHERE expires_at <= ? LIMIT 100)").bind(now),
    db.prepare("DELETE FROM companion_pairing WHERE rowid IN (SELECT rowid FROM companion_pairing WHERE expires_at <= ? LIMIT 100)").bind(now),
    db.prepare("DELETE FROM companion_sessions WHERE rowid IN (SELECT rowid FROM companion_sessions WHERE expires_at <= ? LIMIT 100)").bind(now),
    db.prepare("DELETE FROM companion_pair_budget WHERE bucket < ?").bind(now - 2 * codeTime),
    db.prepare("DELETE FROM companion_pair_code_failures WHERE rowid IN (SELECT rowid FROM companion_pair_code_failures " +
      "WHERE bucket < ? LIMIT 100)").bind(now - 2 * codeTime),
  ]);
}

function retryMs(value, now) {
  if (!value) return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds * 1000 : Math.max(0, Date.parse(value) - now) || 0;
}

async function verify(db, now, fetchOfficial) {
  const job = await db.prepare("UPDATE companion_checks SET next_check = ? WHERE match_id = " +
    "(SELECT match_id FROM companion_checks WHERE official_core IS NULL AND next_check <= ? AND expires_at > ? " +
    "ORDER BY next_check LIMIT 1) RETURNING match_id").bind(now + 5 * minute, now, now).first();
  if (!job) return;
  const url = "https://api.deadlock-api.com/v1/matches/" + job.match_id + "/metadata?disable_steam=true";
  try {
    const response = await fetchOfficial(url, { signal: AbortSignal.timeout(6000), redirect: "error" });
    if (response.status === 429 || response.status >= 500) {
      let delay = retryMs(response.headers.get("Retry-After"), now);
      if (response.status === 429 && !delay) {
        const body = await readJson(response.body, 4096);
        delay = retryMs(body?.next_request_in, now);
      }
      if (delay > 5 * minute) {
        await db.prepare("UPDATE companion_checks SET next_check = ? WHERE match_id = ? AND official_core IS NULL")
          .bind(now + Math.min(delay, 6 * 60 * minute), job.match_id).run();
      }
      return;
    }
    if (response.status !== 200) return;
    const responseBody = await readJson(response.body, 8 * 1024 * 1024);
    const info = responseBody.match_info || responseBody;
    if (!matchIdentity(info, job.match_id)) return;
    const summary = JSON.stringify(core(info));
    await db.batch([
      db.prepare("UPDATE companion_checks SET official_core = ? WHERE match_id = ? AND official_core IS NULL")
        .bind(summary, job.match_id),
      db.prepare("UPDATE companion_previews SET payload = NULL, state = CASE WHEN core = ? THEN 'official' ELSE 'mismatch' END " +
        "WHERE match_id = ? AND state = 'pending'").bind(summary, job.match_id),
    ]);
  } catch (error) {
    // Invalid or unavailable upstream responses leave the job on its existing retry schedule.
    if (error?.name === "TypeError" || error?.name === "TimeoutError" || error instanceof SyntaxError ||
        error instanceof TooLarge) return;
    throw error;
  }
}

async function handleApi(request, env, now) {
  const url = new URL(request.url);
  const route = url.pathname.slice(prefix.length);
  const id = /^\/matches\/([1-9]\d{0,15})$/.exec(route)?.[1];
  if (env.PILOT_ENABLED !== "true") return paused();
  const method = request.method;
  const isPairRoute = route === "/pairing" || route === "/pairing/redeem";
  const isViewerRoute = route === "/unlink" || route === "/session";
  if (!id && !isPairRoute && !isViewerRoute) return missing();
  const limiter = isPairRoute ? env.PAIR_LIMIT : id && method === "POST" ? env.UPLOAD_LIMIT : env.READ_LIMIT;
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip || !limiter) return paused();
  if (!(await limiter.limit({ key: ip })).success) return limited();
  if (isPairRoute && !env.PAIRING_SECRET) return paused();
  if (isPairRoute && Number(request.headers.get("Content-Length")) > 1024) return json({ state: "too_large" }, 413);
  if ((route === "/pairing/redeem" || route === "/unlink") && request.headers.get("Origin") !== url.origin) return missing();

  if (id && method === "POST") return upload(env, request, now, id);
  if (id && method === "GET") return preview(env, request, now, id, url);
  if (route === "/pairing" && method === "POST") return issue(env, request, now);
  if (route === "/pairing/redeem" && method === "POST") return redeem(env, request, now);
  if (route === "/session" && method === "GET") return json({ paired: !!await findViewer(env.DB, request, now) });
  if (route === "/unlink" && method === "POST") {
    const token = viewerToken(request);
    if (token) await env.DB.prepare("DELETE FROM companion_sessions WHERE token_hash = ?").bind(await digest(token)).run();
    return json({ paired: false }, 200, { "Set-Cookie": viewerCookie("", 0) });
  }
  return json({ state: "method_not_allowed" }, 405);
}

export function createWorker({ now = Date.now, fetchOfficial = (...args) => fetch(...args) } = {}) {
  return {
    async fetch(request, env) {
      if (!new URL(request.url).pathname.startsWith(prefix + "/")) return env.ASSETS.fetch(request);
      try {
        return await handleApi(request, env, now());
      } catch (error) {
        if (error instanceof TooLarge) return json({ state: "too_large" }, 413);
        if (error instanceof TypeError || error instanceof SyntaxError) return json({ state: "invalid_match" }, 422);
        return paused();
      }
    },
    async scheduled(_event, env) {
      const time = now();
      await cleanup(env.DB, time);
      if (env.PILOT_ENABLED === "true") await verify(env.DB, time, fetchOfficial);
    },
  };
}

export default createWorker();
