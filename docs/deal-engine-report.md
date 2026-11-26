# Card dealer engine: build report

`dealMatch()` is built, tested and measured. Code is in `deal/`, norms in `data/deal-norms/` (44 heroes, 2.7 MB, version 2026-11-26.2, 7 day window), tools in `tools/`, tests in `test/deal/` (46 pass). How the engine works, rule by rule, is in `deal/README.md`.

## Simulation: targets against what came out

Run on 2,036 matches that were held out of calibration (24,431 dealt hands, ranked and unranked, last 10 days). Command: `node tools/deal_sim.mjs <dir>`.

| Target | Result | Verdict |
|---|---|---|
| About 5 cards on average | 5.46 | On target |
| Legendary or better in about 12% of hands | 9.9% good side only (Jokers and the Crown count); 17.5% if a bad Legendary also counts | Good side a little under, both sides over. Ladder is locked, so I did not tune it |
| Mythical about 0.6% | 0.65% good side, 1.35% either side | On target |
| Jokers in 25 to 45% (aim 38%) | 29.3% | In range, below the aim |
| Two Jokers under 5% | 0.03% | Pass |
| All-bad hands under 1% | 0.24% | Pass, with a call (below). With no relief card at all it would be 2.76% |
| Mostly one suit under 10% | 1.9% of hands with 5+ cards (one suit holds 70% or more). My strict first definition (a suit over half of 3+ cards) gives 24.0% | See note below |
| No card over 35% of one hero's hands | None. Highest is 33% (one hero, assists) | Pass |
| Hands of 10+ cards about 2% | 1.3% | A little under |

Hand sizes: 4 cards 23.6%, 5 cards 34.7%, 6 cards 25.6%, 7 cards 9.3%, 8 cards 4.2%, 9 cards 1.3%, 10 cards 0.8%, 11 to 13 cards 0.5%.

Per hand: 0.2 good Common, 1.5 good Rare, 1.4 good Epic, 0.12 good Legendary, 0.01 good Mythical, plus 1.2 bad Rare, 1.0 bad Epic, 0.09 bad Legendary. Wins average 4.2 good and 1.5 bad cards. Losses average 2.3 good and 2.9 bad. Hand size and Legendary rate are flat across rank bands (5.39 to 5.47 cards, 9.0 to 10.3%), so grading against the player's own band works.

**About the suit target.** The four suits are very uneven (Combat 9 cards, Survival 7, Souls 3, Objectives 1), so a 3 card hand with 2 of one suit is normal by chance alone. The strict 24.0% number cannot reach 10% with the locked soft weights (1.0, 0.85, 0.60, 0.35). Measured the way a player would notice, a hand that is nearly all one suit, it is 1.9%. If you want the strict version under 10%, the way is a harder suit penalty or more suits, and that is your call.

**Not measured by this run:** the Valve Crown margin uses a heuristic score estimate, and about half the sample has no rank on file (graded against the lobby, then all ranks).

## Calls I made (nothing blocked, so I chose)

1. **Parry This is held and Last Word replaces it.** The custom stat id I used for parries (56) counts 20 or more in 42% of players, so it is not parries and I cannot verify the right id from the data or the public stat files. Last Word is an event with the same slot: you took the last kill of the match (fires in 8.4% of games, Epic). The card count stays 45. If you know the parry stat, it goes back in as one line.
2. **Relief card widened.** The bible's silver lining only saved a good card that was Rare or better, which left 7.7% of hands all bad. A bad game now keeps its best good Common, and if there is none, its best Middle card ("Middle of the pack"). This gets all-bad hands to 0.24%. 2.76% of hands (almost all losses) still have no earned good card, only the Middle relief card.
3. **Hand size bands split.** The bible's "9 to 10" and "11 to 12" cards are split in half by strength (9 and 10, 11 and 12) so the top of the range is reachable.
4. **A card never needs a missing norm.** If a hero has no usable norm for a stat (for example accuracy on a hero with no gun rows), that card simply is not dealt.
5. **Rarity of Jokers and events is measured, not guessed.** Fire rates come from 3,936 training matches (`calibration.cards`). Jokers that fire in under 0.1% are Mythical, and so on down the prevalence ladder.
6. **Joker coverage is 29%, not 38%.** I did not loosen a Joker trigger to chase the aim, because every Joker I would loosen is already near its rarity limit. Coverage can rise by adding mid-rare Jokers (Closing Argument, Nemesis Clause, Compound Interest, Goose Egg were the candidates I held), not by loosening these.
7. **Damage taken is built into the norms but Slippery stays off,** as the plan said (waits for the damage-taken fix).

