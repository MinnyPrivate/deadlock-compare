// Healing per target, from Valve's match metadata (match_info.damage_matrix).
// The damage matrix is keyed by stat type. Type 1 is healing: each dealer slot lists, per source
// (ability or item), every target slot it healed, as a running total sampled at sample_time_s.
// The last sample is the end-of-match total. Prototype: not wired into the page yet.
(function (root) {
  const HEALING = 1;

  // Returns { [healerSlot]: { total, self, allies, targets: { [targetSlot]: { total, sources: { [name]: n } } } } }
  function healingPerTarget(matchInfo) {
    const dm = matchInfo && matchInfo.damage_matrix;
    if (!dm || !Array.isArray(dm.damage_dealers) || !dm.source_details) return null;
    const types = dm.source_details.stat_type || [], names = dm.source_details.source_name || [];
    const out = {};
    for (const dealer of dm.damage_dealers) {
      const from = Number(dealer.dealer_player_slot);
      for (const src of dealer.damage_sources || []) {
        if (types[src.source_details_index] !== HEALING) continue;
        const name = names[src.source_details_index] || "unknown";
        for (const tp of src.damage_to_players || []) {
          const arr = tp.damage || [];
          const amount = Number(arr[arr.length - 1]) || 0;
          if (amount <= 0) continue;
          const to = Number(tp.target_player_slot);
          const h = (out[from] = out[from] || { total: 0, self: 0, allies: 0, targets: {} });
          const t = (h.targets[to] = h.targets[to] || { total: 0, sources: {} });
          t.total += amount;
          t.sources[name] = (t.sources[name] || 0) + amount;
          h.total += amount;
          if (to === from) h.self += amount; else h.allies += amount;
        }
      }
    }
    return out;
  }

  // Compares the matrix against each player's final scoreboard stats.
  function reconcile(matchInfo, perTarget) {
    const rows = [];
    for (const p of matchInfo.players || []) {
      const stats = Array.isArray(p.stats) ? p.stats : [];
      const last = stats[stats.length - 1] || {};
      const h = perTarget[p.player_slot] || { total: 0, self: 0, allies: 0 };
      rows.push({
        slot: p.player_slot,
        heroId: p.hero_id,
        matrix: { total: h.total, self: h.self, allies: h.allies },
        official: { total: last.player_healing, self: last.self_healing, allies: last.teammate_healing },
      });
    }
    return rows;
  }

  const api = { healingPerTarget, reconcile };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PMHealing = api;
})(typeof window !== "undefined" ? window : globalThis);
