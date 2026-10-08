"""Bounded orthographic landmark fit, with depth prior and soft segment constraints."""
import argparse,json,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--out',required=True);p.add_argument('--stable',action='store_true');p.add_argument('--no-straight-knee-prior',action='store_true');p.add_argument('--no-knee-direction',action='store_true');p.add_argument('--no-turn-continuity',action='store_true');p.add_argument('--speed',type=float,default=1);p.add_argument('--peak-time',type=float,default=12.85);args=p.parse_args();started=time.perf_counter()
import numpy as np,torch
torch.set_num_threads(2);ir=json.loads(Path(args.input).read_text());prior=np.array(ir['rootRelativePositions'],np.float32);obs=np.array(ir['preparedInput'],np.float32);xy=obs[:,:,:2]-obs[:,0:1,:2]
raw_obs=obs.copy();rejected=[]
if args.stable:
 # Reject isolated spatial excursions only when neighbouring observations agree.
 for j in [2,3,5,6,12,13,15,16]:
  for i in range(1,len(obs)-1):
   mid=(raw_obs[i-1,j,:2]+raw_obs[i+1,j,:2])/2;error=np.linalg.norm(raw_obs[i,j,:2]-mid);span=np.linalg.norm(raw_obs[i-1,j,:2]-raw_obs[i+1,j,:2])
   if error>.18 and span<.18:
    obs[i,j,:2]=mid;obs[i,j,2]*=.25;rejected.append({'frame':i,'joint':j,'time':ir['times'][i],'normalizedError':float(error)})
 xy=obs[:,:,:2]-obs[:,0:1,:2]
# Estimate one clip-wide camera scale using torso/hip distances, not the kick maximum.
edges=[(0,1),(1,2),(2,3),(0,4),(4,5),(5,6),(0,7),(7,8),(8,9),(9,10),(8,11),(11,12),(12,13),(8,14),(14,15),(15,16)]
ratios=[]
for a,b in [(0,8),(1,4),(11,14)]:
 d=np.linalg.norm(xy[:,a]-xy[:,b],axis=1);m=np.linalg.norm(prior[:,a,:2]-prior[:,b,:2],axis=1);valid=d>.05;ratios.extend((m[valid]/d[valid]).tolist())
scale=float(np.median(ratios));target=xy*scale
lengths=[max(float(np.median(np.linalg.norm(prior[:,a]-prior[:,b],axis=1))),float(np.quantile(np.linalg.norm(target[:,a]-target[:,b],axis=1),.95))) for a,b in edges]
# A body turns smoothly and keeps turning the same way. How far the shoulders (or hips) are turned from the camera is read
# from how wide they look: full width facing the camera or away, zero width side-on. That gives the turn angle up to its sign;
# the sign follows the lift from frame to frame, except where the lift jumps, and there the turn under way continues.
# The lift on its own can flip a side-on body front to back in one frame. Only the depth of the two joints is rewritten.
turn_report={}
# Vision decisions give the facing in four coarse classes. A candidate turn more than 60 degrees from the class seen at that
# time is penalized, which settles front-or-back where the shoulders alone cannot.
facing_yaw={'toward_camera':0.0,'image_right':np.pi/2,'away_from_camera':np.pi,'image_left':-np.pi/2};clock=np.array(ir['times']);seen_at={}
# A body does not turn half a circle between two answers a tenth of a second apart. Two neighbouring answers that point opposite
# ways cannot both be right and there is no telling which is, so neither is used.
answers=sorted(ir.get('decisions') or [],key=lambda d:d['time']);opposite=lambda a,b:abs(abs(facing_yaw[a['facing']]-facing_yaw[b['facing']])-np.pi)<1e-6;contradicted={i for i in range(len(answers)) for j in (i-1,i+1) if 0<=j<len(answers) and abs(answers[i]['time']-answers[j]['time'])<.25*max(args.speed,.4)/.5 and opposite(answers[i],answers[j])}
for d in [a for i,a in enumerate(answers) if i not in contradicted]:
# Face and chest point the same way most of the time, and catch up with each other quickly when they do not. So a chest answer
# given with low confidence still counts when the face, judged separately, points the same way.
 if d['confidence']!='low' or d.get('faceFacing')==d['facing']:seen_at[int(np.argmin(np.abs(clock-d['time'])))]=facing_yaw[d['facing']]
