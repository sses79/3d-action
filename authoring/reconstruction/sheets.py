"""Labelled review sheets: an overview of a video window, or video frames above rendered character frames."""
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('mode',choices=['overview','compare']);p.add_argument('--video',required=True);p.add_argument('--out',required=True);p.add_argument('--start',type=float,default=0);p.add_argument('--end',type=float);p.add_argument('--count',type=int,default=24);p.add_argument('--times');p.add_argument('--frames');p.add_argument('--id');args=p.parse_args()
import cv2,numpy as np,subprocess
# Screen recordings have a variable frame rate, so seeking by time is unreliable. Frames are matched to their real timestamps
# from ffprobe, the same way the reconstruction reads them, and decoded in order.
pts=[float(f['best_effort_timestamp_time']) for f in json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',args.video]))['frames']]
if not pts:raise SystemExit('Could not read the video')
cap=cv2.VideoCapture(args.video);duration=pts[-1];size=[int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))];fps=(len(pts)-1)/max(pts[-1]-pts[0],1e-6);decoded={}
def load(times):
 wanted={min(range(len(pts)),key=lambda i:abs(pts[i]-t)) for t in times};i=0
 while i<=max(wanted):
  ok,img=cap.read()
  if not ok:break
  if i in wanted:decoded[i]=img
  i+=1
def frame(t):
 i=min(range(len(pts)),key=lambda i:abs(pts[i]-t));return decoded.get(i,np.zeros((size[1],size[0],3),np.uint8))
def fit(img,height):return cv2.resize(img,(max(1,round(img.shape[1]*height/img.shape[0])),height),interpolation=cv2.INTER_AREA)
def label(img,text):
 cv2.rectangle(img,(0,0),(img.shape[1],22),(30,24,18),-1);cv2.putText(img,text,(6,16),cv2.FONT_HERSHEY_SIMPLEX,.48,(255,255,255),1,cv2.LINE_AA);return img
def tile(images,cols):
 width=max(i.shape[1] for i in images);height=max(i.shape[0] for i in images);rows=[]
 for r in range(0,len(images),cols):
  row=[cv2.copyMakeBorder(i,0,height-i.shape[0],0,width-i.shape[1],cv2.BORDER_CONSTANT,value=(20,16,12)) for i in images[r:r+cols]]
  while len(row)<cols:row.append(np.full((height,width,3),(20,16,12),np.uint8))
  rows.append(np.hstack(row))
 return np.vstack(rows)
out=Path(args.out);out.parent.mkdir(parents=True,exist_ok=True)
if args.mode=='overview':
 end=min(duration,args.end if args.end is not None else duration)
 if not 0<=args.start<end:raise SystemExit(f'Window must lie within the video (0-{duration:.2f} s)')
 times=[args.start+(end-args.start)*(i+.5)/args.count for i in range(args.count)];load(times);cols=min(args.count,6 if size[0]>=size[1] else 8)
 cv2.imwrite(str(out),tile([label(fit(frame(t),240),f'{t:.2f} s') for t in times],cols))
else:
 # Rows: source video, character from the front, character from the side. Times are clip seconds from --start.
 times=[float(t) for t in args.times.split(',')];load([args.start+t for t in times]);rows=[[],[],[]]
 for t in times:
  rows[0].append(label(fit(frame(args.start+t),300),f'clip {t:.2f} s  (video {args.start+t:.2f})'))
  for row,view in ((1,'front'),(2,'side')):
   img=cv2.imread(str(Path(args.frames)/f'{args.id}-{t:.3f}-{view}.png'))
   if img is None:raise SystemExit(f'Missing rendered frame for {t:.3f} {view}')
   rows[row].append(label(fit(img,300),f'{view} {t:.2f} s'))
 width=max(i.shape[1] for r in rows for i in r);pad=lambda i:cv2.copyMakeBorder(i,0,0,(width-i.shape[1])//2,width-i.shape[1]-(width-i.shape[1])//2,cv2.BORDER_CONSTANT,value=(20,16,12))
 cv2.imwrite(str(out),np.vstack([np.hstack([pad(i) for i in r]) for r in rows]))
print(json.dumps({'file':str(out),'times':[round(t,3) for t in times],'videoDuration':round(duration,3),'frameSize':size,'frameRate':round(fps,3)}))
