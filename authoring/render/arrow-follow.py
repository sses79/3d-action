"""Follow one person through one shot with ARROW point tracks (docs/DEPTH_LIBRARY_PLAN.md, "ARROW for people the detector misses"),
for the shots where the pose detector loses them (armour from below, two bodies in an embrace). depth-fix.py runs it for a fix's
"follow" entries; by hand:
  .authoring/vision-venv/bin/python authoring/render/arrow-follow.py VIDEO START END SEED-TIME X0,Y0,X1,Y1 DEPTH.npz OUT.json [--detections DIR]
START END: the shot in source seconds; SEED-TIME: a source time inside it where BOX (fractions of the picture) holds the person.
1. seeds: up to 16 points in the box on the person's own depth (the nearer part of the box, Otsu on the saved depth), spread on a grid;
2. frames: up to 24 spread evenly over the shot, one of them at the seed time, cut here and sent to mini4 (~/Yun/arrow-runner,
   arrow-track.py; copied there when it differs); ARROW gives each point's place and visibility in every frame (~1.2 s a frame);
3. boxes: in each frame, from the points seen (visibility 0.7 or more, at least 3 of them): with --detections (the build's detector
   cache) the detector box holding most of them (over half) - the detector gives the body's extent, the points say whose it is (in an
   embrace the detector finds both bodies but cannot keep them apart); else the seed box moved by the points' median shift and scaled
   by their spread (0.75-1.33: in the dark the points bunch up and the box collapsed). Fewer than 3: no box (out of view or lost).
   A frame without a detector box between two that have one, less than 1.5 s apart, is blended between them.
OUT.json: {times (source seconds), boxes [[x0,y0,x1,y1] fractions | null], points [per frame, per seed [fx,fy] | null], seen (points used per frame), seeds, seconds}.
ARROW runs on mini4 only (its weights are 5.3 GB and CC BY-NC: non-commercial use)."""
import sys,os,json,time,hashlib,subprocess,tempfile
import numpy as np,cv2
root=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HOST=os.environ.get('DEPTH_WORKER_HOST','tim@mini4.local');RUNNER='Yun/arrow-runner';SSH=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=4',HOST];TRACK=os.path.join(root,'authoring/render/arrow-track.py')
SEEN=.7;FRAMES=24
video,start,end,seed_t=sys.argv[1],float(sys.argv[2]),float(sys.argv[3]),float(sys.argv[4]);box=[float(v) for v in sys.argv[5].split(',')];dep,out=sys.argv[6],sys.argv[7];DET=next((sys.argv[i+1] for i,a in enumerate(sys.argv) if a=='--detections'),None)
began=time.perf_counter()
# 1. seeds on the person's own depth
D=np.load(dep);j=int(np.argmin(abs(D['times']-seed_t)));d=D['depth'][j];h,w=d.shape
x0,y0,x1,y1=[int(round(v*s)) for v,s in zip(box,(w,h,w,h))];roi=d[y0:y1,x0:x1]
g=((roi-roi.min())/max(1e-9,np.ptp(roi))*255).astype(np.uint8);t,_=cv2.threshold(g,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU);near=g<=t  # larger depth is further: the person is the lower part
near=cv2.erode(near.astype(np.uint8),np.ones((9,9),np.uint8))>0
seeds=[]
for fy in np.linspace(.12,.88,6):
    for fx in np.linspace(.12,.88,5):
        yy,xx=int(fy*(y1-y0)),int(fx*(x1-x0))
        if near[yy,xx]:seeds.append([(x0+xx)/w,(y0+yy)/h])
if len(seeds)>16:seeds=[seeds[i] for i in np.linspace(0,len(seeds)-1,16).round().astype(int)]
assert len(seeds)>=3,f'only {len(seeds)} seed points on the person in the box: draw the box tighter round them'
# 2. frames spread over the shot, one at the seed time; ARROW on mini4
cap=cv2.VideoCapture(video);fps=cap.get(5);ks=list(range(int(np.ceil(start*fps-1e-6)),int(np.ceil(end*fps-1e-6))));sk=int(round(seed_t*fps))
pick=sorted(set(ks[i] for i in np.linspace(0,len(ks)-1,min(FRAMES,len(ks))).round().astype(int))|{min(max(sk,ks[0]),ks[-1])})
if len(pick)>FRAMES:pick.remove(min((k for k in pick if k!=sk),key=lambda k:min(abs(k-q) for q in pick if q!=k)))
tmp=tempfile.mkdtemp();mp=os.path.join(tmp,'shot.mp4');first=None
for k in pick:
    cap.set(cv2.CAP_PROP_POS_FRAMES,k);ok,f=cap.read();assert ok,f'frame {k} not readable'
    if first is None:first=f.shape;vw=cv2.VideoWriter(os.path.join(tmp,'shot.avi'),cv2.VideoWriter_fourcc(*'MJPG'),10,(f.shape[1],f.shape[0]))
    vw.write(f)
