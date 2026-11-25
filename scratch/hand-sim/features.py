"""Per player-game features for the hand simulation.
wide_* : stats available in the 24k scoreboard+snapshot set (rows/snaps) AND in full match files.
rich_* : only in full match files (Set A, 500 matches).
events : boolean/count triggers (event cards and Jokers), measured by prevalence.
"""
import json, glob, os, math, numpy as np, pandas as pd
from collections import defaultdict, Counter
from load import load_rows, load_snaps, D

HT = json.load(open('/mnt/user-data/uploads/Desktop/Deadlock Mods/Compare overlay/Data/mvp_fit/spec/hero_table.json'))

def valve_score(hero, k, a, d, nw, obj, dah):
    h = HT['heroes'].get(str(hero)) or HT['fallback']
    x = [k, a, d, nw, obj, dah]
    return sum(p * (xi - m) for p, xi, m in zip(h['ppu'], x, h['mean'])) + h['offset']

def life_stats(death_t, death_dur, dur):
    # longest life, time dead share
    t0 = 0; longest = 0; dead = 0
    for t, dd in sorted(zip(death_t, death_dur)):
        longest = max(longest, t - t0); t0 = t + dd; dead += min(dd, max(0, dur - t))
    longest = max(longest, dur - t0)
    return longest, dead / dur

def revolving(death_t):
    s = sorted(death_t)
    return any(s[i + 2] - s[i] <= 180 for i in range(len(s) - 2))

def interp(ts, arr, t):
    if not ts: return None
    if t <= ts[0]: return arr[0] * t / ts[0] if ts[0] else arr[0]
    for i in range(1, len(ts)):
        if ts[i] >= t:
            f = (t - ts[i - 1]) / max(1, ts[i] - ts[i - 1]); return arr[i - 1] + f * (arr[i] - arr[i - 1])
    return arr[-1]

def wide_common(r, s):
    """r: dict of final stats, s: dict snapshot info (ts, nw, death_t, death_dur, nw540, nw900, bd900, pd540)."""
    dur = r['duration_s']; f = {}
    k, d, a = r['kills'], r['deaths'], r['assists']
    f.update(kills=k, deaths=d, assists=a, takedowns=k + a, hero_dmg=r['player_damage'],
             full_output=r['player_damage'] + r['teammate_healing'], ally_heal=r['teammate_healing'],
             self_heal=r['self_healing'], total_heal=r['player_healing'], dmg_taken=r['player_damage_taken'],
             mitigated=r['damage_mitigated'], absorbed=r['damage_absorbed'], heal_prev=r['heal_prevented'],
             ally_barrier=r['teammate_barriering'], souls=r['net_worth'], lane_cs=r['creep_kills'],
             denies=r['denies'], neutral_kills=r['neutral_kills'], obj_dmg=r['boss_damage'],
             death_loss=r['gold_death_loss'])
    sh = (r['shots_hit'] or 0); sm = (r['shots_missed'] or 0)
    f['shots'] = sh + sm; f['accuracy'] = sh / (sh + sm) if sh + sm >= 50 else np.nan
    f['dmg_per_soul'] = r['player_damage'] / r['net_worth'] * 1000 if r['net_worth'] else np.nan
    if s is not None:
        f['souls9'] = s.get('nw540'); f['souls15'] = s.get('nw900'); f['obj15'] = s.get('bd900')
        dt = s.get('death_t') or []; dd = s.get('death_dur') or []
        if len(dt) == d or True:
            lg, share = life_stats(dt, dd, dur); f['longest_life'] = lg; f['time_dead'] = share
        f['early_souls_share'] = (s['nw540'] / r['net_worth']) if s.get('nw540') and r['net_worth'] and dur >= 1200 else np.nan
        f['ev_revolving_door'] = revolving(dt)
        pd540 = s.get('pd540')
        f['jk_early_checkout'] = bool(pd540 is not None and r['player_damage'] > 3000 and pd540 >= 0.7 * r['player_damage'] and dur >= 1500)
        if s.get('ts') and s.get('nw'):
            nw70 = interp(s['ts'], s['nw'], 0.7 * dur)
            f['jk_compound_interest'] = bool(nw70 is not None and r['net_worth'] - nw70 >= 0.5 * r['net_worth'])
    # scoreboard Jokers
    f['jk_intern'] = k <= 1 and d <= 1 and a <= 1
    f['jk_perfectly_balanced'] = k == d == a and k >= 2
    f['jk_palindrome'] = k >= 2 and k == a and d == 2 * k
    lvl = r.get('player_level') or r.get('level') or 0
    f['jk_six_of_one'] = sum(x == 6 for x in [k, d, a, lvl]) + (r['last_hits'] % 10 == 6) >= 3
    f['valve_score'] = valve_score(r['hero_id'], k, a, d, r['net_worth'], r['boss_damage'], r['player_damage'] + r['teammate_healing'])
    return f

