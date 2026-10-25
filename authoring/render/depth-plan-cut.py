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
LEAD=spec.get('lead') or None;Ld=float(LEAD['seconds']) if LEAD else 0.  # a lead: the take opens on an image held Ld s (a previous take's last frame); it is the start of the first beat
assert D==spec['duration'] and D>=1,'duration: whole seconds'
if n>max(1,math.floor(D/1.5)):warn.append(f'{n} beats in {D} s: at most {max(1,math.floor(D/1.5))} (about 1.5-2.5 s each)')
# 1. output lengths: whole seconds in proportion to the spans, each at least 2 s when D allows (1 s otherwise)
span=[b['to']-b['from'] for b in beats];low=2 if D>=2*n else 1
L=[max(low,round(D*s/sum(span))) for s in span]
while sum(L)>D:i=max(range(n),key=lambda i:L[i]-D*span[i]/sum(span) if L[i]>low else -9);L[i]-=1
while sum(L)<D:i=max(range(n),key=lambda i:D*span[i]/sum(span)-L[i]);L[i]+=1
# 2. fit each span to its length at 1.0-1.2x
base=P.get('derivedFrom') and None;segs=[]
for bi,(b,l) in enumerate(zip(beats,L)):
    l=l-(Ld if bi==0 else 0)  # the first beat's source plays after the lead
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
# 2b. the filmed timing kept: when the beats follow one another and together fill the take (after any lead) at 0.95-1.1x, one segment
# at that speed, each beat where it falls (not on whole seconds): the action plays at the speed it was filmed, as the V.8 lift needed
contig=all(abs(beats[i]['to']-beats[i+1]['from'])<.05 for i in range(n-1));whole=(beats[-1]['to']-beats[0]['from'])/(D-Ld) if D>Ld else 0
if contig and .95<=whole<=1.1 and not spec.get('wholeSeconds'):
    a0,z0=beats[0]['from'],beats[-1]['to'];segs=[[round(a0,3),round(z0,3),round(whole,4)]];kept=True
    L=[(b['to']-b['from'])/whole+(Ld if i==0 else 0) for i,b in enumerate(beats)]
    warn=[w for w in warn if 'slower than filmed' not in w and 'too slow' not in w]
else:kept=False
# 3. shots in the output: the source's cuts inside each segment
t=Ld;shots=[dict(index=1,start=0,end=Ld,camera=LEAD.get('camera') or "the previous take's last frame, held",fromShot=None)] if LEAD else [];beat_out=[]
if kept:  # one segment: beats where they fall in it
    tt=Ld
    for bi,b in enumerate(beats):l=(b['to']-b['from'])/whole;beat_out.append({k:v for k,v in b.items() if k not in ('from','to')}|{'start':0 if bi==0 else round(tt,3),'end':round(tt+l,3)});tt+=l
    beat_out[-1]['end']=D
for bi,((a,z,s),b,l) in enumerate(zip(segs,beats,L)):
    l=(z-a)/s if kept else l-(Ld if bi==0 else 0)
    if not kept:beat_out.append({k:v for k,v in b.items() if k not in ('from','to')}|{'start':0 if bi==0 else t,'end':t+l})
    cuts=[a]+[x['start'] for x in P['shots'] if a+.05<x['start']<z-.05]+[z]
    for c0,c1 in zip(cuts,cuts[1:]):
        src_shot=min(P['shots'],key=lambda x:0 if x['start']-1e-3<=c0<x['end']-1e-3 else 1+min(abs(c0-x['start']),abs(c0-x['end'])))  # a segment starting on a cut belongs to the shot that starts there
        shots.append(dict(index=len(shots)+1,start=round(t+(c0-a)/s,3),end=round(t+(c1-a)/s,3),camera=src_shot['camera'],fromShot=src_shot['index']))
    t+=l
if kept:warn.append(f'kept the filmed timing: one segment at {whole:.2f}x, beats at '+', '.join(f"{bo['start']:g}" for bo in beat_out)+' s (not whole seconds)')
for bo in beat_out:
    if bo['end']-bo['start']<1.5:warn.append(f"beat '{bo['verb']}' gets {bo['end']-bo['start']:g} s: under 1.5 s it may not read; use fewer beats or a longer duration")
