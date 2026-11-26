"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const N = require("../../deal/norms");
const F = require("../../deal/features");
const C = require("../../deal/catalog");
const E = require("../../deal/engine");
const { makeNorms, makeMatch, atTop, atBottom, PGRID } = require("./helpers");

const HERO = 10;
const norms = (cards, n) => makeNorms([HERO], cards, n);
const deal = (match, nrm, opts) => E.dealMatch(match, 1, nrm || norms(), opts || {});
const byId = (hand, id) => hand.cards.find(c => c.card_id === id);

// ---------- the percentile ladder ----------
test("the ladder: Common 40, Rare 25, Epic 10, Legendary 1, Mythical 0.1, all from one big set", () => {
  const nrm = norms();
  const tier = share => N.grade(nrm, HERO, "hero_damage", atTop("hero_damage", share), 1800, null, { dir: "high" });
  assert.equal(tier(0.35).tier, "common");
  assert.equal(tier(0.20).tier, "rare");
  assert.equal(tier(0.08).tier, "epic");
  assert.equal(tier(0.008).tier, "legendary");
  assert.equal(tier(0.0008).tier, "mythical");
  assert.equal(tier(0.5).side, "middle");
});

test("a top 0.3% headline stat is a Legendary, never a Rare", () => {
  const g = N.grade(norms(), HERO, "hero_damage", atTop("hero_damage", 0.003), 1800, null, { dir: "high" });
  assert.equal(g.side, "good");
  assert.equal(g.tier, "legendary");
  assert.ok(g.share <= 0.0035 && g.share > 0.002, `printed share ${g.share}`);
});

test("bad cards mirror the ladder at the bottom, and lower-is-better stats flip", () => {
  const nrm = norms();
  const bad = N.grade(nrm, HERO, "hero_damage", atBottom("hero_damage", 0.08), 1800, null, { dir: "high" });
  assert.deepEqual([bad.side, bad.tier], ["bad", "epic"]);
  const fewDeaths = N.grade(nrm, HERO, "deaths", atBottom("deaths", 0.0008), 1800, null, { dir: "low" });
  assert.deepEqual([fewDeaths.side, fewDeaths.tier], ["good", "mythical"]);
  const manyDeaths = N.grade(nrm, HERO, "deaths", atTop("deaths", 0.08), 1800, null, { dir: "low" });
  assert.deepEqual([manyDeaths.side, manyDeaths.tier], ["bad", "epic"]);
});

test("tail rule: a set under 1,000 games cannot make a Legendary, under 10,000 cannot make a Mythical", () => {
  const v = atTop("hero_damage", 0.0005);
  assert.equal(N.grade(makeNorms([HERO], {}, 50000), HERO, "hero_damage", v, 1800, null, { dir: "high" }).tier, "mythical");
  assert.equal(N.grade(makeNorms([HERO], {}, 5000), HERO, "hero_damage", v, 1800, null, { dir: "high" }).tier, "legendary");
  assert.equal(N.grade(makeNorms([HERO], {}, 500), HERO, "hero_damage", v, 1800, null, { dir: "high" }).tier, "epic");
  assert.equal(N.grade(makeNorms([HERO], {}, 100), HERO, "hero_damage", v, 1800, null, { dir: "high" }), null);
});

test("ties count against you for whole-number stats", () => {
  // 10% of games had 9 kills or more would be the 90th cutoff; a player on exactly the cutoff is not in the top 10%
  const q = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 7, 8, 9, 9, 10, 10, 12];
  const share = N.topShare(q, PGRID, 7, true);
  assert.ok(share > 0.10, `share ${share}`);
  assert.equal(N.topShare(q, PGRID, 7.5, true), 1 - PGRID[16]);
});

test("length: cutoffs follow the match length between bucket centres and scale per minute past the ends", () => {
  const nrm = norms();
  const short = N.resolve(nrm.index, nrm.heroes[HERO], "hero_damage", 600, null, 150);
  const mid = N.resolve(nrm.index, nrm.heroes[HERO], "hero_damage", 1800, null, 150);
  assert.ok(Math.abs(short.q[11] / mid.q[11] - 600 / 922.74) < 1e-9);
  assert.equal(mid.set, "hero+length");
});

