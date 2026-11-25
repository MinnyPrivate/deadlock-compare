import pickle, json, numpy as np, pandas as pd
from collections import Counter, defaultdict
from features import build_full, build_wide_rows
from sim import split_rows, band, TIERS
import analyze
analyze.HERO.update({int(k):v for k,v in json.loads(open('/home/user/deadlock-compare/heroes.js').read().split('=',1)[1].strip().split('\n')[0].rstrip(';')).items()})
res=pickle.load(open('/tmp/claude-0/sim/data/final.pkl','rb'))
F=build_full().reset_index(drop=True)
W=build_wide_rows(); train,hold=split_rows(W); hold=hold[~hold.match_id.isin(set(F.match_id))].reset_index(drop=True)
def perf(pop): return pop.groupby('hero').valve_score.rank(pct=True).values
out={}
for pop,keys in [(F,['A_bible_rank','A_nop3_rank','A_R3_rarecap_rank']),(hold,['C_bible_rank','C_R3_rarecap_rank'])]:
    pp=perf(pop); ob=pop.own_tier.map(band).values; lb=pop.lobby_tier.map(band).values
    G={'all':np.ones(len(pop),bool),'perf bottom 10%':pp<=.1,'perf 10-30%':(pp>.1)&(pp<=.3),'perf middle 40-60%':(pp>.4)&(pp<=.6),'perf top 10%':pp>.9,'perf top 2%':pp>.98,
       'loss':~pop.won.values,'win':pop.won.values}
    for b in ['low','mid','high','top']:
        G[f'own rank {b}']=ob==b if keys[0].startswith('A') else lb==b
    G['top rank + top 25% perf']=( (ob=='top') if keys[0].startswith('A') else (lb=='top')) & (pp>.75)
    for k in keys:
        R,hands,cands=res[k]
        out[k]=analyze.group_report(hands,pop,G)
for k,v in out.items():
    print('=====',k)
    for g,d in v.items():
        print(f"{g:26s} n={d['n']:6d} size={d['mean_size']:.2f} legG={d['good_legplus']:5.1f}% good={d['good_per_hand']:.2f} bad={d['bad_per_hand']:.2f} allbad={d['all_bad']:.1f}% majbad={d['majority_bad']:.1f}% noGoodRare+={d['no_good_rareplus']:.1f}% jacc={d['jaccard']:.3f}")
        print('      top:', d['top'][:5])
# repeat accounts in Set A
for k in ['A_bible_rank','A_R3_rarecap_rank']:
    R,hands,cands=res[k]; byacc=defaultdict(list)
    for h in hands: byacc[F.account.iloc[h['i']]].append(h)
    js=[analyze.jacc(hs,k=50) for a,hs in byacc.items() if len(hs)>=4]
    print(k,'repeat accounts >=4 games:',len(js),'within-account jaccard',np.nanmean(js),'random pairs',analyze.jacc(hands,k=3000))
    # same hero repeats
    byah=defaultdict(list)
    for h in hands: byah[(F.account.iloc[h['i']],F.hero.iloc[h['i']])].append(h)
    js=[analyze.jacc(hs,k=30) for a,hs in byah.items() if len(hs)>=3]
    print('   same account+hero >=3:',len(js),np.nanmean(js))
pickle.dump(out,open('/tmp/claude-0/sim/data/groups.pkl','wb'))
