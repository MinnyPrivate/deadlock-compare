"use strict";
// Synthetic norms and matches for the dealer's unit tests. Uniform stat distributions, so the right tier is easy to work out by hand.
const PGRID = [0.001, 0.0025, 0.005, 0.01, 0.02, 0.05, 0.10, 0.15, 0.25, 0.32, 0.40, 0.50, 0.60, 0.68, 0.75, 0.85, 0.90, 0.95, 0.98, 0.99, 0.995, 0.9975, 0.999];
const CENTERS = [922.74, 1350, 1650, 1950, 2250, 2550, 2850, 3292.63];
const SCALES = { hero_damage: 40000, kills: 20, assists: 30, deaths: 12, healing: 20000, mitigated: 30000, souls: 50000, souls9: 6000, souls_lost: 4000,
  obj_damage: 10000, accuracy: 1, last_hits: 300, output: 50000, takedowns: 40, damage_taken: 40000 };
const KIND = { souls9: "fixed", accuracy: "rate" };

// every stat is uniform from 0 to SCALES[stat], so "top 5%" is 95% of the scale
function makeNorms(heroIds, cardRates, n = 50000, extra = {}) {
  const heroes = {};
  for (const id of heroIds) {
    const stats = {};
    for (const [s, scale] of Object.entries(SCALES)) {
      const cell = { n, q: PGRID.map(p => p * scale) };
      const cellPm = { n, q: PGRID.map(p => p * scale / 30) };
      if (KIND[s]) stats[s] = { scale: KIND[s], C: { all: cell, b: [cell, cell, cell, cell] } };
      else stats[s] = { scale: "length", L1: CENTERS.map(() => cell), L0: [0, 1, 2, 3].map(() => CENTERS.map(() => cell)), P: { all: cellPm, b: [cellPm, cellPm, cellPm, cellPm] } };
    }
    heroes[id] = { hero_id: id, n, stats };
  }
  const flat = { v: [0, 1, 2, 3, 4, 5, 6, 8, 12, 20], c: [3000, 5500, 7500, 8500, 9200, 9600, 9800, 9900, 9980, 10000], n: 10000 };
  const index = { schema: 1, norm_version: "test.1", pgrid: PGRID, bucket_edges_s: [1200, 1500, 1800, 2100, 2400, 2700, 3000], bucket_centers_s: CENTERS,
    band_edges: [50, 80, 100], band_names: ["Low", "Mid", "High", "Top"], heroes: heroIds,
    calibration: { cards: cardRates || {}, strength: { good: { all: flat, by_hero: {} }, bad: { all: flat, by_hero: {} } }, crown: { legendary_margin: 8, mythical_margin: 15 }, scenic: { dpm_median: {}, ratio_cut: 9 }, ...extra } };
  return { index, heroes };
}

// A 12 player match. `me` overrides the first player's numbers. Stats are on a 20 minute (1200 s) clock unless duration says otherwise.
function makeMatch(over = {}) {
  const duration = over.duration_s || 1800;
  const players = [];
  for (let i = 0; i < 12; i++) {
    const slot = i + 1, team = i < 6 ? 0 : 1;
    const base = { kills: 6, deaths: 6, assists: 8, net_worth: 25000, last_hits: 150, player_damage: 20000, teammate_healing: 0, damage_mitigated: 15000, boss_damage: 5000,
      gold_death_loss: 2000, shots_hit: 400, shots_missed: 400, souls9: 3000 };
    const o = Object.assign({}, base, i === 0 ? (over.me || {}) : (over.others && over.others[slot]) || {});
    const final = { time_stamp_s: duration, net_worth: o.net_worth, kills: o.kills, deaths: o.deaths, assists: o.assists, player_damage: o.player_damage, teammate_healing: o.teammate_healing,
      teammate_barriering: 0, damage_mitigated: o.damage_mitigated, boss_damage: o.boss_damage, gold_death_loss: o.gold_death_loss, shots_hit: o.shots_hit, shots_missed: o.shots_missed,
      melee_kills: o.melee_kills || 0, player_damage_taken: o.damage_taken == null ? 20000 : o.damage_taken, custom_user_stats: [{ id: 56, value: o.parries || 0 }] };
    players.push({ account_id: 1000 + slot, player_slot: slot, team, hero_id: over.hero_id || 10, kills: o.kills, deaths: o.deaths, assists: o.assists, net_worth: o.net_worth,
      last_hits: o.last_hits, abandon_match_time_s: (i === 0 && over.left) ? 600 : 0, mvp_rank: i === 0 ? (over.mvp || null) : null,
      player_rank_data: i === 0 && over.badge ? { initial_display_rank: over.badge } : (over.allBadge ? { initial_display_rank: over.allBadge } : null),
      stats: [{ time_stamp_s: 540, net_worth: o.souls9 }, final], death_details: (over.deaths && over.deaths[slot]) || [], items: (over.items && over.items[slot]) || [], accolades: [] });
  }
  const paths = over.fight ? players.map((p, i) => ({ player_slot: p.player_slot, x_min: 0, y_min: 0, x_max: 100, y_max: 100, x_pos: [], y_pos: [], health: [],
    combat_type: Array.from({ length: duration }, (_, t) => (t / duration < (i === 0 ? over.fight.me : over.fight.others) ? 1 : 0)), move_type: [] })) : null;
  const mi = Object.assign({ match_id: over.match_id || 4242, duration_s: duration, match_outcome: 0, winning_team: over.winning_team == null ? 0 : over.winning_team, game_mode: 1, match_mode: 1,
    players, average_badge_team0: over.lobby0 || 0, average_badge_team1: over.lobby1 || 0, match_paths: paths ? { x_resolution: 16383, y_resolution: 16383, paths } : undefined }, over.mi || {});
  return { match_info: mi };
}

// a stat card value at a share (top share for "high" stats)
const atTop = (stat, share) => (1 - share) * SCALES[stat];
const atBottom = (stat, share) => share * SCALES[stat];

module.exports = { PGRID, SCALES, makeNorms, makeMatch, atTop, atBottom };
