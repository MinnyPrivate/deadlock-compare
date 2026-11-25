"""Card dealing simulation. Norms + tiers + dealer per bible P2/P3/P4/6.3-6.5."""
import json, math, os, glob, numpy as np, pandas as pd
from collections import Counter, defaultdict
from features import build_wide_rows, build_full

EDGES = [1200, 1500, 1800, 2100, 2400, 2700, 3000]
def bucket(d): return int(np.searchsorted(EDGES, d, side='right'))
def band(t):
    if t is None or (isinstance(t, float) and np.isnan(t)) or t <= 0: return None
    return 'low' if t <= 4 else 'mid' if t <= 7 else 'high' if t <= 9 else 'top'

# id, title_good, title_bad, suit, stat, direction(+1 higher better/-1 lower), kind, headline, src
CARDS = [
 ('CB-01', 'Heavy Artillery', 'Decorative Ammunition', 'combat', 'hero_dmg', 1, 'rate', 1, 'W'),
 ('CB-03', 'Full Output', 'Part-Time Contributor', 'combat', 'full_output', 1, 'rate', 1, 'W'),
 ('CB-05', 'Body Count', 'Peaceful Protester', 'combat', 'kills', 1, 'rate', 1, 'W'),
 ('CB-07', 'Best Supporting Actor', 'Solo Act', 'combat', 'assists', 1, 'rate', 1, 'W'),
 ('CB-09', 'Everywhere at Once', 'Independent Contractor', 'combat', 'takedowns', 1, 'rate', 1, 'W'),
 ('CB-11', 'Dead Eye', 'Warning Shots', 'combat', 'accuracy', 1, 'raw', 1, 'W'),
 ('CB-17', 'Magazine Dump', 'Trigger Shy', 'combat', 'shots', 1, 'rate', 0, 'W'),
 ('SV-01', 'Hard to Kill', 'Complimentary Respawn Tour', 'survival', 'deaths', -1, 'rate', 1, 'W'),
 ('SV-03', 'Always Present', 'Unscheduled Maintenance', 'survival', 'time_dead', -1, 'raw', 0, 'W'),
 ('SV-05', 'Old Soul', None, 'survival', 'longest_life', 1, 'raw', 0, 'W'),
 ('SV-07', 'Bag Secure', 'Everything Must Go', 'survival', 'death_loss', -1, 'rate', 0, 'W'),
 ('SV-09', 'Slippery', 'Open Door Policy', 'survival', 'dmg_taken', -1, 'rate', 1, 'W'),
 ('SV-11', 'Unmoved', 'Cardboard Plate', 'survival', 'mitigated', 1, 'rate', 0, 'W'),
 ('SV-13', 'Shield Wall', None, 'survival', 'absorbed', 1, 'rate', 0, 'W'),
 ('SV-16', 'Walking Hospital', None, 'survival', 'total_heal', 1, 'rate', 0, 'W'),
 ('SV-17', 'Field Medic', 'Out of Bandages', 'survival', 'ally_heal', 1, 'rate', 1, 'W'),
 ('SV-19', 'Self Care', None, 'survival', 'self_heal', 1, 'rate', 0, 'W'),
 ('SV-20', 'Umbrella Service', None, 'survival', 'ally_barrier', 1, 'rate', 0, 'W'),
 ('SV-21', 'Anti-Heal Committee', None, 'survival', 'heal_prev', 1, 'rate', 0, 'W'),
 ('SL-01', 'Soul Baron', 'Economy Class', 'souls', 'souls', 1, 'rate', 1, 'W'),
 ('SL-03', 'Lane Rich', 'Shoestring Budget', 'souls', 'souls9', 1, 'fixed', 1, 'W'),
 ('SL-05', 'Midgame Mogul', 'Rainy Day Fund', 'souls', 'souls15', 1, 'fixed', 0, 'W'),
 ('SL-07', 'Wave Maestro', 'Wave Observer', 'souls', 'lane_cs', 1, 'rate', 1, 'W'),
 ('SL-11', 'Repo Man', None, 'souls', 'denies', 1, 'rate', 0, 'W'),
 ('SL-12', 'Camp Counselor', 'Never Met the Camps', 'souls', 'neutral_kills', 1, 'rate', 0, 'W'),
 ('SL-25', 'Bang for the Soul', 'Premium Pricing', 'souls', 'dmg_per_soul', 1, 'raw', 0, 'W'),
 ('SL-36', 'First Nine Minutes', None, 'souls', 'early_souls_share', 1, 'raw', 0, 'W'),
 ('OB-01', 'Siege Engine', 'Object Permanence', 'objectives', 'obj_dmg', 1, 'rate', 1, 'W'),
 ('OB-03', 'Early Siege', None, 'objectives', 'obj15', 1, 'fixed', 0, 'W'),
 # rich (full match file only)
 ('CB-13', 'Magnet Hands', 'Suppressive Fire', 'combat', 'hero_hit_rate', 1, 'raw', 0, 'R'),
 ('CB-15', 'Face Time', 'Mostly Torso', 'combat', 'headshot_share', 1, 'raw', 0, 'R'),
 ('CB-19', 'Spellbook Open', 'Cooldown Tourist', 'combat', 'ability_dmg', 1, 'rate', 0, 'R'),
 ('CB-21', 'Gun Show', 'Safety On', 'combat', 'gun_dmg', 1, 'rate', 0, 'R'),
 ('CB-23', 'Knuckle Sandwich', None, 'combat', 'melee_dmg', 1, 'rate', 0, 'R'),
 ('CB-24', 'Hold Still, Please', 'Free Roam Policy', 'combat', 'hard_cc_s', 1, 'rate', 0, 'R'),
 ('CB-26', 'Molasses', None, 'combat', 'slow_s', 1, 'rate', 0, 'R'),
 ('CB-27', 'Point Blank Poet', None, 'combat', 'no_falloff_share', 1, 'raw', 0, 'R'),
 ('CB-28', None, 'Falloff Fan', 'combat', 'max_falloff_share', -1, 'raw', 0, 'R'),
 ('CB-29', 'Parry This', None, 'combat', 'parries', 1, 'rate', 0, 'R'),
 ('CB-30', None, 'Parry Whiff', 'combat', 'parry_miss', -1, 'rate', 0, 'R'),
 ('CB-31', 'Sitting Ducks', None, 'combat', 'immobile_hits', 1, 'rate', 0, 'R'),
 ('CB-32', 'Fight Club', 'Window Shopper', 'combat', 'fight_share', 1, 'raw', 0, 'R'),
 ('CB-34', 'Gunsmith', None, 'combat', 'bullet_kills', 1, 'rate', 0, 'R'),
 ('CB-35', 'Spellcaster', None, 'combat', 'ability_kills', 1, 'rate', 0, 'R'),
 ('CB-37', 'Skull Collector', None, 'combat', 'headshot_kills', 1, 'rate', 0, 'R'),
 ('CB-46', 'Quick Draw', None, 'combat', 'quick_draw', -1, 'raw', 0, 'R'),
 ('CB-47', 'Long Distance Call', None, 'combat', 'long_range', 1, 'raw', 0, 'R'),
 ('SV-22', None, 'Healing Interrupted', 'survival', 'heal_lost', -1, 'rate', 0, 'R'),
 ('SV-25', 'Orb Hopper', None, 'survival', 'regen_orb', 1, 'rate', 0, 'R'),
 ('SV-27', "Trooper's Best Friend", None, 'survival', 'regen_medic', 1, 'rate', 0, 'R'),
 ('SL-09', 'Never Missed a Wave', 'Missed Connections', 'souls', 'cs_rate', 1, 'raw', 0, 'R'),
 ('SL-14', 'Crate Crusher', None, 'souls', 'breakable_souls', 1, 'rate', 0, 'R'),
 ('SL-15', 'Treasure Hunter', None, 'souls', 'treasure_souls', 1, 'rate', 0, 'R'),
 ('SL-16', 'Boss Bounty', None, 'souls', 'boss_souls', 1, 'rate', 0, 'R'),
 ('SL-24', 'Level Lead', None, 'souls', 'level15', 1, 'fixed', 0, 'R'),
 ('SL-37', 'Lane Bully', 'Lane Under New Management', 'souls', 'lane_pair_ratio', 1, 'raw', 0, 'R'),
]
EVENTS = [  # id, title, suit, col, side
 ('CB-36', 'Haymaker', 'combat', 'ev_haymaker', 'good'), ('CB-38', 'Double Dip', 'combat', 'ev_double_dip', 'good'),
 ('CB-39', 'Hat Trick', 'combat', 'ev_hat_trick', 'good'), ('CB-40', 'Four Course Meal', 'combat', 'ev_four_course', 'good'),
 ('CB-41', 'On a Heater', 'combat', 'ev_on_a_heater', 'good'), ('CB-42', 'First Blood', 'combat', 'ev_first_blood', 'good'),
 ('CB-43', 'Last Word', 'combat', 'ev_last_word', 'good'), ('CB-45', 'Against the Odds', 'combat', 'ev_against_the_odds', 'good'),
 ('CB-49', 'Season Pass Holder', 'combat', 'ev_season_pass', 'good'), ('SV-23', 'Personal Physician', 'survival', 'ev_personal_physician', 'good'),
 ('SV-24', 'Group Plan', 'survival', 'ev_group_plan', 'good'), ('SV-29', 'Frequent Customer', 'survival', 'ev_frequent_customer', 'bad'),
 ('SV-30', 'Opening Night', 'survival', 'ev_opening_night', 'bad'), ('SV-31', 'Revolving Door', 'survival', 'ev_revolving_door', 'bad'),
 ('SV-33', 'Melted', 'survival', 'ev_melted', 'bad'), ('OB-06', 'Boss Hunter', 'objectives', 'ev_boss_hunter', 'good'),
]
WIDE_EVENTS = {'ev_opening_night', 'ev_revolving_door'}
JOKERS = {  # col: title
 'jk_intern': 'The Intern', 'jk_perfectly_balanced': 'Perfectly Balanced', 'jk_palindrome': 'Palindrome', 'jk_six_of_one': 'Six of One',
 'jk_pacifist_millionaire': 'Pacifist Millionaire', 'jk_uncrowned': 'The Uncrowned', 'jk_compound_interest': 'Compound Interest',
 'jk_early_checkout': 'Early Checkout', 'jk_contradiction': 'The Contradiction', 'jk_main_character': 'Main Character, Supporting Role',
 'jk_cash_poor': 'Cash Poor, Spirit Rich', 'jk_pacifist_dilemma': "Pacifist's Dilemma", 'jk_stat_anomaly': 'Statistical Anomaly', 'jk_two_jobs': 'Two Jobs',
 'jk_personal_vendetta': 'Personal Vendetta', 'jk_no_favorites': 'No Favorites', 'jk_same_time_tomorrow': 'Same Time Tomorrow?',
 'jk_you_again': 'You Again', 'jk_nemesis_clause': 'Nemesis Clause', 'jk_mad': 'Mutually Assured Destruction',
 'jk_absolutely_calculated': 'Absolutely Calculated', 'jk_everyone_gets_one': 'Everyone Gets One', 'jk_photo_finish': 'Photo Finish',
 'jk_opening_statement': 'Opening Statement', 'jk_closing_argument': 'Closing Argument', 'jk_return_to_sender': 'Return to Sender',
 'jk_boomerang': 'Boomerang', 'jk_take_a_number': 'Take a Number', 'jk_ping_pong': 'Ping Pong', 'jk_long_silence': 'Long Silence',
 'jk_clockwork': 'Clockwork', 'jk_last_one_standing': 'Last One Standing', 'jk_one_hp_dream': 'One HP and a Dream', 'jk_phoenix': 'Phoenix',
 'jk_chatterbox': 'Chatterbox', 'jk_technical_timeout': 'Technical Timeout', 'jk_hot_streak': 'Hot Streak', 'jk_side_quest': 'Found the Side Quest',
 'jk_goose_egg': 'Goose Egg', 'jk_cultist': "Cultist's Pick", 'jk_trophy': 'Trophy Case', 'jk_contract': 'Contract Killer',
 'jk_buyers_remorse': "Buyer's Remorse", 'jk_scenic_route': 'The Scenic Route', 'jk_homebody': 'The Homebody', 'jk_lone_wolf': 'Lone Wolf',
 'jk_velcro': 'Velcro', 'jk_lucky_shot': 'Lucky Shot', 'jk_power_collector': 'Power Collector', 'jk_garage_sale': 'Garage Sale',
}
WIDE_JOKERS = {'jk_intern', 'jk_perfectly_balanced', 'jk_palindrome', 'jk_six_of_one', 'jk_pacifist_millionaire', 'jk_uncrowned',
               'jk_compound_interest', 'jk_early_checkout', 'jk_contradiction', 'jk_main_character', 'jk_cash_poor', 'jk_pacifist_dilemma',
               'jk_stat_anomaly', 'jk_two_jobs'}

