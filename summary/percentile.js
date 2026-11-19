"use strict";

(function () {
  let table = typeof module !== "undefined" ? require("../data/hero_percentiles.json") : null;
  let loading;

  function load() {
    if (!loading) {
      loading = fetch("/data/hero_percentiles.json").then(response => {
        if (!response.ok) throw new Error("Could not load hero percentiles.");
        return response.json();
      }).then(data => { table = data; }).catch(() => { loading = null; });
    }
    return loading;
  }

  function bounds(heroId, stat, value) {
    const hero = table?.heroes[String(heroId)];
    const cutoffs = hero?.percentiles[stat];
    if (!Array.isArray(cutoffs) || !Number.isFinite(value)) return null;
    if (stat.endsWith("_per_min")) value = Number(value.toFixed(6));
    // Cutoffs are nearest ranks. A repeated cutoff can lie anywhere inside a tie.
    // Use the midpoint for the percentile estimate and the strict tails for claims.
    const below = cutoffs.filter(cutoff => cutoff < value).length;
    const above = cutoffs.filter(cutoff => cutoff > value).length;
    const lower = table.lower_is_better.includes(stat);
    return { hero, cutoffs, atMedian: value === cutoffs[49], better: lower ? above : below, worse: lower ? below : above };
  }

  function pct(heroId, stat, value) {
    const row = bounds(heroId, stat, value);
    if (!row) return null;
    const { hero, cutoffs, atMedian, better, worse } = row;
    const estimate = atMedian ? 50 : better === 99 ? 99 : worse === 99 ? 1 : Math.round((better + 100 - worse) / 2);
    return { pct: Math.min(99, Math.max(1, estimate)), n: hero.n, p50: cutoffs[49] };
  }

  const api = { pct, bounds, load, sample: () => table?.sample };
  if (typeof module !== "undefined") module.exports = api;
  if (typeof window !== "undefined") window.SummaryPercentiles = api;
})();