test("rank: the player's own band is used, and a band set is preferred when it has enough games", () => {
  const nrm = norms();
  assert.equal(N.resolve(nrm.index, nrm.heroes[HERO], "kills", 1800, 2, 1000).set, "hero+length+rank");
  assert.equal(N.resolve(nrm.index, nrm.heroes[HERO], "kills", 1800, null, 1000).set, "hero+length");
  assert.equal(N.bandOf(72, nrm.index.band_edges), 1);
  assert.equal(N.bandOf(106, nrm.index.band_edges), 3);
  assert.equal(N.bandOf(0, nrm.index.band_edges), null);
});

test("rank: a thin band set falls back to the whole hero set, moved by the band's usual shift", () => {
  const nrm = norms();
  const st = nrm.heroes[HERO].stats.kills;
  st.L0[3] = st.L0[3].map(() => null);                 // no top-band games for this length
  st.P.b[3] = { n: 5000, q: st.P.all.q.map(x => x * 1.5) };
  const r = N.resolve(nrm.index, nrm.heroes[HERO], "kills", 1800, 3, 150);
  assert.equal(r.set, "hero+length (rank-adjusted)");
  assert.ok(Math.abs(r.shifted - 1.5) < 1e-9);
});

// ---------- features ----------
test("rank source: own badge first, then the lobby average, then none", () => {
  const own = F.buildMatch(makeMatch({ badge: 72 }));
  assert.deepEqual(F.rankInfo(own, own.bySlot.get(1)), { badge: 72, source: "own" });
  const lobby = F.buildMatch(makeMatch({ lobby0: 61, lobby1: 71 }));
  const info = F.rankInfo(lobby, lobby.bySlot.get(1));
  assert.equal(info.source, "lobby");
  assert.equal(Math.floor(info.badge / 10), 6);
  const none = F.buildMatch(makeMatch());
  assert.equal(F.rankInfo(none, none.bySlot.get(1)).source, "none");
});

test("event detectors read the kill and death timeline", () => {
  const dd = (t, killer, dur = 20) => ({ game_time_s: t, killer_player_slot: killer, death_duration_s: dur });
  const m = F.buildMatch(makeMatch({ deaths: {
    7: [dd(100, 1), dd(300, 1)], 8: [dd(105, 1), dd(110, 1)], 9: [dd(500, 1)], 2: [dd(200, 7), dd(220, 7), dd(240, 7), dd(260, 7), dd(280, 9)],
    10: [dd(640, 1)], 11: [dd(130, 1)] } }));
  const ks = F.myKills(m, 1).map(k => k.t);
  assert.deepEqual(ks, [100, 105, 110, 130, 300, 500, 640]);
  assert.equal(F.bestChain(ks, 10), 3);                         // 100, 105, 110 then 130 is 20 s away
  assert.equal(F.bestChain([100, 105, 110, 118], 10), 4);
  const ctx = { m, p: m.bySlot.get(2), v: {}, g: {}, norms: {}, opts: {} };
  assert.equal(C.CARDS.find(c => c.id === "frequent_customer").detect(ctx).value, 4);
  const first = C.CARDS.find(c => c.id === "first_blood").detect({ m, p: m.bySlot.get(1) });
  assert.equal(first.value, 100);
  assert.equal(C.CARDS.find(c => c.id === "first_blood").detect({ m, p: m.bySlot.get(3) }), null);
  assert.equal(C.CARDS.find(c => c.id === "hat_trick").detect({ m, p: m.bySlot.get(1) }).value, 3);
  assert.equal(C.CARDS.find(c => c.id === "four_course_meal").detect({ m, p: m.bySlot.get(1) }), null);
});

test("Absolutely Calculated needs the kill to land at least 2 seconds after the death, while still dead", () => {
  const dd = (t, killer, dur) => ({ game_time_s: t, killer_player_slot: killer, death_duration_s: dur });
  const detect = c => C.CARDS.find(x => x.id === "absolutely_calculated").detect(c);
  // slot 1 dies at 100 (30 s timer) and slot 7 dies to slot 1 at 105
  let m = F.buildMatch(makeMatch({ deaths: { 1: [dd(100, 7, 30)], 7: [dd(105, 1, 20)] } }));
  assert.equal(detect({ m, p: m.bySlot.get(1) }).value, 5);
  // same second does not count
  m = F.buildMatch(makeMatch({ deaths: { 1: [dd(100, 7, 30)], 7: [dd(101, 1, 20)] } }));
  assert.equal(detect({ m, p: m.bySlot.get(1) }), null);
  // after respawn it is just a kill
  m = F.buildMatch(makeMatch({ deaths: { 1: [dd(100, 7, 30)], 7: [dd(140, 1, 20)] } }));
  assert.equal(detect({ m, p: m.bySlot.get(1) }), null);
});

