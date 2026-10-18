"""Does a shot need a control video? Measures each shot of a video and says on or off, with the reason.
  .authoring/vision-venv/bin/python authoring/render/control-need.py VIDEO SHOTS.json OUT.json [--speech TRANSCRIPT.json]
SHOTS.json from shots.py. TRANSCRIPT.json (optional): [[start, end], ...] seconds with speech (whisper's segments).
Per shot, from frames 6 a second (320 px wide, the first and last 0.1 s left out):
  camera: how fast the picture behind the people slides or zooms, as the median optical flow outside the people's boxes, in
    picture widths per second;
  move: how fast the people move against that background, the median flow inside their boxes minus the background's, in their
    own heights per second, for the person moving most;
  people: people seen (detector, confidence 0.5, at least 1% of the picture) on frames 2 a second, the most at once; size: the
    tallest box as a share of the picture height (over 0.6 is a close shot);
  speech: the share of the shot with speech.
The rule (see docs/SHOT_TO_CLAY_PLAN.md, "When a shot needs a control video"): on when the camera moves (over 0.04 widths a
second), or someone moves (over 0.25 heights a second), or three or more people stand in a wide shot (who stands where matters);
otherwise off: people in place, talking, the camera holding on them; keyframe images and the prompt carry it.
OUT.json: per shot the numbers, on or off, and the reasons; OUT.jpg: the middle frame of every shot, labelled."""
import sys,json,argparse,numpy as np,cv2
p=argparse.ArgumentParser();p.add_argument('video');p.add_argument('shots');p.add_argument('out');p.add_argument('--speech');a=p.parse_args()
from ultralytics import YOLO
det=YOLO('.authoring/vision-models/yolo26s-pose.pt');shots=json.load(open(a.shots))['shots'];speech=json.load(open(a.speech)) if a.speech else []
c=cv2.VideoCapture(a.video);fps=c.get(5);W0,H0=c.get(3),c.get(4);W=320;H=round(W*H0/W0)
def frame(t):c.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,f=c.read();return f if ok else None
CAM,MOVE=.04,.25;rows=[];thumbs=[]
for s in shots:
    t0,t1=s['start']+.1,s['end']-.1;ts=np.arange(t0,max(t0+.01,t1),1/6);gs=[];people=[];boxes={}
    for i,t in enumerate(ts):
        f=frame(t)
        if f is None:continue
        g=cv2.cvtColor(cv2.resize(f,(W,H)),cv2.COLOR_BGR2GRAY);gs.append((t,g))
        if i%3==0:
            r=det.predict(f,imgsz=640,conf=.5,verbose=False,device='cpu')[0];b=[x for x in r.boxes.xyxy.cpu().numpy() if (x[2]-x[0])*(x[3]-x[1])>.01*W0*H0]
            people.append(len(b));boxes[t]=[x*W/W0 for x in b]
    cams=[];moves=[]
    for (ta,ga),(tb,gb) in zip(gs,gs[1:]):
        fl=cv2.calcOpticalFlowFarneback(ga,gb,None,.5,3,15,3,5,1.2,0);bt=min(boxes,key=lambda x:abs(x-ta)) if boxes else None;m=np.ones((H,W),bool)
        bx=boxes.get(bt,[]) if bt is not None else []
        for x0,y0,x1,y1 in bx:m[int(y0):int(y1)+1,int(x0):int(x1)+1]=False
        dt=tb-ta;med=np.zeros(2);pts=cv2.goodFeaturesToTrack(ga,300,.01,6,mask=m.astype(np.uint8))
        if pts is not None and len(pts)>=8:  # the camera: a shift-and-zoom fitted to corners tracked outside the people
            q,st,_=cv2.calcOpticalFlowPyrLK(ga,gb,pts,None);ok=st.ravel()==1
            A,_=cv2.estimateAffinePartial2D(pts[ok],q[ok],method=cv2.RANSAC,ransacReprojThreshold=1.5) if ok.sum()>=8 else (None,None)
            if A is not None:med=A[:,2]+(A[:,:2]-np.eye(2))@np.array([W/2,H/2]);cams.append((float(np.hypot(*med))/W+abs(float(np.sqrt(abs(np.linalg.det(A[:,:2]))))-1))/dt)
        mv=[float(np.median(np.linalg.norm(fl[int(y0):int(y1)+1,int(x0):int(x1)+1].reshape(-1,2)-med,axis=1)))/max(y1-y0,1)/dt for x0,y0,x1,y1 in bx if y1-y0>8]
        if mv:moves.append(max(mv))
    cam=float(np.median(cams)) if cams else 0.;move=float(np.percentile(moves,75)) if moves else 0.;n=max(people) if people else 0
    size=max([float(y1-y0)/H for b in boxes.values() for x0,y0,x1,y1 in b],default=0.)
    said=sum(max(0,min(e,s['end'])-max(b,s['start'])) for b,e in speech)/max(s['end']-s['start'],1e-6)
    why=[]
    if cam>CAM:why.append('camera moves')
    if move>MOVE:why.append('someone moves')
    if n>=3 and size<.6:why.append(f'{n} people in a wide shot')
    rows.append(dict(index=s['index'],start=s['start'],end=s['end'],seconds=round(s['end']-s['start'],2),camera=round(cam,3),move=round(move,3),people=n,size=round(size,2),speech=round(min(said,1),2),control='on' if why else 'off',why=why or ['people in place'+(', talking' if said>.3 else '')+', camera holds']))
    f=frame((s['start']+s['end'])/2);th=cv2.resize(f,(320,180));col=(80,200,120) if why else (90,90,230)
    cv2.rectangle(th,(0,0),(319,179),col,4);cv2.putText(th,f"{s['index']} {s['start']:.1f}s {'ON' if why else 'off'}",(8,22),0,.55,(255,255,255),2);cv2.putText(th,f"cam {cam:.2f} move {move:.2f} n{n}",(8,170),0,.45,(255,255,255),1);thumbs.append(th)
    print(rows[-1]['index'],rows[-1]['control'],rows[-1]['why'],round(cam,3),round(move,3),n,round(size,2),round(said,2),flush=True)
json.dump(dict(video=a.video,thresholds=dict(cameraWidthsPerSecond=CAM,moveHeightsPerSecond=MOVE),shots=rows),open(a.out,'w'),indent=1)
while len(thumbs)%6:thumbs.append(np.zeros_like(thumbs[0]))
cv2.imwrite(a.out.replace('.json','.jpg'),np.vstack([np.hstack(thumbs[i:i+6]) for i in range(0,len(thumbs),6)]))