def seen(i,c):
 near=[j for j in (i,i-1,i+1) if j in seen_at]
 return 0.0 if not near else 3*max(0.0,abs((c-seen_at[near[0]]+np.pi)%(2*np.pi)-np.pi)-np.radians(60))
def keep_turning(left,right,name,follow=None,limbs=()):
 d=prior[:,left]-prior[:,right];width=float(np.median(np.linalg.norm(d,axis=1)));dx=target[:,left,0]-target[:,right,0];dy=target[:,left,1]-target[:,right,1];flat=np.sqrt(np.maximum(width**2-dy**2,(.3*width)**2));angle=np.arccos(np.clip(dx/flat,-1,1))
 lift=np.unwrap(np.arctan2(d[:,2],d[:,0]));yaw=np.zeros(len(lift));yaw[0]=min((sign*angle[0]+2*np.pi*k for sign in (1,-1) for k in range(-3,4)),key=lambda c:abs(c-(lift[0] if follow is None else follow[0]))+seen(0,c));speed=float(np.median(np.diff(lift[:6]))) if len(lift)>6 else 0
 for i in range(1,len(lift)):
  step=(lift[i]-lift[i-1]+np.pi)%(2*np.pi)-np.pi
  # The lift's own step is believed unless it turns too far in one frame (100 degrees at half-speed footage, scaled with
  # footage speed); then the turn under way continues.
  guess=follow[i] if follow is not None else yaw[i-1]+(step if abs(step)<np.radians(min(170,200*args.speed)) else speed);options=[sign*angle[i]+2*np.pi*k for sign in (1,-1) for k in range(-6,7)];yaw[i]=min(options,key=lambda c:abs(c-guess)+(.5*abs(c-yaw[i-1]) if follow is not None else 0)+.15*abs((c-lift[i]+np.pi)%(2*np.pi)-np.pi)+seen(i,c));speed=.7*speed+.3*(yaw[i]-yaw[i-1])
 middle=(prior[:,left,2]+prior[:,right,2])/2;depth=flat*np.sin(yaw)/2
 # Where the turn chosen here puts the other shoulder (or hip) nearer the camera than the lift did, the lift's limbs belong to
 # the mirror-image body. Their depths are mirrored about the joint pair too, which leaves the picture unchanged. Otherwise a
 # leg keeps the depth it had for the opposite facing and ends up on the wrong side of the body, through the trunk.
 mirrored=(np.sin(yaw)*np.sin(lift)<0)&(np.abs(np.sin(yaw))>.3)&(np.abs(np.sin(lift))>.3)
 for j in limbs:prior[mirrored,j,2]=2*middle[mirrored]-prior[mirrored,j,2]
 changed=float(np.degrees(np.abs((yaw-lift+np.pi)%(2*np.pi)-np.pi)).max());prior[:,left,2]=middle+depth;prior[:,right,2]=middle-depth
 turn_report[name]={'maxDegreesFromLift':changed,'totalTurnDegrees':float(np.degrees(yaw[-1]-yaw[0])),'mirroredLimbFrames':int(mirrored.sum()),'yawDegrees':[round(float(v)) for v in np.degrees(yaw)],'liftDegrees':[round(float(v)) for v in np.degrees(lift)]};return yaw
