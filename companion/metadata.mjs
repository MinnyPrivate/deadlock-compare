import schema from "./schema.json" with { type: "json" };

export const MAX_GZIP = 384 * 1024;
export const MAX_JSON = 2 * 1024 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });

export class TooLarge extends Error {}

export async function readBounded(stream, cap) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  let total = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) throw new TooLarge();
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export async function readJson(stream, cap) {
  return JSON.parse(decoder.decode(await readBounded(stream, cap)));
}

export async function unpack(request) {
  const length = request.headers.get("Content-Length");
  if (length && Number(length) > MAX_GZIP) throw new TooLarge();
  const compressed = await readBounded(request.body, MAX_GZIP);
  const inflated = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  try {
    return await readJson(inflated, MAX_JSON);
  } catch (error) {
    if (error instanceof TooLarge) throw error;
    throw new TypeError("Invalid gzip or JSON");
  }
}

export async function pack(value) {
  const stream = new Blob([JSON.stringify(value)]).stream();
  return readBounded(stream.pipeThrough(new CompressionStream("gzip")), MAX_GZIP);
}

function project(value, spec) {
  if (spec === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new TypeError();
    return value;
  }
  if (Array.isArray(spec)) {
    if (!Array.isArray(value) || value.length > spec[0]) throw new TypeError();
    return value.map(item => project(item, spec[1]));
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError();
  return Object.fromEntries(Object.entries(spec).filter(([key]) => value[key] != null)
    .map(([key, child]) => [key, project(value[key], child)]));
}

function integer(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function countFor(mode) {
  if (mode === 1) return 12;
  if (mode === 4) return 8;
  return 0;
}

export function matchIdentity(info, id) {
  if (!info || !integer(info.match_id, 1, Number.MAX_SAFE_INTEGER) || String(info.match_id) !== id) return false;
  const count = countFor(info.game_mode);
  if (!count || !Array.isArray(info.players) || info.players.length !== count) return false;
  if (!integer(info.duration_s, 1, 21_600) || !integer(info.match_mode, 0, 32) ||
      !integer(info.winning_team, 0, 1)) return false;
  const slots = new Set();
  let teamZero = 0;
  for (const player of info.players) {
    if (!player || !integer(player.player_slot, 0, 31) || slots.has(player.player_slot) ||
        !integer(player.team, 0, 1) || !integer(player.hero_id, 1, 65_535) ||
        ![player.kills, player.deaths, player.assists, player.net_worth].every(value =>
          value == null || integer(value, 0, 2_000_000))) return false;
    slots.add(player.player_slot);
    if (player.team === 0) teamZero++;
  }
  return teamZero === count / 2;
}

export function normalizeUpload(body, id, now) {
  if (body?.version !== 1) throw new TypeError();
  const info = project(body.match_info, schema);
  if (!matchIdentity(info, id) || !integer(info.start_time, 1, 10_000_000_000) ||
      !info.players.some(player => player.player_slot === body.viewer_slot)) throw new TypeError();
  const end = (info.start_time + info.duration_s) * 1000;
  if (end > now + 5 * 60_000 || end + 6 * 3_600_000 <= now) throw new TypeError();
  const expiresAt = Math.min(end, now) + 6 * 3_600_000;
  return { state: "pending", viewer_slot: body.viewer_slot, expires_at: expiresAt, match_info: info };
}

export function core(info) {
  const roster = [...info.players].sort((a, b) => a.player_slot - b.player_slot).map(p =>
    [p.player_slot, p.team, p.hero_id, p.kills ?? 0, p.deaths ?? 0, p.assists ?? 0, p.net_worth ?? 0]);
  return [info.match_id, info.game_mode, info.match_mode, info.duration_s, info.winning_team,
    info.match_outcome ?? 0, roster];
}
