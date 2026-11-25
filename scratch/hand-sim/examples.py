import pickle, json, numpy as np
from features import build_full
from sim import band
import analyze
analyze.HERO.update({int(k):v for k,v in json.loads(open('/home/user/deadlock-compare/heroes.js').read().split('=',1)[1].strip().split('\n')[0].rstrip(';')).items()})
res=pickle.load(open('/tmp/claude-0/sim/data/final.pkl','rb'))
F=build_full().reset_index(drop=True)
pp=F.groupby('hero').valve_score.rank(pct=True).values; ob=F.own_tier.map(band).values
H=res['A_R4g_rank'][1]; HB=res['A_bible_rank'][1]
def pick(f):
    for h in H:
        if f(h): return h
picks=[]
best=max(H,key=lambda h:(h['gs'],h['i'])); picks.append(('Best game in the 500 matches',best))
picks.append(('A 10+ card hand', pick(lambda h:h['size']>=10 and h['i']!=best['i'] and F.own_tier.iloc[h['i']] and ob[h['i']]=='top')))
picks.append(('Mythical hand', pick(lambda h:any(c['tier']=='mythical' and c['side']=='good' and c['kind']=='stat' for c in h['cards']))))
mids=[h for h in H if .48<pp[h['i']]<.52 and h['size']==5]; picks.append(('Average game (middle of the pack)', mids[3]))
picks.append(('Top-rank player, average game', [h for h in H if ob[h['i']]=='top' and .45<pp[h['i']]<.55][2]))
picks.append(('Top-rank player, great game', [h for h in H if ob[h['i']]=='top' and pp[h['i']]>.95 and h['size']<10][1]))
picks.append(('Weak game, low rank', [h for h in H if ob[h['i']]=='low' and pp[h['i']]<.08][4]))
picks.append(('Atrocious game', pick(lambda h:h['atro'] and any(c['side']=='good' for c in h['cards']))))
picks.append(('Loss with a Joker', pick(lambda h:not F.won.iloc[h['i']] and any(c['id']=='jk_absolutely_calculated' for c in h['cards']))))
picks.append(('The Uncrowned', pick(lambda h:any(c['id']=='jk_uncrowned' for c in h['cards']))))
for name,h in picks:
    if h is None: print('MISSING',name); continue
    head,lines=analyze.fmt_hand(h,F)
    hb=HB[h['i']]; _,lb=analyze.fmt_hand(hb,F)
    print(f'### {name}\n{head}; Valve-score percentile on hero {pp[h["i"]]*100:.0f}%\nRecommended rules ({h["size"]} cards):'); [print('- '+l) for l in lines]
    print(f'Bible as written ({hb["size"]} cards):'); [print('- '+l) for l in lb]; print()
