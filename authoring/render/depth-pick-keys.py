"""Keyframe picker (docs/DEPTH_REFERENCE_IMPROVEMENT_PLAN.md, step 3): one keyframe per beat, at the moment the beat reads best, plus
the opening; written into the package and its spec, then the package is made again (stills) and checked.
  .authoring/vision-venv/bin/python authoring/render/depth-pick-keys.py PACKAGE-ID [--dry]
Reads the package's beats (set_depth_beats or the cut planner), people and colours, shots and the tinted depth video. For each beat,
every frame inside it at least 0.3 s from a cut is scored from the tint: the actor's and the target's areas (each colour's region,
as depth-check.py reads it) and their contact (the actor's region, widened by 1% of the width, overlapping the target's):
  score = sqrt(min(actor, target)) x (1 + 40 x contact), and only sqrt(target)/2 where the actor shows no colour;
a beat with a change ("he rises") weighs later frames up to 1.4x (the change is the beat's outcome). A beat's optional "peak" (seconds
in the package) replaces the score: the measure cannot see a lift or a face. The best frame is moved to a whole second when one
within 0.35 s scores at least 85% of it. Warnings: the contact is hidden (the actor never covers 3% of the picture in the beat),
the actor is untinted at the keyframe, or the beat is so cut up that no frame is 0.3 s from a cut."""
import sys,json,math,subprocess,pathlib,cv2,numpy as np
pid=sys.argv[1];dry='--dry' in sys.argv;pk=pathlib.Path('.authoring/video-clay')/pid;P=json.load(open(pk/'package.json'))
assert P.get('beats'),'the package has no beats: set them first (set_depth_beats or plan_depth_cut)'
NAMED={'blue':'#4a86d8','orange':'#ee8a3a','green':'#4fae5a','pink':'#f07fb0','purple':'#8d6fd1','yellow':'#e8c53a','red':'#d9534a','crimson':'#a3232b','navy':'#2b3a66'}
hue=lambda c:int(cv2.cvtColor(np.uint8([[[int(NAMED[c][i:i+2],16) for i in (5,3,1)]]]),cv2.COLOR_BGR2HSV)[0,0,0])
col={p['name']:p['color'] for p in P['people']};used=sorted(set(col.values()));H={c:hue(c) for c in used}
v=cv2.VideoCapture(str(pk/P['depth']));fps=v.get(5);frames=[]
while True:
    ok,f=v.read()
    if not ok:break
    frames.append(cv2.resize(f,(480,270)))
def regions(f):
    hsv=cv2.cvtColor(f,cv2.COLOR_BGR2HSV);sat=hsv[...,1]>70;h_=hsv[...,0].astype(int);d=np.stack([np.minimum(abs(h_-H[c]),180-abs(h_-H[c])) for c in used]);near=np.argmin(d,0)
    return {c:cv2.morphologyEx((sat&(near==i)&(d[i]<=8)).astype(np.uint8),cv2.MORPH_OPEN,np.ones((3,3),np.uint8)) for i,c in enumerate(used)}