test("Last One Standing needs every teammate dead at once and a kill in that window", () => {
  const dd = (t, killer, dur) => ({ game_time_s: t, killer_player_slot: killer, death_duration_s: dur });
  const mates = {}; for (const s of [2, 3, 4, 5, 6]) mates[s] = [dd(200 + s, 7, 40)];
  mates[7] = [dd(230, 1, 20)];                                     // slot 1 kills slot 7 at 230 while all five mates are dead
  const m = F.buildMatch(makeMatch({ deaths: mates }));
  const hit = C.CARDS.find(x => x.id === "last_one_standing").detect({ m, p: m.bySlot.get(1) });
  assert.ok(hit);
  const m2 = F.buildMatch(makeMatch({ deaths: Object.assign({}, mates, { 7: [dd(300, 1, 20)] }) }));
  assert.equal(C.CARDS.find(x => x.id === "last_one_standing").detect({ m: m2, p: m2.bySlot.get(1) }), null);
});

test("Palindrome, Buyer's Remorse and Everyone Gets One", () => {
  const m = F.buildMatch(makeMatch({ me: { kills: 6, deaths: 12, assists: 6 }, items: { 1: [1, 2, 3].map(i => ({ game_time_s: 100 * i, sold_time_s: 100 * i + 30 })) } }));
  const p = m.bySlot.get(1);
  assert.equal(C.CARDS.find(x => x.id === "palindrome").detect({ p }).value, "6/12/6");
  assert.equal(C.CARDS.find(x => x.id === "buyers_remorse").detect({ p }).value, 3);
  const dd = s => ({ game_time_s: 100 + s, killer_player_slot: 1, death_duration_s: 20 });
  const all = {}; for (const s of [7, 8, 9, 10, 11, 12]) all[s] = [dd(s)];
  const m2 = F.buildMatch(makeMatch({ deaths: all }));
  assert.ok(C.CARDS.find(x => x.id === "everyone_gets_one").detect({ m: m2, p: m2.bySlot.get(1) }));
  delete all[12];
  const m3 = F.buildMatch(makeMatch({ deaths: all }));
  assert.equal(C.CARDS.find(x => x.id === "everyone_gets_one").detect({ m: m3, p: m3.bySlot.get(1) }), null);
});

// ---------- the dealer ----------
const jokerRates = { absolutely_calculated: { rate: 0.03 }, hat_trick: { rate: 0.024 }, first_blood: { rate: 0.083 }, frequent_customer: { rate: 0.22 }, opening_night: { rate: 0.085 } };

test("canceled, short, custom and unknown-player matches are not dealt", () => {
  const nrm = norms();
  assert.equal(deal(makeMatch({ mi: { match_outcome: 1 } }), nrm).reason, "canceled");
  assert.equal(deal(makeMatch({ mi: { game_mode: 4 } }), nrm).reason, "unsupported_mode");
  assert.equal(deal(makeMatch({ mi: { match_mode: 2 } }), nrm).reason, "custom_or_bot_lobby");
  assert.equal(deal(makeMatch({ mi: { bot_difficulty: 2 } }), nrm).reason, "custom_or_bot_lobby");
  assert.equal(deal(makeMatch({ duration_s: 300 }), nrm).reason, "too_short");
  assert.equal(E.dealMatch(makeMatch(), 99, nrm, {}).reason, "player_not_in_match");
  assert.equal(E.dealMatch(makeMatch({ hero_id: 77 }), 1, nrm, {}).reason, "no_norms_for_hero");
  const canceled = deal(makeMatch({ mi: { match_outcome: 1 } }), nrm);
  assert.equal(canceled.status, "not_dealt");
  assert.equal(canceled.cards.length, 0);
  assert.match(canceled.message, /canceled/);
});

