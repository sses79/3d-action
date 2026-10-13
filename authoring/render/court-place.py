"""Where two players are on a basketball court through a clip, from their feet and the court's camera, for set_pair_scene.
  .authoring/vision-venv/bin/python authoring/render/court-place.py CAMERA.json OUT.json NAME=body-smoothed.npz NAME=body-smoothed.npz [--side=1] [--air=NAME:from:to ...] [--fast=9]
CAMERA.json is the court camera of the clip: {fps, first, C: its place in court metres, frames: [{q: [log lens px, turn as a
rotation vector]}]} (court axes: origin at the centre, x toward the right-hand basket, y away from the main camera, z up).
Each NAME=file is the body model's cache of one player's build (reconstruct_motion with boxes; body-smoothed.npz in the body
stage's folder), in the order the pair has them (left, right).

On the floor a player's place is read from the lower ankle: the line of sight through it meets the floor, and the hips are
where the body model has them from that ankle, with the model's body scaled to the player's size in the picture (the median
over the clip of hip-to-ankle in the picture against the model's). In the air that reading is wrong (the feet are up, so the floor point lands
metres behind). A span in the air is taken from where the floor reading moves faster than --fast m/s (a person cannot), from
the frame before the first such frame to the last, joined when less than 0.8 s apart; --air gives it by hand. Inside it the
place over the floor runs straight from take-off to landing, through every frame where a wrist is at the rim (there the hips
are where the body model has them from that wrist, hung on the rim of the basket on --side), and the height is where the line
of sight through the hips passes that place. OUT.json: {camera: {quats, positions, focal, absolute}, place: [[x, lift, z] per
frame for each player], summary}; room axes x = court x, y up, z = toward the main camera. Limits: a jump shorter than the
speed test notices is left on the floor; a hop of the camera fit shows as a hop of the players."""
import sys,json,numpy as np,cv2
cam_file,out=sys.argv[1],sys.argv[2];players=[a.split('=',1) for a in sys.argv[3:] if not a.startswith('--')]
opt=lambda k,d:next((a.split('=',1)[1] for a in sys.argv if a.startswith('--'+k+'=')),d);side=float(opt('side',1));FAST=float(opt('fast',9));given={}
for a in sys.argv:
    if a.startswith('--air='):n,a0,a1=a[6:].split(':');given.setdefault(n,[]).append((float(a0),float(a1)))
track=json.load(open(cam_file));W,H=track.get('size',[1920,1080]);C=np.array(track['C']);fps=track['fps'];F=len(track['frames']);t0=track['first']/fps;ANKLE=.10;RIM=np.array([side*12.75,0,3.05])
LENS=[float(np.exp(f['q'][0])) for f in track['frames']];ROT=[cv2.Rodrigues(np.array(f['q'][1:4]))[0] for f in track['frames']]
ray=lambda k,uv:ROT[k].T@np.array([(uv[0]-W/2)/LENS[k],(uv[1]-H/2)/LENS[k],1.])
def pixel(k,X):c=ROT[k]@(np.asarray(X)-C);return np.array([LENS[k]*c[0]/c[2]+W/2,LENS[k]*c[1]/c[2]+H/2])
def read(name,file,size=1.):
    z=np.load(file);rows=[];ratio=[]
    for i,t in enumerate(z['times']):
        k=int(min(max(round((float(t)-t0)*fps),0),F-1));R=ROT[k];j3=z['pred_keypoints_3d'][i].astype(float);j2=z['pred_keypoints_2d'][i].astype(float);hip3=(j3[9]+j3[10])/2;hip2=(j2[9]+j2[10])/2
        off=[size*(R.T@(j3[a]-hip3)) for a in (13,14)];a=int(np.argmin([o[2] for o in off]));d=ray(k,j2[(13,14)[a]]);foot=C+(ANKLE-C[2])/d[2]*d;hip=foot-off[a];stand=ANKLE-off[a][2];ratio.append(np.linalg.norm(hip2-j2[(13,14)[a]])/max(1e-6,np.linalg.norm(pixel(k,hip)-pixel(k,foot))))
        hang=None;rim=pixel(k,RIM);reach=1.6*.23*LENS[k]/np.linalg.norm(RIM-C)
        for w in (41,62):
            if np.linalg.norm(j2[w]-rim)<reach and (hang is None or j2[w][1]<hang[1]):hang=(RIM-size*(R.T@(j3[w]-hip3)),j2[w][1])
        rows.append(dict(t=float(t),k=k,hip=hip,stand=stand,sight=ray(k,hip2),hang=None if hang is None else hang[0]))
    return rows,float(np.median(ratio))