cuts=[s['start'] for s in P['shots'][1:]];warn=[];keys=[0.15];picked=[]
for i,b in enumerate(P['beats']):
    ca,ct=col.get(b['actor']),col.get(b.get('target'));best=None;scores=[];actor_max=0
    for k in range(int(math.ceil(b['start']*fps)),int(b['end']*fps)):
        t=k/fps
        if t<.3 or any(abs(t-c)<.3 for c in cuts) or k>=len(frames):continue
        R=regions(frames[k]);aa=float(R[ca].mean()) if ca else 0.;at=float(R[ct].mean()) if ct else 0.;actor_max=max(actor_max,aa)
        if ca and ct and aa>.003 and at>.003:contact=float((cv2.dilate(R[ca],np.ones((11,11),np.uint8))&R[ct]).mean());sc=math.sqrt(min(aa,at))*(1+40*contact)
        else:sc=math.sqrt(at)/2 if at>.003 else (math.sqrt(aa) if aa>.003 else 0.);contact=0.
        if b.get('change'):sc*=1+.4*(t-b['start'])/max(1e-6,b['end']-b['start'])
        scores.append((t,sc,aa,at,contact))
    if not scores:warn.append(f"beat {i+1}: no frame at least 0.3 s from a cut; keyframe at its middle");t=round((b['start']+b['end'])/2,2);keys.append(t);picked.append(dict(beat=i+1,time=t,why='middle (no clear frame)'));continue
    if b.get('peak') is not None:
        t0=float(b['peak']);why='peak given'
    else:
        t0,s0=max(scores,key=lambda x:x[1])[:2];why=f'best score {s0:.3f}'
    whole=[x for x in scores if abs(x[0]-round(x[0]))<.5/fps and abs(x[0]-t0)<=.35]
    s_at=lambda t:min(scores,key=lambda x:abs(x[0]-t))[1]
    if whole and max(whole,key=lambda x:x[1])[1]>=.85*s_at(t0):t0=round(max(whole,key=lambda x:x[1])[0]);why+=', moved to a whole second'
    t0=round(t0,2);row=min(scores,key=lambda x:abs(x[0]-t0))
    if ca and actor_max<.03:warn.append(f"beat {i+1}: the contact is hidden: {b['actor']} ({ca}) never covers 3% of the picture in this beat; a span that shows the contact would read better")
    elif ca and row[2]<.003:warn.append(f"beat {i+1}: {b['actor']} ({ca}) has no colour at the keyframe ({t0} s); the keyframe image must carry whose hand it is, or tint them with a hand box")
    for sh in P['shots']:  # a shot of the beat where the actor shows no colour at all: the measure cannot rank it, though it may hold the peak
        inner=[x for x in scores if sh['start']<=x[0]<sh['end']]
        if ca and inner and max(x[2] for x in inner)<.003 and b.get('peak') is None:warn.append(f"beat {i+1}: in shot {sh['index']} ({sh['start']}-{sh['end']} s) {b['actor']} has no colour, so it cannot be ranked; if the beat peaks there, give the beat a peak time")
    if all(abs(t0-k)>.3 for k in keys):keys.append(t0)
    picked.append(dict(beat=i+1,time=t0,why=why,actor=round(row[2],3),target=round(row[3],3),contact=round(row[4],4)))
print(json.dumps(dict(package=pid,keyframes=keys,picked=picked,warnings=warn),indent=1))
if dry:sys.exit()
shot_at=lambda t:next((s['index'] for s in P['shots'] if s['start']-1e-3<=t<s['end']),P['shots'][-1]['index'])
beat_at=lambda t:next((b for b in P['beats'] if b['start']-1e-3<=t<b['end']+1e-3),None)
def key(t):
    b=beat_at(t);old=next((k for k in P['keyframes'] if abs(k['time']-t)<.05),None)
    if old and old.get('summary') not in ('opening','not described',None) and t<.2:return dict(old,shot=shot_at(t))
    if not b:return dict(time=t,shot=shot_at(t),summary='The opening frame.',people=[dict(name=n,doing='') for n in col])
    s=f"{b['actor']} {b['verb']} {b.get('target','')}".strip()+'.'+(f" {b['change'][0].upper()+b['change'][1:]}." if b.get('change') else '')
    return dict(time=t,shot=shot_at(t),summary=s if t>=.2 else 'The opening frame. '+s,people=[dict(name=b['actor'],doing=f"{b['verb']} {b.get('target','')}".strip())]+([dict(name=b['target'],doing=b.get('change') or '')] if b.get('target') else []))
def layout(t):  # where each person is at a keyframe, from the tint: screen side (centroid) and share of the picture
    k=min(len(frames)-1,round(t*fps));R=regions(frames[k]);out={}
    for n,c in col.items():
        m=R[c]
        if m.mean()<.003:continue
        x=float(np.nonzero(m)[1].mean())/m.shape[1];out[n]=dict(side='left' if x<.4 else 'right' if x>.6 else 'centre',area=round(float(m.mean()),3))
    return out
spec_path=pk.parent/f'{pid}-spec.json';spec=json.load(open(spec_path))
spec['keyframes']=[dict(key(t),layout=layout(t)) for t in keys];spec['keyPicker']=dict(picked=picked,warnings=warn);spec['notes']=[n for n in spec.get('notes',[]) if not n.startswith('Keyframes:')]+[f"Keyframes: {', '.join(str(k) for k in keys)} s, picked per beat (depth-pick-keys.py)"+(f"; warnings: {'; '.join(warn)}" if warn else '')]
json.dump(spec,open(spec_path,'w'),indent=1)
for f in pk.glob('key-*.jpg'):f.unlink()
subprocess.run([sys.executable,'authoring/render/video-clay-pack.py',str(spec_path)],check=True,capture_output=True)
P2=json.load(open(pk/'package.json'));P2['beats']=P['beats'];P2['summary']=P.get('summary');P2['beatCheck']=P.get('beatCheck');json.dump(P2,open(pk/'package.json','w'),indent=1)
