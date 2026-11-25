import numpy as np, pandas as pd, random
from collections import Counter, defaultdict
from sim import band, TIERS

def summarize(hands, cands, pop, label):
    n = len(hands); R = {}
    sizes = np.array([h['size'] for h in hands])
    R['label'] = label; R['n'] = n
    R['size_dist'] = {k: round(100 * v / n, 1) for k, v in sorted(Counter(sizes).items())}
    R['mean_size'] = sizes.mean(); R['pct_10plus'] = 100 * (sizes >= 10).mean(); R['pct_13'] = 100 * (sizes == 13).mean()
    def has(h, side, tiers): return any(c['side'] == side and c['tier'] in tiers for c in h['cards'])
    R['good_legplus'] = 100 * np.mean([has(h, 'good', ('legendary', 'mythical')) for h in hands])
    R['good_myth'] = 100 * np.mean([has(h, 'good', ('mythical',)) for h in hands])
    R['bad_legplus'] = 100 * np.mean([has(h, 'bad', ('legendary', 'mythical')) for h in hands])
    R['bad_myth'] = 100 * np.mean([has(h, 'bad', ('mythical',)) for h in hands])
    R['good_epicplus'] = 100 * np.mean([has(h, 'good', ('epic', 'legendary', 'mythical')) for h in hands])
    jk = np.array([sum(c['kind'] == 'joker' for c in h['cards']) for h in hands])
    R['joker_any'] = 100 * (jk >= 1).mean(); R['joker_two'] = 100 * (jk >= 2).mean()
    R['crown'] = 100 * np.mean([any(c['kind'] == 'crown' for c in h['cards']) for h in hands])
    allbad = [len(h['cards']) > 0 and all(c['side'] == 'bad' for c in h['cards']) for h in hands]
    R['all_bad'] = 100 * np.mean(allbad)
    R['majority_bad'] = 100 * np.mean([sum(c['side'] == 'bad' for c in h['cards']) > len(h['cards']) / 2 for h in hands])
    R['zero_bad'] = 100 * np.mean([not any(c['side'] == 'bad' for c in h['cards']) for h in hands])
    # per hand tier mix
    mix = Counter()
    for h in hands:
        for c in h['cards']: mix[(c['side'], c['tier'])] += 1
    R['per_hand'] = {f'{s} {t}': round(mix[(s, t)] / n, 2) for s in ('good', 'bad') for t in TIERS}
    R['middle_per_hand'] = np.mean([h['middles'] for h in hands])
    # candidates (raw, before P3)
    R['cand_epicplus_good'] = np.mean([sum(c['side'] == 'good' and c['raw_tier'] in ('epic', 'legendary', 'mythical') and c['kind'] == 'stat' for c in L) for L in cands])
    R['cand_leg_raw'] = 100 * np.mean([any(c['side'] == 'good' and c['raw_tier'] in ('legendary', 'mythical') for c in L) for L in cands])
    R['cand_myth_raw'] = 100 * np.mean([any(c['side'] == 'good' and c['raw_tier'] == 'mythical' for c in L) for L in cands])
    R['forced_over'] = 100 * np.mean([h['forced_over'] for h in hands]); R['short'] = 100 * np.mean([h['short'] for h in hands])
    # suit concentration (non-must): mostly one suit = >50% of the hand one suit
    R['mostly_one_suit'] = 100 * np.mean([max(Counter(c['suit'] for c in h['cards']).values()) > len(h['cards']) / 2 for h in hands if h['cards']])
    # per card
    dealt = Counter(); cand = Counter(); hero_share = defaultdict(Counter); hero_n = Counter()
    heroes = pop.hero.values
    for h, L in zip(hands, cands):
        hero_n[heroes[h['i']]] += 1
        for c in {(c['id'], c['side']) for c in h['cards']}: dealt[c] += 1; hero_share[heroes[h['i']]][c] += 1
        for c in {(c['id'], c['side']) for c in L if c['tier'] != 'common'}: cand[c] += 1
    R['dealt'] = dealt; R['cand'] = cand
    worst = []
    for hr, cn in hero_share.items():
        if hero_n[hr] < 60: continue
        cid, k = cn.most_common(1)[0]; worst.append((k / hero_n[hr], hr, cid, hero_n[hr]))
    R['hero_max_share'] = sorted(worst, reverse=True)
    R['n_cards_over35_hero'] = sum(1 for hr, cn in hero_share.items() if hero_n[hr] >= 60 for cid, k in cn.items() if k / hero_n[hr] > .35)
    # lobby level
    mids = pop.match_id.values; lob = defaultdict(list)
    for h in hands: lob[mids[h['i']]].append(h)
    R['lobby_any_leg'] = 100 * np.mean([any(has(h, 'good', ('legendary', 'mythical')) for h in hs) for hs in lob.values()])
    R['lobby_any_myth'] = 100 * np.mean([any(has(h, 'good', ('mythical',)) for h in hs) for hs in lob.values()])
    return R

