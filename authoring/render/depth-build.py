"""Step 3 of the depth shot library (docs/DEPTH_LIBRARY_PLAN.md): build a proposed clip into a package, with no hand work.
  .authoring/vision-venv/bin/python authoring/render/depth-build.py SOURCE-ID CLIP-ID [--video PATH] [--people 4]
Reads .authoring/depth-library/<source>/source.json (depth-ingest.py) and, for the clip's time span:
1. depth: Depth Anything 3 through ComfyUI (da3-depth.py), stored 960 wide, kept as <clip>.depth.npz in the source's folder;
2. people: the pose detector on every frame (cached per video as follow.py does), boxes joined frame to frame by overlap into
   tracks within each shot; a track counts when it is seen in at least a third of its shot and is at least 15% of the picture
   tall; the biggest --people of them per shot are kept. Across cuts a track takes the name of the earlier person whose
   clothes match closely (a colour histogram of the box's upper part, correlation 0.85 or more), or a new letter: A, B, C...
   by first appearance. Gaps inside a track are filled by blending. Names are roles, to be fixed on the page when wrong;
3. tint: depth-tint.py with those tracks (A blue, B orange, C green, D pink, E purple, F yellow, G red, H navy);
4. keyframes: the start of every shot (0.15 s in) and the middle of shots longer than 4 s, at most 8;
5. package: video-clay-pack.py into .authoring/video-clay/<clip-id>/ (tinted depth only), with keyframe text left to the
   describe step ("not described"); the clip in source.json becomes "built" with its package id and the build record.
Timing is printed and stored. The source video must be at the path recorded at ingest unless --video gives it."""
import sys,os,json,argparse,hashlib,pathlib,subprocess,time,numpy as np,cv2
p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('clip');p.add_argument('--video');p.add_argument('--people',type=int,default=4);a=p.parse_args()
root=pathlib.Path('.authoring/depth-library')/a.source;S=json.load(open(root/'source.json'));C=next(c for c in S['clips'] if c['id']==a.clip)
assert C['kind']=='control','a still shot has no depth to build'
video=a.video or S['file'];assert os.path.exists(video),f'source video not at {video}; pass --video'
assert hashlib.sha256(open(video,'rb').read()).hexdigest()==S['sha256'],'this is not the ingested video (SHA-256 differs)'
t0,t1=C['start']+.02,C['end']-.02;took={};began=time.perf_counter();py=sys.executable
def step(name,cmd):
    t=time.perf_counter();r=subprocess.run(cmd,capture_output=True,text=True);took[name]=round(time.perf_counter()-t,1)
    if r.returncode:sys.exit(f'{name} failed:\n'+(r.stderr or r.stdout)[-2500:])
    return r.stdout
dep=root/f'{a.clip}.depth.npz'
if not dep.exists():step('depth',['.authoring/comfyui/.venv/bin/python','authoring/render/da3-depth.py','.authoring/comfyui',video,f'{t0:.3f}',f'{t1:.3f}',str(dep),'--save-width','960'])
# people: detector boxes on every frame (cached per video file), joined into tracks per shot
t=time.perf_counter();c=cv2.VideoCapture(video);fps=c.get(5);W,H=int(c.get(3)),int(c.get(4))
cache=pathlib.Path('.authoring/reconstruction-cache')/('detections-%s-yolo26s-pose-1920'%S['sha256'][:16]);cache.mkdir(parents=True,exist_ok=True);model=None
k0,k1=round(t0*fps),round(t1*fps);frames=list(range(k0,k1+1));dets={};hists={};c.set(1,k0)
for k in frames:
    ok,f=c.read()
    if not ok:break
    q=cache/('%d.json'%k)
    if q.exists():d=json.loads(q.read_text())
    else:
        from ultralytics import YOLO
        model=model or YOLO('.authoring/vision-models/yolo26s-pose.pt');r=model.predict(f,device='cpu',imgsz=1920,verbose=False,conf=.2)[0]
        d={'boxes':r.boxes.xyxy.cpu().tolist(),'keypoints':r.keypoints.data.cpu().tolist() if len(r.boxes) else []};q.write_text(json.dumps(d))
    dets[k]=d['boxes'];hs=[]
    for x0,y0,x1,y1 in d['boxes']:  # clothes: hue-saturation histogram of the box's upper 60%
        crop=f[int(max(0,y0)):int(max(y0+1,y0+.6*(y1-y0))),int(max(0,x0)):int(max(x0+1,x1))];h=cv2.calcHist([cv2.cvtColor(crop,cv2.COLOR_BGR2HSV)],[0,1],None,[16,4],[0,180,0,256]) if crop.size else np.zeros((16,4),np.float32)
        hs.append(cv2.normalize(h,None).flatten())
    hists[k]=hs
def iou(p,q):
    w=max(0,min(p[2],q[2])-max(p[0],q[0]));h=max(0,min(p[3],q[3])-max(p[1],q[1]));i=w*h;return i/((p[2]-p[0])*(p[3]-p[1])+(q[2]-q[0])*(q[3]-q[1])-i+1e-9)