# The hips are narrow in the image and carry little signal, so they take the shoulder turn as their guide.
if not args.no_turn_continuity:keep_turning(4,1,'hips',keep_turning(11,14,'shoulders',limbs=(12,13,15,16)),limbs=(2,3,5,6))
prior_t=torch.tensor(prior);target_t=torch.tensor(target);conf=torch.tensor(np.minimum(obs[:,:,2],obs[:,0:1,2]));conf[:,0]=1
# A side view supports a near-straight-knee prior only where the observed 2D knee is near straight. Other camera angles must disable it.
# A leg counts as raised when its ankle is well above the other ankle, or no more than half a leg length below its own hip
# (so it also holds when both feet are off the floor). A raised (kicking) leg is pulled to fully straight. A planted leg is only kept from folding below 160 degrees: seen from
# the front it looks straight in 2D even when slightly flexed, and a locked 180-degree standing knee is not natural. The
# floor follows the observed 2D angle when that is below 160, so it never switches on and off as a bent knee nears straight.
straight=[];slack=[1.0]*len(edges);knee_weight=0 if args.no_straight_knee_prior else 3
for h,k,f in [(1,2,3),(4,5,6)]:
 other=6 if f==3 else 3;leg=lengths[edges.index((h,k))]+lengths[edges.index((k,f))];raised=torch.maximum(torch.clamp(((target_t[:,other,1]-target_t[:,f,1])/leg-.25)/.25,0,1),torch.clamp((.5-(target_t[:,f,1]-target_t[:,h,1])/leg)/.25,0,1));u=target_t[:,h]-target_t[:,k];v=target_t[:,f]-target_t[:,k];cos=(u*v).sum(-1)/(torch.linalg.vector_norm(u,dim=-1)*torch.linalg.vector_norm(v,dim=-1)).clamp_min(1e-6); # A raised leg uses a wider ramp (143-154 degrees): the knee point sits on the kneecap, so a straight raised leg can read 150.
 straight.append((h,k,f,(torch.maximum(torch.clamp((-cos-.90)/.09,0,1),torch.clamp((-cos-.80)/.10,0,1)*raised) if args.stable else (cos<-.96).float())*torch.minimum(conf[:,k],conf[:,f]),raised,torch.minimum(conf[:,k],conf[:,f]),cos.clamp(min=-.94)))
 # A raised straight leg often looks short in the image (hip and ankle points drift inward). Read through segment lengths that
 # becomes a large depth tilt, so there the length term is relaxed and the leg keeps the depth of the starting estimate.
 if knee_weight:
  for edge in ((h,k),(k,f)):slack[edges.index(edge)]=1-.98*(torch.clamp((-cos-.80)/.10,0,1)*raised)
# Which way the trunk faces is set almost entirely by the depth of the hips and shoulders, which the image barely constrains.
# Left free, the fit turned the trunk by up to 50 degrees from the lift, frame to frame; trunk depth now stays with the lift.
trunk=[0,1,4,7,8,9,10,11,14]
trunk_z=prior[:,trunk,2].copy()
# Two passes of a five-sample filter (about a fifth of a second), edges held, so lift jitter does not reach the limbs.
for _ in range(2):trunk_z=np.stack([np.convolve(np.pad(trunk_z[:,j],2,mode='edge'),np.array([1,4,6,4,1],np.float32)/16,mode='valid') for j in range(len(trunk))],1)
trunk_target=torch.tensor(trunk_z.astype(np.float32))
unit=lambda v:torch.nn.functional.normalize(v,dim=-1)
# Legs are solid: points along one leg must stay at least their combined radii from points along the other. Where the legs
# overlap in the image this can only be met in depth, and the starting estimate decides which leg is in front.
hip_width=float(np.median(np.linalg.norm(prior[:,1]-prior[:,4],axis=1)));samples=[(.33,.30),(.67,.30),(1,.30)],[(.33,.26),(.67,.22),(1,.17)]
def leg_points(v,h,k,f):return [(v[:,h]+(v[:,k]-v[:,h])*u,r*hip_width) for u,r in samples[0]]+[(v[:,k]+(v[:,f]-v[:,k])*u,r*hip_width) for u,r in samples[1]]
def leg_gap(v):return torch.stack([torch.relu(ra+rb-torch.linalg.vector_norm(a-b+1e-9,dim=-1)) for a,ra in leg_points(v,1,2,3) for b,rb in leg_points(v,4,5,6)])
# A leg bridged across a detector dropout has no observed depth. A kicking leg passes in front of the trunk, never through the
# back of it, so inside each bridge the knee and ankle are kept on the chest side of the pelvis (fading in from the bridge ends).
front=[]
for bridge in ir.get('legArcBridges',[]):
 knee,ankle=(5,6) if bridge['side']=='left' else (2,3);u=np.clip((np.array(ir['times'])-bridge['from'])/max(bridge['to']-bridge['from'],1e-6),0,1);weight=np.sin(np.pi*u)
 # Where a second look found the leg (lift.py), its place in the picture is an observation and outranks this assumption: a leg
 # held out to the side can sit level with the back, and pulling it forward folded it against the body.
 for look in ir.get('reobservedLegFrames',[]):
  if look['side']==bridge['side']:at=int(np.argmin(np.abs(np.array(ir['times'])-look['time'])));weight[max(0,at-1):at+2]=0
 weight=torch.tensor(weight.astype(np.float32))
 if float(weight.max())>0:front.append((knee,ankle,weight))