def jacc(hs, k=400, seed=1):
    rnd = random.Random(seed); ids = [frozenset(c['id'] + c['side'] for c in h['cards']) for h in hs]
    if len(ids) < 2: return np.nan
    v = []
    for _ in range(k):
        a, b = rnd.sample(range(len(ids)), 2); u = ids[a] | ids[b]
        if u: v.append(len(ids[a] & ids[b]) / len(u))
    return np.mean(v)

def group_report(hands, pop, groups):
    """groups: dict name -> boolean mask over pop rows."""
    out = {}
    for name, mask in groups.items():
        hs = [h for h in hands if mask[h['i']]]
        if not hs: continue
        n = len(hs)
        top = Counter()
        for h in hs:
            for c in {(c['title'], c['side']) for c in h['cards']}: top[c] += 1
        out[name] = dict(n=n, mean_size=np.mean([h['size'] for h in hs]),
            good_legplus=100 * np.mean([any(c['side'] == 'good' and c['tier'] in ('legendary', 'mythical') for c in h['cards']) for h in hs]),
            bad_per_hand=np.mean([sum(c['side'] == 'bad' for c in h['cards']) for h in hs]),
            good_per_hand=np.mean([sum(c['side'] == 'good' for c in h['cards']) for h in hs]),
            all_bad=100 * np.mean([all(c['side'] == 'bad' for c in h['cards']) for h in hs if h['cards']]),
            majority_bad=100 * np.mean([sum(c['side'] == 'bad' for c in h['cards']) > len(h['cards']) / 2 for h in hs]),
            no_good_rareplus=100 * np.mean([not any(c['side'] == 'good' and c['tier'] != 'common' for c in h['cards']) for h in hs]),
            jaccard=jacc(hs), top=[(t, s, round(100 * k / n)) for (t, s), k in top.most_common(6)])
    return out

def fmt_hand(h, pop, recs=None):
    r = pop.iloc[h['i']]
    head = f"{HERO.get(int(r.hero), 'hero ' + str(int(r.hero)))}, {int(r.kills)}/{int(r.deaths)}/{int(r.assists)}, {int(r.dur // 60)} min, {'win' if r.won else 'loss'}" + \
        (f", rank band {band(r.lobby_tier)}" if band(r.lobby_tier) else '') + (', Valve MVP' if r.mvp == 1 else '')
    lines = []
    for c in sorted(h['cards'], key=lambda c: (c['side'] == 'bad', -TIERS.index(c['tier']))):
        pct = ''
        if c['kind'] == 'stat':
            g = c['gfine']; pct = (' top ' if c['side'] == 'good' else ' bottom ') + (f"{max(g, .0005) * 100:.1f}%" if g < .01 else f"{g * 100:.0f}%")
        elif c['kind'] in ('joker', 'event'): pct = f" (happens in {c['g'] * 100:.1f}% of games)"
        rt = f" [raw {c['raw_tier']}]" if c['raw_tier'] != c['tier'] else ''
        lines.append(f"{c['tier'].capitalize()} {'bad ' if c['side'] == 'bad' else ''}{c['suit']}: **{c['title']}**{pct}{rt}")
    if h['middles']: lines.append(f"{h['middles']} x Middle filler")
    return head, lines

HERO = {}
