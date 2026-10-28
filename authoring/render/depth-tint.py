"""A depth video straight from the source video, with each named person tinted in a colour of their own, for a video model that
takes it as a motion reference (Seedance has no depth input of its own: this goes in as an ordinary reference video).
  .authoring/vision-venv/bin/python authoring/render/depth-tint.py VIDEO START END OUT.mp4 --shots SHOTS.json --tracks A.json,B.json[:old=new] (a track file with "exact": true is boxes by hand, used as given and in front)
      --colors cersei=pink,lancel=blue,... [--encoder vits] [--size 518] [--strength 0.6] [--width 960] [--model da3|vda] [--depth DEPTH.npz]
Depth: Depth Anything 3 by default (authoring/render/da3-depth.py, run here, saved beside OUT as .depth.npz; about 0.3 s a
frame on this Mac against minutes per 32 frames for Video Depth Anything, --model vda), steadied over three frames; --depth
takes depth made beforehand. A window is at most 15 seconds. Frames are scaled to --width (960) first: the model works at 518 px anyway, and full HD frames made it very slow on the
Mac. Depth: Video Depth Anything (as authoring/render/video-depth.py), run shot by shot (SHOTS.json from authoring/render/shots.py) so
a cut does not smear one shot's depth into the next, and scaled shot by shot: white near, black far.
People: TRACKS are boxes per frame by name ({times, tracks: {name: [{box} or null]}}, as sam3-track.py or the shots follow step
write). In each box the person is first the nearer part of the depth (Otsu split), then cut along depth edges (Sobel over --edge;
a table in front of them meets them at an edge, their own legs coming nearer do not), the piece holding their upper body kept; a box
ending near the bottom of the frame is carried to it; where two people's boxes overlap, a pixel goes to the one whose depth it is closer to. Each person in
--colors is tinted: the grey becomes the brightness, the colour its hue (saturation --strength), so the depth still reads.
People not in --colors stay grey. OUT.json beside the video lists the colours and who they are; OUT.jpg is a sheet to check by eye.
Boxes are widened by a quarter each side and a third upward first (a detector's box cuts the top of the head and loose hair).
A followed person (boxes with ARROW points, depth-fix.py follow) is grown from their own points instead, together with everyone else
the detector boxes in that frame (markers on the nearer part of their box) and with dropped people (tracks' "ghosts") as background: a watershed over the depth
with all followed people in the frame as markers and the far background as the boundary (an embrace: heads and backs, not just arms).
Limits: a person's outline is the box's near part, so something in front of them inside their box is tinted too, and an arm
reaching out of the box is not; a person with no box in a frame is not tinted in that frame."""
import sys,os,types,glob,json,subprocess,time,argparse
import numpy as np,cv2,torch
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'));code=os.path.join(root,'.authoring/video-depth-anything')
sys.path.insert(0,code);sys.path+=glob.glob(os.path.join(root,'.authoring/comfyui/.venv/lib/python*/site-packages'))
class EasyDict(dict):
    __getattr__=dict.__getitem__;__setattr__=dict.__setitem__
sys.modules.setdefault('easydict',types.SimpleNamespace(EasyDict=EasyDict))
from video_depth_anything.video_depth import VideoDepthAnything
NAMED={'blue':'#4a86d8','orange':'#ee8a3a','green':'#4fae5a','pink':'#f07fb0','purple':'#8d6fd1','yellow':'#e8c53a','red':'#d9534a','crimson':'#a3232b','navy':'#2b3a66'}
p=argparse.ArgumentParser();p.add_argument('video');p.add_argument('start',type=float);p.add_argument('end',type=float);p.add_argument('out')
p.add_argument('--shots');p.add_argument('--tracks',default='');p.add_argument('--colors',default='');p.add_argument('--encoder',default='vits');p.add_argument('--size',type=int,default=518);p.add_argument('--strength',type=float,default=.6);p.add_argument('--width',type=int,default=960);p.add_argument('--depth');p.add_argument('--model',choices=['da3','vda'],default='da3');p.add_argument('--edge',type=float,default=25)
p.add_argument('--device',default='mps' if torch.backends.mps.is_available() else 'cpu');a=p.parse_args()
if a.end-a.start>15+1e-6:raise SystemExit('A window is at most 15 seconds (a video model takes about that much reference)')
if not a.depth and a.model=='da3':  # the default: Depth Anything 3 through ComfyUI, one frame at a time (quick on this Mac)
    a.depth=os.path.splitext(a.out)[0]+'.depth.npz';subprocess.run([sys.executable,os.path.join(root,'authoring/render/da3-run.py'),a.video,str(a.start),str(a.end),a.depth,'--save-width','0'],check=True,stdout=subprocess.DEVNULL)  # mini4 when it answers (da3-run.py)
