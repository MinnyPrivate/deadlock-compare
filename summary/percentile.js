"use strict";

(function () {
  let table = typeof module !== "undefined" ? require("../data/hero_percentiles.json") : null;
  const scoring = typeof module !== "undefined" ? require("../scoring.js") : window.PM_SCORE;
  let loading;

  function versionMismatch(customTable = table) {
    return scoring.percentileVersionMismatch ? scoring.percentileVersionMismatch(customTable) : false;
  }

  function load() {
    if (!loading) {
      loading = fetch("data/hero_percentiles.json").then(response => {
        if (!response.ok) throw new Error("Could not load hero percentiles.");
        return response.json();
      }).then(data => {
        table = data;
        if (scoring.warnPercentileMismatch) scoring.warnPercentileMismatch(table);
      }).catch(() => { loading = null; });
    }
    return loading;
  }

  function bounds(heroId, stat, value, durationS, customTable = table) {
    if (!Number.isFinite(value) || !customTable) return null;
    const ref = scoring.expected(heroId, stat, durationS, customTable);
    if (!ref?.knownHero || !ref.cutoffs) return null;
    const { cutoffs } = ref;
    // Scaling cutoffs across game lengths can add floating-point noise to ties.
    const epsilon = Math.max(1, Math.abs(value)) * 1e-10;
    // Cutoffs are nearest ranks. A repeated cutoff can lie anywhere inside a tie.
    // Use the midpoint for the percentile estimate and the strict tails for claims.
    const below = cutoffs.filter(cutoff => cutoff < value - epsilon).length;
    const above = cutoffs.filter(cutoff => cutoff > value + epsilon).length;
    const lower = stat === "deaths" || stat === "deaths_per_min";
    return { ref, cutoffs, atMedian: Math.abs(value - cutoffs[49]) <= epsilon, better: lower ? above : below, worse: lower ? below : above };
  }

  function percentile(row) {
    if (!row) return null;
    const { cutoffs, atMedian, better, worse } = row;
    const estimate = atMedian ? 50 : better === 99 ? 99 : worse === 99 ? 1 : Math.round((better + 100 - worse) / 2);
    return { pct: Math.min(99, Math.max(1, estimate)), p50: cutoffs[49] };
  }

  function pct(heroId, stat, value, durationS, customTable = table) {
    return percentile(bounds(heroId, stat, value, durationS, customTable));
  }
  const api = { pct, percentile, bounds, load, versionMismatch };
  if (typeof module !== "undefined") module.exports = api;
  if (typeof window !== "undefined") window.SummaryPercentiles = api;
})();