# clothes must match closely (JOIN) to join across a cut: in dark footage everyone's clothes look alike, and a wrong join is harder to see than a split
shots=[s for s in S['shots'] if s['index'] in C['shots']];people={};names=[];colours=['blue','orange','green','pink','purple','yellow','red','navy'];JOIN=.85;per_shot={}
for s in shots:
    ks=[k for k in frames if s['start']<=k/fps<s['end'] and k in dets];tracks=[]
    for k in ks:
        used=set()
        for tr in tracks:
            if tr['last']!=k-1 and k-tr['last']>3:continue
            lb=tr['boxes'][tr['last']];best=max(((iou(lb,b),j) for j,b in enumerate(dets[k]) if j not in used),default=(0,None))
            if best[0]>=.3:tr['boxes'][k]=dets[k][best[1]];tr['hist'].append(hists[k][best[1]]);tr['last']=k;used.add(best[1])
        for j,b in enumerate(dets[k]):
            if j not in used:tracks.append({'boxes':{k:b},'hist':[hists[k][j]],'last':k})
    keep=[tr for tr in tracks if len(tr['boxes'])>=max(3,len(ks)/3) and np.median([b[3]-b[1] for b in tr['boxes'].values()])>=.15*H]
    keep=sorted(keep,key=lambda tr:-np.median([(b[2]-b[0])*(b[3]-b[1]) for b in tr['boxes'].values()])*len(tr['boxes']))[:a.people]
    taken=set();per_shot[s['index']]=[]
    for tr in sorted(keep,key=lambda tr:min(tr['boxes'])):
        h=np.mean(tr['hist'],0).astype(np.float32);best=max(((float(cv2.compareHist(h,people[n]['hist'],cv2.HISTCMP_CORREL)),n) for n in names if n not in taken),default=(-1,None))
        if best[0]>=JOIN:n=best[1];people[n]['hist']=(people[n]['hist']+h)/2
        else:n=chr(65+len(names));names.append(n);people[n]={'hist':h,'boxes':{}}
        taken.add(n);people[n]['boxes'].update(tr['boxes']);per_shot[s['index']].append(n)
        kk=sorted(tr['boxes'])  # gaps inside the track: blended
        for x,y in zip(kk,kk[1:]):
            for z in range(x+1,y):u=(z-x)/(y-x);people[n]['boxes'][z]=[p_+(q_-p_)*u for p_,q_ in zip(tr['boxes'][x],tr['boxes'][y])]
took['people']=round(time.perf_counter()-t,1)
names=names[:len(colours)]
trk=root/f'{a.clip}.tracks.json';json.dump(dict(video=video,start=t0,end=t1,times=[k/fps for k in frames],size=[W,H],tracks={n:[({'box':people[n]['boxes'][k]} if k in people[n]['boxes'] else None) for k in frames] for n in names},
    perShot=per_shot,note='automatic: detector tracks per shot, named across cuts by clothes colour; fix on the page'),open(trk,'w'))
shots_json=root/f'{a.clip}.shots.json';json.dump({'shots':[dict(index=s['index'],start=s['start'],end=s['end']) for s in shots]},open(shots_json,'w'))
tint=root/f'{a.clip}-tinted.mp4';step('tint',[py,'authoring/render/depth-tint.py',video,f'{t0:.3f}',f'{t1:.3f}',str(tint),'--shots',str(shots_json),'--tracks',str(trk),'--colors',','.join(f'{n}={colours[i]}' for i,n in enumerate(names)),'--depth',str(dep)])
# keyframes: each shot's start, and the middle of a long shot
keys=[]
for s in shots:
    keys.append(round(max(s['start'],t0)+min(.15,(s['end']-s['start'])/3)-t0,2))
    if s['end']-s['start']>4:keys.append(round((s['start']+s['end'])/2-t0,2))
keys=sorted(set(keys))[:8] if len(keys)<=8 else [keys[round(i*(len(keys)-1)/7)] for i in range(8)]
shot_at=lambda x:next((s['index'] for s in shots if s['start']<=x+t0<s['end']),shots[-1]['index'])
spec=dict(id=a.clip,name=f"{S['name']} · {a.clip.replace(a.source+'-','clip ')} ({C['seconds']:.1f} s)",video=video,start=round(t0,3),depth=str(tint),
    people=[dict(name=n,color=colours[i],represents=f'person {n} (not described)') for i,n in enumerate(names)],
    shots=[dict(index=s['index'],start=round(max(0,s['start']-t0),2),end=round(min(t1,s['end'])-t0,2),camera='not described') for s in shots],
    audio=[dict(start=round(max(0,w[0]-t0),2),end=round(min(t1,w[1])-t0,2),kind='speech',who=(per_shot.get(s['index']) or names or ['A'])[0],text='speech') for s in shots for w in s['speechWindows']],
    keyframes=[dict(time=x,shot=shot_at(x),summary='not described',people=[dict(name=n,doing='not described') for n in per_shot.get(shot_at(x),[]) if n in names]) for x in keys],
    notes=[f"Built automatically from {S['id']} {a.clip} (depth-build.py): people found and named by the detector and clothes colour; keyframes at shot starts. Not described yet.",'Measured: '+', '.join(C['why'])],
    library=dict(source=S['id'],clip=a.clip,perShot=per_shot))
spec_path=root/f'{a.clip}.spec.json';json.dump(spec,open(spec_path,'w'),indent=1);step('package',[py,'authoring/render/video-clay-pack.py',str(spec_path)])
C.update(status='built',package=a.clip,built=dict(at=time.strftime('%Y-%m-%dT%H:%M:%S'),people={n:colours[i] for i,n in enumerate(names)},perShot=per_shot,keyframes=keys,seconds=dict(took,total=round(time.perf_counter()-began,1))))
S2=json.load(open(root/'source.json'));next(c for c in S2['clips'] if c['id']==a.clip).update({k:C[k] for k in ('status','package','built')})  # read again: a description may have been written while this ran
json.dump(S2,open(root/'source.json','w'),indent=1)
print(json.dumps(dict(clip=a.clip,people={n:colours[i] for i,n in enumerate(names)},perShot=per_shot,keyframes=keys,seconds=C['built']['seconds'])))
