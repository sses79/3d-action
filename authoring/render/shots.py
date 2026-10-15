"""A video window cut into shots, and the shots grouped by camera setup, for a scene told in cuts (a dialogue: shot and reverse).
  .authoring/vision-venv/bin/python authoring/render/shots.py VIDEO START END OUT.json [--min=0.4]
Cuts: from frame to frame, the change in colour (an HSV histogram) plus the change in brightness, against the median change over
the second around it; a cut is a change at least four times that and over 0.35, the largest within three frames. This holds in
dark footage, where a fixed threshold missed cuts between two dim shots. Shots shorter than --min seconds are dropped.
Setups: two shots are from the same camera setup when the set behind the people matches: ORB features of three frames of each
(start, middle, end), matched with a ratio test, and a homography fitted with RANSAC; 40 or more inliers in any pair of frames is
a match (a camera that pans or pushes in a little still matches). Shots are joined into setups by those matches.
OUT.json: {video, start, end, fps, shots: [{index, start, end, setup, keyTimes}], setups: [{index, shots, inliers}]} and a sheet
OUT.jpg (one row a shot, start/middle/end, labelled with its setup) to check by eye."""
import sys,json,cv2,numpy as np
video,start,end,out=sys.argv[1],float(sys.argv[2]),float(sys.argv[3]),sys.argv[4];MIN=float(next((a.split('=')[1] for a in sys.argv if a.startswith('--min=')),.4))
c=cv2.VideoCapture(video);fps=c.get(5);c.set(1,round(start*fps));d=[];prev=None;k0=round(start*fps);n=round((end-start)*fps)+1
for k in range(n):
    ok,f=c.read()
    if not ok:break
    s=cv2.resize(f,(160,90));hsv=cv2.cvtColor(s,cv2.COLOR_BGR2HSV);h=cv2.calcHist([hsv],[0,1,2],None,[8,4,8],[0,180,0,256,0,256]).ravel();h/=h.sum()+1e-9;g=cv2.cvtColor(s,cv2.COLOR_BGR2GRAY).astype(float)
    d.append(0 if prev is None else .5*np.abs(h-prev[0]).sum()+np.abs(g-prev[1]).mean()/60);prev=(h,g)
d=np.array(d);med=np.array([np.median(d[max(0,i-15):i+15]) for i in range(len(d))])
cuts=[i for i in range(1,len(d)) if d[i]>max(.35,4*med[i]) and d[i]==d[max(0,i-3):i+4].max()]
edges=[0]+cuts+[len(d)];shots=[(a,b) for a,b in zip(edges,edges[1:]) if (b-a)/fps>=MIN]
orb=cv2.ORB_create(2000);bf=cv2.BFMatcher(cv2.NORM_HAMMING)
def frame(k):c.set(1,k0+k);return c.read()[1]
keys=[]
for a,b in shots:
    fs=[]
    for u in (.1,.5,.9):
        g=cv2.cvtColor(cv2.resize(frame(int(a+(b-a)*u)),(960,540)),cv2.COLOR_BGR2GRAY);g=cv2.createCLAHE(2.,(8,8)).apply(g);kp,de=orb.detectAndCompute(g,None);fs.append((kp,de))
    keys.append(fs)
def inliers(x,y):
    (ka,da),(kb,db)=x,y
    if da is None or db is None or len(ka)<10 or len(kb)<10:return 0
    good=[m for m,n_ in (p for p in bf.knnMatch(da,db,k=2) if len(p)==2) if m.distance<.75*n_.distance]
    if len(good)<12:return 0
    A=np.float32([ka[m.queryIdx].pt for m in good]);B=np.float32([kb[m.trainIdx].pt for m in good]);H,mask=cv2.findHomography(A,B,cv2.RANSAC,4.)
    return int(mask.sum()) if mask is not None else 0
N=len(shots);M=np.zeros((N,N),int)
for i in range(N):
    for j in range(i+1,N):M[i,j]=M[j,i]=max(inliers(x,y) for x in keys[i] for y in keys[j])
parent=list(range(N));find=lambda i:i if parent[i]==i else find(parent[i])
for i in range(N):
    for j in range(i+1,N):
        if M[i,j]>=40:parent[find(i)]=find(j)
roots=sorted({find(i) for i in range(N)},key=lambda r:min(i for i in range(N) if find(i)==r));setup={r:n_ for n_,r in enumerate(roots)}
res=dict(video=video,start=start,end=end,fps=fps,shots=[dict(index=i+1,start=round(start+a/fps,3),end=round(start+b/fps,3),setup=setup[find(i)]+1,keyTimes=[round(start+(a+(b-a)*u)/fps,3) for u in (.1,.5,.9)]) for i,(a,b) in enumerate(shots)],
    setups=[dict(index=setup[r]+1,shots=[i+1 for i in range(N) if find(i)==r]) for r in roots],inliers=M.tolist())
json.dump(res,open(out,'w'),indent=1);rows=[]
for s in res['shots']:
    t=[]
    for tt in s['keyTimes']:
        f=cv2.resize(frame(round((tt-start)*fps)),(400,225));cv2.putText(f,'shot %d  setup %d  %.2f'%(s['index'],s['setup'],tt),(6,22),0,.6,(255,255,255),2);t.append(f)
    rows.append(np.hstack(t))
cv2.imwrite(out.replace('.json','.jpg'),np.vstack(rows))
print(json.dumps({'shots':[(s['index'],s['start'],s['end'],s['setup']) for s in res['shots']],'setups':[s['shots'] for s in res['setups']]}));print(M)
