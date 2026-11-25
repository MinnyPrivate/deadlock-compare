import time, pickle, json, numpy as np, pandas as pd
from collections import Counter, defaultdict
from sim import *
import analyze
t=time.time()
W=build_wide_rows(); F=build_full().reset_index(drop=True)
train, hold = split_rows(W); A=set(F.match_id); train=train[~train.match_id.isin(A)]; hold=hold[~hold.match_id.isin(A)].reset_index(drop=True)
NA=Norms(train,F); NC=Norms(train,hold)
REC=dict(family=True, joker_max=1, joker_maxfreq=.05, size_rule='goodfirst', detail_shift=True, hero_guard=True)
runs={
 'A_bible_rank':('A',True,True,True,{}), 'A_nop3_rank':('A',False,True,True,{}), 'A_bible_all':('A',True,False,True,{}), 'A_nop3_all':('A',False,False,True,{}),
 'A_rec_rank':('A',True,True,True,REC), 'A_rec_all':('A',True,False,True,REC),
 'C_bible_rank':('C',True,True,False,{}), 'C_nop3_rank':('C',False,True,False,{}), 'C_rec_rank':('C',True,True,False,REC),
}
res={}
for name,(s,p3,rk,rich,o) in runs.items():
    pop=F if s=='A' else hold; N=NA if s=='A' else NC
    hands,cands,meta=deal_all(pop,N,p3=p3,by_rank=rk,rich=rich,opts=o)
    R=analyze.summarize(hands,cands,pop,name); R['meta']={'jfreq':meta['jfreq'],'evfreq':meta['evfreq'],'margins':meta['margins']}
    res[name]=(R,hands,cands)
    print(name, round(time.time()-t), 'mean',round(R['mean_size'],2), 'dist',{int(k):v for k,v in R['size_dist'].items()}, '10+',round(R['pct_10plus'],1),'legG',round(R['good_legplus'],1),'mythG',round(R['good_myth'],2),'legB',round(R['bad_legplus'],1),'jk',round(R['joker_any'],1),'jk2',round(R['joker_two'],1),'allbad',round(R['all_bad'],2),'1suit',round(R['mostly_one_suit'],1),'>35%',R['n_cards_over35_hero'], 'lobbyLeg',round(R['lobby_any_leg'],1),'lobbyMyth',round(R['lobby_any_myth'],1), 'forced',round(R['forced_over'],1),'short',round(R['short'],1))
    print('   per hand', R['per_hand'], 'cand epic+ good', round(R['cand_epicplus_good'],2), 'raw leg cand', round(R['cand_leg_raw'],1), 'raw myth', round(R['cand_myth_raw'],2))
pickle.dump(res,open('/tmp/claude-0/sim/data/final.pkl','wb'), protocol=4)
