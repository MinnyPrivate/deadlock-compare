import time, pickle, numpy as np
from sim import *
import analyze
t=time.time()
W=build_wide_rows(); F=build_full().reset_index(drop=True)
train, hold = split_rows(W); A=set(F.match_id); train=train[~train.match_id.isin(A)]; hold=hold[~hold.match_id.isin(A)].reset_index(drop=True)
NA=Norms(train,F); NC=Norms(train,hold)
base=dict(family=True, joker_max=1, joker_maxfreq=.05, size_rule='goodfirst', hero_guard=True)
V={'R2_epiccap':dict(base), 'R3_rarecap':dict(base, detail_cap='rare')}
res=pickle.load(open('/tmp/claude-0/sim/data/final.pkl','rb'))
for vn,o in V.items():
  for s in 'AC':
    pop=F if s=='A' else hold; N=NA if s=='A' else NC
    name=f'{s}_{vn}_rank'
    hands,cands,meta=deal_all(pop,N,p3=True,by_rank=True,rich=(s=='A'),opts=o)
    R=analyze.summarize(hands,cands,pop,name); R['meta']={'jfreq':meta['jfreq'],'evfreq':meta['evfreq'],'margins':meta['margins']}
    res[name]=(R,hands,cands)
    print(name, round(time.time()-t), 'mean',round(R['mean_size'],2), 'dist',{int(k):v for k,v in R['size_dist'].items()}, '10+',round(R['pct_10plus'],1),'legG',round(R['good_legplus'],1),'mythG',round(R['good_myth'],2),'legB',round(R['bad_legplus'],1),'jk',round(R['joker_any'],1),'allbad',round(R['all_bad'],2),'1suit',round(R['mostly_one_suit'],1),'>35%',R['n_cards_over35_hero'],'short',round(R['short'],1))
    print('   per hand', R['per_hand'])
pickle.dump(res,open('/tmp/claude-0/sim/data/final.pkl','wb'), protocol=4)