function bigGame(extra) {
  return makeMatch(Object.assign({ me: { kills: 19, deaths: 2, assists: 25, net_worth: atTop("souls", 0.02), player_damage: atTop("hero_damage", 0.004), boss_damage: atTop("obj_damage", 0.05),
    damage_mitigated: atTop("mitigated", 0.06) } }, extra));
}

test("a hand has 4 to 13 cards, never repeats a card or a family on one side", () => {
  const h = deal(bigGame(), norms(jokerRates));
  assert.equal(h.status, "dealt");
  assert.ok(h.cards.length >= 4 && h.cards.length <= 13, `size ${h.cards.length}`);
  const ids = h.cards.map(c => c.card_id);
  assert.equal(new Set(ids).size, ids.length);
  const fam = h.cards.map(c => c.family + "|" + (c.side === "bad" ? "bad" : "good"));
  assert.equal(new Set(fam).size, fam.length, fam.join(","));
});

test("Legendary and Mythical cards, good and bad, are always dealt", () => {
  const h = deal(makeMatch({ me: { player_damage: atTop("hero_damage", 0.0004), net_worth: atBottom("souls", 0.0006), kills: 1, assists: 1 } }), norms());
  const dmg = byId(h, "stat.hero_damage"), eco = byId(h, "stat.souls");
  assert.equal(dmg.tier, "mythical");
  assert.equal(dmg.side, "good");
  assert.equal(eco.tier, "mythical");
  assert.equal(eco.side, "bad");
  // two Aces and two filler 8s is also Dead Man's Hand; with real catalogs the filler 8s do not appear
  assert.ok(["Ace High, Ace Low", "Dead Man's Hand"].includes(h.named_hand), h.named_hand);
});

test("P30: damage-type cards share one family, so one damage card per hand", () => {
  const h = deal(bigGame(), norms({ hat_trick: { rate: 0.03 } }));
  const kinds = h.cards.filter(c => c.family === "kills");
  assert.ok(kinds.length <= 1);
});

test("P30: the second card of a family goes to 'also'", () => {
  const a = { family: "kills", side: "good", tier: "epic", share: 0.05, weight: 1.1, kind: "stat", card_id: "stat.kills", id: "kills.good", title: "Body Count" };
  const b = { family: "kills", side: "good", tier: "rare", share: 0.2, weight: 1, kind: "event", card_id: "event.hat_trick", id: "hat_trick", title: "Hat Trick" };
  const c = { family: "kills", side: "bad", tier: "rare", share: 0.2, weight: 1, kind: "stat", card_id: "stat.kills", id: "kills.bad", title: "Peaceful Protester" };
  const r = E.reduce([b, a, c], {});
  assert.equal(r.kept.length, 2);
  assert.equal(r.kept.find(x => x.side === "good").id, "kills.good");
  assert.equal(r.kept.find(x => x.side === "good").also[0].title, "Hat Trick");
});

test("P32: one Joker per hand unless the top two are both Legendary or better", () => {
  const J = (id, tier, interest) => ({ id, kind: "joker", tier, interest, side: "odd", card_id: "joker." + id });
  assert.deepEqual(E.limitJokers([J("a", "epic", 5), J("b", "rare", 3)]).list.map(c => c.id), ["a"]);
  assert.deepEqual(E.limitJokers([J("a", "legendary", 5), J("b", "epic", 4)]).list.map(c => c.id), ["a"]);
  assert.deepEqual(E.limitJokers([J("a", "legendary", 5), J("b", "mythical", 4)]).list.map(c => c.id).sort(), ["a", "b"]);
  assert.deepEqual(E.limitJokers([J("a", "epic", 5), J("b", "rare", 3)]).also.map(c => c.id), ["b"]);
});

test("a Joker needs its detector to fire and a measured rate, and keeps one slot in the hand", () => {
  const dd = (t, killer, dur) => ({ game_time_s: t, killer_player_slot: killer, death_duration_s: dur });
  const match = bigGame({ deaths: { 1: [dd(100, 7, 30)], 7: [dd(105, 1, 20)] } });
  const withCal = deal(match, norms(jokerRates));
  const j = byId(withCal, "joker.absolutely_calculated");
  assert.ok(j, "Absolutely Calculated is dealt");
  assert.equal(j.suit, "joker");
  assert.equal(j.tier, "epic");                                   // 3% of games
  assert.equal(byId(deal(match, norms({})), "joker.absolutely_calculated"), undefined);
});

