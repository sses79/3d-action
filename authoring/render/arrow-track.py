"""ARROW point tracks for seeds given as fractions of the frame (a test for the depth library's people step).
  (on mini4, in ~/Yun/arrow-runner, ARROW installed with uv sync and its weights in weights/)
  uv run python arrow-track.py VIDEO SEEDS.json OUT.json [--stride 3] [--max-frames 24] [--max-side 504] [--device mps]
SEEDS.json: {"name": [[fx, fy], ...]} in the first selected frame. OUT.json: frames (source frame indices), per name per seed
per frame [fx, fy, visible probability], and seconds (load, encode+decode)."""
import sys,json,time,argparse,torch
from arrow import ARROW
from arrow.infer import infer,load_input
from arrow.tasks.tracking import tracking_predictions
p=argparse.ArgumentParser();p.add_argument('video');p.add_argument('seeds');p.add_argument('out');p.add_argument('--stride',type=int,default=3);p.add_argument('--max-frames',type=int,default=24);p.add_argument('--max-side',type=int,default=504);p.add_argument('--device',default='auto');p.add_argument('--checkpoint',default='weights');a=p.parse_args()
t0=time.time();model=ARROW.from_pretrained(a.checkpoint,device=a.device);t1=time.time()
obs=load_input(a.video,stride=a.stride,max_frames=a.max_frames,max_side=a.max_side)
fi=obs.frame_info
seeds=json.load(open(a.seeds));names=[];pts=[]
for n,v in seeds.items():
    for q in v:names.append(n);pts.append(q)
import subprocess;W,H=map(float,subprocess.run(['ffprobe','-v','error','-select_streams','v','-show_entries','stream=width,height','-of','csv=p=0',a.video],capture_output=True,text=True).stdout.strip().split(','))
xy=torch.tensor([[x*W,y*H] for x,y in pts]);src=torch.zeros(len(pts),dtype=torch.long);xy=obs.transform_points(xy,src)
t2=time.time();res,_=infer(model,obs,tasks=['track'],xy=xy,source_frame=src);t3=time.time()
tr=tracking_predictions(res);uv=tr.uv[0];vis=torch.sigmoid(tr.visibility_logits[0])  # [seed, target, 2]
# uv: target-frame fractions of the model image; back to original pixels through each frame's original_to_input (A x + b)
img=obs.images;h_,w_=img.shape[-2:];out={'frames':[f.get('index',i) for i,f in enumerate(fi)],'seconds':{'load_model':round(t1-t0,1),'infer':round(t3-t2,1)},'frame_count':len(fi),'size':[w_,h_],'tracks':{}}
for i,n in enumerate(names):
    row=[]
    for k in range(uv.shape[1]):
        T=torch.tensor(fi[k]['original_to_input'],dtype=torch.float64);A,b=T[:2,:2],T[:2,2];o=torch.linalg.solve(A,torch.tensor([float(uv[i,k,0])*w_-.5,float(uv[i,k,1])*h_-.5],dtype=torch.float64)-b)
        row.append([round(float(o[0])/W,4),round(float(o[1])/H,4),round(float(vis[i,k]),3)])
    out['tracks'].setdefault(n,[]).append(row)
json.dump(out,open(a.out,'w'));print(json.dumps(out['seconds']),out['frame_count'],'frames')
