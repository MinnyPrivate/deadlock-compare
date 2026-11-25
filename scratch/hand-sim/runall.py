import time, pickle, json, numpy as np, pandas as pd
from collections import Counter
from sim import *
import analyze
analyze.HERO.update({int(k):v for k,v in json.loads(open('/home/user/deadlock-compare/heroes.js').read().split('=',1)[1].strip().rstrip(';').split('\n')[0].rstrip(';')).items()})
t=time.time()
W=build_wide_rows(); F=build_full().reset_index(drop=True)
train, hold = split_rows(W)
A=set(F.match_id); train=train[~train.match_id.isin(A)]; hold=hold[~hold.match_id.isin(A)].reset_index(drop=True)
NA=Norms(train,F); NC=Norms(train,hold)
res={}
runs=[('A_full_p3','A',True,False,True),('A_full_nop3','A',False,False,True),('A_full_p3_rank','A',True,True,True),
      ('A_wide_p3','A',True,False,False),('A_wide_nop3','A',False,False,False),('C_wide_p3','C',True,False,False),('C_wide_nop3','C',False,False,False),('C_wide_p3_rank','C',True,True,False)]
for name,s,p3,rk,rich in runs:
    pop=F if s=='A' else hold; N=NA if s=='A' else NC
    hands,cands,meta=deal_all(pop,N,p3=p3,by_rank=rk,rich=rich)
    R=analyze.summarize(hands,cands,pop,name); R['meta']={'jfreq':meta['jfreq'],'evfreq':meta['evfreq'],'margins':meta['margins']}
    res[name]=(R,hands,cands)
    print(name, round(time.time()-t), 'mean',round(R['mean_size'],2), 'dist',R['size_dist'], 'legG',round(R['good_legplus'],1),'mythG',round(R['good_myth'],2),'legB',round(R['bad_legplus'],1),'jk',round(R['joker_any'],1),'jk2',round(R['joker_two'],1),'allbad',round(R['all_bad'],2))
    print('   per hand', R['per_hand'])
pickle.dump(res,open('/tmp/claude-0/sim/data/res.pkl','wb'))
pickle.dump((F,hold),open('/tmp/claude-0/sim/data/pops.pkl','wb'))
