"""Depth Anything 3 on whichever machine is free (docs/DEPTH_SERVICE_PLAN.md, step 4): mini4 (an M4, the faster of the two) when it
answers, this Mac otherwise, with the same output as da3-depth.py.
  .authoring/vision-venv/bin/python authoring/render/da3-run.py VIDEO START END OUT.npz [--save-width 960] [--where auto|local|mini4]
  .authoring/vision-venv/bin/python authoring/render/da3-run.py --setup     copy the model and da3-depth.py to mini4 (once; again after either changes)
mini4: only the window is sent (cut here at 960 wide), da3-depth.py runs in ~/Yun/sam3d-runner (its ComfyUI, the same commit as ours),
the depth comes back and its times are moved to the source's. A failure there runs it here instead, so a job never fails for the
worker's sake. --where (or DEPTH_WORKER) forces one. Each run adds a line to .authoring/logs/workers.jsonl (where, seconds, frames),
which /api/health reads."""
import sys,os,json,time,shutil,argparse,subprocess,tempfile,hashlib
import numpy as np
root=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HOST=os.environ.get('DEPTH_WORKER_HOST','tim@mini4.local');RUNNER='Yun/sam3d-runner';SSH=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=4',HOST]
MODEL=os.path.join(root,'.authoring/comfyui/models/geometry_estimation/depth_anything_3_base.safetensors');SCRIPT=os.path.join(root,'authoring/render/da3-depth.py')
CUT='''import sys,json,av
from fractions import Fraction
v,start,end,out,tj=sys.argv[1],float(sys.argv[2]),float(sys.argv[3]),sys.argv[4],sys.argv[5]
c=av.open(v);s=c.streams.video[0];c.seek(int(max(0,start-1)/s.time_base),stream=s);fps=float(s.average_rate);o=av.open(out,'w');t=None;times=[]
for f in c.decode(s):
    if f.time is None or f.time<start-.5/fps:continue
    if f.time>=end-.5/fps:break
    if t is None:t=o.add_stream('libx264',rate=30);t.width=960;t.height=int(round(f.height*960/f.width/2)*2);t.pix_fmt='yuv420p';t.options={'crf':'12'}
    g=f.reformat(width=t.width,height=t.height,format='yuv420p');g.pts=len(times);g.time_base=Fraction(1,30)  # numbered from 0: the clip starts at 0
    for p in t.encode(g):o.mux(p)
    times.append(float(f.time))
for p in t.encode():o.mux(p)
o.close();json.dump(times,open(tj,'w'))'''
def remote(cmd,timeout=60,**kw):return subprocess.run(SSH+[cmd],capture_output=True,text=True,timeout=timeout,**kw)
def digest(f):h=hashlib.sha256();h.update(open(f,'rb').read());return h.hexdigest()[:16]
def ready():  # mini4 answers, has the model and the same script
    try:r=remote(f'test -s {RUNNER}/comfyui/models/geometry_estimation/depth_anything_3_base.safetensors && shasum -a 256 {RUNNER}/depth-jobs/da3-depth.py',timeout=8)
    except Exception:return False,'no answer'
    if r.returncode==255:return False,'no answer'
    if r.returncode:return False,'not set up (run da3-run.py --setup)'
    same=r.stdout.split()[0][:16]==digest(SCRIPT);return same,'' if same else 'script differs (run da3-run.py --setup)'
def log(**e):
    os.makedirs(os.path.join(root,'.authoring/logs'),exist_ok=True)
    with open(os.path.join(root,'.authoring/logs/workers.jsonl'),'a') as f:f.write(json.dumps({'at':time.strftime('%Y-%m-%dT%H:%M:%S'),'stage':'depth-anything-3',**e})+'\n')
if '--setup' in sys.argv:
    remote(f'mkdir -p {RUNNER}/comfyui/models/geometry_estimation {RUNNER}/depth-jobs',check=True)
    for src,dst in ((MODEL,f'{RUNNER}/comfyui/models/geometry_estimation/'),(SCRIPT,f'{RUNNER}/depth-jobs/')):subprocess.run(['rsync','-a','--partial','-e','ssh -o BatchMode=yes',src,f'{HOST}:{dst}'],check=True)
    print(json.dumps({'setup':HOST,'ready':ready()[0]}));sys.exit()
p=argparse.ArgumentParser();p.add_argument('video');p.add_argument('start',type=float);p.add_argument('end',type=float);p.add_argument('out');p.add_argument('--save-width',default='960');p.add_argument('--where',default=os.environ.get('DEPTH_WORKER','auto'));a=p.parse_args()
def local():
    t0=time.perf_counter();subprocess.run([os.path.join(root,'.authoring/comfyui/.venv/bin/python'),SCRIPT,os.path.join(root,'.authoring/comfyui'),a.video,str(a.start),str(a.end),a.out,'--save-width',a.save_width],check=True,stdout=subprocess.DEVNULL)
    return time.perf_counter()-t0
def on_mini4():
    t0=time.perf_counter();job=f'job-{os.getpid()}-{int(time.time())}';rd=f'{RUNNER}/depth-jobs/{job}'
    with tempfile.TemporaryDirectory() as td:
        clip=os.path.join(td,'clip.mp4');out=os.path.join(td,'out.npz')
        tj=os.path.join(td,'times.json')  # exactly the frames da3-depth.py would read here (PyAV, as it picks them), with their times kept here
        subprocess.run([os.path.join(root,'.authoring/comfyui/.venv/bin/python'),'-c',CUT,a.video,str(a.start),str(a.end),clip,tj],check=True)
        T=json.load(open(tj))
        remote(f'mkdir -p {rd}',check=True);subprocess.run(['scp','-q','-o','BatchMode=yes',clip,f'{HOST}:{rd}/clip.mp4'],check=True)
        r=remote(f'cd {RUNNER} && comfyui/.venv/bin/python depth-jobs/da3-depth.py comfyui depth-jobs/{job}/clip.mp4 0 {a.end-a.start+.05:.3f} depth-jobs/{job}/out.npz --save-width {a.save_width}',timeout=3600)
        if r.returncode:raise RuntimeError((r.stderr or r.stdout)[-800:])
        subprocess.run(['scp','-q','-o','BatchMode=yes',f'{HOST}:{rd}/out.npz',out],check=True);remote(f'rm -rf {rd}')
        z=dict(np.load(out))
        if len(z['times'])!=len(T):raise RuntimeError(f"mini4 returned {len(z['times'])} frames for {len(T)}")
        z['times']=np.asarray(T);np.savez(a.out,**z)  # each depth frame gets the source time of the frame it was made from
    return time.perf_counter()-t0
where=a.where;why=''
if where=='auto':ok,why=ready();where='mini4' if ok else 'local'
if where=='mini4':
    try:s=on_mini4()
    except Exception as e:why=f'mini4 failed ({str(e)[-200:]}); ran here';where='local';s=local()
else:s=local()
n=len(np.load(a.out)['times']);log(where=where,seconds=round(s,1),frames=n,window=[a.start,a.end],note=why or None)
print(json.dumps({'worker':where,'seconds':round(s,1),'frames':n,'note':why or None}))
