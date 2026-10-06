"""Bounded orthographic landmark fit, with depth prior and soft segment constraints."""
import argparse,json,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--out',required=True);p.add_argument('--stable',action='store_true');p.add_argument('--no-straight-knee-prior',action='store_true');p.add_argument('--peak-time',type=float,default=12.85);args=p.parse_args();started=time.perf_counter()
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
unit=lambda v:torch.nn.functional.normalize(v,dim=-1)
# Legs are solid: points along one leg must stay at least their combined radii from points along the other. Where the legs
# overlap in the image this can only be met in depth, and the starting estimate decides which leg is in front.
hip_width=float(np.median(np.linalg.norm(prior[:,1]-prior[:,4],axis=1)));samples=[(.33,.30),(.67,.30),(1,.30)],[(.33,.26),(.67,.22),(1,.17)]
def leg_points(v,h,k,f):return [(v[:,h]+(v[:,k]-v[:,h])*u,r*hip_width) for u,r in samples[0]]+[(v[:,k]+(v[:,f]-v[:,k])*u,r*hip_width) for u,r in samples[1]]
def leg_gap(v):return torch.stack([torch.relu(ra+rb-torch.linalg.vector_norm(a-b+1e-9,dim=-1)) for a,ra in leg_points(v,1,2,3) for b,rb in leg_points(v,4,5,6)])
x=torch.tensor(prior,requires_grad=True);optim=torch.optim.Adam([x],lr=.025);a=time.perf_counter()
for step in range(400):
 optim.zero_grad();projection=((x[:,:,:2]-target_t).square().sum(-1)*conf).mean();bone=torch.stack([((torch.linalg.vector_norm(x[:,b]-x[:,a],dim=-1)-lengths[i]).square()*slack[i]).mean() for i,(a,b) in enumerate(edges)]).mean();depth=(x[:,:,2]-prior_t[:,:,2]).square().mean();acc=(x[2:]-2*x[1:-1]+x[:-2]).square().mean();root=x[:,0].square().mean();collinear=torch.stack([((unit(x[:,h]-x[:,k])+unit(x[:,f]-x[:,k])).square().sum(-1)*raised*weight+4*torch.relu((unit(x[:,h]-x[:,k])*unit(x[:,f]-x[:,k])).sum(-1)-floor).square()*(1-raised)*seen).mean() for h,k,f,weight,raised,seen,floor in straight]).mean();depth_acc=(x[2:,:,2]-2*x[1:-1,:,2]+x[:-2,:,2]).square().mean();overlap=leg_gap(x).square().mean();loss=(6*depth_acc if args.stable else 0)+400*overlap+knee_weight*collinear+12*projection+8*bone+.12*depth+(.8 if args.stable else .015)*acc+30*root;loss.backward();optim.step()
elapsed=time.perf_counter()-a;fitted=x.detach().numpy();fitted-=fitted[:,0:1]
def angles(v):
 a=v[:,1]-v[:,2];b=v[:,3]-v[:,2];return np.degrees(np.arccos(np.clip((a*b).sum(-1)/np.linalg.norm(a,axis=-1)/np.linalg.norm(b,axis=-1),-1,1)))
peak=int(np.argmin(abs(np.array(ir['times'])-args.peak_time)))
def left(v):return v[:,[0,4,5,6]]
extension={side:{'time':float(ir['times'][int(np.argmax(a))]),'degrees':float(a.max()),'before':float(b[int(np.argmax(a))])} for side,a,b in [('right',angles(fitted),angles(prior)),('left',angles(left(fitted)),angles(left(prior)))]};out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
report={'algorithm':'orthographic-landmark-fit-stable-v2' if args.stable else 'orthographic-landmark-fit-v1','rejectedObservations':rejected,'iterations':400,'cameraScale':scale,'fitSeconds':elapsed,'processWallSeconds':time.perf_counter()-started,'straightKneePrior':not args.no_straight_knee_prior,'maximumKneeExtension':extension,'rightKneePeakDegrees':{'before':float(angles(prior)[peak]),'after':float(angles(fitted)[peak])},'projectionRMS':float(np.sqrt(((fitted[:,:,:2]-target)**2).mean())),'segmentLengthRMS':float(np.sqrt(np.mean([(np.linalg.norm(fitted[:,b]-fitted[:,a],axis=-1)-lengths[i])**2 for i,(a,b) in enumerate(edges)]))),'legOverlap':{'before':float(leg_gap(prior_t).max()),'after':float(leg_gap(torch.tensor(fitted)).max()),'units':'normalized estimate; 0 means no sampled leg points closer than their radii'},'limits':['Orthographic camera assumption','Soft segment lengths; runtime retarget preserves actual rig lengths','Occluded/misassigned observations may distort the fit',*([] if args.no_straight_knee_prior else ['Near-straight 2D knees assumed near-straight in 3D for this side-view fixture only']),'Depth prior remains ambiguous; no contacts or joint-limit solver']}
if args.stable:
 ir['preStabilityInput']=ir['preparedInput'];ir['preparedInput']=obs.tolist();original_root=np.array(ir['imagePelvis']);smoothed=original_root.copy()
 # Five-sample symmetric root-only filter; joint snap timing is not resampled.
 for i in range(2,len(smoothed)-2):smoothed[i]=(original_root[i-2]+4*original_root[i-1]+6*original_root[i]+4*original_root[i+1]+original_root[i+2])/16
 ir['unsmoothedImagePelvis']=ir['imagePelvis'];ir['imagePelvis']=smoothed.tolist();report['rootFilter']='5-sample binomial, endpoints retained; no contact claim'
ir['unfittedPositions']=ir['rootRelativePositions'];ir['rootRelativePositions']=fitted.tolist();ir['fitting']=report;ir['status']='observation-fitted-draft-unreviewed';(out/'motion-ir.json').write_text(json.dumps(ir));(out/'fit-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