FAMILY = {
 'CB-01':'damage','CB-03':'damage','CB-21':'damage','CB-19':'damage','SL-25':'damage','CB-17':'damage',
 'CB-05':'kills','CB-09':'kills','CB-34':'kills','CB-35':'kills','CB-37':'kills','CB-38':'kills','CB-39':'kills','CB-40':'kills','CB-41':'kills','CB-49':'kills','CB-42':'kills','CB-43':'kills',
 'CB-07':'assists',
 'SV-01':'deaths','SV-03':'deaths','SV-05':'deaths','SV-07':'deaths','SV-29':'deaths','SV-30':'deaths','SV-31':'deaths','SV-33':'deaths',
 'SV-09':'tank','SV-11':'tank','SV-13':'tank',
 'SV-16':'heal','SV-17':'heal','SV-19':'heal','SV-20':'heal','SV-25':'heal','SV-27':'heal','SV-23':'heal','SV-24':'heal','SV-22':'heal','SV-21':'antiheal',
 'SL-01':'farm','SL-03':'lane','SL-05':'farm','SL-07':'farm','SL-09':'lane','SL-11':'lane','SL-12':'farm','SL-36':'lane','SL-24':'farm','SL-37':'lane','SL-14':'loot','SL-15':'loot','SL-16':'loot',
 'SL-20':'spend','SL-22':'spend',
 'CB-11':'aim','CB-13':'aim','CB-15':'aim','CB-27':'aim','CB-28':'aim','CB-31':'aim','CB-46':'aim','CB-47':'aim',
 'OB-01':'obj','OB-03':'obj','OB-06':'obj',
 'CB-24':'control','CB-26':'control','CB-23':'melee','CB-29':'melee','CB-30':'melee','CB-36':'melee','CB-32':'fight','CB-45':'fight',
}
DEFAULT_OPTS = dict(detail_cap='epic', family=False, joker_max=2, joker_maxfreq=.25, size_rule='bible', detail_shift=False, hero_guard=False)
TIERS = ['common', 'rare', 'epic', 'legendary', 'mythical']
CUT = {'common': .40, 'rare': .25, 'epic': .10, 'legendary': .01, 'mythical': .001}
TPTS = {'common': 1, 'rare': 3, 'epic': 9, 'legendary': 27, 'mythical': 81}
SPTS = {'common': 0, 'rare': 1, 'epic': 3, 'legendary': 10, 'mythical': 30}

