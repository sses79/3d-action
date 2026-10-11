# A square fighting pit with sloped walls as plain objects, for the Karate Combat window 99.77-103.6 s (pair-kc-139).
# scene-pit.py objects.json   Room: x right, y up, z toward the first camera (at x=0, z=0, 2.3 m up), metres.
# Measured from the first frame through the tracked camera: the far corner of the floor and the directions of the two walls
# that meet there (95 degrees apart in the picture's reading, made square here), wall height 1.3 m at a slope of about 41
# degrees from where its top corner sits in the picture. Assumed, not seen: the pit is 6.5 m square; ledge depth; the two near walls.
import json,sys,numpy as np
C=np.array([.86,-7.24]);back=np.array([-2.6,-6.26])-C;back/=np.linalg.norm(back);right=np.array([-back[1],back[0]]);right=right if right[1]>0 else -right  # along the back wall to picture left; along the right wall toward the camera
SIDE,H,RUN,LEDGE=6.5,1.3,1.5,1.2;corners=[C,C+SIDE*back,C+SIDE*back+SIDE*right,C+SIDE*right];centre=sum(corners)/4;O=[]
for name,(p,q) in zip(('back wall','left wall','near wall','right wall'),zip(corners,corners[1:]+corners[:1])):
    along=(q-p)/np.linalg.norm(q-p);n=np.array([-along[1],along[0]]);n=n if n@(centre-p)>0 else -n;mid=(p+q)/2;rot=float(np.degrees(np.arctan2(n[0],n[1])))
    at=mid-n*RUN/2;O.append(dict(name=name,shape='wedge',position=[at[0],H/2,at[1]],size=[SIDE+2*RUN,H,RUN],rotationY=rot))
    at=mid-n*(RUN+LEDGE/2);O.append(dict(name=name.replace('wall','ledge'),shape='box',position=[at[0],H/2,at[1]],size=[SIDE+2*(RUN+LEDGE),H,LEDGE],rotationY=rot))
    if name in('back wall','left wall'):at=mid-n*(RUN+LEDGE+.5);O.append(dict(name=name.replace('wall','spectators'),shape='box',position=[at[0],1.2,at[1]],size=[SIDE+2*(RUN+LEDGE),2.4,1.0],rotationY=rot))
json.dump(O,open(sys.argv[1],'w'),indent=1)
