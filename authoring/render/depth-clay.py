"""Clay figures placed from a depth video, drawn through each shot's own camera: no camera solve, no shared room.
  .authoring/vision-venv/bin/python authoring/render/depth-clay.py DEPTH.npz OUT.mp4 --shots SHOTS.json --tracks A.json,B.json[:old=new] --people name=colour:height,... [--width 960] [--video VIDEO] [--set SET.json]
DEPTH.npz is da3-depth.py's output for the window (depth per frame, larger further, times). TRACKS are boxes per frame by name
(the follow step). Each frame is seen by a pinhole camera at the origin looking ahead; its lens is a guess (a 40 degree wide
picture), which does not matter for where the figures land in the picture, only for how much their shapes are foreshortened.
A person's distance is the depth in the middle of their box (its near part) times a scale per shot; the scale comes from the
people whose head and feet are both in the picture (distance = lens x height / box height, which also places them directly). A person cut by the top or bottom of the
picture but not by its sides is placed from the box's width (0.55 m: shoulders and arms), since depth in a dark frame is flat;
only a person cut by a side is placed from the depth, never further than their visible width allows (0.6 m); with none, from box widths (0.55 m).
Each figure is a sphere head, a torso capsule and a column to the floor, its top at the box top (or its feet at the box bottom
when the head is cut), smoothed over 7 frames. The floor is level at the median of the feet in the shot (a tilted camera puts
it wrong). OUT.mp4 is the clay, OUT.jpg a sheet of 8 frames beside the source when --video is given.
--set SET.json adds the room as plain shapes recognised by eye (walls, columns, steps), given in picture terms per time span.
Limits: the room is only what --set gives (without it, only the floor), figures do not bend or turn, a person missing from the tracks is missing from the clay."""
import sys,json,argparse,time,subprocess,numpy as np,cv2
p=argparse.ArgumentParser();p.add_argument('depth');p.add_argument('out');p.add_argument('--shots');p.add_argument('--tracks',default='');p.add_argument('--people',default='');p.add_argument('--width',type=int,default=960);p.add_argument('--video');p.add_argument('--set');a=p.parse_args()
t0=time.perf_counter();Z=np.load(a.depth);D=Z['depth'];times=Z['times'];N,DH,DW=D.shape
COL=dict(blue='#4a90e2',orange='#e8873a',green='#3fa34d',pink='#e85d9c',purple='#8e5bd8',yellow='#e8c23a',red='#d64545',gray='#9a9a9a')
people={}
for kv in a.people.split(','):
    n,v=kv.split('=');c,h=v.split(':');people[n]=(np.array([int(COL[c][i:i+2],16) for i in (5,3,1)],float)/255,float(h))
SW,SH=1920,1080;boxes={n:[None]*N for n in people}
for f in [x for x in a.tracks.split(',') if x]:
    f,*ren=f.split(':');ren=dict(r.split('=') for r in ren)  # file.json:old=new renames a track (a person named wrongly in the follow step)
    tr=json.load(open(f));T=np.array(tr['times']);SW,SH=tr.get('size',[SW,SH])
    for n,v in tr['tracks'].items():
        n=ren.get(n,n)
        if n not in people:continue
        for k in range(N):
            j=int(np.argmin(np.abs(T-times[k])))
            if abs(T[j]-times[k])<.02 and v[j]:boxes[n][k]=np.array(v[j]['box'],float)
fps=1/np.median(np.diff(times));sh=json.load(open(a.shots))['shots'] if a.shots else []
cuts=[0]+[k for k in range(1,N) if any(abs(times[k]-s['start'])<.5/fps for s in sh)]+[N]
F=SW/2/np.tan(np.radians(20));cx,cy=SW/2,SH/2;dsx=DW/SW
def near(k,b):  # depth of the person: the nearer part of the middle of the box
    x0,y0,x1,y1=b;w,h=x1-x0,y1-y0;r=D[k,int((y0+.15*h)*dsx):max(int((y0+.6*h)*dsx),int((y0+.15*h)*dsx)+1),int((x0+.3*w)*dsx):max(int((x0+.7*w)*dsx),int((x0+.3*w)*dsx)+1)]
    return float(np.percentile(r,10)) if r.size else None
# whole = head and feet both in the picture: from the pose detector's cached keypoints for the video (the follow step's cache), a
# head point and an ankle seen with confidence 0.5 inside the picture; without a cache, a standing person's tall box
import hashlib,pathlib
cache=None
if a.video:
    cache=pathlib.Path('.authoring/reconstruction-cache')/('detections-%s-yolo26s-pose-1920'%hashlib.sha256(open(a.video,'rb').read()).hexdigest()[:16]);vfps=cv2.VideoCapture(a.video).get(5)
    cache=cache if cache.exists() else None
def iou(p,q):
    w=max(0,min(p[2],q[2])-max(p[0],q[0]));h=max(0,min(p[3],q[3])-max(p[1],q[1]));i=w*h;return i/((p[2]-p[0])*(p[3]-p[1])+(q[2]-q[0])*(q[3]-q[1])-i+1e-9)
