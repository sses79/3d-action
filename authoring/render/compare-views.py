"""One player's movement built from two cameras of the same moment (a wide shot and its replay), compared.
  .authoring/vision-venv/bin/python authoring/render/compare-views.py WIDE/body-smoothed.npz REPLAY/body-smoothed.npz WIDE_CAMERA.json OUT.json
The two files are the body model's caches of the two builds (reconstruct_motion); WIDE_CAMERA.json is court-camera.py's
result for the wide shot. Each camera sees the body turned its own way and a replay runs at its own speed, so:
- two poses are compared over 13 joints after the best turn and change of size: what is left is how far apart the joints
  are, in metres;
- the replay's clock is fitted to the wide shot's as wide = at + speed * (replay - its start), over every start and speeds (0.15-1.5)
  0.3-1.5, by the smallest mean distance. The result also gives the median over all clocks tried and the best one more than
  half a second away, to show how much the chosen one stands out.
- the wide camera's turn is known, so each fitted turn says how the replay camera was turned in the court's axes. A real
  camera pans smoothly and stays level: its roll and the way it looks are listed per frame as a check that the two builds
  agree in three dimensions and not only in outline.
--warp lets the replay's speed change (each replay frame matched to a wide-shot time, in order, then smoothed): a replay that
slows down part way.
Limits: says nothing about where on the court the player is in the replay; one player at a time."""
import sys,json,numpy as np,cv2
A=np.load(sys.argv[1]);B=np.load(sys.argv[2]);cam=json.load(open(sys.argv[3]));J=[0,5,6,7,8,9,10,11,12,13,14,41,62]
def poses(z):
    P=z['pred_keypoints_3d'][:,J].astype(float);return P-P[:,[5,6]].mean(1,keepdims=True)
PA,PB=poses(A),poses(B);TA,TB=A['times'].astype(float),B['times'].astype(float)
def fit(X,Y):  # turn and size that carry X onto Y; what is left, in metres a joint (root mean square)
    X0,Y0=X-X.mean(0),Y-Y.mean(0);U,S,Vt=np.linalg.svd(X0.T@Y0);d=np.sign(np.linalg.det(U@Vt));D=np.diag([1,1,d]);Rm=(U@D@Vt).T;s=(S*np.diag(D)).sum()/(X0**2).sum();Z=s*(X0@Rm.T);return float(np.sqrt(((Z-Y0)**2).sum(1).mean())),Rm,s,Z,Y0
def wide(t):
    i=int(np.clip(np.searchsorted(TA,t)-1,0,len(TA)-2));u=(t-TA[i])/(TA[i+1]-TA[i]);return PA[i]*(1-u)+PA[i+1]*u
def cost(at,speed):
    ts=at+speed*(TB-TB[0])
    if ts[0]<TA[0] or ts[-1]>TA[-1]:return None
    return float(np.mean([fit(PB[k],wide(t))[0] for k,t in enumerate(ts)]))
grid=[(c,at,sp) for sp in np.arange(.15,1.51,.01) for at in np.arange(TA[0],TA[-1],.03) if (c:=cost(at,sp)) is not None];best=min(grid);allc=np.array([g[0] for g in grid])
c,at,sp=best;ts=at+sp*(TB-TB[0]);rows=[]
if '--warp' in sys.argv:  # a replay whose slow motion changes speed: each replay frame matched to a wide-shot time, in order, speeds 0.1-1.5, smoothed
    G=np.arange(TA[0],TA[-1],.01);D=np.array([[fit(PB[k],wide(g))[0] for g in G] for k in range(len(TB))]);n=len(G);cost_=np.full((len(TB),n),np.inf);back=np.zeros((len(TB),n),int);cost_[0]=D[0]
    for k in range(1,len(TB)):
        dt=TB[k]-TB[k-1];lo,hi=max(1,round(.1*dt/.01)),max(2,round(1.5*dt/.01))
        for j in range(n):
            js=np.arange(max(0,j-hi),max(0,j-lo+1))
            if not len(js):continue
            i=js[np.argmin(cost_[k-1,js])];cost_[k,j]=cost_[k-1,i]+D[k,j];back[k,j]=i
    j=int(np.argmin(cost_[-1]));path=[j]
    for k in range(len(TB)-1,0,-1):j=back[k,j];path.append(j)
    ts=G[path[::-1]].astype(float);ts=np.convolve(np.pad(ts,2,mode='edge'),np.ones(5)/5,'valid');c=float(np.mean([fit(PB[k],wide(t))[0] for k,t in enumerate(ts)]));at=float(ts[0]);sp=float((ts[-1]-ts[0])/(TB[-1]-TB[0]))

# the wide camera's turn is known, so each fitted turn says how the replay camera was turned in the court's own axes
fps=cam['fps'];first=cam['first'];Rw=lambda t:cv2.Rodrigues(np.array(cam['frames'][int(np.clip(round(t*fps)-first,0,len(cam['frames'])-1))]['q'][1:4]))[0]
for k,t in enumerate(ts):
    e,Rm,s,Z,Y=fit(PB[k],wide(t));Rc=Rw(t).T@Rm;up=Rc.T@np.array([0,0,1.]);fwd=Rc@np.array([0,0,1.])
    rows.append(dict(replay=round(float(TB[k]),2),wide=round(float(t),2),apartMeters=round(e,3),sizeRatio=round(float(s),3),rollDegrees=round(float(np.degrees(np.arcsin(np.clip(up[0],-1,1)))),1),lookingAlongCourt=[round(float(v),2) for v in fwd],perJoint=[round(float(v),3) for v in np.linalg.norm(Z-Y,axis=1)]))
names=['nose','l shoulder','r shoulder','l elbow','r elbow','l hip','r hip','l knee','r knee','l ankle','r ankle','r wrist','l wrist'];pj=np.array([r['perJoint'] for r in rows]).mean(0)
second=sorted(g for g in grid if abs(g[1]-at)>.5)[0] if any(abs(g[1]-at)>.5 for g in grid) else None
out=dict(joints=len(J),replayFrames=len(TB),clock=dict(wideSecondsAtReplayStart=round(float(at),2),speed=round(float(sp),2),replayCovers=[round(float(ts[0]),2),round(float(ts[-1]),2)],**({'warped':True,'wideAtReplay':[[round(float(a),2),round(float(b),2)] for a,b in zip(TB,ts)]} if '--warp' in sys.argv else {})),apartMeters=dict(mean=round(c,3),worst=max(r['apartMeters'] for r in rows)),otherClocks=dict(median=round(float(np.median(allc)),3),bestMoreThanHalfASecondAway=None if second is None else dict(apart=round(second[0],3),at=round(float(second[1]),2),speed=round(float(second[2]),2))),perJointMeters=dict(zip(names,[round(float(v),3) for v in pj])),rollDegrees=dict(median=float(np.median([r['rollDegrees'] for r in rows])),spread=round(float(np.std([r['rollDegrees'] for r in rows])),1)),frames=[{k:v for k,v in r.items() if k!='perJoint'} for r in rows])
json.dump(out,open(sys.argv[4],'w'));print(json.dumps({k:v for k,v in out.items() if k!='frames'}));[print(r) for r in out['frames']]
