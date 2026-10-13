"""Follow chosen people (or things named in words) through a video window with SAM 3's video tracker, through ComfyUI's nodes.
Run with ComfyUI's Python:
  .authoring/comfyui/.venv/bin/python authoring/render/sam3-track.py .authoring/comfyui VIDEO START END OUT.json name:time:x:y [name:time:x:y ...] [--text=basketball] [--width=1280]
A point (video seconds, pixels of the original picture) picks the person under it in that frame; the tracker then carries that
person's outline forward to the end of the window and backward to its start, remembering what they look like. Several points
at one time are followed together. --text follows whatever the words name, found by the model itself (for a ball).
OUT.json: for each name, per frame of the window, the outline's box in original pixels and its area; frames where the
tracker has no outline are left out. Weights: sam3.1_multiplex_fp16.safetensors in .authoring/comfyui/models/checkpoints.
Frames are scaled to --width before tracking (the model works at 1008 px anyway; full 1080p frames for a few seconds do not fit in memory)."""
import sys,os,json,time
comfy_dir,video,start,end,out=os.path.abspath(sys.argv[1]),os.path.abspath(sys.argv[2]),float(sys.argv[3]),float(sys.argv[4]),os.path.abspath(sys.argv[5])
seeds=[a.split(':') for a in sys.argv[6:] if not a.startswith('--')];text=next((a.split('=',1)[1] for a in sys.argv if a.startswith('--text=')),None);width=int(next((a.split('=')[1] for a in sys.argv if a.startswith('--width=')),1280))
import numpy as np
sys.argv=[sys.argv[0]];sys.path.insert(0,comfy_dir);os.chdir(comfy_dir)
import torch,av
import comfy.sd,comfy.model_management as mm,folder_paths
from comfy_extras.nodes_sam3 import SAM3_Detect,SAM3_VideoTrack
from comfy.ldm.sam3.tracker import unpack_masks
c=av.open(video);s=c.streams.video[0];c.seek(int(max(0,start-1)/s.time_base),stream=s);frames=[];times=[];W0=H0=None
for f in c.decode(s):
    if f.time is None or f.time<start-1e-3:continue
    if f.time>end+1e-3:break
    a=f.to_ndarray(format='rgb24');H0,W0=a.shape[:2];h=round(H0*width/W0);frames.append(np.asarray(f.reformat(width=width,height=h).to_ndarray(format='rgb24')));times.append(float(f.time))
scale=W0/width;images=torch.from_numpy(np.stack(frames).astype(np.float32)/255);N=len(frames);print('frames',N,'at',images.shape[2],'x',images.shape[1],'device',mm.get_torch_device(),flush=True)
t0=time.perf_counter();model,clip=comfy.sd.load_checkpoint_guess_config(folder_paths.get_full_path_or_raise('checkpoints','sam3.1_multiplex_fp16.safetensors'),output_vae=False,output_clip=True)[:2];print('loaded',round(time.perf_counter()-t0,1),'s',flush=True)
def boxes(masks):  # [frames, h, w] -> per frame box in original pixels and area, or None
    res=[]
    for m in masks:
        ys,xs=np.nonzero(m)
        if len(xs)<20:res.append(None);continue
        kx,ky=W0/m.shape[1],H0/m.shape[0];res.append(dict(box=[float(xs.min()*kx),float(ys.min()*ky),float((xs.max()+1)*kx),float((ys.max()+1)*ky)],area=float(len(xs)*kx*ky)))
    return res
def run(imgs,init=None,cond=None,max_objects=0):
    with torch.no_grad():r=SAM3_VideoTrack.execute(imgs,model,initial_mask=init,conditioning=cond,max_objects=max_objects).result[0]
    p=r['packed_masks']
    return None if p is None else [np.asarray(unpack_masks(p[:,i]).cpu())>0 for i in range(p.shape[1])]
# With starting outlines the tracker here gives good outlines for seven frames and then none at all (found 2026-10-13 on this
# Mac, at half and at full precision, with one object or two; the cause in ComfyUI's tracker was not found). So it is run in
# hops of six frames, each started from the outlines the last one ended on. An object whose outline is lost keeps its last one
# as the start of the next hop, in case it shows again.
HOP=6
def track(imgs,init):
    n=len(imgs);outs=[[None]*n for _ in range(init.shape[0])];a=0;cur=init.clone()
    while a<n-1 or a==0:
        ms=run(imgs[a:a+HOP+1],cur)
        if ms is None:break
        for i,m in enumerate(ms[:init.shape[0]]):
            for j in range(len(m)):
                if outs[i][a+j] is None or j>0:outs[i][a+j]=m[j]
            last=m[min(HOP,len(m)-1)]
            if last.sum()>=20:cur[i]=torch.nn.functional.interpolate(torch.from_numpy(last[None,None].astype(np.float32)),size=cur.shape[1:],mode='nearest')[0,0]
        a+=HOP
        if a>=n-1:break
    empty=np.zeros((8,8),bool);return [np.stack([m if m is not None else np.zeros_like(next(x for x in o if x is not None)) for m in o]) for o in outs]
result={}
for t in sorted({float(x[1]) for x in seeds}):
    mine=[x for x in seeds if float(x[1])==t];k0=int(np.argmin(np.abs(np.array(times)-t)));init=[]
    for name,_,x,y in mine:
        with torch.no_grad():m=SAM3_Detect.execute(model,images[k0:k0+1],positive_coords=json.dumps([{'x':float(x)/scale,'y':float(y)/scale}])).result[0]
        init.append(m[0] if m.dim()==3 else m);print(name,'outline at the point:',int((m>0.5).sum()),'px',flush=True)
    init=torch.stack(init).float();a=time.perf_counter();fwd=track(images[k0:],init);back=track(images[:k0+1].flip(0),init) if k0>0 else None;print('tracked from',round(times[k0],2),'s in',round(time.perf_counter()-a,1),'s',flush=True)
    for i,(name,_,_,_) in enumerate(mine):
        per=[None]*N
        if fwd is not None and i<len(fwd):
            for j,b in enumerate(boxes(fwd[i])):per[k0+j]=b
        if back is not None and i<len(back):
            for j,b in enumerate(boxes(back[i])):
                if j>0:per[k0-j]=b
        result.setdefault(name,[]).append((k0,per))
final={}
for name,runs in result.items():  # several points for one name: each frame takes the run whose point is nearest in time
    final[name]=[min(runs,key=lambda r:abs(r[0]-k))[1][k] for k in range(N)]
if text:
    from nodes import CLIPTextEncode
    cond=CLIPTextEncode().encode(clip,text)[0];a=time.perf_counter();found=run(images,None,cond,max_objects=4);print('text',repr(text),'objects',0 if found is None else len(found),'in',round(time.perf_counter()-a,1),'s',flush=True)
    for i,m in enumerate(found or []):final[f'{text} {i+1}']=boxes(m)
json.dump(dict(video=video,start=start,end=end,times=times,size=[W0,H0],tracks=final),open(out,'w'));print({n:sum(1 for b in v if b) for n,v in final.items()},'of',N,'frames')
