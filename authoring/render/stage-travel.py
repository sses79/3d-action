# Camera track for a camera that travels (walks or flies round the performers), from Depth Anything 3's own cameras on key views.
# .authoring/vision-venv/bin/python authoring/render/stage-travel.py <window start s> <window end s> out.json key-a.npz [key-b.npz ...]
# Run from the repo root after both performers of the window are built (it reads their hips and 2D poses from the stage caches).
# Each key file is one stage-depth.py run of 8 views. A later file must share two of its times with the first (use the first
# file's first and last): its cameras are brought into the first file's space through those two views, which gives more key
# views than one run can take. Between key views the camera is interpolated, so use it for a smooth move, not a shaky one.
# What is assumed: one lens for the whole shot (the median over the views; the first view of a run reads differently and is
# left out), and a camera held level on average (the floor's normal is the mean of the cameras' up directions; its height is
# where the performers' ankles are). Metres come from the performers: the body model's distance to each hip against the depth
# there. out.json: track {quats, positions, focal} for set_pair_scene's scene.camera, and a summary to read before using it.
# stage-track.py --nodal is for a camera that stays in one place; this is for one that does not.
import numpy as np,json,glob,os,sys
start,end,out=float(sys.argv[1]),float(sys.argv[2]),sys.argv[3];files=[a for a in sys.argv[4:] if not a.startswith('--')]
# --smooth=seconds: with several runs the key views of different runs disagree by a few degrees and a few tenths of a metre, and a
# curve through every one of them zigzags. Then the camera at each moment is a fit (a line in time, nearer views counting more)
# to the key views within that many seconds either side, which averages the runs' disagreement out.
SMOOTH=next((float(a.split('=')[1]) for a in sys.argv if a.startswith('--smooth=')),0.)
hips={};poses={}
for dd in sorted(glob.glob('.authoring/reconstruction-cache/body-*/'),key=os.path.getmtime):
    try:
        ir=json.load(open(dd+'motion-ir.json'))
        if abs(ir['recordingInterval'][0]-start)<1e-6 and abs(ir['recordingInterval'][1]-end)<1e-6 and ir.get('cameraHip'):sp=json.load(open(ir['sourcePose']));hips[sp['subject']]=np.array(ir['cameraHip']);poses[sp['subject']]=sp['frames']
    except Exception:pass
if set(hips)!={'left','right'}:raise SystemExit('Build both performers of this window first')
def load(f):
    d=np.load(f);E=d['extrinsics'][0];K=d['intrinsics'][0];n,H,W=d['depth'].shape
    return dict(T=[float(x) for x in d['times']],R=[E[i][:,:3].astype(float) for i in range(n)],C=[-E[i][:,:3].T.astype(float)@E[i][:,3] for i in range(n)],D=d['depth'],fk=[float(K[i,0,0]*W/(2*K[i,0,2])) for i in range(n)],H=H,W=W)
A=load(files[0]);H,W=A['H'],A['W'];f0=float(np.hypot(W,H));views=[dict(t=A['T'][i],R=A['R'][i],C=A['C'][i],D=A['D'][i],fk=A['fk'][i],first=i==0,run=0) for i in range(len(A['T']))];joins=[]
for r,f in enumerate(files[1:],1):
    B=load(f);shared=[(A['T'].index(t),j) for j,t in enumerate(B['T']) if t in A['T']]
    if len(shared)<2:raise SystemExit(f'{f} shares fewer than two times with {files[0]}')
    (i0,j0),(i1,j1)=shared[0],shared[-1];s=float(np.linalg.norm(A['C'][i0]-A['C'][i1])/max(1e-9,np.linalg.norm(B['C'][j0]-B['C'][j1])));Rab=A['R'][i0].T@B['R'][j0];tab=A['C'][i0]-s*Rab@B['C'][j0]
    # how well the second shared view agrees: where it lands and which way it looks
    off=float(np.linalg.norm(A['C'][i1]-(s*Rab@B['C'][j1]+tab)));turn=float(np.degrees(np.arccos(np.clip((np.trace((B['R'][j1]@Rab.T).T@A['R'][i1])-1)/2,-1,1))))
    joins.append(dict(file=os.path.basename(f),scale=round(s,3),secondSharedViewOffUnits=round(off,4),secondSharedViewTurnDegrees=round(turn,1)))
    for j,t in enumerate(B['T']):
        if t not in A['T']:views.append(dict(t=t,R=B['R'][j]@Rab.T,C=s*Rab@B['C'][j]+tab,D=B['D'][j]/1,fk=B['fk'][j],first=j==0,run=r,depthScale=s))
