"""Step 1 of the depth shot library (docs/DEPTH_LIBRARY_PLAN.md): take in a source video, cut it into shots, say which need a
control video, time the speech, and propose clips. Nothing heavy: no depth, no people followed.
  .authoring/vision-venv/bin/python authoring/render/depth-ingest.py VIDEO --id SOURCE-ID [--name NAME] [--max 15]
      [--whisper-model PATH]
Runs shots.py (cuts), control-need.py (on/off with the reasons) and whisper.cpp (speech times only, from a local model; the words
are not kept) and writes .authoring/depth-library/<id>/source.json and a thumbnail per shot (shot-NNN.jpg, its middle frame).
Clips: control-on shots in a row are joined while together they stay within --max seconds (a sequence like a fight stays one clip);
a control-off stretch of at most --bridge (5) seconds between two on-shots joins them (a slow grab between fast fight
cuts); a run that is longer than --max is split at shot boundaries, and a single on-shot longer than --max is cut into pieces of --max. Each
control-off shot is an entry of its own with no depth: keyframes and text only. Every clip starts as "proposed"; building
(step 2) and describing (by Claude in a session) come later."""
import sys,os,json,argparse,hashlib,subprocess,pathlib,re,time,cv2
p=argparse.ArgumentParser();p.add_argument('video');p.add_argument('--id',required=True);p.add_argument('--name');p.add_argument('--max',type=float,default=15.);p.add_argument('--bridge',type=float,default=5.)
p.add_argument('--whisper-model',default=os.path.expanduser('~/.cache/hyperframes/whisper/models/ggml-small.en.bin'));a=p.parse_args()
assert re.fullmatch(r'[a-z0-9][a-z0-9-]{0,47}',a.id),'--id: lower-case letters, digits and dashes'
root=pathlib.Path('.authoring/depth-library')/a.id;root.mkdir(parents=True,exist_ok=True);py=sys.executable;began=time.perf_counter();took={}
c=cv2.VideoCapture(a.video);fps=c.get(5);n=int(c.get(7));W,H=int(c.get(3)),int(c.get(4));dur=n/fps
sha=hashlib.sha256(open(a.video,'rb').read()).hexdigest()
def run(cmd,what):
    t=time.perf_counter();r=subprocess.run(cmd,capture_output=True,text=True);took[what]=round(time.perf_counter()-t,1)
    if r.returncode:sys.exit(f'{what} failed:\n'+r.stderr[-2000:])
shots_json=root/'shots.json';run([py,'authoring/render/shots.py',a.video,'0',f'{dur-.05:.3f}',str(shots_json)],'shots')
speech=[]
if os.path.exists(a.whisper_model):
    t=time.perf_counter();wav=root/'audio.wav';subprocess.run(['ffmpeg','-loglevel','error','-y','-i',a.video,'-vn','-ar','16000','-ac','1',str(wav)],capture_output=True)  # a video with no sound track gives no wav: no speech times
    if wav.exists():subprocess.run(['whisper-cli','-m',a.whisper_model,'-f',str(wav),'-np','-oj','-of',str(root/'speech')],capture_output=True)
    try:speech=[[x['offsets']['from']/1000,x['offsets']['to']/1000] for x in json.load(open(root/'speech.json'))['transcription'] if x['text'].strip() and not x['text'].strip().startswith(('[','('))]
    except Exception:speech=[]
    for f in (wav,root/'speech.json'):f.unlink(missing_ok=True)  # times only: the words are not kept
    json.dump(speech,open(root/'speech-times.json','w'));took['speech']=round(time.perf_counter()-t,1)
need=root/'control.json';run([py,'authoring/render/control-need.py',a.video,str(shots_json),str(need)]+(['--speech',str(root/'speech-times.json')] if speech else []),'control')
rows=json.load(open(need))['shots']
for r in rows:  # a thumbnail per shot: its middle frame
    c.set(cv2.CAP_PROP_POS_MSEC,(r['start']+r['end'])/2*1000);ok,f=c.read()
    if ok:cv2.imwrite(str(root/('shot-%03d.jpg'%r['index'])),cv2.resize(f,(480,round(480*H/W))),[cv2.IMWRITE_JPEG_QUALITY,85])
    r['thumb']='shot-%03d.jpg'%r['index'];r['speechWindows']=[[round(max(s,r['start']),2),round(min(e,r['end']),2)] for s,e in speech if e>r['start'] and s<r['end']]
# an off stretch of at most --bridge seconds between two on-shots belongs to the action around it (a grab between fast fight
# cuts measures slow): it joins the sequence and is marked bridged
on=[r['control']=='on' for r in rows];i=0
while i<len(rows):
    if on[i]:i+=1;continue
    j=i
    while j<len(rows) and not on[j]:j+=1
    if 0<i and j<len(rows) and rows[j-1]['end']-rows[i]['start']<=a.bridge:
        for r in rows[i:j]:r['bridged']=True
    i=j
clips=[];run_=[]
def close_run():
    global run_
    if not run_:return
    group=[]
    for r in run_:
        if group and r['end']-group[0]['start']>a.max:clips.append(('control',group));group=[]
        group.append(r)
    if group:clips.append(('control',group))
    run_=[]
for r in rows:
    if r['control']=='on' or r.get('bridged'):run_.append(r)
    else:close_run();clips.append(('still',[r]))
close_run()
out=[]
for kind,g in clips:
    s,e=g[0]['start'],g[-1]['end'];pieces=[(s,e)] if kind=='still' or e-s<=a.max+1e-6 else [(t,min(e,t+a.max)) for t in [s+i*a.max for i in range(int((e-s)//a.max)+1)] if min(e,t+a.max)-t>.5]
    for ps,pe in pieces:
        out.append(dict(id='%s-%03d'%(a.id,len(out)+1),kind=kind,shots=[r['index'] for r in g if r['end']>ps and r['start']<pe],start=round(ps,3),end=round(pe,3),seconds=round(pe-ps,2),
            why=sorted({w for r in g for w in r['why'] if r['control']=='on'}|({'bridged: slow shots inside the sequence'} if any(r.get('bridged') for r in g) else set())),status='proposed',described=False))
src=dict(id=a.id,name=a.name or pathlib.Path(a.video).stem,file=os.path.abspath(a.video),fileName=pathlib.Path(a.video).name,sha256=sha,duration=round(dur,3),fps=round(fps,3),size=[W,H],
    ingested=time.strftime('%Y-%m-%dT%H:%M:%S'),shots=rows,speechFound=bool(speech),clips=out,rule='docs/SHOT_TO_CLAY_PLAN.md, "When a shot needs a control video"',seconds=dict(took,total=round(time.perf_counter()-began,1)))
json.dump(src,open(root/'source.json','w'),indent=1);shots_json.unlink(missing_ok=True)
on=[x for x in out if x['kind']=='control']
print(json.dumps(dict(source=a.id,shots=len(rows),shotsOn=sum(r['control']=='on' for r in rows),controlClips=[(x['id'],x['start'],x['end'],x['shots']) for x in on],stillEntries=len(out)-len(on),seconds=src['seconds'])))