test("the hero guard switches off a card that fires in over 25% (Joker) or 40% (event) of one hero's games", () => {
  const dd = (t, killer, dur) => ({ game_time_s: t, killer_player_slot: killer, death_duration_s: dur });
  const match = bigGame({ deaths: { 1: [dd(100, 7, 30)], 7: [dd(105, 1, 20)] } });
  const guarded = { absolutely_calculated: { rate: 0.03, by_hero: { [HERO]: { rate: 0.3, n: 500 } } } };
  assert.equal(byId(deal(match, norms(guarded)), "joker.absolutely_calculated"), undefined);
  const ok = { absolutely_calculated: { rate: 0.03, by_hero: { [HERO]: { rate: 0.2, n: 500 } } } };
  assert.ok(byId(deal(match, norms(ok)), "joker.absolutely_calculated"));
});

test("Joker and event rarity follows how often they happen", () => {
  assert.equal(N.tierOfShare(0.0005, "joker"), "mythical");
  assert.equal(N.tierOfShare(0.005, "joker"), "legendary");
  assert.equal(N.tierOfShare(0.05, "joker"), "epic");
  assert.equal(N.tierOfShare(0.2, "joker"), "rare");
  assert.equal(N.tierOfShare(0.3, "joker"), null);                 // no Common Jokers
  assert.equal(N.tierOfShare(0.3, "event"), "common");
  assert.equal(N.tierOfShare(0.5, "event"), null);
});

test("supports with a Rare or better assists line get no bad farm cards", () => {
  const me = { kills: 1, deaths: 4, assists: atTop("assists", 0.10), net_worth: atBottom("souls", 0.04), souls9: atBottom("souls9", 0.04), last_hits: atBottom("last_hits", 0.02), player_damage: 12000 };
  const sup = deal(makeMatch({ me }), norms());
  assert.equal(sup.cards.some(c => c.side === "bad" && (c.card_id === "stat.souls" || c.card_id === "stat.souls9" || c.card_id === "stat.last_hits")), false);
  const nonSup = deal(makeMatch({ me: Object.assign({}, me, { assists: 5 }) }), norms());
  assert.equal(nonSup.cards.some(c => c.side === "bad" && (c.card_id === "stat.souls" || c.card_id === "stat.last_hits")), true);
});

test("bad cards soften when the lobby ranks well above the player", () => {
  const me = { net_worth: atBottom("souls", 0.04), kills: 6 };
  const even = deal(makeMatch({ me, badge: 72, lobby0: 72, lobby1: 72 }), norms());
  const tough = deal(makeMatch({ me, badge: 42, lobby0: 72, lobby1: 72 }), norms());       // 3 tiers up: one step softer
  const brutal = deal(makeMatch({ me, badge: 42, lobby0: 92, lobby1: 92 }), norms());      // 5 tiers up: two steps softer
  assert.equal(byId(even, "stat.souls").tier, "epic");
  assert.equal(byId(tough, "stat.souls").tier, "rare");
  assert.equal(byId(brutal, "stat.souls").tier, "common");
  assert.ok(tough.notes.some(n => /softened/.test(n)));
});

test("bad cards are always on: an awful game is told so", () => {
  const h = deal(makeMatch({ me: { kills: 0, deaths: 14, assists: 1, net_worth: atBottom("souls", 0.02), player_damage: atBottom("hero_damage", 0.03), boss_damage: 0 } }), norms());
  assert.ok(h.cards.filter(c => c.side === "bad").length >= 3);
});

test("P35 silver lining: one good card survives a terrible game when a Rare or better one exists", () => {
  const h = deal(makeMatch({ me: { kills: 0, deaths: 14, assists: 1, net_worth: atBottom("souls", 0.02), player_damage: atBottom("hero_damage", 0.03), boss_damage: atTop("obj_damage", 0.2),
    last_hits: atBottom("last_hits", 0.01), souls9: atBottom("souls9", 0.02) } }), norms());
  assert.ok(h.cards.some(c => c.side !== "bad"), "no good card");
});

