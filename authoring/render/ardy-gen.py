"""ARDY (nv-tlabs/ardy, SOMA 30 joints, 30 fps) fills a join between two poses, no text: runs where ARDY is installed (mini4,
~/Yun/ardy-runner, its own venv, CPU). authoring/render/ardy-join.py writes the request and reads the answer.
  python ardy-gen.py REQUEST.json OUT.json
REQUEST {frames, start: [poses], end: [poses], turn (degrees, the end poses turned about y), leg (the Studio leg length), seed,
samples, cfg ([text, poses] guidance, default [2, 2]; with no text only the second counts), pin}: a pose is {G: {soma joint: 3x3 world turn from the T-pose, glTF axes}, hips: [x,y,z] Studio metres}. The start poses
are the first frames, the end poses the last; the last start pose's hips are put at x = z = 0. The calmest of the samples is chosen (best); with pin, the feet are held where ARDY's contacts say they are down and it is made
again. OUT {joints, fps, scale, best, pins, samples:
[{G: [frames][joints][3x3], hips: [frames][3] SOMA metres, ankles: [frames][left, right][3], contacts}]}, scale = Studio leg / SOMA leg."""
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
class Pin(FullBodyConstraintSet):  # a foot held where it came down: its joints' positions, and the hips' path on the floor on those frames (ARDY keeps joint positions relative to it), no heading or pose
    def __init__(self,S,idx,pos,joints,root2d):self.skeleton,self.frame_indices,self.pos,self.joints,self.root_2d=S,idx,pos,joints,root2d
    def update_constraints(self,data,index):
        data['global_joints_positions'].append(self.pos.reshape(-1,3));index['global_joints_positions'].append(torch.tensor([[f,j] for f in self.frame_indices.tolist() for j in self.joints]))
        data['root_2d'].append(self.root_2d);index['root_2d'].append(self.frame_indices)
def gen(cs,B,seed,pins=[]):  # pins condition the model only: the clean-up after it takes whole poses
    seed_everything(seed);lens=torch.tensor([N]*B);ob,mm=m.motion_rep.create_conditions_from_constraints_batched(cs+pins,lens,to_normalize=True,device='cpu')
    with torch.no_grad():out=m.motion_rep.inverse(m(['']*B,N,num_denoising_steps=int(m.diffusion.num_base_steps),pad_mask=length_to_mask(lens),first_heading_angle=torch.zeros(B),motion_mask=mm,observed_motion=ob,cfg_weight=tuple(Q.get('cfg',[2.0,2.0])),text_feat=torch.zeros(B,1,4096),text_pad_mask=torch.zeros(B,1,dtype=torch.bool)),is_normalized=True)
    if Q.get('post',True):out.update(post_process_motion(out['local_rot_mats'],out['root_positions'],out['foot_contacts'],S,constraint_lst=cs))
    _,P,_=S.fk(out['local_rot_mats'],out['root_positions']);return out,P
J=lambda n:names.index(n);flat=torch.tensor([1.,0,1.])
def calm(P,H):  # smaller is calmer: how far the hands swing out from the hips, the head leans off them, and the hips wander, all along the floor
    hand=max(float(((P[:,J(h)]-P[:,0])*flat).norm(dim=-1).max()) for h in ('LeftHand','RightHand'));lean=float(((P[:,J('Head')]-P[:,0])*flat).norm(dim=-1).max());travel=float(((H-H[len(Q['start'])-1])*flat).norm(dim=-1).max());return hand+2*lean+travel
hs,he=H[len(Q['start'])-1][[0,2]],H[len(Q['start'])][[0,2]];f0,f1=len(Q['start'])-1,N-len(Q['end'])
def path(fr):  # the hips along the floor from the last start pose to the first end pose, eased, for frames a step pins
    u=((fr.float()-f0)/max(f1-f0,1)).clamp(0,1);u=u*u*(3-2*u);return hs+(he-hs)*u[:,None]
steps=[]
for st in Q.get('steps',[]):  # a step plan: {foot: L|R, part: ball|foot, frames: [a, b], at: start|end}, the ball (or ball and heel) held where the start or end poses have it
    side=S.left_foot_joint_idx if st['foot']=='L' else S.right_foot_joint_idx;jt=side[1:] if st.get('part','foot')=='ball' else side;fi=torch.arange(st['frames'][0],st['frames'][1]+1);src=gp[len(Q['start'])-1] if st['at']=='start' else gp[len(Q['start'])]
    steps.append(Pin(S,fi,src[jt].expand(len(fi),-1,-1).clone(),jt,path(fi)))
B=Q.get('samples',1);out,P=gen(cs,B,Q.get('seed',0),steps);score=[calm(P[b],out['root_positions'][b]) for b in range(B)];best=min(range(B),key=score.__getitem__)
pins=[]
if Q.get('pin'):  # held feet: where ARDY's own contacts say a ball (and heel) is down for 4 frames or more, both are held where they came down, and the join is made again
    c=out['foot_contacts'][best]>.5
    for heel,toe in ((0,1),(2,3)):
        f=0
        while f<N:
            if not c[f,toe]:f+=1;continue
            e=f
            while e<N and c[e,toe]:e+=1
            if e-f>=4:
                jt=[S.left_foot_joint_idx,S.right_foot_joint_idx][heel//2];fi=torch.arange(f,e);pins.append(Pin(S,fi,P[best,f,jt].expand(e-f,-1,-1).clone(),jt,out['root_positions'][best,f:e][:,[0,2]].clone()))
            f=e
    out,P=gen(cs,B,Q.get('seed',0)+1,steps+pins);score=[calm(P[b],out['root_positions'][b]) for b in range(B)];best=min(range(B),key=score.__getitem__)
gr2,_,_=S.fk(out['local_rot_mats'],out['root_positions'])
err=[float((gp[i]-P[best,f]).norm(dim=-1).mean()) for i,f in enumerate(idx.tolist())]
slide=max([float(((P[best,p.frame_indices,p.joints[-1]]-p.pos[:,-1])*flat).norm(dim=-1).max()) for p in steps+pins] or [0])
json.dump(dict(joints=names,fps=30,scale=k,best=best,calm=[round(x,3) for x in score],pins=[[p.frame_indices[0].item(),p.frame_indices[-1].item(),names[p.joints[-1]]] for p in pins],keyError=[round(e*k*100,1) for e in err],samples=[dict(G=gr2[b].tolist(),hips=out['root_positions'][b].tolist(),ankles=P[b][:,[J('LeftFoot'),J('RightFoot')]].tolist(),contacts=out['foot_contacts'][b].tolist()) for b in range(B)]),open(sys.argv[2],'w'))
print(json.dumps(dict(frames=N,scale=round(k,4),best=best,calm=round(score[best],3),pins=[[p.frame_indices[0].item(),p.frame_indices[-1].item(),names[p.joints[-1]]] for p in pins],pinSlideCm=round(slide*k*100,1),keyErrorCm=[round(e*k*100,1) for e in err])))