cap=cv2.VideoCapture(a.video);fps=cap.get(cv2.CAP_PROP_FPS);k0=round(a.start*fps);cap.set(cv2.CAP_PROP_POS_FRAMES,k0);frames=[]
for _ in range(round((a.end-a.start)*fps)):
    ok,im=cap.read()
    if not ok:break
    frames.append(cv2.cvtColor(cv2.resize(im,(a.width,round(im.shape[0]*a.width/im.shape[1])),interpolation=cv2.INTER_AREA) if a.width and im.shape[1]>a.width else im,cv2.COLOR_BGR2RGB))
frames=np.stack(frames);N=len(frames);times=[(k0+k)/fps for k in range(N)]
cuts=[0]+[k for k in range(1,N) if any(abs(times[k]-s['start'])<.5/fps for s in json.load(open(a.shots))['shots'])]+[N] if a.shots else [0,N]
grey=np.zeros(frames.shape[:3],np.uint8);began=time.perf_counter()
if a.depth:  # depth made beforehand (da3-depth.py, Depth Anything 3 one frame at a time; larger is further)
    z=np.load(a.depth);D=z['depth'];T=z['times'];inv=1/np.maximum(D,1e-3)
    for s_,e_ in zip(cuts,cuts[1:]):
        d=np.stack([inv[int(np.argmin(np.abs(T-times[k])))] for k in range(s_,e_)])
        if d.shape[1:]!=frames.shape[1:3]:d=np.stack([cv2.resize(x,(frames.shape[2],frames.shape[1])) for x in d])
        d=np.stack([d[max(s_,k-1)-s_:k+2-s_].mean(0) for k in range(s_,e_)])  # each frame is estimated alone: a three-frame average steadies it
        lo,hi=np.percentile(d,.5),np.percentile(d,99.5);grey[s_:e_]=(np.clip((d-lo)/max(hi-lo,1e-9),0,1)*255).astype(np.uint8)
else:
    cfg={'vits':dict(encoder='vits',features=64,out_channels=[48,96,192,384]),'vitb':dict(encoder='vitb',features=128,out_channels=[96,192,384,768]),'vitl':dict(encoder='vitl',features=256,out_channels=[256,512,1024,1024])}[a.encoder]
    model=VideoDepthAnything(**cfg,metric=False);model.load_state_dict(torch.load(os.path.join(code,'checkpoints/video_depth_anything_%s.pth'%a.encoder),map_location='cpu'),strict=True);model=model.to(a.device).eval();began=time.perf_counter()
    for s,e in zip(cuts,cuts[1:]):
        if e-s<2:continue
        t0=time.perf_counter();d,_=model.infer_video_depth(frames[s:e],fps,input_size=a.size,device=a.device,fp32=True);d=np.asarray(d,np.float32);print('shot of',e-s,'frames:',round(time.perf_counter()-t0,1),'s',flush=True)
        if d.shape[1:]!=frames.shape[1:3]:d=np.stack([cv2.resize(x,(frames.shape[2],frames.shape[1])) for x in d])
        lo,hi=np.percentile(d,.5),np.percentile(d,99.5);grey[s:e]=(np.clip((d-lo)/max(hi-lo,1e-9),0,1)*255).astype(np.uint8)
    
