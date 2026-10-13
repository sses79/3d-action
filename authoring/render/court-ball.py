"""A ball's track through a court clip, for set_pair_scene's props: in whose hand it is, and its course when it is loose.
  .authoring/vision-venv/bin/python authoring/render/court-ball.py CAMERA.json PLACE.json SIGHTINGS.json OUT.json [--color=green] [--reach=1.6]
CAMERA.json is the court camera (as for court-place.py), PLACE.json is court-place.py's result (its `court` block: hips and
wrists of the two players per frame, court metres), SIGHTINGS.json is where the ball was found in the picture:
{frames: [{k: frame of the window, t, found: [{centre: [x, y] pixels, size: [w, h], fill, hsv}]}]} (authoring/render/sam3-find.py); frames may be missing.

A sighting is kept when it is as large as a ball would be at the players' distance, round, and not white or grey (a
wristband, a shoe and a hand were taken for the ball otherwise). The ball is in a hand while its
sighting is within --reach ball widths of that wrist in the picture (the nearest wrist of either player), and frames without
a sighting between two frames in the same player's hands stay in those hands. A stretch in a
player's hands needs three sightings at their wrist; with fewer it is a loose ball. Before its first sighting it is taken to be
in the hands that have it next, and the other player's hand near it for under 0.4 s is not a change of hands. Elsewhere it is loose: its course is a thrown
ball's (gravity, bouncing off the floor) from the wrist that let go, fitted to the sightings, and to the wrist that takes it
if one does. A short loose stretch that returns to the same player (a dribble) and that the fit misses by more than two
ball widths is left in the hand and listed. With one camera a loose ball's distance is not seen, only inferred from that fit: the result gives how far the
fitted course is from the sightings, in pixels. OUT.json: {prop: {id, name, shape, size, color, represents, track}, summary};
track times are seconds from the window's start, places in room axes (x = court x, y up, z toward the main camera)."""
import sys,json,numpy as np,cv2
cam_file,place_file,sight_file,out=sys.argv[1:5];opt=lambda k,d:next((a.split('=',1)[1] for a in sys.argv if a.startswith('--'+k+'=')),d);REACH=float(opt('reach',1.6));COLOR=opt('color','green')
track=json.load(open(cam_file));W,H=track.get('size',[1920,1080]);C=np.array(track['C']);fps=track['fps'];F=len(track['frames']);BALL=.24;G=9.81
LENS=[float(np.exp(f['q'][0])) for f in track['frames']];ROT=[cv2.Rodrigues(np.array(f['q'][1:4]))[0] for f in track['frames']]
def pixel(k,X):c=ROT[k]@(np.asarray(X,float)-C);return np.array([LENS[k]*c[0]/c[2]+W/2,LENS[k]*c[1]/c[2]+H/2])
ray=lambda k,uv:ROT[k].T@np.array([(uv[0]-W/2)/LENS[k],(uv[1]-H/2)/LENS[k],1.])
place=json.load(open(place_file));names=list(place['court']);court=[place['court'][n] for n in names];T=np.arange(F)/fps
# 1. one sighting a frame: about a ball's size at that distance, and the one nearest the last
seen={};last=None
for fr in sorted(json.load(open(sight_file))['frames'],key=lambda f:f['k']):
    k=fr['k']
    if k>=F:continue
    wide=BALL*LENS[k]/np.linalg.norm(np.array(court[0]['hips'][k])-C);ok=[np.array(q['centre']) for q in fr['found'] if .8*wide<min(q['size']) and max(q['size'])<1.45*wide and max(q['size'])<1.4*min(q['size']) and q.get('fill',1)>=.6 and q.get('hsv',[0,255,0])[1]>=50]
    if not ok:continue
    pick=min(ok,key=lambda c:np.linalg.norm(c-last[1])/max(1,k-last[0])) if last is not None else ok[0]
    if last is not None and np.linalg.norm(pick-last[1])>(k-last[0])*4*wide+2*wide:continue  # a jump no ball makes: something else that looks like one
    seen[k]=pick;last=(k,pick)
# 2. in a hand: the nearest wrist in the picture, within reach
def nearest(k):
    wide=BALL*LENS[k]/np.linalg.norm(np.array(court[0]['hips'][k])-C);best=None
    for p in range(len(court)):
        for h,side in (('l','left'),('r','right')):
            d=np.linalg.norm(pixel(k,court[p][side][k])-seen[k])/wide
            if best is None or d<best[0]:best=(d,p,h)
    return best
