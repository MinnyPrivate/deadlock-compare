import json, os, glob, numpy as np, pandas as pd
D='/tmp/claude-0/sim/data'
def load_rows():
    p=D+'/rows.pkl'
    if os.path.exists(p): return pd.read_pickle(p)
    recs=[]
    for f in ['rows_1.ndjson','rows_2.ndjson','rows_3.ndjson']:
        for line in open(f'{D}/{f}'):
            r=json.loads(line)
            acc=dict(zip(r.pop('accolade_id') or [], r.pop('accolade_stat_value') or []))
            r.pop('accolade_threshold_achieved',None)
            for k in (9,):  # keep a couple
                r[f'acc{k}']=acc.get(k)
            recs.append(r)
    df=pd.DataFrame(recs).drop_duplicates(['match_id','player_slot'])
    df.to_pickle(p); return df
def load_snaps():
    p=D+'/snaps.pkl'
    if os.path.exists(p): return pd.read_pickle(p)
    recs=[]
    for f in ['snaps_1.json','snaps_2.json','snaps_3.json']:
        for r in json.load(open(f'{D}/{f}')):
            ts=r['ts']
            def at(arr,t):
                if t in ts: return arr[ts.index(t)]
                return None
            dt=r.get('death_t') or []; dd=r.get('death_dur') or []
            recs.append(dict(match_id=r['match_id'],player_slot=r['player_slot'],
                nw540=at(r['nw'],540), nw900=at(r['nw'],900), bd900=at(r['bd'],900), pd540=at(r['pd'],540),
                pd900=at(r['pd'],900), k900=at(r['k'],900), death_t=dt, death_dur=dd, ts=ts, nw=r['nw'], kk=r['k']))
    df=pd.DataFrame(recs).drop_duplicates(['match_id','player_slot'])
    df.to_pickle(p); return df
if __name__=='__main__':
    r=load_rows(); s=load_snaps()
    print(r.shape, s.shape, r.match_id.nunique(), s.match_id.nunique())
    A=set(int(os.path.basename(f)[:-5]) for f in glob.glob(D+'/matches/*.json'))
    print('SetA in rows', len(A & set(r.match_id)), 'in snaps', len(A & set(s.match_id)))
