"""2D pose observations for one person in a video window. Observational evidence, not rig ground truth."""
import argparse,os,time,json,hashlib,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--video',required=True);p.add_argument('--sha256',required=True);p.add_argument('--start',type=float,required=True);p.add_argument('--end',type=float,required=True);p.add_argument('--model',required=True);p.add_argument('--out',required=True);p.add_argument('--subject',choices=['left','right'],help='two performers in the window: which one to follow, named by where they stand in the picture at the start');args=p.parse_args()
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
rows=[];prediction=0;detections=[];tracks=[];named=[]
# Two performers. Identities come from the tracker that ships with the detector (BoT-SORT: motion plus appearance), not from
# our overlap chains, which cannot tell two people apart once their boxes overlap. The two performers are the two identities
# with the most box area over the window (spectators and a referee at the back are smaller), and they are called left and
# right by where their boxes' centres are, on average, over the first five frames each is seen. Pictures go in at 960 pixels
# because each of two people fills less of the frame than one. Tried on one clip of two fighters with a kick: both identities
# held for 51 frames. Not tried where the two cross over or clinch.
for index,t,f in frames:
 a=time.perf_counter()
 if args.subject:
  r=model.track(f,persist=True,tracker='botsort.yaml',device='cpu',imgsz=960,verbose=False)[0];named.append(r.boxes.id.int().tolist() if r.boxes.id is not None else [None]*len(r.boxes))
 else:r=model.predict(f,device='cpu',imgsz=640,verbose=False)[0]
 elapsed=time.perf_counter()-a;prediction+=elapsed;detections.append((r.boxes.xyxy.cpu().tolist(),r.keypoints.data.cpu().tolist() if len(r.boxes) else [],elapsed))
pair=None
if args.subject:
 total={};seen={}
 for n,(boxes,_,_) in enumerate(detections):
  for d,i in enumerate(named[n]):
   if i is not None:total[i]=total.get(i,0)+area(boxes[d]);seen.setdefault(i,[]).append((boxes[d][0]+boxes[d][2])/2)
 two=sorted(total,key=total.get,reverse=True)[:2]
 if len(two)<2:raise SystemExit('Unsupported window: fewer than two tracked people')
 two.sort(key=lambda i:sum(seen[i][:5])/len(seen[i][:5]));pair={'left':two[0],'right':two[1]};mine=pair[args.subject];theirs=pair['right' if args.subject=='left' else 'left']
 # Through a clinch. When one performer goes behind the other the tracker drops that identity and, once the performer shows
 # again, starts a new one. Two repairs, both by what the performers wear, which the tracker's own appearance matching did not
 # hold on to: the colour of the legs (pixels along hip to knee of the detected pose; the lower middle of the box where the
 # pose has no confident hips and knees), as a median over the frames of an identity.
 # 1. Stitching. Another identity of comparable size, seen for three frames or more, that only exists while one performer is missing is that performer, if
 #    its colour is nearer that performer's than the other's. A spectator or a referee exists while both performers do, so
 #    is never taken. Frames between the pieces stay missing and are bridged later.
 # 2. Swaps. Where both performers have a box and, for three frames or more, each box's colour fits the other performer
 #    better by a clear margin, the two boxes are exchanged for that run.
 # Tried on one clinch (114 frames, the hidden fighter lost at frame 69 and found again as a new identity at 74). The colours
 # there are white and black trousers, about as easy as it gets; two performers dressed alike would not be told apart.
 import numpy as np
 def colour(n,d):
  f=frames[n][2];k=detections[n][1][d] if d<len(detections[n][1]) else [];pts=[]
  for a,b in ((11,13),(12,14)):
   if len(k)==17 and k[a][2]>.5 and k[b][2]>.5:pts+=[(k[a][0]+(k[b][0]-k[a][0])*u,k[a][1]+(k[b][1]-k[a][1])*u) for u in (.25,.4,.55,.7,.85)]
  if not pts:
   x0,y0,x1,y1=detections[n][0][d];pts=[(x0+(x1-x0)*u,y0+(y1-y0)*v) for u in (.4,.5,.6) for v in (.6,.7,.8)]
  px=[f[int(min(max(y,0),f.shape[0]-1)),int(min(max(x,0),f.shape[1]-1))] for x,y in pts];return np.median(np.array(px,dtype=float),0)
 where={}
 for n in range(len(detections)):
  for d,i in enumerate(named[n]):
   if i is not None:where.setdefault(i,{})[n]=d
 look={i:np.median([colour(n,d) for n,d in m.items()],0) for i,m in where.items()};size={i:float(np.median([area(detections[n][0][d]) for n,d in m.items()])) for i,m in where.items()}
 members={'left':dict(where[pair['left']]),'right':dict(where[pair['right']])};pieces={'left':[pair['left']],'right':[pair['right']]};usual_area=min(size[pair['left']],size[pair['right']])
 for i in sorted((i for i in where if i not in two and size[i]>=.3*usual_area and len(where[i])>=3),key=lambda i:min(where[i])):
  free=[side for side in ('left','right') if len(set(where[i])&set(members[side]))<=2]
  if len(free)!=1:continue
  side=free[0];other='right' if side=='left' else 'left'
  if np.linalg.norm(look[i]-look[pair[side]])<np.linalg.norm(look[i]-look[pair[other]]):members[side].update({n:d for n,d in where[i].items() if n not in members[side]});pieces[side].append(i)
 swapped=[];cross=[n for n in range(len(detections)) if n in members['left'] and n in members['right'] and (lambda a,b:np.linalg.norm(a-look[pair['right']])+np.linalg.norm(b-look[pair['left']])+60<np.linalg.norm(a-look[pair['left']])+np.linalg.norm(b-look[pair['right']]))(colour(n,members['left'][n]),colour(n,members['right'][n]))]
 runs=[]
 for n in cross:
  if runs and n-runs[-1][-1]==1:runs[-1].append(n)
  else:runs.append([n])
 for run in runs:
  if len(run)>=3:
   for n in run:members['left'][n],members['right'][n]=members['right'][n],members['left'][n];swapped.append(n)
 stitched={side:[int(i) for i in pieces[side][1:]] for side in pieces};own=members[args.subject];others=members['right' if args.subject=='left' else 'left']
