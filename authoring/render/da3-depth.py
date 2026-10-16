"""Depth per frame of a video window with Depth Anything 3 (Base, single-image mode) through ComfyUI's nodes, for depth-tint.py.
Run with ComfyUI's Python:  .authoring/comfyui/.venv/bin/python authoring/render/da3-depth.py .authoring/comfyui VIDEO START END OUT.npz [--res 504] [--batch 8]
Much quicker on this Mac than Video Depth Anything (which took minutes per 32 frames); each frame is estimated alone, so the
depth can flicker a little from frame to frame. OUT.npz: depth [frames, h, w] (metres-like, larger is further), times."""
import sys,os,time
comfy,video,start,end,out=os.path.abspath(sys.argv[1]),os.path.abspath(sys.argv[2]),float(sys.argv[3]),float(sys.argv[4]),os.path.abspath(sys.argv[5])
opt=lambda k,d:next((sys.argv[i+1] for i,a in enumerate(sys.argv) if a=='--'+k),d);res=int(opt('res',504));batch=int(opt('batch',8))
import numpy as np
sys.argv=[sys.argv[0]];sys.path.insert(0,comfy);os.chdir(comfy)
import torch,av
import comfy.model_management as mm
from comfy_extras.nodes_depth_anything_3 import LoadDA3Model,DA3Inference
c=av.open(video);s=c.streams.video[0];c.seek(int(max(0,start-1)/s.time_base),stream=s);frames=[];times=[];fps=float(s.average_rate)
for f in c.decode(s):
    if f.time is None or f.time<start-.5/fps:continue
    if f.time>=end-.5/fps:break
    frames.append(f.to_ndarray(format='rgb24'));times.append(float(f.time))
model=LoadDA3Model.execute('depth_anything_3_base.safetensors','fp32').result[0];a=time.perf_counter();depth=[]
for i in range(0,len(frames),batch):
    with torch.no_grad():g=DA3Inference.execute(model,torch.from_numpy(np.stack(frames[i:i+batch]).astype(np.float32)/255),res,'upper_bound_resize',{'mode':'mono'}).result[0]
    d=g['depth'];d=np.asarray(d.float().cpu());depth+=list(d.reshape(-1,*d.shape[-2:]));print(len(depth),'of',len(frames),round(time.perf_counter()-a,1),'s',flush=True)
np.savez_compressed(out,depth=np.stack(depth).astype(np.float32),times=np.array(times));print('device',mm.get_torch_device(),'frames',len(depth),'shape',np.stack(depth).shape,'seconds',round(time.perf_counter()-a,1))
