"""ARDY (nv-tlabs/ardy, SOMA 30 joints, 30 fps) fills a join between two poses, no text: runs where ARDY is installed (mini4,
~/Yun/ardy-runner, its own venv, CPU). authoring/render/ardy-join.py writes the request and reads the answer.
  python ardy-gen.py REQUEST.json OUT.json
REQUEST {frames, start: [poses], end: [poses], turn (degrees, the end poses turned about y), leg (the Studio leg length), seed,
samples, cfg}: a pose is {G: {soma joint: 3x3 world turn from the T-pose, glTF axes}, hips: [x,y,z] Studio metres}. The start poses
are the first frames, the end poses the last; the last start pose's hips are put at x = z = 0. OUT {joints, fps, scale, samples:
[{G: [frames][joints][3x3], hips: [frames][3] SOMA metres, contacts}]}, scale = Studio leg / SOMA leg."""
import sys,json,math,torch
from ardy.model.load_model import load_model
from ardy.motion_rep.tools import length_to_mask
from ardy.constraints import FullBodyConstraintSet
from ardy.postprocess import post_process_motion
from ardy.tools import seed_everything
Q=json.load(open(sys.argv[1]));m=load_model('soma',device='cpu',text_encoder=False,checkpoints_dir='checkpoints');S=m.skeleton;names=list(S.bone_order_names);par=S.joint_parents.tolist() if hasattr(S.joint_parents,'tolist') else list(S.joint_parents)
nj=S.neutral_joints;sleg=float((nj[names.index('LeftLeg')]-nj[names.index('LeftShin')]).norm()+(nj[names.index('LeftShin')]-nj[names.index('LeftFoot')]).norm());k=Q['leg']/sleg
a=math.radians(Q.get('turn',0));Ry=torch.tensor([[math.cos(a),0,math.sin(a)],[0,1,0],[-math.sin(a),0,math.cos(a)]])
o=Q['start'][-1]['hips']
def soma(p,turned):  # a Studio pose as SOMA local rotations and root, the joints it lacks following their parent
    G=[None]*len(names)
    for j,n in enumerate(names):G[j]=torch.tensor(p['G'][n]) if n in p['G'] else (G[par[j]] if par[j]>=0 else torch.eye(3))
    G=torch.stack(G);h=torch.tensor([(p['hips'][0]-o[0])/k,p['hips'][1]/k,(p['hips'][2]-o[2])/k]) if not turned else torch.tensor([p['hips'][0]/k,p['hips'][1]/k,p['hips'][2]/k])
    if turned:G=Ry@G;h=Ry@h
    L=torch.stack([G[j] if par[j]<0 else G[par[j]].T@G[j] for j in range(len(names))]);return L,h
N=Q['frames'];poses=[(i,*soma(p,False)) for i,p in enumerate(Q['start'])]+[(N-len(Q['end'])+i,*soma(p,True)) for i,p in enumerate(Q['end'])]
if Q.get('endAt'):  # where the end poses' hips go (x, z, Studio metres), else where their clip had them, turned
    d=torch.tensor([Q['endAt'][0]/k,0,Q['endAt'][1]/k])-poses[len(Q['start'])][2]*torch.tensor([1.,0,1.]);poses=[(f,L,h+d if f>=N-len(Q['end']) else h) for f,L,h in poses]
idx=torch.tensor([f for f,_,_ in poses]);L=torch.stack([l for _,l,_ in poses]);H=torch.stack([h for _,_,h in poses])
gr,gp,_=S.fk(L,H);cs=[FullBodyConstraintSet(S,idx,gp,gr)]
B=Q.get('samples',1);seed_everything(Q.get('seed',0));lens=torch.tensor([N]*B)
ob,mm=m.motion_rep.create_conditions_from_constraints_batched(cs,lens,to_normalize=True,device='cpu')
with torch.no_grad():
    x=m(['']*B,N,num_denoising_steps=int(m.diffusion.num_base_steps),pad_mask=length_to_mask(lens),first_heading_angle=torch.zeros(B),motion_mask=mm,observed_motion=ob,cfg_weight=Q.get('cfg',2.0),text_feat=torch.zeros(B,1,4096),text_pad_mask=torch.zeros(B,1,dtype=torch.bool))
    out=m.motion_rep.inverse(x,is_normalized=True)
if Q.get('post',True):out.update(post_process_motion(out['local_rot_mats'],out['root_positions'],out['foot_contacts'],S,constraint_lst=cs))
gr2,_,_=S.fk(out['local_rot_mats'],out['root_positions'])
err=[float((gp[i]-S.fk(out['local_rot_mats'][0,f:f+1],out['root_positions'][0,f:f+1])[1][0]).norm(dim=-1).mean()) for i,f in enumerate(idx.tolist())]
json.dump(dict(joints=names,fps=30,scale=k,keyError=[round(e*k*100,1) for e in err],samples=[dict(G=gr2[b].tolist(),hips=out['root_positions'][b].tolist(),contacts=out['foot_contacts'][b].tolist()) for b in range(B)]),open(sys.argv[2],'w'))
print(json.dumps(dict(frames=N,scale=round(k,4),keyErrorCm=[round(e*k*100,1) for e in err])))
