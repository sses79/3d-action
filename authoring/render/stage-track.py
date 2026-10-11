# Fixed stage and camera track from a few key views with depth (Depth Anything 3) and the video itself.
# .authoring/vision-venv/bin/python authoring/render/stage-track.py key.npz video.mp4 <window start s> out.json --nodal [--overlay=x0,y0,x1,y1 ...]
# Run from the repo root after both performers of the window are built (it reads their hips from the body stage's cache).
# --nodal: camera stays in one place, turns and zooms; solved frame against reference frame, no depth. Use it.
# --overlay: a screen region with a channel logo or caption (pixels); mask every one or they pass for a camera that never moves.
# Without --nodal the older map-based solve runs (camera free to travel); it trades zoom for travel on flat depth and is kept for study.
# out.json: track {quats, positions, focal} for set_pair_scene's scene.camera, a summary, and a rough stage mesh (not used).
import numpy as np,cv2,json,glob,os,sys
key,video,start,out=sys.argv[1],sys.argv[2],float(sys.argv[3]),sys.argv[4]
d=np.load(key);D=d['depth'];IM=d['frames'];TK=d['times'];CF=d['confidence'];n,H,W=D.shape;f0=float(np.hypot(W,H));KI=d['intrinsics'][0];fk=[float(KI[i,0,0]*W/(2*KI[i,0,2])) for i in range(n)]
def Kof(f):return np.array([[f,0,W/2],[0,f,H/2],[0,0,1.]])
hips={};poses={}
for dd in sorted(glob.glob('.authoring/reconstruction-cache/body-*/'),key=os.path.getmtime):
    try:
        ir=json.load(open(dd+'motion-ir.json'))
        if abs(ir['recordingInterval'][0]-start)<1e-6 and ir.get('cameraHip'):sp=json.load(open(ir['sourcePose']));hips[sp['subject']]=np.array(ir['cameraHip']);poses[sp['subject']]=sp['frames']
    except Exception:pass
src=poses['left'];fps=(src[-1]['frameIndex']-src[0]['frameIndex'])/(src[-1]['time']-src[0]['time'])
OVERLAYS=[tuple(int(v) for v in x.split('=')[1].split(',')) for x in sys.argv if x.startswith('--overlay=')]
def boxes(fr,grow=.18,overlays=True):
    m=np.ones((H,W),np.uint8)*255
    for x0_,y0_,x1_,y1_ in (OVERLAYS if overlays else []):m[y0_:y1_,x0_:x1_]=0  # channel logos and captions sit still on the screen and would pass for a camera that never moves
    for b in (fr.get('bbox'),fr.get('otherBBox')):
        if b:
            w,h=b[2]-b[0],b[3]-b[1];m[max(0,int(b[1]-h*grow)):min(H,int(b[3]+h*grow*.6)),max(0,int(b[0]-w*grow*2)):min(W,int(b[2]+w*grow*2))]=0
    return m
def frame_at(t):return min(src,key=lambda f:abs(f['time']-t))
sift=cv2.SIFT_create(6000,contrastThreshold=.02);bf=cv2.BFMatcher(cv2.NORM_L2)
def feats(img,mask):
    g=cv2.cvtColor(img,cv2.COLOR_RGB2GRAY) if img.ndim==3 else img;kp,de=sift.detectAndCompute(g,mask);return np.array([k.pt for k in kp],np.float32).reshape(-1,2),de
def unproject(uv,z,f):return np.stack([(uv[:,0]-W/2)*z/f,(uv[:,1]-H/2)*z/f,z],1)
def depth_at(Di,uv):return Di[np.clip(uv[:,1].round().astype(int),0,H-1),np.clip(uv[:,0].round().astype(int),0,W-1)]
def pnp(X,uv,f):
    K0=Kof(f)
    if len(X)<12:return None
    ok,rv,tv,inl=cv2.solvePnPRansac(X.astype(np.float64),uv.astype(np.float64),K0,None,reprojectionError=3.0,iterationsCount=400,flags=cv2.SOLVEPNP_EPNP)
    if not ok or inl is None or len(inl)<12:return None
    inl=inl[:,0];ok,rv,tv=cv2.solvePnP(X[inl].astype(np.float64),uv[inl].astype(np.float64),K0,None,rv,tv,True,cv2.SOLVEPNP_ITERATIVE);return cv2.Rodrigues(rv)[0],tv[:,0],inl
