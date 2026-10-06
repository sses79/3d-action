import os,time,json,hashlib,subprocess,math
from pathlib import Path
start=time.perf_counter();d=Path('authoring/reviews/video/kick-reference/crop-pose');os.environ.setdefault('YOLO_CONFIG_DIR',str(Path('.authoring/vision-config').resolve()));os.environ.setdefault('MPLCONFIGDIR',str(Path('.authoring/vision-config/matplotlib').resolve()))
import cv2,torch
from PIL import Image,ImageDraw
from ultralytics import YOLO
from importlib.metadata import version
imports=time.perf_counter()-start;torch.set_num_threads(2);torch.set_num_interop_threads(1)
source=Path(json.loads((d/'video-manifest.json').read_text())['source']);probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(source)]));pts=[float(f['best_effort_timestamp_time']) for f in probe['frames']]
# Retain actual frames near a 30Hz target grid; no duplicate/interpolated frames.
indices=sorted(set(min(range(len(pts)),key=lambda i:abs(pts[i]-(11.45+n/30))) for n in range(70)));wanted=set(indices);cap=cv2.VideoCapture(str(source));frames=[];i=0
while True:
 ok,f=cap.read()
 if not ok:break
 if i in wanted:frames.append((i,pts[i],f))
 i+=1
cap.release();modelpath=Path('.authoring/vision-models/yolo26n-pose.pt');a=time.perf_counter();model=YOLO(str(modelpath));load=time.perf_counter()-a;a=time.perf_counter();model.predict(frames[0][2][140:780,550:1478],device='cpu',imgsz=640,verbose=False);warmup=time.perf_counter()-a
(d/'pose-frames').mkdir(exist_ok=True);rows=[];previous=None;edges=[(5,7),(7,9),(6,8),(8,10),(5,6),(5,11),(6,12),(11,12),(11,13),(13,15),(12,14),(14,16)];prediction=0
for index,t,f in frames:
 a=time.perf_counter();r=model.predict(f[140:780,550:1478],device='cpu',imgsz=640,verbose=False)[0];elapsed=time.perf_counter()-a;prediction+=elapsed;boxes=r.boxes.xyxy.cpu().tolist();boxes=[[b[0]+550,b[1]+140,b[2]+550,b[3]+140] for b in boxes]
 # Foreground performer: tallest detected person initially; then best overlap.
 def area(b):return max(0,b[2]-b[0])*max(0,b[3]-b[1])
 def iou(b,c):
  x=max(0,min(b[2],c[2])-max(b[0],c[0]));y=max(0,min(b[3],c[3])-max(b[1],c[1]));return x*y/max(1,area(b)+area(c)-x*y)
 selected=None;uncertain=False
 if boxes:
  if previous is None:selected=max(range(len(boxes)),key=lambda n:boxes[n][3]-boxes[n][1])
  else:
   scores=[iou(b,previous) for b in boxes];selected=max(range(len(boxes)),key=lambda n:scores[n]);uncertain=scores[selected]<.2
  if uncertain:selected=None
 if selected is not None:previous=boxes[selected]
 k=[] if selected is None else r.keypoints.data[selected].cpu().tolist();k=[[p[0]+550,p[1]+140,p[2]] for p in k]
 row={'frameIndex':index,'time':t,'clipTime':t-11.45,'detections':len(boxes),'selection':'tallest foreground initially then IoU continuity; not identity certification','bbox':None if selected is None else boxes[selected],'keypoints':k,'missingOrAmbiguousSubject':selected is None,'predictWallSeconds':elapsed,'stagesMs':r.speed,'file':f'pose-frames/frame-{index:04d}.jpg'};rows.append(row)
 im=Image.fromarray(cv2.cvtColor(f,cv2.COLOR_BGR2RGB));draw=ImageDraw.Draw(im)
 if k:
  draw.rectangle(tuple(boxes[selected]),outline='#0080ff',width=3)
  for a,b in edges:
   if min(k[a][2],k[b][2])>=.5:draw.line([tuple(k[a][:2]),tuple(k[b][:2])],fill='#00dd66',width=4)
  for j,p in enumerate(k):
   if p[2]>=.5:draw.ellipse((p[0]-4,p[1]-4,p[0]+4,p[1]+4),fill='orange');draw.text((p[0]+5,p[1]+3),str(j),fill='yellow')
 draw.rectangle((0,0,im.width,28),fill='#18212b');draw.text((8,7),f'Recording {t:.3f}s / cut {t-11.45:.3f}s / detections {len(boxes)} / selected foreground',fill='white');im.save(d/row['file'])
report={'status':'observational 2D pose evidence; no rig ground truth','model':str(modelpath),'modelSHA256':hashlib.sha256(modelpath.read_bytes()).hexdigest(),'versions':{p:version(p) for p in ['ultralytics','torch','opencv-python']},'sourceSHA256':json.loads((d/'video-manifest.json').read_text())['sha256'],'interval':[11.45,13.75],'inferenceCrop':[550,140,1478,780],'confidenceThreshold':.5,'keypointOrder':'COCO17; anatomical labels are model estimates and may swap','timingsSeconds':{'imports':imports,'modelLoad':load,'warmup':warmup,'predictions':prediction,'wall':time.perf_counter()-start},'frames':rows}
(d/'pose-report.json').write_text(json.dumps(report,indent=2));print(json.dumps({'frames':len(rows),'missing':sum(x['missingOrAmbiguousSubject'] for x in rows),'timings':report['timingsSeconds']}))
