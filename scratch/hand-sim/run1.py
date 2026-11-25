import time, pickle, numpy as np, pandas as pd
from collections import Counter
from sim import *
t=time.time()
W=build_wide_rows(); F=build_full()
train, hold = split_rows(W)
A=set(F.match_id); train=train[~train.match_id.isin(A)]; hold=hold[~hold.match_id.isin(A)]
print('train matches',train.match_id.nunique(),'rows',len(train),'holdout matches',hold.match_id.nunique())
F=F.reset_index(drop=True)
N=Norms(train,F); print('norms',time.time()-t)
hands,cands,meta=deal_all(F,N,p3=True)
print('deal',time.time()-t)
sz=Counter(h['size'] for h in hands); print(sorted(sz.items()), np.mean([h['size'] for h in hands]))
tc=Counter(); 
for h in hands:
  for c in h['cards']: tc[(c['side'],c['tier'])]+=1
print(tc)
pickle.dump((hands,cands,meta),open('/tmp/claude-0/sim/data/testA.pkl','wb'))
