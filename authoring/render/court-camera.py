"""The camera of a basketball broadcast shot, frame by frame, from the court's painted lines.
  .authoring/vision-venv/bin/python authoring/render/court-camera.py VIDEO START END OUT.json --at=SECONDS (--points=POINTS.json | --camera=FIT.json) [--side=1]
The court is a model of one half's lines (lane, free-throw circle, three-point line, restricted arc; NBA sizes, metres, origin
at the centre, x toward the right-hand basket, y away from the main camera, z up; --side=-1 for the left half). A camera is
right when the model's lines, seen through it, fall on the dark lines found in the picture.
1. A first guess for the frame at --at: POINTS.json is a handful of marks made by hand, [[pixel x, pixel y], [court x, y, z]]
   (lane corners, where the three-point line meets the baseline, the rim's centre at 3.05 m: six or more, or four or
   more all on the floor; with fewer than six, marks off the floor are left out), or --camera gives an
   earlier fit {p: [log lens px, turn as a rotation vector, shift]}.
2. That frame is fitted freely (lens, turn and place), from several starts that trade lens against distance. The place is then kept: a broadcast camera turns and zooms on a fixed mount.
3. Every other frame is fitted for turn and lens only, each starting from its neighbour, forward and backward from --at.
OUT.json: {fps, first (video frame of START), size, C (the camera's place), frames: [{q: [log lens px, turn], cost}]}; cost is
the mean distance in pixels from the model's lines to the nearest dark line (capped at 14; about 1.5 is a good fit). A sheet
of nine frames with the fitted lines drawn is written beside it as .jpg: look at it, the rim in red must sit on the rim.
Limits: needs the painted half in view with dark lines on a lighter floor; a cut inside the window is not noticed."""
import cv2,numpy as np,json
A,S7,HX=14.325,7.62,12.75
def model(side=1):
    P=[];seg=lambda a,b,n=40:[P.append(np.array(a)+(np.array(b)-np.array(a))*k/n) for k in range(n+1)]
    seg([side*A,-2.44],[side*8.535,-2.44]);seg([side*8.535,-2.44],[side*8.535,2.44],30);seg([side*8.535,2.44],[side*A,2.44])
    for a in np.linspace(0,2*np.pi,80):P.append([side*8.535+1.83*np.cos(a),1.83*np.sin(a)])
    a0=np.arcsin(6.71/7.24)
    for a in np.linspace(-a0,a0,120):P.append([side*(HX-7.24*np.cos(a)),7.24*np.sin(a)])
    seg([side*A,-6.71],[side*(HX-7.24*np.cos(a0)),-6.71],25);seg([side*A,6.71],[side*(HX-7.24*np.cos(a0)),6.71],25)
    for a in np.linspace(-np.pi/2,np.pi/2,30):P.append([side*(HX-1.22*np.cos(a)),1.22*np.sin(a)])
    return np.array([[p[0],p[1],0.] for p in P])
def line_mask(f):
    g=cv2.cvtColor(f,cv2.COLOR_BGR2GRAY);bh=cv2.morphologyEx(g,cv2.MORPH_BLACKHAT,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(15,15)));m=(bh>35).astype(np.uint8)*255;m[cv2.blur(g,(41,41))<95]=0;return m
def dist(m,cap=14):return np.minimum(cv2.distanceTransform(255-m,cv2.DIST_L2,3),cap)
def project(p,X,W,H):  # p = [log f, rx, ry, rz, tx, ty, tz]
    f=np.exp(p[0]);R=cv2.Rodrigues(np.array(p[1:4]))[0];c=(R@X.T).T+np.array(p[4:7]);z=c[:,2];return np.stack([f*c[:,0]/z+W/2,f*c[:,1]/z+H/2],1),z