def match(de,mapde):
    m=bf.knnMatch(de,mapde,k=2);return np.array([(a.queryIdx,a.trainIdx) for a,b in m if a.distance<.75*b.distance],int).reshape(-1,2)
# scale of each key view from the two dancers' hips in the body model
scale=[];masks=[]
for i in range(n):
    k=min(len(hips['left'])-1,round((TK[i]-start)*30));sc=[]
    for s in ('left','right'):
        X,Y,Z=hips[s][k];u=int(np.clip(f0*X/Z+W/2,2,W-3));v=int(np.clip(f0*Y/Z+H/2,2,H-3));sc.append(Z*fk[i]/f0/np.median(D[i,v-2:v+3,u-2:u+3]))
    scale.append(float(np.mean(sc)));masks.append(boxes(frame_at(TK[i]),overlays=False))
s0=float(np.median(scale));print('focal of key views (px)',[round(x) for x in fk],'scale from dancers',[round(x,2) for x in scale],'used',round(s0,2))
# map: key views joined one after another, each placed by the points already in the map
R=[np.eye(3)];t=[np.zeros(3)];uv0,de0=feats(IM[0],masks[0]);mapX=unproject(uv0,depth_at(D[0],uv0)*s0,fk[0]);mapde=de0;used=[s0];report=[]
for i in range(1,n):
    uv,de=feats(IM[i],masks[i]);m=match(de,mapde);r=pnp(mapX[m[:,1]],uv[m[:,0]],fk[i])
    if r is None:print('key view',i,'not placed, matches',len(m));R.append(None);t.append(None);used.append(None);continue
    Ri,ti,inl=r;zc=(mapX[m[inl,1]]@Ri.T+ti)[:,2];si=float(np.median(zc/depth_at(D[i],uv[m[inl,0]])));report.append(dict(view=i,matches=len(m),inliers=len(inl),scaleFromDancers=round(scale[i],2),scaleFromMap=round(si,2)));print(report[-1],flush=True)
    R.append(Ri);t.append(ti);used.append(s0);mapX=np.concatenate([mapX,(unproject(uv,depth_at(D[i],uv)*s0,fk[i])-ti)@Ri]);mapde=np.concatenate([mapde,de])
# every source frame against the map, the lens found per frame; cuts found from the picture
cap=cv2.VideoCapture(video);track=[];small=[];corr=[];cands=np.geomspace(700,5200,22)
def place_frame(X,uv):
    best=None
    for f in cands:
        r=pnp(X,uv,f)
        if r is not None and (best is None or len(r[2])>len(best[2])):best=(r[0],r[1],r[2],f)
    if best is None:return None
    inl=best[2]
    try:
        err,Kc,_,rv,tv=cv2.calibrateCamera([X[inl].astype(np.float32)],[uv[inl].astype(np.float32)],(W,H),Kof(best[3]),None,flags=cv2.CALIB_USE_INTRINSIC_GUESS|cv2.CALIB_FIX_PRINCIPAL_POINT|cv2.CALIB_FIX_ASPECT_RATIO|cv2.CALIB_ZERO_TANGENT_DIST|cv2.CALIB_FIX_K1|cv2.CALIB_FIX_K2|cv2.CALIB_FIX_K3)
        if 500<Kc[0,0]<8000:return cv2.Rodrigues(rv[0])[0],tv[0][:,0],len(inl),float(Kc[0,0])
    except cv2.error:pass
    return best[0],best[1],len(inl),float(best[3])
# Camera that only turns and zooms (--nodal): its place is the first key view's for the whole shot. Then only the directions
# of the first view's points matter, not their depth, so a set the depth model flattened does not bend the answer.
NODAL='--nodal' in sys.argv;n0=len(uv0);dir0=mapX[:n0]/np.linalg.norm(mapX[:n0],axis=1,keepdims=True);fgrid=np.geomspace(500,7000,90)
def kabsch(dw,rc):
    U,_,Vt=np.linalg.svd(rc.T@dw);Dg=np.diag([1,1,np.sign(np.linalg.det(U@Vt))]);return U@Dg@Vt
