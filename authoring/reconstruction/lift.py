"""Bounded MotionBERT-Lite pilot. Estimated 3D joints, not rotation/contact truth."""
import argparse,time,json,sys,hashlib,subprocess
from pathlib import Path
started=time.perf_counter();parser=argparse.ArgumentParser();parser.add_argument('--pose',default='authoring/reviews/video/kick-reference/pose-report.json');parser.add_argument('--out',default='authoring/reviews/video/kick-reference/reconstruction');parser.add_argument('--benchmark',action='store_true');parser.add_argument('--no-leg-repair',action='store_true');args=parser.parse_args()
import numpy as np,torch
imports=time.perf_counter()-started;torch.set_num_threads(2);torch.set_num_interop_threads(1)
vendor=Path('.authoring/vendor/MotionBERT');sys.path.insert(0,str(vendor.resolve()));from lib.model.DSTformer import DSTformer
out=Path(args.out);out.mkdir(parents=True,exist_ok=True);report=json.loads(Path(args.pose).read_text());observed=len(report['frames']);rows=[r for r in report['frames'] if len(r['keypoints'])==17];times=np.array([r['time'] for r in rows]);raw=np.array([r['keypoints'] for r in rows],dtype=np.float32)
assert raw.shape[1:]==(17,3) and len(raw)>2 and np.all(np.diff(times)>0)
# The temporal model accepts at most 243 frames; unselected-subject frames are bridged by interpolation and counted.
samples=round((report['interval'][1]-report['interval'][0])*30)+1
# Motion blur can make the detector drop a fast leg and redraw it on top of the other leg: both knee and ankle land on the
# other side's joints, with reduced confidence, a large jump from the last trusted frame. Such frames are bridged, not trusted.
repaired=[];swapped=[]
if not args.no_leg_repair:
 height=float(np.median([r['bbox'][3]-r['bbox'][1] for r in rows]));apart=lambda a,b:float(np.linalg.norm(a[:2]-b[:2]))/height;sides={'left':(13,15,14,16),'right':(14,16,13,15)};trusted={s:[] for s in sides}
 # Blur can also make the detector exchange the two legs for a frame. Legs move continuously in the image, so when swapping
 # the labels back removes most of a large frame-to-frame jump, the frame's left and right knee and ankle are exchanged.
 for i in range(1,len(raw)):
  keep=sum(apart(raw[i,j],raw[i-1,j]) for j in (13,14,15,16));swap=sum(apart(raw[i,a],raw[i-1,b]) for a,b in ((13,14),(14,13),(15,16),(16,15)))
  if keep>.5 and swap<.5*keep:raw[i,[13,14,15,16]]=raw[i,[14,13,16,15]];swapped.append({'frame':i,'time':float(times[i]),'jumpBodyHeights':keep})
 for i in range(len(raw)):
  merged=apart(raw[i,13],raw[i,14])<.2 and apart(raw[i,15],raw[i,16])<.2;jump={s:(apart(raw[i,sides[s][1]],raw[trusted[s][-1],sides[s][1]]) if trusted[s] else 0) for s in sides};sure=min(raw[i,j,2] for j in (13,14,15,16))>=.9;weak=max(sides,key=lambda s:jump[s]) if sure else min(sides,key=lambda s:min(raw[i,sides[s][0],2],raw[i,sides[s][1],2]))
  for side,(knee,ankle,_,_) in sides.items():
   last=trusted[side][-1] if trusted[side] else None
   if merged and side==weak and last is not None and (min(raw[i,knee,2],raw[i,ankle,2])<.9 and apart(raw[i,ankle],raw[last,ankle])>.3 or apart(raw[i,ankle],raw[last,ankle])>.45 and i-last<=4):repaired.append({'side':side,'frame':i,'time':float(times[i]),'confidence':float(min(raw[i,knee,2],raw[i,ankle,2])),'jumpBodyHeights':apart(raw[i,ankle],raw[last,ankle])})
   else:trusted[side].append(i)
 for side,(knee,ankle,_,_) in sides.items():
  bad=[x['frame'] for x in repaired if x['side']==side];good=trusted[side]
  for j in (knee,ankle):
   for k in range(2):raw[bad,j,k]=np.interp(times[bad],times[good],raw[good,j,k])
   raw[bad,j,2]=.25