8. **A fresh reviewer read the code before this PR** and found real bugs, all fixed with tests: a Middle card scored NaN and could push a Rare to Legendary card of its family into "also" (641 of 29,844 player-games lost a Rare or better card); NEW BEST pointed the wrong way for lower-is-better stats; the silver lining was skipped when a Joker or the Crown was in the hand; Quiet Crown almost never fired; the deal order only tried its rules once (it now searches, so the Crown is never in the front half and a hand never opens on a bad card when a good one exists); `history` crashed on dealt hands; `dealMatch(null)` threw. One finding I kept by choice: the relief card (call 2) is wider than the first README draft, and the README now says so.

## Held and cut cards

Slippery (waits for damage taken and the fight-share gate), Parry This (stat id unverified), Piggy Bank and Layaway Plan (unspent minutes look like the wrong units), Boss Hunter (37% of games), movement Jokers (9 codes in the data, 8 in the catalog), Film Study (watched-replays list empty), Mirror Mirror (duplicate heroes cannot happen), Early Checkout (never fired). Reasons are in `HELD` in `catalog.js`.

## Norms

Built from the deadlock-api SQL endpoint (ranked and unranked, no leavers, 10+ minutes, last 7 days). Per hero: 8 match-length buckets, 4 rank bands, per-minute fallback, 23-point percentile grid down to the 0.1% and up to 99.9%. The SQL endpoint allows 2 requests a minute and times out on heavy queries, so the builder splits by hero and resumes from a cache; the full build took about 15 minutes. After a big economy patch rebuild with `--since <patch date>`.

## Example hands

Eight to ten real hands from held-out matches, then all twelve hands of match 143748583 (no account ids shown). Hero names, results and numbers are the real ones.

### The biggest hand

**Apollo, 28/6/17, 42 min, win, Valve MVP, no rank on file**

13 cards (A full suit):
- Rare **Best Supporting Actor**: Top 25%, 17 assists
- Rare **Siege Engine**: Top 11%, 10,494 objective damage
- Legendary **Body Count**: Top 0.25%, 28 kills
- Rare **Hard to Kill**: Top 25%, 6 deaths
- Mythical **Soul Baron**: Top 0.1%, 81,006 souls
- Rare **Unmoved**: Top 22%, 23,383 damage mitigated
- Epic **Last Word**: You took the last kill of the match, at 41:08. (happens in 8.4% of games)
- Rare **Bag Secure**: Top 12%, 218 souls dropped on death
- Legendary **Heavy Artillery**: Top 0.34%, 90,388 damage
- Rare **Lane Rich**: Top 11%, 7,421 souls at 9:00
- Epic bad **Opening Night**: First death of the match, at 1:02. (happens in 8.3% of games)
- Legendary **Dead Eye**: Top 0.45%, 77% accuracy
- Mythical **The Crown**: Valve named you MVP, 6.4 estimated points clear of the next player.
  - also on Soul Baron: Wave Maestro

### A Joker, one of two Legendary-level surprises

**Mina, 14/2/10, 45 min, loss, mid rank**

8 cards:
- Rare **Haymaker**: 2 kills with a melee swing. (happens in 22% of games)
- Epic **Hard to Kill**: Top 10%, 2 deaths
- Rare **Body Count**: Top 15%, 14 kills
- Epic **Unmoved**: Top 8.4%, 21,889 damage mitigated
- Rare **Soul Baron**: Top 25%, 60,502 souls
- Rare bad **Warning Shots**: Bottom 19%, 57% accuracy
- Epic **Lane Rich**: Top 9.5%, 8,070 souls at 9:00
- Legendary **The Uncrowned** (Joker): Top estimated score of all twelve players, on the losing team. (happens in 0.7% of games)
  - also on Soul Baron: Wave Maestro