def freq_tier(f, allow_common=False):
    if f <= .001: return 'mythical'
    if f <= .01: return 'legendary'
    if f <= .10: return 'epic'
    if f <= .25: return 'rare'
    if allow_common and f <= .40: return 'common'
    return None

def split_rows(W):
    mids = np.sort(W.match_id.unique())
    rng = np.random.default_rng(0); test = rng.random(len(mids)) < 0.25
    hold = set(mids[test])
    return W[~W.match_id.isin(hold)].copy(), W[W.match_id.isin(hold)].copy()

def tval(df, stat, kind):
    v = df[stat].astype(float)
    if kind == 'rate': v = v / (df.dur / 60.0)
    if kind == 'fixed':
        need = 960 if stat in ('souls15', 'obj15', 'level15') else 600
        v = v.where(df.dur >= need)
    return v

class Norms:
    """Per-stat distributions. Wide stats: from training rows (hero x length bucket, P25 widening).
    Rich stats: pooled hero-standardized from the dealt population itself (approximation)."""
    def __init__(self, train, pop):
        self.t = {}
        for c in CARDS:
            stat, kind, src = c[4], c[6], c[8]
            base = train if src == 'W' else pop
            if stat not in base: continue
            d = pd.DataFrame({'hero': base.hero, 'b': base.dur.map(bucket) if kind != 'fixed' and src == 'W' else 0,
                              'v': tval(base, stat, kind), 'tier': base.lobby_tier.map(band) if 'lobby_tier' in base else None}).dropna(subset=['v'])
            hb = {k: np.sort(g.v.values) for k, g in d.groupby(['hero', 'b'])}
            ha = {k: np.sort(g.v.values) for k, g in d.groupby('hero')}
            def stats_of(a):
                med = np.median(a); q75, q25 = np.percentile(a, [75, 25]); s = (q75 - q25) / 1.349
                if s <= 0: q90, q10 = np.percentile(a, [90, 10]); s = (q90 - q10) / 2.563
                if s <= 0: s = a.std() + 1e-9
                return med, s
            ms = {}
            for k, a in hb.items():
                aa = a if len(a) >= 150 else ha[k[0]]
                ms[k] = stats_of(aa) if len(aa) else (0, 1)
            key = list(zip(d.hero, d.b))
            med = np.array([ms[k][0] for k in key]); sc = np.array([ms[k][1] for k in key])
            z = np.sort((d.v.values - med) / sc)
            # rank-band factor: mean(v)/mean(hero-bucket median) within band
            fac = {}
            d2 = d.assign(med=med)
            for bnd, g in d2[d2.tier.notna() & (d2.med > 0)].groupby('tier'):
                fac[bnd] = float(np.clip(np.median(g.v / g.med), 0.5, 2.0)) if len(g) >= 200 else 1.0
            self.t[c[0]] = dict(hb=hb, ha=ha, ms=ms, z=z, fac=fac, src=src, kind=kind)

    def pct(self, cid, hero, dur, v, tier_band=None, by_rank=False):
        T = self.t[cid]; b = bucket(dur) if T['kind'] != 'fixed' and T['src'] == 'W' else 0
        if by_rank and tier_band in T['fac']: v = v / T['fac'][tier_band]
        key = (hero, b)
        if key not in T['ms']: return None
        med, sc = T['ms'][key]
        z = (v - med) / sc; Z = T['z']
        gz = (len(Z) - np.searchsorted(Z, z, 'left')) / len(Z); bz = np.searchsorted(Z, z, 'right') / len(Z)
        if T['src'] == 'R':
            return dict(g1=gz, b1=bz, gl=gz, bl=bz, gz=gz, bz=bz, med=med, n=len(Z), v=v)
        a1 = T['hb'].get(key, np.array([]))
        if len(a1) < 150: a1 = T['ha'].get(hero, np.array([]))
        al = T['hb'].get(key, np.array([]))
        if len(al) < 1000: al = T['ha'].get(hero, np.array([]))
        if len(a1) == 0: return None
        def gb(a): return (len(a) - np.searchsorted(a, v, 'left')) / len(a), np.searchsorted(a, v, 'right') / len(a)
        g1, b1 = gb(a1); gl, bl = gb(al)
        return dict(g1=g1, b1=b1, gl=gl, bl=bl, gz=gz, bz=bz, med=np.median(a1), n=len(a1), v=v)