facing=unit(torch.linalg.cross(prior_t[:,11]-prior_t[:,14],prior_t[:,8]-prior_t[:,0],dim=-1))
def behind(v):return torch.stack([(torch.relu(m*hip_width-((v[:,j]-v[:,0])*facing).sum(-1)).square()*weight).mean() for knee,ankle,weight in front for j,m in ((knee,.5),(ankle,1.0))]).mean() if front else torch.zeros(())
# Knees only bend one way. Seen from one camera a bent leg has two depth solutions, mirror images of each other, and the wrong
# one bends the knee backward. The knee is kept on the front side of the hip-to-ankle line, front being the way the pelvis faces
# in the starting estimate; the penalty grows with how bent the leg is, so a straight leg is left alone.
pelvis_front=unit(torch.linalg.cross(prior_t[:,4]-prior_t[:,1],prior_t[:,8]-prior_t[:,0],dim=-1))
def backward(v):
 terms=[]
 for h,k,f in ((1,2,3),(4,5,6)):
  out=v[:,k]-(v[:,h]+v[:,f])/2;bend=torch.linalg.vector_norm(out,dim=-1).detach();terms.append((torch.relu(.3*bend-(out*pelvis_front).sum(-1)).square()*(bend>.25*hip_width)).mean())
 return torch.stack(terms).mean()
