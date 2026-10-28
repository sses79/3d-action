"""Find people by the word "person" with SAM 3's detector in chosen frames of a video, for depth-missed.py (people the pose
detector misses: a dark back filling the frame, a head cut off). Run with ComfyUI's Python:
  .authoring/comfyui/.venv/bin/python authoring/render/sam3-people.py .authoring/comfyui VIDEO OUT.json T1,T2,... [--threshold 0.4]
T: source seconds. OUT.json: {video, frames: [{t, size [W, H], people: [{box [x0,y0,x1,y1] fractions, area (of the picture), fill (of its box)}]}]};
OUT.npz beside it: each person's outline at 240 px wide (m<frame>_<person>). About 7 s a frame on this Mac (the model works at 1008 px).
Up to 10 people a frame (ComfyUI's node keeps one per prompt unless asked); a dark frame (mean under 0.2) is brightened first."""
import sys,os,json,time
comfy_dir,video,out=os.path.abspath(sys.argv[1]),sys.argv[2],os.path.abspath(sys.argv[3]);times=sorted(float(x) for x in sys.argv[4].split(','));TH=float(next((sys.argv[i+1] for i,a in enumerate(sys.argv) if a=='--threshold'),.4))
import numpy as np
sys.argv=[sys.argv[0]];sys.path.insert(0,comfy_dir);os.chdir(comfy_dir)
import torch,av
import comfy.sd,folder_paths
from comfy_extras.nodes_sam3 import SAM3_Detect
from nodes import CLIPTextEncode
t0=time.perf_counter();model,clip=comfy.sd.load_checkpoint_guess_config(folder_paths.get_full_path_or_raise('checkpoints','sam3.1_multiplex_fp16.safetensors'),output_vae=False,output_clip=True)[:2];cond=CLIPTextEncode().encode(clip,'person')[0];cond=[[cond[0][0],{**cond[0][1],'sam3_multi_cond':[dict(cond=cond[0][0],attention_mask=cond[0][1].get('attention_mask'),max_detections=10)]}]];load=time.perf_counter()-t0
c=av.open(video);s=c.streams.video[0];res=[];masks={};t1=time.perf_counter()
for t in times:
    c.seek(int(max(0,t-1)/s.time_base),stream=s);f=None
    for f_ in c.decode(s):
        if f_.time is not None and f_.time>=t-.5/float(s.average_rate):f=f_;break
    if f is None:res.append(dict(t=t,people=[]));continue
    a=f.to_ndarray(format='rgb24');H,W=a.shape[:2]
    x=a.astype(np.float32)/255;x=x**.45 if x.mean()<.2 else x  # a dark scene brightened (gamma 0.45): a dark back on a dark wall was not found as it was
    with torch.no_grad():m=SAM3_Detect.execute(model,torch.from_numpy(x)[None],conditioning=cond,threshold=TH,refine_iterations=0,individual_masks=True).result[0]
    m=np.asarray(m.cpu())>.5;m=m.reshape(-1,*m.shape[-2:]);people=[]
    for i in range(m.shape[0]):
        ys,xs=np.nonzero(m[i])
        if len(xs)<20:continue
        mh,mw=m[i].shape;b=[xs.min()/mw,ys.min()/mh,(xs.max()+1)/mw,(ys.max()+1)/mh];area=len(xs)/(mw*mh)
        masks[f'm{len(res)}_{len(people)}']=torch.nn.functional.interpolate(torch.from_numpy(m[i])[None,None].float(),size=(round(240*H/W),240),mode='nearest')[0,0].numpy()>.5
        people.append(dict(box=[round(float(v),4) for v in b],area=round(float(area),4),fill=round(float(area/max(1e-9,(b[2]-b[0])*(b[3]-b[1]))),3)))
    res.append(dict(t=round(float(f.time),4),size=[W,H],people=people));print(round(float(f.time),2),[(p['box'],p['area']) for p in people],flush=True)
np.savez_compressed(os.path.splitext(out)[0]+'.npz',**masks)
json.dump(dict(video=video,threshold=TH,frames=res,seconds=dict(load=round(load,1),frames=round(time.perf_counter()-t1,1))),open(out,'w'))
