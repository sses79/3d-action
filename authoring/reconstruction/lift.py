"""Bounded MotionBERT-Lite pilot. Estimated 3D joints, not rotation/contact truth."""
import argparse,time,json,sys,hashlib,subprocess
from pathlib import Path
started=time.perf_counter();parser=argparse.ArgumentParser();parser.add_argument('--pose',default='authoring/reviews/video/kick-reference/pose-report.json');parser.add_argument('--out',default='authoring/reviews/video/kick-reference/reconstruction');parser.add_argument('--benchmark',action='store_true');parser.add_argument('--no-leg-repair',action='store_true');parser.add_argument('--speed',type=float,default=1);parser.add_argument('--decisions');parser.add_argument('--exchange-legs-on-decisions',action='store_true');args=parser.parse_args()
import numpy as np,torch
imports=time.perf_counter()-started;torch.set_num_threads(2);torch.set_num_interop_threads(1)
vendor=Path('.authoring/vendor/MotionBERT');sys.path.insert(0,str(vendor.resolve()));from lib.model.DSTformer import DSTformer
out=Path(args.out);out.mkdir(parents=True,exist_ok=True);report=json.loads(Path(args.pose).read_text());observed=len(report['frames']);rows=[r for r in report['frames'] if len(r['keypoints'])==17];times=np.array([r['time'] for r in rows]);raw=np.array([r['keypoints'] for r in rows],dtype=np.float32)
assert raw.shape[1:]==(17,3) and len(raw)>2 and np.all(np.diff(times)>0)
# The temporal model accepts at most 243 frames; unselected-subject frames are bridged by interpolation and counted.
samples=round((report['interval'][1]-report['interval'][0])*30)+1
# Motion blur can make the detector drop a fast leg and redraw it on top of the other leg: both knee and ankle land on the
# other side's joints, with reduced confidence, a large jump from the last trusted frame. Such frames are bridged, not trusted.
repaired=[];swapped=[];bridged=[];vetoed=[];relabelled_after=[]
decision_file=json.loads(Path(args.decisions).read_text()) if args.decisions else None;decisions=decision_file['decisions'] if decision_file else [];decision_summary={'model':decision_file['model'],'frames':len(decisions),'costUSD':decision_file['costUSD'],'legAgreed':0,'legDisagreed':[],'legExchanged':[]} if decision_file else None
if not args.no_leg_repair:
 height=float(np.median([r['bbox'][3]-r['bbox'][1] for r in rows]));apart=lambda a,b:float(np.linalg.norm(a[:2]-b[:2]))/height;sides={'left':(13,15,14,16),'right':(14,16,13,15)};trusted={s:[] for s in sides}
 # Blur can also make the detector exchange the two legs for a frame. Legs move continuously in the image, so when swapping
 # the labels back removes most of a large frame-to-frame jump, the frame's left and right knee and ankle are exchanged.
 # Which leg is which can only be judged between frames where the legs are apart. When the detector has drawn them on top of
 # each other, either labelling fits equally well, so such frames are neither tested nor used as the reference.
 together=lambda f:apart(raw[f,13],raw[f,14])<.2 and apart(raw[f,15],raw[f,16])<.2;ref=0
 def island(i):
  # Length of the clear run ending just before frame i, if an overlapped frame comes right before that run; otherwise 0.
  n=0
  while i-1-n>=0 and not together(i-1-n):n+=1
  return n if i-1-n>=0 and n<i else 0
 # Vision decisions: where the model is confident which of the performer's legs is raised and the detector has the other leg
 # clearly higher, the labels are exchanged there and in the neighbouring frames that continue the same legs.
 exchange=lambda f:raw.__setitem__((f,[13,14,15,16]),raw[f,[14,13,16,15]])
 # Where a firm answer agrees with the detector's own labels, those labels are pinned: the swap repairs below may not
 # exchange legs at such a frame or the one either side of it. The answers veto repairs; they do not relabel anything themselves.
 pinned=set();blocked=lambda f:any(g in pinned for g in range(f-1,f+2))
 # A single answer is not trusted: the same leg must be named, with confidence, in a neighbouring answer within 0.25 s.
 firm=lambda d:d['raisedLeg'] in ('left','right') and d['confidence']!='low'
 for n,d in enumerate(decisions):
  if not firm(d) or not any(firm(o) and o['raisedLeg']==d['raisedLeg'] and abs(o['time']-d['time'])<=.25 for o in decisions[max(0,n-1):n]+decisions[n+1:n+2]):continue
  i=int(np.argmin(np.abs(times-d['time'])));higher='left' if raw[i,15,1]<raw[i,16,1] else 'right'
  if abs(times[i]-d['time'])>.03 or together(i) or abs(raw[i,15,1]-raw[i,16,1])/height<.15 or higher==d['raisedLeg']:
   if abs(times[i]-d['time'])<=.03 and not together(i) and higher==d['raisedLeg'] and abs(raw[i,15,1]-raw[i,16,1])/height>=.15:
    decision_summary['legAgreed']+=1
    # Only a detection the detector itself is sure of is worth pinning; a blurred, half-lost leg can agree by chance.
    if min(raw[i,j,2] for j in (13,14,15,16))>=.9:pinned.add(i)
   continue
  decision_summary['legDisagreed'].append(round(float(d['clipTime']),2))
  # Exchanging on these answers is off by default: in trials the model's left/right answers were not consistent enough.
  if not args.exchange_legs_on_decisions:continue
  exchange(i);changed=[i]
  for step in (1,-1):
   j=i+step
   while 0<=j<len(raw) and not together(j) and sum(apart(raw[j,a],raw[j-step,b]) for a,b in ((13,14),(14,13),(15,16),(16,15)))<sum(apart(raw[j,a],raw[j-step,a]) for a in (13,14,15,16)):exchange(j);changed.append(j);j+=step
  decision_summary['legExchanged'].append({'time':float(d['time']),'frames':len(changed)});swapped.extend({'frame':int(c),'time':float(times[c]),'jumpBodyHeights':0.0} for c in changed)
 for i in range(1,len(raw)):
  if together(i):continue
  keep=sum(apart(raw[i,j],raw[ref,j]) for j in (13,14,15,16));swap=sum(apart(raw[i,a],raw[ref,b]) for a,b in ((13,14),(14,13),(15,16),(16,15)))
  # Across a gap of overlapped frames a leg may really have moved far, so identity is only corrected between adjacent frames.
  if ref==i-1 and keep>.5 and swap<.5*keep and blocked(i):vetoed.append(float(times[i]))
  elif ref==i-1 and keep>.5 and swap<.5*keep:raw[i,[13,14,15,16]]=raw[i,[14,13,16,15]];swapped.append({'frame':i,'time':float(times[i]),'jumpBodyHeights':keep})
  ref=i
 # A lost leg starts either merged onto the other leg at reduced confidence after a jump, or with a one-frame jump no real leg
 # makes (0.45 body heights). It stays lost, for at most twelve frames, while it is merged or its knee or ankle is below 0.9.
 # The jump limit depends on how fast the footage plays: 0.7 body heights a frame in real time, where a fast kick really
 # does cover a lot of ground between frames, down to 0.5 at half speed.
 hips={'left':11,'right':12};usual={s:float(np.median([apart(raw[f,hips[s]],raw[f,sides[s][0]])+apart(raw[f,sides[s][0]],raw[f,sides[s][1]]) for f in range(len(raw))])) for s in sides};lost={s:False for s in sides};limit=.3+.4*args.speed
 # When both legs are drawn together for a stretch, the leg that is really elsewhere is the one that reappears far from where
 # the pair was drawn; the other was hanging there all along. That leg is lost for the whole stretch, plus the stub frames
 # just before it and until it reappears at full length.
 length=lambda s,f:apart(raw[f,hips[s]],raw[f,sides[s][0]])+apart(raw[f,sides[s][0]],raw[f,sides[s][1]]);forced={s:set() for s in sides};f=0
 while f<len(raw):
  if not together(f):f+=1;continue
  e=f
  while e+1<len(raw) and together(e+1):e+=1
  far=lambda g:max(apart(raw[g,sides[s][1]],raw[e,sides[s][1]]) for s in sides)>.3;clear=[g for g in range(e+1,min(len(raw),e+9)) if not together(g) and all(length(s,g)>=.6*usual[s] for s in sides)];after=next((g for g in clear if far(g)),clear[0] if clear else None)
  if e-f>=2 and after is not None:
   gap={s:apart(raw[after,sides[s][1]],raw[e,sides[s][1]]) for s in sides};away=max(sides,key=lambda s:gap[s]);stay=min(sides,key=lambda s:gap[s])
   # Feet that are simply together arrive and leave gradually; a dropout shows as a one-frame jump on the way in or out.
   snap=max(apart(raw[after,sides[away][1]],raw[after-1,sides[away][1]]),apart(raw[f,sides[away][1]],raw[f-1,sides[away][1]]) if f else 0)
   if away!=stay and gap[away]>.3 and gap[away]>2*gap[stay] and snap>.25:
    # The leg that reappears must be the one that was out before the stretch. If the labels say it was the other one (the leg
    # farther from where the pair was drawn), the two were exchanged on the way in, and the clear frames just before are relabelled.
    g=f-1
    if g>=0 and not together(g) and apart(raw[g,sides[stay][1]],raw[e,sides[stay][1]])>apart(raw[g,sides[away][1]],raw[e,sides[away][1]])+.15 and any(blocked(q) for q in range(max(0,g-8),g+1)):
     # The labels before the stretch are pinned, so the leg that was out keeps its name and the exchange happened on the way
     # out instead: the frames from the stretch to the end of the clear run after it are relabelled, unless they are pinned too.
     vetoed.append(float(times[g]));h=after
     while h<len(raw) and not together(h):h+=1
     if not any(blocked(q) for q in range(f,h)):
      for q in range(f,h):raw[q,[13,14,15,16]]=raw[q,[14,13,16,15]];swapped.append({'frame':q,'time':float(times[q]),'jumpBodyHeights':0.0})
      away,stay=stay,away;relabelled_after.append({'from':float(times[f]),'to':float(times[h-1])})
    elif g>=0 and not together(g) and apart(raw[g,sides[stay][1]],raw[e,sides[stay][1]])>apart(raw[g,sides[away][1]],raw[e,sides[away][1]])+.15:
     while g>=0 and f-g<=8 and not together(g):raw[g,[13,14,15,16]]=raw[g,[14,13,16,15]];swapped.append({'frame':g,'time':float(times[g]),'jumpBodyHeights':0.0});g-=1
    first=f
    while first>0 and f-first<6 and length(away,first-1)<.6*usual[away]:first-=1
    forced[away].update(range(first,after));forced[away].add(-after-1);forced[stay].update(-g-1 for g in range(f,after))
  f=e+1
 # Last check on the labels: a clear run of at most four frames that starts right after an overlapped stretch and whose
 # labels are the exchange of the frame that follows it is relabelled to match that frame.
 for i in range(2,len(raw)):
  n=island(i)
  if together(i) or not 0<n<=4:continue
  keep=sum(apart(raw[i,j],raw[i-1,j]) for j in (13,14,15,16));swap=sum(apart(raw[i,a],raw[i-1,b]) for a,b in ((13,14),(14,13),(15,16),(16,15)))
  if keep>1 and swap<.6*keep:
   for q in range(i-n,i):raw[q,[13,14,15,16]]=raw[q,[14,13,16,15]];swapped.append({'frame':q,'time':float(times[q]),'jumpBodyHeights':keep})
   for side in sides:forced[side]={g for g in forced[side] if not (i-n<=g<i or i-n<=-g-1<i)}
 for i in range(len(raw)):
  merged=apart(raw[i,13],raw[i,14])<.2 and apart(raw[i,15],raw[i,16])<.2;jump={s:(apart(raw[i,sides[s][1]],raw[trusted[s][-1],sides[s][1]]) if trusted[s] else 0) for s in sides};sure=min(raw[i,j,2] for j in (13,14,15,16))>=.9;weak=max(sides,key=lambda s:jump[s]) if sure else min(sides,key=lambda s:min(raw[i,sides[s][0],2],raw[i,sides[s][1],2]))
  for side,(knee,ankle,_,_) in sides.items():
   last=trusted[side][-1] if trusted[side] else None;low=min(raw[i,knee,2],raw[i,ankle,2])<.9
   # A swing does not reverse in one frame: a leg that snaps onto the other leg against the way it was moving is lost too.
   back=trusted[side][-3] if len(trusted[side])>=3 else None;reverse=back is not None and i-last==1 and jump[side]>.15 and float(np.dot(raw[i,ankle,:2]-raw[last,ankle,:2],raw[last,ankle,:2]-raw[back,ankle,:2]))<0
   start=last is not None and (merged and side==weak and (low and (jump[side]>.3 or reverse) or jump[side]>limit and i-last<=4) or i-last==1 and jump[side]>limit and side==max(sides,key=lambda s:jump[s]))
   # One good-looking frame does not end a lost run; the next frame must look good too.
   ahead=i+1<len(raw) and (min(raw[i+1,knee,2],raw[i+1,ankle,2])<.9 or apart(raw[i+1,13],raw[i+1,14])<.2 and apart(raw[i+1,15],raw[i+1,16])<.2)
   # A lost leg is not found again while it is drawn as a stub: thigh plus shank under 60% of that leg's usual image length.
   short=lambda f:apart(raw[f,hips[side]],raw[f,knee])+apart(raw[f,knee],raw[f,ankle])<.6*usual[side];stub=short(i);ahead=ahead or i+1<len(raw) and short(i+1)
   lost[side]=start or lost[side] and i-last<=20 and (merged or low or ahead or stub)
   if i in forced[side]:lost[side]=True
   elif -i-1 in forced[side]:lost[side]=False
   if lost[side]:repaired.append({'side':side,'frame':i,'time':float(times[i]),'confidence':float(min(raw[i,knee,2],raw[i,ankle,2])),'jumpBodyHeights':jump[side]})
   else:trusted[side].append(i)
 # Lost frames are bridged between the trusted frames on either side. The knee and ankle swing about the hip rather than moving in
 # a straight line, and of the two ways round they take the one that does not pass through the other leg.
 wrap=lambda a:(a+np.pi)%(2*np.pi)-np.pi;reach_max={s:float(max(np.linalg.norm(raw[f,sides[s][1],:2]-raw[f,11 if s=='left' else 12,:2]) for f in trusted[s])) if trusted[s] else 0 for s in sides}
 for side,(knee,ankle,_,other) in sides.items():
  bad=[x['frame'] for x in repaired if x['side']==side];good=trusted[side];hip=11 if side=='left' else 12
  for j in (knee,ankle):
   for k in range(2):raw[bad,j,k]=np.interp(times[bad],times[good],raw[good,j,k])
   raw[bad,j,2]=.25
  runs=np.split(np.array(bad,dtype=int),np.flatnonzero(np.diff(bad)>1)+1) if bad else []
  for run in runs:
   a=run[0]-1;b=run[-1]+1
   if a<0 or b>=len(raw) or a not in good or b not in good:continue
   polar=lambda f,j:(np.arctan2(raw[f,j,1]-raw[f,hip,1],raw[f,j,0]-raw[f,hip,0]),float(np.linalg.norm(raw[f,j,:2]-raw[f,hip,:2])))
   # A leg pointing toward or away from the camera looks short. Its bridge is a straight line in the image (already filled in
   # above); swinging such a short leg round the hip would invent a dip or a high arc that was never there.
   if min(length(side,a),length(side,b))<.6*usual[side]:bridged.append({'side':side,'from':float(times[a]),'to':float(times[b]),'sweepDegrees':0.0});continue
   (ta,ra),(tb,rb)=polar(a,ankle),polar(b,ankle);sweep=wrap(tb-ta);blocker=wrap(np.arctan2(np.mean(raw[run,other,1]-raw[run,hip,1]),np.mean(raw[run,other,0]-raw[run,hip,0]))-ta)
   # Going the long way round is only considered for a wide swing; a short one cannot be dodging the other leg.
   if abs(sweep)>np.pi/2 and .25<blocker/sweep<.75:sweep-=2*np.pi*np.sign(sweep)
   # A swing keeps turning the way it was turning. If the leg was rotating about the hip one way going into the gap (and not
   # the other way coming out), the bridge continues that way even when it is the long way round.
   spin=lambda x,y:wrap(polar(y,ankle)[0]-polar(x,ankle)[0])/max(1,y-x) if x is not None and y is not None else 0.0
   before=next((q for q in range(a-1,max(-1,a-4),-1) if q in good),None);later=next((q for q in range(b+1,min(len(raw),b+4)) if q in good),None);entry=spin(before,a);leaving=spin(b,later)
   if abs(entry)>np.radians(3) and entry*sweep<0 and leaving*entry>=0 and abs(sweep)>np.pi/3:sweep+=2*np.pi*np.sign(entry)
   # The leg keeps its shape across the gap: the thigh turns about the hip by about the same amount as the whole leg, and the
   # knee bend and segment lengths ease from their value going in to their value coming out. Bridging knee and ankle as two
   # separate arcs let them turn by different amounts, which folded a straight kicking leg in the middle of the gap.
   seg=lambda f,p,q:(np.arctan2(raw[f,q,1]-raw[f,p,1],raw[f,q,0]-raw[f,p,0]),float(np.linalg.norm(raw[f,q,:2]-raw[f,p,:2])))
   (ta_,la_),(tb_,lb_)=seg(a,hip,knee),seg(b,hip,knee);(sa_,ma_),(sb_,mb_)=seg(a,knee,ankle),seg(b,knee,ankle);turn=min((wrap(tb_-ta_)+2*np.pi*k for k in (-1,0,1)),key=lambda c:abs(c-sweep));bend_a=wrap(sa_-ta_);bend=wrap(wrap(sb_-tb_)-bend_a)
   for f in run:
    u=(times[f]-times[a])/(times[b]-times[a]);thigh=ta_+turn*u;shank=thigh+bend_a+bend*u;raw[f,knee,:2]=raw[f,hip,:2]+(la_+(lb_-la_)*u)*np.array([np.cos(thigh),np.sin(thigh)]);raw[f,ankle,:2]=raw[f,knee,:2]+(ma_+(mb_-ma_)*u)*np.array([np.cos(shank),np.sin(shank)])
   bridged.append({'side':side,'from':float(times[a]),'to':float(times[b]),'sweepDegrees':float(np.degrees(sweep))})
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
result={'schemaVersion':1,'status':'estimated-draft-unreviewed','backend':'MotionBERT-Lite H36M global pose','modelSHA256':hashlib.sha256(path.read_bytes()).hexdigest(),'sourceCodeCommit':subprocess.check_output(['git','-C',str(vendor),'rev-parse','HEAD'],text=True).strip(),'checkpointURL':'https://huggingface.co/walterzhu/MotionBERT/resolve/main/checkpoint/pose3d/FT_MB_lite_MB_ft_h36m_global_lite/best_epoch.bin','sourceSHA256':report['sourceSHA256'],'sourcePose':args.pose,'frameRate':30,'recordingInterval':report['interval'],'times':uniform.tolist(),'jointNames':names,'coordinates':'learned camera-space normalized x-right/y-down/z-depth; relative scale, not metric','rootRelativePositions':relative.tolist(),'rawModelPositions':draft.tolist(),'raw2DModelPositions':raw3d.tolist(),'preparedInput':prepared.tolist(),'synthesizedJoints':['pelvis midpoint','neck shoulder midpoint','spine midpoint','head extrapolated from nose/neck'],'rootTravel':'Not reconstructed in world space; image pelvis movement retained for explicit screen-space trajectory approximation','imagePelvis':((coco[:,11,:2]+coco[:,12,:2])/2).tolist(),'faceDirection':face.tolist(),'lowestAnkleImageY':np.maximum(coco[:,15,1],coco[:,16,1]).tolist(),'inputNormalization':{'centerPixels':center.tolist(),'scalePixels':scale,'resampling':'linear interpolation on uniform30Hz grid, endpoint clamp; not new observed frames','filter':'3-sample median xy; confidence retained'},'observedFrames':observed,'repairedLegObservations':repaired,'swappedLegObservations':swapped,'legArcBridges':bridged,'decisions':decisions,'decisionSummary':{**decision_summary,'repairsVetoed':len(vetoed),'relabelledAfterOverlap':relabelled_after} if decision_summary else None,'extendedLegReach':extended,'bridgedFrames':observed-len(rows),'firstBoxHeightPixels':rows[0]['bbox'][3]-rows[0]['bbox'][1],'timingsSeconds':{'imports':imports,'preparation':prep,'modelLoad':load,'firstInference':first,'warmInferences':runs,'rawInputInference':raw_infer,'processWall':time.perf_counter()-started},'limits':['No3D ground truth','COCO-to-H36M includes estimated axial joints','Single-view depth/twist/foot contact uncertain','No mirrored-side resolution','World root/metric scale absent']}
(out/'motion-ir.json').write_text(json.dumps(result));np.save(out/'positions.npy',relative);print(json.dumps({'shape':list(relative.shape),'timings':result['timingsSeconds'],'finite':bool(np.isfinite(relative).all())}))
