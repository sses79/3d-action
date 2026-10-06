"""Bounded orthographic landmark fit, with depth prior and soft segment constraints."""
import argparse,json,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--out',required=True);p.add_argument('--stable',action='store_true');args=p.parse_args();started=time.perf_counter()
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
# This side-view fixture supports a near-straight-knee prior only where the observed 2D knee is near straight.
straight=[]
for h,k,f in [(1,2,3),(4,5,6)]:
 u=target_t[:,h]-target_t[:,k];v=target_t[:,f]-target_t[:,k];cos=(u*v).sum(-1)/(torch.linalg.vector_norm(u,dim=-1)*torch.linalg.vector_norm(v,dim=-1)).clamp_min(1e-6);straight.append((h,k,f,(torch.clamp((-cos-.90)/.09,0,1) if args.stable else (cos<-.96).float())*torch.minimum(conf[:,k],conf[:,f])))
x=torch.tensor(prior,requires_grad=True);optim=torch.optim.Adam([x],lr=.025);a=time.perf_counter()
for step in range(400):
 optim.zero_grad();projection=((x[:,:,:2]-target_t).square().sum(-1)*conf).mean();bone=torch.stack([(torch.linalg.vector_norm(x[:,b]-x[:,a],dim=-1)-lengths[i]).square().mean() for i,(a,b) in enumerate(edges)]).mean();depth=(x[:,:,2]-prior_t[:,:,2]).square().mean();acc=(x[2:]-2*x[1:-1]+x[:-2]).square().mean();root=x[:,0].square().mean();collinear=torch.stack([((torch.nn.functional.normalize(x[:,h]-x[:,k],dim=-1)+torch.nn.functional.normalize(x[:,f]-x[:,k],dim=-1)).square().sum(-1)*weight).mean() for h,k,f,weight in straight]).mean();depth_acc=(x[2:,:,2]-2*x[1:-1,:,2]+x[:-2,:,2]).square().mean();loss=(6*depth_acc if args.stable else 0)+3*collinear+12*projection+8*bone+.12*depth+(.8 if args.stable else .015)*acc+30*root;loss.backward();optim.step()
elapsed=time.perf_counter()-a;fitted=x.detach().numpy();fitted-=fitted[:,0:1]
def angles(v):
 a=v[:,1]-v[:,2];b=v[:,3]-v[:,2];return np.degrees(np.arccos(np.clip((a*b).sum(-1)/np.linalg.norm(a,axis=-1)/np.linalg.norm(b,axis=-1),-1,1)))
peak=int(np.argmin(abs(np.array(ir['times'])-12.85)));out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
report={'algorithm':'orthographic-landmark-fit-stable-v2' if args.stable else 'orthographic-landmark-fit-v1','rejectedObservations':rejected,'iterations':400,'cameraScale':scale,'fitSeconds':elapsed,'processWallSeconds':time.perf_counter()-started,'rightKneePeakDegrees':{'before':float(angles(prior)[peak]),'after':float(angles(fitted)[peak])},'projectionRMS':float(np.sqrt(((fitted[:,:,:2]-target)**2).mean())),'segmentLengthRMS':float(np.sqrt(np.mean([(np.linalg.norm(fitted[:,b]-fitted[:,a],axis=-1)-lengths[i])**2 for i,(a,b) in enumerate(edges)]))),'limits':['Orthographic camera assumption','Soft segment lengths; runtime retarget preserves actual rig lengths','Occluded/misassigned observations may distort the fit','Near-straight 2D knees assumed near-straight in 3D for this side-view fixture only','Depth prior remains ambiguous; no contacts or joint-limit solver']}
if args.stable:
 ir['preStabilityInput']=ir['preparedInput'];ir['preparedInput']=obs.tolist();original_root=np.array(ir['imagePelvis']);smoothed=original_root.copy()
 # Five-sample symmetric root-only filter; joint snap timing is not resampled.
 for i in range(2,len(smoothed)-2):smoothed[i]=(original_root[i-2]+4*original_root[i-1]+6*original_root[i]+4*original_root[i+1]+original_root[i+2])/16
 ir['unsmoothedImagePelvis']=ir['imagePelvis'];ir['imagePelvis']=smoothed.tolist();report['rootFilter']='5-sample binomial, endpoints retained; no contact claim'
ir['unfittedPositions']=ir['rootRelativePositions'];ir['rootRelativePositions']=fitted.tolist();ir['fitting']=report;ir['status']='observation-fitted-draft-unreviewed';(out/'motion-ir.json').write_text(json.dumps(ir));(out/'fit-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
