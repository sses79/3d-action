"""Double check of a depth-library package at its keyframes (docs/DEPTH_LIBRARY_PLAN.md): is each person's colour where it should be,
with a person's shape? Run after a build or a fix (depth-build.py and depth-fix.py call it), or by hand:
  .authoring/vision-venv/bin/python authoring/render/depth-check.py SOURCE-ID CLIP-ID
  .authoring/vision-venv/bin/python authoring/render/depth-check.py SOURCE-ID package:PACKAGE-ID   (a package built by hand)
At each keyframe the tinted depth frame is read back: each colour's region is the pixels whose hue is nearest that colour's hue
and clearly saturated (the depth's grey has none). The source frame at the same time gives the people the pose detector sees
(the cache from the build; at least 30% of the picture tall, or in a wide shot half the largest person's height down to 12%; confidence 0.5) and their nose and shoulders. Issues:
  missing: a person with a box at that moment (the build's tracks, the fixes, boxes by hand) has no colour (or under 0.3% of the picture);
  unexpected: a colour appears for a person with no box at that moment;
  untinted person: the detector sees a large person with less than a quarter of the box tinted (a bystander: a note);
  missing subject: the same for the largest person in the frame (a fault: the subject is not tinted);
  two colours: two colours each cover more than a quarter of one detected person: one body painted in two colours. It is a note instead,
    overlap: one person in front of another (an arm across, a shoulder), when the two lie 35 grey levels or more apart in depth AND one of
    them lies mostly (40%+) outside this person's box (it belongs to someone else); a near hand of the same person stays a fault;
  box-shaped: a region fills more than 90% of its bounding box (a hand box, or a tint that ran along a box edge);
  head: a detected person's nose is seen but the colour covering their body does not reach it.
With beats (the keyframe gate): a beat person with no colour at the keyframe is missing (a fault) when someone uncoloured is in
the frame, else only not in this shot (a reaction shot: no uncoloured person half the frame tall; a note), and a hand marked as the
contact (set_contact_marks) that does not carry its owner's colour is a wrong hand colour (a fault): the video model reads the
contact from the tint.
SAM 3 (depth_missed.py, from its cache): a person it outlines in a shot's frames who is under a quarter coloured is added as an entry at that time:
  missing subject (SAM 3) when they are the largest person in the frame (a fault), else untinted person (SAM 3) (a note). This sees what
  the pose detector misses (a dark back filling the frame), which the detector-based issues above cannot.
Writes check.json in the package folder ({keyframes: [{time, ok, issues, colours}]}) and check.jpg (source with the detector's
boxes beside the tinted frame with each colour's outline and the issues). It does not change anything: the fixes are the page's."""
import sys,json,re,pathlib,cv2,numpy as np
src,clip=sys.argv[1],sys.argv[2];root=pathlib.Path('.authoring/depth-library')/src;S=json.load(open(root/'source.json'))
if clip.startswith('package:'):  # a package built by hand (no library clip): the people it names at each keyframe are expected
    C={'id':clip[8:],'package':clip[8:]};clip=clip[8:]
else:C=next(c for c in S['clips'] if c['id']==clip)
pk=pathlib.Path('.authoring/video-clay')/C['package'];P=json.load(open(pk/'package.json'))
NAMED={'blue':'#4a86d8','orange':'#ee8a3a','green':'#4fae5a','pink':'#f07fb0','purple':'#8d6fd1','yellow':'#e8c53a','red':'#d9534a','crimson':'#a3232b','navy':'#2b3a66'}  # as depth-tint.py
hue=lambda c:int(cv2.cvtColor(np.uint8([[[int(NAMED[c][i:i+2],16) for i in (5,3,1)]]]),cv2.COLOR_BGR2HSV)[0,0,0])
colour_of={p['name']:p['color'] for p in P['people']};used=sorted(set(colour_of.values()));H={c:hue(c) for c in used}
dv=cv2.VideoCapture(str(pk/P['depth']));sv=cv2.VideoCapture(S['file']);vfps=sv.get(5);cache=pathlib.Path('.authoring/reconstruction-cache')/('detections-%s-yolo26s-pose-1920'%S['sha256'][:16])
# who is expected at a keyframe: the people with a box (detector or by hand) at that moment, not everyone named in the shot
TR=[json.load(open(root/f)) for f in (f'{clip}.tracks-fixed.json' if (root/f'{clip}.tracks-fixed.json').exists() else f'{clip}.tracks.json',f'{clip}.hand.json') if (root/f).exists()]
def tracked_at(t):
    names=set()
    for tr in TR:
        T=np.array(tr['times']);j=int(np.argmin(abs(T-t)))
        if abs(T[j]-t)<.05:names|={n.removesuffix('-hand') for n,v in tr['tracks'].items() if v[j]}
    return names