def rays(uv,f):
    r=np.stack([uv[:,0]-W/2,uv[:,1]-H/2,np.full(len(uv),f)],1);return r/np.linalg.norm(r,axis=1,keepdims=True)
def reproj(Rm,f,dw,uv):
    c=dw@Rm.T;return np.hypot(f*c[:,0]/np.maximum(c[:,2],1e-6)+W/2-uv[:,0],f*c[:,1]/np.maximum(c[:,2],1e-6)+H/2-uv[:,1])+1e6*(c[:,2]<=0)
def place_nodal(dw,uv):
    if len(dw)<12:return None
    rng=np.random.default_rng(len(dw));best=None;off=uv-np.array([W/2,H/2])
    for _ in range(300):
        i,j=rng.choice(len(dw),2,replace=False);c0=dw[i]@dw[j]
        if c0>.9995:continue
        cs=(off[i]@off[j]+fgrid**2)/np.sqrt((off[i]@off[i]+fgrid**2)*(off[j]@off[j]+fgrid**2));f=float(fgrid[np.argmin(np.abs(cs-c0))]);fine_=f*np.geomspace(.96,1.04,60);cs=(off[i]@off[j]+fine_**2)/np.sqrt((off[i]@off[i]+fine_**2)*(off[j]@off[j]+fine_**2));f=float(fine_[np.argmin(np.abs(cs-c0))]);r=rays(uv[[i,j]],f)
        fw=np.stack([dw[i],np.cross(dw[i],dw[j]),np.cross(dw[i],np.cross(dw[i],dw[j]))]);fc=np.stack([r[0],np.cross(r[0],r[1]),np.cross(r[0],np.cross(r[0],r[1]))]);fw/=np.linalg.norm(fw,axis=1,keepdims=True);fc/=np.linalg.norm(fc,axis=1,keepdims=True);Rm=fc.T@fw;inl=reproj(Rm,f,dw,uv)<6
        if best is None or inl.sum()>best[2].sum():best=(Rm,f,inl)
    if best is None or best[2].sum()<12:return None
    Rm,f,inl=best
    for _ in range(2):
        cand=[(lambda ff:(lambda RR:(np.mean(reproj(RR,ff,dw[inl],uv[inl])),RR,ff))(kabsch(dw[inl],rays(uv[inl],ff))))(ff) for ff in f*np.geomspace(.85,1.18,34)];e,Rm,f=min(cand,key=lambda x:x[0]);inl=reproj(Rm,f,dw,uv)<3
        if inl.sum()<12:return None
    return Rm,np.zeros(3),int(inl.sum()),float(f)
for fr in src:
    cap.set(cv2.CAP_PROP_POS_FRAMES,fr['frameIndex']);ok,img=cap.read();g=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY);small.append(cv2.resize(g,(64,36)).astype(np.float32));uv,de=feats(g,boxes(fr));m=match(de,mapde);corr.append((uv,de));track.append(None if NODAL else place_frame(mapX[m[:,1]],uv[m[:,0]]) if len(m)>=12 else None)
    if len(track)%40==0:print('frame',len(track),'inliers,focal',None if track[-1] is None else (track[-1][2],round(track[-1][3])),flush=True)
