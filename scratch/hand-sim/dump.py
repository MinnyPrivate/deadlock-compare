import pickle, json, numpy as np, pandas as pd
from collections import Counter, defaultdict
from features import build_full, build_wide_rows
from sim import split_rows, band, TIERS, CARDS, EVENTS, JOKERS
import analyze
analyze.HERO.update({int(k):v for k,v in json.loads(open('/home/user/deadlock-compare/heroes.js').read().split('=',1)[1].strip().split('\n')[0].rstrip(';')).items()})
res=pickle.load(open('/tmp/claude-0/sim/data/final.pkl','rb'))
F=build_full().reset_index(drop=True)
W=build_wide_rows(); train,hold=split_rows(W); hold=hold[~hold.match_id.isin(set(F.match_id))].reset_index(drop=True)
pp=F.groupby('hero').valve_score.rank(pct=True).values; ob=F.own_tier.map(band).values
G={'all':np.ones(len(F),bool),'perf bottom 10%':pp<=.1,'perf middle 40-60%':(pp>.4)&(pp<=.6),'perf top 10%':pp>.9,'perf top 2%':pp>.98,'loss':~F.won.values,'own rank low':ob=='low','own rank top':ob=='top','top rank + top 25% perf':(ob=='top')&(pp>.75)}
g=analyze.group_report(res['A_R4_rank'][1],F,G)
print('===== A_R4_rank groups')
for k,d in g.items(): print(f"{k:26s} n={d['n']:5d} size={d['mean_size']:.2f} legG={d['good_legplus']:5.1f}% good={d['good_per_hand']:.2f} bad={d['bad_per_hand']:.2f} allbad={d['all_bad']:.1f}% majbad={d['majority_bad']:.1f}% jacc={d['jaccard']:.3f} top={d['top'][:4]}")
pc=hold.groupby('hero').valve_score.rank(pct=True).values
gC=analyze.group_report(res['C_R4_rank'][1],hold,{'perf bottom 10%':pc<=.1,'perf top 2%':pc>.98,'all':np.ones(len(hold),bool)})
print('===== C_R4_rank groups')
for k,d in gC.items(): print(f"{k:26s} n={d['n']:5d} size={d['mean_size']:.2f} legG={d['good_legplus']:5.1f}% good={d['good_per_hand']:.2f} bad={d['bad_per_hand']:.2f} allbad={d['all_bad']:.1f}% majbad={d['majority_bad']:.1f}% jacc={d['jaccard']:.3f}")
# suit mix
for k in ['A_bible_rank','A_R4_rank']:
    sm=Counter()
    for h in res[k][1]:
        for c in h['cards']: sm[c['suit']]+=1
    tot=sum(sm.values()); print(k,'suit mix',{s:round(100*v/tot,1) for s,v in sm.most_common()})
# per card table
title={c[0]:(c[1] or c[2]) for c in CARDS}; title.update({e[0]:e[1] for e in EVENTS}); title.update(JOKERS); title['CROWN']='The Crown'
for k in ['A_bible_rank','A_R4_rank','C_R4_rank']:
    R=res[k][0]; n=R['n']
    rows=[(cid,side,round(100*v/n,1),round(100*R['cand'].get((cid,side),0)/n,1)) for (cid,side),v in R['dealt'].items()]
    rows.sort(key=lambda x:-x[2])
    print('=====',k,'most dealt'); print([(title.get(c,c),s,d,cd) for c,s,d,cd in rows[:15]])
    allc=set((c[0],'good') for c in CARDS if c[1])|set((c[0],'bad') for c in CARDS if c[2])
    if k.startswith('C'): allc={x for x in allc if dict((c[0],c[8]) for c in CARDS)[x[0]]=='W'}
    never=[(title[c],s) for c,s in allc if R['dealt'].get((c,s),0)==0]
    rare=[(title[c],s,round(100*R['dealt'].get((c,s),0)/n,2)) for c,s in allc if 0<R['dealt'].get((c,s),0)/n<.002]
    print('never dealt stat cards:',never); print('under 0.2%:',rare)
    print('hero max share top:',[(analyze.HERO.get(int(h),h),title.get(c[0],c[0]),c[1],round(100*s),nn) for s,h,c,nn in R['hero_max_share'][:8]])
    print('over35 count', R['n_cards_over35_hero'])
pickle.dump((g,gC),open('/tmp/claude-0/sim/data/groupsR4.pkl','wb'))