OVERLAP=35  # grey levels between the two colours' median depths: real overlaps measured 45-82 (got-video-a-004: an arm across Cersei, a shoulder before a guard), one person split in two 24-25 (a near hand, got-standoff-req1)
def iou(p,q):
    w_=max(0,min(p[2],q[2])-max(p[0],q[0]));h_=max(0,min(p[3],q[3])-max(p[1],q[1]));i=w_*h_;return i/((p[2]-p[0])*(p[3]-p[1])+(q[2]-q[0])*(q[3]-q[1])-i+1e-9)
def src_t(t):  # a package's time in the source video; a test cut (derivedFrom) maps through its segments and speed
    D=P.get('derivedFrom')
    if not D:return P['start']+t
    L=(D.get('lead') or {}).get('seconds',0)  # a lead: the opening held on an image that is not in the source (a previous take's last frame)
    if t<L:return None
    base=json.load(open(pk.parent/D['package']/'package.json'))['start'];sp=D.get('speeds') or [D['speed']]*len(D['segments']);x=t-L  # each segment at its own speed (the cut planner)
    for (a_,b_),v in zip(D['segments'],sp):
        if x<=abs(b_-a_)/v+1e-6:return base+a_+x*v*(1 if b_>=a_ else -1)  # a segment from a later to an earlier time plays in reverse
        x-=abs(b_-a_)/v
    return base+D['segments'][-1][1]