# Each leg stays on its own side of the body. Seen side-on, the two legs overlap in the image and their depths can come out
# exchanged, which reads as the legs swapping. A knee may cross the body's midline by 0.3 hip widths and an ankle by 0.8 (a
# cross-step), no further; left and right are taken from the hips in the starting estimate.
to_left=unit(prior_t[:,4]-prior_t[:,1])
def crossed(v):return torch.stack([torch.relu(-sign*((v[:,j]-v[:,0])*to_left).sum(-1)-m*hip_width).square().mean() for sign,joints in ((1,(5,6)),(-1,(2,3))) for j,m in zip(joints,(.3,.8))]).mean()
# Body parts are solid: none sits inside another or passes through it. The check is made on the character, not on the lifted
# skeleton, because the character is what is seen and its build differs (trunk half as long again, shoulders nearly twice as
# wide for the same hips). The character's joints are rebuilt here from this skeleton's directions, the way the retarget does,
# with the rig's own lengths (metres at character scale 1; retarget-report.json rigProportions). Each part is a rod with a
# radius: trunk 0.13 against legs and 0.11 against arms, head 0.10, thigh 0.075, shin 0.055, upper arm 0.045, forearm 0.04;
# knee 0.06, mid-shin 0.055, ankle 0.045, elbow and mid-forearm 0.04, wrist 0.035. Shins, ankles, elbows, forearms and wrists must stay
# clear of the trunk, and those and the knees clear of the head; elbows, forearms and wrists also of both legs and of the other arm. Leg
# against leg is leg_gap above. Two parts can only be inside each other if they overlap in the picture, and the picture is what
# was observed, so the parts are moved apart toward or away from the camera only.
RIG={'hip':.089,'shoulder':.192,'trunk':.572,'head':.083,'crown':.12,'shoulder_drop':.047,'thigh':.4,'shin':.429,'upper_arm':.274,'forearm':.273}
depth_only=lambda p:torch.cat([p[...,:2].detach(),p[...,2:]],-1)
limb_joint=torch.tensor([j in (2,3,5,6,12,13,15,16) for j in range(17)])[None,:,None]
def body_gaps(v):
 # Only knees, ankles, elbows and wrists may be moved to make room. Left free, the fit made room by shifting a hip joint and
 # stretching the thigh instead (the bone-length rule is relaxed for a raised straight leg), which turned the pelvis into the leg.
 z=depth_only(v);z=torch.where(limb_joint,z,z.detach());d=lambda a,b:unit(z[:,b]-z[:,a]);up=d(0,8);pelvis=torch.zeros_like(z[:,0]);neck=up*RIG['trunk']
 # Pelvis frame (hip line kept, up squared to it) and torso frame (spine kept, shoulder line squared to it), as in retarget.ts.
 hips=d(1,4);rise=unit(up-(up*hips).sum(-1,keepdim=True)*hips);front=torch.linalg.cross(hips,rise,dim=-1);wide=z[:,11]-z[:,14];wide=unit(wide-(wide*up).sum(-1,keepdim=True)*up);chest=torch.linalg.cross(wide,up,dim=-1);head=neck+up*.082+chest*.01;crown=head+up*RIG['crown']
 # How far a point is inside a rod, to be undone in depth: where the point is closer to the rod in the picture than the two
 # radii allow, it must be at least the remaining distance in front of or behind it. It is pushed to the side it is on;
 # a point at exactly the rod's depth has no side, and goes toward the camera (measuring plain distance gave no push at all
 # there, which left a part stuck in the middle of another).
 def inside(point,a,b,room):
  ab=b-a;u=torch.clamp(((point-a)*ab).sum(-1)/ab.square().sum(-1).clamp_min(1e-9),0,1).detach();nearest=a+u[:,None]*ab;across=(point[:,:2]-nearest[:,:2]).square().sum(-1).detach();behind_by=point[:,2]-nearest[:,2];side=torch.where(behind_by.detach()>1e-4,1.0,-1.0)
  return torch.sqrt(torch.relu(room*room-across)+1e-12)-side*behind_by
 legs={};arms={};gaps=[]
 for side,sign,(h,k,f),(s,e,w) in (('l',1,(4,5,6),(11,12,13)),('r',-1,(1,2,3),(14,15,16))):
  hip=sign*hips*RIG['hip']+rise*.019+front*.05;knee=hip+d(h,k)*RIG['thigh'];legs[side]=(hip,knee,knee+d(k,f)*RIG['shin']);shoulder=neck-up*.05-chest*.052+sign*wide*RIG['shoulder'];elbow=shoulder+d(s,e)*RIG['upper_arm'];arms[side]=(shoulder,elbow,elbow+d(e,w)*RIG['forearm'])
 for hip,knee,ankle in legs.values():
  # The knee gets a slimmer trunk (0.10) than the shin and ankle: a thigh can lie along the chest in a high kick past the shoulder.
  gaps+=[inside(knee,head,crown,.1+.06),inside(knee,pelvis,neck,.1+.06)]
  for point,r in (((knee+ankle)/2,.055),(ankle,.045)):gaps+=[inside(point,pelvis,neck,.13+r),inside(point,head,crown,.1+r)]
 for side,(shoulder,elbow,wrist) in arms.items():
  other=arms['l' if side=='r' else 'r']
  for point,r in ((elbow,.04),((elbow+wrist)/2,.04),(wrist,.035)):
   gaps+=[inside(point,pelvis,neck,.11+r),inside(point,head,crown,.1+r)]
   for hip,knee,ankle in legs.values():gaps+=[inside(point,hip,knee,.075+r),inside(point,knee,ankle,.055+r)]
   if side=='r':gaps+=[inside(point,other[0],other[1],.045+r),inside(point,other[1],other[2],.04+r)]
 return torch.relu(torch.stack(gaps))
