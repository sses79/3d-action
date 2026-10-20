"""Contact cards (docs/DEPTH_REFERENCE_IMPROVEMENT_PLAN.md, step 5): for each keyframe of a package, key-N-contact.jpg, the source frame
darkened with each person outlined in their colour and named, and each visible hand marked with an arrow to what it touches, so
the image model is told whose hand is on what instead of guessing. A layout reference for keyframe generation only.
  .authoring/vision-venv/bin/python authoring/render/depth-contact-card.py PACKAGE-ID
People: the pose detector's people at the source frame (the cache of the build, or run now), each matched to the person whose
colour covers most of their box in the depth still; one left over is the beat's actor when the actor has no colour there (a hand
the tint missed), else "?". Hands: each wrist seen with confidence 0.4; it touches the nearest body point of another person within
a fifth of that person's box height: the throat (between the nose and the shoulders' middle), face, shoulder, arm (elbow), hand,
chest or waist. A keyframe's marks placed by hand (set_contact_marks: owner, hand, target, part, from and to as fractions of
the picture) replace the detector's arrows: the detector misses armour, dark clothes and arms seen from below. The beat's own contact text is printed along the bottom as what is meant. Writes the cards and adds contactStill
to the package's keyframes; prints what each card shows."""
import sys,json,math,pathlib,cv2,numpy as np
pid=sys.argv[1];pk=pathlib.Path('.authoring/video-clay')/pid;P=json.load(open(pk/'package.json'))
lib=pathlib.Path('.authoring/depth-library');src_name=(P.get('derivedFrom') or {}).get('sourceVideo',P['sourceVideo'])
S=next(json.load(open(p)) for p in lib.glob('*/source.json') if json.load(open(p))['fileName']==src_name)
NAMED={'blue':'#4a86d8','orange':'#ee8a3a','green':'#4fae5a','pink':'#f07fb0','purple':'#8d6fd1','yellow':'#e8c53a','red':'#d9534a','crimson':'#a3232b','navy':'#2b3a66'}
bgr=lambda c:tuple(int(NAMED[c][i:i+2],16) for i in (5,3,1));hue=lambda c:int(cv2.cvtColor(np.uint8([[bgr(c)]]),cv2.COLOR_BGR2HSV)[0,0,0])
col={p['name']:p['color'] for p in P['people']};used=sorted(set(col.values()));H={c:hue(c) for c in used}
def src_t(t):
    D=P.get('derivedFrom')
    if not D:return P['start']+t
    L=(D.get('lead') or {}).get('seconds',0)  # the lead (an image held at the opening, not in the source): no source frame
    if t<L:return None
    base=json.load(open(pk.parent/D['package']/'package.json'))['start'];sp=D.get('speeds') or [D['speed']]*len(D['segments']);x=t-L
    for (a,b),v in zip(D['segments'],sp):
        if x<=abs(b-a)/v+1e-6:return base+a+x*v*(1 if b>=a else -1)  # a segment from a later to an earlier time plays in reverse
        x-=abs(b-a)/v
    return base+D['segments'][-1][1]
cap=cv2.VideoCapture(S['file']);vfps=cap.get(5);W0,H0=S['size'];cache=pathlib.Path('.authoring/reconstruction-cache')/('detections-%s-yolo26s-pose-1920'%S['sha256'][:16]);model=None
def detect(k,frame):
    global model
    q=cache/f'{k}.json'
    if q.exists():return json.loads(q.read_text())
    from ultralytics import YOLO
    model=model or YOLO('.authoring/vision-models/yolo26s-pose.pt');r=model.predict(frame,device='cpu',imgsz=1920,verbose=False,conf=.2)[0]
    d={'boxes':r.boxes.xyxy.cpu().tolist(),'keypoints':r.keypoints.data.cpu().tolist() if len(r.boxes) else []};cache.mkdir(parents=True,exist_ok=True);q.write_text(json.dumps(d));return d
