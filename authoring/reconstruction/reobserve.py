"""Second look at frames where the detector drew both legs on one limb: the same detector on turned copies of the frame."""
import os
from pathlib import Path
# A pose detector is trained mostly on upright people. On a performer lying sideways in the air it often puts both legs on
# the limb it can read and none on the other. Turning the picture, so the body is nearer upright, lets it find the other leg.
# Returns, for each requested row, the keypoints (image coordinates of the unturned frame) found at each turn of 30 degrees.
def turned(video,model,rows):
 os.environ.setdefault('YOLO_CONFIG_DIR',str(Path('.authoring/vision-config').resolve()));os.environ.setdefault('MPLCONFIGDIR',str(Path('.authoring/vision-config/matplotlib').resolve()))
 import cv2,numpy as np
 from ultralytics import YOLO
 wanted={r['frameIndex']:r for r in rows};found={i:[] for i in wanted}
 if not wanted:return found
 detector=YOLO(str(model));cap=cv2.VideoCapture(video);i=0
 while i<=max(wanted):
  ok,img=cap.read()
  if not ok:break
  if i in wanted:
   x0,y0,x1,y1=wanted[i]['bbox'];cx,cy=(x0+x1)/2,(y0+y1)/2;s=int(max(x1-x0,y1-y0)*.75)
   for angle in range(30,360,30):
    M=cv2.getRotationMatrix2D((cx,cy),angle,1);M[:,2]+=(s-cx,s-cy);r=detector.predict(cv2.warpAffine(img,M,(2*s,2*s),borderMode=cv2.BORDER_REPLICATE),device='cpu',imgsz=640,verbose=False)[0]
    if not len(r.boxes):continue
    b=r.boxes.xyxy.cpu().numpy();k=r.keypoints.data[int(np.argmax((b[:,2]-b[:,0])*(b[:,3]-b[:,1])))].cpu().numpy();k[:,:2]=(np.linalg.inv(np.vstack([M,[0,0,1]]))@np.c_[k[:,:2],np.ones(17)].T).T[:,:2];found[i].append(k)
  i+=1
 cap.release();return found
