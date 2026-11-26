"use strict";
// The card dealer: dealMatch(match, player, norms, options) -> the player's hand.
// Pure and deterministic: the same match, player, norms and options always give the same hand, in the same order.
// No DOM, no network, no clock. Browser: window.PM_DEAL. Node: module.exports.
//
// The rules live in card-deep-dive/card-system-bible.md (sections 5 and 6) and answers.md. In short:
//   1. Every headline stat is graded against the same hero, a similar match length and the player's OWN rank band
//      (the lobby average only when the player has no rank). Full ladder: Common 40%, Rare 25%, Epic 10%, Legendary 1%, Mythical 0.1%.
//   2. Jokers and event cards earn rarity from how often they happen across all games (measured in the norms file).
//   3. One card per story (P30). One Joker per hand unless both are Legendary or better (P32); the runner-up is "also earned".
//   4. Hand size comes from how strong the game was against other games on that hero (P4, weights 1/2/4/6 from P36);
//      the bad side adds at most one card (P34). Legendary and Mythical cards, the Crown and the Joker are always dealt.
//   5. Same-suit cards are softly down-weighted (1.0, 0.85, 0.60, 0.35), not capped (P37 was dropped for healers).
//   6. Bad cards are always on. A good card is kept when one is Rare or better (P35 silver lining). Supports with a Rare or better
//      assists or healing line get no bad farm cards. Bad cards soften when the lobby is well above the player's rank.
//   7. Order is random but fixed per match and player (P24).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./norms"), require("./features"), require("./catalog"));
  else root.PM_DEAL = factory(root.PM_DEAL_NORMS, root.PM_DEAL_FEATURES, root.PM_DEAL_CATALOG);
})(typeof self !== "undefined" ? self : this, function (N, F, C) {
  const TIERS = N.TIER_ORDER;                                  // common .. mythical
  const POINTS = { common: 0, rare: 1, epic: 2, legendary: 4, mythical: 6 };           // hand strength (P36)
  const INTEREST = { common: 1, rare: 3, epic: 9, legendary: 27, mythical: 81 };       // interest score (bible 6.3)
  const GOOD_RANK = { common: "10", rare: "J", epic: "Q", legendary: "K", mythical: "A" };
  const BAD_RANK = { common: "5", rare: "4", epic: "3", legendary: "2", mythical: "X" };
  const SUIT_WEIGHTS = [1.0, 0.85, 0.60, 0.35];                // soft same-suit weights for the 1st, 2nd, 3rd and later non-must-deal card
  const SIZE_STEPS = [[0.30, 4], [0.60, 5], [0.80, 6], [0.92, 7], [0.97, 8], [0.98, 9], [0.99, 10], [0.995, 11], [0.999, 12], [1.01, 13]];   // the bible bands "9 to 10" and "11 to 12" are split in half
  const MAX_HAND = 13, MIN_HAND = 4, BAD_SIDE_CAP = 6;
  const HERO_GUARD = { joker: 0.25, event: 0.40 };            // P35: a Joker over 25% of one hero's games, an event over 40%, is off for that hero
  const KEEP_CRITERIA = { rare: 1 };
  const tierIdx = t => TIERS.indexOf(t);
  const rankAtLeast = (t, min) => tierIdx(t) >= tierIdx(min);

  // ---------- seeded order (P24) ----------
  function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const MODE_OK = new Set([1, 4, "Unranked", "Ranked"]);
  function notDealt(reason, message, extra) {
    return Object.assign({ status: "not_dealt", reason, message, cards: [], hand_size: 0 }, extra || {});
  }

  function bandIndex(norms, badge) { return N.bandOf(badge, norms.index.band_edges); }

  // ---------- step 1: read the match ----------
  function analyze(input, who, norms, opts) {
    if (!input || typeof input !== "object") return { stop: notDealt("no_match_data", "There is no match data to deal from.") };
    const m = F.buildMatch(input);
    const mi = m.mi;
    if (!mi || !m.players.length) return { stop: notDealt("no_match_data", "There is no match data to deal from.") };
    const oc = mi.match_outcome;
    if (oc !== undefined && oc !== null && oc !== 0 && oc !== "TeamWin") return { stop: notDealt("canceled", "This match was canceled, so it was not dealt.", { match_id: m.matchId }) };
    if (!(mi.game_mode === 1 || mi.game_mode === "Normal" || mi.game_mode === undefined)) return { stop: notDealt("unsupported_mode", "Only standard matches are dealt for now.", { match_id: m.matchId }) };
    if (mi.match_mode !== undefined && !MODE_OK.has(mi.match_mode)) return { stop: notDealt("custom_or_bot_lobby", "Custom lobbies and bot matches are not dealt.", { match_id: m.matchId }) };
    if (F.num(mi.bot_difficulty) > 0) return { stop: notDealt("custom_or_bot_lobby", "Custom lobbies and bot matches are not dealt.", { match_id: m.matchId }) };
    if (m.duration < 600) return { stop: notDealt("too_short", "This match ended too early to be dealt.", { match_id: m.matchId }) };
    let p = null;
    if (typeof who === "number") p = m.bySlot.get(who);
    else if (who && who.slot != null) p = m.bySlot.get(who.slot);
    else if (who && who.account_id != null) p = m.players.find(x => x.account_id === who.account_id);
    if (!p) return { stop: notDealt("player_not_in_match", "That player was not in this match.", { match_id: m.matchId }) };
    if (!norms.heroes[p.hero_id]) return { stop: notDealt("no_norms_for_hero", "There are not enough games for this hero to grade against yet.", { match_id: m.matchId, hero_id: p.hero_id }) };

    const rank = F.rankInfo(m, p);
    const band = rank.badge ? bandIndex(norms, rank.badge) : null;
    const v = F.statValues(m, p);
    const g = {};
    for (const [stat, def] of Object.entries(statDefs)) {
      const value = v[stat];
      if (value == null) continue;
      g[stat] = N.grade(norms, p.hero_id, stat, value, m.duration, band, { dir: def.dir, discrete: def.discrete });
    }
    // lobby rank gap, for softening bad cards
    const lobby = F.lobbyBadge(m);
    let gapSteps = 0;
    if (p.badge && lobby) gapSteps = F.badgeSteps(lobby) - F.badgeSteps(p.badge);
    const scores = opts.scores !== undefined ? opts.scores : scoreSlots(m, opts);
    return { m, p, v, g, band, rank, lobby, gapSteps, scores };
  }

  const statDefs = {};
  for (const s of C.STAT_CARDS) statDefs[s.stat] = { dir: s.dir, discrete: !!s.discrete };
  statDefs.output = { dir: "high" }; statDefs.takedowns = { dir: "high", discrete: true };
for (const s of C.HELD_STATS) statDefs[s.stat] = { dir: s.dir, discrete: !!s.discrete };

  // Valve-style estimated score per slot, when the caller gives the scoring function (scoring.js + the hero table).
  function scoreSlots(m, opts) {
    const sc = opts.score;
    if (!sc || !sc.scoreMatch || !sc.table) return null;
    try {
      const r = sc.scoreMatch(m.mi, sc.table);
      return new Map(r.players.map(x => [x.slot, x.score]));
    } catch (e) { return null; }
  }

  // ---------- step 2: every card this player could be dealt ----------
  function candidates(a, norms, opts) {
    const { m, p, v, g, band } = a;
    const cal = norms.index.calibration || {};
    const out = [];
    const bn = norms.index.band_names[band];
    const scope = gr => ({
      hero_id: p.hero_id, duration_s: m.duration, rank_band: band == null ? null : bn.toLowerCase(), rank_source: a.rank.source,
      set_used: gr.set, games_compared: gr.n, hero_average: gr.median,
    });
    const support = (() => {
      const ga = g.assists, gh = g.healing;
      return (ga && ga.side === "good" && rankAtLeast(ga.tier, "rare")) || (gh && gh.side === "good" && rankAtLeast(gh.tier, "rare") && gh.median > 0);
    })();
    const soften = a.gapSteps >= 24 ? 2 : a.gapSteps >= 12 ? 1 : 0;

    // headline stat cards
    const enabled = new Set((opts && opts.enable) || []);
    for (const sc of C.STAT_CARDS.concat(C.HELD_STATS.filter(h => enabled.has(h.id)))) {
      const gr = g[sc.stat];
      const value = v[sc.stat];
      if (!gr || value == null) continue;
      if (gr.median == null || gr.median <= 0) continue;                      // the hero does not normally do this: switched off
      if (sc.goodOnly && gr.side !== "good") continue;
      if (sc.needsFight) {
        const fs = F.fightShare(m, p), med = F.lobbyFightMedian(m);
        if (fs == null || med == null || fs < med) continue;
      }
      if (gr.side === "middle") { out.push(stat(sc, gr, value, "middle", "good")); continue; }
      let tier = gr.tier, side = gr.side;
      if (side === "good" && sc.dir === "high" && !(value > 0)) continue;
      if (side === "bad") {
        if (sc.farm && support) continue;                                         // a support who was a Rare or better assister or healer owes no farm
        if (soften) { const k = tierIdx(tier) - soften; if (k < 0) continue; tier = TIERS[k]; }
      }
      out.push(stat(sc, gr, value, tier, side));
    }
    function stat(sc, gr, value, tier, side) {
      const t = side === "bad" ? sc.bad : sc.good;
      return {
        id: sc.id + (side === "bad" ? ".bad" : ".good"), card_id: "stat." + sc.id, kind: "stat", side, suit: sc.suit, family: sc.family,
        tier, share: gr.share, dir: sc.dir, title: t.title, flavor: t.flavor, value, unit: sc.unit, percent: !!sc.percent, weight: sc.weight,
        comparison: scope(gr), evidence: sc.evidence, softened: side === "bad" && soften > 0 && tier !== gr.tier ? true : undefined,
      };
    }

    // the Crown
    if (p.raw.mvp_rank === 1) {
      let tier = "epic", margin = null;
      const sl = a.scores;
      if (sl && sl.has(p.slot)) {
        let rival = -Infinity;
        for (const [s, x] of sl) if (s !== p.slot && x > rival) rival = x;
        margin = sl.get(p.slot) - rival;
        const cc = cal.crown;
        if (cc && margin >= cc.mythical_margin) tier = "mythical";
        else if (cc && margin >= cc.legendary_margin) tier = "legendary";
      }
      const kills = g.kills;
      const key = p.raw.deaths <= 1 ? "clean" : (kills && kills.side === "bad" ? "quiet" : "default")  // quiet: an MVP whose kills were in the bottom 40% for the hero;
      const t = C.CROWN.titles[key];
      out.push({ id: "crown", card_id: "crown", kind: "crown", side: "good", suit: "crown", family: "crown", tier, share: null, title: t.title, flavor: t.flavor,
        value: margin != null ? Math.round(margin * 10) / 10 : null, unit: "score ahead", weight: C.CROWN.weight, comparison: null, evidence: C.CROWN.evidence,
        line: margin != null ? `Valve named you MVP, ${Math.round(margin * 10) / 10} estimated points clear of the next player.` : "Valve named you MVP.", margin });
    }

    // Jokers and event cards
    const node = { index: norms.index, heroes: norms.heroes, median: (hid, stat, dur) => N.median(norms, hid, stat, dur, band) };
    for (const cd of C.CARDS) {
      const prev = cal.cards && cal.cards[cd.id];
      if (!prev || prev.retired) continue;
      const hg = prev.by_hero && prev.by_hero[p.hero_id];
      if (hg && hg.n >= 100 && hg.rate > (cd.kind === "joker" ? HERO_GUARD.joker : HERO_GUARD.event)) continue;     // P35 hero guard
      const tier = N.tierOfShare(prev.rate, cd.kind);
      if (!tier) continue;
      let hit = null;
      try { hit = cd.detect({ m, p, v, g, norms: node, scores: a.scores, opts }); } catch (e) { hit = null; }
      if (!hit) continue;
      let side = cd.side || "odd";
      if (side === "bad" && soften) {
        const k = tierIdx(tier) - soften;
        if (k < 0) continue;
      }
      const tierUsed = side === "bad" && soften ? TIERS[tierIdx(tier) - soften] : tier;
      out.push({ id: cd.id, card_id: cd.kind + "." + cd.id, kind: cd.kind, side, suit: cd.kind === "joker" ? "joker" : cd.suit, family: cd.kind === "joker" ? "joker." + cd.id : cd.family,
        tier: tierUsed, share: prev.rate, title: cd.title, flavor: cd.flavor, value: hit.value, unit: hit.unit, line: hit.line, weight: 1.0,
        comparison: null, evidence: Object.assign({}, cd.evidence, hit.evidence), target_slot: hit.target_slot, one_in: Math.round(1 / prev.rate),
        softened: tierUsed !== tier ? true : undefined });
    }
    return out;
  }

  // ---------- step 3: rank, reduce, size and pick ----------
  function interestOf(c, opts) {
    const base = INTEREST[c.tier] || 0;
    const ts = N.TIER_SHARE[c.tier];
    const depth = c.share != null && c.kind === "stat" && ts ? 0.5 * Math.max(0, 1 - c.share / ts) : 0.25;
    let s = base * (1 + depth) * c.weight;
    // P5: a Common to Epic card dealt in each of the player's last 3 games on this hero steps aside. Never Legendary+, never a NEW BEST.
    const h = opts.history;
    if (h && h.length >= 3 && TIERS.indexOf(c.tier) <= tierIdx("epic") && !c.new_best && h.slice(0, 3).every(g => (Array.isArray(g) ? g : g.card_ids || (g.cards || []).map(x => x.card_id)).includes(c.card_id))) s *= 0.7;
    if (c.new_best) s += base * 0.5;
    if (opts.seen && !opts.seen.has(c.card_id)) s += 2;
    return s;
  }

  function strengthOf(list) { return list.reduce((a, c) => a + (POINTS[c.tier] || 0), 0); }

  // Where this strength sits among that hero's games, 0..1 (mid-rank, so ties do not push it to either end).
  // Per-hero table when it has 300+ games, else the all-heroes table. The extreme top (over 99%) always reads the all-heroes table,
  // because a single hero's table is too thin to place the rarest hands.
  function strengthPct(norms, heroId, kind, s) {
    const cal = norms.index.calibration;
    const st = cal && cal.strength && cal.strength[kind];
    if (!st) return 0.5;
    const pAll = cdf(st.all, s);
    const h = st.by_hero && st.by_hero[heroId];
    if (h && h.n >= 300) { const p = cdf(h, s); return p > 0.99 ? pAll : p; }
    return pAll;
  }
  // t = { v: sorted distinct strengths, c: cumulative game counts, n: games }
  function cdf(t, s) {
    let below = 0, at = 0;
    for (let i = 0; i < t.v.length; i++) {
      const prev = i ? t.c[i - 1] : 0;
      if (t.v[i] < s) below = t.c[i]; else if (t.v[i] === s) at = t.c[i] - prev;
    }
    return (below + at / 2) / t.n;
  }
  function sizeFromPct(p) { for (const [cut, n] of SIZE_STEPS) if (p < cut) return n; return MAX_HAND; }

  function reduce(cands, opts) {
    // keep the best card per (family, side); the others go to "also" on that card.
    const best = new Map();
    for (const c of cands) c.interest = interestOf(c, opts);
    const sorted = cands.slice().sort((a, b) => b.interest - a.interest || (a.id < b.id ? -1 : 1));
    const kept = [], dropped = [];
    for (const c of sorted) {
      const key = c.family + "|" + (c.side === "bad" ? "bad" : "good");
      if (best.has(key)) { best.get(key).also = (best.get(key).also || []).concat([brief(c)]); dropped.push(c); continue; }
      best.set(key, c); kept.push(c);
    }
    return { kept, dropped };
  }
  const brief = c => ({ card_id: c.card_id, title: c.title, tier: c.tier, side: c.side, value: c.value, unit: c.unit, share: c.share });

  // P32: one Joker, or two when both are Legendary or better; the rest are "also earned".
  function limitJokers(list) {
    const jokers = list.filter(c => c.kind === "joker").sort((a, b) => tierIdx(b.tier) - tierIdx(a.tier) || b.interest - a.interest || (a.id < b.id ? -1 : 1));
    if (jokers.length <= 1) return { list, also: [] };
    const keep = new Set([jokers[0]]);
    if (rankAtLeast(jokers[0].tier, "legendary") && rankAtLeast(jokers[1].tier, "legendary")) keep.add(jokers[1]);
    return { list: list.filter(c => c.kind !== "joker" || keep.has(c)), also: jokers.filter(c => !keep.has(c)) };
  }

  function select(cands, size, opts, rng) {
    const must = cands.filter(c => c.must).sort((a, b) => b.interest - a.interest);
    while (must.length > MAX_HAND) must.pop();
    const hand = must.slice();
    const rest = cands.filter(c => !c.must && c.tier !== "common" && c.tier !== "middle");
    const goodRest = rest.filter(c => c.side !== "bad"), badRest = rest.filter(c => c.side === "bad");
    const open = Math.max(0, size - hand.length);
    const gp = goodRest.reduce((a, c) => a + (POINTS[c.tier] || 0), 0), bp = badRest.reduce((a, c) => a + (POINTS[c.tier] || 0), 0);
    let badQuota = gp + bp ? Math.round(open * bp / (gp + bp)) : 0;
    badQuota = Math.min(badQuota, badRest.length);
    let goodQuota = Math.min(open - badQuota, goodRest.length);
    if (goodQuota + badQuota < open) badQuota = Math.min(badRest.length, open - goodQuota);
    const suitCount = {};
    const pick = (pool, quota) => {
      for (let i = 0; i < quota; i++) {
        let bestC = null, bestV = -1;
        for (const c of pool) {
          if (hand.includes(c)) continue;
          const w = SUIT_WEIGHTS[Math.min(suitCount[c.suit] || 0, SUIT_WEIGHTS.length - 1)];
          const val = c.interest * w;
          if (val > bestV || (val === bestV && bestC && c.id < bestC.id)) { bestV = val; bestC = c; }
        }
        if (!bestC) return;
        hand.push(bestC); suitCount[bestC.suit] = (suitCount[bestC.suit] || 0) + 1;
      }
    };
    // pick best-first across both sides while each side still has quota left
    let gq = goodQuota, bq = badQuota;
    while (gq + bq > 0) {
      const gc = gq > 0 ? bestOf(goodRest) : null, bc = bq > 0 ? bestOf(badRest) : null;
      let ch = null, side = null;
      if (gc && bc) { if (gc.val >= bc.val) { ch = gc.c; side = "g"; } else { ch = bc.c; side = "b"; } }
      else if (gc) { ch = gc.c; side = "g"; } else if (bc) { ch = bc.c; side = "b"; } else break;
      hand.push(ch); suitCount[ch.suit] = (suitCount[ch.suit] || 0) + 1;
      if (side === "g") gq--; else bq--;
    }
    function bestOf(pool) {
      let bc = null, bv = -1;
      for (const c of pool) {
        if (hand.includes(c)) continue;
        const w = SUIT_WEIGHTS[Math.min(suitCount[c.suit] || 0, SUIT_WEIGHTS.length - 1)];
        const val = c.interest * w;
        if (val > bv || (val === bv && bc && c.id < bc.id)) { bv = val; bc = c; }
      }
      return bc ? { c: bc, val: bv } : null;
    }
    // P35 silver lining: keep one good card when any good card is Rare or better. Call made: when nothing is Rare, the best good Common
    // (still the top 40% of that stat) is kept too, and when even that is missing the best Middle card ("Middle of the pack") is the relief card,
    // so a hand is never all bad.
    const isGood = c => c.side !== "bad" && c.kind === "stat";
    if (!hand.some(isGood)) {
      const pool = cands.filter(c => isGood(c) && !c.must).sort((a, b) => (a.tier === "middle") - (b.tier === "middle") || b.interest - a.interest || (a.id < b.id ? -1 : 1));
      const g = pool[0];
      if (g) {
        if (hand.length >= Math.max(size, MIN_HAND) && hand.length) {
          const idx = hand.map((c, i) => [c, i]).filter(([c]) => !c.must).sort((a, b) => a[0].interest - b[0].interest)[0];
          if (idx) hand.splice(idx[1], 1);
        }
        hand.push(g);
      }
    }
    // filler up to the minimum: good Commons, then bad Commons, then Middle cards (never dealt otherwise)
    const need = MIN_HAND;
    if (hand.length < need) {
      const pools = [cands.filter(c => !c.must && c.tier === "common" && c.side !== "bad"), cands.filter(c => !c.must && c.tier === "common" && c.side === "bad"),
        cands.filter(c => c.tier === "middle")];
      for (const pool of pools) {
        pool.sort((a, b) => b.interest - a.interest || (a.id < b.id ? -1 : 1));
        for (const c of pool) { if (hand.length >= need) break; if (!hand.includes(c)) hand.push(c); }
      }
    }
    return hand;
  }

  // ---------- deal order (bible 6.6) ----------
  function orderHand(hand, rng) {
    const n = hand.length;
    if (n <= 1) return hand.slice();
    const pool = hand.slice();
    const take = c => { pool.splice(pool.indexOf(c), 1); return c; };
    let finale = null;
    const byTier = t => hand.filter(c => c.tier === t);
    for (const t of ["mythical", "legendary"]) { const l = byTier(t).filter(c => c.side !== "bad" || true); if (l.length) { finale = l.sort((a, b) => b.interest - a.interest)[0]; break; } }
    if (!finale) finale = hand.filter(c => c.new_best && rankAtLeast(c.tier, "epic")).sort((a, b) => b.interest - a.interest)[0] || null;
    const slots = new Array(n).fill(null);
    // when the only good card (other than the Crown and Jokers) is the finale, it opens the hand instead: a hand never opens on a bad card
    const goodOpeners = hand.filter(c => c !== finale && c.side !== "bad" && c.kind !== "crown" && c.kind !== "joker");
    if (finale && !goodOpeners.length && finale.side !== "bad" && finale.kind !== "crown" && finale.kind !== "joker") finale = null;
    // first card is a modest good card when there is one
    const firstPool = pool.filter(c => c !== finale && c.side !== "bad" && c.kind !== "crown" && c.kind !== "joker").sort((a, b) => tierIdx(a.tier) - tierIdx(b.tier) || (a.id < b.id ? -1 : 1));
    let first = firstPool[0] || pool.filter(c => c !== finale && c.side !== "bad" && c.kind !== "joker")[0] || pool.filter(c => c !== finale && c.kind !== "joker")[0] || pool[0];
    if (!finale && !goodOpeners.length) { const g = hand.filter(c => c.side !== "bad" && c.kind !== "crown" && c.kind !== "joker").sort((a, b) => b.interest - a.interest)[0]; if (g) first = g; }
    if (finale && first === finale) first = pool.find(c => c !== finale) || first;
    slots[0] = take(first);
    if (finale && finale !== first) {
      const last60 = rng() < 0.6;
      let at = n - 1;
      if (!last60 && n >= 4) at = n - 1 - (rng() < 0.5 ? 1 : 2);
      if (at <= 0 || (finale.kind === "crown" && at < Math.floor(n / 2))) at = n - 1;
      slots[at] = take(finale);
      if (at !== n - 1) {
        // last card: the most surprising one left (a Joker, else a bad card)
        const surprise = pool.find(c => c.kind === "joker") || pool.filter(c => c.side === "bad").sort((a, b) => tierIdx(b.tier) - tierIdx(a.tier))[0];
        if (surprise) slots[n - 1] = take(surprise);
      }
    }
    // the rest are shuffled, then nudged so the same suit does not come twice in a row, the Crown lands in the back half and no Joker is first
    const rest = pool.slice();
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    const empty = slots.map((c, i) => (c ? -1 : i)).filter(i => i >= 0);
    // fill the open slots with a small search so the Crown lands in the back half, no Joker opens and (when it can be done) no suit repeats.
    // Level 0 asks for all three, level 1 drops the suit rule, level 2 drops everything and fills in order.
    const fits = (c, i, level) => {
      if (level >= 2) return true;
      if (c.kind === "crown" && i < Math.floor(n / 2)) return false;
      if (c.kind === "joker" && i === 0) return false;
      if (level === 0) { const prev = slots[i - 1], next = slots[i + 1]; if ((prev && prev.suit === c.suit) || (next && next.suit === c.suit)) return false; }
      return true;
    };
    let budget = 20000;
    const search = (e, level) => {
      if (e === empty.length) return true;
      if (budget-- <= 0) return false;
      const i = empty[e];
      for (let k = 0; k < rest.length; k++) {
        const c = rest[k];
        if (c === null || !fits(c, i, level)) continue;
        slots[i] = c; rest[k] = null;
        if (search(e + 1, level)) return true;
        slots[i] = null; rest[k] = c;
      }
      return false;
    };
    let placed = false;
    for (const level of [0, 1]) { budget = 20000; if (search(0, level)) { placed = true; break; } }
    if (!placed) { const left = rest.filter(c => c); for (const i of empty) slots[i] = left.shift(); }
    return slots;
  }

  function fmtNum(x) {
    if (x == null) return "";
    if (typeof x === "string") return x;
    if (Math.abs(x) >= 1000) return Math.round(x).toLocaleString("en-US");
    return String(Math.round(x * 10) / 10);
  }
  function pctString(share) {
    const x = share * 100;
    return x >= 10 ? String(Math.round(x)) : x >= 1 ? String(Math.round(x * 10) / 10) : String(Math.round(x * 100) / 100);
  }

  function finalize(c, i, a, norms) {
    const bad = c.side === "bad";
    const heroName = a.opts && a.opts.heroName ? a.opts.heroName(a.p.hero_id) : "this hero";
    const out = {
      card_id: c.card_id, kind: c.kind, side: c.side, suit: c.suit, tier: c.tier, family: c.family,
      corner_rank: c.tier === "middle" ? "8" : (bad ? BAD_RANK : GOOD_RANK)[c.tier],
      title: c.title, flavor: c.flavor,
      value: c.value, unit: c.unit, value_text: c.percent && typeof c.value === "number" ? Math.round(c.value * 100) + "%" : fmtNum(c.value),
      percentile: c.share, evidence: c.evidence, marks: c.new_best ? ["new_best"] : [],
      deal_order: i, match_id: a.m.matchId, norm_version: norms.index.norm_version,
    };
    if (c.kind === "stat") {
      const cmp = c.comparison;
      out.comparison = cmp;
      out.percentile_text = c.tier === "middle" ? "Middle of the pack" : (bad ? "Bottom " : "Top ") + pctString(c.share) + "%";
      const mins = Math.round(a.m.duration / 60);
      out.scope_text = `${heroName} · games around ${mins} min · ${cmp.rank_band ? cmp.rank_band[0].toUpperCase() + cmp.rank_band.slice(1) + " rank" : "all ranks"}`;
      out.line = `${out.value_text} ${c.unit}`;
      if (rankAtLeast(c.tier === "middle" ? "common" : c.tier, "legendary")) out.one_in = Math.max(10, Math.round(1 / Math.max(c.share, 0.001)));
    } else {
      out.line = c.line;
      out.percentile_text = c.kind === "crown" ? "MVP" : `Happens in ${pctString(c.share)}% of games`;
      if (c.share != null) out.one_in = Math.round(1 / c.share);
      if (c.kind === "crown") out.comparison = null;
      if (c.target_slot != null) out.target_slot = c.target_slot;
    }
    if (c.softened) out.softened = true;
    if (c.also && c.also.length) out.also = c.also;
    return out;
  }

  // ---------- the deal ----------
  function dealMatch(input, who, norms, opts) {
    opts = opts || {};
    const a = analyze(input, who, norms, opts);
    if (a.stop) return a.stop;
    a.opts = opts;
    const { m, p } = a;
    let cands = candidates(a, norms, opts);
    for (const c of cands) if (opts.bests && opts.bests[c.card_id] != null && !p.left && typeof c.value === "number" && c.side !== "bad" && (c.dir === "low" ? c.value < opts.bests[c.card_id] : c.value > opts.bests[c.card_id])) c.new_best = true;
    const red = reduce(cands, opts);
    const lim = limitJokers(red.kept);
    cands = lim.list;
    const alsoEarned = lim.also.map(c => finalize(c, -1, a, norms));
    for (const c of cands) c.must = rankAtLeast(c.tier, "legendary") || c.kind === "crown" || c.kind === "joker";
    for (const c of lim.also) { /* jokers beyond the limit never enter the pool */ }
    // hand strength
    const goodC = cands.filter(c => c.side !== "bad" && POINTS[c.tier]);
    const badC = cands.filter(c => c.side === "bad" && POINTS[c.tier]);
    const gs = strengthOf(goodC), bs = strengthOf(badC);
    const gp = strengthPct(norms, p.hero_id, "good", gs), bpct = strengthPct(norms, p.hero_id, "bad", bs);
    const goodSize = sizeFromPct(gp);
    const badSize = Math.min(BAD_SIDE_CAP, sizeFromPct(bpct));
    let size = goodSize + (badSize > goodSize ? 1 : 0);
    size = Math.min(MAX_HAND, Math.max(MIN_HAND, size));
    const mustCount = cands.filter(c => c.must).length;
    size = Math.min(MAX_HAND, Math.max(size, mustCount));
    const seed = hash32(`${m.matchId}:${p.account_id != null ? p.account_id : p.slot}`);
    const rng = mulberry32(seed);
    const hand = select(cands, size, opts, rng);
    const ordered = orderHand(hand, rng);
    const cards = ordered.map((c, i) => finalize(c, i, a, norms));
    const result = {
      status: "dealt", match_id: m.matchId, slot: p.slot, hero_id: p.hero_id, norm_version: norms.index.norm_version,
      result: p.won ? "win" : "loss", hand_size: cards.length, cards, also_earned: alsoEarned,
      strength: { good: gs, bad: bs, good_percentile: gp, bad_percentile: bpct, good_size: goodSize, bad_size: badSize,
        atrocious: bpct >= 0.95 && gp <= 0.30 },
      rank: { badge: a.rank.badge || null, source: a.rank.source, band: a.band == null ? null : norms.index.band_names[a.band].toLowerCase(), lobby_badge: a.lobby || null },
      notes: [], named_hand: namedHand(cards), can_set_records: !p.left,
    };
    if (p.left) result.notes.push("short_handed");
    const stale = stalePatches(norms, opts.patchDates);
    if (stale.length) { result.norms_stale = true; result.notes.push(`norms predate the ${stale[stale.length - 1]} patch: rebuild them`); }
    if (a.gapSteps >= 12) result.notes.push("bad cards softened: the lobby ranked well above this player");
    if (a.rank.source !== "own") result.notes.push(a.rank.source === "lobby" ? "graded against the lobby's average rank" : "no rank on this match: graded against all ranks");
    return result;
  }

  // Norms must be rebuilt after a big economy patch: a table built from games before the patch grades the new economy wrongly.
  // patchDates are ISO dates of big patches. Returns the patches newer than the start of the norms' window.
  function stalePatches(norms, patchDates) {
    const start = norms.index.window && norms.index.window.start_utc;
    if (!start || !patchDates) return [];
    return patchDates.filter(d => d > start);
  }

  function namedHand(cards) {
    const mythGood = cards.filter(c => c.tier === "mythical" && c.side !== "bad").length;
    const mythBad = cards.filter(c => c.tier === "mythical" && c.side === "bad").length;
    const mid = cards.filter(c => c.tier === "middle").length;
    if (mythGood + mythBad >= 2 && mid >= 2) return "Dead Man's Hand";
    if (mythGood && mythBad) return "Ace High, Ace Low";
    if (cards.length >= 13) return "A full suit";
    const bySuit = {};
    for (const c of cards) bySuit[c.suit] = (bySuit[c.suit] || 0) + 1;
    if (Math.max(0, ...Object.values(bySuit)) >= 5) return "Flush";
    return null;
  }

  return { dealMatch, stalePatches, analyze, candidates, reduce, limitJokers, interestOf, strengthOf, strengthPct, sizeFromPct, select, orderHand, hash32, mulberry32,
    constants: { POINTS, INTEREST, SUIT_WEIGHTS, SIZE_STEPS, MAX_HAND, MIN_HAND, BAD_SIDE_CAP, HERO_GUARD } };
});