- also earned, not dealt: Everyone Gets One (Rare Joker)

### A great game in a loss

**Solomon, 26/3/12, 44 min, loss, no rank on file**

11 cards:
- Rare **Hard to Kill**: Top 25%, 3 deaths
- Mythical **Body Count**: Top 0.1%, 26 kills
- Mythical **Soul Baron**: Top 0.1%, 80,885 souls
- Legendary **Unmoved**: Top 0.81%, 39,245 damage mitigated
- Epic **Lane Rich**: Top 1.5%, 8,368 souls at 9:00
- Rare **Haymaker**: 3 kills with a melee swing. (happens in 22% of games)
- Rare bad **Out of Bandages**: Bottom 18%, 939 healing
- Epic **First Blood**: You took the first kill of the match, at 1:55. (happens in 8.3% of games)
- Rare **Siege Engine**: Top 14%, 7,319 objective damage
- Mythical **Heavy Artillery**: Top 0.1%, 130,028 damage
- Legendary **The Uncrowned** (Joker): Top estimated score of all twelve players, on the losing team. (happens in 0.7% of games)
  - also on Soul Baron: Wave Maestro
- also earned, not dealt: Buyer's Remorse (Epic Joker), Everyone Gets One (Rare Joker)

### An average game

**Drifter, 10/10/21, 51 min, loss, mid rank**

5 cards:
- Rare **Best Supporting Actor**: Top 25%, 21 assists
- Epic **Bag Secure**: Top 7%, 614 souls dropped on death
- Rare **Wave Maestro**: Top 18%, 237 last hits
- Epic bad **Warning Shots**: Bottom 3.6%, 35% accuracy
- Rare **Lane Rich**: Top 17%, 7,274 souls at 9:00
  - also on Wave Maestro: Soul Baron

### An average game, high rank

**Mina, 11/2/15, 32 min, win, Valve MVP, top rank**

5 cards:
- Rare **Best Supporting Actor**: Top 25%, 15 assists
- Rare **Hard to Kill**: Top 15%, 2 deaths
- Rare **Body Count**: Top 25%, 11 kills
- Epic **The Crown**: Valve named you MVP, 0.1 estimated points clear of the next player.
- Epic **Last Word**: You took the last kill of the match, at 31:49. (happens in 8.4% of games)

### A support who healed

**Dynamo, 12/7/24, 33 min, win, Valve MVP, mid rank**

12 cards:
- Rare **Field Medic**: Top 16%, 9,407 healing
- Epic **Soul Baron**: Top 4.9%, 45,467 souls
- Rare **Everyone Gets One** (Joker): You took down all 6 enemies at least once. (happens in 12% of games)
- Rare **Lane Rich**: Top 21%, 6,801 souls at 9:00
- Legendary **Body Count**: Top 1%, 12 kills
- Epic **Unmoved**: Top 1.5%, 24,582 damage mitigated
- Epic **First Blood**: You took the first kill of the match, at 0:43. (happens in 8.3% of games)
- Rare bad **Everything Must Go**: Bottom 13%, 2,090 souls dropped on death
- Epic bad **Warning Shots**: Bottom 1.7%, 40% accuracy
- Epic **The Crown**: Valve named you MVP, 2.7 estimated points clear of the next player.
- Epic **Best Supporting Actor**: Top 10%, 24 assists
- Legendary **Siege Engine**: Top 0.23%, 21,714 objective damage

### A weak game

**Silver, 1/8/2, 34 min, loss, low rank**

6 cards:
- Epic **Siege Engine**: Top 9.7%, 10,701 objective damage
- Epic bad **Solo Act**: Bottom 5%, 2 assists
- Epic bad **Cardboard Plate**: Bottom 9.1%, 8,178 damage mitigated
- Legendary bad **Economy Class**: Bottom 0.57%, 25,512 souls
- Epic bad **Peaceful Protester**: Bottom 5%, 1 kills
- Epic bad **Decorative Ammunition**: Bottom 4.9%, 14,397 damage
  - also on Economy Class: Wave Observer

