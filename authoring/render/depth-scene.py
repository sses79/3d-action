"""A depth clip's room from its keyframes: one place and turn per person, one camera per shot, for set_shots_scene.
  .authoring/vision-venv/bin/python authoring/render/depth-scene.py BODY.json OUT.json [--height 1.7]
BODY.json/npz is depth-scene-body.py's output: SAM 3D Body read once per named person at each keyframe, each reading in that
picture's camera frame (x right, y down, z ahead; points are pred_keypoints_3d + pred_cam_t, which project exactly onto the
model's 2D points at its focal length). Unknowns, fitted together by least squares (Gauss-Newton): per person a hip height (a standing one, weakly, when their feet
are never seen) and per keyframe they are read at a place on the floor [x, z] and a heading, moving between keyframes only as far as
the pictures need; per shot a camera (yaw, pitch, position, lens; no roll), the keyframes of one shot sharing it. Each
reading, carried into the room by its shot's camera, should put that person's hips at their place and height and their facing
(hips across x up, so seated people too) along their heading; a reading whose feet are in the picture puts the lowest foot on the
floor; each torso leans little (weak). The first keyframe's camera fixes the room: at x=z=0 looking toward -z (room axes as
set_shots_scene: x right, y up, z toward that viewer). A person seen only cut by a side of the picture is left out (unplaced). A reading of someone facing away from the camera weighs 0.4: the body turned away, or
in a close shot (no feet seen) the head turned away, as over a shoulder, where the model reads the body side-on. The lens is the model's (a guess from the picture, the same for every frame); it is given on a 1920 wide picture.
OUT.json: places, headings, hip heights, cameras ready for set_shots_scene, and the check: each reading re-drawn from its
person's room place and heading through its shot's camera, the error in pixels of head, shoulders, hips and knees."""
import sys,json,argparse,numpy as np
p=argparse.ArgumentParser();p.add_argument('body');p.add_argument('out');p.add_argument('--height',type=float,default=1.7);a=p.parse_args()
B=json.load(open(a.body));Z=np.load(a.body.replace('.json','')+'.npz');S=json.load(open(B['spec']));W,H=B['size'];R=B['readings']
names=sorted({r['name'] for r in R});shots=[];[shots.append(r['shot']) for r in sorted(R,key=lambda r:r['keyframe']) if r['shot'] not in shots]
KP=Z['pred_keypoints_3d']*np.array([1,-1,-1]);CT=Z['pred_cam_t']*np.array([1,-1,-1]);G=KP+CT[:,None,:];focal=float(np.median(Z['focal_length']));k2=Z['pred_keypoints_2d']
def Ry(t):c,s=np.cos(t),np.sin(t);return np.array([[c,0,s],[0,1,0],[-s,0,c]])
def Rx(t):c,s=np.cos(t),np.sin(t);return np.array([[1,0,0],[0,c,-s],[0,s,c]])
def body(P):  # hips centre, facing (unit, horizontal part taken by the caller), torso up
 hip=(P[9]+P[10])/2;up=(P[5]+P[6])/2-hip;f=np.cross(P[9]-P[10],up);return hip,f/np.linalg.norm(f),up/np.linalg.norm(up)
head=lambda f:np.arctan2(f[0],f[2]);wrap=lambda x:(x+np.pi)%(2*np.pi)-np.pi
w=[];feet=[];cut=[];back=[]
for i,r in enumerate(R):
 x0,y0,x1,y1=r['box'];_,f,_=body(G[i]);cut.append(bool(x0<4 or x1>W-4));F=k2[i][15:21];feet.append(bool(y1<H*.97 and (F[:,1]<H*.97).all() and (F[:,1]>y0).all()))
 hd=G[i][0]-(G[i][3]+G[i][4])/2;hd=hd[2]/np.linalg.norm(hd)  # head: nose from between the ears, toward the camera +z
 back.append(bool(f[2]<-.3 or (hd<0 and not feet[-1])));w.append((.4 if back[-1] else 1.0)*(0 if cut[-1] else 1))  # GL camera frame: facing the camera is +z; a back: the body turned away, or in a close shot the head turned away (over a shoulder the model reads the body side-on); a person cut by a side of the picture only has to be seen inside their box (the model guesses where the rest of them is)
whole={r['name'] for i,r in enumerate(R) if not cut[i]};unplaced=sorted({r['name'] for r in R}-whole)  # seen only cut by a side: nothing to place them from
if unplaced:
 k=[i for i,r in enumerate(R) if r['name'] in whole];R=[R[i] for i in k];KP,CT,G,k2=KP[k],CT[k],G[k],k2[k];w=[w[i] for i in k];feet=[feet[i] for i in k];cut=[cut[i] for i in k];back=[back[i] for i in k]
 names=sorted(whole);shots=[];[shots.append(r['shot']) for r in sorted(R,key=lambda r:r['keyframe']) if r['shot'] not in shots]
