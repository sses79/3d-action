"""People the pose detector misses in a depth-library clip (docs/DEPTH_LIBRARY_PLAN.md, "Missed people"): SAM 3 looks for "person"
in three frames of each shot (sam3-people.py; about 7 s a frame, kept as <clip>.people-sam3.json/.npz), and each person it outlines is
read against the tinted video: an outline under a quarter coloured, or coloured in someone's colour whose box (the tracks
at that time) matches another outline better (a box spilling over), is a missed person (a dark back filling the frame, a head cut off,
someone the detector never boxed). Near-duplicate outlines (mask overlap over 0.7) are merged into the largest, and slivers under 3% wide at a frame edge are
left out. Small people are left out as in the check (under half the largest person's height, between 12 and
30% of the picture). Missed people in one shot are joined across its frames (centres within 20% of the picture, heights within
0.6-1.65 and widths within 0.5-2 of each other, boxes overlapping by 0.3 or more) and each becomes a suggested follow entry (the name of a track whose box there
matches the outline, IoU 0.5 or more: tracked but left uncoloured; else a new letter; keys at the frames where they were seen, with up to 16 seed points inside the outline): the build
applies them (depth-build.py), fix_depth_clip with findMissed adds them, the check lists what is still missed (the largest
person in the frame as "missing subject (SAM 3)", a fault; anyone else as "untinted person (SAM 3)", a note).
  .authoring/vision-venv/bin/python authoring/render/depth_missed.py SOURCE-ID CLIP-ID [--used A,B] [--following A:27,B:27]    runs SAM 3 when its frames are not cached,
writes <clip>.missed.json and prints {clip, missed, follow, seconds}. SAM 3 runs on mini4 when it answers (frames cut here and
sent, ~/Yun/sam3d-runner's ComfyUI), else here; `depth_missed.py --setup` copies the weights and sam3-people.py there (again after
sam3-people.py changes). The check only reads the cache (find(..., run=False)).
Limits: SAM 3 joins two people in a close embrace into one outline (then it is coloured and not missed); a new letter is a new person:
someone known from another shot is renamed in the follow entry by whoever runs the fix."""
import sys,os,json,pathlib,subprocess,time,tempfile,shutil
import numpy as np,cv2
ROOT=pathlib.Path(__file__).resolve().parents[2]
NAMED={'blue':'#4a86d8','orange':'#ee8a3a','green':'#4fae5a','pink':'#f07fb0','purple':'#8d6fd1','yellow':'#e8c53a','red':'#d9534a','crimson':'#a3232b','navy':'#2b3a66'}  # as depth-tint.py
def iou(a,b):
    w=max(0,min(a[2],b[2])-max(a[0],b[0]));h=max(0,min(a[3],b[3])-max(a[1],b[1]));i=w*h;return i/max(1e-9,(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-i)
def sample(shots,start,end):
    """Three frames a shot (20, 50, 80% through it), one for a shot under 0.6 s; source seconds."""
    out=[]
    for s in shots:
        a,b=max(s['start'],start),min(s['end'],end)
        if b-a<=0:continue
        out+=[(str(s['index']),round(a+f*(b-a),3)) for f in ((.5,) if b-a<.6 else (.2,.5,.8))]
    return out
HOST=os.environ.get('DEPTH_WORKER_HOST','tim@mini4.local');RUNNER='Yun/sam3d-runner';SSH=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=4',HOST];SCRIPT=ROOT/'authoring/render/sam3-people.py'
def remote(cmd,timeout=60,**kw):return subprocess.run(SSH+[cmd],capture_output=True,text=True,timeout=timeout,**kw)
def ready():  # mini4 answers, has the weights and the same script
    try:r=remote(f'test -s {RUNNER}/comfyui/models/checkpoints/sam3.1_multiplex_fp16.safetensors && shasum -a 256 {RUNNER}/depth-jobs/sam3-people.py',timeout=8)
    except Exception:return False,'no answer'
    if r.returncode==255:return False,'no answer'
    if r.returncode:return False,'not set up (depth_missed.py --setup)'
    same=r.stdout.split()[0]==__import__('hashlib').sha256(open(SCRIPT,'rb').read()).hexdigest();return same,'' if same else 'script differs (depth_missed.py --setup)'
def people(video,times,out):
    """SAM 3 on mini4 when it answers (the frames are cut here and sent; about twice as fast), else here; the same output either way.
    DEPTH_WORKER=local or mini4 forces one; each run adds a line to .authoring/logs/workers.jsonl."""
    where=os.environ.get('DEPTH_WORKER','auto');why='';t0=time.perf_counter()
    if where=='auto':ok,why=ready();where='mini4' if ok else 'local'
    if where=='mini4':
        try:
            with tempfile.TemporaryDirectory() as td:
                cap=cv2.VideoCapture(video);fps=cap.get(5);fr=[]
                for i,t in enumerate(times):
                    k=round(t*fps);cap.set(cv2.CAP_PROP_POS_FRAMES,k);ok,im=cap.read()
                    if ok:cv2.imwrite(os.path.join(td,f'{i}.png'),im);fr.append(dict(t=round(k/fps,4),file=f'{i}.png'))
                json.dump(fr,open(os.path.join(td,'frames.json'),'w'));job=f'sam3-{os.getpid()}-{int(time.time())}';rd=f'{RUNNER}/depth-jobs/{job}'
                remote(f'mkdir -p {rd}',check=True);subprocess.run(['scp','-q','-o','BatchMode=yes']+[os.path.join(td,x) for x in os.listdir(td)]+[f'{HOST}:{rd}/'],check=True)
                r=remote(f'cd {RUNNER} && comfyui/.venv/bin/python depth-jobs/sam3-people.py comfyui depth-jobs/{job} depth-jobs/{job}/out.json -',timeout=1800)
                if r.returncode:raise RuntimeError((r.stderr or r.stdout)[-600:])
                subprocess.run(['scp','-q','-o','BatchMode=yes',f'{HOST}:{rd}/out.json',f'{HOST}:{rd}/out.npz',td],check=True);remote(f'rm -rf {rd}')
                o=json.load(open(os.path.join(td,'out.json')));o['video']=video;json.dump(o,open(out,'w'));shutil.copy(os.path.join(td,'out.npz'),os.path.splitext(out)[0]+'.npz')
        except Exception as e:why=f'mini4 failed ({str(e)[-200:]}); ran here';where='local'
    if where=='local':
        r=subprocess.run([str(ROOT/'.authoring/comfyui/.venv/bin/python'),str(SCRIPT),str(ROOT/'.authoring/comfyui'),video,str(out),','.join(f'{t:.3f}' for t in times)],capture_output=True,text=True)
        if r.returncode:raise SystemExit('SAM 3 failed:\n'+(r.stderr or r.stdout)[-1500:])
    os.makedirs(ROOT/'.authoring/logs',exist_ok=True)
    with open(ROOT/'.authoring/logs/workers.jsonl','a') as f:f.write(json.dumps({'at':time.strftime('%Y-%m-%dT%H:%M:%S'),'stage':'sam3-people','where':where,'seconds':round(time.perf_counter()-t0,1),'frames':len(times),'note':why or None})+'\n')
def setup():
    remote(f'mkdir -p {RUNNER}/comfyui/models/checkpoints {RUNNER}/depth-jobs',check=True)
    for src,dst in ((ROOT/'.authoring/comfyui/models/checkpoints/sam3.1_multiplex_fp16.safetensors',f'{RUNNER}/comfyui/models/checkpoints/'),(SCRIPT,f'{RUNNER}/depth-jobs/')):subprocess.run(['rsync','-a','--partial','-e','ssh -o BatchMode=yes',str(src),f'{HOST}:{dst}'],check=True)
    return ready()
def find(src,clip,run=True,used=(),following=()):
    root=ROOT/'.authoring/depth-library'/src;T=json.load(open(root/f'{clip}.tracks.json'));shots=json.load(open(root/f'{clip}.shots.json'))['shots'];began=time.perf_counter()
    pts=sample(shots,T['start'],T['end']);times=[t for _,t in pts];cj=root/f'{clip}.people-sam3.json'
    have=json.load(open(cj)) if cj.exists() else None
    if not have or len(have['frames'])!=len(times) or any(abs(f['t']-t)>.06 for f,t in zip(have['frames'],times)):  # the decoded frame lies within a frame of the asked time
        if not run:return None
        people(T['video'],times,cj);have=json.load(open(cj))
    M=np.load(root/f'{clip}.people-sam3.npz');S=json.load(open(root/'source.json'));C=next(c for c in S['clips'] if c['id']==clip)
    colour={p['name']:p['color'] for p in json.load(open(ROOT/'.authoring/video-clay'/C['package']/'package.json'))['people']}  # name to colour, as tinted
    hue={c:int(cv2.cvtColor(np.uint8([[[int(NAMED.get(c,'#888888')[q:q+2],16) for q in (5,3,1)]]]),cv2.COLOR_BGR2HSV)[0,0,0])//12 for c in colour.values()}
    tf=root/f'{clip}.tracks-fixed.json';TF=json.load(open(tf if tf.exists() else root/f'{clip}.tracks.json'));TT=np.array(TF['times']);W0,H0=TF.get('size',T.get('size',[1920,1080]));tracks=[TF['tracks']]
    try:followed={(e['name'],str(e['shot'])) for e in json.load(open(root/f'{clip}.fixes.json')).get('follow',[])}
    except Exception:followed=set()
    hf=root/f'{clip}.hand.json'
    if hf.exists():
        HF=json.load(open(hf))
        if len(HF.get('times',[]))==len(TT):tracks.append(HF['tracks'])
    tv=cv2.VideoCapture(str(root/f'{clip}-tinted.mp4'));fps=tv.get(5);missed=[]
    for i,((shot,t),F) in enumerate(zip(pts,have['frames'])):
        tv.set(cv2.CAP_PROP_POS_FRAMES,round((t-T['start'])*fps));ok,g=tv.read()
        if not ok or not F['people']:continue
        keep=[]  # near-duplicate outlines (SAM 3 gives a few around one body; which ones varies with the machine) merged into the largest; slivers at a frame edge (a body mostly out of view) left out
        for j in sorted(range(len(F['people'])),key=lambda j:-F['people'][j]['area']):
            b=F['people'][j]['box'];m=M[f'm{i}_{j}']
            if b[2]-b[0]<.03 and (b[0]<.01 or b[2]>.99):continue
            if any((m&M[f'm{i}_{q}']).sum()>.7*(m|M[f'm{i}_{q}']).sum() for q in keep):continue
            keep.append(j)
        if not keep:continue
        big=max(F['people'][j]['box'][3]-F['people'][j]['box'][1] for j in keep);lo=max(.12,min(.3,.5*big))
        hsv=cv2.resize(cv2.cvtColor(g,cv2.COLOR_BGR2HSV),(240,M[f'm{i}_0'].shape[0]),interpolation=cv2.INTER_NEAREST);sat=hsv[...,1]>60;hb=hsv[...,0]//12  # the tint's colour (the depth's grey has none), its hue in bins
        held={j:np.bincount(hb[M[f'm{i}_{j}']&sat],minlength=16) for j in keep}
        k_=int(np.argmin(np.abs(TT-t)));own={}  # whose each colour is: the outline that best matches that person's box at this time
        for n,c in colour.items():
            if (n,shot) in followed:continue  # a followed person is coloured from their own points; their box can be a detector box over two people
            b=next((v[k_]['box'] for f in tracks for m_,v in f.items() if m_ in (n,n+'-hand') and v[k_]),None)
            if b is None:continue
            b=[b[0]/W0,b[1]/H0,b[2]/W0,b[3]/H0];own[hue[c]]=max(keep,key=lambda q:iou(F['people'][q]['box'],b))
        for j in keep:
            p=F['people'][j]
            if p['box'][3]-p['box'][1]<lo:continue
            m=M[f'm{i}_{j}'];cov=float(sat[m].mean()) if m.any() else 1.;h=int(held[j].argmax())
            worn=cov>=.25 and h in own and own[h]!=j  # coloured, but in the colour of someone whose box matches another outline: wearing their colour (a box spilling over)
            if cov<.25 or worn:
                e=cv2.erode(m.astype(np.uint8),np.ones((5,5),np.uint8))>0;e=e if e.sum()>=12 else m;ys,xs=np.nonzero(e);q=[]  # seeds for ARROW inside the outline (a narrow box's nearer depth gave too few)
                for fy in np.linspace(.1,.9,6):
                    for fx in np.linspace(.1,.9,5):
                        y=int(ys.min()+fy*(ys.max()-ys.min()));row=xs[ys==y]
                        if len(row):x=int(row.min()+fx*(row.max()-row.min()));q.append([round((x+.5)/m.shape[1],4),round((y+.5)/m.shape[0],4)]) if e[y,x] else None
                q=[q[k] for k in np.linspace(0,len(q)-1,min(16,len(q))).round().astype(int)] if q else []
                missed.append(dict(shot=shot,time=round(t-T['start'],2),box=p['box'],points=q,coloured=round(cov,2),**({'worn':True} if worn else {}),tall=round(p['box'][3]-p['box'][1],2),largest=p['box'][3]-p['box'][1]>=big-1e-6))
    followed_now={tuple(x.split(':')) for x in following};used=set(used)|set((C.get('fixed') or {}).get('people') or [])|set((C.get('built') or {}).get('people') or {})  # names given in the fix being made come in as used
    follow=[];groups=[]
    for x in missed:  # join one person across the frames of a shot
        cx=(x['box'][0]+x['box'][2])/2;g=next((g for g in groups if g[-1]['shot']==x['shot'] and g[-1]['time']<x['time'] and abs((g[-1]['box'][0]+g[-1]['box'][2])/2-cx)<.2 and .6<=x['tall']/g[-1]['tall']<=1.65 and .5<=(x['box'][2]-x['box'][0])/max(1e-6,g[-1]['box'][2]-g[-1]['box'][0])<=2 and iou(x['box'],g[-1]['box'])>=.3),None)  # same place, height and width, overlapping (026: Roose coming out from behind Ramsay has his centre, not his width)
        if g:g.append(x)
        else:groups.append([x])
    for g in groups:
        if not any(len(x['points'])>=3 for x in g):continue
        k_=int(np.argmin(np.abs(TT-(g[0]['time']+T['start']))));fs={n for n,sh in followed_now if sh==g[0]['shot']}|{e['name'] for e in follow if e['shot']==g[0]['shot']}
        match=sorted(((iou(g[0]['box'],[v[k_]['box'][0]/W0,v[k_]['box'][1]/H0,v[k_]['box'][2]/W0,v[k_]['box'][3]/H0]),n) for n,v in TF['tracks'].items() if v[k_] and n not in fs),reverse=True)
        n=match[0][1] if match and match[0][0]>=.5 else next((c for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' if c not in used),None)  # a person the tracks have a box for but the tint leaves uncoloured keeps their name (the follow replaces their track in the shot); else a new letter
        if n is None:break
        used.add(n);follow.append(dict(name=n,shot=g[0]['shot'],keys=[dict(time=x['time'],box=x['box'],points=x['points']) for x in g[:6] if len(x['points'])>=3]))
    out=dict(clip=clip,missed=missed,follow=follow,frames=len(pts),sam3=have.get('seconds'),seconds=round(time.perf_counter()-began,1))
    json.dump(out,open(root/f'{clip}.missed.json','w'),indent=1);return out
if __name__=='__main__' and '--setup' in sys.argv:print(json.dumps(dict(setup=HOST,ready=setup()[0])))
elif __name__=='__main__':print(json.dumps(find(sys.argv[1],sys.argv[2],used=next((sys.argv[i+1].split(',') for i,a in enumerate(sys.argv) if a=='--used'),()),following=next((sys.argv[i+1].split(',') for i,a in enumerate(sys.argv) if a=='--following' and sys.argv[i+1]!='-'),()))))