def tier_from(g1, gl, gz):
    if g1 > .40: return None
    t = 'common' if g1 > .25 else 'rare' if g1 > .10 else 'epic'
    if t == 'epic' and gl <= .01:
        t = 'legendary'
        if gz <= .001: t = 'mythical'
    return t

def depth(t, g):
    i = TIERS.index(t)
    c = CUT[t]; nxt = CUT[TIERS[i + 1]] if i + 1 < len(TIERS) else c / 10
    return 0.5 * min(1, max(0, (math.log(c) - math.log(max(g, 1e-6))) / (math.log(c) - math.log(nxt))))

def candidates(pop, norms, by_rank=False, rich=True):
    """Return per row list of candidate cards (dicts) BEFORE P3 cap (raw tier stored)."""
    out = [[] for _ in range(len(pop))]
    pcts = {}  # (row, cid) -> (g,b) headline wide for joker combos
    recs = pop.to_dict('records')
    for c in CARDS:
        cid, tg, tb, suit, stat, dirn, kind, head, src = c
        if cid not in norms.t or (src == 'R' and not rich): continue
        vals = tval(pop, stat, kind).values
        for i, r in enumerate(recs):
            v = vals[i]
            if v is None or (isinstance(v, float) and np.isnan(v)): continue
            p = norms.pct(cid, r['hero'], r['dur'], v, band(r['lobby_tier']), by_rank)
            if p is None: continue
            if dirn == 1: good, bad = (p['g1'], p['gl'], p['gz']), (p['b1'], p['bl'], p['bz'])
            else: good, bad = (p['b1'], p['bl'], p['bz']), (p['g1'], p['gl'], p['gz'])
            pcts[(i, cid)] = (good[0], bad[0])
            med = p['med']
            # eligibility floor
            if tg and not (dirn == 1 and v <= 0):
                t = tier_from(*good)
                if t: out[i].append(dict(id=cid, title=tg, suit=suit, side='good', tier=t, head=head, g=good[0], gfine=min(good), kind='stat', value=r[stat], stat=stat))
            if tb and med != 0 and not (dirn == -1 and v <= 0 and med <= 0):
                t = tier_from(*bad)
                if t: out[i].append(dict(id=cid, title=tb, suit=suit, side='bad', tier=t, head=head, g=bad[0], gfine=min(bad), kind='stat', value=r[stat], stat=stat))
    return out, pcts, recs