# No unnecessary movement: between a moment a and a moment c, the moment b in the middle lies on the way. Depth is never
# observed, so nothing in the picture stops a joint from going out toward the camera and back, or from jumping from behind the
# body to in front of it, while the picture shows a steady swing. For every joint and for spans of 2, 4 and 8 frames, depth at b
# may differ from the average of a and c by at most half the depth travelled from a to c, plus however far the picture itself
# shows b off the straight line from a to c (a real snap shows there), plus a small allowance.
def detour(v):
 terms=[]
 for k in (1,2,4):
  if len(v)<=2*k:continue
  z=v[:,:,2];off=(z[k:-k]-(z[2*k:]+z[:-2*k])/2).abs();travelled=(z[2*k:]-z[:-2*k]).abs()/2;seen_off=torch.linalg.vector_norm(target_t[k:-k]-(target_t[2*k:]+target_t[:-2*k])/2,dim=-1);terms.append(torch.relu(off-travelled-seen_off-.1*hip_width).square().mean())
 return torch.stack(terms).mean() if terms else torch.zeros(())
# A raised straight leg may come out longer or shorter than the body's (its ankle point slides on blurred frames, R7), but the
# knee stays where a knee is: thigh and shin keep their proportion. Otherwise the knee can slide to the hip or the ankle for a
# frame, and the thigh's direction, which is all the character takes from it, becomes noise.
def proportion(v):return torch.stack([(torch.linalg.vector_norm(v[:,k]-v[:,h],dim=-1)/lengths[edges.index((h,k))]-torch.linalg.vector_norm(v[:,f]-v[:,k],dim=-1)/lengths[edges.index((k,f))]).square().mean() for h,k,f in ((1,2,3),(4,5,6))]).mean()
# Knees and elbows fold to about 150 degrees and no further (textbook range 135-155), which leaves 30 degrees between the two
# segments. A tighter fold is the fit hiding a leg it could not place, not a pose.
def folded(v):return torch.stack([torch.relu((unit(v[:,h]-v[:,k])*unit(v[:,f]-v[:,k])).sum(-1)-.866).square().mean() for h,k,f in ((1,2,3),(4,5,6),(11,12,13),(14,15,16))]).mean()
x=torch.tensor(prior,requires_grad=True);optim=torch.optim.Adam([x],lr=.025);a=time.perf_counter()
for step in range(400):
 optim.zero_grad();projection=((x[:,:,:2]-target_t).square().sum(-1)*conf).mean();bone=torch.stack([((torch.linalg.vector_norm(x[:,b]-x[:,a],dim=-1)-lengths[i]).square()*slack[i]).mean() for i,(a,b) in enumerate(edges)]).mean();depth=(x[:,:,2]-prior_t[:,:,2]).square().mean();trunk_depth=(x[:,trunk,2]-trunk_target).square().mean();acc=(x[2:]-2*x[1:-1]+x[:-2]).square().mean();root=x[:,0].square().mean();collinear=torch.stack([((unit(x[:,h]-x[:,k])+unit(x[:,f]-x[:,k])).square().sum(-1)*raised*weight+4*torch.relu((unit(x[:,h]-x[:,k])*unit(x[:,f]-x[:,k])).sum(-1)-floor).square()*(1-raised)*seen).mean() for h,k,f,weight,raised,seen,floor in straight]).mean();depth_acc=(x[2:,:,2]-2*x[1:-1,:,2]+x[:-2,:,2]).square().mean();overlap=leg_gap(x).square().mean();loss=(6*depth_acc if args.stable else 0)+400*overlap+400*behind(x)+(0 if args.no_knee_direction else 400)*(backward(x)+crossed(x))+400*folded(x)+8*proportion(x)+400*detour(x)+2000*body_gaps(x).square().mean()+knee_weight*collinear+12*projection+8*bone+.5*depth+20*trunk_depth+(.8 if args.stable else .015)*acc+30*root;loss.backward();optim.step()
