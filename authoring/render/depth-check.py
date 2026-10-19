"""Double check of a depth-library package at its keyframes (docs/DEPTH_LIBRARY_PLAN.md): is each person's colour where it should be,
with a person's shape? Run after a build or a fix (depth-build.py and depth-fix.py call it), or by hand:
  .authoring/vision-venv/bin/python authoring/render/depth-check.py SOURCE-ID CLIP-ID
  .authoring/vision-venv/bin/python authoring/render/depth-check.py SOURCE-ID package:PACKAGE-ID   (a package built by hand)
At each keyframe the tinted depth frame is read back: each colour's region is the pixels whose hue is nearest that colour's hue
and clearly saturated (the depth's grey has none). The source frame at the same time gives the people the pose detector sees
(the cache from the build; at least 30% of the picture tall, confidence 0.5) and their nose and shoulders. Issues:
  missing: a person with a box at that moment (the build's tracks, the fixes, boxes by hand) has no colour (or under 0.3% of the picture);
  unexpected: a colour appears for a person with no box at that moment;
  untinted person: the detector sees a large person with less than a quarter of the box tinted;
  two colours: two colours each cover more than a quarter of one detected person;
  box-shaped: a region fills more than 90% of its bounding box (a hand box, or a tint that ran along a box edge);
  head: a detected person's nose is seen but the colour covering their body does not reach it.
Writes check.json in the package folder ({keyframes: [{time, ok, issues, colours}]}) and check.jpg (source with the detector's
boxes beside the tinted frame with each colour's outline and the issues). It does not change anything: the fixes are the page's."""
import sys,json,pathlib,cv2,numpy as np
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
def iou(p,q):
    w_=max(0,min(p[2],q[2])-max(p[0],q[0]));h_=max(0,min(p[3],q[3])-max(p[1],q[1]));i=w_*h_;return i/((p[2]-p[0])*(p[3]-p[1])+(q[2]-q[0])*(q[3]-q[1])-i+1e-9)
out=[];rows=[]
for k in P['keyframes']:
    dv.set(cv2.CAP_PROP_POS_FRAMES,round(k['time']*dv.get(5)));ok,d=dv.read();sv.set(cv2.CAP_PROP_POS_MSEC,(P['start']+k['time'])*1000);ok2,f=sv.read()
    if not ok or not ok2:out.append(dict(time=k['time'],ok=False,issues=['frame not readable']));continue
    h,w=d.shape[:2];f=cv2.resize(f,(w,h));hsv=cv2.cvtColor(d,cv2.COLOR_BGR2HSV);sat=hsv[...,1]>70
    dist=np.stack([np.minimum(abs(hsv[...,0].astype(int)-H[c]),180-abs(hsv[...,0].astype(int)-H[c])) for c in used])
    near=np.argmin(dist,0);masks={c:(sat&(near==i)&(dist[i]<=8)) for i,c in enumerate(used)}
    masks={c:cv2.morphologyEx(m.astype(np.uint8),cv2.MORPH_OPEN,np.ones((3,3),np.uint8))>0 for c,m in masks.items()}
    area={c:float(m.mean()) for c,m in masks.items()};at=P['start']+k['time'];want={colour_of[n]:n for n in tracked_at(at) if n in colour_of} if TR else {colour_of[p['name']]:p['name'] for p in k['people'] if p['name'] in colour_of}
    issues=[];kf=round((P['start']+k['time'])*vfps);q=cache/f'{kf}.json';dets=[]
    if q.exists():
        dd=json.loads(q.read_text());sx=w/S['size'][0]
        for b,kp in zip(dd['boxes'],dd.get('keypoints') or [[]]*len(dd['boxes'])):
            b=[v*sx for v in b];
            if b[3]-b[1]<.3*h:continue
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
        if tot<.25:issues.append(f'untinted person: {where} (box {round((y1-y0)/h*100)}% tall) is {tot:.0%} tinted')
        elif len(top)>1 and cov[top[1]]>.25 and cov[top[0]]>.25:issues.append(f'two colours: {where} is {top[0]} {cov[top[0]]:.0%} and {top[1]} {cov[top[1]]:.0%}')
        if kp and tot>=.25 and kp[0][2]>.5:
            nx,ny=int(kp[0][0]),int(kp[0][1]);c=top[0];r=max(3,int(.03*(y1-y0)))
            if 0<=nx<w and 0<=ny<h and not masks[c][max(0,ny-r):ny+r,max(0,nx-r):nx+r].any():issues.append(f'head: {where} has a face seen but {c} does not reach it')
    out.append(dict(time=k['time'],ok=not issues,issues=issues,colours={c:round(a*100,1) for c,a in area.items() if a>=.003}))
    a_=f.copy();b_=d.copy()
    for b,_ in dets:cv2.rectangle(a_,(int(b[0]),int(b[1])),(int(b[2]),int(b[3])),(0,255,255),2)
    for c in used:
        cs,_=cv2.findContours(masks[c].astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);col=[int(NAMED[c][i:i+2],16) for i in (5,3,1)];cv2.drawContours(b_,[x for x in cs if cv2.contourArea(x)>.002*w*h],-1,(255,255,255),3);cv2.drawContours(b_,[x for x in cs if cv2.contourArea(x)>.002*w*h],-1,col,1)
    lab=np.zeros((26+22*max(1,len(issues)),2*w,3),np.uint8);cv2.putText(lab,f"{k['time']} s  {'OK' if not issues else str(len(issues))+' issue(s)'}",(8,19),0,.6,(120,230,120) if not issues else (80,180,255),2)
    for i,t in enumerate(issues):cv2.putText(lab,t[:150],(8,42+22*i),0,.5,(230,230,230),1)
    rows.append(np.vstack([np.hstack([a_,b_]),lab]))
json.dump(dict(clip=clip,package=C['package'],keyframes=out,ok=all(x['ok'] for x in out)),open(pk/'check.json','w'),indent=1)
if rows:
    W=max(r.shape[1] for r in rows);cv2.imwrite(str(pk/'check.jpg'),cv2.resize(np.vstack([np.pad(r,((0,0),(0,W-r.shape[1]),(0,0))) for r in rows]),None,fx=.5,fy=.5),[cv2.IMWRITE_JPEG_QUALITY,85])
print(json.dumps(dict(clip=clip,ok=all(x['ok'] for x in out),keyframes=[(x['time'],x['issues']) for x in out])))
