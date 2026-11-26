"use strict";
// Norm lookups for the card dealer: turn a stat value into a tier and an honest "top X%" against the right set of games.
// Pure code, no DOM. Browser: window.PM_DEAL_NORMS. Node: module.exports.
//
// A norm set is a list of cutoffs at the percentile grid PGRID (index.json). They come from tools/build_deal_norms.py.
// Tail rule (bible P25): a tier is only read from a set with enough games for that tier, otherwise the next wider set is used.
//   Common, Rare, Epic: 150 games.  Legendary: 1,000.  Mythical: 10,000.
// Order of sets, most specific first (when the player's rank band is known):
//   A. hero + match length + rank band      B. hero + match length (all ranks) moved by the band's usual shift
//   C. hero + match length (all ranks)      D. hero per minute + rank band      E. hero per minute (all ranks)
// Length is smooth: cutoffs are interpolated between the centres of the 8 length buckets and scaled per minute past the ends,
// the same way the length-aware hero norms work.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PM_DEAL_NORMS = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const TIER_ORDER = ["common", "rare", "epic", "legendary", "mythical"]; // low to high
  const TIER_SHARE = { common: 0.40, rare: 0.25, epic: 0.10, legendary: 0.01, mythical: 0.001 };
  const TIER_NEED = { common: 150, rare: 150, epic: 150, legendary: 1000, mythical: 10000 };

  // Share of games at or above v (good side) and at or below v (bad side), from cutoffs q at percentiles pg.
  // Ties count against you: both are the safe (bigger) bound. Integer stats (kills, deaths, assists) use the bound only.
  // Continuous stats interpolate inside a gap of the grid, so the printed "Top 3.4%" is not rounded to the grid.
  function topShare(q, pg, v, discrete) {
    const n = q.length;
    let i = 0;
    while (i < n && q[i] < v) i++;            // first cutoff at or above v
    if (i === n) return 1 - pg[n - 1];        // beyond the last cutoff
    if (i === 0) return 1;                    // at or below the lowest cutoff
    const hi = 1 - pg[i - 1];
    if (discrete || q[i] === q[i - 1] || q[i] === v) return hi;
    const lo = 1 - pg[i];
    return hi - (hi - lo) * ((v - q[i - 1]) / (q[i] - q[i - 1]));
  }
  function bottomShare(q, pg, v, discrete) {
    const n = q.length;
    let k = 0;
    while (k < n && q[k] <= v) k++;           // first cutoff above v
    if (k === n) return 1;
    if (k === 0) return pg[0];                // below the lowest cutoff
    const hi = pg[k];
    if (discrete) return hi;
    const lo = pg[k - 1];
    if (q[k] === q[k - 1]) return hi;
    return lo + (hi - lo) * ((v - q[k - 1]) / (q[k] - q[k - 1]));
  }

  function bandOf(badge, edges) {
    if (!badge) return null;
    for (let i = 0; i < edges.length; i++) if (badge < edges[i]) return i;
    return edges.length;
  }

  // Cutoffs for one hero + stat at this match length, from the most specific set with at least `need` games.
  // Returns { q, n, set, shifted } or null.
  function resolve(index, heroTable, stat, durationS, band, need) {
    const st = heroTable && heroTable.stats && heroTable.stats[stat];
    if (!st) return null;
    if (st.scale !== "length") {
      const C = st.C || {};
      if (band != null && C.b && C.b[band] && C.b[band].n >= need) return { q: C.b[band].q, n: C.b[band].n, set: "hero+rank" };
      if (C.all && C.all.n >= need) return { q: C.all.q, n: C.all.n, set: "hero" };
      return null;
    }
    const centers = index.bucket_centers_s;
    const last = centers.length - 1;
    // Length: interpolate between bucket centres, scale per minute outside them.
    let i0, i1, w, scale = 1, edge = -1;
    if (durationS <= centers[0]) { edge = 0; scale = durationS / centers[0]; }
    else if (durationS >= centers[last]) { edge = last; scale = durationS / centers[last]; }
    else { i0 = 0; while (centers[i0 + 1] < durationS) i0++; i1 = i0 + 1; w = (durationS - centers[i0]) / (centers[i1] - centers[i0]); }
    function cellsAt(rows) {
      if (!rows) return null;
      if (edge >= 0) { const c = rows[edge]; return c && c.n >= need ? { q: c.q.map(x => x * scale), n: c.n } : null; }
      const a = rows[i0], b = rows[i1];
      if (a && b && a.n >= need && b.n >= need) return { q: a.q.map((x, k) => x * (1 - w) + b.q[k] * w), n: Math.min(a.n, b.n) };
      return null;
    }
    if (band != null) {
      const A = cellsAt(st.L0 && st.L0[band]);
      if (A) return { q: A.q, n: A.n, set: "hero+length+rank" };
    }
    const L = cellsAt(st.L1);
    if (L) {
      if (band != null) {
        const P = st.P;
        const pb = P && P.b && P.b[band], pa = P && P.all;
        const med = Math.floor(index.pgrid.indexOf(0.5));
        if (pb && pa && pb.n >= 150 && pa.q[med] > 0) {
          const k = pb.q[med] / pa.q[med];
          if (k > 0.2 && k < 5) return { q: L.q.map(x => x * k), n: L.n, set: "hero+length (rank-adjusted)", shifted: k };
        }
      }
      return { q: L.q, n: L.n, set: "hero+length" };
    }
    const P = st.P;
    if (P) {
      const m = durationS / 60;
      if (band != null && P.b && P.b[band] && P.b[band].n >= need) return { q: P.b[band].q.map(x => x * m), n: P.b[band].n, set: "hero per minute+rank" };
      if (P.all && P.all.n >= need) return { q: P.all.q.map(x => x * m), n: P.all.n, set: "hero per minute" };
    }
    return null;
  }

  // Grade one value. dir: "high" (more is better) or "low" (less is better, like deaths).
  // Returns { side, tier, g, b, share, set, n, median, ... } where `share` is the share of games as good or better (good side)
  // or as bad or worse (bad side), in the set that decided the tier.
  function grade(norms, heroId, stat, value, durationS, band, opts) {
    const index = norms.index;
    const heroTable = norms.heroes[heroId];
    if (!heroTable) return null;
    const dir = (opts && opts.dir) || "high";
    const discrete = !!(opts && opts.discrete);
    const pg = index.pgrid;
    const flip = dir !== "high";
    for (let k = TIER_ORDER.length - 1; k >= 0; k--) {
      const t = TIER_ORDER[k];
      const set = resolve(index, heroTable, stat, durationS, band, TIER_NEED[t]);
      if (!set) continue;
      const topS = topShare(set.q, pg, value, discrete);
      const botS = bottomShare(set.q, pg, value, discrete);
      const goodShare = flip ? botS : topS;
      const badShare = flip ? topS : botS;
      if (goodShare <= TIER_SHARE[t] + 1e-9) return finish(set, "good", t, goodShare, badShare);
      if (badShare <= TIER_SHARE[t] + 1e-9) return finish(set, "bad", t, badShare, goodShare);
    }
    const set = resolve(index, heroTable, stat, durationS, band, 150);
    if (!set) return null;
    const topS = topShare(set.q, pg, value, discrete), botS = bottomShare(set.q, pg, value, discrete);
    return finish(set, "middle", null, Math.min(topS, botS), Math.max(topS, botS));
    function finish(set, side, tier, share, other) {
      return { side, tier, share, other, set: set.set, n: set.n, median: set.q[pg.indexOf(0.5)], shifted: set.shifted || null, band };
    }
  }

  // The hero's typical value for a stat at this length (for eligibility and the "avg Haze" line).
  function median(norms, heroId, stat, durationS, band) {
    const set = resolve(norms.index, norms.heroes[heroId], stat, durationS, band, 150);
    return set ? set.q[norms.index.pgrid.indexOf(0.5)] : null;
  }

  // Tier of a share of games (used for cards that earn rarity by how often they happen: Jokers, events).
  function tierOfShare(share, kind) {
    if (share < 0.001) return "mythical";
    if (share < 0.01) return "legendary";
    if (share < 0.10) return "epic";
    if (share < 0.25) return "rare";
    if (kind !== "joker" && share <= 0.40) return "common";
    return null; // too common to deal
  }

  return { TIER_ORDER, TIER_SHARE, TIER_NEED, topShare, bottomShare, bandOf, resolve, grade, median, tierOfShare };
});
