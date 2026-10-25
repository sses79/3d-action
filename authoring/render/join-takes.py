"""Join a new take to the take it continues (docs/DEPTH_SERVICE_PLAN.md, step 3), as the V.8 final fight was made from takes 2069 and 1215.
  .authoring/vision-venv/bin/python authoring/render/join-takes.py PREVIOUS NEW OUT.mp4 --at SECONDS --from SECONDS
The previous take up to --at (its own cut, where the new take's lead frame came from) and the new take from --from (its first cut
after the lead, not the lead frame: a generated first frame drifts in light and framing), both with their sound, re-encoded at the
previous take's size and frame rate. Prints {out, duration, joinDifference}: the mean grey difference between the two frames that meet,
with a warning when the join is not on a cut of the new take and the frames differ visibly."""
import sys,json,argparse,subprocess,cv2,numpy as np
p=argparse.ArgumentParser();p.add_argument('previous');p.add_argument('new');p.add_argument('out');p.add_argument('--at',type=float,required=True);p.add_argument('--from',dest='start',type=float,default=0.);p.add_argument('--on-cut',action='store_true');a=p.parse_args()
def probe(f):
    r=json.loads(subprocess.run(['ffprobe','-v','error','-show_entries','stream=codec_type,width,height,avg_frame_rate','-of','json',f],capture_output=True,text=True,check=True).stdout)['streams']
    v=next(s for s in r if s['codec_type']=='video');n,d=v['avg_frame_rate'].split('/');return int(v['width']),int(v['height']),float(n)/float(d),any(s['codec_type']=='audio' for s in r)
W,H,fps,pa=probe(a.previous);_,_,_,na=probe(a.new)
def frame(f,t):c=cv2.VideoCapture(f);c.set(cv2.CAP_PROP_POS_MSEC,max(0,t)*1000);ok,x=c.read();return cv2.resize(x,(320,180)) if ok else None
x,y=frame(a.previous,a.at-1/fps),frame(a.new,a.start);diff=round(float(np.abs(x.astype(int)-y.astype(int)).mean()),1) if x is not None and y is not None else None
vf=f'scale={W}:{H},fps={fps:.6f},setsar=1'
fc=f"[0:v]trim=end={a.at},setpts=PTS-STARTPTS,{vf}[v0];[1:v]trim=start={a.start},setpts=PTS-STARTPTS,{vf}[v1];"
if pa and na:fc+=f"[0:a]atrim=end={a.at},asetpts=PTS-STARTPTS[a0];[1:a]atrim=start={a.start},asetpts=PTS-STARTPTS[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]";maps=['-map','[v]','-map','[a]','-c:a','aac','-b:a','192k']
else:fc+="[v0][v1]concat=n=2:v=1:a=0[v]";maps=['-map','[v]']
subprocess.run(['ffmpeg','-v','error','-y','-i',a.previous,'-i',a.new,'-filter_complex',fc,*maps,'-c:v','libx264','-crf','16','-pix_fmt','yuv420p',a.out],check=True)
dur=float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',a.out],capture_output=True,text=True).stdout.strip() or 0)
warn=[] if a.on_cut or diff is None or diff<8 else [f'the frames that meet differ by {diff} grey levels and the join is not on a cut of the new take: it will show as a jump; join at the new take\'s first cut instead']
print(json.dumps({'out':a.out,'duration':round(dur,3),'joinDifference':diff,'warnings':warn,'audio':bool(pa and na)}))