vw.release();subprocess.run(['ffmpeg','-v','error','-y','-i',os.path.join(tmp,'shot.avi'),'-c:v','libx264','-crf','12','-pix_fmt','yuv420p',mp],check=True)
json.dump({'p':seeds},open(os.path.join(tmp,'seeds.json'),'w'))
digest=lambda f:hashlib.sha256(open(f,'rb').read()).hexdigest()
r=subprocess.run(SSH+[f'test -s {RUNNER}/weights/model.safetensors || echo NOWEIGHTS; shasum -a 256 {RUNNER}/arrow-track.py 2>/dev/null'],capture_output=True,text=True,timeout=10)
if r.returncode==255:sys.exit('mini4 does not answer: ARROW runs there only')
if 'NOWEIGHTS' in r.stdout:sys.exit(f'ARROW is not set up on mini4 ({RUNNER}: uv sync, weights/model.safetensors)')
if not r.stdout or r.stdout.split()[0]!=digest(TRACK):subprocess.run(['scp','-q','-o','BatchMode=yes',TRACK,f'{HOST}:{RUNNER}/arrow-track.py'],check=True)
rel=f'jobs/{os.getpid()}-{int(time.time())}';job=f'{RUNNER}/{rel}';subprocess.run(SSH+[f'mkdir -p {job}'],check=True)
subprocess.run(['scp','-q','-o','BatchMode=yes',mp,os.path.join(tmp,'seeds.json'),f'{HOST}:{job}/'],check=True)
r=subprocess.run(SSH+[f'export PATH=/opt/homebrew/bin:$PATH; cd {RUNNER} && uv run python arrow-track.py {rel}/shot.mp4 {rel}/seeds.json {rel}/out.json --stride 1 --max-frames {FRAMES} --seed-frame {pick.index(min(max(sk,ks[0]),ks[-1]))}'],capture_output=True,text=True,timeout=900)
if r.returncode:sys.exit('ARROW failed on mini4:\n'+(r.stderr or r.stdout)[-1500:])
subprocess.run(['scp','-q','-o','BatchMode=yes',f'{HOST}:{job}/out.json',os.path.join(tmp,'out.json')],check=True);subprocess.run(SSH+[f'rm -rf {job}'])
R=json.load(open(os.path.join(tmp,'out.json')));P=np.array(R['tracks']['p'])  # [seed, frame, (fx, fy, visible)]
# 3. the seed box moved and scaled with the points seen
s0=pick.index(min(max(sk,ks[0]),ks[-1]));base=P[:,s0,:2];bc=np.array([(box[0]+box[2])/2,(box[1]+box[3])/2]);bw=np.array([box[2]-box[0],box[3]-box[1]])
boxes=[];seen=[];src=[];W0,H0=cap.get(3),cap.get(4)
for k in range(P.shape[1]):
    v=P[:,k,2]>=SEEN;seen.append(int(v.sum()))
    if v.sum()<3:boxes.append(None);src.append(None);continue
    q=P[v,k,:2];b=base[v]
    if DET:  # the detector's box holding most of this person's points: the detector gives the body's extent, the points say whose it is
        dd=os.path.join(DET,f'{pick[k]}.json');cand=[[x/sw for x,sw in zip(bb,(W0,H0,W0,H0))] for bb in json.load(open(dd))['boxes']] if os.path.exists(dd) else []
        inside=[int(((q[:,0]>=c[0])&(q[:,0]<=c[2])&(q[:,1]>=c[1])&(q[:,1]<=c[3])).sum()) for c in cand]
        if inside and max(inside)>=3 and max(inside)>.5*len(q):c=cand[int(np.argmax(inside))];boxes.append([round(float(x),4) for x in c]);src.append('detector');continue
    sc=float(np.clip(np.std(q-q.mean(0))/max(1e-6,np.std(b-b.mean(0))),.75,1.33));c=np.median(q,0)+sc*(bc-np.median(b,0))  # the box keeps its place relative to the points as they shift and scale
    hw_=bw*sc/2;src.append('points');boxes.append([round(float(max(0,c[0]-hw_[0])),4),round(float(max(0,c[1]-hw_[1])),4),round(float(min(1,c[0]+hw_[0])),4),round(float(min(1,c[1]+hw_[1])),4)])
tt=[k/fps for k in pick];det=[i for i,x in enumerate(src) if x=='detector']
for i,x in enumerate(src):  # a frame between two detector boxes less than 1.5 s apart: blended between them (the points' own box is the weaker guess)
    if x=='detector':continue
    a_=max([d_ for d_ in det if d_<i],default=None);b_=min([d_ for d_ in det if d_>i],default=None)
    if a_ is not None and b_ is not None and tt[b_]-tt[a_]<=1.5:u=(tt[i]-tt[a_])/(tt[b_]-tt[a_]);boxes[i]=[round(p_+(q_-p_)*u,4) for p_,q_ in zip(boxes[a_],boxes[b_])];src[i]='blended'
pts=[[[round(float(P[i,k,0]),4),round(float(P[i,k,1]),4)] if P[i,k,2]>=SEEN and seen[k]>=3 else None for i in range(P.shape[0])] for k in range(P.shape[1])]  # each seed's place per frame when seen: the tint grows each person from their own points
json.dump(dict(times=tt,boxes=boxes,points=pts,seen=seen,source=src,seeds=seeds,seed_time=seed_t,box=box,seconds=dict(arrow=R['seconds'],total=round(time.perf_counter()-began,1))),open(out,'w'))
print(json.dumps(dict(frames=len(pick),seeds=len(seeds),with_box=sum(b is not None for b in boxes),from_detector=src.count('detector'),seconds=round(time.perf_counter()-began,1))))