test("relief card: a bad game with no Rare good card still gets its best good Common, never an all-bad hand", () => {
  const h = deal(makeMatch({ me: { kills: atTop("kills", 0.35), deaths: atTop("deaths", 0.02), assists: atBottom("assists", 0.02), net_worth: atBottom("souls", 0.02),
    player_damage: atBottom("hero_damage", 0.03), boss_damage: atBottom("obj_damage", 0.03), last_hits: atBottom("last_hits", 0.02), souls9: atBottom("souls9", 0.02) } }), norms());
  assert.ok(h.cards.some(c => c.side !== "bad"), "all bad");
});

test("no candidates at all still gives a hand of at least four (Common and Middle filler)", () => {
  const h = deal(makeMatch({ me: { kills: 10, deaths: 6, assists: 15, net_worth: 25000, player_damage: 20000, boss_damage: 5000, last_hits: 150, souls9: 3000 } }), norms());
  assert.ok(h.cards.length >= 4);
});

test("suits are softly down-weighted, not capped: a Combat-heavy game still finishes with other suits in the hand", () => {
  const me = { kills: atTop("kills", 0.05), assists: atTop("assists", 0.07), player_damage: atTop("hero_damage", 0.06), shots_hit: 700, shots_missed: 300,
    net_worth: atTop("souls", 0.09), boss_damage: atTop("obj_damage", 0.1), deaths: atBottom("deaths", 0.08) };
  const h = deal(makeMatch({ me }), norms());
  assert.ok(new Set(h.cards.map(c => c.suit)).size >= 3, h.cards.map(c => c.suit).join(","));
});

test("the soft weights are exactly 1.0, 0.85, 0.60, 0.35", () => {
  assert.deepEqual(E.constants.SUIT_WEIGHTS, [1.0, 0.85, 0.60, 0.35]);
  assert.deepEqual(E.constants.POINTS, { common: 0, rare: 1, epic: 2, legendary: 4, mythical: 6 });
});

test("hand size follows hand strength against the calibration, and the bad side adds at most one card", () => {
  assert.equal(E.sizeFromPct(0.10), 4);
  assert.equal(E.sizeFromPct(0.45), 5);
  assert.equal(E.sizeFromPct(0.70), 6);
  assert.equal(E.sizeFromPct(0.85), 7);
  assert.equal(E.sizeFromPct(0.95), 8);
  assert.equal(E.sizeFromPct(0.975), 9);
  assert.equal(E.sizeFromPct(0.985), 10);
  assert.equal(E.sizeFromPct(0.9925), 11);
  assert.equal(E.sizeFromPct(0.997), 12);
  assert.equal(E.sizeFromPct(0.9995), 13);
  const h = deal(bigGame(), norms(jokerRates));
  assert.ok(h.hand_size <= h.strength.good_size + 1 || h.cards.filter(c => c.tier === "legendary" || c.tier === "mythical" || c.kind === "crown" || c.kind === "joker").length > h.strength.good_size);
});

test("strength weights: a single Mythical is 6 points, not 30", () => {
  assert.equal(E.strengthOf([{ tier: "mythical" }, { tier: "rare" }, { tier: "common" }]), 7);
});

test("the Crown: Valve's MVP gets it, graded Epic by default, with the Clean Crown title for one death or fewer", () => {
  const h = deal(makeMatch({ mvp: 1, me: { deaths: 1 } }), norms());
  const c = byId(h, "crown");
  assert.equal(c.tier, "epic");
  assert.equal(c.title, "Clean Crown");
  assert.equal(c.suit, "crown");
  assert.equal(byId(deal(makeMatch({ mvp: 2 }), norms()), "crown"), undefined);
  const scores = new Map(Array.from({ length: 12 }, (_, i) => [i + 1, i === 0 ? 40 : 20]));
  const big = deal(makeMatch({ mvp: 1 }), norms(), { scores });
  assert.equal(byId(big, "crown").tier, "mythical");               // margin 20 over the mythical cutoff (15)
});

