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

  function gradedHero(p, table) {
    const acc = {};
    for (const a of p.accolades || []) acc[a.accolade_id] = a;
    const own = String(p.hero_id);
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
    if (own in table.heroes && ownS >= bestS) return own;
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
  function scoreMatch(mi, table) {
    const out = [];
    for (const p of mi.players) {
      const g = gradedHero(p, table);
      const row = table.heroes[g] || table.fallback;
      const x = statValues(p);
      const pts = x.map((v, i) => row.ppu[i] * (v - row.mean[i]));
      const off = row.offset;
      out.push({ slot: p.player_slot, team: p.team, hero_id: p.hero_id, graded_hero: /^\d+$/.test(g) ? Number(g) : g,
        inTable: g in table.heroes, values: x, points: pts, offset: off, score: pts.reduce((a, b) => a + b, 0) + off, valve_rank: p.mvp_rank || 0 });
    }
    const win = mi.winning_team;
    const W = out.filter(r => r.team === win).sort((a, b) => b.score - a.score);
    const L = out.filter(r => r.team !== win).sort((a, b) => b.score - a.score);
    let picks = [];
    if (W.length && L.length) {
      const mvp = W[0], l1 = L[0];
      const rest = [];
      if (W.length > 1) rest.push(W[1]);
      if (L.length > 1) rest.push(L[1]);
      let third = null;
      for (const r of rest) if (third === null || r.score > third.score) third = r;
      if (W.length > 1 && L.length > 1 && W[1].score <= L[1].score) third = L[1];
      let keys = [l1, third].filter(r => r).sort((a, b) => b.score - a.score);
      if (third !== null && l1.score >= third.score) keys = [l1, third];
      picks = [mvp.slot].concat(keys.map(r => r.slot));
    }
    return { players: out, picks };
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

  // ---- phase grades ----
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

  const api = { W_VALVE, SNAP_TIMES, gradedHero, statValues, scoreMatch, tableHealth, snapAt, timeDead, values, interp,
    earlyZ, lateZ, dot, earlyTime, phaseScores, laneScore };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PM_SCORE = api;
})();