tm=np.array([f['time']-start for f in src]);N=len(src);centre=lambda x:-x[0].T@x[1]
# One shot. Frames with many map points are placed outright (camera and lens). Between them (fast zoom, blur) the lens and the
# camera's turn are carried from frame to frame by how the background moves in the picture, and the error left at the far side
# of the gap is spread over it; the camera's position is drawn straight across the gap.
strong=[k for k,x in enumerate(track) if x is not None and x[2]>=80] if not NODAL else list(range(N));Cs=np.full((N,3),np.nan);Rs=[None]*N;LF=np.full(N,np.nan)
for k in ([] if NODAL else strong):Cs[k]=centre(track[k]);Rs[k]=track[k][0];LF[k]=np.log(track[k][3])
def rv(M):return cv2.Rodrigues(M)[0][:,0]
def rm(v):return cv2.Rodrigues(np.asarray(v,float))[0]
gaps=[];carried=0
if NODAL:
    # each frame against a reference frame: the reference's picture points are directions from the camera's one place, and the
    # new frame's turn and lens are whatever makes them land where they are seen. The reference moves on when too little is shared.
    ref=0;Rs[0]=np.eye(3);LF[0]=np.log(fk[0]);Cs[:]=0;inl_=[];changes=0
    def step(k,rf):
        m=match(corr[k][1],corr[rf][1])
        if len(m)<12:return None
        return place_nodal((rays(corr[rf][0],float(np.exp(LF[rf])))@Rs[rf])[m[:,1]],corr[k][0][m[:,0]])
    for k in range(1,N):
        r=step(k,ref)
        if (r is None or r[2]<40) and ref!=k-1:
            r2=step(k,k-1)
            if r2 is not None and (r is None or r2[2]>r[2]):r=r2;ref=k-1;changes+=1
        if r is None:Rs[k]=Rs[k-1];LF[k]=LF[k-1];inl_.append(0);carried+=1;continue
        Rs[k]=r[0];LF[k]=np.log(r[3]);inl_.append(r[2])
        if k%40==0:print('frame',k,'reference',ref,'inliers',r[2],'lens',round(r[3]),flush=True)
    gaps=[dict(method='turn and zoom only, frame against reference frame',referenceChanges=changes,framesNotSolved=carried,medianInliers=int(np.median(inl_)),minInliers=int(min(inl_)))];print(gaps[0],flush=True)
else:
    for a,b in zip(strong,strong[1:]):
        if b-a<2:continue
        Rc=[Rs[a]];lf=[LF[a]];okc=0
        for k in range(a,b):
            m=match(corr[k][1],corr[k+1][1]);A=None
            if len(m)>=8:A,_=cv2.estimateAffinePartial2D(corr[k][0][m[:,0]],corr[k+1][0][m[:,1]],method=cv2.RANSAC,ransacReprojThreshold=3)
            if A is None:Rc.append(Rc[-1]);lf.append(lf[-1]);continue
            sc=float(np.hypot(A[0,0],A[1,0]));th=float(np.arctan2(A[1,0],A[0,0]));f2=np.exp(lf[-1])*sc;c0=np.array([W/2,H/2]);dl=A[:,:2]@c0+A[:,2]-c0;dz=np.array([dl[0]/f2,dl[1]/f2,1.]);dz/=np.linalg.norm(dz);ax=np.cross([0,0,1.],dz);sn=np.linalg.norm(ax);al_=rm(ax/sn*np.arcsin(sn)) if sn>1e-9 else np.eye(3);Rc.append(al_@rm([0,0,th])@Rc[-1]);lf.append(lf[-1]+np.log(sc));okc+=1
        E=rv(Rs[b]@Rc[-1].T);el=LF[b]-lf[-1]
        for j,k in enumerate(range(a+1,b),1):
            u=j/(b-a);Rs[k]=rm(E*u)@Rc[j];LF[k]=lf[j]+el*u;Cs[k]=Cs[a]*(1-u)+Cs[b]*u;carried+=1
        gaps.append(dict(start=round(float(tm[a]),2),end=round(float(tm[b]),2),frames=b-a-1,steps=okc,lensEndErrorPercent=round(float(100*(np.exp(-el)-1)),1),turnEndErrorDegrees=round(float(np.degrees(np.linalg.norm(E))),2)));print(gaps[-1],flush=True)
    for k in range(0,strong[0]):Cs[k]=Cs[strong[0]];Rs[k]=Rs[strong[0]];LF[k]=LF[strong[0]]
    for k in range(strong[-1]+1,N):Cs[k]=Cs[strong[-1]];Rs[k]=Rs[strong[-1]];LF[k]=LF[strong[-1]]
def smooth(a,h=4):
    a=np.stack([[np.median(a[max(0,i-2):i+3,j]) for i in range(len(a))] for j in range(a.shape[1])],1);ww=np.concatenate([np.arange(1,h+2),np.arange(h,0,-1)]).astype(float);ww/=ww.sum();pp=np.pad(a,((h,h),(0,0)),mode='edge');return np.stack([np.convolve(pp[:,j],ww,'valid') for j in range(a.shape[1])],1)