# On a raised, straight leg the blurred ankle point slides up the shin, which only ever shortens the hip-to-ankle reach.
# The reach is therefore restored to its largest value within two neighbouring straight frames; the observed direction is kept.
extended=[]
if not args.no_leg_repair:
 for side,(knee,ankle,_,other) in sides.items():
  hip=11 if side=='left' else 12;a=raw[:,hip,:2]-raw[:,knee,:2];b=raw[:,ankle,:2]-raw[:,knee,:2];angle=np.degrees(np.arccos(np.clip((a*b).sum(-1)/np.maximum(np.linalg.norm(a,axis=-1)*np.linalg.norm(b,axis=-1),1e-6),-1,1)));reach=np.linalg.norm(raw[:,ankle,:2]-raw[:,hip,:2],axis=-1)
  straight=(angle>160)&((raw[:,other,1]-raw[:,ankle,1])>.25*reach);moved=raw.copy()
  for i in np.flatnonzero(straight):
   near=[j for j in range(max(0,i-2),min(len(raw),i+3)) if straight[j]];best=max(reach[j] for j in near)
   if best>1.05*reach[i]:
    for j in (knee,ankle):moved[i,j,:2]=raw[i,hip,:2]+(raw[i,j,:2]-raw[i,hip,:2])*best/reach[i]
    extended.append({'side':side,'frame':int(i),'time':float(times[i]),'reachGain':float(best/reach[i])})
  raw=moved
if samples>243 or len(rows)<.8*observed:raise SystemExit(f'Unsupported window: {samples} samples, {len(rows)}/{observed} frames with a selected subject')
# Regular 30Hz sequence required by the temporal model; interpolation is explicit, not new evidence.
uniform=np.linspace(report['interval'][0],report['interval'][1],samples)
# Where the face points, from the nose relative to the visible ear(s): x right, y down, in units of the nose-to-ear distance
# of a profile view (about 8.5% of body height). Third value is confidence. The lifted head joints cannot give this.
stature=float(np.median([r['bbox'][3]-r['bbox'][1] for r in rows]));ear_weight=np.maximum(raw[:,3:5,2:3],1e-3);ear=(raw[:,3:5,:2]*ear_weight).sum(1)/ear_weight.sum(1);face_raw=np.concatenate([(raw[:,0,:2]-ear)/(.085*stature),(raw[:,0,2]*raw[:,3:5,2].max(1))[:,None]],1);face=np.stack([np.interp(uniform,times,face_raw[:,k]) for k in range(3)],1)
for k in range(2):face[:,k]=np.convolve(np.pad(face[:,k],2,mode='edge'),np.array([1,4,6,4,1])/16,mode='valid')
coco=np.array([[np.interp(uniform,times,raw[:,j,k]) for k in range(3)] for j in range(17)]).transpose(2,0,1).astype(np.float32)
h=np.zeros((len(coco),17,3),np.float32);h[:,0]=(coco[:,11]+coco[:,12])/2
for dst,src in [(1,12),(2,14),(3,16),(4,11),(5,13),(6,15),(11,5),(12,7),(13,9),(14,6),(15,8),(16,10)]:h[:,dst]=coco[:,src]
h[:,8]=(coco[:,5]+coco[:,6])/2;h[:,7]=(h[:,0]+h[:,8])/2;h[:,9]=coco[:,0];h[:,10,:2]=1.5*coco[:,0,:2]-.5*h[:,8,:2]
# Synthesized joints use conservative confidence, retained as a heuristic.
for j in [0,7,8]:h[:,j,2]=np.minimum(coco[:,11,2],coco[:,12,2])*.7
h[:,10,2]=coco[:,0,2]*.3
valid=h[h[...,2]>.1][:,:2];lo=valid.min(0);hi=valid.max(0);scale=float(max(hi-lo));center=(lo+hi)/2;h[...,:2]=(h[...,:2]-center)/scale*2
raw_input=h.copy();prepared=h.copy()
# Short median filter removes isolated estimates without overwriting raw evidence.
for i in range(len(h)):prepared[i,:,:2]=np.median(h[max(0,i-1):min(len(h),i+2),:,:2],axis=0)
prep=time.perf_counter()-started-imports;a=time.perf_counter();model=DSTformer(dim_feat=256,dim_rep=512,depth=5,num_heads=8,att_fuse=True);path=Path('.authoring/reconstruction-models/motionbert-lite.bin');ck=torch.load(path,map_location='cpu',weights_only=True);state={k.removeprefix('module.'):v for k,v in ck['model_pos'].items()};model.load_state_dict(state,strict=True);model.eval();load=time.perf_counter()-a
left=[4,5,6,11,12,13];right=[1,2,3,14,15,16]
def predict(v):
 x=torch.from_numpy(v[None]);flip=x.clone();flip[...,0]*=-1;flip[:,:,left+right]=flip[:,:,right+left]
 with torch.inference_mode():
  y=model(x);yf=model(flip);yf[...,0]*=-1;yf[:,:,left+right]=yf[:,:,right+left];return ((y+yf)/2)[0].numpy()
