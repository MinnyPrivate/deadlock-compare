"use strict";
// Pure scoring code for the Valve score, Early/Late grades and the lane score. No DOM, no page state.
// Ported from ref_score.py and ref_phase.py. Browser: window.PM_SCORE. Node: module.exports.
(function () {
  const NET_WORTH_ACC = 5;
  // Order of the 8 stats in the snapshot norms: kills, assists, deaths, net worth, objective damage,
  // hero damage + ally healing, takedowns, seconds dead.
  // Weights for the Early/Late bars and the lane score. Swap when the new Impact score is approved.
  const W_VALVE = [1, 1, -0.5, 0.2, 0.5, 1, 0, 0];
  const SNAP_TIMES = [180, 360, 540, 720, 900];

  const lengthTable = typeof module !== "undefined" && module.exports
    ? require("./tools/data/length_norms.json") : window.LENGTH_NORMS;
  const valveStats = ["kills", "assists", "deaths", "valve_souls", "objective_damage", "dmg_and_ally_heal"];
  const warnedVersionMismatches = new Set();

  function percentileVersionMismatch(distributions) {
    return Boolean(distributions && lengthTable && distributions.version !== lengthTable.version);
  }

  function warnPercentileMismatch(distributions) {
    if (!percentileVersionMismatch(distributions)) return false;
    const got = distributions.version == null ? "missing" : String(distributions.version);
    const key = `${got}!=${lengthTable.version}`;
    if (!warnedVersionMismatches.has(key)) {
      warnedVersionMismatches.add(key);
      console.warn(
        `Postmortem: hero_percentiles.json version (${got}) does not match heronorms.js (${lengthTable.version}); Highlights percentiles are hidden until both tables are rebuilt together.`
      );
    }
    return true;
  }

  function lengthLabel(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "games of this length";
    return `${Math.max(1, Math.round(seconds / 60))} min games`;
  }

  function minutesFor(stat, seconds) {
    if (stat.startsWith("late_")) return Math.max(0, seconds - 900) / 60;
    return seconds / 60;
  }

  // Shared hero expectation at a match duration (seconds).
  // Interpolates smoothly between duration bucket centers; when a hero bucket has fewer than minRows samples,
  // scales the hero's all-length mean, spread and percentile cutoffs by the pooled all-hero duration shape.
  // Optional distributions provide p1 through p99 cutoffs.
  function expected(heroId, key, durationS, distributions) {
    if (typeof key !== "string" || !Number.isFinite(durationS) || durationS <= 0 || !lengthTable) return null;
    const perMinute = key.endsWith("_per_min");
    let stat = perMinute ? key.slice(0, -8) : key;
    if (stat === "net_worth") stat = "souls";
    const knownHero = Object.hasOwn(lengthTable.heroes, heroId);
    const hero = knownHero ? String(heroId) : "all";
    const row = lengthTable.heroes[hero]?.[stat];
    if (!row) return null;

    // Fixed-timestamp stats (such as 15:00 snapshots) do not depend on final match duration.
    if (Object.hasOwn(row, "fixed")) {
      const fixedMinutes = stat.startsWith("at") ? Number(stat.slice(2, stat.indexOf("_"))) / 60 : durationS / 60;
      const scale = perMinute && fixedMinutes > 0 ? 1 / fixedMinutes : 1;
      return {
        mean: row.fixed[0] * scale,
        sd: row.fixed[1] * scale,
        knownHero,
        fallback: false,
        fixed: true,
        counts: [row.n],
        rateRows: row.n,
      };
    }

    const allRow = lengthTable.heroes.all?.[stat];
    if (!Object.hasOwn(row, "all") || !allRow || !Object.hasOwn(allRow, "all")) return null;
    const isLate = stat.startsWith("late_");
    if (isLate && durationS <= 900) return null;

    const versionMismatch = warnPercentileMismatch(distributions);
    const cuts = !versionMismatch && distributions ? distributions.heroes?.[hero]?.[stat] : null;
    const allCuts = !versionMismatch && distributions ? distributions.heroes?.all?.[stat] : null;
    const centers = lengthTable.centers, first = isLate ? 1 : 0, last = centers.length - 1;
    let hi = first;
    while (hi < last && centers[hi] < durationS) hi++;
    const lo = durationS < centers[hi] && hi > first ? hi - 1 : hi;
    const mix = lo === hi ? 0 : (durationS - centers[lo]) / (centers[hi] - centers[lo]);
    const period = minutesFor(stat, durationS);

    function fallbackCutoffs(i) {
      if (!cuts || !allCuts) return undefined;
      const poolBucket = allCuts.b?.[i], poolAll = allCuts.all, heroAll = cuts.all;
      if (!poolBucket || !poolAll || !heroAll) return undefined;
      const heroRel = allRow.all[0] > 0 ? row.all[0] / allRow.all[0] : 0;
      const out = new Array(poolBucket.length);
      for (let p = 0; p < poolBucket.length; p++) {
        let v = poolAll[p] > 0 ? heroAll[p] * (poolBucket[p] / poolAll[p]) : poolBucket[p] * heroRel;
        if (p > 0 && v < out[p - 1]) v = out[p - 1];
        out[p] = v;
      }
      return out;
    }

    function node(i) {
      const cell = row.b[i], at = minutesFor(stat, centers[i]);
      // Outside the bucket centers, scale smoothly along the endpoint bucket's rate; inside, blend bucket centers.
      const clock = lo === hi ? period : at;
      const scale = at > 0 ? clock / at : 1;
      let moments = cell;
      if (!moments) {
        const poolCell = allRow.b[i];
        if (!poolCell) return null;
        const meanScale = allRow.all[0] > 0 ? poolCell[0] / allRow.all[0] : 0;
        const sdScale = allRow.all[1] > 0 ? poolCell[1] / allRow.all[1] : 0;
        moments = [row.all[0] * meanScale, row.all[1] * sdScale];
      }
      return {
        moments,
        cuts: cuts ? (cuts.b[i] || fallbackCutoffs(i)) : undefined,
        scale: perMinute ? scale / period : scale,
      };
    }

    const left = node(lo), right = lo === hi ? left : node(hi);
    if (!left || !right) return null;
    const blend = (a, b) => a * left.scale * (1 - mix) + b * right.scale * mix;
    const hasCuts = Boolean(cuts && left.cuts && right.cuts);
    return {
      mean: blend(left.moments[0], right.moments[0]),
      sd: blend(left.moments[1], right.moments[1]),
      cutoffs: hasCuts ? left.cuts.map((v, i) => blend(v, right.cuts[i])) : undefined,
      knownHero,
      fallback: !row.b[lo] || !row.b[hi],
      counts: lo === hi ? [row.n[lo]] : [row.n[lo], row.n[hi]],
      rateRows: row.n.reduce((sum, n) => sum + n, 0),
      ...(versionMismatch ? { versionMismatch: true } : {}),
    };
  }

  function gradedHero(p, table) {
    const own = String(p.hero_id);
    if (!Object.hasOwn(table.heroes, own)) return own;
    const acc = {};
    for (const a of p.accolades || []) acc[a.accolade_id] = a;
    let bestH = own, bestS = -1, ownS = -1;
    for (const h of Object.keys(table.heroes)) {
      const row = table.heroes[h];
      let s = 0;
      for (const aid of table.swap_accolade_ids) {
        const a = acc[aid];
        if (a === undefined) continue;
        const v = a.accolade_stat_value || 0;
        const tier = (a.accolade_threshold_achieved != null ? a.accolade_threshold_achieved : -1) + 1;
        const t = row.thr[String(aid)];
        const pred = (v >= t[0] ? 1 : 0) + (v >= t[1] ? 1 : 0) + (v >= t[2] ? 1 : 0);
        if (pred === tier) s++;
      }
      if (h === own) ownS = s;
      if (s > bestS) { bestH = h; bestS = s; }
    }
    if (ownS >= bestS) return own;
    return bestS > ownS ? bestH : own;
  }

  function statValues(p) {
    const st = p.stats || [{}];
    const f = st[st.length - 1] || {};
    let nw = p.net_worth || 0;
    for (const a of p.accolades || []) if (a.accolade_id === NET_WORTH_ACC) nw = a.accolade_stat_value || nw;
    return [p.kills || 0, p.assists || 0, p.deaths || 0, nw, f.boss_damage || 0, (f.player_damage || 0) + (f.teammate_healing || 0)];
  }

  // Valve-style points for every player, plus the predicted MVP and two Key Players (slots).
  // Valve's own award model is all-length, so flatScore/picks preserve Valve MVP agreement while
  // score/points/means compare each player against their hero in games of this length.
  function scoreMatch(mi, table) {
    const out = [];
    for (const p of mi.players) {
      const g = gradedHero(p, table);
      const inTable = Object.hasOwn(table.heroes, g);
      const row = inTable ? table.heroes[g] : table.fallback;
      const x = statValues(p);
      const pts = x.map((v, i) => row.ppu[i] * (v - row.mean[i]));
      const off = row.offset;
      const flatScore = pts.reduce((a, b) => a + b, 0) + off;
      const ownRow = table.heroes[String(p.hero_id)] || table.fallback;
      const reference = valveStats.map(stat => expected(p.hero_id, stat, mi.duration_s));
      const adjusted = reference.every(Boolean);
      const points = adjusted ? x.map((v, i) => {
        const { mean, sd } = reference[i];
        return sd > 0 ? ownRow.ppu[i] * ownRow.sd[i] * (v - mean) / sd : 0;
      }) : pts;
      const offset = adjusted ? ownRow.offset : off;
      const knownHero = adjusted ? reference[0].knownHero : inTable;
      out.push({
        slot: p.player_slot,
        team: p.team,
        hero_id: p.hero_id,
        graded_hero: /^\d+$/.test(g) ? Number(g) : g,
        inTable,
        knownHero,
        values: x,
        means: adjusted ? reference.map(r => r.mean) : row.mean,
        points,
        offset,
        score: points.reduce((sum, v) => sum + v, 0) + offset,
        flatScore,
        flatPoints: pts,
        valve_rank: p.mvp_rank || 0,
      });
    }
    const flatPicks = awardPicks(out, mi.winning_team, "flatScore");
    const lengthPicks = awardPicks(out, mi.winning_team, "score");
    return { players: out, picks: flatPicks, flatPicks, lengthPicks };
  }

  // Canonical Valve-tab lobby ordering: flat all-length award score, highest first.
  // Both the MVP Valve tab and the Summary lobby-place card call this shared path so places never disagree.
  function rankValve(players) {
    return players
      .slice()
      .sort((a, b) => b.flatScore - a.flatScore)
      .map((player, index) => ({ ...player, place: index + 1 }));
  }

  function awardPicks(out, win, key) {
    const W = out.filter(r => r.team === win).sort((a, b) => b[key] - a[key]);
    const L = out.filter(r => r.team !== win).sort((a, b) => b[key] - a[key]);
    let picks = [];
    if (W.length && L.length) {
      const mvp = W[0], l1 = L[0];
      const rest = [];
      if (W.length > 1) rest.push(W[1]);
      if (L.length > 1) rest.push(L[1]);
      let third = null;
      for (const r of rest) if (third === null || r[key] > third[key]) third = r;
      if (W.length > 1 && L.length > 1 && W[1][key] <= L[1][key]) third = L[1];
      let keys = [l1, third].filter(r => r).sort((a, b) => b[key] - a[key]);
      if (third !== null && l1[key] >= third[key]) keys = [l1, third];
      picks = [mvp.slot].concat(keys.map(r => r.slot));
    }
    return picks;
  }

  // How well the table predicts the real accolade tiers in this match, and how many players were graded
  // against another hero. Used for the "table may be out of date" note.
  function tableHealth(mi, table, scored) {
    let ok = 0, n = 0, swapped = 0;
    (scored || scoreMatch(mi, table)).players.forEach((r, i) => {
      const p = mi.players[i];
      if (String(r.graded_hero) !== String(p.hero_id)) swapped++;
      const row = table.heroes[String(r.graded_hero)];
      if (!row) return;
      for (const a of p.accolades || []) {
        if (!table.swap_accolade_ids.includes(a.accolade_id)) continue;
        const t = row.thr[String(a.accolade_id)];
        const v = a.accolade_stat_value || 0;
        const pred = (v >= t[0] ? 1 : 0) + (v >= t[1] ? 1 : 0) + (v >= t[2] ? 1 : 0);
        const tier = (a.accolade_threshold_achieved != null ? a.accolade_threshold_achieved : -1) + 1;
        n++; if (pred === tier) ok++;
      }
    });
    return { agreement: n ? ok / n : 1, swapped, stale: (n ? ok / n : 1) < 0.95 || swapped > 4 };
  }

  // ---- phase grades (already time-indexed for Early and duration-interpolated for Late in snap_norms.json) ----
  function snapAt(p, T) {
    for (const s of p.stats || []) if (s.time_stamp_s === T) return s;
    return null;
  }
  function timeDead(p, T) {
    let tot = 0;
    for (const d of p.death_details || []) {
      const t = d.game_time_s || 0, dur = d.death_duration_s || 0;
      if (T == null) tot += dur;
      else if (t < T) tot += Math.min(dur, T - t);
    }
    return tot;
  }
  function values(p, s, T) {
    const k = s.kills || 0, a = s.assists || 0, d = s.deaths || 0;
    return [k, a, d, s.net_worth || 0, s.boss_damage || 0, (s.player_damage || 0) + (s.teammate_healing || 0), k + a, timeDead(p, T)];
  }
  function interp(m, knots, col) {
    if (m <= knots[0]) return col[0];
    if (m >= knots[knots.length - 1]) return col[col.length - 1];
    for (let i = 1; i < knots.length; i++) {
      if (m <= knots[i]) {
        const f = (m - knots[i - 1]) / (knots[i] - knots[i - 1]);
        return col[i - 1] + f * (col[i] - col[i - 1]);
      }
    }
    return col[col.length - 1];
  }
  const heroNorm = (norms, p) => norms.heroes[String(p.hero_id)] || norms.fallback;
  function earlyZ(p, norms, T) {
    if (T === undefined) T = 900;
    const s = snapAt(p, T);
    if (s === null) return null;
    const row = heroNorm(norms, p).early[String(T)];
    const x = values(p, s, T);
    return x.map((v, i) => (v - row.mean[i]) / row.sd[i]);
  }
  function lateZ(p, norms) {
    const st = p.stats || [];
    const s9 = snapAt(p, 900);
    if (s9 === null || !st.length || (st[st.length - 1].time_stamp_s || 0) < 1200) return null;
    const f = st[st.length - 1];
    const m = (f.time_stamp_s - 900) / 60.0;
    const row = heroNorm(norms, p).late;
    const a = values(p, s9, 900), b = values(p, f, null);
    const kn = norms.late_knots_min;
    return b.map((_, i) => {
      const mu = interp(m, kn, row.mean.map(r => r[i]));
      const sd = interp(m, kn, row.sd.map(r => r[i]));
      return ((b[i] - a[i]) - mu) / sd;
    });
  }
  function dot(z, w) { return z == null ? null : z.reduce((a, v, i) => a + v * w[i], 0); }

  // The snapshot time Early is graded at: 15:00, or the last standard time every player has in a short match.
  function earlyTime(mi) {
    let T = 900;
    while (T > 180 && !mi.players.every(p => snapAt(p, T))) T -= 180;
    return T;
  }
  function phaseScores(mi, norms) {
    const T = earlyTime(mi);
    return mi.players.map(p => ({
      slot: p.player_slot, team: p.team, hero_id: p.hero_id, early_time_s: T,
      early_valve: dot(earlyZ(p, norms, T), W_VALVE), late_valve: dot(lateZ(p, norms), W_VALVE),
    }));
  }
  function laneScore(p, norms, T) { return dot(earlyZ(p, norms, T === undefined ? 540 : T), W_VALVE); }

  const api = { expected, lengthLabel, percentileVersionMismatch, warnPercentileMismatch, rankValve, W_VALVE, SNAP_TIMES, gradedHero, statValues, scoreMatch, tableHealth, snapAt, timeDead, values, interp,
    earlyZ, lateZ, dot, earlyTime, phaseScores, laneScore };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PM_SCORE = api;
})();
