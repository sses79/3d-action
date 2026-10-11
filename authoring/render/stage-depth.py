"""Trial: Depth Anything 3 (Base) on several frames of one shot through ComfyUI's nodes: depth and a camera per frame. Scratch."""
import sys,os,json,time
comfy,video,out=os.path.abspath(sys.argv[1]),os.path.abspath(sys.argv[2]),os.path.abspath(sys.argv[3]);times=[float(x) for x in sys.argv[4].split(',')];res=int(sys.argv[5]) if len(sys.argv)>5 else 504
import numpy as np
sys.argv=[sys.argv[0]]+(['--cpu'] if os.environ.get('DA3_CPU') else []);sys.path.insert(0,comfy);os.chdir(comfy)
import torch,av
import comfy.model_management as mm
from comfy_extras.nodes_depth_anything_3 import LoadDA3Model,DA3Inference
c=av.open(video);s=c.streams.video[0];c.seek(int(max(0,times[0]-1)/s.time_base),stream=s);frames=[];want=list(times)
for f in c.decode(s):
    if want and f.time>=want[0]-1e-3:frames.append(f.to_ndarray(format='rgb24'));want.pop(0)
    if not want:break
print('device',mm.get_torch_device(),'frames',len(frames),flush=True)
model=LoadDA3Model.execute('depth_anything_3_base.safetensors',os.environ.get('DA3_DTYPE','fp32')).result[0];a=time.perf_counter()
with torch.no_grad():g=DA3Inference.execute(model,torch.from_numpy(np.stack(frames).astype(np.float32)/255),res,'upper_bound_resize',{'mode':'multiview','ref_view_strategy':os.environ.get('DA3_REF','first'),'pose_method':os.environ.get('DA3_POSE','cam_dec')}).result[0]
print('inference',round(time.perf_counter()-a,1),'s',{k:(tuple(v.shape) if hasattr(v,'shape') else v) for k,v in g.items()},flush=True)
np.savez_compressed(out,times=np.array(times),frames=np.stack(frames),**{k:np.asarray(v.float().cpu()) for k,v in g.items() if hasattr(v,'shape') and k!='image'});print('saved',out)