nS,nP=len(shots),len(names)
best={n:max((i for i,r in enumerate(R) if r['name']==n and not cut[i]),key=lambda i:w[i]*(R[i]['box'][3]-R[i]['box'][1])) for n in names}  # each person's best whole reading
slots=[];[slots.append((r['name'],r['keyframe'])) for r in sorted(R,key=lambda r:(names.index(r['name']),r['keyframe'])) if (r['name'],r['keyframe']) not in slots]  # a place and heading per person per keyframe they are read at
footless={n for n in names if not any(feet[i] for i,r in enumerate(R) if r['name']==n)}
def unpack(x):
 cams=[np.r_[0,x[0],0,x[1],0,0]];o=2  # first camera: yaw 0, x=z=0, its lens the model's; its pitch and height free
 for k in range(1,nS):cams.append(x[o:o+6]);o+=6
 hy={n:x[o+j] for j,n in enumerate(names)};o+=nP;sl={k:x[o+3*j:o+3*j+3] for j,k in enumerate(slots)};return cams,hy,sl
def at(cam,i):return KP[i]+CT[i]*np.array([1,1,np.exp(cam[5])])  # another lens: the reading as much further off as that lens needs, the same in the picture
def room(cam,P):yaw,pitch,px,py,pz=cam[:5];return P@(Ry(yaw)@Rx(pitch)).T+np.array([px,py,pz])
def placed(c,i,X,Zp,hy,th):  # the reading carried into the room by its camera, then turned and moved onto its person
 P=room(c,at(c,i));hip,f,_=body(P);return (P-hip)@Ry(th-head(f)).T+np.array([X,hy,Zp]),P,hip
def seen(c,Q):M=Ry(c[0])@Rx(c[1]);L=(Q-c[2:5])@M;fk=focal*np.exp(c[5]);return np.stack([fk*L[:,0]/-L[:,2]+W/2,-fk*L[:,1]/-L[:,2]+H/2],1)
J=[0,5,6,9,10,11,12]  # head, shoulders, hips, knees
MW=[1.0]
def resid(x):
 cams,hys,sl=unpack(x);out=[]
 for i,r in enumerate(R):
  c=cams[shots.index(r['shot'])];X,Zp,th=sl[(r['name'],r['keyframe'])];hy=hys[r['name']];Q,P,hip=placed(c,i,X,Zp,hy,th);wi=w[i];bh=r['box'][3]-r['box'][1]
  if cut[i]:  # cut by a side of the picture: the person in their best whole reading's pose, everything of them on the box's side of its inner edge, some of them seen, at least 0.4 m off
   b=best[r['name']];Q,_,_=placed(cams[shots.index(R[b]['shot'])],b,X,Zp,hy,th);x0,_,x1,_=r['box'];M=Ry(c[0])@Rx(c[1]);d=-((Q[:21]-c[2:5])@M)[:,2];u=seen(c,Q)[:21,0]
   out+=([max(0,u.max()-x1)/bh,max(0,.5*x1-u.max())/bh] if x0<4 else [max(0,x0-u.min())/bh,max(0,u.min()-(x0+W)/2)/bh])+list(np.maximum(0,.4-d));continue
  out+=list(wi*((seen(c,Q)[J]-k2[i][J])/bh).ravel());out+=list(.05*wi*(hip-np.array([X,hy,Zp])))  # in the picture, by box size; near its reading (keeps the scale)
  if feet[i]:out.append(P[15:21,1].min())
 for (n,a_),(m,b_) in zip(slots,slots[1:]):  # a person moves between keyframes only as far as the pictures need (1 m weighs like a box height off)
  if n==m:out+=list(MW[0]*(sl[(n,a_)][:2]-sl[(m,b_)][:2]))+[.5*MW[0]*wrap(sl[(n,a_)][2]-sl[(m,b_)][2])]
 for n in footless:out.append(.2*(hys[n]-.95))  # feet never seen: a standing hip height, weakly
 for c in cams:out+=[1*c[1],.05*c[5]]  # cameras about level, lenses near the model's guess
 return np.array(out)
