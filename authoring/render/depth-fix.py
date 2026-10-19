"""Fixes by hand to a built depth-library clip (docs/DEPTH_LIBRARY_PLAN.md, step 3), shot by shot, then tint and package again
from the saved depth (seconds).
  .authoring/vision-venv/bin/python authoring/render/depth-fix.py SOURCE-ID CLIP-ID
Reads <clip>.fixes.json beside the clip's files in .authoring/depth-library/<source>/: {"shots": {"2": {"E": "A", "D": "B",
"G": "-"}}}: in shot 2 the person found as E is A, D is B, and G is dropped (left untinted). Per shot, so it joins people across
cuts and also splits a name the automatic step gave to two people. A letter not used before is a new person (next colour).
"boxes": [{"name": "B", "shot": "28", "keys": [{"time": 1.2, "box": [x0, y0, x1, y1]}, ...]}] are boxes drawn by hand (fractions of the
picture, times in clip seconds) for what the detector misses (armour, someone lying down): within that shot the box is blended
between its keys and held before the first and after the last; it is tinted first and in front (depth-tint's "exact"), in the
person's colour, as the track "<name>-hand", and replaces that person's detector track in the shot.
The automatic tracks (<clip>.tracks.json) are never changed; the fixed ones go to <clip>.tracks-fixed.json, hand boxes to <clip>.hand.json."""
import re,sys,os,json,pathlib,subprocess,time
src,clip=sys.argv[1],sys.argv[2];root=pathlib.Path('.authoring/depth-library')/src;S=json.load(open(root/'source.json'));C=next(c for c in S['clips'] if c['id']==clip)
assert C.get('package'),'build the clip first (depth-build.py)'
fx=json.load(open(root/f'{clip}.fixes.json')) if (root/f'{clip}.fixes.json').exists() else {};per_fix=fx.get('shots',{})
T=json.load(open(root/f'{clip}.tracks.json'));colours=dict(C['built']['people']);began=time.perf_counter()
shots=json.load(open(root/f'{clip}.shots.json'))['shots'];shot_of=lambda t:str(min(shots,key=lambda x:0 if x['start']<=t<x['end'] else min(abs(t-x['start']),abs(t-x['end'])))['index'])  # exactly one shot per frame
PAL=['blue','orange','green','pink','purple','yellow','red','navy'];tracks={};order=[]
for n,v in T['tracks'].items():
    for k,b in enumerate(v):
        if b is None:continue
        m=per_fix.get(shot_of(T['times'][k]),{}).get(n,n)
        if m=='-':continue
        if m not in tracks:tracks[m]=[None]*len(v);order.append(m)
        if tracks[m][k] is None:tracks[m][k]=b
for m in order:
    if m not in colours:colours[m]=next(c for c in PAL if c not in colours.values()) if len(colours)<len(PAL) else 'gray'
for e in fx.get('boxes',[]):  # a box drawn by hand replaces that person's detector track in its shot (a detector box there was the reason to draw it)
    if e['name'] in tracks:
        for k,t in enumerate(T['times']):
            if shot_of(t)==str(e['shot']):tracks[e['name']][k]=None
tracks={n:v for n,v in tracks.items() if any(v)}
names=sorted(tracks);T['tracks']={n:tracks[n] for n in names};T['fixes']=fx
hand={};W,H=T['size']
for e in fx.get('boxes',[]):
    sh=next((x for x in shots if str(x['index'])==str(e['shot'])),None);ks=sorted(e.get('keys',[]),key=lambda q:q['time'])
    if sh is None or not ks:continue
    tr=hand.setdefault(e['name']+'-hand',[None]*len(T['times']))
    for k,t in enumerate(T['times']):
        if not sh['start']<=t<sh['end']:continue
        c=t-T['start'];j=max([i for i,q in enumerate(ks) if q['time']<=c],default=0);q0=ks[j];q1=ks[min(j+1,len(ks)-1)]
        u=0 if q1['time']<=q0['time'] else min(1,max(0,(c-q0['time'])/(q1['time']-q0['time'])));b=[a_+(b_-a_)*u for a_,b_ in zip(q0['box'],q1['box'])]
        tr[k]={'box':[b[0]*W,b[1]*H,b[2]*W,b[3]*H]}
    if e['name'] not in colours:colours[e['name']]=next(c for c in PAL if c not in colours.values()) if len(colours)<len(PAL) else 'gray'