beat_at=lambda t:next((b for b in P.get('beats') or [] if b['start']-1e-3<=t<b['end']+1e-3),None)
PARTS=lambda kp:{'face':kp[0],'throat':(kp[0]+(kp[5]+kp[6])/2)/2,'shoulder':None,'chest':(kp[5]+kp[6]+kp[11]+kp[12])/4 if kp[11][2]>.3 else (kp[5]+kp[6])/2+[0,30,0],'waist':(kp[11]+kp[12])/2}
SIDE={5:'left',6:'right',7:'left',8:'right',9:'left',10:'right'}
report=[]
for i,k in enumerate(P['keyframes'],1):
    t=src_t(k['time'])
    if t is None:frame=cv2.resize(cv2.imread(P['derivedFrom']['lead']['image']),(W0,H0));ok=True;d={'boxes':[],'keypoints':[]}  # the lead image: hand marks only
    else:
        kf=round(t*vfps);cap.set(cv2.CAP_PROP_POS_FRAMES,kf);ok,frame=cap.read()
        if not ok:continue
        d=detect(kf,frame)
    depth=cv2.resize(cv2.imread(str(pk/k['depthStill'])),(W0,H0)) if k.get('depthStill') else None
    hsv=cv2.cvtColor(depth,cv2.COLOR_BGR2HSV) if depth is not None else None
    masks={}
    if hsv is not None:
        h_=hsv[...,0].astype(int);dist=np.stack([np.minimum(abs(h_-H[c]),180-abs(h_-H[c])) for c in used]);near=np.argmin(dist,0)
        for j,c in enumerate(used):masks[c]=cv2.morphologyEx(((hsv[...,1]>70)&(near==j)&(dist[j]<=8)).astype(np.uint8),cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
    people=[]
    for box,kp in zip(d['boxes'],d.get('keypoints') or [[]]*len(d['boxes'])):
        x0,y0,x1,y1=[int(v) for v in box];kp=np.array(kp,float) if kp else None
        if (y1-y0)<.2*H0 and (x1-x0)<.2*W0:continue
        cover={n:float(masks[c][max(0,y0):y1,max(0,x0):x1].mean()) for n,c in col.items() if c in masks}
        best=max(cover,key=cover.get) if cover else None
        people.append(dict(box=[x0,y0,x1,y1],kp=kp,name=best if best and cover[best]>.08 else None,cover=cover))
    b=beat_at(k['time']);taken={p['name'] for p in people if p['name']}
    for p in people:  # a person matched by no colour is the beat's actor when the actor has no colour here (the hand the tint missed)
        if p['name'] is None and b and b['actor'] not in taken and not (k.get('layout') or {}).get(b['actor']):p['name']=b['actor']+' (untinted)';taken.add(b['actor'])
    seen={}
    for p in people:  # one card label per name: the larger box keeps it
        n=p['name'] or '?'
        if n in seen and (seen[n]['box'][3]-seen[n]['box'][1])>=(p['box'][3]-p['box'][1]):p['name']=None
        else:
            if n in seen:seen[n]['name']=None
            seen[n]=p
    card=(frame*.6).astype(np.uint8);lines=[]
    for c,m in masks.items():
        cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);cv2.drawContours(card,[x for x in cs if cv2.contourArea(x)>.004*W0*H0],-1,bgr(c),5)
    for p in people:
        n=p['name'];c=col.get((n or '').split(' ')[0]);x0,y0,x1,y1=p['box']
        if n:cv2.putText(card,n.upper(),(max(5,x0+8),max(40,y0+45)),0,1.4,(0,0,0),9);cv2.putText(card,n.upper(),(max(5,x0+8),max(40,y0+45)),0,1.4,bgr(c) if c else (220,220,220),3)
    for p in people:
        if p['kp'] is None or not p['name']:continue
        for wi in (9,10):
            w=p['kp'][wi]
            if w[2]<.4:continue
            best=None
            for q in people:
                if q is p or q['kp'] is None:continue
                kq=q['kp'];h=q['box'][3]-q['box'][1];cand={nm:pt for nm,pt in PARTS(kq).items() if pt is not None and pt[2]>.3}
                cand.update({('right shoulder' if s==6 else 'left shoulder'):kq[s] for s in (5,6) if kq[s][2]>.3});cand.update({f"{SIDE[e]} arm":kq[e] for e in (7,8) if kq[e][2]>.3});cand.update({f"{SIDE[e]} hand":kq[e] for e in (9,10) if kq[e][2]>.3})
                for nm,pt in cand.items():
                    dd=math.hypot(w[0]-pt[0],w[1]-pt[1])
                    if dd<.2*h and (best is None or dd<best[0]):best=(dd,q,nm,pt)
            if not best:continue
            _,q,part,pt=best;who=p['name'].split(' ')[0];whom=(q['name'] or 'someone').split(' ')[0];hand=f"{who}'s {SIDE[wi]} hand -> {whom}'s {part}"
            c=col.get(who);cv2.arrowedLine(card,(int(w[0]),int(w[1])),(int(pt[0]),int(pt[1])),(255,255,255),8,tipLength=.3);cv2.arrowedLine(card,(int(w[0]),int(w[1])),(int(pt[0]),int(pt[1])),bgr(c) if c else (230,230,230),4,tipLength=.3)
            cv2.circle(card,(int(w[0]),int(w[1])),14,bgr(c) if c else (230,230,230),-1);lines.append(hand)
    if k.get('marks'):  # marks placed by hand (set_contact_marks): they replace the detector's arrows, which miss armour and arms seen from below
        card=(frame*.6).astype(np.uint8);lines=[]
        for c,m in masks.items():
            cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);cv2.drawContours(card,[x for x in cs if cv2.contourArea(x)>.004*W0*H0],-1,bgr(c),5)
        for m in k['marks']:
            c=col.get(m['owner']);a_=(int(m['from'][0]*W0),int(m['from'][1]*H0));z_=(int(m['to'][0]*W0),int(m['to'][1]*H0))
            cv2.arrowedLine(card,a_,z_,(255,255,255),9,tipLength=.25);cv2.arrowedLine(card,a_,z_,bgr(c) if c else (230,230,230),5,tipLength=.25);cv2.circle(card,a_,16,bgr(c) if c else (230,230,230),-1)
            lab=f"{m['owner'].upper()}" ;cv2.putText(card,lab,(a_[0]+20,a_[1]-20),0,1.3,(0,0,0),8);cv2.putText(card,lab,(a_[0]+20,a_[1]-20),0,1.3,bgr(c) if c else (230,230,230),3)
            lines.append(f"{m['owner']}'s {m['hand']} hand -> {m['target']}'s {m['part']}")
    foot=[f"Meant: {b['contact']}" if b and b.get('contact') else '']+lines;foot=[x for x in foot if x]
    card=cv2.resize(card,(960,540))
    if foot:  # the words go in a panel under the picture, not over it (hands are often at the bottom of the frame)
        panel=np.full((24*len(foot)+16,960,3),18,np.uint8)
        for j,x in enumerate(foot):cv2.putText(panel,x[:120],(12,26+24*j),0,.6,(255,255,255) if j or not x.startswith('Meant') else (150,220,255),1,cv2.LINE_AA)
        card=np.vstack([card,panel])
    out=f'key-{i}-contact.jpg';cv2.imwrite(str(pk/out),card,[cv2.IMWRITE_JPEG_QUALITY,90]);k['contactStill']=out
    report.append(dict(keyframe=i,time=k['time'],people=[p['name'] for p in people if p['name']],hands=lines,meant=b.get('contact') if b else None))
json.dump(P,open(pk/'package.json','w'),indent=1)
spec=pk.parent/f'{pid}-spec.json'
if spec.exists():
    sp=json.load(open(spec))
    for a,k in zip(sp.get('keyframes',[]),P['keyframes']):
        if abs(a['time']-k['time'])<.01 and k.get('contactStill'):a['contactStill']=k['contactStill']
    json.dump(sp,open(spec,'w'),indent=1)
print(json.dumps(report,indent=1))