test("P5 damping only touches Common to Epic and never a NEW BEST", () => {
  const base = { id: "x", card_id: "stat.kills", tier: "epic", share: 0.05, weight: 1, kind: "stat" };
  const history = [["stat.kills"], ["stat.kills", "x"], { card_ids: ["stat.kills"] }];
  const plain = E.interestOf(Object.assign({}, base), {});
  assert.ok(Math.abs(E.interestOf(Object.assign({}, base), { history }) - plain * 0.7) < 1e-9);
  assert.equal(E.interestOf(Object.assign({}, base, { new_best: true }), { history }), E.interestOf(Object.assign({}, base, { new_best: true }), {}));
  const leg = Object.assign({}, base, { tier: "legendary", share: 0.005 });
  assert.equal(E.interestOf(leg, { history }), E.interestOf(leg, {}));
  assert.equal(E.interestOf(Object.assign({}, base), { history: history.slice(0, 2) }), plain);
});

test("order is random but fixed: the same match and player always deal the same order, a different match deals another", () => {
  const nrm = norms(jokerRates);
  const a = deal(bigGame({ match_id: 777 }), nrm), b = deal(bigGame({ match_id: 777 }), nrm), c = deal(bigGame({ match_id: 778 }), nrm);
  assert.deepEqual(a.cards.map(x => x.card_id), b.cards.map(x => x.card_id));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const sameSet = [...a.cards.map(x => x.card_id)].sort().join() === [...c.cards.map(x => x.card_id)].sort().join();
  assert.ok(sameSet);                                              // same cards, because the stats are the same
  const orders = new Set();
  for (let id = 1; id <= 12; id++) orders.add(deal(bigGame({ match_id: id }), nrm).cards.map(x => x.card_id).join());
  assert.ok(orders.size > 1, "every match id gave the same order");
});

test("deal order: opens on a good card, never opens on a Joker, Crown in the back half", () => {
  const nrm = norms(jokerRates);
  const dd = (t, killer, dur) => ({ game_time_s: t, killer_player_slot: killer, death_duration_s: dur });
  for (let id = 1; id <= 30; id++) {
    const h = deal(bigGame({ match_id: id, mvp: 1, deaths: { 1: [dd(100, 7, 30)], 7: [dd(105, 1, 20)] } }), nrm);
    assert.notEqual(h.cards[0].side, "bad", "opened on a roast");
    assert.notEqual(h.cards[0].kind, "joker");
    const k = h.cards.findIndex(c => c.kind === "crown");
    if (k >= 0 && h.cards.length > 3) assert.ok(k >= Math.floor(h.cards.length / 2) - 1, `crown at ${k} of ${h.cards.length}`);
  }
});

test("a leaver's game deals a hand with a note and cannot set records", () => {
  const h = deal(makeMatch({ left: true }), norms());
  assert.equal(h.status, "dealt");
  assert.equal(h.can_set_records, false);
  assert.ok(h.notes.includes("short_handed"));
});

test("cards carry what the UI needs: title, tier, corner rank, comparison, evidence and the norm version", () => {
  const h = deal(bigGame(), norms(jokerRates));
  const c = byId(h, "stat.hero_damage");
  assert.equal(c.title, "Heavy Artillery");
  assert.equal(c.norm_version, "test.1");
  assert.ok(c.comparison.games_compared > 0 && c.comparison.set_used && c.comparison.hero_average > 0);
  assert.match(c.percentile_text, /^Top /);
  assert.ok(c.evidence.tab);
  assert.equal(c.corner_rank, { common: "10", rare: "J", epic: "Q", legendary: "K", mythical: "A" }[c.tier]);
  assert.equal(c.one_in != null, c.tier === "legendary" || c.tier === "mythical");
});

test("catalog: 45 cards, 12 stat pairs, no duplicate ids, Jokers have a title and flavor", () => {
  assert.equal(C.count, 45);
  assert.equal(C.STAT_CARDS.length, 12);
  const ids = [...C.STAT_CARDS.map(s => s.id), ...C.CARDS.map(c => c.id)];
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(C.CARDS.filter(c => c.kind === "joker").length, 12);
  assert.equal(C.CARDS.filter(c => c.kind === "event").length, 8);
  for (const c of C.CARDS) assert.ok(c.title && c.flavor && typeof c.detect === "function");
  for (const s of C.STAT_CARDS) assert.ok(s.good.title && s.bad.title && s.good.flavor && s.bad.flavor);
  // no em dashes in card text
  const text = JSON.stringify([C.STAT_CARDS, C.CARDS.map(c => [c.title, c.flavor]), C.CROWN.titles]);
  assert.equal(text.includes("—"), false);
});