state=[None]*F;near={k:nearest(k) for k in seen}
for k,(d,p,h) in near.items():state[k]=(p,h) if d<REACH else 'loose'
ks=sorted(seen)
for a,b in zip(ks,ks[1:]):  # frames without a sighting
    for k in range(a+1,b):state[k]=state[a] if state[a]!='loose' and state[b]!='loose' and state[a][0]==state[b][0] else state[a] if b-a<=4 or state[a]==state[b] else state[a] if k-a<b-k else state[b]
first=next((state[k] for k in ks if state[k]!='loose'),'loose')
for k in range(0,ks[0]):state[k]=first  # before the ball is first seen it is taken to be in the hands that have it next
for k in range(ks[-1]+1,F):state[k]=state[ks[-1]]
def runs(key):
    res=[];a=0
    for k in range(1,F+1):
        if k==F or key(state[k])!=key(state[a]):res.append([a,k-1]);a=k
    return res
who=lambda s:'loose' if s=='loose' else s[0]
for a,b in runs(who):  # a state shorter than 0.2 s between two alike is a misreading
    if b-a+1<round(.2*fps) and a>0 and b<F-1 and who(state[a-1])==who(state[b+1]):
        for k in range(a,b+1):state[k]=state[a-1]
for a,b in runs(who):  # the other player's hand passing the ball in the picture for under 0.4 s is not a change of hands
    if state[a]!='loose' and b-a+1<round(.4*fps):
        side=[state[k] for k in (a-1,b+1) if 0<=k<F and state[k]!='loose' and state[k][0]!=state[a][0]]
        if side:
            for k in range(a,b+1):state[k]=side[0]
for a,b in runs(who):  # a player has the ball only where it is seen at their wrist at least three times; fewer (one sighting beside a bystander) is a loose ball
    if state[a]!='loose' and any(k in seen for k in range(a,b+1)) and sum(1 for k in range(a,b+1) if k in seen and near[k][0]<REACH and near[k][1]==state[a][0])<3:
        for k in range(a,b+1):state[k]='loose'
for a,b in runs(who):  # one hand per stretch of at least 0.4 s
    if state[a]=='loose':continue
    seg=[];c=a
    for k in range(a+1,b+2):
        if k==b+1 or state[k][1]!=state[c][1]:seg.append([c,k-1]);c=k
    for i,(c,d) in enumerate(seg):
        if d-c+1<round(.4*fps) and len(seg)>1:
            other=state[seg[i-1][0]] if i>0 else state[seg[i+1][0]]
            for k in range(c,d+1):state[k]=other
# 3. loose: a thrown ball's course from the wrist that let go, fitted to the sightings
def course(p0,v0,n,dt):
    P=[];p=np.array(p0,float);v=np.array(v0,float);sub=4
    for _ in range(n):
        P.append(p.copy())
        for _ in range(sub):
            v[2]-=G*dt/sub;p=p+v*dt/sub
            if p[2]<BALL/2 and v[2]<0:p[2]=BALL/2;v=v*np.array([.85,.85,-.75])
    return np.array(P)
def nelder(fn,x0,step,iters=300):
    n=len(x0);S=[np.array(x0,float)]+[np.array(x0,float)+step*np.eye(n)[i] for i in range(n)];V=[fn(s) for s in S]
    for _ in range(iters):
        o=np.argsort(V);S=[S[i] for i in o];V=[V[i] for i in o];c=np.mean(S[:-1],0);r=c+(c-S[-1]);fr=fn(r)
        if fr<V[0]:
            e=c+2*(c-S[-1]);fe=fn(e);S[-1],V[-1]=(e,fe) if fe<fr else (r,fr)
        elif fr<V[-2]:S[-1],V[-1]=r,fr
        else:
            q=c+.5*(S[-1]-c);fq=fn(q)
            if fq<V[-1]:S[-1],V[-1]=q,fq
            else:S=[S[0]]+[S[0]+.5*(s-S[0]) for s in S[1:]];V=[V[0]]+[fn(s) for s in S[1:]]
    i=int(np.argmin(V));return S[i],V[i]
