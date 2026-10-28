"""People the pose detector misses in a depth-library clip (docs/DEPTH_LIBRARY_PLAN.md, "Missed people"): SAM 3 looks for "person"
in three frames of each shot (sam3-people.py; about 7 s a frame, kept as <clip>.people-sam3.json/.npz), and each person it outlines is
read against the tinted video: an outline under a quarter coloured, or coloured in someone's colour whose box (the tracks
at that time) matches another outline better (a box spilling over), is a missed person (a dark back filling the frame, a head cut off,
someone the detector never boxed). Near-duplicate outlines (mask overlap over 0.7) are merged into the largest, and slivers under 3% wide at a frame edge are
left out. Small people are left out as in the check (under half the largest person's height, between 12 and
30% of the picture). Missed people in one shot are joined across its frames (only people near the camera: an outline's depth at least 0.8 of the nearest outline's in
that frame; the largest and tallest first, at most 3 a shot and 8 a clip; centres within 20% of the picture, heights within
0.6-1.65 and widths within 0.5-2 of each other, boxes overlapping by 0.3 or more) and each becomes a suggested follow entry (the name of a track whose box there
matches the outline, IoU 0.5 or more: tracked but left uncoloured; else a new letter; keys at the frames where they were seen, with up to 16 seed points inside the outline): the build
applies them (depth-build.py), fix_depth_clip with findMissed adds them, the check lists what is still missed (the largest
person in the frame as "missing subject (SAM 3)", a fault; anyone else as "untinted person (SAM 3)", a note).
  .authoring/vision-venv/bin/python authoring/render/depth_missed.py SOURCE-ID CLIP-ID [--used A,B] [--following A:27,B:27]    runs SAM 3 when its frames are not cached,
writes <clip>.missed.json and prints {clip, missed, follow, seconds}. SAM 3 runs on mini4 when it answers (frames cut here and
sent, ~/Yun/sam3d-runner's ComfyUI), else here; `depth_missed.py --setup` copies the weights and sam3-people.py there (again after
sam3-people.py changes). The check only reads the cache (find(..., run=False)).
Crowd step (2026-10-28): a described clip (summary and peopleCount N) with more than N people in a frame does not use "near" and
"largest" (in 023 the blurred giant in front reads as far, and a monk from behind is the nearest): who() shows a vision model every
sampled frame with the outlines numbered and the summary; it names the N people and says which outline is which. Each person
takes the letter of the build track matching them most often (else a letter no remaining track wears); renames (the build's
letters, per shot) give a track on one of them their letter and drop a track matching only other outlines (or a box at least half on the outline); their missed outlines
are followed under their letter (at most N a shot, 24 a clip). The answer is kept as <clip>.crowd.json; out.renames go under any
renames given by hand (fix_depth_clip) or into the build's first fixes.
Limits: SAM 3 joins two people in a close embrace into one outline (then it is coloured and not missed); a new letter is a new person:
someone known from another shot is renamed in the follow entry by whoever runs the fix."""
import sys,os,json,pathlib,subprocess,time,tempfile,shutil
import numpy as np,cv2
ROOT=pathlib.Path(__file__).resolve().parents[2]
NAMED={'blue':'#4a86d8','orange':'#ee8a3a','green':'#4fae5a','pink':'#f07fb0','purple':'#8d6fd1','yellow':'#e8c53a','red':'#d9534a','crimson':'#a3232b','navy':'#2b3a66'}  # as depth-tint.py
def iou(a,b):
    w=max(0,min(a[2],b[2])-max(a[0],b[0]));h=max(0,min(a[3],b[3])-max(a[1],b[1]));i=w*h;return i/max(1e-9,(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-i)
def on(m,b):  # the share of box b (fractions) on the outline m
    h,w=m.shape;x0,y0,x1,y1=int(max(0,b[0])*w),int(max(0,b[1])*h),int(np.ceil(min(1,b[2])*w)),int(np.ceil(min(1,b[3])*h));return float(m[y0:y1,x0:x1].mean()) if x1>x0 and y1>y0 else 0.
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
PAL=[(0,255,255),(255,0,255),(0,255,0),(255,128,0),(0,128,255),(255,255,0),(128,0,255),(0,0,255),(255,255,255),(0,200,128)]
def who(root,clip,video,pts,have,M,keeps,D,N):
    """The crowd step: each sampled frame with SAM 3's outlines numbered goes to a vision model (DEPTH_DRAFT_MODEL, as depth-draft.py;
    the key from OPENROUTER_API_KEY or OPENROUTER_ENV_FILE) with the clip's summary; it names the N people the summary is about and
    says which outline is which in every frame. Kept as <clip>.crowd.json while the summary and frames are the same."""
    import re,base64,hashlib,urllib.request
    model=os.environ.get('DEPTH_DRAFT_MODEL','openai/gpt-6-luna');sig=hashlib.sha1(json.dumps([D['summary'],N,model,[round(t,2) for _,t in pts],{str(k):v for k,v in keeps.items()}]).encode()).hexdigest()[:16];cf=root/f'{clip}.crowd.json'
    if cf.exists():
        c=json.load(open(cf))
        if c.get('sig')==sig:c['picks']={int(i):{int(j):r for j,r in P.items()} for i,P in c['picks'].items()};return c
    key=os.environ.get('OPENROUTER_API_KEY')
    if not key and os.environ.get('OPENROUTER_ENV_FILE'):m_=re.search(r'^OPENROUTER_API_KEY=["\']?([^"\'\n]+)',pathlib.Path(os.environ['OPENROUTER_ENV_FILE']).read_text(),re.M);key=m_.group(1) if m_ else None
    if not key:raise SystemExit('the crowd step needs OPENROUTER_API_KEY, or OPENROUTER_ENV_FILE naming a file that defines it')
    cap=cv2.VideoCapture(video);fps=cap.get(5);content=[];t0=time.perf_counter()
    for i,(shot,t) in enumerate(pts):
        if i not in keeps:continue
        cap.set(cv2.CAP_PROP_POS_FRAMES,round(t*fps));ok,im=cap.read()
        if not ok:continue
        im=cv2.resize(im,(768,432))
        for n,j in enumerate(keeps[i]):
            m=cv2.resize(M[f'm{i}_{j}'].astype(np.uint8),(768,432),interpolation=cv2.INTER_NEAREST);cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);cv2.drawContours(im,cs,-1,PAL[n%10],2)
            ys,xs=np.nonzero(m);y=int(ys.min());x=int(np.median(xs[ys<y+20]));lab=str(n+1);org=(max(2,min(740,x-8)),max(22,min(425,y+22)))
            cv2.putText(im,lab,org,0,.8,(0,0,0),5);cv2.putText(im,lab,org,0,.8,PAL[n%10],2)
        cv2.putText(im,f'frame {i} (shot {shot})',(8,24),0,.7,(0,0,0),5);cv2.putText(im,f'frame {i} (shot {shot})',(8,24),0,.7,(255,255,255),2)
        ok,buf=cv2.imencode('.jpg',im,[cv2.IMWRITE_JPEG_QUALITY,85]);content.append({'type':'image_url','image_url':{'url':'data:image/jpeg;base64,'+base64.b64encode(buf).decode()}})
    prompt=(f"These are frames of one film clip, cut into shots. The clip: {D['summary']}\nIt is about {N} people. Each frame shows numbered outlines of people found by a detector.\n"
        f"1. Name the {N} people the clip is about (a short name from the description, as 'the soldier') and how each looks (clothes, armour, hair), so you can know them in every shot.\n"
        "2. For every frame, give the outline numbers that are one of those people and who. Leave out everyone else: crowds, guards, onlookers, people in the background. "
        "An outline over two people: the one who fills most of it. One person split into two outlines: give both. A person cut by the frame edge, blurred, from behind or in the dark still counts; skip a frame where none of them has an outline.")
    schema={'type':'object','additionalProperties':False,'required':['people','frames'],'properties':{'people':{'type':'array','items':{'type':'object','additionalProperties':False,'required':['name','look'],'properties':{'name':{'type':'string'},'look':{'type':'string'}}}},
        'frames':{'type':'array','items':{'type':'object','additionalProperties':False,'required':['frame','outlines'],'properties':{'frame':{'type':'integer'},'outlines':{'type':'array','items':{'type':'object','additionalProperties':False,'required':['outline','person'],'properties':{'outline':{'type':'integer'},'person':{'type':'string'}}}}}}}}}
    body={'model':model,'temperature':0,'messages':[{'role':'user','content':[{'type':'text','text':prompt}]+content}],'response_format':{'type':'json_schema','json_schema':{'name':'crowd','strict':True,'schema':schema}}}
    for attempt in range(3):
        try:
            r=json.load(urllib.request.urlopen(urllib.request.Request('https://openrouter.ai/api/v1/chat/completions',json.dumps(body).encode(),{'Authorization':'Bearer '+key,'Content-Type':'application/json'}),timeout=300));A=json.loads(r['choices'][0]['message']['content']);break
        except Exception as e:
            if attempt==2:raise SystemExit(f'the crowd step: the model did not answer: {e}')
            time.sleep(3)
    names=[q['name'] for q in A['people']][:N];picks={}
    for f in A['frames']:
        i=f['frame']
        if i not in keeps:continue
        for o in f['outlines']:
            if 1<=o['outline']<=len(keeps[i]) and o['person'] in names:picks.setdefault(i,{})[keeps[i][o['outline']-1]]=o['person']
    c=dict(sig=sig,model=model,people=A['people'][:N],picks=picks,seconds=round(time.perf_counter()-t0,1));json.dump(c,open(cf,'w'),indent=1);return c
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
    tv=cv2.VideoCapture(str(root/f'{clip}-tinted.mp4'));fps=tv.get(5);missed=[];keeps={};talls={}
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
        big=max(F['people'][j]['box'][3]-F['people'][j]['box'][1] for j in keep);lo=max(.12,min(.3,.5*big));keeps[i]=keep;talls[i]=[j for j in keep if F['people'][j]['box'][3]-F['people'][j]['box'][1]>=lo]
        grey=cv2.resize(cv2.cvtColor(g,cv2.COLOR_BGR2HSV)[...,2],(240,M[f'm{i}_0'].shape[0]),interpolation=cv2.INTER_AREA);gm={j:float(np.median(grey[M[f'm{i}_{j}']])) for j in keep};gn=max(gm.values())  # the tint keeps the depth as brightness: each outline's depth, and the nearest
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
                missed.append(dict(shot=shot,frame=i,outline=j,time=round(t-T['start'],2),box=p['box'],points=q,coloured=round(cov,2),**({'worn':True} if worn else {}),near=gm[j]>=.8*gn,tall=round(p['box'][3]-p['box'][1],2),largest=p['box'][3]-p['box'][1]>=big-1e-6))
    followed_now={tuple(x.split(':')) for x in following};asked=set(used);used=set(used)|set((C.get('fixed') or {}).get('people') or [])|set((C.get('built') or {}).get('people') or {})  # names given in the fix being made come in as used
    follow=[];groups=[]
    for x in missed:  # join one person across the frames of a shot
        cx=(x['box'][0]+x['box'][2])/2;g=next((g for g in groups if g[-1]['shot']==x['shot'] and g[-1]['time']<x['time'] and abs((g[-1]['box'][0]+g[-1]['box'][2])/2-cx)<.2 and .6<=x['tall']/g[-1]['tall']<=1.65 and .5<=(x['box'][2]-x['box'][0])/max(1e-6,g[-1]['box'][2]-g[-1]['box'][0])<=2 and iou(x['box'],g[-1]['box'])>=.3),None)  # same place, height and width, overlapping (026: Roose coming out from behind Ramsay has his centre, not his width)
        if g:g.append(x)
        else:groups.append([x])
    gh=TF.get('ghosts',{})  # people the fix dropped are not suggested again
    for x in missed:
        k_=int(np.argmin(np.abs(TT-(x['time']+T['start']))));x['dropped']=any(v[k_] and iou(x['box'],[v[k_]['box'][0]/W0,v[k_]['box'][1]/H0,v[k_]['box'][2]/W0,v[k_]['box'][3]/H0])>=.4 for v in gh.values())
    D=C.get('description') or {};N=D.get('peopleCount');N=int(N) if str(N or '').isdigit() else 0;renames={};crowd=None
    if N and D.get('summary') and any(len(v)>N for v in talls.values()):  # the crowd step: more people in a frame than the description names; a vision model says which outlines are the people it is about
        crowd=who(root,clip,T['video'],pts,have,M,keeps,D,N);pick=crowd['picks'];W1,H1=T.get('size',[W0,H0]);R_=T['tracks'];RT=np.array(T['times']);rb=lambda v,k:[v[k]['box'][0]/W1,v[k]['box'][1]/H1,v[k]['box'][2]/W1,v[k]['box'][3]/H1]
        votes={}
        for i,P in pick.items():
            k_=int(np.argmin(np.abs(RT-pts[i][1])))
            for j,r in P.items():
                for n,v in R_.items():
                    if v[k_] and iou(have['frames'][i]['people'][j]['box'],rb(v,k_))>=.5:votes[(r,n)]=votes.get((r,n),0)+1
        letter={};taken=asked  # the build's own letters are re-decided here; only names in the fix being made are kept
        for (r,n),_ in sorted(votes.items(),key=lambda x:-x[1]):  # each person the letter of the track that matches them most often, one letter each
            if r not in letter and n not in letter.values():letter[r]=n
        for i,(shot,t) in enumerate(pts):  # renames in the build's letters: a track on one of the people takes their letter; one only on crowd outlines is dropped
            if i not in keeps:continue
            k_=int(np.argmin(np.abs(RT-t)))
            for n,v in R_.items():
                if not v[k_]:continue
                sc=lambda q:max(iou(have['frames'][i]['people'][q]['box'],rb(v,k_)),on(M[f'm{i}_{q}'],rb(v,k_)))  # a part box (023 shot 25: a second track on the soldier's chest) lies on the outline itself, not only inside its box
                j=max(keeps[i],key=sc)
                if sc(j)<.5:continue
                r=pick.get(i,{}).get(j);renames.setdefault(shot,{}).setdefault(n,[]).append(letter.get(r,'-') if r else '-')
        live=set()  # letters still worn after the renames: a person no track matched takes a letter none of them wears (a ninth name has no colour)
        for sh in shots:
            idx=[k for k,t in enumerate(RT) if sh['start']<=t<sh['end']]
            for n,v in R_.items():
                if any(v[k] for k in idx):
                    rn=renames.get(str(sh['index']),{}).get(n);live.add(n if rn is None else max(set(rn),key=lambda x:(rn.count(x),x!='-')))
        for r in [q['name'] for q in crowd['people']]:
            if r not in letter:letter[r]=next(c for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' if c not in live and c not in letter.values() and c not in taken)
        for q in crowd['people']:q['letter']=letter[q['name']]
        renames={s_:{n:max(set(v),key=lambda x:(v.count(x),x!='-')) for n,v in m.items()} for s_,m in renames.items()};renames={s_:{n:x for n,x in m.items() if x!=n} for s_,m in renames.items()};renames={s_:m for s_,m in renames.items() if m}  # most frames win; a tie goes to the person
        for g in groups:  # the follows: missed outlines that are one of the people, under that person's letter, at most N a shot
            rs=[pick.get(x['frame'],{}).get(x['outline']) for x in g];rs=[r for r in rs if r]
            if not rs or not any(len(x['points'])>=3 for x in g):continue
            n=letter[max(set(rs),key=rs.count)];fs={a for a,sh in followed_now if sh==g[0]['shot']}|{e['name'] for e in follow if e['shot']==g[0]['shot']}
            if n in fs or len(follow)>=24 or sum(e['shot']==g[0]['shot'] for e in follow)>=N:continue
            follow.append(dict(name=n,shot=g[0]['shot'],keys=[dict(time=x['time'],box=x['box'],points=x['points']) for x in g[:6] if len(x['points'])>=3 and pick.get(x['frame'],{}).get(x['outline'])]))
        groups=[]
    groups=[g for g in groups if any(x['near'] and not x['dropped'] for x in g)]  # only people near the camera are followed (a crowd behind the action stays grey; the check notes it)
    groups.sort(key=lambda g:(not any(x['largest'] for x in g),-max(x['tall'] for x in g)));per={}
    for g in groups:
        if not any(len(x['points'])>=3 for x in g) or per.get(g[0]['shot'],0)>=3 or len(follow)>=8:continue  # at most 3 a shot and 8 a clip, the largest and tallest first
        per[g[0]['shot']]=per.get(g[0]['shot'],0)+1
        k_=int(np.argmin(np.abs(TT-(g[0]['time']+T['start']))));fs={n for n,sh in followed_now if sh==g[0]['shot']}|{e['name'] for e in follow if e['shot']==g[0]['shot']}
        match=sorted(((iou(g[0]['box'],[v[k_]['box'][0]/W0,v[k_]['box'][1]/H0,v[k_]['box'][2]/W0,v[k_]['box'][3]/H0]),n) for n,v in TF['tracks'].items() if v[k_] and n not in fs),reverse=True)
        n=match[0][1] if match and match[0][0]>=.5 else next((c for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' if c not in used),None) if len(colour)+sum(e['name'] not in colour for e in follow)<8 else None  # a new letter only while colours remain (8)  # a person the tracks have a box for but the tint leaves uncoloured keeps their name (the follow replaces their track in the shot); else a new letter
        if n is None:continue
        used.add(n);follow.append(dict(name=n,shot=g[0]['shot'],keys=[dict(time=x['time'],box=x['box'],points=x['points']) for x in g[:6] if len(x['points'])>=3]))
    out=dict(clip=clip,missed=missed,follow=follow,renames=renames,**({'crowd':dict(people=crowd['people'],model=crowd['model'],seconds=crowd['seconds'])} if crowd else {}),frames=len(pts),sam3=have.get('seconds'),seconds=round(time.perf_counter()-began,1))
    json.dump(out,open(root/f'{clip}.missed.json','w'),indent=1);return out
if __name__=='__main__' and '--setup' in sys.argv:print(json.dumps(dict(setup=HOST,ready=setup()[0])))
elif __name__=='__main__':print(json.dumps(find(sys.argv[1],sys.argv[2],used=next((sys.argv[i+1].split(',') for i,a in enumerate(sys.argv) if a=='--used'),()),following=next((sys.argv[i+1].split(',') for i,a in enumerate(sys.argv) if a=='--following' and sys.argv[i+1]!='-'),()))))