took=time.perf_counter()-began
# who is where: boxes per frame by name, from the track files
colors={kv.split('=')[0]:kv.split('=')[1] for kv in a.colors.split(',') if '=' in kv};exact=set();boxes=[{} for _ in range(N)];pts=[{} for _ in range(N)];ghosts=[[] for _ in range(N)]
for f in [x for x in a.tracks.split(',') if x]:
    f,*ren=f.split(':');ren=dict(r.split('=') for r in ren)  # file.json:old=new renames a track (a person named wrongly in the follow step)
    tr=json.load(open(f));T=np.array(tr['times'])
    for name,v in tr.get('ghosts',{}).items():  # dropped people (depth-fix.py): background markers when people are grown
        for k in range(N):
            j=int(np.argmin(np.abs(T-times[k])))
            if abs(T[j]-times[k])<.6/fps and v[j]:ghosts[k].append(list(v[j]['box']))
    if tr.get('exact'):exact.update(ren.get(n,n) for n in tr['tracks'])  # boxes drawn by hand (a body lying down): used as they are, and in front where they overlap
    for name,v in tr['tracks'].items():
        name=ren.get(name,name)
        if name not in colors:continue
        for k in range(N):
            j=int(np.argmin(np.abs(T-times[k])))
            if abs(T[j]-times[k])<.6/fps and v[j]:
                boxes[k][name]=v[j]['box']
                if v[j].get('points'):pts[k][name]=v[j]['points']  # ARROW points on a followed person (depth-fix.py follow)
for n in colors:  # a track that drops out for up to half a second (a turn, a blur) is carried across by blending its boxes
    have=[k for k in range(N) if n in boxes[k]]
    for k0,k1 in zip(have,have[1:]):
        if 1<k1-k0<=round(fps/2):
            for k in range(k0+1,k1):u=(k-k0)/(k1-k0);boxes[k][n]=[p+(q-p)*u for p,q in zip(boxes[k0][n],boxes[k1][n])]
EDGE=a.edge;H,W=grey.shape[1:];sx=W/cap.get(cv2.CAP_PROP_FRAME_WIDTH)
for b in boxes:
    for n in b:b[n]=[v*sx for v in b[n]]
for b in pts:
    for n in b:b[n]=[[x*sx,y*sx] for x,y in b[n]]
ghosts=[[[q*sx for q in b] for b in gl] for gl in ghosts]
def widen(n,b):
    x0,y0,x1,y1=b;bw,bh=x1-x0,y1-y0;x0,y0,x1,y1=[int(round(v)) for v in (x0-.25*bw,y0-.35*bh,x1+.25*bw,y1)];x0,y0=max(0,x0),max(0,y0);x1,y1=min(W,x1),min(H,y1)
    return (0 if x0<.04*W else x0),y0,(H if H-y1<.08*H else y1),(W if W-x1<.04*W else x1)  # near an edge of the frame: carried to it
def core(g,b,excl=None):
    """Points on the nearer part of a box (Otsu on its depth, eroded), up to 16 on a grid: markers for someone without ARROW points.
    excl: pixels around followed people's points, left out (026: the nearer part of Roose's box was Ramsay's back)."""
    x0,y0,x1,y1=[int(round(v)) for v in b];x0,y0=max(0,x0),max(0,y0);x1,y1=min(W,x1),min(H,y1)
    if x1-x0<8 or y1-y0<8:return []
    sub=g[y0:y1,x0:x1];ok=~excl[y0:y1,x0:x1] if excl is not None else np.ones(sub.shape,bool)
    if ok.sum()<64:return []
    t,_=cv2.threshold(sub[ok].reshape(-1,1),0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU);m=cv2.erode(((sub>=t)&ok).astype(np.uint8),np.ones((9,9),np.uint8))>0
    q=[(x0+int(fx*(x1-x0)),y0+int(fy*(y1-y0))) for fy in np.linspace(.12,.88,6) for fx in np.linspace(.15,.85,5) if m[int(fy*(y1-y0)),int(fx*(x1-x0))]]
    return [q[i] for i in np.linspace(0,len(q)-1,min(16,len(q))).round().astype(int)] if q else []