# The performer is the person who stays: boxes are chained frame to frame by overlap, bridging gaps of up to six frames, and the
# longest chain wins (taller on a tie). A figure that fades out, such as the previous clip in a crossfade, forms a short chain.
for n,(boxes,_,_) in enumerate(detections):
 taken=set()
 for d in sorted(range(len(boxes)),key=lambda d:boxes[d][1]-boxes[d][3]):
  best=max((k for k in range(len(tracks)) if k not in taken and n-tracks[k]['frame']<=6),key=lambda k:iou(boxes[d],tracks[k]['box']),default=None)
  if best is not None and iou(boxes[d],tracks[best]['box'])>=.2:tracks[best].update(box=boxes[d],frame=n);tracks[best]['members'][n]=d;taken.add(best)
  else:tracks.append({'box':boxes[d],'frame':n,'members':{n:d}});taken.add(len(tracks)-1)
chosen=max(tracks,key=lambda k:(len(k['members']),float(sorted(detections[n][0][d][3]-detections[n][0][d][1] for n,d in k['members'].items())[len(k['members'])//2])))['members'] if tracks else {}
if pair:chosen=dict(own)
heights=sorted(detections[n][0][d][3]-detections[n][0][d][1] for n,d in chosen.items());usual=heights[len(heights)//2] if heights else 0;previous=None
for n,(index,t,f) in enumerate(frames):
 boxes,keypoints,elapsed=detections[n];selected=chosen.get(n)
 # Outside the chain (a fast pose change can break the overlap), continue by overlap with the last accepted box, or take the
 # tallest figure when it is at least 60% of the performer's usual height.
 if selected is None and boxes and not pair:
  near=max(range(len(boxes)),key=lambda d:iou(boxes[d],previous)) if previous else None;tall=max(range(len(boxes)),key=lambda d:boxes[d][3]-boxes[d][1])
  selected=near if near is not None and iou(boxes[near],previous)>=.2 else tall if boxes[tall][3]-boxes[tall][1]>=.6*usual else None
 if selected is not None:previous=boxes[selected]
 k=[] if selected is None else keypoints[selected]
 rows.append({'frameIndex':index,'time':t,'clipTime':t-args.start,'detections':len(boxes),'selection':'longest overlap-linked chain of boxes, continued by overlap or height; not identity certification' if not pair else f'{args.subject} of the two largest tracked identities (BoT-SORT); not identity certification',**({'otherBBox':boxes[others[n]] if n in others else None} if pair else {}),'bbox':None if selected is None else boxes[selected],'keypoints':k,'missingOrAmbiguousSubject':selected is None,'predictWallSeconds':elapsed})
report={'status':'observational 2D pose evidence; no rig ground truth','model':modelpath.name,'modelSHA256':hashlib.sha256(modelpath.read_bytes()).hexdigest(),'versions':{n:version(n) for n in ['ultralytics','torch','opencv-python']},'sourceSHA256':args.sha256,**({'subject':args.subject,'performers':{k:int(v) for k,v in pair.items()},'stitchedIdentities':stitched,'swappedFrames':swapped,'legColours':{k:[int(x) for x in look[v]] for k,v in pair.items()}} if pair else {}),'interval':[args.start,args.end],'frameSize':[int(frames[0][2].shape[1]),int(frames[0][2].shape[0])],'confidenceThreshold':.5,'keypointOrder':'COCO17; anatomical labels are model estimates and may swap','timingsSeconds':{'imports':imports,'modelLoad':load,'warmup':warmup,'predictions':prediction,'wall':time.perf_counter()-start},'frames':rows}
out=Path(args.out);out.mkdir(parents=True,exist_ok=True);(out/'pose-report.json').write_text(json.dumps(report));print(json.dumps({'frames':len(rows),'missing':sum(x['missingOrAmbiguousSubject'] for x in rows),'timings':report['timingsSeconds']}))