def cost(p,X,D,W,H,cap=14):
    q,z=project(p,X,W,H);ok=(z>0)&(q[:,0]>=0)&(q[:,0]<W-1)&(q[:,1]>=0)&(q[:,1]<H-1);v=np.full(len(X),float(cap))
    qi=q[ok].round().astype(int);v[ok]=D[qi[:,1],qi[:,0]];return float(v.mean())+(0 if ok.mean()>.35 else 5*(.35-ok.mean()))
def nelder(fn,x0,step,iters=400):
    n=len(x0);S=[np.array(x0,float)]+[np.array(x0,float)+np.eye(n)[i]*step[i] for i in range(n)];F=[fn(s) for s in S]
    for _ in range(iters):
        o=np.argsort(F);S=[S[i] for i in o];F=[F[i] for i in o];c=np.mean(S[:-1],0);r=c+(c-S[-1]);fr=fn(r)
        if fr<F[0]:
            e=c+2*(c-S[-1]);fe=fn(e);S[-1],F[-1]=(e,fe) if fe<fr else (r,fr)
        elif fr<F[-2]:S[-1],F[-1]=r,fr
        else:
            k=c+.5*(S[-1]-c);fk=fn(k)
            if fk<F[-1]:S[-1],F[-1]=k,fk
            else:S=[S[0]]+[S[0]+.5*(s-S[0]) for s in S[1:]];F=[F[0]]+[fn(s) for s in S[1:]]
    o=int(np.argmin(F));return S[o],F[o]
def fit_free(f,p0,side=1):
    H,W=f.shape[:2];D=dist(line_mask(f));X=model(side);best=(np.array(p0,float),cost(p0,X,D,W,H))
    for rnd in range(3):
        p,c=nelder(lambda p:cost(p,X,D,W,H),best[0],[.03,.004,.004,.004,.3,.3,.6][:7] if rnd==0 else [.01,.001,.001,.001,.1,.1,.2],500)
        if c<best[1]:best=(p,c)
    return best
# the camera stays where it is and only turns and zooms: p = [log f, rx, ry, rz], its place C fixed
def with_place(q,C):
    R=cv2.Rodrigues(np.array(q[1:4]))[0];return np.concatenate([q[:4],-R@C])
def fit_turn(f,q0,C,side=1):
    H,W=f.shape[:2];D=dist(line_mask(f));X=model(side);fn=lambda q:cost(with_place(q,C),X,D,W,H);best=(np.array(q0,float),fn(q0))
    for st in ([.02,.003,.003,.003],[.005,.0008,.0008,.0008]):
        p,c=nelder(fn,best[0],st,160)
        if c<best[1]:best=(p,c)
    return best
def draw(f,p,side=1,col=(0,255,255)):
    H,W=f.shape[:2];o=f.copy();q,z=project(p,model(side),W,H)
    for a in q[z>0].round().astype(int):cv2.circle(o,(int(a[0]),int(a[1])),2,col,-1)
    rim=np.array([[side*(HX+.225*np.cos(a)),.225*np.sin(a),3.05] for a in np.linspace(0,2*np.pi,30)]);q,_=project(p,rim,W,H);cv2.polylines(o,[q.round().astype(int)],True,(0,0,255),2)
    return o
