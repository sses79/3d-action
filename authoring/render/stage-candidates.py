# Candidate frames for building a stage: contact sheets of a whole video, then the sharpest frame near chosen times.
# stage-candidates.py video.mp4 out_dir                 -> out_dir/sheet*.jpg, one thumbnail every 1.5 s with its time
# stage-candidates.py video.mp4 out_dir 3.0,28.5,69.0   -> out_dir/<letter>-<time>s.jpg (sharpest within 0.45 s) and candidates.jpg
# Output is third-party footage: keep it under .authoring/, never in git.
import cv2,numpy as np,sys,os
video,out=sys.argv[1],sys.argv[2];os.makedirs(out,exist_ok=True);cap=cv2.VideoCapture(video);fps=cap.get(cv2.CAP_PROP_FPS);dur=cap.get(cv2.CAP_PROP_FRAME_COUNT)/fps
def grab(t):cap.set(cv2.CAP_PROP_POS_FRAMES,round(t*fps));ok,im=cap.read();return im if ok else None
def label(im,text):cv2.putText(im,text,(4,im.shape[0]-6),0,.5,(0,0,0),3);cv2.putText(im,text,(4,im.shape[0]-6),0,.5,(255,255,255),1);return im
if len(sys.argv)<4:
    th=[label(cv2.resize(im,(256,144)),'%.1f'%t) for t in np.arange(0,dur,1.5) if (im:=grab(t)) is not None]
    for k in range(0,len(th),48):
        part=th[k:k+48];part+=[np.zeros_like(th[0])]*((-len(part))%8);cv2.imwrite('%s/sheet%d.jpg'%(out,k//48),np.vstack([np.hstack(part[i:i+8]) for i in range(0,len(part),8)]),[cv2.IMWRITE_JPEG_QUALITY,80])
    print('duration %.1f s, %d thumbnails'%(dur,len(th)))
else:
    small=[]
    for n,t0 in enumerate(float(x) for x in sys.argv[3].split(',')):
        best=None
        for t in np.arange(t0-.45,t0+.46,.125):
            im=grab(max(0,t))
            if im is None:continue
            sharp=cv2.Laplacian(cv2.cvtColor(im,cv2.COLOR_BGR2GRAY),cv2.CV_64F).var()
            if best is None or sharp>best[0]:best=(sharp,t,im)
        sharp,t,im=best;name='%s-%.2fs.jpg'%(chr(65+n),t);cv2.imwrite(os.path.join(out,name),im,[cv2.IMWRITE_JPEG_QUALITY,92]);print(name,'sharpness',round(sharp));small.append(label(cv2.resize(im,(640,360)),'%s  %.2f s'%(chr(65+n),t)))
    small+=[np.zeros_like(small[0])]*((-len(small))%4);cv2.imwrite(os.path.join(out,'candidates.jpg'),np.vstack([np.hstack(small[i:i+4]) for i in range(0,len(small),4)]),[cv2.IMWRITE_JPEG_QUALITY,88])
