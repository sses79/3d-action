"""Kimodo (nv-tlabs/kimodo, SOMA 30 joints, the whole clip at once) fills a join between two poses; the same request and answer as
authoring/render/ardy-gen.py, so ardy-join.py can use either (--model kimodo). Runs on mini4 in ~/Yun/ardy-runner/kimodo-venv (CPU;
its MotionCorrection is ARDY's copy, which builds on Apple chips). text: a prompt ("A person ..."), needs Llama-3-8B for LLM2Vec;
without one the prompt is empty and a stand-in encoder gives the empty embedding. LLM2Vec (16 GB in bf16) and Kimodo do not fit
mini4's 16 GB together, so a prompt is encoded once in its own process (--encode) and kept in text-cache/ by its SHA-1.
  python kimodo-gen.py REQUEST.json OUT.json
  python kimodo-gen.py --encode TEXT OUT.pt"""
import sys,os,json,math,hashlib,subprocess,torch
if sys.argv[1]=='--encode':
    from kimodo.model.load_model import TEXT_ENCODER_PRESETS
    from kimodo.model.llm2vec.llm2vec_wrapper import LLM2VecEncoder
    f,_=LLM2VecEncoder(**{**TEXT_ENCODER_PRESETS['llm2vec']['kwargs'],'device':'cpu'})([sys.argv[2]]);torch.save(f[0].float().cpu(),sys.argv[3]);sys.exit()
from kimodo.model.load_model import load_model
from kimodo.constraints import FullBodyConstraintSet,Root2DConstraintSet,LeftFootConstraintSet,RightFootConstraintSet,compute_global_heading
Q=json.load(open(sys.argv[1]));text=Q.get('text','')
class NoText(torch.nn.Module):  # the empty prompt's embedding (or the cached prompt's), without loading the text model
    def __init__(self,feat=None):super().__init__();self.feat=feat
    def forward(self,texts):return torch.stack([self.feat if self.feat is not None and t.strip() else torch.zeros(1,4096) for t in texts]),[1 if self.feat is not None and t.strip() else 0 for t in texts]
feat=None
if text:
    c=os.path.join('text-cache',hashlib.sha1(text.encode()).hexdigest()+'.pt');os.makedirs('text-cache',exist_ok=True)
    if not os.path.exists(c):subprocess.run([sys.executable,sys.argv[0],'--encode',text,c],check=True)
    feat=torch.load(c)
m=load_model(Q.get('model','kimodo-soma-rp'),device='cpu',text_encoder=NoText(feat));S=m.skeleton;names=list(S.bone_order_names);par=S.joint_parents.tolist()
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
if Q.get('path'):  # path {turn: [from, to] as parts of the gap}: the hips held on the straight line between the key poses and their heading turned
    f0,f1=len(Q['start'])-1,N-len(Q['end']);a0,a1=[float(torch.atan2(*compute_global_heading(gp[i:i+1],S)[0].flip(0))) for i in (f0,len(Q['start']))]  # from the last start pose to the first end pose, eased, inside those parts of the gap: a turn on the spot without text
    a1=a0+(a1-a0+math.pi)%(2*math.pi)-math.pi;fr=torch.arange(f0+1,f1);u=(fr.float()-f0)/(f1-f0);t0,t1=Q['path'].get('turn',[0,1]);v=((u-t0)/max(t1-t0,1e-3)).clamp(0,1);v=v*v*(3-2*v);ang=a0+(a1-a0)*v
    h0,h1=gp[f0,0,[0,2]],gp[len(Q['start']),0,[0,2]];cs.append(Root2DConstraintSet(S,fr,h0+(h1-h0)*u[:,None],global_root_heading=torch.stack([torch.cos(ang),torch.sin(ang)],-1)))
for st in Q.get('stepPlan',[]):  # a step plan {foot: L|R, frames: [a, b], at: start|end|lift}: the foot (ankle, ball, their turns) held where the last start or first end pose has it, so between its holds it must lift and step
    i=len(Q['start'])-1 if st['at']=='start' else len(Q['start']);fr=torch.arange(st['frames'][0],st['frames'][1]+1);n=len(fr);P0=gp[i:i+1].clone()
    if st['at']=='lift':P0=(gp[len(Q['start'])-1:len(Q['start'])]+gp[len(Q['start']):len(Q['start'])+1])/2;P0[...,1]+=st.get('lift',.12)/k;i=len(Q['start'])-1  # at: lift, halfway between where the foot starts and lands, raised (Studio metres), turned as it starts
    cs.append((LeftFootConstraintSet if st['foot']=='L' else RightFootConstraintSet)(S,fr,P0.expand(n,-1,-1).clone(),gr[i:i+1].expand(n,-1,-1,-1).clone(),gp[i:i+1,0,[0,2]].expand(n,-1).clone()))
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
