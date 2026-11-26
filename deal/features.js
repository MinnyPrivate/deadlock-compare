"use strict";
// Reads one deadlock-api match (the /v1/matches/{id}/metadata shape) and pulls out what the card dealer needs:
// each player's stats, the kill and death timeline, and the few things only paths and the damage matrix know.
// Pure code, no DOM. Browser: window.PM_DEAL_FEATURES. Node: module.exports.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PM_DEAL_FEATURES = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const last = a => (Array.isArray(a) && a.length ? a[a.length - 1] : undefined);
  const num = v => (typeof v === "number" && isFinite(v) ? v : 0);

  function finalStats(p) { return last(p.stats) || {}; }

  function statAt(p, t, key) {
    const s = (p.stats || []).find(x => x.time_stamp_s === t);
    return s ? num(s[key]) : null;
  }

  function customStat(fin, id) {
    const c = (fin.custom_user_stats || []).find(x => x.id === id);
    return c ? num(c.value) : 0;
  }

  // Packed badge -> tier steps (tier * 6 + sub - 1). Null when there is no rank.
  function badgeSteps(b) {
    if (!b) return null;
    const tier = Math.floor(b / 10), sub = b % 10;
    if (tier < 1 || sub < 1) return null;
    return tier * 6 + sub - 1;
  }
  function stepsToBadge(steps) { const r = Math.round(steps); return Math.floor(r / 6) * 10 + (r % 6) + 1; }

  // Build the match context once; players are looked up by slot.
  function buildMatch(input) {
    const mi = input && input.match_info ? input.match_info : input;
    const players = (mi.players || []).map(p => {
      const fin = finalStats(p);
      return {
        raw: p, slot: p.player_slot, team: p.team, hero_id: p.hero_id, account_id: p.account_id,
        won: p.team === mi.winning_team,
        left: num(p.abandon_match_time_s) > 0,
        badge: num(p.player_rank_data && p.player_rank_data.initial_display_rank) || 0,
        fin,
        deaths_list: (p.death_details || []).map(d => ({ t: num(d.game_time_s), killer: d.killer_player_slot, dur: num(d.death_duration_s), ttk: d.time_to_kill_s, pos: d.death_pos }))
          .sort((a, b) => a.t - b.t),
      };
    });
    const bySlot = new Map(players.map(p => [p.slot, p]));
    const kills = []; // every kill: when, who, whom
    for (const v of players) for (const d of v.deaths_list) if (bySlot.has(d.killer)) kills.push({ t: d.t, killer: d.killer, victim: v.slot });
    kills.sort((a, b) => a.t - b.t || a.victim - b.victim);
    const allDeaths = [];
    for (const v of players) for (const d of v.deaths_list) allDeaths.push({ t: d.t, victim: v.slot });
    allDeaths.sort((a, b) => a.t - b.t || a.victim - b.victim);
    const pathBySlot = new Map(((mi.match_paths && mi.match_paths.paths) || []).map(x => [x.player_slot, x]));
    return { mi, players, bySlot, kills, allDeaths, pathBySlot, duration: num(mi.duration_s), matchId: mi.match_id, _cache: new Map() };
  }

  // Valve's packed rank for this player: their own, else the lobby average, else none.
  function rankInfo(m, p) {
    if (p.badge) return { badge: p.badge, source: "own" };
    const ps = m.players.map(x => x.badge).filter(Boolean);
    const t0 = num(m.mi.average_badge_team0), t1 = num(m.mi.average_badge_team1);
    if (t0 && t1) return { badge: stepsToBadge((badgeSteps(t0) + badgeSteps(t1)) / 2), source: "lobby" };
    if (ps.length >= 4) return { badge: stepsToBadge(ps.reduce((a, b) => a + badgeSteps(b), 0) / ps.length), source: "lobby" };
    return { badge: 0, source: "none" };
  }
  function lobbyBadge(m) {
    const t0 = num(m.mi.average_badge_team0), t1 = num(m.mi.average_badge_team1);
    if (t0 && t1) return stepsToBadge((badgeSteps(t0) + badgeSteps(t1)) / 2);
    const ps = m.players.map(x => x.badge).filter(Boolean);
    return ps.length >= 4 ? stepsToBadge(ps.reduce((a, b) => a + badgeSteps(b), 0) / ps.length) : 0;
  }

  // The player's headline stat values, in the units the norm tables use.
  function statValues(m, p) {
    const f = p.fin;
    const shots = num(f.shots_hit) + num(f.shots_missed);
    return {
      hero_damage: num(f.player_damage),
      kills: num(p.raw.kills),
      assists: num(p.raw.assists),
      deaths: num(p.raw.deaths),
      healing: num(f.teammate_healing) + num(f.teammate_barriering),
      mitigated: num(f.damage_mitigated),
      souls: num(p.raw.net_worth),
      souls9: m.duration >= 540 ? statAt(p.raw, 540, "net_worth") : null,
      souls_lost: num(f.gold_death_loss),
      obj_damage: num(f.boss_damage),
      accuracy: shots >= 50 ? num(f.shots_hit) / shots : null,
      last_hits: num(p.raw.last_hits),
      output: num(f.player_damage) + num(f.teammate_healing),
      takedowns: num(p.raw.kills) + num(p.raw.assists),
      damage_taken: num(f.player_damage_taken),
    };
  }

  // ---- timeline helpers ----
  function myKills(m, slot) { return m.kills.filter(k => k.killer === slot); }

  function pathDistance(m, slot) {
    const key = "dist" + slot;
    if (m._cache.has(key)) return m._cache.get(key);
    const path = m.pathBySlot.get(slot);
    let out = null;
    if (path && path.x_pos && path.x_pos.length > 1) {
      const res = (m.mi.match_paths.x_resolution || 16383);
      const sx = (path.x_max - path.x_min) / res, sy = (path.y_max - path.y_min) / (m.mi.match_paths.y_resolution || res);
      let d = 0;
      for (let i = 1; i < path.x_pos.length; i++) d += Math.hypot((path.x_pos[i] - path.x_pos[i - 1]) * sx, (path.y_pos[i] - path.y_pos[i - 1]) * sy);
      out = d;
    }
    m._cache.set(key, out);
    return out;
  }

  // Share of the seconds this player was alive that they spent in combat with enemy heroes (combat type 1 on the 1 Hz path).
  // Null when the match has no paths. Used to keep a hider from earning a damage-taken card.
  function fightShare(m, p) {
    const path = m.pathBySlot.get(p.slot);
    if (!path || !path.combat_type) return null;
    let alive = 0, fight = 0;
    for (let t = 0; t < path.combat_type.length; t++) {
      if (p.deaths_list.some(d => t >= d.t && t < d.t + Math.max(d.dur, 1))) continue;
      alive++;
      if (path.combat_type[t] === 1) fight++;
    }
    return alive ? fight / alive : null;
  }
  // The lobby's median fight share (all players in the match that have a path).
  function lobbyFightMedian(m) {
    if (m._cache.has("fightMedian")) return m._cache.get("fightMedian");
    const xs = m.players.map(x => fightShare(m, x)).filter(x => x != null).sort((a, b) => a - b);
    const med = xs.length ? xs[Math.floor(xs.length / 2)] : null;
    m._cache.set("fightMedian", med);
    return med;
  }

  // Close calls from the 1 Hz health line: health fell to 10% or less while alive, then rose back to 50% or more within
  // 30 seconds with no death in between. Episodes that end in a death are not escapes.
  function escapes(m, p) {
    const path = m.pathBySlot.get(p.slot);
    if (!path || !path.health) return null;
    const h = path.health;
    const deadAt = t => p.deaths_list.some(d => t >= d.t && t < d.t + Math.max(d.dur, 1));
    let count = 0, i = 1;
    while (i < h.length) {
      if (h[i] > 0 && h[i] <= 10 && !deadAt(i)) {
        let ok = false, j = i + 1;
        for (; j < h.length && j <= i + 30; j++) {
          if (h[j] === 0 || deadAt(j)) break;
          if (h[j] >= 50) { ok = true; break; }
        }
        if (ok) { count++; i = j + 20; continue; }
        i = j + 1; continue;
      }
      i++;
    }
    return count;
  }

  // Longest run of kills each within `gap` seconds of the one before.
  function bestChain(times, gap) {
    let best = times.length ? 1 : 0, run = 1;
    for (let i = 1; i < times.length; i++) { run = times[i] - times[i - 1] <= gap ? run + 1 : 1; if (run > best) best = run; }
    return best;
  }

  // Damage to each enemy from the damage matrix (final cumulative number from every damage source).
  function damageByTarget(m, slot) {
    const key = "dmg" + slot;
    if (m._cache.has(key)) return m._cache.get(key);
    const dm = m.mi.damage_matrix;
    let out = null;
    if (dm && dm.damage_dealers && dm.source_details) {
      const types = dm.source_details.stat_type || [];
      const dealer = dm.damage_dealers.find(d => d.dealer_player_slot === slot);
      if (dealer) {
        out = {};
        for (const src of dealer.damage_sources || []) {
          if (types[src.source_details_index] !== 0) continue;
          for (const t of src.damage_to_players || []) out[t.target_player_slot] = (out[t.target_player_slot] || 0) + num(last(t.damage));
        }
      }
    }
    m._cache.set(key, out);
    return out;
  }

  // The moments where `slot` was alive and every teammate was dead at once.
  function lastStandWindows(m, p) {
    const mates = m.players.filter(x => x.team === p.team && x.slot !== p.slot);
    if (mates.length < 3) return [];
    const ev = [];
    for (const x of mates) for (const d of x.deaths_list) { ev.push([d.t, 1]); ev.push([d.t + Math.max(d.dur, 1), -1]); }
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const mine = p.deaths_list.map(d => [d.t, d.t + Math.max(d.dur, 1)]);
    const alive = t => !mine.some(([a, b]) => t >= a && t < b);
    const wins = [];
    let dead = 0, start = null;
    for (const [t, s] of ev) {
      dead += s;
      if (dead >= mates.length && start === null) start = t;
      if (dead < mates.length && start !== null) { if (alive(start)) wins.push([start, t]); start = null; }
    }
    return wins;
  }

  return { buildMatch, fightShare, lobbyFightMedian, rankInfo, lobbyBadge, statValues, myKills, pathDistance, escapes, bestChain, damageByTarget, lastStandWindows,
    customStat, badgeSteps, stepsToBadge, last, num };
});
