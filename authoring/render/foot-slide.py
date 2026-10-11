# Foot sliding from a --feet export of pair-video.mjs: how far each planted foot point moves over the floor.
# foot-slide.py feet.json   A point (heel or ball) counts as planted while it is within 3 cm of its own lowest level.
# A dancer's weight-bearing foot also turns and brushes on purpose, so some movement is real; compare runs rather than read one.
import json,sys,numpy as np
d=json.load(open(sys.argv[1]));fps=d['fps'];F=np.array(d['frames'])  # frame, performer, point, xyz
n=len(F);out={}
for p in range(F.shape[1]):
    slide=np.full(n-1,np.inf);planted=np.zeros(n-1,bool)
    for k in range(4):  # the stillest planted point is the one carrying the weight; its movement is the slide
        P=F[:,p,k];low=np.percentile(P[:,1],5);on=P[:,1]<low+.03;both=on[1:]&on[:-1];step=np.hypot(*(P[1:,[0,2]]-P[:-1,[0,2]]).T);slide=np.where(both,np.minimum(slide,step),slide);planted|=both
    slide=np.where(planted,slide,0)
    sec=[round(float(slide[int(s*fps):int((s+1)*fps)].sum()),2) for s in range(int((n-1)/fps))];t=planted.sum()/fps
    out[['left','right'][p]]=dict(plantedSeconds=round(float(t),1),slideMeters=round(float(slide.sum()),2),meanSlideSpeedCmPerS=round(float(100*slide.sum()/max(t,1e-6)),1),worstSecondMeters=max(sec),slidePerSecond=sec,hipPathMeters=round(float(np.hypot(*(F[1:,p].mean(1)[:,[0,2]]-F[:-1,p].mean(1)[:,[0,2]]).T).sum()),2))
print(json.dumps(out,indent=1))
