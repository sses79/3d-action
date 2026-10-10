"""Whole-body 3D estimate per frame from SAM 3D Body (ComfyUI's built-in nodes, run headless), for the performer the observe
stage picked. Writes motion-ir.json for the retarget: 17 joints, hip centre and lowest body point in the picture, face direction.
Estimated per frame, not rig ground truth. Runs in ComfyUI's own Python environment."""
import sys,json,time,os,argparse,glob
p=argparse.ArgumentParser();p.add_argument('--comfy',required=True);p.add_argument('--weights',required=True);p.add_argument('--pose',required=True);p.add_argument('--video',required=True);p.add_argument('--out',required=True);p.add_argument('--smooth',type=float,default=0,help='0-1: strength of ComfyUI\'s temporal smoothing (Savitzky-Golay over 7 frames, backing off during fast spins)');p.add_argument('--no-second-look',action='store_true');p.add_argument('--no-despike',action='store_true');p.add_argument('--reuse',help='folder of raw results from earlier runs; one whose frames match is used instead of running the model');args=p.parse_args()
pose_path,video,out,comfy=os.path.abspath(args.pose),os.path.abspath(args.video),os.path.abspath(args.out),os.path.abspath(args.comfy);reuse=os.path.abspath(args.reuse) if args.reuse else None
started=time.perf_counter();import numpy as np
report=json.load(open(pose_path));observed=len(report['frames']);rows=[f for f in report['frames'] if f['bbox']]
if len(rows)<3 or len(rows)<.8*observed:raise SystemExit(f'Unsupported window: {len(rows)}/{observed} frames with a selected subject')
order=[r['frameIndex'] for r in rows];times=np.array([r['time'] for r in rows]);raw=None;timings={}
KEEP=('pred_keypoints_3d','pred_keypoints_2d','pred_cam_t','pred_joint_coords','pred_global_rots','focal_length','global_rot','body_pose_params','hand_pose_params','scale_params','shape_params','mhr_model_params','pred_pose_raw')
for f in sorted(glob.glob(os.path.join(reuse,'*.npz'))) if reuse else []:
 d=np.load(f)
 if len(d['frameIndex'])==len(order) and (d['frameIndex']==np.array(order)).all() and abs(float(d['times'][0])-float(times[0]))<1e-6:raw={k:d[k] for k in KEEP if k in d};timings['reusedRaw']=os.path.basename(f);break
# ComfyUI reads the command line and the working folder on import.
sys.argv=[sys.argv[0]];sys.path.insert(0,comfy);os.chdir(comfy)
import torch,av
from comfy_extras.nodes_sam3d_body import SAM3DBody_Loader,SAM3DBody_Predict,SAM3DBody_Smooth
# The Mac GPU has no 64-bit floats, which the rig's joint walk asks for. That walk alone runs on the CPU; ComfyUI's files are untouched.
import comfy.ldm.sam3d_body.mhr.mhr_rig as rig
walk=rig._global_skel_state_from_local
rig._global_skel_state_from_local=lambda local,levels:walk(local.cpu(),[(a.cpu(),b.cpu()) for a,b in levels]).to(local.device) if local.device.type=='mps' else walk(local,levels)
loaded={}
def pictures(indices):
 wanted=set(indices);frames={}
 for i,frame in enumerate(av.open(video).decode(video=0)):
  if i in wanted:frames[i]=frame.to_ndarray(format='rgb24')
  if i>max(wanted):break
 if len(frames)!=len(wanted):raise SystemExit('Could not decode every observed frame')
 return np.stack([frames[i] for i in indices])