### An atrocious game

**Calico, 2/18/5, 40 min, loss, no rank on file**

6 cards:
- Epic **Bag Secure**: Top 6.4%, 156 souls dropped on death
- Legendary bad **Shoestring Budget**: Bottom 0.2%, 3,847 souls at 9:00
- Legendary bad **Complimentary Respawn Tour**: Bottom 0.5%, 18 deaths
- Legendary bad **Decorative Ammunition**: Bottom 0.51%, 8,653 damage
- Legendary bad **Cardboard Plate**: Bottom 0.66%, 4,073 damage mitigated
- Mythical bad **Economy Class**: Bottom 0.1%, 23,067 souls
  - also on Complimentary Respawn Tour: Revolving Door, Frequent Customer
  - also on Economy Class: Wave Observer

### Bad cards softened for a player out of their depth

**Dynamo, 0/9/8, 33 min, loss, low rank**

5 cards:
- Rare **Bag Secure**: Top 23%, 157 souls dropped on death
- Rare bad **Decorative Ammunition**: Bottom 6.6%, 10,703 damage
- Rare bad **Economy Class**: Bottom 7.1%, 28,033 souls
- Rare bad **Peaceful Protester**: Bottom 5%, 0 kills
- Rare bad **Shoestring Budget**: Bottom 6.7%, 4,942 souls at 9:00
  - also on Economy Class: Wave Observer


## Match 143748583: all twelve hands

**Graves, 15/4/12, 43 min, win, Valve MVP, no rank on file**

9 cards:
- Rare **Hard to Kill**: Top 15%, 4 deaths
- Epic **Soul Baron**: Top 2.4%, 70,739 souls
- Epic **Heavy Artillery**: Top 9.5%, 67,826 damage
- Legendary **Siege Engine**: Top 0.59%, 30,605 objective damage
- Epic **Body Count**: Top 10%, 15 kills
- Rare **Unmoved**: Top 23%, 23,091 damage mitigated
- Legendary **The Crown**: Valve named you MVP, 3.3 estimated points clear of the next player.
- Epic **Last Word**: You took the last kill of the match, at 42:28. (happens in 8.4% of games)
- Rare **Everyone Gets One** (Joker): You took down all 6 enemies at least once. (happens in 12% of games)
  - also on Soul Baron: Wave Maestro

**Victor, 7/7/18, 43 min, win, no rank on file**

5 cards:
- Rare **Best Supporting Actor**: Top 25%, 18 assists
- Rare bad **Everything Must Go**: Bottom 23%, 2,696 souls dropped on death
- Epic **Lane Rich**: Top 3.1%, 8,301 souls at 9:00
- Rare bad **Cardboard Plate**: Bottom 24%, 15,553 damage mitigated
- Epic bad **Opening Night**: First death of the match, at 1:50. (happens in 8.3% of games)

**Kelvin, 5/5/19, 43 min, win, no rank on file**

5 cards:
- Epic **Dead Eye**: Top 4.9%, 66% accuracy
- Epic **Buyer's Remorse** (Joker): 3 items were sold less than a minute after they were bought. (happens in 7.1% of games)
- Rare bad **Object Permanence**: Bottom 15%, 1,659 objective damage
- Rare bad **Shoestring Budget**: Bottom 24%, 5,273 souls at 9:00
- Rare bad **Everything Must Go**: Bottom 21%, 2,007 souls dropped on death

**Lady Geist, 2/6/10, 43 min, win, no rank on file**

5 cards:
- Rare **Lane Rich**: Top 12%, 7,228 souls at 9:00
- Epic bad **Decorative Ammunition**: Bottom 2.9%, 28,330 damage
- Rare bad **Object Permanence**: Bottom 14%, 1,979 objective damage
- Epic bad **Peaceful Protester**: Bottom 10%, 2 kills
- Rare bad **Cardboard Plate**: Bottom 21%, 11,627 damage mitigated

**Lash, 7/9/16, 43 min, win, no rank on file**