for x in shots:
    if x['end']-x['start']<1.0-1e-6 and x['fromShot'] is not None:warn.append(f"shot {x['index']} ({x['camera'][:40]}…) is {x['end']-x['start']:.2f} s")
# a beat's peak (seconds in the source package) said in the output's seconds
def out_t(x):
    t_=Ld
    for a_,z_,s_ in segs:
        if a_-1e-3<=x<=z_+1e-3:return round(t_+(x-a_)/s_,3)
        t_+=(z_-a_)/s_
    return None
for b,bo in zip(beats,beat_out):
    if b.get('peak') is not None:
        pk_=out_t(float(b['peak']));bo.pop('peak',None)
        if pk_ is not None and bo['start']<=pk_<=bo['end']:bo['peak']=pk_
        else:warn.append(f"beat '{b['verb']}': its peak {b['peak']} s is not in the part of the source the take uses")
# (the lead's shot is meant to be short)
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
def cut(inp,o,out,first=None):  # first: the lead's still, held Ld s before the segments
    k=1 if first else 0;fc=(f'[0:v]scale=960:540,fps=30,trim=end_frame={round(Ld*30)},setpts=PTS-STARTPTS[h];' if first else '')+''.join(f'[{k}:v]trim=start={a+o:.3f}:end={z+o:.3f},setpts=(PTS-STARTPTS)/{s},scale=960:540,fps=30[v{i}];' for i,(a,z,s) in enumerate(segs))+('[h]' if first else '')+''.join(f'[v{i}]' for i in range(len(segs)))+f'concat=n={len(segs)+k}:v=1:a=0[o]'
    subprocess.run(['ffmpeg','-loglevel','error','-y',*(['-loop','1','-t',str(Ld+.2),'-i',first] if first else []),'-i',inp,'-filter_complex',fc,'-map','[o]','-frames:v',str(D*30),'-c:v','libx264','-pix_fmt','yuv420p','-crf','16',out],check=True)
dv=edits/f"{spec['id']}-depth.mp4";sv=edits/f"{spec['id']}-source.mp4";cut(f'.authoring/video-clay/{src_id}/{P["depth"]}',0,str(dv),LEAD and LEAD['depth']);cut(video,off,str(sv),LEAD and LEAD['image'])
shot_at=lambda t_:next((x['index'] for x in shots if x['start']-1e-3<=t_<x['end']),shots[-1]['index'])
out=dict(id=spec['id'],name=spec.get('name',spec['id']),video=str(sv),start=0,depth=str(dv),people=P['people'],cast=P.get('cast'),style=P.get('style'),summary=spec['summary'],beats=beat_out,
  shots=[{k:v for k,v in x.items() if k!='fromShot'} for x in shots],audio=[],
  keyframes=[dict(time=k,shot=shot_at(k),summary='; '.join(f"{b['actor']} {b['verb']} {b.get('target','')}".strip() for b in beat_out if b['start']<=k<b['end']) or 'opening',people=[dict(name=p['name'],doing='') for p in P['people']]) for k in keys],
  notes=[f"Planned cut of {src_id} (depth-plan-cut.py): "+('the filmed timing kept (one segment), speed ' if kept else 'one segment per beat, beats on whole seconds, speeds ')+""+', '.join(f'{s:.2f}x' for _,_,s in segs)+'.']+[f'Warning: {w}' for w in warn],
  derivedFrom=dict(package=src_id,sourceVideo=P['sourceVideo'],segments=[[a,z] for a,z,_ in segs],speeds=[s for _,_,s in segs],speed=1.0,**({'lead':{'seconds':Ld,'image':str(pathlib.Path(LEAD['image']).resolve())}} if LEAD else {})))
sp=pathlib.Path(f".authoring/video-clay/{spec['id']}-spec.json");json.dump(out,open(sp,'w'),indent=1)
subprocess.run([sys.executable,'authoring/render/video-clay-pack.py',str(sp)],check=True)