def predict(images,boxes):
 if 'model' not in loaded:a=time.perf_counter();loaded['model']=SAM3DBody_Loader.execute(args.weights).result[0];timings['load']=time.perf_counter()-a
 a=time.perf_counter()
 # 64 pictures at a time: a 15-second window is over 400 pictures, 4.7 GB as one float array
 people=[]
 with torch.no_grad():
  for at in range(0,len(images),64):people+=SAM3DBody_Predict.execute(loaded['model'],torch.from_numpy(images[at:at+64].astype(np.float32)/255),bboxes=[[{'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]}] for b in boxes[at:at+64]],run_hand_refinement=False,fov=0.0,batch_size=2).result[0]['frames']
 timings['predict']=timings.get('predict',0)+time.perf_counter()-a
 if any(not f for f in people):raise SystemExit('The body model returned no person for some frames')
 return {k:np.stack([np.asarray(f[0][k].cpu() if hasattr(f[0][k],'cpu') else f[0][k],dtype=np.float32) for f in people]) for k in KEEP if k in people[0][0]}
if raw is None:raw=predict(pictures(order),[r['bbox'] for r in rows])
os.makedirs(out,exist_ok=True);np.savez(os.path.join(out,'body-raw.npz'),frameIndex=np.array(order),times=times,**raw)
# A second look with the picture turned. The model reads upright bodies best; on an inverted, twisting body its reading of which
# way the chest faces can jump back and forth. Only where it does so repeatedly: three or more jumps of over 45 degrees in one
# frame, each within four frames of the next. One jump alone can be a real fast twist, and an out-and-back pair is a spike that
# the next rule removes; looking again at those changed frames that were fine (Butterfly twist, B-twist round, Moonkick; the
# user saw them get worse). Around such a group (four frames either side), the same model is run on the picture turned by 90, 180 and 270 degrees and each result is
# turned back. That gives up to four readings of those frames. One reading per frame is then chosen so that the joints travel
# least from frame to frame across the whole clip (a shortest path through the candidates), which is the a-b-c idea again:
# the reading that lies on the way. The keypoints and the joint rotations of the chosen reading are taken, both turned back:
# a picture turned by k quarter turns gives positions p' with p = T p', T a turn about the view axis, and joint rotations G'
# with G = T^-1 G' (the model's own axes are the camera's with y and z flipped, which reverses the turn). Checked against the
# model: the turned-back rotations reproduce the directions between the turned-back joints as closely as an unturned reading
# does. The raw file keeps the first reading.
turn=lambda A,B:float(np.degrees(np.arccos(np.clip((np.trace(A@B.T)-1)/2,-1,1))))
second={'frames':[],'changed':[]}
if 'pred_global_rots' in raw and len(order)>4 and not args.no_second_look:
 R0=raw['pred_global_rots'][:,1].astype(np.float64);jumpy=[i for i in range(1,len(R0)) if turn(R0[i],R0[i-1])>45];groups=[];[groups[-1].append(i) if groups and i-groups[-1][-1]<=4 else groups.append([i]) for i in jumpy];flagged=sorted({j for g in groups if len(g)>=3 for j in range(max(0,g[0]-4),min(len(order),g[-1]+4))})
 if flagged:
  imgs=pictures([order[i] for i in flagged]);Hh,Ww=imgs.shape[1:3];JN=[0,5,6,7,8,9,10,11,12,13,14,41,62,69];rel=lambda K:K-(K[:,[9]]+K[:,[10]])/2
  cands={i:[(rel(raw['pred_keypoints_3d'][[i]].astype(np.float64))[0],raw['pred_keypoints_2d'][i].astype(np.float64))] for i in range(len(order))}
  for k in (1,2,3):
   to=lambda x,y:{1:(y,Ww-1-x),2:(Ww-1-x,Hh-1-y),3:(Hh-1-y,x)}[k];boxes=[]
   for i in flagged:
    x0,y0,x1,y1=rows[i]['bbox'];pts=[to(x0,y0),to(x1,y1),to(x0,y1),to(x1,y0)];boxes.append([min(q[0] for q in pts),min(q[1] for q in pts),max(q[0] for q in pts),max(q[1] for q in pts)])
   got=predict(np.stack([np.rot90(im,k) for im in imgs]).copy(),boxes);K=rel(got['pred_keypoints_3d'].astype(np.float64));q=got['pred_keypoints_2d'].astype(np.float64);x,y,z,u,v=K[...,0],K[...,1],K[...,2],q[...,0],q[...,1]
   K=np.stack({1:(-y,x,z),2:(-x,-y,z),3:(y,-x,z)}[k],-1);q=np.stack({1:(Ww-1-v,u),2:(Ww-1-u,Hh-1-v),3:(v,Hh-1-u)}[k],-1);back_turn=np.array({1:[[0,1,0],[-1,0,0],[0,0,1]],2:[[-1,0,0],[0,-1,0],[0,0,1]],3:[[0,-1,0],[1,0,0],[0,0,1]]}[k],dtype=np.float64);Gk=back_turn@got['pred_global_rots'].astype(np.float64)
   for n,i in enumerate(flagged):cands[i].append((K[n],q[n],Gk[n]))
  cost=[np.zeros(len(cands[0]))];back=[]
  for i in range(1,len(order)):
   step=np.array([[np.linalg.norm(c[0][JN]-p[0][JN],axis=1).sum() for p in cands[i-1]] for c in cands[i]])+cost[-1][None,:];back.append(step.argmin(1));cost.append(step.min(1))
  pick=[int(np.argmin(cost[-1]))]
  for i in range(len(order)-1,0,-1):pick.append(int(back[i-1][pick[-1]]))
  pick=pick[::-1];second['frames']=[int(i) for i in flagged]
  if any(pick[i] for i in flagged):raw.pop('global_rot',None)
  for i in flagged:
   if pick[i]:
    centre=(raw['pred_keypoints_3d'][i,9]+raw['pred_keypoints_3d'][i,10])/2;raw['pred_keypoints_3d'][i]=(cands[i][pick[i]][0]+centre).astype(np.float32);raw['pred_keypoints_2d'][i]=cands[i][pick[i]][1].astype(np.float32);raw['pred_global_rots'][i]=cands[i][pick[i]][2].astype(np.float32);second['changed'].append({'frame':int(i),'time':float(times[i]),'turnedDegrees':90*pick[i]})
# Single-frame jumps. The model looks at one picture at a time, and where the body is foreshortened or turning fast it
# sometimes lands on a different reading for a frame or two and then comes back. The test is the a-b-c one used elsewhere:
# take the frame before (a) and the frame after (c) a run of one or two frames (b). If a and c agree with each other and b is
# far from both, b is not movement, and it is replaced by the straight path from a to c. Two levels: the whole body's turn
# (b more than 60 degrees and 1.5 times the a-to-c turn away from both), where every output of the frame is replaced; and single
# keypoints relative to the hips (b more than 15 cm and twice the a-to-c distance off the straight path). A real fast move
# passes between a and c, so speed alone never triggers it. Smoothing cannot do this job: it eases off exactly in fast turns.
def on_rotations(M):
 U,_,Vt=np.linalg.svd(M);fix=np.ones(M.shape[:-2]+(3,));fix[...,2]=np.sign(np.linalg.det(U@Vt));return (U*fix[...,None,:])@Vt
despiked={'frames':[],'keypoints':0}
if 'pred_global_rots' in raw and len(order)>4 and not args.no_despike:
 R=raw['pred_global_rots'][:,1].astype(np.float64);done=set()
 for gap in (1,2):
  for i in range(1,len(R)-gap):
   a,c,run=i-1,i+gap,range(i,i+gap)
   if done&{a,c,*run}:continue
   base=turn(R[a],R[c])
   if base<60 and all(min(turn(R[k],R[a]),turn(R[k],R[c]))>max(60,1.5*base) for k in run):
    for k in run:
     u=(times[k]-times[a])/(times[c]-times[a])
     for key in raw:
      if raw[key].ndim<1 or len(raw[key])!=len(order):continue
      mixed=(1-u)*raw[key][a].astype(np.float64)+u*raw[key][c].astype(np.float64);raw[key][k]=(on_rotations(mixed) if key=='pred_global_rots' else mixed).astype(raw[key].dtype)
     done.add(k);despiked['frames'].append(int(k))
 hips=lambda K:K-(K[:,[9]]+K[:,[10]])/2;X=hips(raw['pred_keypoints_3d'].astype(np.float64))
 for gap in (1,2):
  for i in range(1,len(X)-gap):
   a,c=i-1,i+gap;between=np.linalg.norm(X[c]-X[a],axis=1)
   for k in range(i,i+gap):
    u=(times[k]-times[a])/(times[c]-times[a]);path=(1-u)*X[a]+u*X[c];off=np.linalg.norm(X[k]-path,axis=1);bad=np.flatnonzero((off>.15)&(off>2*between))
    if len(bad):
     X[k,bad]=path[bad];centre=(raw['pred_keypoints_3d'][k,9]+raw['pred_keypoints_3d'][k,10])/2;raw['pred_keypoints_3d'][k,bad]=(path[bad]+centre).astype(np.float32);raw['pred_keypoints_2d'][k,bad]=((1-u)*raw['pred_keypoints_2d'][a,bad]+u*raw['pred_keypoints_2d'][c,bad]).astype(np.float32);despiked['keypoints']+=int(len(bad))
# Smoothing is ComfyUI's own node, not ours. It eases off where the body turns fast, which it reads from the root rotation; raw
# results saved before that was kept get it rebuilt from the root joint's rotation matrix (only the change between frames matters).
if args.smooth>0:
 used=dict(raw)
 if 'global_rot' not in used:R=used['pred_global_rots'][:,1];used['global_rot']=np.stack([np.arctan2(R[:,1,0],R[:,0,0]),np.arcsin(np.clip(-R[:,2,0],-1,1)),np.arctan2(R[:,2,1],R[:,2,2])],1).astype(np.float32)
 data={'frames':[[{k:v[i] for k,v in used.items()}] for i in range(len(order))]};smooth=SAM3DBody_Smooth.execute(data,float(args.smooth),'savgol',7,30.0).result[0]['frames'];raw={k:np.stack([np.asarray(f[0][k],dtype=np.float32) for f in smooth]) for k in used};np.savez(os.path.join(out,'body-smoothed.npz'),frameIndex=np.array(order),times=times,**raw)
# MHR70 keypoints -> the 17 joints the retarget reads (H36M order). Camera axes: x right, y down, z away. Metres; the retarget
# only uses directions, so no rescaling.
K=raw['pred_keypoints_3d'].astype(np.float64);k2=raw['pred_keypoints_2d'].astype(np.float64)
nose,leye,reye,lear,rear,lsho,rsho,lelb,relb,lhip,rhip,lkne,rkne,lank,rank,rwri,lwri,neck=0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,41,62,69
pelvis=(K[:,rhip]+K[:,lhip])/2;H=np.zeros((len(K),17,3))
H[:,0]=pelvis;H[:,1]=K[:,rhip];H[:,2]=K[:,rkne];H[:,3]=K[:,rank];H[:,4]=K[:,lhip];H[:,5]=K[:,lkne];H[:,6]=K[:,lank];H[:,8]=K[:,neck];H[:,7]=(pelvis+K[:,neck])/2;H[:,9]=(K[:,neck]+K[:,nose])/2;H[:,10]=K[:,nose]+(K[:,nose]-K[:,neck])*.4
H[:,11]=K[:,lsho];H[:,12]=K[:,lelb];H[:,13]=K[:,lwri];H[:,14]=K[:,rsho];H[:,15]=K[:,relb];H[:,16]=K[:,rwri];H-=H[:,0:1]
# Where the body is in the picture, from the same model that poses it: the lowest of all 70 keypoints (toes, heels, hands, head
# included), the middle of the hips, and where the face points (nose against the ears, in units of 8.5% of body height).
stature=float(np.median([r['bbox'][3]-r['bbox'][1] for r in rows]));face=np.concatenate([(k2[:,nose]-(k2[:,lear]+k2[:,rear])/2)/(.085*stature),np.ones((len(k2),1))],1)
# The retarget expects an even 30 Hz sequence over the window; interpolation between observed frames is explicit, not new evidence.
start,end=report['interval'];samples=round((end-start)*30)+1;uniform=np.linspace(start,end,samples);even=lambda a:np.stack([np.interp(uniform,times,a.reshape(len(a),-1)[:,c]) for c in range(a.reshape(len(a),-1).shape[1])],1).reshape((samples,)+a.shape[1:])
lowest=even(k2[:,:,1].max(1)[:,None])[:,0]
# Where the hips are in the camera's own space, in metres (x right, y down, z away from the camera): the model's keypoints plus
# its camera translation, which project back onto its 2D keypoints exactly (0.0 px on 102 bodies). Two performers read from the
# same frames are in the same space, so this is what places them relative to each other. Depth is the model's single-camera
# guess, made with a fixed focal length, so a zoom reads as everyone coming closer.
camera_hip=even(pelvis+raw['pred_cam_t'].astype(np.float64)).tolist() if 'pred_cam_t' in raw else None
# Joint rotations for the retarget's rotation path. For each of our character's bones, the model joint that drives it and how
# far that joint has turned from the model's rest pose, as a world rotation in the retarget's axes (x right, y up, z toward
# the camera): D = G . B^-1, with G the model's global rotation and B the rest rotation. Checked against the model itself: this
# reproduces the direction between its own joint positions within 0.3 degrees. The rest direction of each bone (toward the
# next joint) goes along so the retarget can line up the two rest poses, which differ (arms lowered here, level on ours).
BONES={'pelvis':(1,None),'spine_01':(35,36),'spine_02':(36,37),'spine_03':(37,110),'neck_01':(110,113),'Head':(113,None),'clavicle_l':(74,75),'upperarm_l':(75,76),'lowerarm_l':(76,77),'hand_l':(78,None),'clavicle_r':(38,39),'upperarm_r':(39,40),'lowerarm_r':(40,41),'hand_r':(42,None),'thigh_l':(2,3),'calf_l':(3,4),'foot_l':(7,5,8),'ball_l':(8,None),'thigh_r':(18,19),'calf_r':(19,20),'foot_r':(23,21,24),'ball_r':(24,None)}
# Fingers: three bones each. The model's hand joints were matched to its own named hand keypoints (thumb tip to pinky base,
# then wrist), which coincide with joints to the millimetre: on the right hand thumb 61-64, index 56-59, middle 52-55, ring
# 48-51, little finger 44-47; the left hand is 36 higher. The estimate comes from the whole-body pass (no separate hand crop),
# so it is coarse: open, closed and roughly how far, not individual finger detail.
for side,off in (('r',0),('l',36)):
 for finger,base in (('thumb',61),('index',56),('middle',52),('ring',48),('pinky',44)):
  for k in range(3):BONES[f'{finger}_0{k+1}_{side}']=(base+off+k,base+off+k+1)
rotations=None
if 'pred_global_rots' in raw:
 mhr=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'mhr-rig.json')));bind=np.array(mhr['bind'])
 def matrix(q):
  x,y,z,w=q;return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
 def quaternion(M):
  w=np.sqrt(np.maximum(0,1+M[...,0,0]+M[...,1,1]+M[...,2,2]))/2;x=np.sqrt(np.maximum(0,1+M[...,0,0]-M[...,1,1]-M[...,2,2]))/2;y=np.sqrt(np.maximum(0,1-M[...,0,0]+M[...,1,1]-M[...,2,2]))/2;z=np.sqrt(np.maximum(0,1-M[...,0,0]-M[...,1,1]+M[...,2,2]))/2
  return np.stack([np.copysign(x,M[...,2,1]-M[...,1,2]),np.copysign(y,M[...,0,2]-M[...,2,0]),np.copysign(z,M[...,1,0]-M[...,0,1]),w],-1)
 G=raw['pred_global_rots'].astype(np.float64);names=list(BONES);Q=np.stack([quaternion(G[:,BONES[n][0]]@matrix(bind[BONES[n][0],3:7]).T) for n in names],1)
 for i in range(1,len(Q)):Q[i]*=np.where((Q[i]*Q[i-1]).sum(-1,keepdims=True)<0,-1,1)
 Q=even(Q);Q/=np.linalg.norm(Q,axis=-1,keepdims=True)
 # The model's ankle turns across three joints (4/5, 6, 7) before the ball of the foot (8); the last carries the whole turn, and
 # the foot's rest direction runs from the ankle to the ball. Taking the first small joint below the ankle instead pointed the
 # rest foot straight down and stood the character on its toes.
 ends={n:((v[1],v[2]) if len(v)==3 else (v[0],v[1])) for n,v in BONES.items()};rest={n:(None if b is None else ((bind[b,:3]-bind[a,:3])/np.linalg.norm(bind[b,:3]-bind[a,:3])).round(5).tolist()) for n,(a,b) in ends.items()}
 rotations={'bones':names,'quaternions':np.round(Q,5).tolist(),'restDirections':rest,'convention':'world rotation from the model rest pose, x right, y up, z toward the camera, quaternion x,y,z,w','unreliableFrames':[]}
ir={'schemaVersion':1,'status':'estimated-draft-unreviewed','backend':'SAM 3D Body (ComfyUI nodes, per frame'+(f', smoothed {args.smooth:g}' if args.smooth>0 else ', no smoothing')+')','turnedSecondLook':second,'despiked':despiked,'smoothing':({'node':'SAM3DBody_Smooth','strength':args.smooth,'method':'savgol','window':7,'rotationThresholdDegrees':30} if args.smooth>0 else None),'weights':args.weights,'sourceSHA256':report.get('sourceSHA256'),'sourcePose':pose_path,'frameRate':30,'recordingInterval':[start,end],'times':uniform.tolist(),'coordinates':'camera axes: x right, y down, z away; metres, root-relative','rootRelativePositions':even(H).tolist(),'imagePelvis':even((k2[:,rhip]+k2[:,lhip])/2).tolist(),'faceDirection':even(face).tolist(),'lowestSupportImageY':lowest.tolist(),'lowestAnkleImageY':lowest.tolist(),'lowestSupportSource':'body','cameraHip':camera_hip,'boneRotations':rotations,'observedFrames':observed,'bridgedFrames':observed-len(rows),'firstBoxHeightPixels':rows[0]['bbox'][3]-rows[0]['bbox'][1],'raw':'body-raw.npz (70 keypoints, 127 joints with rotations, camera translation)','timingsSeconds':{**{k:v for k,v in timings.items() if not isinstance(v,str)},'wall':time.perf_counter()-started},**({'reusedRaw':timings['reusedRaw']} if 'reusedRaw' in timings else {}),'limits':['One image at a time: no temporal model','Depth and scale are monocular estimates','Field of view not estimated (default)']}
json.dump(ir,open(os.path.join(out,'motion-ir.json'),'w'));print(json.dumps({'frames':len(rows),'samples':samples,'turnedSecondLook':{'looked':len(second['frames']),'changed':len(second['changed'])},'despiked':{'frames':len(despiked['frames']),'keypoints':despiked['keypoints']},'reused':'reusedRaw' in timings,'timings':ir['timingsSeconds']}))