def grow(k,g,who,owner,near,seen):
    """Followed people in frame k, from their ARROW points: markers on the points (those far nearer than the background, and not a stray among
    another followed person's points); as background what lies
    well behind every person whose box, margin or the area below it holds the pixel (under 0.9 of their furthest points' depth, the 5th percentile: a face is
    much nearer than its own shoulders); a watershed over the depth and the picture's brightness (evened out, CLAHE); each keeps what grew from their points from the top of their
    (widened) box down. In an embrace the nearer-part split kept only arms and shoulders: the points also sit on heads and backs."""
    wb={n:widen(n,boxes[k][n]) for _,n in who};mx,my=int(.04*W),int(.04*H);X0=max(0,min(b[0] for b in wb.values())-mx);Y0=max(0,min(b[1] for b in wb.values())-my);Y1=H;X1=min(W,max(b[3] for b in wb.values())+mx)  # a margin round the boxes (the background outside them is a marker too), down to the bottom of the frame (bodies go on below the boxes)
    roi=g[Y0:Y1,X0:X1];inside=np.zeros(roi.shape,bool)
    for x0,y0,y1,x1 in wb.values():inside[y0-Y0:y1-Y0,x0-X0:x1-X0]=True
    taken=owner[Y0:Y1,X0:X1]>=0;mk=np.zeros(roi.shape,np.int32);r=max(3,int(.01*W));lo={};mine=np.zeros(roi.shape,bool)
    excl=np.zeros((H,W),np.uint8)  # around each followed person's points: their hull, widened by 3% of the picture
    for _,n in who:
        if len(pts[k].get(n) or [])>=3:cv2.fillConvexPoly(excl,cv2.convexHull(np.array(pts[k][n],np.int32)),1)
    excl=cv2.dilate(excl,np.ones((int(.03*W)|1,int(.03*W)|1),np.uint8))>0
    PP={}
    for i,n in who:
        x0,y0,y1,x1=wb[n];P=[(int(x)-X0,int(y)-Y0) for x,y in (pts[k].get(n) or core(g,boxes[k][n],excl)) if x0<=x<x1 and y0<=y<y1];d=np.array([roi[y,x] for x,y in P],float)  # a person the detector boxes (no points) grows from the nearer part of their box
        if len(P)>=3:PP[n]=[p for p,v in zip(P,d) if v>=.6*np.median(d)]  # a point drifted onto the wall behind is dropped
    near_=lambda q,Q:min((np.hypot(q[0]-u,q[1]-v) for u,v in Q if (u,v)!=q),default=1e9)
    PP={n:[q for q in P if not (near_(q,P)>.05*W and any(near_(q,PP[m])<near_(q,P) for m in PP if m!=n))] for n,P in PP.items()}  # a point stuck where someone else stepped into view (026: a seed on Ramsay's back left on Roose's head as he came out from behind): dropped when it stands apart from its own points and nearer someone else's
    for i,n in who:
        x0,y0,y1,x1=wb[n];P=PP.get(n,[])
        if len(P)<3:continue
        lo[n]=np.percentile([roi[y,x] for x,y in P],5);a0,a1=max(0,x0-mx-X0),x1+mx-X0;yb=H if H-y1<.05*H else min(H,y1+my);mine[y0-Y0:yb-Y0,a0:a1]|=roi[y0-Y0:yb-Y0,a0:a1]>=.9*lo[n]  # in their box, beside it (the margin) and below it, what is not behind all of their points may be them (a box on the head only: the shoulders); below it to the frame's bottom only for a box ending in its lowest 15% (a body going on out of view), else 4% below the box (Olenna 033: two small seated women in a wide shot took the table and floor down to the bottom)
        for x,y in P:cv2.circle(mk,(x,y),r,i+2,-1)
    if not lo:return set()
    md={n:float(np.median([roi[y,x] for x,y in P])) for n,P in PP.items() if len(P)>=3}
    for b in ghosts[k]:  # people dropped in the fix: the core of their box is background (a monk in front of the action stays grey)
        for x,y in core(g,b,excl):
            if not (X0<=x<X1 and Y0<=y<Y1) or mk[int(y)-Y0,int(x)-X0]:continue
            if any(m in md and boxes[k][m][0]<=x<boxes[k][m][2] and boxes[k][m][1]<=y<boxes[k][m][3] and abs(float(g[int(y),int(x)])-md[m])<30 for _,m in who):continue  # inside someone kept, at their depth: a second box on them, not someone else
            cv2.circle(mk,(int(x)-X0,int(y)-Y0),r,1,-1)
    bg=~mine&(mk==0);mk[bg]=1;mk[taken]=1
    lum=cv2.createCLAHE(2.,(8,8)).apply(cv2.cvtColor(frames[k],cv2.COLOR_RGB2GRAY))[Y0:Y1,X0:X1];dz=cv2.GaussianBlur(roi,(5,5),0);lab=cv2.watershed(np.dstack([dz,dz,cv2.GaussianBlur(lum,(5,5),0)]),mk.copy());done=set()  # the depth's edges and the picture's own (a dark coat against a lit wall where the depth runs smoothly from shoulder to wall)
    for i,n in who:
        x0,y0,y1,x1=wb[n];m=np.zeros(roi.shape,np.uint8);m[y0-Y0:]=(lab[y0-Y0:]==i+2)  # from their box's top down (a close shot: the detector boxes the head and shoulders, the body goes on down), sideways as far as it grew
        m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8));m[taken]=0
        if not m.any():continue
        owner[Y0:Y1,X0:X1][m>0]=i;near[i]=float(np.median(roi[m>0]));seen[n]+=1;done.add(n)
    return done
