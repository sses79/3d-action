"""Everyone on a basketball court in a broadcast shot, followed over the floor, as boxes for reconstruct_motion.
  .authoring/vision-venv/bin/python authoring/render/court-people.py VIDEO CAMERA.json OUT.json [--least=0.8] [--model=.authoring/vision-models/yolo26s-pose.pt]
CAMERA.json is court-camera.py's result for the window. In every frame the pose detector (at 1920 px: at 1280 it misses
players in a wide shot) finds people; each one's feet are put on the floor through the camera, and those off the court are
dropped (the crowd, the benches), as are boxes under half a standing person's height there (people seated at the side). People are joined from frame to frame by who is nearest on the floor to where each track
was heading, the same shirt colour preferred (three groups by k-means: two teams and the referees).
OUT.json has the form sam3-track.py writes, {video, start, end, times, size, tracks: {name: [{box, area} or null per
frame]}}, so reconstruct_motion takes it as boxes: {file, name}; it holds the tracks seen in at least --least of the
frames, named p1, p2, ... longest first, and `people` describes each (frames seen, shirt group, where on the court it
starts and ends). A sheet with one row a person, seven moments each, is written beside it as .jpg: read it before
building, a row must stay on one person (a red box is the nearest frame that has one).
Limits: a fast blurred player is lost (the ball handler of the test clip was; sam3-track.py followed him); two players of
one team crossing close can swap; referees and anyone standing inside the lines are kept too."""
import cv2,numpy as np,json,sys
from ultralytics import YOLO
video,trk,out=sys.argv[1],json.load(open(sys.argv[2])),sys.argv[3];opt=lambda k,d:next((a.split('=',1)[1] for a in sys.argv if a.startswith('--'+k+'=')),d);LEAST=float(opt('least',.8))
cap=cv2.VideoCapture(video);fps=trk["fps"];cap.set(1,trk["first"]);C=np.array(trk["C"]);model=YOLO(opt('model','.authoring/vision-models/yolo26s-pose.pt'));frames=[];dets=[]
def with_place(q,C):
    R=cv2.Rodrigues(np.array(q[1:4]))[0];return np.concatenate([q[:4],-R@C])
def floor(p,uv,W,H):  # where a pixel's line of sight meets the floor
    f=np.exp(p[0]);R=cv2.Rodrigues(np.array(p[1:4]))[0];d=R.T@np.array([(uv[0]-W/2)/f,(uv[1]-H/2)/f,1.]);s=-C[2]/d[2];return (C+s*d)[:2]
for k,fr in enumerate(trk["frames"]):
    ok,f=cap.read()
    if not ok:break
    H,W=f.shape[:2];p=with_place(np.array(fr["q"]),C);r=model.predict(f,device='cpu',imgsz=1920,verbose=False,conf=.2)[0];b=r.boxes.xyxy.cpu().numpy();kp=r.keypoints.data.cpu().numpy() if len(b) else np.zeros((0,17,3));here=[]
    for i in range(len(b)):
        an=[kp[i,a,:2] for a in (15,16) if kp[i,a,2]>.5];foot=np.mean(an,0)+[0,.03*(b[i,3]-b[i,1])] if len(an)==2 else np.array([(b[i,0]+b[i,2])/2,b[i,3]])
        xy=floor(p,foot,W,H)
        if abs(xy[0])>15.3 or abs(xy[1])>8.4:continue
        if b[i,3]-b[i,1]<.5*1.9*np.exp(p[0])/np.linalg.norm(np.array([xy[0],xy[1],0.])-C):continue  # half a standing person's height at that distance: someone seated at the side
        # kit colour: the middle of the trunk
        x0,y0,x1,y1=b[i]
        if all(kp[i,a_,2]>.4 for a_ in (5,6,11,12)):  # the shirt: between the shoulders and the hips, kept away from its edges
            sh,hp=(kp[i,5,:2]+kp[i,6,:2])/2,(kp[i,11,:2]+kp[i,12,:2])/2;wd=max(4,np.linalg.norm(kp[i,5,:2]-kp[i,6,:2])*.25);pts=[sh+(hp-sh)*u+np.array([dx,0]) for u in (.2,.35,.5,.65,.8) for dx in (-wd,0,wd)];tr=np.array([f[int(min(max(q[1],0),H-1)),int(min(max(q[0],0),W-1))] for q in pts])
        else:tr=f[int(y0+.22*(y1-y0)):int(y0+.48*(y1-y0)),int(x0+.3*(x1-x0)):int(x0+.7*(x1-x0))].reshape(-1,3)
        here.append(dict(box=[float(v) for v in b[i]],floor=[float(xy[0]),float(xy[1])],kit=[float(v) for v in np.median(tr,0)] if len(tr) else [0,0,0],height=float(b[i,3]-b[i,1]),kp=kp[i].tolist()))
    dets.append(here);frames.append(k)