seenKeys=0
def keys(k,b):
    global seenKeys
    if cache is None:return None
    f=cache/('%d.json'%round(times[k]*vfps))
    if not f.exists():return None
    d=json.loads(f.read_text());best=max(range(len(d['boxes'])),key=lambda i:iou(d['boxes'][i],b),default=None)
    if best is None or iou(d['boxes'][best],b)<.3 or not d['keypoints']:return None
    seenKeys+=1;return np.array(d['keypoints'][best])
wholeAt={}
def whole(b,k=None):
    K=keys(k,b) if k is not None else None
    if K is None:return b[1]>.01*SH and b[3]<.985*SH and b[3]-b[1]>1.8*(b[2]-b[0])
    head=any(K[j,2]>.5 and K[j,1]>.01*SH for j in (0,1,2));foot=any(K[j,2]>.5 and K[j,1]<.985*SH for j in (15,16));return head and foot and b[1]>.01*SH
place={n:[None]*N for n in people};floor={};scales=[];sc_of={}
for s,e in zip(cuts,cuts[1:]):
    full=[];wide=[]
    for n,(c,H) in people.items():
        for k in range(s,e):
            b=boxes[n][k]
            if b is None:continue
            d=near(k,b)
            if not d:continue
            if whole(b,k):full.append(F*H/(b[3]-b[1])/d)
            wide.append(F*.55/(b[2]-b[0])/d)
    sc=float(np.median(full)) if full else float(np.median(wide)) if wide else 1.;sc_of[s]=sc;scales.append(dict(frames=[s,e],scale=round(sc,3),fromHeights=bool(full)))
    feet=[]
    for n,(c,H) in people.items():
        rows=[]
        for k in range(s,e):
            b=boxes[n][k]
            if b is None:rows.append(None);continue
            d=near(k,b);z=F*H/(b[3]-b[1]) if whole(b,k) else F*.55/(b[2]-b[0]) if b[0]>.01*SW and b[2]<.99*SW else min(sc*d,F*.6/(b[2]-b[0]));x=((b[0]+b[2])/2-cx)*z/F
            if b[1]>.01*SH:top=(b[1]-cy)*z/F
            elif b[3]<.95*SH:top=(b[3]-cy)*z/F-H
            else:top=(b[1]-cy)*z/F-.12
            rows.append([x,top,z])
            if b[3]<.95*SH:feet.append((b[3]-cy)*z/F)
        idx=[i for i,r in enumerate(rows) if r is not None]
        if not idx:continue
        A=np.array([rows[i] for i in idx]);M=A.copy()
        for i in range(len(A)):M[i]=np.median(A[max(0,i-3):i+4],0)
        for i in range(len(A)):place[n][s+idx[i]]=M[max(0,i-2):i+3].mean(0)
    floor[s]=float(np.median(feet)) if feet else None
# draw: sphere tracing distance fields at --width
W=a.width;Hh=round(W*SH/SW);u,v=np.meshgrid((np.arange(W)+.5)*SW/W,(np.arange(Hh)+.5)*SH/Hh);R=np.stack([(u-cx)/F,(v-cy)/F,np.ones_like(u)],-1);R/=np.linalg.norm(R,axis=-1,keepdims=True);R=R.reshape(-1,3)
def cap(P,A,B,r):
    pa=P-A;ba=B-A;h=np.clip((pa@ba)/max(ba@ba,1e-9),0,1);return np.linalg.norm(pa-h[:,None]*ba,axis=1)-r
L=np.array([.35,.6,.72]);L/=np.linalg.norm(L)  # light from above-left, in front: -L points to it (y down, z ahead)
RG=R.reshape(Hh,W,3)/R.reshape(Hh,W,3)[...,2:3]
def one(P,q):
    if isinstance(q[0],str):v=np.abs(P-q[1])-q[2];return np.linalg.norm(np.maximum(v,0),axis=1)+np.minimum(v.max(1),0)
    return cap(P,*q)
sdf=lambda P,parts:np.min([one(P,q) for q in parts],0)
GREY=np.array([.80,.79,.76]);setp=json.load(open(a.set))['pieces'] if a.set else []
def floorAt(u,v,fy):  # where a picture point (fractions of width and height) meets a level floor fy below the camera
    ry=(v*SH-cy)/F;z=min(30.,fy/ry) if ry>1e-3 else 30.;return ((u*SW-cx)/F)*z,z