def combo_jokers(pop, pcts):
    n = len(pop); J = defaultdict(lambda: np.zeros(n, bool))
    heads = [c[0] for c in CARDS if c[7]]
    suit_of = {c[0]: c[3] for c in CARDS}
    for i in range(n):
        G = lambda cid: pcts.get((i, cid), (1, 1))[0]; B = lambda cid: pcts.get((i, cid), (1, 1))[1]
        J['jk_contradiction'][i] = G('CB-01') <= .10 and B('SV-01') <= .10
        J['jk_main_character'][i] = G('CB-07') <= .05 and B('CB-05') <= .25
        J['jk_cash_poor'][i] = B('SL-01') <= .25 and G('CB-03') <= .10
        J['jk_pacifist_dilemma'][i] = B('CB-01') <= .10 and (G('CB-07') <= .10 or G('OB-01') <= .10)
        hv = [G(h) for h in heads if (i, h) in pcts]
        J['jk_stat_anomaly'][i] = any(x <= .01 for x in hv) and sum(.45 <= x <= .55 for x in hv) >= 5
        suits = defaultdict(bool)
        for cid in [c[0] for c in CARDS if (i, c[0]) in pcts]:
            if G(cid) <= .25: suits[suit_of[cid]] = True
        J['jk_two_jobs'][i] = sum(suits.values()) == 2
    return J