4 cards:
- Epic **Siege Engine**: Top 5.3%, 11,948 objective damage
- Common bad **Frequent Customer**: The same enemy took you down 4 times. (happens in 30% of games)
- Rare bad **Cardboard Plate**: Bottom 24%, 9,054 damage mitigated
- Rare bad **Everything Must Go**: Bottom 15%, 2,323 souls dropped on death
  - also on Frequent Customer: Complimentary Respawn Tour

**Paradox, 5/11/4, 43 min, win, no rank on file**

6 cards:
- Rare **Siege Engine**: Top 21%, 9,262 objective damage
- Epic **Dead Eye**: Top 4.4%, 62% accuracy
- Epic **Unmoved**: Top 2.9%, 19,646 damage mitigated
- Rare bad **Shoestring Budget**: Bottom 20%, 5,235 souls at 9:00
- Rare bad **Revolving Door**: Three deaths inside three minutes, starting at 3:55. (happens in 15% of games)
- Epic bad **Solo Act**: Bottom 2%, 4 assists
  - also on Revolving Door: Complimentary Respawn Tour, Frequent Customer

**Grey Talon, 8/3/10, 43 min, loss, no rank on file**

4 cards:
- Rare **Hard to Kill**: Top 25%, 3 deaths
- Rare **Wave Maestro**: Top 12%, 238 last hits
- Epic **Unmoved**: Top 3.4%, 15,606 damage mitigated
- Rare bad **Object Permanence**: Bottom 13%, 855 objective damage
  - also on Wave Maestro: Soul Baron

**Rat King, 3/5/9, 43 min, loss, no rank on file**

5 cards:
- Epic **Wave Maestro**: Top 6.9%, 306 last hits
- Rare bad **Solo Act**: Bottom 25%, 9 assists
- Epic **Last One Standing** (Joker): Every teammate was dead, and you were still taking people down. (happens in 1.4% of games)
- Rare bad **Decorative Ammunition**: Bottom 20%, 30,450 damage
- Rare bad **Shoestring Budget**: Bottom 17%, 5,055 souls at 9:00
  - also on Wave Maestro: Soul Baron

**Abrams, 8/6/11, 43 min, loss, no rank on file**

4 cards:
- Common **Soul Baron**: Top 31%, 52,387 souls
- Rare bad **Object Permanence**: Bottom 13%, 1,320 objective damage
- Rare **Dead Eye**: Top 18%, 60% accuracy
- Rare **Hard to Kill**: Top 25%, 6 deaths

**Haze, 7/7/11, 43 min, loss, no rank on file**

6 cards:
- Rare **Heavy Artillery**: Top 22%, 56,695 damage
- Rare **Lane Rich**: Top 10%, 7,546 souls at 9:00
- Rare bad **Peaceful Protester**: Bottom 25%, 7 kills
- Epic bad **Everything Must Go**: Bottom 8.8%, 4,964 souls dropped on death
- Epic **First Blood**: You took the first kill of the match, at 1:50. (happens in 8.3% of games)
- Rare **Unmoved**: Top 19%, 14,715 damage mitigated

**Bebop, 10/11/21, 43 min, loss, no rank on file**

5 cards:
- Rare **Best Supporting Actor**: Top 25%, 21 assists
- Rare **Bag Secure**: Top 20%, 278 souls dropped on death
- Epic **Absolutely Calculated** (Joker): A kill landed 2 seconds after you died. (happens in 4.2% of games)
- Rare **Heavy Artillery**: Top 12%, 61,012 damage
- Rare **Lane Rich**: Top 14%, 7,205 souls at 9:00
- also earned, not dealt: Mutually Assured Destruction (Epic Joker), Everyone Gets One (Rare Joker)

**Violet, 6/9/10, 43 min, loss, no rank on file**

4 cards:
- Common **Dead Eye**: Top 31%, 65% accuracy
- Rare **Soul Baron**: Top 20%, 53,590 souls
- Rare bad **Solo Act**: Bottom 25%, 10 assists
- Common **Lane Rich**: Top 39%, 6,198 souls at 9:00
  - also on Soul Baron: Wave Maestro