views.sort(key=lambda v:v['t']);lens=float(np.median([v['fk'] for v in views if not v['first']]))
frame_at=lambda side,t:min(poses[side],key=lambda f:abs(f['time']-t));unit=1.
def world(v,u,w):  # a pixel's point in the common space (depth units until the metres are known, then metres), and its depth
    z=float(np.median(v['D'][max(0,int(w)-6):int(w)+6,max(0,int(u)-6):int(u)+6]))*v.get('depthScale',1);X=np.array([(u-W/2)*z/v['fk'],(w-H/2)*z/v['fk'],z])*unit;return v['R'].T@X+v['C'],z
# metres: the body model's distance to each hip (it assumes a lens of f0; the distance goes with the lens) against the depth there
ratios=[]
for v in views:
    for side in ('left','right'):
        fr=frame_at(side,v['t'])
        if not fr['bbox'] or len(fr['keypoints'])!=17:continue
        kp=np.array(fr['keypoints']);u,w=kp[[11,12],0].mean(),kp[[11,12],1].mean();_,z=world(v,u,w);k=min(len(hips[side])-1,int(round((v['t']-start)*30)));ratios.append(hips[side][k][2]*lens/f0/z)
metres=float(np.median(ratios));spread=float(np.percentile(ratios,84)-np.percentile(ratios,16))/2/metres
for v in views:v['C']=v['C']*metres
unit=metres
# floor: up is the mean of the cameras' up directions (y is down in a camera), its height where the ankles are (8 cm above it)
up=-np.mean([v['R'].T@np.array([0,1.,0]) for v in views],0);up/=np.linalg.norm(up);ank=[]
for v in views:
    for side in ('left','right'):
        fr=frame_at(side,v['t'])
        if not fr['bbox'] or len(fr['keypoints'])!=17:continue
        for a in (15,16):
            if fr['keypoints'][a][2]>.5 and fr['keypoints'][a][1]<H-4:p,_=world(v,fr['keypoints'][a][0],fr['keypoints'][a][1]);ank.append(p@up)
ank=np.array(ank);level=float(np.percentile(ank,25))-.08 if len(ank) else float(min(v['C']@up for v in views))-1.2
# room: y up, x the first camera's right, z toward the first camera, origin on the floor under the first camera
c0=views[0]['C'];o=c0-((c0@up)-level)*up;ex=views[0]['R'].T@np.array([1.,0,0]);ex-=ex@up*up;ex/=np.linalg.norm(ex);B=np.stack([ex,up,np.cross(ex,up)]);Fl=np.diag([1.,-1,-1])
def quat(M):
    q=np.empty(4);tr=np.trace(M)
    if tr>0:s=np.sqrt(tr+1)*2;q[:]=[(M[2,1]-M[1,2])/s,(M[0,2]-M[2,0])/s,(M[1,0]-M[0,1])/s,s/4]
    else:
        i=int(np.argmax(np.diag(M)));j,k=(i+1)%3,(i+2)%3;s=np.sqrt(1+M[i,i]-M[j,j]-M[k,k])*2;q[i]=s/4;q[j]=(M[j,i]+M[i,j])/s;q[k]=(M[k,i]+M[i,k])/s;q[3]=(M[k,j]-M[j,k])/s
    return q/np.linalg.norm(q)