test("Slippery is held: off unless enabled, and then only for a player in fights at least as much as the lobby's median", () => {
  const nrm = norms();
  const me = { damage_taken: atBottom("damage_taken", 0.04) };
  const fighter = makeMatch({ me, fight: { me: 0.30, others: 0.20 } });
  const hider = makeMatch({ me, fight: { me: 0.05, others: 0.20 } });
  assert.equal(byId(deal(fighter, nrm), "stat.slippery"), undefined);                   // held by default
  const on = { enable: ["slippery"] };
  const c = byId(deal(fighter, nrm, on), "stat.slippery");
  assert.ok(c, "a fighter with low damage taken earns Slippery");
  assert.equal(c.side, "good");
  assert.equal(byId(deal(hider, nrm, on), "stat.slippery"), undefined);                // hiding in base does not
  assert.equal(byId(deal(makeMatch({ me }), nrm, on), "stat.slippery"), undefined);    // no paths, no card
  assert.ok(F.fightShare(F.buildMatch(fighter), F.buildMatch(fighter).bySlot.get(1)) > 0.29);
});

test("norms version: cards carry it, and a patch newer than the norms' window marks them stale", () => {
  const nrm = norms();
  nrm.index.window = { start_utc: "2026-11-10T00:00:00Z" };
  assert.deepEqual(E.stalePatches(nrm, ["2026-11-01", "2026-11-12"]), ["2026-11-12"]);
  const h = deal(makeMatch(), nrm, { patchDates: ["2026-11-12"] });
  assert.equal(h.norms_stale, true);
  assert.equal(h.norm_version, "test.1");
  assert.equal(deal(makeMatch(), nrm, { patchDates: ["2026-11-01"] }).norms_stale, undefined);
});

// ---------- review fixes ----------
test("NEW BEST reads the right direction: fewer deaths beats a lower best, more deaths does not", () => {
  const me = { kills: 12, deaths: atBottom("deaths", 0.05), assists: 15, net_worth: 25000, player_damage: 20000, boss_damage: 5000, last_hits: 150, souls9: 3000 };
  const h = deal(makeMatch({ me }), norms(), { bests: { "stat.deaths": 20 } });
  const worse = deal(makeMatch({ me }), norms(), { bests: { "stat.deaths": 0 } });
  const d = byId(h, "stat.deaths"), w = byId(worse, "stat.deaths");
  assert.ok(d, "no deaths card");
  assert.deepEqual(d.marks, ["new_best"]);
  assert.ok(!w || w.marks.length === 0, "NEW BEST on a worse number");
});

test("a Middle card never outranks a real card in its family (interest is a number)", () => {
  const mid = { tier: "middle", share: 0.5, kind: "stat", weight: 1 };
  assert.ok(Number.isFinite(E.interestOf(mid, {})));
  assert.ok(E.interestOf({ tier: "rare", share: 0.2, kind: "stat", weight: 1 }, {}) > E.interestOf(mid, {}));
});

test("history accepts earlier dealt hands as well as lists of card ids", () => {
  const first = deal(bigGame());
  assert.doesNotThrow(() => deal(bigGame(), norms(), { history: [first, first, first] }));
  assert.doesNotThrow(() => deal(bigGame(), norms(), { history: [first.cards.map(c => c.card_id), [], []] }));
});

test("bad input is not dealt, never a crash", () => {
  assert.equal(E.dealMatch(null, 1, norms()).status, "not_dealt");
  assert.equal(E.dealMatch(undefined, 1, norms()).status, "not_dealt");
});

test("order: the Crown is never in the front half and a hand never opens on a Joker", () => {
  const nrm = norms(jokerRates);
  for (let id = 1; id <= 40; id++) {
    const h = deal(bigGame({ match_id: id, mvp: 1 }), nrm);
    const ci = h.cards.findIndex(c => c.kind === "crown");
    if (ci >= 0 && h.cards.length >= 4) assert.ok(ci >= Math.floor(h.cards.length / 2), `crown at ${ci} of ${h.cards.length}`);
    assert.notEqual(h.cards[0].kind, "joker");
  }
});