out=np.zeros((N,H,W,3),np.uint8);owner=np.full((H,W),-1,np.int8);seen={n:0 for n in colors}
names=list(colors);hues={n:cv2.cvtColor(np.uint8([[[int(NAMED.get(c,c)[i:i+2],16) for i in (5,3,1)]]]),cv2.COLOR_BGR2HSV)[0,0,0] for n,c in colors.items()}
for k in range(N):
    g=grey[k];owner[:]=-1;near={};grown=set()
    for i,n in sorted(enumerate(names),key=lambda x:(x[1] not in exact,x[1] not in pts[k])):  # boxes by hand first, then followed people: they claim their pixels before the detector's people are worked out
        if n not in boxes[k] or n in grown:continue
        if n not in exact and n in pts[k] and not grown:  # followed people (ARROW points): all of them at once, each grown from their own points over the depth (a watershed), far background as the boundary marker
            grown=grow(k,g,[(i_,n_) for i_,n_ in enumerate(names) if n_ in boxes[k] and n_ not in exact],owner,near,seen)  # with someone followed in the frame, everyone the detector boxes grows with them (else the followed person's growth takes them)
            if n in grown:continue
        x0,y0,x1,y1=boxes[k][n];bw,bh=x1-x0,y1-y0;x0,y0,x1,y1=[int(round(v)) for v in ((x0,y0,x1,y1) if n in exact else (x0-.25*bw,y0-.35*bh,x1+.25*bw,y1))];x0,y0=max(0,x0),max(0,y0);x1,y1=min(W,x1),min(H,y1)  # the detector's boxes cut the top of the head and loose hair: widened, the depth edges keep the tint to the person
        if H-y1<.08*H and n not in exact:y1=H  # a person cut by the bottom of the frame: carried to it
        if x1-x0<8 or y1-y0<8:continue
        taken=np.isin(owner[y0:y1,x0:x1],[names.index(e) for e in exact|set(grown)]) if n not in exact else np.zeros((y1-y0,x1-x0),bool);roi=np.where(taken,0,g[y0:y1,x0:x1]).astype(np.uint8);free=roi[~taken];t,_=cv2.threshold(free.reshape(-1,1) if free.size else roi,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU);m=((roi>=t)&~taken).astype(np.uint8)  # the split from this person's own pixels
        if n in exact:  # by hand: the whole box but its far background (someone much nearer inside it would take an Otsu split)
            m=(roi>=.6*np.median(roi)).astype(np.uint8);m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((5,5),np.uint8));owner[y0:y1,x0:x1][m>0]=i;near[i]=float(np.median(roi[m>0])) if m.any() else 0.;seen[n]+=1;continue
        m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((5,5),np.uint8));cnt,lab,st,_=cv2.connectedComponentsWithStats(m)
        if cnt<2:continue
        # cut the nearer part along depth edges (a table in front of someone meets them at an edge; their own body, turning
        # nearer the camera, does not), and keep the piece that holds their upper body
        gx=cv2.Sobel(cv2.GaussianBlur(roi,(5,5),0).astype(np.float32),cv2.CV_32F,1,0);gy=cv2.Sobel(cv2.GaussianBlur(roi,(5,5),0).astype(np.float32),cv2.CV_32F,0,1)
        m=((lab>0)&(np.hypot(gx,gy)<EDGE)).astype(np.uint8);cnt,lab,st,_=cv2.connectedComponentsWithStats(m,connectivity=4);top=lab[:max(1,int(.6*(y1-y0)))];ids,counts=np.unique(top[top>0],return_counts=True)
        if not len(ids):continue
        m=(lab==ids[int(np.argmax(counts))]).astype(np.uint8);m=cv2.dilate(cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8)),np.ones((3,3),np.uint8));med=float(np.median(roi[m>0]));near[i]=med
        sub=owner[y0:y1,x0:x1];clash=(sub>=0)&(m>0)
        if clash.any():  # two people's boxes overlap here: the pixel goes to whoever's depth it is nearer to
            other=sub[clash];mine=np.abs(roi[clash].astype(float)-med);theirs=np.abs(roi[clash].astype(float)-np.array([near[o] for o in other]))
            sub[clash]=np.where(mine<theirs,i,other)
        sub[(sub<0)&(m>0)]=i;seen[n]+=1
    hsv=np.zeros((H,W,3),np.uint8);hsv[...,2]=g
    for i,n in enumerate(names):sel=owner==i;hsv[...,0][sel]=hues[n];hsv[...,1][sel]=int(255*a.strength)
    out[k]=cv2.cvtColor(hsv,cv2.COLOR_HSV2RGB)