# ---------------- rows/snaps (training + Set C) ----------------
def build_wide_rows():
    p = D + '/wide_rows.pkl'
    if os.path.exists(p): return pd.read_pickle(p)
    R = load_rows(); S = load_snaps().set_index(['match_id', 'player_slot'])
    cnt = R.groupby('match_id').player_slot.transform('count'); R = R[cnt == 12]
    out = []
    Sd = S.to_dict('index')
    for r in R.to_dict('records'):
        s = Sd.get((r['match_id'], r['player_slot']))
        f = wide_common(r, s)
        f.update(match_id=r['match_id'], slot=r['player_slot'], hero=r['hero_id'], dur=r['duration_s'],
                 team=r['team'], won=bool(r['won']), mvp=r['mvp_rank'], ranked=r['match_mode'] == 'Ranked',
                 lobby_tier=(r['average_badge'] // 10) if r['average_badge'] else None,
                 own_tier=(r['player_rank_initial_display_rank'] // 10) if r['player_rank_initial_display_rank'] else None,
                 has_snap=s is not None, abandon=r['abandon_match_time_s'] or 0)
        if s is not None: f['_death_t'] = s['death_t']
        out.append(f)
    df = pd.DataFrame(out)
    lobby_events(df)
    df.to_pickle(p); return df

def lobby_events(df):
    # first death of the match (Opening Night), Pacifist Millionaire, Uncrowned
    df['ev_opening_night'] = False; df['jk_pacifist_millionaire'] = False; df['jk_uncrowned'] = False
    for mid, g in df.groupby('match_id'):
        if '_death_t' in g and g['_death_t'].notna().all():
            firsts = [(min(x) if len(x) else 1e9) for x in g['_death_t']]
            m = min(firsts)
            if m < 1e9:
                df.loc[g.index[[x == m for x in firsts]], 'ev_opening_night'] = True
        top2 = g.souls.nlargest(2).index
        df.loc[[i for i in top2 if df.at[i, 'kills'] <= 1], 'jk_pacifist_millionaire'] = True
        best = g.valve_score.idxmax()
        if not df.at[best, 'won']: df.at[best, 'jk_uncrowned'] = True

# ---------------- full match files (Set A) ----------------
CAT = {'Bullet': 'gun_dmg', 'Ability': 'ability_dmg', 'Melee': 'melee_dmg'}
RARE_SRC = {13: 'goose', 10: 'trophy', 11: 'cultist', 9: 'assassinate', 5: 'treasure', 12: 'breakable'}

def path_xy(p):
    xr = 16383.0
    X = np.array(p['x_pos'], float) / xr * (p['x_max'] - p['x_min']) + p['x_min']
    Y = np.array(p['y_pos'], float) / xr * (p['y_max'] - p['y_min']) + p['y_min']
    return X, Y

def build_full():
    p = D + '/full.pkl'
    if os.path.exists(p): return pd.read_pickle(p)
    out = []
    for fn in sorted(glob.glob(D + '/matches/*.json')):
        out.extend(full_match(json.load(open(fn))['match_info']))
    df = pd.DataFrame(out)
    df['_death_t'] = df['_dt']
    lobby_events(df)
    df.to_pickle(p); return df

def full_match(m):
    dur = m['duration_s']; P = m['players']; slots = {p['player_slot']: p for p in P}
    team = {p['player_slot']: p['team'] for p in P}
    ranks = [((p.get('player_rank_data') or {}).get('initial_display_rank') or 0) // 10 for p in P]
    rk = [x for x in ranks if x > 0]; lobby_tier = round(sum(rk) / len(rk)) if rk else None
    paths = {pp['player_slot']: pp for pp in (m.get('match_paths') or {}).get('paths', [])}
    XY = {s: path_xy(pp) for s, pp in paths.items()}
    # kills list: (t, killer, victim, ttk, dist)
    kills = []
    for p in P:
        for dd in p['death_details']:
            kp, dp = dd.get('killer_pos') or {}, dd.get('death_pos') or {}
            dist = math.hypot(kp.get('x', 0) - dp.get('x', 0), kp.get('y', 0) - dp.get('y', 0)) if kp and dp else np.nan
            kills.append((dd['game_time_s'], dd['killer_player_slot'], p['player_slot'], dd.get('time_to_kill_s') or np.nan, dist, dd['death_duration_s']))
    kills.sort()
    last_kill_t = max([k[0] for k in kills], default=None); first_kill = kills[0] if kills else None
    # damage matrix aggregates
    dmx = m.get('damage_matrix') or {}; sd = dmx.get('source_details') or {'stat_type': [], 'source_name': []}
    agg = defaultdict(lambda: defaultdict(float)); per_target = defaultdict(lambda: defaultdict(float)); heal_t = defaultdict(lambda: defaultdict(float))
    regen = defaultdict(lambda: defaultdict(float))
    for dl in dmx.get('damage_dealers', []):
        s = dl['dealer_player_slot']
        if s not in team: continue
        for src in dl['damage_sources']:
            i = src['source_details_index']; st = sd['stat_type'][i]; nm = sd['source_name'][i]
            for t in src['damage_to_players']:
                if not t['damage']: continue
                v = t['damage'][-1]; tg = t['target_player_slot']
                enemy = tg in team and team[tg] != team[s]
                if st == 0 and enemy and nm in CAT: agg[s][CAT[nm]] += v; per_target[s][tg] += v
                elif st == 6 and enemy:
                    if nm.endswith('Slow'): agg[s]['slow_s'] += v / 1000
                    else: agg[s]['hard_cc_s'] += v / 1000
                elif st == 1 and tg in team and team[tg] == team[s] and tg != s: heal_t[s][tg] += v
                elif st == 5 and tg == s:
                    if 'fountain' in nm: regen[s]['fountain'] += v
                    elif 'medic_trooper' in nm: regen[s]['medic'] += v
                    elif 'pickup_health' in nm: regen[s]['orb'] += v
    pauses = m.get('match_pauses') or []
    mid_boss_t = [(b['destroyed_time_s'], b.get('team_claimed')) for b in (m.get('mid_boss') or [])]
    rows = []
    for p in P:
        s = p['player_slot']; st = p['stats']; fin = st[-1]
        snap = {x['time_stamp_s']: x for x in st}
        r = dict(duration_s=dur, hero_id=p['hero_id'], kills=p['kills'], deaths=p['deaths'], assists=p['assists'],
                 net_worth=p['net_worth'], last_hits=p['last_hits'], denies=p['denies'], player_level=p['level'])
        for c in ['player_damage', 'teammate_healing', 'self_healing', 'player_healing', 'player_damage_taken', 'damage_mitigated',
                  'damage_absorbed', 'heal_prevented', 'teammate_barriering', 'creep_kills', 'neutral_kills', 'boss_damage',
                  'gold_death_loss', 'shots_hit', 'shots_missed']:
            r[c] = fin.get(c) or 0
        dts = [d['game_time_s'] for d in p['death_details']]; dds = [d['death_duration_s'] for d in p['death_details']]
        sn = dict(nw540=snap.get(540, {}).get('net_worth'), nw900=snap.get(900, {}).get('net_worth'),
                  bd900=snap.get(900, {}).get('boss_damage'), pd540=snap.get(540, {}).get('player_damage'),
                  death_t=dts, death_dur=dds, ts=[x['time_stamp_s'] for x in st], nw=[x['net_worth'] for x in st])
        f = wide_common(r, sn)
        f.update(match_id=m['match_id'], slot=s, hero=p['hero_id'], dur=dur, team=p['team'],
                 won=p['team'] == m['winning_team'], mvp=p['mvp_rank'], ranked=m['match_mode'] == 4,
                 lobby_tier=lobby_tier, own_tier=(((p.get('player_rank_data') or {}).get('initial_display_rank') or 0) // 10) or None,
                 account=p['account_id'], has_snap=True, abandon=p.get('abandon_match_time_s') or 0, _dt=dts)
        # ---- rich stats ----
        cus = {c['id']: c['value'] for c in fin.get('custom_user_stats') or []}
        a = agg[s]
        f.update(gun_dmg=a['gun_dmg'], ability_dmg=a['ability_dmg'], melee_dmg=a['melee_dmg'], hard_cc_s=a['hard_cc_s'], slow_s=a['slow_s'])
        f['hero_hit_rate'] = cus.get(2, 0) / cus[1] if cus.get(1, 0) >= 50 else np.nan
        f['headshot_share'] = cus.get(3, 0) / cus[2] if cus.get(2, 0) >= 30 else np.nan
        fo = cus.get(57, 0) + cus.get(22, 0) + cus.get(27, 0)
        f['no_falloff_share'] = cus.get(57, 0) / fo if fo >= 30 else np.nan
        f['max_falloff_share'] = cus.get(27, 0) / fo if fo >= 30 else np.nan
        f['parries'] = cus.get(61, 0); f['parry_miss'] = cus.get(58, 0); f['immobile_hits'] = cus.get(5, 0)
        f['lucky_shots'] = cus.get(4, 0); f['unspent_souls_min'] = cus.get(17, np.nan); f['unspent_ap_min'] = cus.get(18, np.nan)
        f['comeback_souls'] = cus.get(46, 0)
        f['headshot_kills'] = fin.get('headshot_kills') or 0; f['ability_kills'] = fin.get('ability_kills') or 0
        f['bullet_kills'] = fin.get('bullet_kills') or 0; f['melee_kills'] = fin.get('melee_kills') or 0
        f['heal_lost'] = fin.get('heal_lost') or 0
        pc = fin.get('possible_creeps') or 0
        f['cs_rate'] = fin.get('creep_kills', 0) / pc if pc >= 100 else np.nan
        gs = {g['source']: g['gold'] or 0 for g in fin.get('gold_sources') or []}
        f['breakable_souls'] = gs.get(12, 0); f['treasure_souls'] = gs.get(5, 0); f['boss_souls'] = gs.get(4, 0)
        f['level15'] = snap.get(900, {}).get('level') if dur >= 960 else np.nan
        f['regen_orb'] = regen[s]['orb']; f['regen_medic'] = regen[s]['medic']
        # healing distribution
        ht = heal_t[s]; tot = sum(ht.values())
        f['ev_personal_physician'] = tot >= 3000 and max(ht.values()) >= 0.5 * tot
        f['ev_group_plan'] = tot >= 3000 and sum(1 for v in ht.values() if v >= 0.05 * tot) >= 5
        # damage spread
        pt = per_target[s]; tdm = sum(pt.values())
        enemies = [x for x in team if team[x] != p['team']]
        shares = [pt.get(e, 0) / tdm for e in enemies] if tdm > 0 else []
        f['jk_personal_vendetta'] = tdm >= 10000 and max(shares) >= 0.6
        f['jk_no_favorites'] = tdm >= 15000 and len(shares) == 6 and min(shares) >= 0.12
        # kills/deaths events
        myk = [k for k in kills if k[1] == s]; myd = [k for k in kills if k[2] == s]
        kt = [k[0] for k in myk]
        def chain(n):
            best = 1; cur = 1
            for i in range(1, len(kt)):
                cur = cur + 1 if kt[i] - kt[i - 1] <= 10 else 1; best = max(best, cur)
            return len(kt) > 0 and best >= n
        f['ev_double_dip'] = chain(2) and not chain(3); f['ev_hat_trick'] = chain(3) and not chain(4); f['ev_four_course'] = chain(4)
        # kill streak without dying
        ev = sorted([(k[0], 'k') for k in myk] + [(k[0] + 0.5, 'd') for k in myd]); cur = best = 0
        for _, t in ev:
            cur = cur + 1 if t == 'k' else 0; best = max(best, cur)
        f['kill_streak'] = best; f['ev_on_a_heater'] = best >= 5
        f['ev_first_blood'] = bool(first_kill and first_kill[1] == s)
        f['ev_last_word'] = bool(kills and kills[-1][1] == s)
        f['ev_haymaker'] = f['melee_kills'] >= 1
        vic = Counter(k[2] for k in myk); kil = Counter(k[1] for k in myd)
        f['ev_season_pass'] = bool(vic) and max(vic.values()) >= 4
        f['ev_frequent_customer'] = bool(kil) and max(kil.values()) >= 4
        f['ev_melted'] = sum(1 for k in myd if k[3] == k[3] and k[3] < 3) >= 2
        f['quick_draw'] = min([k[3] for k in myk if k[3] == k[3]], default=np.nan)
        f['long_range'] = max([k[4] for k in myk if k[4] == k[4]], default=np.nan)
        f['jk_same_time_tomorrow'] = any(vic[e] >= 3 and kil[e] >= 3 for e in vic)
        f['jk_you_again'] = len(myk) >= 3 and len(myd) >= 3 and any(vic[e] >= 3 and kil[e] >= 3 and vic[e] >= 0.4 * len(myk) and kil[e] >= 0.4 * len(myd) for e in vic)
        f['jk_nemesis_clause'] = any(vic[e] >= 4 and kil.get(e, 0) == 0 and (len(myk) - vic[e]) <= (len(myd) - kil.get(e, 0)) for e in vic)
        trades = sum(1 for k in myk if any(abs(k[0] - d[0]) <= 3 for d in myd)); f['jk_mad'] = trades >= 2
        f['jk_absolutely_calculated'] = any(any(d[0] <= k[0] <= d[0] + d[5] for d in myd) for k in myk)
        f['jk_everyone_gets_one'] = len(set(vic)) >= 6
        f['jk_photo_finish'] = any(k[0] >= dur - 10 for k in myk + myd)
        f['jk_opening_statement'] = bool(kt) and kt[0] < 300 and (len(kt) == 1 or kt[1] - kt[0] >= 600)
        f['jk_closing_argument'] = len(kt) >= 5 and sum(1 for t in kt if t >= 0.75 * dur) >= 0.6 * len(kt)
        f['jk_return_to_sender'] = any(any(k[2] == d[1] and 0 < k[0] - d[0] <= 30 for k in myk) for d in myd)
        f['jk_boomerang'] = any(any(k[2] == d[1] and 0 <= k[0] - (d[0] + d[5]) <= 20 for k in myk) for d in myd)
        first6 = [d[1] for d in myd[:6]]; f['jk_take_a_number'] = len(first6) == 6 and len(set(first6)) == 6
        evs = sorted([(k[0], 'k') for k in myk] + [(d[0], 'd') for d in myd]); alt = 1; bestalt = 0
        for i in range(1, len(evs)):
            alt = alt + 1 if evs[i][1] != evs[i - 1][1] else 1; bestalt = max(bestalt, alt)
        f['jk_ping_pong'] = bestalt >= 6
        allme = sorted(kt + [d[0] for d in myd]); gaps = [b - a for a, b in zip([600] + allme, allme + [min(dur, dur - 300)]) ]
        f['jk_long_silence'] = dur >= 1800 and any(g >= 720 for g in [b - a for a, b in zip([600] + [t for t in allme if 600 <= t <= dur - 300], [t for t in allme if 600 <= t <= dur - 300] + [dur - 300])])
        f['jk_clockwork'] = False
        if len(kt) >= 4:
            for i in range(len(kt) - 3):
                g = np.diff(kt[i:i + 4])
                if g.min() >= 20 and g.max() - g.min() <= 2: f['jk_clockwork'] = True
        # last one standing: alive while >=4 teammates dead
        mates = [x for x in team if team[x] == p['team'] and x != s]
        dead_iv = defaultdict(list)
        for k in kills: dead_iv[k[2]].append((k[0], k[0] + k[5]))
        def is_dead(x, t): return any(a <= t < b for a, b in dead_iv[x])
        f['jk_last_one_standing'] = any(not is_dead(s, t) and sum(is_dead(x, t) for x in mates) >= 5 for t in sorted(set(k[0] + 1 for k in kills if k[2] in mates)))
        # paths
        pp = paths.get(s)
        if pp:
            X, Y = XY[s]; H = np.array(pp['health']); CT = np.array(pp['combat_type']); MT = np.array(pp['move_type'])
            n = len(X); alive = H > 0
            step = np.hypot(np.diff(X), np.diff(Y)); step[step > 1500] = 0  # drop respawn teleports
            f['distance'] = step.sum()
            f['fight_share'] = (CT == 1).mean()
            f['zip_share'] = (MT == 4).mean(); f['air_share'] = np.isin(MT, [7, 8]).mean(); f['slide_share'] = (MT == 3).mean(); f['rope_share'] = (MT == 5).mean()
            f['dashes'] = int(((MT[1:] == 2) & (MT[:-1] != 2)).sum() + ((MT[1:] == 8) & (MT[:-1] != 8)).sum())
            # nearest teammate distance while both alive
            dd = []
            for t in range(0, n, 5):
                if not alive[t]: continue
                best_ = 1e9
                for x in mates:
                    if x in XY and t < len(XY[x][0]) and paths[x]['health'][t] > 0:
                        best_ = min(best_, math.hypot(X[t] - XY[x][0][t], Y[t] - XY[x][1][t]))
                if best_ < 1e9: dd.append(best_)
            f['mate_dist'] = float(np.mean(dd)) if dd else np.nan
            # escapes: health<=10 while in combat, then >50 without dying
            esc = 0; i = 0
            while i < n:
                if 0 < H[i] <= 10 and CT[i] != 0:
                    j = i
                    while j < n and 0 < H[j] <= 50: j += 1
                    if j < n and H[j] > 50: esc += 1
                    i = j + 1
                else: i += 1
            f['jk_one_hp_dream'] = esc >= 3
            ph = False
            for i in np.where((H > 0) & (H <= 10))[0]:
                w = H[i:i + 16]
                if (w >= 90).any() and (w > 0).all(): ph = True; break
            f['jk_phoenix'] = ph
            def at(t): return min(max(int(t), 0), n - 1)
            f['jk_last_ride'] = any(MT[at(d[0] - 1)] == 4 for d in myd)
            f['jk_sky_burial'] = any(MT[at(d[0] - 1)] == 8 for d in myd)
            f['jk_drive_by'] = any(MT[at(k[0])] in (3, 8) or MT[at(k[0] - 1)] in (3, 8) for k in myk)
            # against the odds
            ato = False
            for k in myk:
                t = at(k[0]); ne = nm_ = 0
                for x in XY:
                    if x == s or t >= len(XY[x][0]): continue
                    dxy = math.hypot(X[t] - XY[x][0][t], Y[t] - XY[x][1][t])
                    if dxy <= 2500:
                        if team[x] != p['team'] and (paths[x]['health'][t] > 0 or x == k[2]): ne += 1
                        elif team[x] == p['team'] and paths[x]['health'][t] > 0: nm_ += 1
                if ne >= 3 and nm_ == 0: ato = True
            f['ev_against_the_odds'] = ato
            f['ev_boss_hunter'] = any(tc == p['team'] and math.hypot(X[at(t)], Y[at(t)]) <= 1200 and H[at(t)] > 0 for t, tc in mid_boss_t)
        f['pings'] = len(p.get('pings') or [])
        f['jk_chatterbox'] = f['pings'] >= 100
        f['jk_technical_timeout'] = any(pz.get('player_slot') == s and (pz.get('pause_duration_s') or 0) > 0 for pz in pauses)
        f['jk_film_study'] = any((w.get('player_slot') == s) for w in (m.get('watched_death_replays') or []) if isinstance(w, dict))
        f['jk_mirror'] = any(q['hero_id'] == p['hero_id'] and q['team'] != p['team'] for q in P)
        pu = p.get('power_up_buffs') or []
        f['power_pickups'] = sum(len(b.get('pickup_times_s') or []) for b in pu if b.get('is_permanent'))
        f['jk_hot_streak'] = ((p.get('player_rank_data') or {}).get('initial_win_streak') or 0) >= 5
        f['jk_side_quest'] = sum(1 for k_ in RARE_SRC if gs.get(k_, 0) > 0) >= 4
        f['jk_goose_egg'] = gs.get(13, 0) > 0; f['jk_cultist'] = gs.get(11, 0) > 0; f['jk_trophy'] = gs.get(10, 0) > 0; f['jk_contract'] = gs.get(9, 0) > 0
        items = p.get('items') or []
        sold = [it for it in items if it.get('sold_time_s')]
        f['items_sold'] = len(sold)
        f['jk_buyers_remorse'] = sum(1 for it in sold if 0 < it['sold_time_s'] - it['game_time_s'] <= 60) >= 3
        # lane pair souls at 9:00
        f['lane_pair_ratio'] = np.nan
        rows.append(f)
    # lane bully: pair by assigned_lane
    lanes = defaultdict(list)
    for p in P:
        nw = next((x['net_worth'] for x in p['stats'] if x['time_stamp_s'] == 540), None)
        lanes[(p['team'], p['assigned_lane'])].append(nw)
    for f, p in zip(rows, P):
        mine = lanes[(p['team'], p['assigned_lane'])]; theirs = lanes[(1 - p['team'], p['assigned_lane'])]
        if mine and theirs and None not in mine + theirs and len(mine) == 2 and len(theirs) == 2:
            f['lane_pair_ratio'] = sum(mine) / sum(theirs)
    return rows

if __name__ == '__main__':
    import time; t = time.time()
    W = build_wide_rows(); print('wide', W.shape, time.time() - t)
    F = build_full(); print('full', F.shape, time.time() - t)
    print(F.filter(like='jk_').mean().sort_values().to_string())
    print(F.filter(like='ev_').mean().sort_values().to_string())