# kit groups: three clusters over every detection's trunk colour (two teams and the referees), by k-means
cols=np.float32([d["kit"] for h in dets for d in h]);hsv=cv2.cvtColor(cols[None].astype(np.uint8),cv2.COLOR_BGR2HSV)[0].astype(np.float32);feat=np.float32(np.stack([hsv[:,1],hsv[:,2]],1));_,lab,cen2=cv2.kmeans(feat,3,None,(cv2.TERM_CRITERIA_EPS+cv2.TERM_CRITERIA_MAX_ITER,50,.5),5,cv2.KMEANS_PP_CENTERS);cen=np.array([np.median(cols[lab[:,0]==g],0) for g in range(3)]);n=0
for h in dets:
    for d in h:d["group"]=int(lab[n,0]);n+=1
# tracks on the floor: each track is carried on at its own speed to where it should be now; a detection joins the nearest such
# place within reach (further for a track not seen for some frames), the same kit preferred
tracks=[];live=[]
for k,h in enumerate(dets):
    for t in live:t["pred"]=[t["floor"][0]+t["vel"][0]*(k-t["last"]),t["floor"][1]+t["vel"][1]*(k-t["last"])]
    cand=[(np.hypot(d["floor"][0]-t["pred"][0],d["floor"][1]-t["pred"][1])+(0 if d["group"]==t["group"] else .6),i,j) for i,d in enumerate(h) for j,t in enumerate(live) if k-t["last"]<=20]
    used_d=set();used_t=set()
    for dist_,i,j in sorted(cand):
        t=live[j]
        if i in used_d or j in used_t or dist_>.7+.1*(k-t["last"]):continue
        used_d.add(i);used_t.add(j);gap=k-t["last"];v=[(h[i]["floor"][0]-t["floor"][0])/gap,(h[i]["floor"][1]-t["floor"][1])/gap];t["vel"]=[.6*t["vel"][0]+.4*v[0],.6*t["vel"][1]+.4*v[1]];t["frames"][k]=h[i];t["floor"]=h[i]["floor"];t["last"]=k;g=t["votes"];g[h[i]["group"]]=g.get(h[i]["group"],0)+1;t["group"]=max(g,key=g.get)
    for i,d in enumerate(h):
        if i not in used_d:t=dict(id=len(tracks),frames={k:d},floor=d["floor"],last=k,group=d["group"],votes={d["group"]:1},vel=[0,0]);tracks.append(t);live.append(t)
N=len(dets);keep=sorted([t for t in tracks if len(t["frames"])>=LEAST*N],key=lambda t:-len(t["frames"]));names={t["id"]:"p%d"%(i+1) for i,t in enumerate(keep)}
box=lambda d:dict(box=d["box"],area=(d["box"][2]-d["box"][0])*(d["box"][3]-d["box"][1])) if d else None;r1=lambda v:[round(float(x),1) for x in v]
people=[dict(name=names[t["id"]],frames=len(t["frames"]),fromSeconds=round(min(t["frames"])/fps,2),toSeconds=round(max(t["frames"])/fps,2),shirtGroup="abc"[t["group"]],courtStart=r1(t["frames"][min(t["frames"])]["floor"]),courtEnd=r1(t["frames"][max(t["frames"])]["floor"])) for t in keep]
json.dump(dict(video=video,start=trk["first"]/fps,end=(trk["first"]+N-1)/fps,times=[(trk["first"]+k)/fps for k in range(N)],size=[W,H],tracks={names[t["id"]]:[box(t["frames"].get(k)) for k in range(N)] for t in keep},people=people,shirtGroupColoursBGR=[[int(v) for v in c] for c in cen]),open(out,"w"))
rows=[];at=np.linspace(1,N-2,7).round().astype(int);shots={}
cap.set(1,trk["first"])
for k in range(N):
    ok,f=cap.read()
    if k in at:shots[k]=f
for t in keep:
    tiles=[]
    for k in at:
        kk=min(t["frames"],key=lambda x:abs(x-k));b=t["frames"][kk]["box"];cx,cy=int((b[0]+b[2])/2),int((b[1]+b[3])/2);x0=min(max(cx-100,0),W-200);y0=min(max(cy-130,0),H-260);tile=shots[k][y0:y0+260,x0:x0+200].copy()
        cv2.rectangle(tile,(int(b[0]-x0),int(b[1]-y0)),(int(b[2]-x0),int(b[3]-y0)),(0,255,255) if kk==k else (0,0,255),1);cv2.putText(tile,"%s %.2f"%(names[t["id"]],k/fps),(4,18),cv2.FONT_HERSHEY_SIMPLEX,.5,(255,255,255),1);tiles.append(tile)
    rows.append(np.hstack(tiles))
if rows:cv2.imwrite(out.replace(".json",".jpg"),np.vstack(rows),[cv2.IMWRITE_JPEG_QUALITY,85])
print(json.dumps(dict(frames=N,onCourtPerFrameMedian=int(np.median([len(h) for h in dets])),tracks=len(tracks),people=people)))