def tail_jokers(pop):
    """Top/bottom tail path & misc jokers: pooled hero-standardized 1.5% tails within the population."""
    J = {}
    def z(col, rate=False):
        v = pop[col].astype(float) / (pop.dur / 60.0 if rate else 1)
        g = v.groupby(pop.hero)
        med = g.transform('median'); iq = (g.transform(lambda x: x.quantile(.75)) - g.transform(lambda x: x.quantile(.25))) / 1.349
        return (v - med) / iq.replace(0, np.nan)
    if 'distance' in pop:
        zd = z('distance', True); tk_med = pop.groupby('hero').takedowns.transform('median')
        J['jk_scenic_route'] = (zd >= zd.quantile(.985)) & (pop.takedowns >= tk_med)
        J['jk_homebody'] = zd <= zd.quantile(.015)
        zm = z('mate_dist'); J['jk_lone_wolf'] = zm >= zm.quantile(.985); J['jk_velcro'] = zm <= zm.quantile(.015)
        zl = z('lucky_shots', True); J['jk_lucky_shot'] = zl >= zl.quantile(.985)
        zp = z('power_pickups'); J['jk_power_collector'] = zp >= zp.quantile(.985)
        J['jk_garage_sale'] = pop.items_sold >= pop.items_sold.quantile(.985)
    return {k: v.fillna(False).values for k, v in J.items()}