# start: people from their first reading with the first camera level at 1.2 m (or the camera that sees them placed from the first); other cameras from their best reading
x=np.zeros(2+6*(nS-1)+nP+3*len(slots));x[1]=1.2;o=2+6*(nS-1)
init={}
for i,r in sorted(enumerate(R),key=lambda t:t[1]['keyframe']):
 if r['shot']==shots[0] and r['name'] not in init:hip,f,_=body(room([0,0,0,1.2,0,0],G[i]));init[r['name']]=[hip[0],hip[2],hip[1],head(f)]
for n in names:init.setdefault(n,[0,-2,.95,0])
for j,n in enumerate(names):x[o+j]=init[n][2]
for j,(n,sh) in enumerate(slots):x[o+nP+3*j:][:3]=[init[n][0],init[n][1],init[n][3]]
for k in range(1,nS):
 rs=[i for i,r in enumerate(R) if r['shot']==shots[k] and not cut[i]] or [i for i,r in enumerate(R) if r['shot']==shots[k]];i=max(rs,key=lambda i:w[i]*(R[i]['box'][3]-R[i]['box'][1]));X,Zp,hy,th=init[R[i]['name']]
 hip,f,_=body(G[i]);yaw=wrap(th-head(f));q=Ry(yaw)@hip;x[2+6*(k-1):][:6]=[yaw,0,X-q[0],hy-q[1],Zp-q[2],0]
def solve(x):
 lam=1e-3;r0=resid(x);cost=r0@r0
 for it in range(200):  # Levenberg-Marquardt with a numeric Jacobian: a step is kept only if it lowers the cost
  Jm=np.stack([(resid(x+e)-r0)/1e-5 for e in np.eye(len(x))*1e-5],1);A=Jm.T@Jm;g=Jm.T@r0
  while lam<1e8:
   dx=np.linalg.solve(A+lam*np.diag(np.diag(A)+1e-9),-g);r1=resid(x+dx)
   if r1@r1<cost:x,r0,cost,lam=x+dx,r1,r1@r1,max(lam/3,1e-7);break
   lam*=4
  if lam>=1e8 or np.abs(dx).max()<1e-7:break
 return x,cost,it
# a dark back reads easily as a front: each camera after the first is also started half a turn round, and the lowest cost kept
import itertools
runs=[]
for flips in itertools.product([0,np.pi],repeat=min(nS-1,4)):
 x1=x.copy()
 for k,fl in enumerate(flips):x1[2+6*k]+=fl
 MW[0]=30;x1=solve(x1)[0];MW[0]=1;runs.append(solve(x1))  # first with people all but held still, then free to move
x,cost,it=min(runs,key=lambda r:r[1])
cams,hys,sl=unpack(x)
# the check: each reading's head, shoulders, hips and knees drawn from its person's room place through its shot's camera, in pixels
check=[]
for i,r in enumerate(R):
 c=cams[shots.index(r['shot'])];X,Zp,th=sl[(r['name'],r['keyframe'])];Q,_,_=placed(c,i,X,Zp,hys[r['name']],th);e=np.hypot(*(seen(c,Q)[J]-k2[i][J]).T)
 check.append(dict(keyframe=r['keyframe'],shot=r['shot'],name=r['name'],weight=w[i],back=back[i],feetOnFloor=feet[i],pixels=round(float(np.median(e)),1),boxHeight=round(r['box'][3]-r['box'][1])))
starts={k['index']:k['start'] for k in S['shots']}
res=dict(spec=B['spec'],focal1920=round(focal*1920/W),people=[dict(name=n,place=[round(float(sl[k][0]),3),round(float(sl[k][1]),3)],hipHeight=round(float(hys[n]),3),heading=round(float(np.degrees(sl[k][2])),1),**({'hipHeightGuessed':True} if n in footless else {}),keyframes=[dict(keyframe=k_,time=S['keyframes'][k_]['time'],shot=S['keyframes'][k_]['shot'],place=[round(float(sl[(n,k_)][0]),3),round(float(sl[(n,k_)][1]),3)],heading=round(float(np.degrees(sl[(n,k_)][2])),1)) for (m,k_) in slots if m==n]) for n in names for k in [next(k for k in slots if k[0]==n)]],
 cameras=[dict(name=f'shot {s}',start=starts.get(s,0),position=[round(float(v),3) for v in cams[k][2:5]],yaw=round(float(np.degrees(cams[k][0])),2),pitch=round(float(np.degrees(cams[k][1])),2),focal=round(focal*np.exp(cams[k][5])*1920/W)) for k,s in enumerate(shots)],check=check,unplaced=unplaced,iterations=it+1,residual=round(float(np.sqrt(np.mean(resid(x)**2))),4))
json.dump(res,open(a.out,'w'),indent=1);print(json.dumps({k:res[k] for k in ['people','cameras','residual']}));[print(c) for c in check]
