"""2D pose observations for one person in a video window. Observational evidence, not rig ground truth."""
import argparse,os,time,json,hashlib,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--video',required=True);p.add_argument('--sha256',required=True);p.add_argument('--start',type=float,required=True);p.add_argument('--end',type=float,required=True);p.add_argument('--model',required=True);p.add_argument('--out',required=True);args=p.parse_args()
start=time.perf_counter();os.environ.setdefault('YOLO_CONFIG_DIR',str(Path('.authoring/vision-config').resolve()));os.environ.setdefault('MPLCONFIGDIR',str(Path('.authoring/vision-config/matplotlib').resolve()))
import cv2,torch
from ultralytics import YOLO
from importlib.metadata import version
imports=time.perf_counter()-start;torch.set_num_threads(2);torch.set_num_interop_threads(1)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',args.video]));pts=[float(f['best_effort_timestamp_time']) for f in probe['frames']]
if not pts or args.start<pts[0]-.05 or args.end>pts[-1]+.05:raise SystemExit(f'Window {args.start}-{args.end}s is outside the video ({pts[0] if pts else 0}-{pts[-1] if pts else 0}s)')
# Retain actual frames near a 30Hz target grid; no duplicate/interpolated frames.
count=round((args.end-args.start)*30)+1;indices=sorted(set(min(range(len(pts)),key=lambda i:abs(pts[i]-(args.start+n/30))) for n in range(count)));wanted=set(indices);cap=cv2.VideoCapture(args.video);frames=[];i=0
while True:
 ok,f=cap.read()
 if not ok:break
 if i in wanted:frames.append((i,pts[i],f))
 i+=1
cap.release()
if len(frames)<3:raise SystemExit('Fewer than three decodable frames in the window')
modelpath=Path(args.model);a=time.perf_counter();model=YOLO(str(modelpath));load=time.perf_counter()-a;a=time.perf_counter();model.predict(frames[0][2],device='cpu',imgsz=640,verbose=False);warmup=time.perf_counter()-a
def area(b):return max(0,b[2]-b[0])*max(0,b[3]-b[1])
def iou(b,c):
 x=max(0,min(b[2],c[2])-max(b[0],c[0]));y=max(0,min(b[3],c[3])-max(b[1],c[1]));return x*y/max(1,area(b)+area(c)-x*y)
rows=[];previous=None;prediction=0
for index,t,f in frames:
 a=time.perf_counter();r=model.predict(f,device='cpu',imgsz=640,verbose=False)[0];elapsed=time.perf_counter()-a;prediction+=elapsed;boxes=r.boxes.xyxy.cpu().tolist()
 # Foreground performer: tallest detected person initially; then best overlap.
 selected=None
 if boxes:
  if previous is None:selected=max(range(len(boxes)),key=lambda n:boxes[n][3]-boxes[n][1])
  else:
   scores=[iou(b,previous) for b in boxes];selected=max(range(len(boxes)),key=lambda n:scores[n])
   if scores[selected]<.2:selected=None
 if selected is not None:previous=boxes[selected]
 k=[] if selected is None else r.keypoints.data[selected].cpu().tolist()
 rows.append({'frameIndex':index,'time':t,'clipTime':t-args.start,'detections':len(boxes),'selection':'tallest foreground initially then IoU continuity; not identity certification','bbox':None if selected is None else boxes[selected],'keypoints':k,'missingOrAmbiguousSubject':selected is None,'predictWallSeconds':elapsed})
report={'status':'observational 2D pose evidence; no rig ground truth','model':modelpath.name,'modelSHA256':hashlib.sha256(modelpath.read_bytes()).hexdigest(),'versions':{n:version(n) for n in ['ultralytics','torch','opencv-python']},'sourceSHA256':args.sha256,'interval':[args.start,args.end],'frameSize':[int(frames[0][2].shape[1]),int(frames[0][2].shape[0])],'confidenceThreshold':.5,'keypointOrder':'COCO17; anatomical labels are model estimates and may swap','timingsSeconds':{'imports':imports,'modelLoad':load,'warmup':warmup,'predictions':prediction,'wall':time.perf_counter()-start},'frames':rows}
out=Path(args.out);out.mkdir(parents=True,exist_ok=True);(out/'pose-report.json').write_text(json.dumps(report));print(json.dumps({'frames':len(rows),'missing':sum(x['missingOrAmbiguousSubject'] for x in rows),'timings':report['timingsSeconds']}))
