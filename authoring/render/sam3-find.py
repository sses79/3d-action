"""Find something small by name (a ball) in the frames of a video window, near a followed person, with SAM 3's detector.
Run with ComfyUI's Python:
  .authoring/comfyui/.venv/bin/python authoring/render/sam3-find.py .authoring/comfyui VIDEO BOXES.json NAME OUT.json [frames, e.g. 0,2,4] [crop side px, default 420] [--text=basketball]
BOXES.json is sam3-track.py's result and NAME the person in it to look around: each frame is cropped to a square around
that person's box (the model works at 1008 px, where a ball in a wide shot would be a few pixels) and searched for the
words. OUT.json: {frames: [{k, t, found: [{centre, size (pixels of the original picture), fill (of its box), hsv (mean
colour at its middle)}]}]}; every candidate is kept, court-ball.py chooses. About 7 s a frame on this Mac, so every
second frame is enough. Limit: a ball that leaves the crop (a long pass) is not seen. REFINE=n sets the decoder's passes."""
import sys,os,json,time
comfy_dir,video,boxes,name,out=os.path.abspath(sys.argv[1]),sys.argv[2],json.load(open(sys.argv[3])),sys.argv[4],os.path.abspath(sys.argv[5]);TEXT=next((a.split('=',1)[1] for a in sys.argv if a.startswith('--text=')),'basketball');rest=[a for a in sys.argv[6:] if not a.startswith('--')];only=[int(x) for x in rest[0].split(',')] if rest and rest[0] else None;SIDE=int(rest[1]) if len(rest)>1 else 420
import numpy as np,colorsys
def hsv(patch):  # mean colour as hue 0-180, saturation and value 0-255
    h,s,v=colorsys.rgb_to_hsv(*(patch.reshape(-1,3).mean(0)/255));return [round(h*180),round(s*255),round(v*255)]
REFINE=int(os.environ.get("REFINE","0"))
sys.argv=[sys.argv[0]];sys.path.insert(0,comfy_dir);os.chdir(comfy_dir)
import torch,av
import comfy.sd,comfy.model_management as mm,folder_paths
from comfy_extras.nodes_sam3 import SAM3_Detect
from nodes import CLIPTextEncode
model,clip=comfy.sd.load_checkpoint_guess_config(folder_paths.get_full_path_or_raise('checkpoints','sam3.1_multiplex_fp16.safetensors'),output_vae=False,output_clip=True)[:2];cond=CLIPTextEncode().encode(clip,TEXT)[0]
c=av.open(video);s=c.streams.video[0];start,end=boxes['start'],boxes['end'];c.seek(int(max(0,start-1)/s.time_base),stream=s);res=[];k=-1;t0=time.perf_counter()
for f in c.decode(s):
    if f.time is None or f.time<start-1e-3:continue
    if f.time>end+1e-3:break
    k+=1
    if k>=len(boxes['times']):break
    if only and k not in only:continue
    b=boxes['tracks'][name][k]
    if not b:res.append(dict(k=k,t=float(f.time),found=[]));continue
    a_=a=f.to_ndarray(format='rgb24');H,W=a.shape[:2];bx=b['box'];cx,cy=(bx[0]+bx[2])/2,(bx[1]+bx[3])/2-.15*(bx[3]-bx[1]);x0=int(min(max(cx-SIDE/2,0),W-SIDE));y0=int(min(max(cy-SIDE/2,0),H-SIDE));crop=torch.from_numpy(a[y0:y0+SIDE,x0:x0+SIDE].astype(np.float32)/255)[None]
    with torch.no_grad():r=SAM3_Detect.execute(model,crop,conditioning=cond,threshold=.3,refine_iterations=REFINE,individual_masks=True).result
    m=np.asarray(r[0].cpu())>.5;found=[]
    for i in range(m.shape[0]):
        ys,xs=np.nonzero(m[i])
        if len(xs)<6:continue
        sx,sy=SIDE/m.shape[2],SIDE/m.shape[1];w,h=(xs.max()-xs.min()+1)*sx,(ys.max()-ys.min()+1)*sy;x,y=int(x0+xs.mean()*sx),int(y0+ys.mean()*sy);r=max(2,int(min(w,h)/4));found.append(dict(centre=[float(x0+xs.mean()*sx),float(y0+ys.mean()*sy)],size=[float(w),float(h)],fill=float(len(xs)*sx*sy/(w*h)),hsv=hsv(a_[max(0,y-r):y+r+1,max(0,x-r):x+r+1].astype(float))))
    res.append(dict(k=k,t=float(f.time),found=found));print(k,round(float(f.time),2),[(round(q['centre'][0]),round(q['centre'][1]),round(q['size'][0]),round(q['size'][1]),round(q['fill'],2)) for q in found],flush=True)
print('seconds per frame',round((time.perf_counter()-t0)/max(1,len(res)),2));json.dump(dict(video=video,start=start,end=end,frames=res),open(out,'w'))
