"""Kimodo (nv-tlabs/kimodo, SOMA 30 joints, the whole clip at once) fills a join between two poses; the same request and answer as
authoring/render/ardy-gen.py, so ardy-join.py can use either (--model kimodo). Runs on mini4 in ~/Yun/ardy-runner/kimodo-venv (CPU;
its MotionCorrection is ARDY's copy, which builds on Apple chips). text: a prompt ("A person ..."), needs Llama-3-8B for LLM2Vec;
without one the prompt is empty and a stand-in encoder gives the empty embedding.
  python kimodo-gen.py REQUEST.json OUT.json"""
import sys,json,math,torch
from kimodo.model.load_model import load_model
from kimodo.constraints import FullBodyConstraintSet
Q=json.load(open(sys.argv[1]));text=Q.get('text','')
class NoText(torch.nn.Module):  # the empty prompt's embedding, without loading the text model
    def forward(self,texts):return torch.zeros(len(texts),1,4096),[0]*len(texts)
m=load_model(Q.get('model','kimodo-soma-rp'),device='cpu',text_encoder=None if text else NoText());S=m.skeleton;names=list(S.bone_order_names);par=S.joint_parents.tolist()
nj=S.neutral_joints;J=lambda n:names.index(n);sleg=float((nj[J('LeftLeg')]-nj[J('LeftShin')]).norm()+(nj[J('LeftShin')]-nj[J('LeftFoot')]).norm());k=Q['leg']/sleg
a=math.radians(Q.get('turn',0));Ry=torch.tensor([[math.cos(a),0,math.sin(a)],[0,1,0],[-math.sin(a),0,math.cos(a)]]);o=Q['start'][-1]['hips']
def soma(p,turned):
    G=[None]*len(names)
    for j,n in enumerate(names):G[j]=torch.tensor(p['G'][n]) if n in p['G'] else (G[par[j]] if par[j]>=0 else torch.eye(3))
    G=torch.stack(G);h=torch.tensor([p['hips'][0]/k,p['hips'][1]/k,p['hips'][2]/k]) if turned else torch.tensor([(p['hips'][0]-o[0])/k,p['hips'][1]/k,(p['hips'][2]-o[2])/k])
    if turned:G=Ry@G;h=Ry@h
    return torch.stack([G[j] if par[j]<0 else G[par[j]].T@G[j] for j in range(len(names))]),h
N=Q['frames'];poses=[(i,*soma(p,False)) for i,p in enumerate(Q['start'])]+[(N-len(Q['end'])+i,*soma(p,True)) for i,p in enumerate(Q['end'])]
idx=torch.tensor([f for f,_,_ in poses]);gr,gp,_=S.fk(torch.stack([l for _,l,_ in poses]),torch.stack([h for _,_,h in poses]));cs=[FullBodyConstraintSet(S,idx,gp,gr)]
B=Q.get('samples',1);torch.manual_seed(Q.get('seed',0))
with torch.no_grad():out=m(text,N,int(Q.get('steps',m.diffusion.num_base_steps if hasattr(m,'diffusion') else 100)),constraint_lst=cs,cfg_weight=Q.get('cfg',[2.0,2.0]),num_samples=B,post_processing=Q.get('post',True))
L,H=out['local_rot_mats'],out['root_positions']
if L.shape[-3]!=len(names):L=S.from_SOMASkeleton77(L) if hasattr(S,'from_SOMASkeleton77') else L
gr2,P,_=S.fk(L,H);flat=torch.tensor([1.,0,1.])
def calm(P,H):
    hand=max(float(((P[:,J(h)]-P[:,0])*flat).norm(dim=-1).max()) for h in ('LeftHand','RightHand'));lean=float(((P[:,J('Head')]-P[:,0])*flat).norm(dim=-1).max());travel=float(((H-H[len(Q['start'])-1])*flat).norm(dim=-1).max());return hand+2*lean+travel
score=[calm(P[b],H[b]) for b in range(B)];best=min(range(B),key=score.__getitem__)
err=[float((gp[i]-P[best,f]).norm(dim=-1).mean()) for i,f in enumerate(idx.tolist())]
json.dump(dict(joints=names,fps=30,scale=k,best=best,calm=[round(x,3) for x in score],keyError=[round(e*k*100,1) for e in err],samples=[dict(G=gr2[b].tolist(),hips=H[b].tolist(),ankles=P[b][:,[J('LeftFoot'),J('RightFoot')]].tolist(),contacts=out['foot_contacts'][b].tolist()) for b in range(B)]),open(sys.argv[2],'w'))
print(json.dumps(dict(model='kimodo',frames=N,shape=list(out['local_rot_mats'].shape),best=best,calm=round(score[best],3),keyErrorCm=[round(e*k*100,1) for e in err])))