json.dump(dict(times=T['times'],size=[W,H],exact=True,tracks=hand,note='boxes drawn by hand on the depth page'),open(root/f'{clip}.hand.json','w'))
json.dump(T,open(root/f'{clip}.tracks-fixed.json','w'))
per={k:sorted(({per_fix.get(k,{}).get(n,n) for n in v}-{'-'})|{e['name'] for e in fx.get('boxes',[]) if str(e['shot'])==k}) for k,v in C['built']['perShot'].items()}
spec=json.load(open(root/f'{clip}.spec.json'));everyone=sorted(set(names)|{e['name'] for e in fx.get('boxes',[])});spec['people']=[dict(name=n,color=colours[n],represents=next((p['represents'] for p in spec['people'] if p['name']==n),f'person {n} (not described)')) for n in everyone]
for k in spec['keyframes']:k['people']=[dict(name=n,doing=next((q['doing'] for q in k['people'] if q['name']==n),'not described')) for n in per.get(str(k['shot']),[])]
for x in spec['audio']:x['who']=x['who'] if x['who'] in tracks else (names[0] if names else x['who'])
spec['library']=dict(spec.get('library',{}),perShot=C['built']['perShot'],fixed=per,fixes=fx);json.dump(spec,open(root/f'{clip}.spec.json','w'),indent=1)
r=subprocess.run([sys.executable,'authoring/render/depth-tint.py',T['video'],f"{T['start']:.3f}",f"{T['end']:.3f}",str(root/f'{clip}-tinted.mp4'),'--shots',str(root/f'{clip}.shots.json'),'--tracks',str(root/f'{clip}.tracks-fixed.json')+(','+str(root/f'{clip}.hand.json') if hand else ''),'--colors',','.join([f'{n}={colours[n]}' for n in names]+[f'{h}={colours[h[:-5]]}' for h in hand]),'--depth',str(root/f'{clip}.depth.npz')],capture_output=True,text=True)
if r.returncode:sys.exit('tint failed:\n'+r.stderr[-2000:])
r=subprocess.run([sys.executable,'authoring/render/video-clay-pack.py',str(root/f'{clip}.spec.json')],capture_output=True,text=True)
if r.returncode:sys.exit('package failed:\n'+r.stderr[-2000:])
C['fixed']=dict(at=time.strftime('%Y-%m-%dT%H:%M:%S'),fixes=fx,people=names,perShot=per,seconds=round(time.perf_counter()-began,1))
r_=subprocess.run([sys.executable,'authoring/render/depth-check.py',src,clip],capture_output=True,text=True)  # the double check at the keyframes
chk=json.loads(re.search(r'{"clip".*',r_.stdout).group(0)) if r_.returncode==0 and re.search(r'{"clip".*',r_.stdout) else {'ok':None,'keyframes':[]}
S2=json.load(open(root/'source.json'));next(c for c in S2['clips'] if c['id']==clip)['fixed']=C['fixed'];next(c for c in S2['clips'] if c['id']==clip)['check']=dict(ok=chk['ok'],issues=sum(len(i) for _,i in chk['keyframes']));json.dump(S2,open(root/'source.json','w'),indent=1)  # only this clip's record
print(json.dumps(dict(clip=clip,hand=sorted(hand),people={n:colours[n] for n in everyone},perShot=per,seconds=C['fixed']['seconds'])))