def pieces(t,fy):
    # --set: the room as plain shapes, recognised by eye in the source and given in picture terms (no depth): for a time span,
    # a wall (x..x1 along where it meets the floor at picture height yb, or at z metres), a column (x, its picture width), a
    # block (low, e.g. steps). Placed on the level floor of the shot, 4 m tall unless given.
    out=[]
    for q in setp:
        if not q['from']-1e-6<=t<q['to']:continue
        h=q.get('height',4.)
        if 'z' in q:z=q['z'];X=lambda u:((u*SW-cx)/F)*z
        else:_,z=floorAt(q['x'],q['yb'],fy);X=lambda u:floorAt(u,q['yb'],fy)[0]
        if q['kind']=='column':x=X(q['x']);r=q.get('width',.04)*SW*z/F/2;out.append([(np.array([x,fy,z+r]),np.array([x,fy-h,z+r]),r)])
        else:x0,x1=X(q['x']),X(q['x1']);d=q.get('depth',.3);out.append([('box',np.array([(x0+x1)/2,fy-h/2,z+d/2]),np.array([abs(x1-x0)/2,h/2,d/2]))])
    return out
proc=subprocess.Popen(['ffmpeg','-loglevel','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s',f'{W}x{Hh}','-r',str(round(fps,3)),'-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','18',a.out],stdin=subprocess.PIPE);frames=[]
for s,e in zip(cuts,cuts[1:]):
    fl=floor[s]
    for k in range(s,e):
        shapes=[]
        for n,(c,H) in people.items():
            q=place[n][k]
            if q is None:continue
            x,top,z=q;bot=fl if fl is not None and fl>top+.8 else top+H;big=1.15 if H>1.95 else 1.
            shapes.append((c,[(np.array([x,top+.12,z]),np.array([x,top+.12,z]),.115*big),(np.array([x,top+.36,z]),np.array([x,top+.78,z]),.19*big),(np.array([x,top+.85,z]),np.array([x,bot-.12,z]),.15*big)]))
        def march(sh):
            tt=np.full(len(R),.3);hit=np.full(len(R),-1);alive=np.ones(len(R),bool)
            if not sh:return hit,np.full(len(R),np.inf)
            for _ in range(60):
                i=np.nonzero(alive)[0]
                if not len(i):break
                P=R[i]*tt[i,None];best=np.full(len(i),9.);who=np.full(len(i),-1)
                for m,(c,parts) in enumerate(sh):
                    dm=sdf(P,parts);w=dm<best;best[w]=dm[w];who[w]=m
                done=best<.004;hit[i[done]]=who[done];tt[i]+=np.maximum(best,.004);alive[i[done|(tt[i]>60)]]=False
            return hit,np.where(hit>=0,tt,np.inf)
        room=[(GREY,parts) for parts in pieces(times[k]-times[0],fl if fl is not None else 1.6)]
        hp,tp=march(shapes);hr,tr=march(room);n0=len(shapes);shapes=shapes+room  # people are drawn over the room: the room is background
        hit=np.where(hp>=0,hp,np.where(hr>=0,hr+n0,-1));tt=np.where(hp>=0,tp,tr);img=np.full((Hh*W,3),.86)
        if fl is not None or setp:  # floor where no figure or room piece is nearer
            fy=fl if fl is not None else 1.6;tf=np.where(R[:,1]>1e-3,fy/np.maximum(R[:,1],1e-3),np.inf);onf=(tf<60)&(hp<0)&((hr<0)|(tf<tr))
            img[onf]=.62+.18*np.exp(-tf[onf]/25)[:,None];hit[onf]=-1
        for m,(c,parts) in enumerate(shapes):
            i=np.nonzero(hit==m)[0]
            if not len(i):continue
            P=R[i]*tt[i,None];g=[]
            for ax in np.eye(3)*.003:g.append(sdf(P+ax,parts)-sdf(P-ax,parts))
            Nn=np.stack(g,1);Nn/=np.linalg.norm(Nn,axis=1,keepdims=True)+1e-9;lam=np.clip(-(Nn@L),0,1);img[i]=c*(.35+.65*lam[:,None])
        f=(np.clip(img,0,1).reshape(Hh,W,3)*255).astype(np.uint8);proc.stdin.write(f.tobytes());frames.append(f) if k in set(np.linspace(0,N-1,8).astype(int)) else None
proc.stdin.close();proc.wait();took=time.perf_counter()-t0
json.dump(dict(frames=N,fps=round(fps,3),shots=scales,seconds=round(took,1),lens='40 degrees wide (a guess)',people={n:dict(color=[round(x,3) for x in c],height=H,framesPlaced=sum(q is not None for q in place[n])) for n,(c,H) in people.items()}),open(a.out.replace('.mp4','.json'),'w'),indent=1)
if a.video:
    cap_=cv2.VideoCapture(a.video);rows=[]
    for j,k in enumerate(np.linspace(0,N-1,8).astype(int)):
        cap_.set(cv2.CAP_PROP_POS_MSEC,times[k]*1000);ok,src=cap_.read();src=cv2.resize(src,(W,Hh));cv2.putText(src,'%.2f s'%(times[k]-times[0]),(8,30),0,.9,(255,255,255),2);rows.append(np.hstack([src,frames[j]]))
    cv2.imwrite(a.out.replace('.mp4','.jpg'),np.vstack([np.hstack(rows[i:i+2]) for i in range(0,8,2)]))
print(json.dumps(dict(seconds=round(took,1),shots=scales,keypointReadings=seenKeys)))
