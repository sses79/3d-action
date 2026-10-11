# Stills of a rendered video over the same moments of the source video, to check a scene against the picture.
# compare-stills.py render.mp4 source.mp4 <window start s> out.jpg t0,t1,...   (times in seconds from the window start)
import cv2,numpy as np,sys
r,v,start,out=cv2.VideoCapture(sys.argv[1]),cv2.VideoCapture(sys.argv[2]),float(sys.argv[3]),sys.argv[4];rows=[[],[]]
for t in (float(x) for x in sys.argv[5].split(',')):
    for k,(cap,at) in enumerate(((v,start+t),(r,t))):
        cap.set(cv2.CAP_PROP_POS_FRAMES,round(at*cap.get(cv2.CAP_PROP_FPS)));ok,im=cap.read()
        if not ok:cap.set(cv2.CAP_PROP_POS_FRAMES,cap.get(cv2.CAP_PROP_FRAME_COUNT)-1);ok,im=cap.read()
        im=cv2.resize(im,(480,270));cv2.putText(im,'%.1f s'%t,(6,262),0,.6,(0,0,0),3);cv2.putText(im,'%.1f s'%t,(6,262),0,.6,(255,255,255),1);rows[k].append(im)
cv2.imwrite(out,np.vstack([np.hstack(rows[0]),np.hstack(rows[1])]))