Qs=np.array([rv(M) for M in Rs]);rawC=Cs.copy();Cs=smooth(Cs,6);Qs=smooth(Qs,3);Fs=np.exp(smooth(LF[:,None],4)[:,0]);jit=[float(np.sqrt(((rawC-Cs)**2).sum(1).mean()))];seg=np.zeros(N,int);cut=[];shots=gaps;placedFrames=len(strong);good=strong
t30=np.arange(len(hips['left']))/30.;C30=[];Q30=[];F30=[];S30=[]
for x in t30:
    k=int(np.clip(np.searchsorted(tm,x)-1,0,len(tm)-2));u=float(np.clip((x-tm[k])/(tm[k+1]-tm[k]),0,1))
    if seg[k]!=seg[k+1]:u=float(u>=1)
    C30.append(Cs[k]*(1-u)+Cs[k+1]*u);Q30.append(Qs[k]*(1-u)+Qs[k+1]*u);F30.append(Fs[k] if u<.5 else Fs[k+1]);S30.append(int(seg[k] if u<1 else seg[k+1]))
C30=np.array(C30);Q30=np.array(Q30);jit=float(np.mean(jit));fine=[i for i in range(n) if R[i] is not None and (i==0 or (lambda r:r['inliers']>=50 and abs(r['scaleFromMap']/s0-1)<.25)(next(r for r in report if r['view']==i)))];print('key views used for the stage',fine)
# floor: plane through the low part of the key views
F=[]
for i in ([0] if NODAL else fine):  # one camera place: the floor is read from the first view alone (the joined views gave a tilt the set's known heights contradict)
    ys,xs=np.mgrid[int(H*.72):H:6,0:W:6];ok=masks[i][ys,xs]>0;uv=np.stack([xs[ok],ys[ok]],1).astype(np.float32);F.append((unproject(uv,depth_at(D[i],uv)*used[i],fk[i])-t[i])@R[i])
F=np.concatenate(F);rng=np.random.default_rng(1);best=None
for _ in range(400):
    a,b,c=F[rng.choice(len(F),3,replace=False)];nn=np.cross(b-a,c-a);l=np.linalg.norm(nn)
    if l<1e-9:continue
    nn/=l;inl=np.abs((F-a)@nn)<.06
    if abs(nn[1])>.8 and (best is None or inl.sum()>best.sum()):best=inl
P=F[best];c=P.mean(0);nrm=np.linalg.svd(P-c,full_matrices=False)[2][2];nrm=nrm if nrm[1]<0 else -nrm;rms=float(np.sqrt((((P-c)@nrm)**2).mean()))
# room: y up along the floor normal, x the first camera's right, z toward the first camera, origin on the floor under the first camera
o=-((0-c)@nrm)*nrm;ex=np.array([1.,0,0]);ex-=ex@nrm*nrm;ex/=np.linalg.norm(ex);B=np.stack([ex,nrm,np.cross(ex,nrm)]);Fl=np.diag([1.,-1,-1])
def quat(M):
    q=np.empty(4);tr=np.trace(M)
    if tr>0:s=np.sqrt(tr+1)*2;q[:]=[(M[2,1]-M[1,2])/s,(M[0,2]-M[2,0])/s,(M[1,0]-M[0,1])/s,s/4]
    else:
        i=int(np.argmax(np.diag(M)));j,k=(i+1)%3,(i+2)%3;s=np.sqrt(1+M[i,i]-M[j,j]-M[k,k])*2;q[i]=s/4;q[j]=(M[j,i]+M[i,j])/s;q[k]=(M[k,i]+M[i,k])/s;q[3]=(M[k,j]-M[j,k])/s
    return q/np.linalg.norm(q)
quats=[];pos=[]
for k in range(len(t30)):
    Rk=cv2.Rodrigues(Q30[k])[0];quats.append([round(float(x),6) for x in quat(B@Rk.T@Fl)]);pos.append([round(float(x),4) for x in B@(C30[k]-o)])
pos=np.array(pos);pitch=[float(np.degrees(np.arcsin(np.clip(-(cv2.Rodrigues(Q30[k])[0].T@np.array([0,0,1.]))@nrm,-1,1)))) for k in range(len(t30))]
# stage: first key view as a grid mesh, later views only where no earlier view has a surface
step=10;verts=[];tris=[];placed=[];Dm={}
for i in fine:  # the set behind the dancers: their boxes filled in from the surroundings, then the surface evened out
    hole=(boxes(frame_at(TK[i]),.08)==0).astype(np.uint8);inv=(1/np.maximum(D[i],1e-6)).astype(np.float32);xs_=np.arange(W)
    for y in range(H):  # each row filled straight across from the set either side of the box
        hm=hole[y]>0
        if hm.any() and not hm.all():inv[y,hm]=np.interp(xs_[hm],xs_[~hm],inv[y,~hm])
    inv=cv2.GaussianBlur(cv2.medianBlur(inv,5),(0,0),7);Dm[i]=1/np.maximum(inv,1e-6)