def deal_all(pop, norms, p3=True, by_rank=False, rich=True, joker_set=None, seed=0, opts=None):
    o = dict(DEFAULT_OPTS); o.update(opts or {})
    if not p3: o['detail_cap'] = None
    cands, pcts, recs = candidates(pop, norms, by_rank, rich)
    n = len(pop)
    J = dict(combo_jokers(pop, pcts))
    if rich: J.update(tail_jokers(pop))
    jcols = [j for j in JOKERS if (rich or j in WIDE_JOKERS) and (j in J or j in pop)]
    jfreq = {}; jarr = {}; jhero = {}
    for j in jcols:
        a = J[j] if j in J else pop[j].fillna(False).astype(bool).values
        jarr[j] = a; jfreq[j] = a.mean(); jhero[j] = pd.Series(a).groupby(pop.hero.values).transform('mean').values
    evfreq = {}; evarr = {}
    for e in EVENTS:
        if (rich or e[3] in WIDE_EVENTS) and e[3] in pop:
            a = pop[e[3]].fillna(False).astype(bool).values; evarr[e[3]] = a; evfreq[e[3]] = a.mean()
    # crown
    crown_t = [None] * n
    mvpm = []
    sc = pop.valve_score.values; mid = pop.match_id.values
    margins = np.full(n, np.nan)
    for m_, idx in pop.groupby('match_id').indices.items():
        s = sc[idx]
        for k in idx:
            if recs[k]['mvp'] == 1:
                others = np.delete(s, list(idx).index(k)); margins[k] = sc[k] - others.max()
    mm = margins[~np.isnan(margins)]
    lc, mc = np.quantile(mm, .88), np.quantile(mm, .988)
    for k in range(n):
        if not np.isnan(margins[k]): crown_t[k] = 'mythical' if margins[k] >= mc else 'legendary' if margins[k] >= lc else 'epic'
    # assemble candidate lists
    for i in range(n):
        L = cands[i]
        for c in L:
            c['raw_tier'] = c['tier']
            if o['detail_cap'] and not c['head'] and TIERS.index(c['tier']) > TIERS.index(o['detail_cap']): c['tier'] = o['detail_cap']
            if o['detail_shift'] and not c['head']:
                k = TIERS.index(c['raw_tier']) - 1
                c['tier'] = TIERS[min(k, 2)] if k >= 0 else None
        L[:] = [c for c in L if c['tier']]
        for e in EVENTS:
            if e[3] in evarr and evarr[e[3]][i]:
                t = freq_tier(evfreq[e[3]], allow_common=True)
                if t: L.append(dict(id=e[0], title=e[1], suit=e[2], side=e[4], tier=t, raw_tier=t, head=0, g=evfreq[e[3]], gfine=evfreq[e[3]], kind='event'))
        for j in jcols:
            if jarr[j][i] and not (o['hero_guard'] and jhero[j][i] > .25):
                t = freq_tier(jfreq[j]) if jfreq[j] <= o['joker_maxfreq'] else None
                if t: L.append(dict(id=j, title=JOKERS[j], suit='joker', side='good', tier=t, raw_tier=t, head=0, g=jfreq[j], gfine=jfreq[j], kind='joker'))
        if crown_t[i]: L.append(dict(id='CROWN', title='The Crown', suit='crown', side='good', tier=crown_t[i], raw_tier=crown_t[i], head=1, g=None, kind='crown'))
        for c in L:
            g = c['gfine'] if c.get('gfine') is not None else CUT[c['tier']]
            gg = max(g, CUT[c['tier']] / 10) if c['kind'] != 'stat' or not p3 or c['head'] else max(g, .01)
            c['interest'] = TPTS[c['tier']] * (1 + (depth(c['tier'], g) if c['kind'] == 'stat' else 0.25)) * (1.1 if c['head'] else 0.9)
        if o['family']:
            best = {}
            for c in L:
                if c['kind'] in ('stat', 'event'):
                    k = (FAMILY.get(c['id'], c['id']), c['side'])
                    if k not in best or c['interest'] > best[k]['interest']: best[k] = c
            keep = set(id(c) for c in best.values())
            cands[i] = L = [c for c in L if c['kind'] not in ('stat', 'event') or id(c) in keep]
    gs = np.array([sum(SPTS[c['tier']] for c in L if c['side'] == 'good') for L in cands])
    bs = np.array([sum(SPTS[c['tier']] for c in L if c['side'] == 'bad') for L in cands])
    # faster: use searchsorted
    def size_of(p):
        return 4 if p < .30 else 5 if p < .60 else 6 if p < .80 else 7 if p < .92 else 8 if p < .97 else 9 if p < .98 else 10 if p < .99 else 11 if p < .995 else 12 if p < .999 else 13
    gsort = np.sort(gs); bsort = np.sort(bs)
    hands = []
    for i in range(n):
        L = cands[i]
        gp = np.searchsorted(gsort, gs[i], 'left') / n; bp = np.searchsorted(bsort, bs[i], 'left') / n
        if o['size_rule'] == 'bible': target = max(size_of(gp), min(6, size_of(bp)))
        else: target = max(size_of(gp), min(6, size_of(bp), size_of(gp) + 1))
        atro = bp >= .95 and gp <= .30
        must = [c for c in L if c['tier'] in ('legendary', 'mythical') and c['kind'] != 'joker']
        jk = sorted([c for c in L if c['kind'] == 'joker'], key=lambda c: c['g'])[:o['joker_max']]
        must += jk
        must = sorted(must, key=lambda c: -c['interest'])
        forced_over = len(must) > target
        if len(must) > 13: must = must[:13]
        size = max(target, len(must)); size = min(size, 13)
        rest = [c for c in L if c not in must and c['kind'] != 'joker' and c['tier'] in ('rare', 'epic')]
        if atro: rest = [c for c in rest if c['side'] == 'bad' or c['tier'] == 'epic']
        open_ = size - len(must)
        gstr, bstr = gs[i], bs[i]
        nbad = round(open_ * bstr / (gstr + bstr)) if gstr + bstr > 0 else 0
        goods = sorted([c for c in rest if c['side'] == 'good'], key=lambda c: -c['interest'])
        bads = sorted([c for c in rest if c['side'] == 'bad'], key=lambda c: -c['interest'])
        pick_b = bads[:nbad]; pick_g = goods[:open_ - len(pick_b)]
        if len(pick_g) < open_ - len(pick_b): pick_b = bads[:open_ - len(pick_g)]
        # positive rule
        if not atro and not any(c['side'] == 'good' for c in must + pick_g) and goods:
            if pick_b: pick_b = pick_b[:-1]
            pick_g = [goods[0]]
        chosen = pick_g + pick_b
        # suit cap among non-must
        cap = math.ceil(len(chosen) / 2) if chosen else 0
        for _ in range(5):
            sc_ = Counter(c['suit'] for c in chosen)
            over = [s for s, k in sc_.items() if k > cap]
            if not over: break
            s0 = over[0]; worst = min([c for c in chosen if c['suit'] == s0], key=lambda c: c['interest'])
            alt = [c for c in rest if c not in chosen and c['suit'] != s0 and c['side'] == worst['side']] or [c for c in rest if c not in chosen and c['suit'] != s0]
            if not alt: break
            chosen.remove(worst); chosen.append(max(alt, key=lambda c: c['interest']))
        hand = must + chosen
        filler = []
        if len(hand) < 4:
            commons = [c for c in L if c['tier'] == 'common' and c not in hand]
            gc = sorted([c for c in commons if c['side'] == 'good'], key=lambda c: -c['interest'])
            bc = sorted([c for c in commons if c['side'] == 'bad'], key=lambda c: -c['interest'])
            filler = (gc + bc)[:4 - len(hand)]
            hand = hand + filler
        mids = 4 - len(hand) if len(hand) < 4 else 0
        hands.append(dict(i=i, cards=hand, size=len(hand) + mids, middles=mids, target=target, forced_over=forced_over,
                          gs=gstr, bs=bstr, gp=gp, bp=bp, atro=atro, short=(len(hand) + mids) < target, ncand=len(L)))
    return hands, cands, dict(jfreq=jfreq, evfreq=evfreq, margins=(lc, mc), recs=recs)
