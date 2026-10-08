"""Trial: run ComfyUI's built-in SAM 3D Body nodes headless on frames of one catalog clip, with our own person boxes."""
import sys,json,time,os
comfy_dir,pose_path,video,out,limit=sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4],int(sys.argv[5])
sys.argv=[sys.argv[0]];sys.path.insert(0,comfy_dir);os.chdir(comfy_dir)
import numpy as np,torch,av
started=time.perf_counter()
import comfy.model_management as mm
from comfy_extras.nodes_sam3d_body import SAM3DBody_Loader,SAM3DBody_Predict
# The Mac GPU has no 64-bit floats, which the rig's joint walk asks for. Run just that walk on the CPU; ComfyUI's files are untouched.
import comfy.ldm.sam3d_body.mhr.mhr_rig as rig
_walk=rig._global_skel_state_from_local
rig._global_skel_state_from_local=lambda local,levels:_walk(local.cpu(),[(a.cpu(),b.cpu()) for a,b in levels]).to(local.device) if local.device.type=='mps' else _walk(local,levels)
print('device',mm.get_torch_device(),'imports',round(time.perf_counter()-started,1),flush=True)
pose=json.load(open(pose_path));rows=[f for f in pose['frames'] if f['bbox']]
if limit:rows=rows[::max(1,len(rows)//limit)][:limit]
wanted={r['frameIndex']:r for r in rows};frames={}
container=av.open(video)
for i,frame in enumerate(container.decode(video=0)):
    if i in wanted:frames[i]=frame.to_ndarray(format='rgb24')
    if i>max(wanted):break
order=sorted(frames);image=torch.from_numpy(np.stack([frames[i] for i in order]).astype(np.float32)/255)
boxes=[[{'x':wanted[i]['bbox'][0],'y':wanted[i]['bbox'][1],'width':wanted[i]['bbox'][2]-wanted[i]['bbox'][0],'height':wanted[i]['bbox'][3]-wanted[i]['bbox'][1]}] for i in order]
a=time.perf_counter();model=SAM3DBody_Loader.execute('sam_3d_body_dinov3_bf16.safetensors').result[0];print('load',round(time.perf_counter()-a,1),flush=True)
a=time.perf_counter()
with torch.no_grad():data=SAM3DBody_Predict.execute(model,image,bboxes=boxes,run_hand_refinement=False,fov=0.0,batch_size=2).result[0]
elapsed=time.perf_counter()-a;print('predict',round(elapsed,1),'s for',len(order),'frames =',round(elapsed/len(order),2),'s/frame',flush=True)
keep={}
for n,(i,people) in enumerate(zip(order,data['frames'])):
    if not people:continue
    p=people[0]
    if n==0:print({k:(tuple(v.shape) if hasattr(v,'shape') else type(v).__name__) for k,v in p.items()})
    for k in ('pred_keypoints_3d','pred_keypoints_2d','pred_cam_t','pred_joint_coords','pred_global_rots','focal_length'):
        if k in p:keep.setdefault(k,[]).append(np.asarray(p[k].cpu() if hasattr(p[k],'cpu') else p[k],dtype=np.float32))
np.savez(out,frameIndex=np.array([i for i,pp in zip(order,data['frames']) if pp]),times=np.array([wanted[i]['time'] for i,pp in zip(order,data['frames']) if pp]),**{k:np.stack(v) for k,v in keep.items()})
print('saved',out,{k:np.stack(v).shape for k,v in keep.items()})
