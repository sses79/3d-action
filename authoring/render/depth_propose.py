"""Clip proposals for the depth library from measured shots (docs/DEPTH_LIBRARY_PLAN.md; shared by depth-ingest.py and the re-split below).
Rules, in order:
1. control-on shots in a row join while together they stay within --max seconds (a fight stays one clip);
2. bridge: a control-off stretch of at most --bridge (5) s between two on-shots joins them (a slow grab between fast cuts);
3. grow (2026-10-25): a group shorter than --short (2 s) takes in its neighbours while they are short (at most --neighbour, 2.5 s)
   and still show movement (someone moves 0.08 or more, travels 0.1 or more, or the camera moves 0.1 or more), the side with more
   movement first, up to --grow (10) s; a long or calm shot stops it. An action told in quick cuts measures as one fast shot among
   slower ones: Cersei's guards seizing Littlefinger (got_video_a) was proposed as 0.9 s of its 8.4 s;
4. a group still shorter than --min (3 s) is kept but marked short: too short to carry a beat (1.2 s at least, 1.5 better).
Every other control-off shot is an entry of its own (keyframes and text only).
  .authoring/vision-venv/bin/python authoring/render/depth_propose.py SOURCE-ID [--write]    re-split an ingested source; without --write it
  only reports. Clips with work on them are kept as they are: built (a package), fixed, described, or with control set by a person;
  only proposed clips with none of that are replaced, and the new ones never take a kept clip's shots or ID."""
import sys,json,argparse,pathlib
MOVES=lambda r:(r.get('move') or 0)>=.08 or (r.get('travel') or 0)>=.1 or (r.get('camera') or 0)>=.1
def propose(rows,max_=15.,bridge=5.,short=2.,neighbour=2.5,grow=10.,min_=3.,taken=frozenset()):
    """rows: measured shots (index, start, end, seconds, control, move, travel, camera, why). taken: shot indices that belong to kept
    clips and must not move. Returns [(kind, [rows], extra why)]."""
    free=[r for r in rows];on=[r['control']=='on' and r['index'] not in taken for r in free];br=set()
    i=0
    while i<len(free):
        if on[i]:i+=1;continue
        j=i
        while j<len(free) and not on[j]:j+=1
        if 0<i and j<len(free) and free[j-1]['end']-free[i]['start']<=bridge and not any(free[k]['index'] in taken for k in range(i,j)):br.update(free[k]['index'] for k in range(i,j))
        i=j
    groups=[];cur=[]
    for k,r in enumerate(free):
        if (on[k] or r['index'] in br):
            if cur and r['end']-cur[0]['start']>max_:groups.append(cur);cur=[]
            cur.append(r)
        else:
            if cur:groups.append(cur);cur=[]
    if cur:groups.append(cur)
    used={r['index'] for g in groups for r in g}|set(taken);pos={r['index']:k for k,r in enumerate(free)};grown={}
    for g in groups:  # 3. grow a short group into the action around it
        if g[-1]['end']-g[0]['start']>=short:continue
        add=[]
        while True:
            L=pos[g[0]['index']]-1;R=pos[g[-1]['index']]+1;cand=[]
            for k,side in ((L,'l'),(R,'r')):
                if 0<=k<len(free):
                    n=free[k]
                    if n['index'] not in used and n['seconds']<=neighbour and MOVES(n) and max(g[-1]['end'],n['end'])-min(g[0]['start'],n['start'])<=grow:cand.append((max(n.get('move') or 0,n.get('travel') or 0,n.get('camera') or 0),side,n))
            if not cand:break
            _,side,n=max(cand,key=lambda c:c[0]);used.add(n['index']);add.append(n['index'])
            if side=='l':g.insert(0,n)
            else:g.append(n)
        if add:grown[id(g)]=add
    out=[];gi={r['index']:g for g in groups for r in g};done=set()
    for r in free:
        if r['index'] in taken:continue
        g=gi.get(r['index'])
        if g is None:out.append(('still',[r],[]));continue
        if id(g) in done:continue
        done.add(id(g));extra=[]
        if any(x['index'] in br for x in g):extra.append('bridged: slow shots inside the sequence')
        if id(g) in grown:extra.append('grown: the action around a short shot (shots %s)'%', '.join(map(str,grown[id(g)])))
        if g[-1]['end']-g[0]['start']<min_:extra.append(f"short: {g[-1]['end']-g[0]['start']:.1f} s, under {min_:g} s")
        out.append(('control',g,extra))
    return out
def entries(groups,src_id,max_=15.,ids=None):
    """Clip entries from proposed groups; ids: a callable giving the next free ID."""
    out=[];n=[0]
    nxt=ids or (lambda:(n.__setitem__(0,n[0]+1),'%s-%03d'%(src_id,n[0]))[1])
    for kind,g,extra in groups:
        s,e=g[0]['start'],g[-1]['end'];pieces=[(s,e)] if kind=='still' or e-s<=max_+1e-6 else [(t,min(e,t+max_)) for t in [s+i*max_ for i in range(int((e-s)//max_)+1)] if min(e,t+max_)-t>.5]
        for ps,pe in pieces:
            out.append(dict(id=nxt(),kind=kind,shots=[r['index'] for r in g if r['end']>ps and r['start']<pe],start=round(ps,3),end=round(pe,3),seconds=round(pe-ps,2),
                why=sorted({w for r in g for w in r['why'] if r['control']=='on'}|set(extra)),status='proposed',described=False))
    return out
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('--write',action='store_true');p.add_argument('--what-if',action='store_true',help='keep only built, fixed and person-set clips: what the rule would change if descriptions did not protect clips');a=p.parse_args()
    f=pathlib.Path('.authoring/depth-library')/a.source/'source.json';S=json.load(open(f))
    keep=[c for c in S['clips'] if c.get('package') or c.get('built') or c.get('fixed') or c.get('controlOverride') or (not a.what_if and (c.get('described') or c.get('description')))]
    assert not (a.what_if and a.write),'--what-if only reports'
    taken=frozenset(i for c in keep for i in c['shots']);old={(c['kind'],tuple(c['shots'])):c for c in S['clips'] if c not in keep}
    groups=propose(S['shots'],taken=taken);key=lambda kind,g:(kind,tuple(r['index'] for r in g))
    used={c['id'] for c in keep}|{old[key(k,g)]['id'] for k,g,_ in groups if key(k,g) in old};n=[0]  # unchanged proposals keep their IDs
    def nxt():
        while True:
            n[0]+=1;i='%s-%03d'%(S['id'],n[0])
            if i not in used:used.add(i);return i
    new=[];[new.extend([old[key(k,g)]] if key(k,g) in old else entries([(k,g,x)],S['id'],ids=nxt)) for k,g,x in groups]
    clips=sorted(keep+new,key=lambda c:c['start'])
    gone=[c for c in S['clips'] if c not in keep and (c['kind'],tuple(c['shots'])) not in {(e['kind'],tuple(e['shots'])) for e in new}]
    came=[e for e in new if (e['kind'],tuple(e['shots'])) not in old]
    rep=dict(source=S['id'],kept=len(keep),unchanged=len(new)-len(came),removed=[(c['id'],c['kind'],c['start'],c['end'],c['shots']) for c in gone],added=[(c['id'],c['kind'],c['start'],c['end'],c['shots'],[w for w in c['why'] if w.startswith(('grown','short','bridged'))]) for c in came])
    print(json.dumps(rep,indent=1))
    if a.write:S['clips']=clips;S['proposer']='depth_propose.py (grow 2026-10-25)';json.dump(S,open(f,'w'),indent=1)
