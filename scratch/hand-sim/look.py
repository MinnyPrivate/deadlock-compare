import pickle, numpy as np
from collections import Counter
res=pickle.load(open('/tmp/claude-0/sim/data/res.pkl','rb'))
R,hands,cands=res['A_full_p3_rank']
jf=R['meta']['jfreq']
print('JOKERS', len(jf)); 
for j,f in sorted(jf.items(), key=lambda x:x[1]): print(f'  {j:28s} {100*f:6.2f}%')
print('EVENTS'); 
for j,f in sorted(R['meta']['evfreq'].items(), key=lambda x:x[1]): print(f'  {j:28s} {100*f:6.2f}%')
# any joker under cutoffs
for cut in [.25,.10,.05,.03,.02,.01]:
    a=np.mean([any(c['kind']=='joker' and c['g']<=cut for c in L) for L in cands]); print('joker any with freq<=',cut, round(100*a,1))
# legendary sources
src=Counter(); n=len(hands)
for h in hands:
    ks={c['kind']+(':head' if c['kind']=='stat' and c['head'] else '') for c in h['cards'] if c['side']=='good' and c['tier'] in ('legendary','mythical')}
    for k in ks: src[k]+=1
print('legendary+ good sources (% hands)', {k:round(100*v/n,1) for k,v in src.items()})
src=Counter()
for h in hands:
    for c in h['cards']:
        if c['side']=='good' and c['tier'] in ('legendary','mythical'): src[c['title']]+=1
print([(k,round(100*v/n,2)) for k,v in src.most_common(25)])
print('hero max share', R['hero_max_share'][:12])
print('crown margins', R['meta']['margins'])