if __name__=="__main__":
    import sys,time
    video,start,end,out=sys.argv[1],float(sys.argv[2]),float(sys.argv[3]),sys.argv[4];opt=lambda k,d=None:next((a.split('=',1)[1] for a in sys.argv if a.startswith('--'+k+'=')),d);side=int(opt('side',1));ref_t=float(opt('at',start))
    cap=cv2.VideoCapture(video);fps=cap.get(5);i0,i1=int(round(start*fps)),int(round(end*fps));cap.set(1,i0);frames=[]
    for i in range(i0,i1+1):
        ok,f=cap.read()
        if not ok:break
        frames.append(f)
    r=min(max(int(round(ref_t*fps))-i0,0),len(frames)-1);H,W=frames[r].shape[:2]
    if opt('camera'):p0=np.array(json.load(open(opt('camera')))['p'],float)
    else:
        marks=json.load(open(opt('points')));marks=marks if len(marks)>=6 else [m for m in marks if m[1][2]==0];flat=all(m[1][2]==0 for m in marks);I2=np.array([m[0] for m in marks],float);W3=np.array([m[1] for m in marks],float);best=None
        for fl in np.geomspace(1200,12000,120):  # the lens that lets one pose fit the marks best
            K=np.array([[fl,0,W/2],[0,fl,H/2],[0,0,1.]]);ok,rv,tv=cv2.solvePnP(W3,I2,K,None,flags=cv2.SOLVEPNP_IPPE if flat else cv2.SOLVEPNP_ITERATIVE)
            if not ok:continue
            e=float(np.sqrt(((cv2.projectPoints(W3,rv,tv,K,None)[0][:,0]-I2)**2).sum(1).mean()))
            if best is None or e<best[0]:best=(e,fl,rv,tv)
        p0=np.concatenate([[np.log(best[1])],best[2][:,0],best[3][:,0]]);print('marks: lens px',round(best[1]),'rms px',round(best[0],1))
    # With a long lens, standing further back with a longer lens looks nearly the same: the fit is started from several such
    # pairs of lens and distance and the best one kept.
    R0=cv2.Rodrigues(p0[1:4])[0];C0=-R0.T@p0[4:7];aim=np.array([side*11.4,0,0.]);tries=[fit_free(frames[r],np.concatenate([[p0[0]+np.log(k)],p0[1:4],-R0@(aim+k*(C0-aim))]),side) for k in (.8,.87,.94,1.,1.07,1.15,1.24,1.35)];print('starts: cost',[round(x[1],2) for x in tries]);low=min(x[1] for x in tries);t0=time.time();runs=[]
    for p,c in sorted(tries,key=lambda x:x[1])[:3]:  # one frame cannot tell near starts apart: the whole window is followed from each and the best kept
        if c>low+.3:continue
        C=-cv2.Rodrigues(p[1:4])[0].T@p[4:7];res={}
        for order in (range(r,len(frames)),range(r-1,-1,-1)):
            q=p[:4].copy()
            for k in order:q,c=fit_turn(frames[k],q,C,side);res[k]=(q.copy(),c)
        runs.append((float(np.mean([v[1] for v in res.values()])),C,res));print('camera at',np.round(C,2).tolist(),'mean cost over the window',round(runs[-1][0],3))
    _,C,res=min(runs,key=lambda x:x[0])
    cs=np.array([res[k][1] for k in sorted(res)]);fs=[float(np.exp(res[k][0][0])) for k in sorted(res)]
    json.dump(dict(fps=fps,first=i0,size=[W,H],C=C.tolist(),frames=[dict(q=res[k][0].tolist(),cost=res[k][1]) for k in sorted(res)]),open(out,'w'));tiles=[]
    for k in np.linspace(0,len(frames)-1,9).round().astype(int):
        o=cv2.resize(draw(frames[k],with_place(res[k][0],C),side),(640,360));cv2.putText(o,'%.2f s  cost %.2f'%(start+k/fps,res[k][1]),(8,22),cv2.FONT_HERSHEY_SIMPLEX,.6,(255,255,255),2);tiles.append(o)
    cv2.imwrite(out.replace('.json','.jpg'),np.vstack([np.hstack(tiles[i:i+3]) for i in (0,3,6)]),[cv2.IMWRITE_JPEG_QUALITY,85])
    print(json.dumps(dict(frames=len(frames),seconds=round(time.time()-t0,1),cost=dict(median=round(float(np.median(cs)),2),worst=round(float(cs.max()),2),worstAtSeconds=round(start+int(np.argmax(cs))/fps,2)),lensPixels=[round(min(fs)),round(max(fs))],cameraAtMeters=np.round(C,2).tolist())))