a=time.perf_counter();draft=predict(prepared);first=time.perf_counter()-a;runs=[]
for _ in range(3 if args.benchmark else 0):
 a=time.perf_counter();draft=predict(prepared);runs.append(time.perf_counter()-a)
a=time.perf_counter();raw3d=predict(raw_input);raw_infer=time.perf_counter()-a
# Camera-space x right, y down, depth is learned. Keep root-relative estimates separate from image root.
root=draft[:,0:1].copy();relative=draft-root
names=['pelvis','right_hip','right_knee','right_ankle','left_hip','left_knee','left_ankle','spine','neck','nose','head','left_shoulder','left_elbow','left_wrist','right_shoulder','right_elbow','right_wrist']
result={'schemaVersion':1,'status':'estimated-draft-unreviewed','backend':'MotionBERT-Lite H36M global pose','modelSHA256':hashlib.sha256(path.read_bytes()).hexdigest(),'sourceCodeCommit':subprocess.check_output(['git','-C',str(vendor),'rev-parse','HEAD'],text=True).strip(),'checkpointURL':'https://huggingface.co/walterzhu/MotionBERT/resolve/main/checkpoint/pose3d/FT_MB_lite_MB_ft_h36m_global_lite/best_epoch.bin','sourceSHA256':report['sourceSHA256'],'sourcePose':args.pose,'frameRate':30,'recordingInterval':report['interval'],'times':uniform.tolist(),'jointNames':names,'coordinates':'learned camera-space normalized x-right/y-down/z-depth; relative scale, not metric','rootRelativePositions':relative.tolist(),'rawModelPositions':draft.tolist(),'raw2DModelPositions':raw3d.tolist(),'preparedInput':prepared.tolist(),'synthesizedJoints':['pelvis midpoint','neck shoulder midpoint','spine midpoint','head extrapolated from nose/neck'],'rootTravel':'Not reconstructed in world space; image pelvis movement retained for explicit screen-space trajectory approximation','imagePelvis':((coco[:,11,:2]+coco[:,12,:2])/2).tolist(),'faceDirection':face.tolist(),'lowestAnkleImageY':np.maximum(coco[:,15,1],coco[:,16,1]).tolist(),'inputNormalization':{'centerPixels':center.tolist(),'scalePixels':scale,'resampling':'linear interpolation on uniform30Hz grid, endpoint clamp; not new observed frames','filter':'3-sample median xy; confidence retained'},'observedFrames':observed,'repairedLegObservations':repaired,'swappedLegObservations':swapped,'extendedLegReach':extended,'bridgedFrames':observed-len(rows),'firstBoxHeightPixels':rows[0]['bbox'][3]-rows[0]['bbox'][1],'timingsSeconds':{'imports':imports,'preparation':prep,'modelLoad':load,'firstInference':first,'warmInferences':runs,'rawInputInference':raw_infer,'processWall':time.perf_counter()-started},'limits':['No3D ground truth','COCO-to-H36M includes estimated axial joints','Single-view depth/twist/foot contact uncertain','No mirrored-side resolution','World root/metric scale absent']}
(out/'motion-ir.json').write_text(json.dumps(result));np.save(out/'positions.npy',relative);print(json.dumps({'shape':list(relative.shape),'timings':result['timingsSeconds'],'finite':bool(np.isfinite(relative).all())}))
