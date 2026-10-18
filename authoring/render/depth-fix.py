"""Fixes by hand to a built depth-library clip (docs/DEPTH_LIBRARY_PLAN.md, step 3), shot by shot, then tint and package again
from the saved depth (seconds).
  .authoring/vision-venv/bin/python authoring/render/depth-fix.py SOURCE-ID CLIP-ID
Reads <clip>.fixes.json beside the clip's files in .authoring/depth-library/<source>/: {"shots": {"2": {"E": "A", "D": "B",
"G": "-"}}}: in shot 2 the person found as E is A, D is B, and G is dropped (left untinted). Per shot, so it joins people across
cuts and also splits a name the automatic step gave to two people. A letter not used before is a new person (next colour).
The automatic tracks (<clip>.tracks.json) are never changed; the fixed ones go to <clip>.tracks-fixed.json."""
import sys,os,json,pathlib,subprocess,time
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
names=sorted(tracks);T['tracks']={n:tracks[n] for n in names};T['fixes']=fx
json.dump(T,open(root/f'{clip}.tracks-fixed.json','w'))
per={k:sorted({per_fix.get(k,{}).get(n,n) for n in v}-{'-'}) for k,v in C['built']['perShot'].items()}
spec=json.load(open(root/f'{clip}.spec.json'));spec['people']=[dict(name=n,color=colours[n],represents=next((p['represents'] for p in spec['people'] if p['name']==n),f'person {n} (not described)')) for n in names]
for k in spec['keyframes']:k['people']=[dict(name=n,doing=next((q['doing'] for q in k['people'] if q['name']==n),'not described')) for n in per.get(str(k['shot']),[])]
for x in spec['audio']:x['who']=x['who'] if x['who'] in tracks else (names[0] if names else x['who'])
spec['library']=dict(spec.get('library',{}),perShot=C['built']['perShot'],fixed=per,fixes=fx);json.dump(spec,open(root/f'{clip}.spec.json','w'),indent=1)
r=subprocess.run([sys.executable,'authoring/render/depth-tint.py',T['video'],f"{T['start']:.3f}",f"{T['end']:.3f}",str(root/f'{clip}-tinted.mp4'),'--shots',str(root/f'{clip}.shots.json'),'--tracks',str(root/f'{clip}.tracks-fixed.json'),'--colors',','.join(f'{n}={colours[n]}' for n in names),'--depth',str(root/f'{clip}.depth.npz')],capture_output=True,text=True)
if r.returncode:sys.exit('tint failed:\n'+r.stderr[-2000:])
r=subprocess.run([sys.executable,'authoring/render/video-clay-pack.py',str(root/f'{clip}.spec.json')],capture_output=True,text=True)
if r.returncode:sys.exit('package failed:\n'+r.stderr[-2000:])
C['fixed']=dict(at=time.strftime('%Y-%m-%dT%H:%M:%S'),fixes=fx,people=names,perShot=per,seconds=round(time.perf_counter()-began,1))
S2=json.load(open(root/'source.json'));next(c for c in S2['clips'] if c['id']==clip)['fixed']=C['fixed'];json.dump(S2,open(root/'source.json','w'),indent=1)  # only this clip's record
print(json.dumps(dict(clip=clip,people={n:colours[n] for n in names},perShot=per,seconds=C['fixed']['seconds'])))
