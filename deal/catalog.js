"use strict";
// The v1 card list: 45 cards. Pure data plus the rule for each event or Joker. No DOM, no art.
// Browser: window.PM_DEAL_CATALOG. Node: module.exports.
//
//   24 headline stat cards   12 stats, each with a good card and a bad mirror. Full Common to Mythical percentile ladder.
//    1 Crown card            the MVP. Rarity by how far ahead of the lobby the MVP was.
//   12 Jokers                odd and rare moments. Rarity = how often the moment happens (measured, in the norms file).
//    8 event cards           clean, countable feats and mishaps. Print the raw number, rarity = how often it happens.
//   ---
//   45
//
// Held back on purpose (kept in HELD, switched off): Slippery (waits for the damage-taken fix), Piggy Bank and Layaway Plan
// (unspent-souls units are unverified), movement Jokers (the movement codes are unverified), Film Study, Mirror Mirror,
// Early Checkout (never or impossible), Boss Hunter (37% of games, Common only, and the pit zone needs a check).
(function (root, factory) {
  const F = typeof module === "object" && module.exports ? require("./features") : root.PM_DEAL_FEATURES;
  if (typeof module === "object" && module.exports) module.exports = factory(F);
  else root.PM_DEAL_CATALOG = factory(F);
})(typeof self !== "undefined" ? self : this, function (F) {
  const SUITS = ["combat", "survival", "souls", "objectives", "crown", "joker"];

  // ---------- headline stat cards ----------
  // stat: key into the norm tables. dir: high = more is better. weight: bible "headline_weight" (0.8 to 1.2).
  // farm: a bad card here is hidden for supports who were Rare or better at assists or healing (outside review, must fix 4).
  const STAT_CARDS = [
    { id: "hero_damage", stat: "hero_damage", suit: "combat", family: "damage", dir: "high", unit: "damage", weight: 1.1,
      good: { title: "Heavy Artillery", flavor: "Witnesses report a great deal of noise." },
      bad: { title: "Decorative Ammunition", flavor: "The bullets added atmosphere." },
      evidence: { tab: "graphs", graph: "hero_damage" } },
    { id: "kills", stat: "kills", suit: "combat", family: "kills", dir: "high", unit: "kills", weight: 1.1, discrete: true,
      good: { title: "Body Count", flavor: "The scoreboard needed a second column." },
      bad: { title: "Peaceful Protester", flavor: "The enemy team was left unbothered." },
      evidence: { tab: "graphs", graph: "kills" } },
    { id: "assists", stat: "assists", suit: "combat", family: "assists", dir: "high", unit: "assists", weight: 1.0, discrete: true,
      good: { title: "Best Supporting Actor", flavor: "Credited on every fight, billed first on none." },
      bad: { title: "Solo Act", flavor: "The team had its thing. You had yours." },
      evidence: { tab: "graphs", graph: "assists" } },
    { id: "deaths", stat: "deaths", suit: "survival", family: "dying", dir: "low", unit: "deaths", weight: 1.0, discrete: true,
      good: { title: "Hard to Kill", flavor: "The respawn room gathered dust." },
      bad: { title: "Complimentary Respawn Tour", flavor: "You reviewed the spawn room thoroughly." },
      evidence: { tab: "graphs", graph: "deaths" } },
    { id: "healing", stat: "healing", suit: "survival", family: "healing", dir: "high", unit: "healing", weight: 1.0,
      good: { title: "Field Medic", flavor: "Several allies owe you a favor." },
      bad: { title: "Out of Bandages", flavor: "Medical coverage was thin." },
      evidence: { tab: "graphs", graph: "healing" } },
    { id: "mitigated", stat: "mitigated", suit: "survival", family: "tank", dir: "high", unit: "damage mitigated", weight: 0.9,
      good: { title: "Unmoved", flavor: "Incoming damage was noted and declined." },
      bad: { title: "Cardboard Plate", flavor: "Armor was present in spirit." },
      evidence: { tab: "matchups" } },
    { id: "souls", stat: "souls", suit: "souls", family: "farm", dir: "high", unit: "souls", weight: 1.0, farm: true,
      good: { title: "Soul Baron", flavor: "In your case, the economy was thriving." },
      bad: { title: "Economy Class", flavor: "Financial austerity was observed." },
      evidence: { tab: "graphs", graph: "souls" } },
    { id: "souls9", stat: "souls9", suit: "souls", family: "lane", dir: "high", unit: "souls at 9:00", weight: 0.9, farm: true,
      good: { title: "Lane Rich", flavor: "Nine minutes in and already comfortable." },
      bad: { title: "Shoestring Budget", flavor: "The first nine minutes were frugal." },
      evidence: { tab: "graphs", graph: "souls", at_s: 540 } },
    { id: "souls_lost", stat: "souls_lost", suit: "survival", family: "souls_lost", dir: "low", unit: "souls dropped on death", weight: 0.9,
      good: { title: "Bag Secure", flavor: "Nothing of value was left behind." },
      bad: { title: "Everything Must Go", flavor: "Generous donations to the other team." },
      evidence: { tab: "graphs", graph: "souls_lost" } },
    { id: "obj_damage", stat: "obj_damage", suit: "objectives", family: "objectives", dir: "high", unit: "objective damage", weight: 1.0,
      good: { title: "Siege Engine", flavor: "The buildings filed a complaint." },
      bad: { title: "Object Permanence", flavor: "Confirmed: the objectives remained there." },
      evidence: { tab: "graphs", graph: "objective_damage" } },
    { id: "accuracy", stat: "accuracy", suit: "combat", family: "aim", dir: "high", unit: "accuracy", weight: 0.9, percent: true,
      good: { title: "Dead Eye", flavor: "Most of it went where you aimed it." },
      bad: { title: "Warning Shots", flavor: "A legally sufficient number of projectiles went nearby." },
      evidence: { tab: "graphs", graph: "accuracy" } },
    { id: "last_hits", stat: "last_hits", suit: "souls", family: "farm", dir: "high", unit: "last hits", weight: 0.9, farm: true,
      good: { title: "Wave Maestro", flavor: "No trooper left unclaimed." },
      bad: { title: "Wave Observer", flavor: "The troopers expired without assistance." },
      evidence: { tab: "graphs", graph: "last_hits" } },
  ];

  // ---------- held stat cards (switched off; deal with options.enable = ["slippery"]) ----------
  // Slippery: damage taken is low for this hero. Waits for the damage-taken fix, and only counts when the player was in fights at
  // least as much as the lobby's median, so hiding in base never earns it. Good side only (the bad mirror, Open Door Policy, stays cut).
  const HELD_STATS = [
    { id: "slippery", stat: "damage_taken", suit: "survival", family: "slippery", dir: "low", unit: "damage taken", weight: 0.9, goodOnly: true, needsFight: true,
      good: { title: "Slippery", flavor: "Plenty of fights, very little contact." }, bad: { title: "Open Door Policy", flavor: "Everyone was welcome." },
      evidence: { tab: "matchups" } },
  ];

  // ---------- the Crown ----------
  const CROWN = {
    id: "crown", suit: "crown", family: "crown", weight: 1.2,
    titles: {
      default: { title: "The Crown", flavor: "Valve says so, in writing." },
      clean: { title: "Clean Crown", flavor: "One death or fewer. The record is spotless." },
      quiet: { title: "Quiet Crown", flavor: "Won it without the kills. Nobody saw it coming." },
    },
    evidence: { tab: "mvp" },
  };

  // ---------- Jokers and event cards ----------
  // detect(c) gets { m, p, v, g, F, norms, scores, opts }: the match, the player, their stat values, their stat grades,
  // the feature helpers, the norms, the estimated Valve score by slot (or null) and the deal options.
  // It returns null, or { value, unit, line, evidence }.
  const sec = n => `${Math.round(n)} second${Math.round(n) === 1 ? "" : "s"}`;
  const Fh = F;

  const CARDS = [
    // ----- Jokers (odd and rare; rarity by how often it happens) -----
    { id: "absolutely_calculated", kind: "joker", title: "Absolutely Calculated", flavor: "Dead, and still collecting.",
      detect({ m, p }) {
        const ks = Fh.myKills(m, p.slot);
        for (const d of p.deaths_list) for (const k of ks) {
          const dt = k.t - d.t;
          if (dt >= 2 && dt < Math.max(d.dur, 2)) return { value: dt, unit: "seconds after dying", line: `A kill landed ${sec(dt)} after you died.`, evidence: { tab: "graphs", graph: "kills", at_s: k.t } };
        }
        return null;
      } },
    { id: "scenic_route", kind: "joker", title: "The Scenic Route", flavor: "The map was seen. Thoroughly.", needs: "paths",
      detect({ m, p, norms }) {
        const dist = Fh.pathDistance(m, p.slot);
        const cal = norms.index.calibration && norms.index.calibration.scenic;
        if (dist == null || !cal || !m.duration) return null;
        const med = cal.dpm_median[p.hero_id];
        if (!med) return null;
        const ratio = (dist / (m.duration / 60)) / med;
        if (ratio < cal.ratio_cut) return null;
        const mate = norms.median(p.hero_id, "takedowns", m.duration);
        if (mate == null || p.raw.kills + p.raw.assists < mate) return null;
        return { value: Math.round(dist), unit: "units travelled", line: `${(dist / 1e6).toFixed(2)} million units travelled, and still in the fight.`, evidence: { tab: "graphs" } };
      } },
    { id: "the_uncrowned", kind: "joker", title: "The Uncrowned", flavor: "Highest score in the lobby. The paperwork says otherwise.", needs: "scores",
      detect({ p, scores }) {
        if (!scores || p.won) return null;
        const mine = scores.get(p.slot);
        if (mine == null) return null;
        let best = -Infinity, rival = -Infinity;
        for (const [s, v] of scores) { if (s === p.slot) continue; if (v > rival) rival = v; }
        best = mine;
        if (!(best > rival)) return null;
        return { value: Math.round((best - rival) * 10) / 10, unit: "score ahead", line: "Top estimated score of all twelve players, on the losing team.", evidence: { tab: "mvp" } };
      } },
    { id: "return_to_sender", kind: "joker", title: "Return to Sender", flavor: "Whoever did this was dealt with, promptly.",
      detect({ m, p }) {
        const ks = Fh.myKills(m, p.slot);
        for (const d of p.deaths_list) for (const k of ks) {
          if (k.victim === d.killer && k.t >= d.t && k.t - d.t <= 30) return { value: k.t - d.t, unit: "seconds later", line: `You got your killer ${sec(k.t - d.t)} after they got you.`, evidence: { tab: "graphs", graph: "kills", at_s: k.t } };
        }
        return null;
      } },
    { id: "mutually_assured", kind: "joker", title: "Mutually Assured Destruction", flavor: "Both parties were unavailable for comment.",
      detect({ m, p }) {
        const ks = Fh.myKills(m, p.slot);
        let trades = 0;
        for (const d of p.deaths_list) if (ks.some(k => Math.abs(k.t - d.t) <= 3)) trades++;
        if (trades < 2) return null;
        return { value: trades, unit: "trades", line: `${trades} times you and an enemy fell within three seconds of each other.`, evidence: { tab: "graphs", graph: "deaths" } };
      } },
    { id: "one_hp", kind: "joker", title: "One HP and a Dream", flavor: "Close calls, every one of them survived.", needs: "paths",
      detect({ m, p }) {
        const n = Fh.escapes(m, p);
        if (n == null || n < 3) return null;
        return { value: n, unit: "escapes", line: `${n} times at 10% health or less, and back above half without dying.`, evidence: { tab: "graphs" } };
      } },
    { id: "cash_poor", kind: "joker", title: "Cash Poor, Spirit Rich", flavor: "Light in the pockets, heavy in the output.",
      detect({ g, v }) {
        const s = g.souls, o = g.output;
        if (!s || !o) return null;
        if (s.side !== "bad" || s.share > 0.25 || o.side !== "good" || o.share > 0.10) return null;
        return { value: v.output, unit: "damage and healing", line: `Bottom ${pctText(s.share)} in souls, top ${pctText(o.share)} in damage and healing.`, evidence: { tab: "mvp" } };
      } },
    { id: "personal_vendetta", kind: "joker", title: "Personal Vendetta", flavor: "Most of the damage had one name on it.", needs: "matrix",
      detect({ m, p }) {
        const d = Fh.damageByTarget(m, p.slot);
        if (!d) return null;
        let tot = 0, top = 0, who = null;
        for (const [slot, x] of Object.entries(d)) { const s = Number(slot); const o = m.bySlot.get(s); if (!o || o.team === p.team) continue; tot += x; if (x > top) { top = x; who = s; } }
        if (tot < 8000 || top / tot < 0.6) return null;
        return { value: Math.round(top / tot * 100), unit: "% of your damage", line: `${Math.round(top / tot * 100)}% of your hero damage went to one enemy.`, target_slot: who, evidence: { tab: "matchups" } };
      } },
    { id: "palindrome", kind: "joker", title: "Palindrome", flavor: "Read it backwards. Same line.",
      detect({ p }) {
        const k = p.raw.kills, d = p.raw.deaths, a = p.raw.assists;
        if (k < 2 || k !== a || d !== 2 * k) return null;
        return { value: `${k}/${d}/${a}`, unit: "K/D/A", line: `${k}/${d}/${a}. It reads the same both ways.`, evidence: { tab: "graphs" } };
      } },
    { id: "buyers_remorse", kind: "joker", title: "Buyer's Remorse", flavor: "Several purchases were reconsidered within the minute.",
      detect({ p }) {
        const n = (p.raw.items || []).filter(i => i.sold_time_s > 0 && i.sold_time_s - i.game_time_s <= 60).length;
        if (n < 3) return null;
        return { value: n, unit: "items sold within a minute", line: `${n} items were sold less than a minute after they were bought.`, evidence: { tab: "graphs" } };
      } },
    { id: "everyone_gets_one", kind: "joker", title: "Everyone Gets One", flavor: "Every member of the other team, once.",
      detect({ m, p }) {
        const enemies = m.players.filter(x => x.team !== p.team);
        if (enemies.length < 4) return null;
        const got = new Set(Fh.myKills(m, p.slot).map(k => k.victim));
        if (!enemies.every(x => got.has(x.slot))) return null;
        return { value: enemies.length, unit: "different enemies", line: `You took down all ${enemies.length} enemies at least once.`, evidence: { tab: "graphs", graph: "kills" } };
      } },
    { id: "last_one_standing", kind: "joker", title: "Last One Standing", flavor: "Everyone else was resting. You were not.",
      detect({ m, p }) {
        const wins = Fh.lastStandWindows(m, p);
        if (!wins.length) return null;
        const ks = Fh.myKills(m, p.slot);
        for (const [a, b] of wins) {
          const k = ks.find(x => x.t >= a && x.t <= b);
          if (k) return { value: Math.round(k.t - a), unit: "seconds alone", line: "Every teammate was dead, and you were still taking people down.", evidence: { tab: "graphs", graph: "kills", at_s: k.t } };
        }
        return null;
      } },

    // ----- event cards (clean feats and mishaps; print the number; rarity = how often it happens) -----
    { id: "hat_trick", kind: "event", suit: "combat", family: "kills", title: "Hat Trick", flavor: "Three, in quick succession.",
      detect({ m, p }) {
        const n = Fh.bestChain(Fh.myKills(m, p.slot).map(k => k.t), 10);
        return n >= 3 ? { value: n, unit: "kills in a row, ten seconds apart or less", line: `${n} kills, each within ten seconds of the last.`, evidence: { tab: "graphs", graph: "kills" } } : null;
      } },
    { id: "four_course_meal", kind: "event", suit: "combat", family: "kills", title: "Four Course Meal", flavor: "Served in order, without a pause.",
      detect({ m, p }) {
        const n = Fh.bestChain(Fh.myKills(m, p.slot).map(k => k.t), 10);
        return n >= 4 ? { value: n, unit: "kills in a row, ten seconds apart or less", line: `${n} kills, each within ten seconds of the last.`, evidence: { tab: "graphs", graph: "kills" } } : null;
      } },
    { id: "first_blood", kind: "event", suit: "combat", family: "first", title: "First Blood", flavor: "The first entry in the ledger is yours.",
      detect({ m, p }) {
        const k = m.kills[0];
        return k && k.killer === p.slot ? { value: k.t, unit: "seconds in", line: `You took the first kill of the match, at ${Math.floor(k.t / 60)}:${String(k.t % 60).padStart(2, "0")}.`, evidence: { tab: "graphs", graph: "kills", at_s: k.t } } : null;
      } },
    { id: "haymaker", kind: "event", suit: "combat", family: "melee", title: "Haymaker", flavor: "Close range. Closer than advised.",
      detect({ p }) {
        const n = Fh.num(p.fin.melee_kills);
        return n >= 2 ? { value: n, unit: "melee kills", line: `${n} kills with a melee swing.`, evidence: { tab: "graphs", graph: "kills" } } : null;
      } },
    { id: "last_word", kind: "event", suit: "combat", family: "first", title: "Last Word", flavor: "Someone had to close the book.",
      detect({ m, p }) {
        const k = m.kills[m.kills.length - 1];
        return k && k.killer === p.slot ? { value: k.t, unit: "seconds in", line: `You took the last kill of the match, at ${Math.floor(k.t / 60)}:${String(k.t % 60).padStart(2, "0")}.`, evidence: { tab: "graphs", graph: "kills", at_s: k.t } } : null;
      } },
    { id: "frequent_customer", kind: "event", side: "bad", suit: "survival", family: "dying", title: "Frequent Customer", flavor: "Loyalty program status: Platinum.",
      detect({ p }) {
        const by = {};
        for (const d of p.deaths_list) by[d.killer] = (by[d.killer] || 0) + 1;
        const top = Math.max(0, ...Object.values(by));
        return top >= 4 ? { value: top, unit: "deaths to one enemy", line: `The same enemy took you down ${top} times.`, evidence: { tab: "graphs", graph: "deaths" } } : null;
      } },
    { id: "opening_night", kind: "event", side: "bad", suit: "survival", family: "dying", title: "Opening Night", flavor: "First through the door.",
      detect({ m, p }) {
        const d = m.allDeaths[0];
        return d && d.victim === p.slot ? { value: d.t, unit: "seconds in", line: `First death of the match, at ${Math.floor(d.t / 60)}:${String(d.t % 60).padStart(2, "0")}.`, evidence: { tab: "graphs", graph: "deaths", at_s: d.t } } : null;
      } },
    { id: "revolving_door", kind: "event", side: "bad", suit: "survival", family: "dying", title: "Revolving Door", flavor: "Three visits in three minutes.",
      detect({ p }) {
        const ds = p.deaths_list;
        for (let i = 0; i + 2 < ds.length; i++) if (ds[i + 2].t - ds[i].t <= 180) return { value: 3, unit: "deaths in three minutes", line: `Three deaths inside three minutes, starting at ${Math.floor(ds[i].t / 60)}:${String(ds[i].t % 60).padStart(2, "0")}.`, evidence: { tab: "graphs", graph: "deaths", at_s: ds[i].t } };
        return null;
      } },
  ];

  function pctText(share) {
    const x = share * 100;
    return (x >= 10 ? Math.round(x) : x >= 1 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100) + "%";
  }

  // Switched off, with the reason. These are not part of the 45.
  const HELD = [
    { id: "slippery", reason: "needs the damage-taken fix; also needs fight participation at or above the median so hiding never earns it" },
    { id: "piggy_bank", reason: "unspent-souls minutes look like the wrong units" },
    { id: "layaway_plan", reason: "unspent ability point minutes look like the wrong units" },
    { id: "boss_hunter", reason: "37% of games, so Common at best; the Mid Boss pit zone needs a check" },
    { id: "movement_jokers", reason: "9 movement codes in the data, 8 in the catalog" },
    { id: "film_study", reason: "the watched-replays list is empty in every match" },
    { id: "mirror_mirror", reason: "duplicate heroes cannot happen" },
    { id: "early_checkout", reason: "never fired" },
    { id: "parry_this", reason: "the custom stat id for parries is unverified (the id we guessed counts 20 or more in 42% of players, so it is not parries); Last Word takes its slot" },
  ];

  return { SUITS, STAT_CARDS, HELD_STATS, CROWN, CARDS, HELD, pctText,
    count: STAT_CARDS.length * 2 + 1 + CARDS.length };
});
