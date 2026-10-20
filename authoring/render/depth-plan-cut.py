"""Cut planner (docs/DEPTH_REFERENCE_IMPROVEMENT_PLAN.md, step 2): from beats and a duration, a new depth package whose beats fall on
whole seconds and play at 1.0-1.2x.
  .authoring/vision-venv/bin/python authoring/render/depth-plan-cut.py PLAN.json [--dry]
PLAN.json: {id, name, from (a built package to cut from), duration (whole seconds), summary,
  beats: [{actor, verb, target?, contact?, change?, from, to}]}  (from/to: the span of the source package that shows the beat)
For each beat the planner chooses its output length (whole seconds, in proportion to its span; at least 2 s when the duration
allows, 1 s otherwise), then fits the span to it: a span longer than 1.2x the length is trimmed evenly at both ends, one shorter
than 1.0x is widened evenly into the package's frames around it (where there are none it plays slower, down to 0.85x, with a
warning). Each beat becomes one segment at its own speed, so every beat starts on a whole second. Shots inside a beat keep the
source's cuts; a shot under 1.0 s of output is warned about. Keyframes: the opening, and each beat at a whole second inside it
at least 0.3 s from a cut (its middle when none is). Writes the cut depth and source videos to the source's edits folder, the
package (video-clay-pack.py) with beats, and prints the plan and its warnings. --dry prints the plan only."""
import sys,json,math,subprocess,pathlib
spec=json.load(open(sys.argv[1]));dry='--dry' in sys.argv
src_id=spec['from'];P=json.load(open(f'.authoring/video-clay/{src_id}/package.json'));D=int(spec['duration']);beats=spec['beats'];n=len(beats);warn=[]
assert D==spec['duration'] and D>=1,'duration: whole seconds'
if n>max(1,math.floor(D/1.5)):warn.append(f'{n} beats in {D} s: at most {max(1,math.floor(D/1.5))} (about 1.5-2.5 s each)')
# 1. output lengths: whole seconds in proportion to the spans, each at least 2 s when D allows (1 s otherwise)
span=[b['to']-b['from'] for b in beats];low=2 if D>=2*n else 1
L=[max(low,round(D*s/sum(span))) for s in span]
while sum(L)>D:i=max(range(n),key=lambda i:L[i]-D*span[i]/sum(span) if L[i]>low else -9);L[i]-=1
while sum(L)<D:i=max(range(n),key=lambda i:D*span[i]/sum(span)-L[i]);L[i]+=1
# 2. fit each span to its length at 1.0-1.2x
base=P.get('derivedFrom') and None;segs=[]
for b,l in zip(beats,L):
    a,z=b['from'],b['to'];s=(z-a)/l
    if s>1.2:c=(a+z)/2;a,z=c-.6*l,c+.6*l;s=1.2
    elif s<1.0:  # widen, but only inside the shots the span already touches (spilling into the next shot leaves slivers)
        own=[x for x in P['shots'] if x['end']>a+.05 and x['start']<z-.05];lo,hi=min(x['start'] for x in own),max(x['end'] for x in own)
        need=l-(z-a);a2,z2=max(lo,a-need/2),min(hi,z+need/2)
        if z2-a2<l:a2=max(lo,z2-l);z2=min(hi,a2+l)
        a,z=a2,z2;s=max((z-a)/l,.85) if (z-a)/l>=.85 else (z-a)/l
        if s<.999:warn.append(f"beat '{b['verb']}': its shots hold {z-a:.2f} s for {l} s of output; plays at {s:.2f}x (slower than filmed)")
        if s<.85:warn.append(f"beat '{b['verb']}': too slow; give it a longer span or less time")
    segs.append([round(a,3),round(z,3),round(s,4)])
# 3. shots in the output: the source's cuts inside each segment
t=0;shots=[];beat_out=[]
for (a,z,s),b,l in zip(segs,beats,L):
    beat_out.append({k:v for k,v in b.items() if k not in ('from','to')}|{'start':t,'end':t+l})
    cuts=[a]+[x['start'] for x in P['shots'] if a+.05<x['start']<z-.05]+[z]
    for c0,c1 in zip(cuts,cuts[1:]):
        src_shot=min(P['shots'],key=lambda x:0 if x['start']-1e-3<=c0<x['end']-1e-3 else 1+min(abs(c0-x['start']),abs(c0-x['end'])))  # a segment starting on a cut belongs to the shot that starts there
        shots.append(dict(index=len(shots)+1,start=round(t+(c0-a)/s,3),end=round(t+(c1-a)/s,3),camera=src_shot['camera'],fromShot=src_shot['index']))
    t+=l