def valid(i):return np.ones((H,W),bool)
for i in fine:
    ys,xs=np.mgrid[0:H:step,0:W:step];ys=np.minimum(ys+step//2,H-1);xs=np.minimum(xs+step//2,W-1);gh,gw=ys.shape;uv=np.stack([xs.ravel(),ys.ravel()],1).astype(np.float32);z=depth_at(Dm[i],uv)*used[i];Xw=(unproject(uv,z,fk[i])-t[i])@R[i];ok=valid(i)[ys,xs].ravel()
    for j in placed:  # hidden where an earlier view already has a valid surface in its own picture
        pc=Xw@R[j].T+t[j];u=fk[j]*pc[:,0]/np.maximum(pc[:,2],1e-6)+W/2;v=fk[j]*pc[:,1]/np.maximum(pc[:,2],1e-6)+H/2;ins=(pc[:,2]>0)&(u>=4)&(u<W-4)&(v>=4)&(v<H-4);vj=cv2.erode(valid(j).astype(np.uint8),np.ones((25,25),np.uint8))>0;ok&=~(ins&vj[np.clip(v.astype(int),0,H-1),np.clip(u.astype(int),0,W-1)])
    Xr=(Xw-o)@B.T;low=np.abs(Xr[:,1])<.1;Xr[low,1]=0;base=len(verts)*0+sum(len(v) for v in verts);zg=z.reshape(gh,gw);okg=ok.reshape(gh,gw);lg=low.reshape(gh,gw);idx=np.arange(gh*gw).reshape(gh,gw);add=0
    for a,b,c2 in (((0,0),(1,0),(0,1)),((1,0),(1,1),(0,1))):
        sl=lambda p:(slice(p[0],gh-1+p[0]),slice(p[1],gw-1+p[1]));za,zb,zc=zg[sl(a)],zg[sl(b)],zg[sl(c2)];keep=okg[sl(a)]&okg[sl(b)]&okg[sl(c2)]&(np.maximum(np.maximum(za,zb),zc)/np.minimum(np.minimum(za,zb),zc)<1.10)&~(lg[sl(a)]&lg[sl(b)]&lg[sl(c2)])
        tr=np.stack([idx[sl(a)][keep],idx[sl(b)][keep],idx[sl(c2)][keep]],1)+base;tris.append(tr);add+=len(tr)
    verts.append(Xr);placed.append(i);print('stage view',i,'triangles',add,flush=True)
V=np.concatenate(verts);Tr=np.concatenate(tris);usedv=np.unique(Tr);remap=-np.ones(len(V),int);remap[usedv]=np.arange(len(usedv));V=V[usedv];Tr=remap[Tr]
summary=dict(keyViews=n,keyTimes=[round(float(x-start),2) for x in TK],joins=report,framesPlaced=placedFrames,frames=N,cuts=[round(float(tm[k]),2) for k in cut],shots=shots,stageKeyViews=fine,lensPx=[round(float(x)) for x in F30[::30]],trackJitterRmsMeters=round(jit,4),floorRmsMeters=round(rms,3),floorPoints=int(best.sum()),cameraHeight=[round(float(x),2) for x in pos[::30,1]],cameraPitchDown=[round(x,1) for x in pitch[::30]],cameraTravelMeters=round(float(np.linalg.norm(pos[-1]-pos[0])),2),cameraPath=[[round(float(x),2) for x in p] for p in pos[::30]],stageVertices=len(V),stageTriangles=len(Tr))
json.dump(dict(summary=summary,track=dict(quats=quats,positions=pos.tolist(),focal=[round(float(x)/f0,4) for x in F30],shot=S30),stage=dict(positions=[round(float(x),3) for x in V.ravel()],indices=Tr.ravel().tolist(),time=0,room=True)),open(out,'w'));print(json.dumps(summary,indent=1))