def spans(rows,name):
    if name in given:return [(min(range(len(rows)),key=lambda i:abs(rows[i]['t']-a)),min(range(len(rows)),key=lambda i:abs(rows[i]['t']-b))) for a,b in given[name]]
    fast=[i for i in range(1,len(rows)) if np.linalg.norm(rows[i]['hip'][:2]-rows[i-1]['hip'][:2])/(rows[i]['t']-rows[i-1]['t'])>FAST];res=[]
    for i in fast:
        if res and rows[i]['t']-rows[res[-1][1]]['t']<.8:res[-1][1]=i
        else:res.append([i-1,i])
    return [tuple(s) for s in res if s[1]-s[0]>1]
def placed(rows,name):
    n=len(rows);P=np.array([[r['hip'][0],r['hip'][1],0.] for r in rows]);air=spans(rows,name);up=np.zeros(n,bool);hung=0
    for a,b in air:
        way=[(a,rows[a]['hip'][:2])]+[(i,rows[i]['hang'][:2]) for i in range(a+1,b) if rows[i]['hang'] is not None]+[(b,rows[b]['hip'][:2])];hung+=len(way)-2;T=[rows[i]['t'] for i,_ in way]
        for i in range(a+1,b):
            r=rows[i];xy=np.array([np.interp(r['t'],T,[w[1][c] for w in way]) for c in (0,1)]);up[i]=True
            if r['hang'] is not None:h=r['hang'][2]
            else:d=r['sight'];s=((xy-C[:2])@d[:2])/(d[:2]@d[:2]);h=C[2]+s*d[2]  # where the line of sight through the hips passes over that place
            P[i]=[xy[0],xy[1],max(0.,h-r['stand'])]
        lift=P[a:b+1,2].copy()
        for i in range(1,len(lift)-1):P[a+i,2]=np.median(lift[i-1:i+2])
    S=P.copy()
    for _ in range(2):S[1:-1,:2]=.25*S[:-2,:2]+.5*S[1:-1,:2]+.25*S[2:,:2];S[1:-1,2]=np.where(up[1:-1],.25*S[:-2,2]+.5*S[1:-1,2]+.25*S[2:,2],S[1:-1,2])
    T=np.array([r['t'] for r in rows]);ft=t0+np.arange(F)/fps;series=np.stack([np.interp(ft,T,S[:,c]) for c in range(3)],1)
    step=np.linalg.norm(np.diff(S[:,:2],axis=0),axis=1)/np.diff(T)
    return series,dict(name=name,airborne=[[round(rows[a]['t'],2),round(rows[b]['t'],2)] for a,b in air],framesHungOnRim=hung,peakLiftMeters=round(float(S[:,2].max()),2),courtStart=[round(float(x),2) for x in S[0,:2]],courtEnd=[round(float(x),2) for x in S[-1,:2]],fastestMetersPerSecond=round(float(step.max()),1),travelMeters=round(float(step@np.diff(T)),1))
def quat(M):
    q=np.empty(4);tr=np.trace(M)
    if tr>0:s=np.sqrt(tr+1)*2;q[:]=[(M[2,1]-M[1,2])/s,(M[0,2]-M[2,0])/s,(M[1,0]-M[0,1])/s,s/4]
    else:
        i=int(np.argmax(np.diag(M)));j,k=(i+1)%3,(i+2)%3;s=np.sqrt(1+M[i,i]-M[j,j]-M[k,k])*2;q[i]=s/4;q[j]=(M[j,i]+M[i,j])/s;q[k]=(M[k,i]+M[i,k])/s;q[3]=(M[k,j]-M[j,k])/s
    return q/np.linalg.norm(q)
B=np.array([[1.,0,0],[0,0,1],[0,-1,0]]);Fl=np.diag([1.,-1,-1]);quats=[quat(B@R.T@Fl) for R in ROT]
for i in range(1,F):
    if quats[i]@quats[i-1]<0:quats[i]=-quats[i]
place=[];summary=[]
for name,file in players:
    size=read(name,file)[1];s,info=placed(read(name,file,size)[0],name);info['bodySizeAgainstModel']=round(size,3);place.append([[round(float(p[0]),3),round(float(p[2]),3),round(float(-p[1]),3)] for p in s]);summary.append(info)
json.dump(dict(camera=dict(quats=[[round(float(x),6) for x in q] for q in quats],positions=[[round(float(x),4) for x in B@C]]*F,focal=[round(l/float(np.hypot(W,H)),4) for l in LENS],absolute=True),place=place,summary=summary),open(out,'w'));print(json.dumps(summary))
