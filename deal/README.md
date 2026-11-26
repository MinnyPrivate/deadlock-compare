# The card dealer

`dealMatch()` takes a finished Deadlock match and one player and returns that player's hand of cards. It is the one brain behind the website demo, the in-game reveal window and the Binder. It draws nothing and touches nothing: no UI, no art, no network, no clock.

```js
const hand = PM_DEAL.dealMatch(matchJson, slot, norms, options);
```

- `matchJson` is the deadlock-api `/v1/matches/{id}/metadata` answer (or its `match_info`). Paths and the damage matrix are optional: a card that needs missing data is simply not a candidate.
- `slot` is the player's `player_slot` (or `{ account_id }`).
- `norms` is `{ index, heroes }`: `data/deal-norms/index.json` plus the `hero_<id>.json` files for the heroes you need (one file per hero, about 100 KB each, so a page loads only the hero it shows).
- `options` (all optional): `score` (`{ scoreMatch, table }` from `scoring.js` and `heronorms.js`, for the Crown margin and The Uncrowned), `history` (the last hands on this hero, for P5 damping), `bests` (best values so far, for NEW BEST), `seen`, `heroName(id)`, `patchDates`, `enable` (held cards), `scores` (precomputed).

Same match, same player, same norms, same options: the same hand in the same order, byte for byte.

## What comes back

```
{ status: "dealt", match_id, slot, hero_id, norm_version, result: "win"|"loss", hand_size,
  cards: [ { card_id, kind, side, suit, tier, corner_rank, title, flavor, value, unit, value_text, line,
             percentile, percentile_text, scope_text, one_in, comparison, evidence, marks, also, deal_order, norm_version } ],
  also_earned: [ ...Jokers that lost to a rarer Joker ],
  strength: { good, bad, good_percentile, bad_percentile, good_size, bad_size, atrocious },
  rank: { badge, source: "own"|"lobby"|"none", band, lobby_badge }, named_hand, notes, can_set_records }
```

A canceled match, a custom lobby, a bot match, a match under 10 minutes, a hero with no norms or a player who was not in the match returns `{ status: "not_dealt", reason, message }` with no cards. A canceled match's message says it was canceled, so it is never silently skipped.

## The 45 cards (v1)

| | Cards |
|---|---|
| 12 headline stats, a good card and a bad mirror each (24) | Hero damage, kills, assists, deaths, healing, damage mitigated, final souls, souls at 9:00, souls dropped on death, objective damage, accuracy, last hits |
| The Crown (1) | Valve's MVP; titles The Crown, Clean Crown, Quiet Crown |
| Jokers (12) | Absolutely Calculated, The Scenic Route, The Uncrowned, Return to Sender, Mutually Assured Destruction, One HP and a Dream, Cash Poor Spirit Rich, Personal Vendetta, Palindrome, Buyer's Remorse, Everyone Gets One, Last One Standing |
| Event cards (8) | Hat Trick, Four Course Meal, First Blood, Haymaker, Last Word, Frequent Customer, Opening Night, Revolving Door |

`catalog.js` has every title, flavor line and the exact rule for each Joker and event. Held back and switched off, with the reason: `HELD` in `catalog.js`. Slippery is built but off (`options.enable = ["slippery"]`): it waits for the damage-taken fix and only counts for a player who was in fights at least as much as the lobby's median.

## The rules, in the order the code applies them

1. **Rarity of a stat card.** The player's value is compared with the same hero, a similar match length and the player's **own** rank band (the lobby average only when the player has no rank; all ranks when neither is known). The full ladder applies to every headline stat: top 40% Common, 25% Rare, 10% Epic, 1% Legendary, 0.1% Mythical, and the bottom of the same distribution for bad cards. "Top 0.3% = Rare" cannot happen.
2. **Tail rule (P25).** A tier is read only from a set with enough games: 150 for Common to Epic, 1,000 for Legendary, 10,000 for Mythical. Otherwise the next wider set is used: hero + length + rank, hero + length (moved by the band's usual shift), hero + length, hero per minute + rank, hero per minute. Match length is smooth: cutoffs are interpolated between the 8 length buckets (same edges and centres as the length-aware hero norms).
3. **Ties count against you.** Whole-number stats (kills, deaths, assists) use the safe bound; a player exactly on a cutoff is not in the tier above it.
4. **Jokers and events** earn rarity from how often they fire across all player-games (measured, `calibration.cards`): under 0.1% Mythical, 0.1 to 1% Legendary, 1 to 10% Epic, 10 to 25% Rare, 25 to 40% Common (events only; there are no Common Jokers). Events print the raw number.
5. **Hero guard (P35).** A Joker that fires in more than 25% of one hero's games, or an event over 40%, is off for that hero.
6. **Support guard.** A bad farm card (souls, souls at 9:00, last hits) is dropped for a player whose assists or healing are Rare or better.
7. **Soften.** If the lobby's average rank is 2 or more tiers (12 steps) above the player's own, bad tiers drop one step; 4 or more tiers, two steps.
8. **P30, one card per story.** Related cards are a family (kills, damage, dying, farm...). Only the best card of each family and side is dealt; the rest show as "also".
9. **P32, one Joker per hand**, unless the two best are both Legendary or better. The runner-up is in `also_earned`.
10. **Hand size.** Hand strength = Rare 1, Epic 2, Legendary 4, Mythical 6 (P36), compared with that hero's games (`calibration.strength`) and mapped to 4 to 13 cards (30% 4, 30% 5, 20% 6, 12% 7, 5% 8, 2% 9 to 10, 0.9% 11 to 12, 0.1% 13). The bad side adds at most one card, and counts at most 6 (P34).
11. **Always dealt:** every Legendary and Mythical (good and bad), the Crown, the Joker. P5 damping (0.7) applies to Common to Epic only.
12. **Picking.** The rest of the slots go best-first by interest score, split between good and bad by how strong each side was. Same-suit cards are down-weighted softly: 1.0, 0.85, 0.60, 0.35.
13. **Bad cards are always on** (P28 no). **Silver lining (P35):** an awful game still gets its best good stat card when one is Rare or better. Call made after the first simulation: when none is Rare, the best good Common is kept, and when there is no Common either, the best Middle card ("Middle of the pack"), so a hand is never all bad. Otherwise Commons and Middle cards are only filler up to 4.
14. **Order** is random but fixed per match and player (P24): seeded from the match and account. Opens on a good card, never on a Joker; the finale goes last 60% of the time; the Crown lands in the back half; the same suit does not repeat when it can be avoided (a bounded search over the open slots, so it only gives up when no such order exists).

## Norms: how they are built

```
python tools/build_deal_norms.py --days 7 --chunks 8     # stat cutoffs from the deadlock-api SQL endpoint
node tools/calibrate_deal.mjs <dir of match .json.gz>      # Joker and event rates, Crown margins, hand sizes
node tools/deal_sim.mjs <dir of match .json.gz>            # the Deal Report numbers (held-out matches only)
node tools/deal_examples.mjs <dir> --pick                  # real example hands in plain words
node --test test/deal/                                      # unit tests
```

`norm_version` is the build date plus a counter. **After a big economy patch, rebuild with `--since <patch date>`**: the version bumps, every card dealt afterwards carries it, and cards dealt earlier keep theirs (a card never changes after it is dealt). `dealMatch` flags `norms_stale` when you pass `options.patchDates` and one is newer than the norms' window.

## Not in here

No UI, no art, no animation, no sound, no Binder storage, no Steam sign-in. Those sit on top of this and read `hand.cards`.