wrist=lambda k:np.array(court[state[k][0]]['left' if state[k][1]=='l' else 'right'][k])
B=np.array([[1.,0,0],[0,0,1],[0,-1,0]]);room=lambda X:[round(float(x),3) for x in B@np.asarray(X)];parts=[];flights=[];kept=[]
for a,b in runs(lambda s:s):
    if state[a]!='loose' and parts and parts[-1].get('holder')==state[a][0] and parts[-1].get('hand')==state[a][1]:continue
    if state[a]!='loose':parts.append(dict(start=round(a/fps,3),holder=int(state[a][0]),hand=state[a][1],**({'blend':.07} if parts else {})));continue
    obs=[k for k in range(a,b+1) if k in seen];
    if not obs and a==0:continue
    n=b-a+2;k0=max(a-1,0);start=wrist(k0) if a>0 else None;end=wrist(b+1) if b<F-1 else None
    cap=3*BALL*LENS[a]/np.linalg.norm(np.array(court[0]['hips'][a])-C)
    def unpack(x):
        if start is not None:return start,x
        d=ray(a,seen[obs[0]]);return C+x[3]*d/np.linalg.norm(d),x[:3]
    def cost(x):
        p0,v0=unpack(x);P=course(p0,v0,n,1/fps);e=[min(cap,np.linalg.norm(pixel(k,P[k-k0])-seen[k])) for k in obs if k-k0<len(P)];c=float(np.mean(e)) if e else 0.  # capped: one wrong sighting must not pull the course
        if end is not None:c+=np.linalg.norm(pixel(b+1,P[-1])-pixel(b+1,end))+40*np.linalg.norm(P[-1]-end)
        return c
    best=None
    for vx in (-6,-2,2,6):
        for vy in (-6,-2,2,6):
            for vz in (-3,1,5):
                x0=[vx,vy,vz]+([] if start is not None else [float(np.linalg.norm(np.array(court[0]['hips'][a])-C))]);c=cost(np.array(x0,float))
                if best is None or c<best[1]:best=(x0,c)
    x,c=nelder(cost,best[0],1.,400);p0,v0=unpack(x);P=course(p0,v0,n,1/fps);off=[float(np.linalg.norm(pixel(k,P[k-k0])-seen[k])) for k in obs]
    wide=BALL*LENS[a]/np.linalg.norm(np.array(court[0]['hips'][a])-C)
    if a>0 and b<F-1 and state[k0][0]==state[b+1][0] and off and np.mean(off)>2*wide:  # a bounce off the floor back to the same player that the fit does not follow: left in the hand
        kept.append(dict(fromSeconds=round(a/fps,2),toSeconds=round(b/fps,2),sightings=len(obs),meanPixelsOffSightings=round(float(np.mean(off)),1)))
        if state[b+1][1]!=state[k0][1]:parts.append(dict(start=round((b+1)/fps,3),holder=int(state[b+1][0]),hand=state[b+1][1],blend=.07))
        continue
    parts.append(dict(start=round(a/fps,3),path=[[round((k0+i)/fps,3)]+room(P[i]) for i in range(len(P))]))
    flights.append(dict(fromSeconds=round(a/fps,2),toSeconds=round(b/fps,2),sightings=len(obs),fromHandOf=names[state[k0][0]] if a>0 else None,toHandOf=names[state[b+1][0]] if b<F-1 else None,meanPixelsOffSightings=round(float(np.mean(off)),1) if off else None,medianPixels=round(float(np.median(off)),1) if off else None,sightingsAtSeconds=[round(k/fps,2) for k in obs],worstPixels=round(max(off),1) if off else None,speedAtStartMetersPerSecond=round(float(np.linalg.norm(v0)),1),highestMeters=round(float(P[:,2].max()),2)))
if parts[0]['start']!=0:parts[0]['start']=0
held=[k for k in seen if state[k]!='loose'];gap=[float(near[k][0]) for k in held]
summary=dict(frames=F,framesWithSighting=len(seen),held=[dict(fromSeconds=p['start'],by=names[p['holder']],hand='left' if p['hand']=='l' else 'right') for p in parts if 'holder' in p],loose=flights,bouncesLeftInHand=kept,sightingFromWristInBallWidths=dict(median=round(float(np.median(gap)),2),worst=round(max(gap),2)) if gap else None)
json.dump(dict(prop=dict(id='ball',name='ball',shape='sphere',size=[BALL,BALL,BALL],color=COLOR,represents='the basketball',track=parts),summary=summary),open(out,'w'));print(json.dumps(summary))