kq=[quat(B@v['R'].T@Fl) for v in views];kp=[B@(v['C']-o) for v in views];kt=[v['t'] for v in views]
for i in range(1,len(kq)):
    if kq[i]@kq[i-1]<0:kq[i]=-kq[i]
def slerp(a,b,u):
    d=float(np.clip(a@b,-1,1));th=np.arccos(d)
    return a if th<1e-6 else (np.sin((1-u)*th)*a+np.sin(u*th)*b)/np.sin(th)
def place(t):  # a smooth curve through the key places (Catmull-Rom), the turn between two keys in equal steps
    if t<=kt[0]:return kq[0],kp[0]
    if t>=kt[-1]:return kq[-1],kp[-1]
    i=max(k for k in range(len(kt)-1) if kt[k]<=t);u=(t-kt[i])/(kt[i+1]-kt[i]);p0,p1,p2,p3=kp[max(0,i-1)],kp[i],kp[i+1],kp[min(len(kp)-1,i+2)]
    return slerp(kq[i],kq[i+1],u),.5*((2*p1)+(-p0+p2)*u+(2*p0-5*p1+4*p2-p3)*u*u+(-p0+3*p1-3*p2+p3)*u**3)
KT=np.array(kt);KQ=np.array(kq);KP=np.array(kp)
def fitted(t):
    w=np.clip(1-(np.abs(KT-t)/SMOOTH)**3,0,None)**3
    if (w>1e-6).sum()<3:return place(t)
    Xm=np.stack([np.ones_like(KT),KT-t],1)*w[:,None]**.5;sol=lambda Y:np.linalg.lstsq(Xm,Y*w[:,None]**.5,rcond=None)[0][0];q=sol(KQ);return q/np.linalg.norm(q),sol(KP)
N=round((end-start)*30)+1;quats=[];pos=[]
for k in range(N):
    q,p=(fitted if SMOOTH>0 else place)(start+k/30);quats.append([round(float(x),6) for x in q]);pos.append([round(float(x),4) for x in p])
pos=np.array(pos);centre=np.array(kp);dancers=[]
for v in views:
    for side in ('left','right'):
        fr=frame_at(side,v['t'])
        if fr['bbox'] and len(fr['keypoints'])==17:kpx=np.array(fr['keypoints']);p,_=world(v,kpx[[11,12],0].mean(),kpx[[11,12],1].mean());dancers.append(dict(t=round(v['t']-start,2),side=side,room=[round(float(x),2) for x in B@(p-o)]))
heading=[float(np.degrees(np.arctan2(*(B@(v['R'].T@np.array([0,0,1.])))[[0,2]]))) for v in views]
summary=dict(keyViews=len(views),keyTimes=[round(t-start,2) for t in kt],joins=joins,lensPx=round(lens),lensPxPerView=[round(v['fk']) for v in views],lens35mmEquivalent=round(lens/f0*43.3),metresPerDepthUnit=round(metres,3),metresSpread=round(spread,3),
 cameraHeightMeters=[round(float(p[1]),2) for p in kp],cameraPlaces=[[round(float(x),2) for x in p] for p in kp],headingDegrees=[round(h) for h in heading],pathMeters=round(float(np.linalg.norm(np.diff(pos,axis=0),axis=1).sum()),2),ankleLevelSpreadMeters=round(float(ank.std()),3) if len(ank) else None,performersAtKeyViews=dancers,
 smoothSeconds=SMOOTH,note='Between key views the camera is interpolated. One lens assumed for the shot; the camera assumed level on average.')
json.dump(dict(summary=summary,track=dict(quats=quats,positions=pos.tolist(),focal=[round(lens/f0,4)]*N)),open(out,'w'));print(json.dumps({k:v for k,v in summary.items() if k!='performersAtKeyViews'}))