elapsed=time.perf_counter()-a;fitted=x.detach().numpy();fitted-=fitted[:,0:1]
def angles(v):
 a=v[:,1]-v[:,2];b=v[:,3]-v[:,2];return np.degrees(np.arccos(np.clip((a*b).sum(-1)/np.linalg.norm(a,axis=-1)/np.linalg.norm(b,axis=-1),-1,1)))
peak=int(np.argmin(abs(np.array(ir['times'])-args.peak_time)))
def left(v):return v[:,[0,4,5,6]]
extension={side:{'time':float(ir['times'][int(np.argmax(a))]),'degrees':float(a.max()),'before':float(b[int(np.argmax(a))])} for side,a,b in [('right',angles(fitted),angles(prior)),('left',angles(left(fitted)),angles(left(prior)))]};out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
report={'algorithm':'orthographic-landmark-fit-stable-v2' if args.stable else 'orthographic-landmark-fit-v1','rejectedObservations':rejected,'iterations':400,'cameraScale':scale,'fitSeconds':elapsed,'processWallSeconds':time.perf_counter()-started,'straightKneePrior':not args.no_straight_knee_prior,'maximumKneeExtension':extension,'rightKneePeakDegrees':{'before':float(angles(prior)[peak]),'after':float(angles(fitted)[peak])},'projectionRMS':float(np.sqrt(((fitted[:,:,:2]-target)**2).mean())),'segmentLengthRMS':float(np.sqrt(np.mean([(np.linalg.norm(fitted[:,b]-fitted[:,a],axis=-1)-lengths[i])**2 for i,(a,b) in enumerate(edges)]))),'turnContinuity':turn_report,'crossedLegs':{'before':float(crossed(prior_t)),'after':float(crossed(torch.tensor(fitted)))},'backwardKnee':{'before':float(backward(prior_t)),'after':float(backward(torch.tensor(fitted)))},'depthDetour':{'before':round(float(detour(prior_t)),6),'after':round(float(detour(torch.tensor(fitted))),6)},'bodyPartsInside':{k:{'frames':int((g.max(0).values>.02).sum()),'worstMeters':round(float(g.max()),3)} for k,g in (('before',body_gaps(prior_t)),('after',body_gaps(torch.tensor(fitted))))},'legOverlap':{'before':float(leg_gap(prior_t).max()),'after':float(leg_gap(torch.tensor(fitted)).max()),'units':'normalized estimate; 0 means no sampled leg points closer than their radii'},'limits':['Orthographic camera assumption','Soft segment lengths; runtime retarget preserves actual rig lengths','Occluded/misassigned observations may distort the fit',*([] if args.no_straight_knee_prior else ['Near-straight 2D knees assumed near-straight in 3D for this side-view fixture only']),'Depth prior remains ambiguous; no contacts or joint-limit solver']}
if args.stable:
 ir['preStabilityInput']=ir['preparedInput'];ir['preparedInput']=obs.tolist();original_root=np.array(ir['imagePelvis']);smoothed=original_root.copy()
 # Five-sample symmetric root-only filter; joint snap timing is not resampled.
 for i in range(2,len(smoothed)-2):smoothed[i]=(original_root[i-2]+4*original_root[i-1]+6*original_root[i]+4*original_root[i+1]+original_root[i+2])/16
 ir['unsmoothedImagePelvis']=ir['imagePelvis'];ir['imagePelvis']=smoothed.tolist();report['rootFilter']='5-sample binomial, endpoints retained; no contact claim'
ir['unfittedPositions']=ir['rootRelativePositions'];ir['rootRelativePositions']=fitted.tolist();ir['fitting']=report;ir['status']='observation-fitted-draft-unreviewed';(out/'motion-ir.json').write_text(json.dumps(ir));(out/'fit-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