ff=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','%dx%d'%(W,H),'-r',str(fps),'-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','16','-movflags','+faststart',a.out],stdin=subprocess.PIPE);ff.stdin.write(out.tobytes());ff.stdin.close();ff.wait()
legend=dict(video=a.video,start=a.start,end=a.end,frames=N,fps=round(fps,3),shots=[[round(times[s]-a.start,2),round(times[e-1]-a.start,2)] for s,e in zip(cuts,cuts[1:])],colors=[dict(name=n,color=c,framesTinted=seen[n]) for n,c in colors.items()],depth='white near, black far, scaled shot by shot',seconds=round(took,1))
json.dump(legend,open(os.path.splitext(a.out)[0]+'.json','w'),indent=1)
tiles=[]
for k in np.linspace(0,N-1,8).round().astype(int):
    t=np.hstack([cv2.resize(cv2.cvtColor(frames[k],cv2.COLOR_RGB2BGR),(480,270)),cv2.resize(cv2.cvtColor(out[k],cv2.COLOR_RGB2BGR),(480,270))]);cv2.putText(t,'%.2f s'%(times[k]-a.start),(6,22),0,.6,(255,255,255),2);tiles.append(t)
cv2.imwrite(os.path.splitext(a.out)[0]+'.jpg',np.vstack([np.hstack(tiles[i:i+2]) for i in range(0,8,2)]))
print(json.dumps(legend))
