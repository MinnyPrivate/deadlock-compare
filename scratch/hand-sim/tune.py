import time, pickle, json, numpy as np, pandas as pd
from sim import *
import analyze
t=time.time()
W=build_wide_rows(); F=build_full().reset_index(drop=True)
train, hold = split_rows(W); A=set(F.match_id); train=train[~train.match_id.isin(A)]; hold=hold[~hold.match_id.isin(A)].reset_index(drop=True)
NA=Norms(train,F)
variants={
 'T1_jokers': dict(joker_max=1, joker_maxfreq=.10),
 'T2_family': dict(family=True),
 'T3_family_jokers': dict(family=True, joker_max=1, joker_maxfreq=.10),
 'T4_fam_jk_size': dict(family=True, joker_max=1, joker_maxfreq=.10, size_rule='goodfirst'),
 'T5_fam_jk_size_rarecap': dict(family=True, joker_max=1, joker_maxfreq=.10, size_rule='goodfirst', detail_cap='rare'),
}
res={}
for name,o in variants.items():
    for rk in (False, True):
        hands,cands,meta=deal_all(F,NA,p3=True,by_rank=rk,rich=True,opts=o)
        R=analyze.summarize(hands,cands,F,name)
        key=name+('_rank' if rk else '')
        res[key]=(R,hands,cands)
        print(key, round(time.time()-t), 'mean',round(R['mean_size'],2), 'dist',{int(k):v for k,v in R['size_dist'].items()}, 'legG',round(R['good_legplus'],1),'mythG',round(R['good_myth'],2),'legB',round(R['bad_legplus'],1),'jk',round(R['joker_any'],1),'jk2',round(R['joker_two'],1),'allbad',round(R['all_bad'],2),'1suit',round(R['mostly_one_suit'],1),'>35%',R['n_cards_over35_hero'])
        print('   per hand', R['per_hand'])
pickle.dump(res,open('/tmp/claude-0/sim/data/tune.pkl','wb'))
