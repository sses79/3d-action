"""SAM 3D Body at a depth clip's keyframes: one reading per named person per keyframe, from the clip's own boxes (the follow
step's tracks), for depth-scene.py. Runs in ComfyUI's Python:
  .authoring/comfyui/.venv/bin/python authoring/render/depth-scene-body.py SPEC.json TRACKS.json OUT.npz [--comfy .authoring/comfyui]
SPEC is the clip's spec (video, start, keyframes with shot and time), TRACKS its tracks-fixed.json (times, tracks: name -> per frame
{box} or null). OUT.npz holds per reading: keyframe index, person name, the box, and the model's camera-frame answer (pred_cam_t,
global_rot, pred_global_rots, pred_keypoints_3d/2d, focal_length); OUT.json lists the readings. A person whose box is missing at the
keyframe, or cut to under 40 px, is skipped."""
import sys,os,json,time,argparse,subprocess,numpy as np
p=argparse.ArgumentParser();p.add_argument('spec');p.add_argument('tracks');p.add_argument('out');p.add_argument('--comfy',default='.authoring/comfyui');p.add_argument('--weights',default='sam_3d_body_dinov3_bf16.safetensors');a=p.parse_args()
spec=os.path.abspath(a.spec);S=json.load(open(spec));TR=json.load(open(a.tracks));out=os.path.abspath(a.out);comfy=os.path.abspath(a.comfy);video=S['video'];t0=time.perf_counter()
times=np.array(TR['times']);W,H=TR.get('size',[1280,720])
def frame(t):  # one picture at a time in the source, as RGB
 r=subprocess.run(['ffmpeg','-v','error','-ss',f'{t:.4f}','-i',video,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-'],capture_output=True,check=True);return np.frombuffer(r.stdout,np.uint8).reshape(H,W,3)
jobs=[]
for k,kf in enumerate(S['keyframes']):
 t=S['start']+kf['time'];i=int(np.argmin(abs(times-t)))
 for name,rows in TR['tracks'].items():
  b=rows[i] if i<len(rows) else None
  if not b or not b.get('box'):continue
  x0,y0,x1,y1=b['box']
  if min(x1-x0,y1-y0)<40:continue
  jobs.append(dict(keyframe=k,time=kf['time'],shot=kf['shot'],name=name,box=[float(x0),float(y0),float(x1),float(y1)],frameTime=float(times[i])))
if not jobs:raise SystemExit('no person boxes at the keyframes')
pics={k:frame(S['start']+S['keyframes'][k]['time']) for k in sorted({j['keyframe'] for j in jobs})}
sys.argv=[sys.argv[0]];sys.path.insert(0,comfy);os.chdir(comfy)
import torch
from comfy_extras.nodes_sam3d_body import SAM3DBody_Loader,SAM3DBody_Predict
import comfy.ldm.sam3d_body.mhr.mhr_rig as rig  # the Mac GPU has no 64-bit floats: the rig's joint walk on the CPU, as body.py does
walk=rig._global_skel_state_from_local
rig._global_skel_state_from_local=lambda local,levels:walk(local.cpu(),[(x.cpu(),y.cpu()) for x,y in levels]).to(local.device) if local.device.type=='mps' else walk(local,levels)
KEEP=('pred_cam_t','global_rot','pred_global_rots','pred_keypoints_3d','pred_keypoints_2d','focal_length','pred_joint_coords')
model=SAM3DBody_Loader.execute(a.weights).result[0];t1=time.perf_counter();res={k:[] for k in KEEP};keep=[]
with torch.no_grad():
 for j in jobs:
  x0,y0,x1,y1=j['box'];img=torch.from_numpy(pics[j['keyframe']][None].astype(np.float32)/255)
  f=SAM3DBody_Predict.execute(model,img,bboxes=[[{'x':x0,'y':y0,'width':x1-x0,'height':y1-y0}]],run_hand_refinement=False,fov=0.0,batch_size=1).result[0]['frames'][0]
  if not f:continue
  for k in KEEP:v=f[0].get(k);res[k].append(np.asarray(v.cpu() if hasattr(v,'cpu') else v,dtype=np.float32))
  keep.append(j)
np.savez(out,**{k:np.stack(v) for k,v in res.items() if v and len(v)==len(keep)})
json.dump(dict(spec=spec,size=[W,H],readings=keep,seconds=dict(load=round(t1-t0,1),predict=round(time.perf_counter()-t1,1))),open(out.replace('.npz','')+'.json','w'),indent=1)
print(json.dumps(dict(readings=len(keep),of=len(jobs),seconds=round(time.perf_counter()-t0,1))))