for bo in beat_out:
    if bo['end']-bo['start']<1.5:warn.append(f"beat '{bo['verb']}' gets {bo['end']-bo['start']:g} s: under 1.5 s it may not read; use fewer beats or a longer duration")
for x in shots:
    if x['end']-x['start']<1.0-1e-6:warn.append(f"shot {x['index']} ({x['camera'][:40]}…) is {x['end']-x['start']:.2f} s")
# 4. keyframes: the opening, and per beat a whole second inside it at least 0.3 s from a cut
cut_t=[x['start'] for x in shots[1:]];keys=[0.15]
for bo in beat_out:
    cand=[s_ for s_ in range(math.ceil(bo['start']+.3),math.floor(bo['end']-.3)+1) if all(abs(s_-c)>=.3 for c in cut_t) and s_>.5]
    k=min(cand,key=lambda s_:abs(s_-(bo['start']+bo['end'])/2)) if cand else round((bo['start']+bo['end'])/2,2)
    if not cand:warn.append(f"beat '{bo['verb']}': no whole second at least 0.3 s from a cut; keyframe at {k} s")
    if all(abs(k-x)>.4 for x in keys):keys.append(k)
plan=dict(id=spec['id'],duration=D,segments=segs,beats=beat_out,shots=[{k:v for k,v in x.items()} for x in shots],keyframes=keys,warnings=warn)
print(json.dumps(plan,indent=1))
if dry:sys.exit()
# 5. cut and package
lib=pathlib.Path('.authoring/depth-library');edits=next(p for p in lib.glob('*/source.json') if json.load(open(p))['fileName']==(P.get('derivedFrom') or {}).get('sourceVideo',P['sourceVideo'])).parent/'edits';edits.mkdir(exist_ok=True)
S=json.load(open(edits.parent/'source.json'));video=S['file'];off=P['start'] if not P.get('derivedFrom') else None
assert off is not None,'cut from a package of the source itself, not from another cut'
def cut(inp,o,out):
    fc=''.join(f'[0:v]trim=start={a+o:.3f}:end={z+o:.3f},setpts=(PTS-STARTPTS)/{s},scale=960:540,fps=30[v{i}];' for i,(a,z,s) in enumerate(segs))+''.join(f'[v{i}]' for i in range(len(segs)))+f'concat=n={len(segs)}:v=1:a=0[o]'
    subprocess.run(['ffmpeg','-loglevel','error','-y','-i',inp,'-filter_complex',fc,'-map','[o]','-frames:v',str(D*30),'-c:v','libx264','-pix_fmt','yuv420p','-crf','16',out],check=True)
dv=edits/f"{spec['id']}-depth.mp4";sv=edits/f"{spec['id']}-source.mp4";cut(f'.authoring/video-clay/{src_id}/{P["depth"]}',0,str(dv));cut(video,off,str(sv))
shot_at=lambda t_:next((x['index'] for x in shots if x['start']-1e-3<=t_<x['end']),shots[-1]['index'])
out=dict(id=spec['id'],name=spec.get('name',spec['id']),video=str(sv),start=0,depth=str(dv),people=P['people'],cast=P.get('cast'),style=P.get('style'),summary=spec['summary'],beats=beat_out,
  shots=[{k:v for k,v in x.items() if k!='fromShot'} for x in shots],audio=[],
  keyframes=[dict(time=k,shot=shot_at(k),summary='; '.join(f"{b['actor']} {b['verb']} {b.get('target','')}".strip() for b in beat_out if b['start']<=k<b['end']) or 'opening',people=[dict(name=p['name'],doing='') for p in P['people']]) for k in keys],
  notes=[f"Planned cut of {src_id} (depth-plan-cut.py): one segment per beat, beats on whole seconds, speeds "+', '.join(f'{s:.2f}x' for _,_,s in segs)+'.']+[f'Warning: {w}' for w in warn],
  derivedFrom=dict(package=src_id,sourceVideo=P['sourceVideo'],segments=[[a,z] for a,z,_ in segs],speeds=[s for _,_,s in segs],speed=1.0))
sp=pathlib.Path(f".authoring/video-clay/{spec['id']}-spec.json");json.dump(out,open(sp,'w'),indent=1)
subprocess.run([sys.executable,'authoring/render/video-clay-pack.py',str(sp)],check=True)