out=[];rows=[]
for k in P['keyframes']:
    dv.set(cv2.CAP_PROP_POS_FRAMES,round(k['time']*dv.get(5)));ok,d=dv.read();st=src_t(k['time'])
    if st is None:f=cv2.imread(P['derivedFrom']['lead']['image']);ok2=f is not None
    else:sv.set(cv2.CAP_PROP_POS_MSEC,st*1000);ok2,f=sv.read()
    if not ok or not ok2:out.append(dict(time=k['time'],ok=False,issues=['frame not readable']));continue
    h,w=d.shape[:2];f=cv2.resize(f,(w,h));hsv=cv2.cvtColor(d,cv2.COLOR_BGR2HSV);sat=hsv[...,1]>70
    dist=np.stack([np.minimum(abs(hsv[...,0].astype(int)-H[c]),180-abs(hsv[...,0].astype(int)-H[c])) for c in used])
    near=np.argmin(dist,0);masks={c:(sat&(near==i)&(dist[i]<=8)) for i,c in enumerate(used)}
    masks={c:cv2.morphologyEx(m.astype(np.uint8),cv2.MORPH_OPEN,np.ones((3,3),np.uint8))>0 for c,m in masks.items()}
    area={c:float(m.mean()) for c,m in masks.items()};at=src_t(k['time']);want={colour_of[n]:n for n in tracked_at(at) if n in colour_of} if TR and at is not None else {colour_of[p['name']]:p['name'] for p in k['people'] if p['name'] in colour_of}
    issues=[];kf=round(at*vfps) if at is not None else None;q=cache/f'{kf}.json' if kf is not None else pathlib.Path('/nonexistent');dets=[]
    if q.exists():
        dd=json.loads(q.read_text());sx=w/S['size'][0]
        big=max([(b[3]-b[1])*sx for b in dd['boxes']] or [0]);lo=max(.12*h,min(.3*h,.5*big))  # a wide shot (everyone small): people half the largest one's height count, down to 12% of the picture (got-video-a-013: a high wide, people 23-31% tall, all were skipped)
        for b,kp in zip(dd['boxes'],dd.get('keypoints') or [[]]*len(dd['boxes'])):
            b=[v*sx for v in b];
            if b[3]-b[1]<lo:continue
            if any(iou(b,o)>.5 for o,_ in dets):continue  # the detector sometimes finds one person twice
            dets.append((b,[(x*sx,y*sx,c) for x,y,c in kp] if kp else []))
    for c,n in want.items():
        if area.get(c,0)<.003:issues.append(f'missing: {n} ({c}) has no colour')
    for c in used:
        if c not in want and area[c]>=.003:issues.append(f'unexpected: {c} ({", ".join(x for x,y in colour_of.items() if y==c)}) has no box at this moment')
        if area[c]>=.003:
            ys,xs=np.nonzero(masks[c]);fill=masks[c].sum()/max(1,(xs.max()-xs.min()+1)*(ys.max()-ys.min()+1))
            if fill>.9:issues.append(f'box-shaped: {c} fills {fill:.0%} of its bounding box')
    for b,kp in dets:
        x0,y0,x1,y1=[int(round(v)) for v in b];x0,y0=max(0,x0),max(0,y0);x1,y1=min(w,x1),min(h,y1)
        if x1-x0<4 or y1-y0<4:continue
        cov={c:float(masks[c][y0:y1,x0:x1].mean()) for c in used};tot=sum(cov.values());top=sorted(cov,key=lambda c:-cov[c])
        where=f'the person at {round((x0+x1)/2/w*100)}% across'
        main=(x1-x0)*(y1-y0)>=max((o[2]-o[0])*(o[3]-o[1]) for o,_ in dets)*.999  # the largest person in the frame: the subject, not a bystander
        if tot<.25:issues.append(f"{'missing subject' if main else 'untinted person'}: {where} (box {round((y1-y0)/h*100)}% tall) is {tot:.0%} tinted{' (the largest person in the frame)' if main else ''}")
        elif len(top)>1 and cov[top[1]]>.25 and cov[top[0]]>.25:  # two colours in one person: two people, one in front of the other, unless both lie at the same depth
            v=hsv[y0:y1,x0:x1,2];m0,m1=masks[top[0]][y0:y1,x0:x1],masks[top[1]][y0:y1,x0:x1];d0,d1=float(np.median(v[m0])),float(np.median(v[m1]))
            outside=lambda c,m:1-float(m.sum())/max(1.,float(masks[c].sum()))  # how much of that colour lies outside this person's box
            other=max(outside(top[0],m0),outside(top[1],m1))
            if abs(d0-d1)>=OVERLAP and other>=.4:near,far=(top[0],top[1]) if d0>d1 else (top[1],top[0]);issues.append(f'overlap: {where} holds {near} in front of {far} ({abs(d0-d1):.0f} grey levels apart): two people, one in front of the other')
            else:issues.append(f'two colours: {where} is {top[0]} {cov[top[0]]:.0%} and {top[1]} {cov[top[1]]:.0%}'+(f' at the same depth ({abs(d0-d1):.0f} grey levels apart)' if abs(d0-d1)<OVERLAP else ', both mostly inside this one person: one body in two colours'))
        if kp and tot>=.25 and kp[0][2]>.5:
            nx,ny=int(kp[0][0]),int(kp[0][1]);c=top[0];r=max(3,int(.03*(y1-y0)))
            if 0<=nx<w and 0<=ny<h and not masks[c][max(0,ny-r):ny+r,max(0,nx-r):nx+r].any():issues.append(f'head: {where} has a face seen but {c} does not reach it')
    b=next((x for x in P.get('beats') or [] if x['start']-1e-3<=k['time']<x['end']+1e-3),None)
    if b:  # the keyframe gate: the beat's people must be coloured, and a hand marked as the contact must carry its owner's colour
        for role in ('actor','target'):
            n=b.get(role)
            if n and n in colour_of and area.get(colour_of[n],0)<.003:
                unseen=not any(t.startswith(('untinted person','missing subject')) and int(re.search(r'box (\\d+)% tall',t).group(1))>=50 for t in issues if re.search(r'box (\\d+)% tall',t))  # nobody large and uncoloured in the frame: they are not in this shot (a reaction shot; small onlookers in the back do not count)
                issues=[t for t in issues if not t.startswith(f'missing: {n} ')]
                issues.append(f'not in this shot: {n}, the {role} of beat {P["beats"].index(b)+1} (no uncoloured person in the frame)' if unseen else f'missing: {n} ({colour_of[n]}), the {role} of beat {P["beats"].index(b)+1}, has no colour')
        if all(area.get(colour_of.get(b.get(r)),0)>=.003 for r in ('actor','target') if b.get(r) in colour_of):  # the beat's people are coloured: the largest untinted person is a bystander
            issues=[t.replace('missing subject:','untinted person:',1).replace('(the largest person in the frame)','(the largest person, but the beat\'s people are coloured: a bystander)') for t in issues]
        for m in k.get('marks') or []:
            x,y=int(m['from'][0]*w),int(m['from'][1]*h);r=max(4,w//80);win={c:int(masks[c][max(0,y-r):y+r,max(0,x-r):x+r].sum()) for c in used}
            own=colour_of.get(m['owner']);top=max(win,key=win.get) if any(win.values()) else None
            if own and win.get(own,0)==0:issues.append(f"wrong hand colour: {m['owner']}'s {m['hand']} hand (on {m['target']}'s {m['part']}) is {top or 'untinted'} in the depth video, not {own}")
    out.append(dict(time=k['time'],ok=not issues,issues=issues,colours={c:round(a*100,1) for c,a in area.items() if a>=.003}))
    a_=f.copy();b_=d.copy()
    for b,_ in dets:cv2.rectangle(a_,(int(b[0]),int(b[1])),(int(b[2]),int(b[3])),(0,255,255),2)
    for c in used:
        cs,_=cv2.findContours(masks[c].astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);col=[int(NAMED[c][i:i+2],16) for i in (5,3,1)];cv2.drawContours(b_,[x for x in cs if cv2.contourArea(x)>.002*w*h],-1,(255,255,255),3);cv2.drawContours(b_,[x for x in cs if cv2.contourArea(x)>.002*w*h],-1,col,1)
    lab=np.zeros((26+22*max(1,len(issues)),2*w,3),np.uint8);cv2.putText(lab,f"{k['time']} s  {'OK' if not issues else str(len(issues))+' issue(s)'}",(8,19),0,.6,(120,230,120) if not issues else (80,180,255),2)
    for i,t in enumerate(issues):cv2.putText(lab,t[:150],(8,42+22*i),0,.5,(230,230,230),1)
    rows.append(np.vstack([np.hstack([a_,b_]),lab]))
if (root/f'{clip}-tinted.mp4').exists():  # people SAM 3 outlines that are not coloured (depth_missed.py; read from its cache only, the build and findMissed run it)
    sys.path.insert(0,str(pathlib.Path(__file__).parent));import depth_missed
    R=depth_missed.find(src,clip,run=False)
    for x in (R or {}).get('missed',[]):
        b=x['box'];out.append(dict(time=x['time'],ok=False,missed=True,issues=[f"{'missing subject' if x['largest'] else 'untinted person'} (SAM 3): a person at {round((b[0]+b[2])/2*100)}% across in shot {x['shot']} (box {round(x['tall']*100)}% tall) is {x['coloured']:.0%} coloured{' but in a colour that lies mostly on someone else' if x.get('worn') else ''}{' (the largest person in the frame)' if x['largest'] else ''}"]))
    out.sort(key=lambda x:x['time'])
json.dump(dict(clip=clip,package=C['package'],keyframes=out,ok=all(x['ok'] for x in out)),open(pk/'check.json','w'),indent=1)
if rows:
    W=max(r.shape[1] for r in rows);cv2.imwrite(str(pk/'check.jpg'),cv2.resize(np.vstack([np.pad(r,((0,0),(0,W-r.shape[1]),(0,0))) for r in rows]),None,fx=.5,fy=.5),[cv2.IMWRITE_JPEG_QUALITY,85])
print(json.dumps(dict(clip=clip,ok=all(x['ok'] for x in out),keyframes=[(x['time'],x['issues']) for x in out])))
