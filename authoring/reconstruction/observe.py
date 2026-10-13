"""2D pose observations for one person in a video window. Observational evidence, not rig ground truth."""
import argparse,os,time,json,hashlib,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--video',required=True);p.add_argument('--sha256',required=True);p.add_argument('--start',type=float,required=True);p.add_argument('--end',type=float,required=True);p.add_argument('--model',required=True);p.add_argument('--out',required=True);p.add_argument('--subject',choices=['left','right'],help='two performers in the window: which one to follow, named by where they stand in the picture at the start');p.add_argument('--boxes',help='FILE:NAME, the performer\'s box per frame from authoring/render/sam3-track.py (a person chosen by a point and followed by SAM 3): used as it is, in place of this script\'s own choice of who to follow. For a clip with many people');p.add_argument('--looks',help='pose report of another window of the same two performers (a neighbouring shot where they stand apart): their looks are taken from it when this window cannot show them apart, or shows them too alike');args=p.parse_args()
start=time.perf_counter();os.environ.setdefault('YOLO_CONFIG_DIR',str(Path('.authoring/vision-config').resolve()));os.environ.setdefault('MPLCONFIGDIR',str(Path('.authoring/vision-config/matplotlib').resolve()))
import cv2,torch
from ultralytics import YOLO
from importlib.metadata import version
imports=time.perf_counter()-start;torch.set_num_threads(2);torch.set_num_interop_threads(1)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',args.video]));pts=[float(f['best_effort_timestamp_time']) for f in probe['frames']]
if not pts or args.start<pts[0]-.05 or args.end>pts[-1]+.05:raise SystemExit(f'Window {args.start}-{args.end}s is outside the video ({pts[0] if pts else 0}-{pts[-1] if pts else 0}s)')
# Retain actual frames near a 30Hz target grid; no duplicate/interpolated frames.
count=round((args.end-args.start)*30)+1;indices=sorted(set(min(range(len(pts)),key=lambda i:abs(pts[i]-(args.start+n/30))) for n in range(count)));wanted=set(indices);cap=cv2.VideoCapture(args.video);frames=[];i=0
last=max(wanted)
while i<=last:  # frames before the window are stepped over without being unpacked, and reading stops at its end
 if i in wanted:
  ok,f=cap.read()
  if not ok:break
  frames.append((i,pts[i],f))
 elif not cap.grab():break
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
reused=0
for index,t,f in frames:
 a=time.perf_counter()
 if args.subject:
  r=model.track(f,persist=True,tracker='botsort.yaml',device='cpu',imgsz=960,verbose=False)[0];named.append(r.boxes.id.int().tolist() if r.boxes.id is not None else [None]*len(r.boxes))
 elif args.boxes:
  # small figures in a wide shot: the detector at full size, for their joints. Every player of the clip asks for the same
  # frames, so each frame's result is kept (also written by authoring/render/court-people.py) and read back by the next build.
  kept=Path('.authoring/reconstruction-cache')/f'detections-{args.sha256[:16]}-{modelpath.stem}-1920'/f'{index}.json'
  if kept.exists():
   d=json.loads(kept.read_text());elapsed=time.perf_counter()-a;prediction+=elapsed;detections.append((d['boxes'],d['keypoints'],elapsed));reused+=1;continue
  r=model.predict(f,device='cpu',imgsz=1920,verbose=False,conf=.2)[0];kept.parent.mkdir(parents=True,exist_ok=True);tmp=kept.with_suffix(f'.{os.getpid()}.tmp');tmp.write_text(json.dumps({'boxes':r.boxes.xyxy.cpu().tolist(),'keypoints':r.keypoints.data.cpu().tolist() if len(r.boxes) else []}));os.replace(tmp,kept)
 else:r=model.predict(f,device='cpu',imgsz=640,verbose=False)[0]
 elapsed=time.perf_counter()-a;prediction+=elapsed;detections.append((r.boxes.xyxy.cpu().tolist(),r.keypoints.data.cpu().tolist() if len(r.boxes) else [],elapsed))
pair=None
if args.subject:
 total={};seen={}
 for n,(boxes,_,_) in enumerate(detections):
  for d,i in enumerate(named[n]):
   if i is not None:total[i]=total.get(i,0)+area(boxes[d]);seen.setdefault(i,[]).append((boxes[d][0]+boxes[d][2])/2)
 two=sorted(total,key=total.get,reverse=True)[:2]
 # The two performers are the two who are there at the start. Most area over the whole window is not enough where the two wrap
 # round each other: the tracker then breaks each into several identities, and the two largest pieces can be one dancer early
 # and the same dancer late. So: the first frame with two identities of comparable size that both go on (each in three of the
 # next six frames, each seen five frames or more, neither a passer-by with under 15% of the largest total). If there is no
 # such frame the two largest stand.
 at={}
 for n in range(len(detections)):
  for d,i in enumerate(named[n]):
   if i is not None:at.setdefault(i,{})[n]=d
 for n in range(len(detections)):
  here=sorted((i for i in at if n in at[i] and len(at[i])>=5 and total[i]>=.15*max(total.values()) and sum(m in at[i] for m in range(n,n+6))>=3),key=lambda i:-area(detections[n][0][at[i][n]]))
  if len(here)>=2 and area(detections[n][0][at[here[1]][n]])>=.3*area(detections[n][0][at[here[0]][n]]):two=here[:2];break
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
 def stitch(fits):
  # (a box much larger than either performer's is one box round both of them, not one of them come back)
  for i in sorted((i for i in where if i not in two and size[i]>=.3*usual_area and size[i]<=1.75*max(size[pair['left']],size[pair['right']]) and len(where[i])>=3),key=lambda i:min(where[i])):
   free=[side for side in ('left','right') if len(set(where[i])&set(members[side]))<=2]
   if len(free)!=1:continue
   side=free[0];other='right' if side=='left' else 'left'
   if fits(i,side,other):members[side].update({n:d for n,d in where[i].items() if n not in members[side]});pieces[side].append(i)
 by_legs=lambda i,side,other:np.linalg.norm(look[i]-look[pair[side]])<np.linalg.norm(look[i]-look[pair[other]])
 def swap_by_legs():
  cross=[n for n in range(len(detections)) if n in members['left'] and n in members['right'] and (lambda a,b:np.linalg.norm(a-look[pair['right']])+np.linalg.norm(b-look[pair['left']])+60<np.linalg.norm(a-look[pair['left']])+np.linalg.norm(b-look[pair['right']]))(colour(n,members['left'][n]),colour(n,members['right'][n]))]
  runs=[]
  for n in cross:
   if runs and n-runs[-1][-1]==1:runs[-1].append(n)
   else:runs.append([n])
  for run in runs:
   if len(run)>=3:
    for n in run:members['left'][n],members['right'][n]=members['right'][n],members['left'][n];swapped.append(n)
 # 2b. Swaps where the two are dressed alike below the waist (two dancers in the same blue), or where the tracker hands each
 #     identity to the other person as they cross and never hands it back, so that each identity's own median colour is a
 #     mix of both people. What each performer looks like is learned from the longest unbroken stretch in which their boxes
 #     stay apart (within it the tracker cannot have exchanged them): the colour of the trunk (shoulders to hips) and of the
 #     thighs. That stretch is taken as straight. Then every frame with both boxes is read
 #     as straight or exchanged, whichever fits those two looks better, and one path is chosen through the clip that pays for
 #     every change of mind, so a few muddled frames in the middle of a crossing do not flip it and a real exchange flips it
 #     once. Lighting that changes for both at once moves both readings together and cancels.
 def trunk(n,d):
  f=frames[n][2];k=detections[n][1][d] if d<len(detections[n][1]) else [];x0,y0,x1,y1=detections[n][0][d]
  if len(k)==17 and all(k[a][2]>.5 for a in (5,6,11,12)):
   pts=[((k[5][0]+(k[6][0]-k[5][0])*u)*(1-v)+(k[11][0]+(k[12][0]-k[11][0])*u)*v,(k[5][1]+(k[6][1]-k[5][1])*u)*(1-v)+(k[11][1]+(k[12][1]-k[11][1])*u)*v) for u in (.25,.5,.75) for v in (.2,.4,.6,.8)]
  else:pts=[(x0+(x1-x0)*u,y0+(y1-y0)*v) for u in (.4,.5,.6) for v in (.22,.3,.38,.45)]
  px=[f[int(min(max(y,0),f.shape[0]-1)),int(min(max(x,0),f.shape[1]-1))] for x,y in pts];return np.median(np.array(px,dtype=float),0)
 feature=lambda n,d:np.concatenate([trunk(n,d),colour(n,d)])
 # First each performer's chain is made as long as it can be without looking at colours: an identity of comparable size that
 # only exists while one of the two is missing joins that one. Who is really in each chain at each moment is decided next.
 base={side:dict(members[side]) for side in members}
 def restore():
  for side in base:members[side].clear();members[side].update(base[side]);del pieces[side][1:]
 stitch(lambda i,side,other:True)
 both=[n for n in range(len(detections)) if n in members['left'] and n in members['right']];apart=lambda n:iou(detections[n][0][members['left'][n]],detections[n][0][members['right'][n]])
 def longest(limit):
  stretches=[[]]
  for n in both:
   if apart(n)<limit and (not stretches[-1] or n-stretches[-1][-1]<=2):stretches[-1].append(n)
   elif apart(n)<limit:stretches.append([n])
   elif stretches[-1]:stretches.append([])
  return max(stretches,key=len)
 # where the two are never clear of each other for five frames (a hold), a stretch in which their boxes only touch at the
 # edges will do: the trunk and thighs sampled are still each one's own
 clean=longest(.05);loose=len(clean)<5
 if loose:clean=longest(.15)
 known=set(clean)
 swapped=[];evidence=None;borrowed=None;ref=None;gap=0.
 if len(clean)>=5:ref={side:np.median([feature(n,members[side][n]) for n in clean],0) for side in ('left','right')};gap=float(np.linalg.norm(ref['left']-ref['right']))
 # Looks from another shot. In a hold the two are never apart, and what can be sampled of each is partly the other, so their
 # looks come out alike. A neighbouring shot of the same two, where they stand apart, gives the two looks; which of them is
 # this window's left and which its right is settled on this window's own clearest frames.
 if args.looks and (loose or gap<40) and both:
  other=json.load(open(args.looks)).get('identityEvidence') or {}
  if other.get('looks'):
   A,B=np.array(other['looks']['left']),np.array(other['looks']['right']);judge=clean if clean else both[:5];fl=np.median([feature(n,members['left'][n]) for n in judge],0);fr=np.median([feature(n,members['right'][n]) for n in judge],0)
   straight=np.linalg.norm(fl-A)+np.linalg.norm(fr-B)<=np.linalg.norm(fl-B)+np.linalg.norm(fr-A);ref={'left':A,'right':B} if straight else {'left':B,'right':A};gap=float(np.linalg.norm(A-B));borrowed={'report':os.path.basename(os.path.dirname(os.path.abspath(args.looks))),'itsLeftIsThisWindows':'left' if straight else 'right'}
   if not clean:clean=judge;known=set(clean)
 if ref is not None:
  # a change of mind costs about as much as eight frames that clearly favour it; two looks too alike to tell are left alone
  price=4*gap
  if gap>=40:
   cost=[]
   for n in both:
    a,b=feature(n,members['left'][n]),feature(n,members['right'][n]);cost.append((np.linalg.norm(a-ref['left'])+np.linalg.norm(b-ref['right']),np.linalg.norm(a-ref['right'])+np.linalg.norm(b-ref['left'])))
   best=[[0.,0.]];back=[]
   for n,(straight,exchanged) in zip(both,cost):
    if n in known:exchanged=1e18
    p=best[-1];stay0,from1=p[0],p[1]+price;stay1,from0=p[1],p[0]+price;back.append((0 if stay0<=from1 else 1,1 if stay1<=from0 else 0));best.append([min(stay0,from1)+straight,min(stay1,from0)+exchanged])
   state=0 if best[-1][0]<=best[-1][1] else 1;path=[]
   for k in range(len(cost)-1,-1,-1):path.append(state);state=back[k][state]
   path=path[::-1]
   # left and right are named by where the two stand in the first frames, so the first frame with both is straight by
   # definition; if the looks were learned from a stretch after an exchange, the whole reading is the other way round
   if path and path[0]:path=[1-st for st in path]
   for n,st in zip(both,path):
    if st:members['left'][n],members['right'][n]=members['right'][n],members['left'][n];swapped.append(n)
   # frames with only one of the two boxes take the reading of the nearest frame that had both
   flip=dict(zip(both,path))
   for n in range(len(detections)):
    if n in flip or not both:continue
    near=min(both,key=lambda m:abs(m-n))
    if flip[near]:
     l,r=members['left'].pop(n,None),members['right'].pop(n,None)
     if r is not None:members['left'][n]=r
     if l is not None:members['right'][n]=l
     swapped.append(n)
  else:restore();stitch(by_legs);swap_by_legs()
  evidence={'framesLearnedFrom':len(clean),'lookDifference':round(gap,1),'changePrice':round(price,1),'learnedFromFrames':[clean[0],clean[-1]],**({'boxesTouching':True} if loose else {}),**({'looksBorrowed':borrowed} if borrowed else {}),'looks':{side:[round(float(x),1) for x in ref[side]] for side in ref}}
 else:
  # too few frames with the two apart to learn from: the earlier rules, on each identity's own median leg colour
  restore();stitch(by_legs);swap_by_legs()
 swapped=sorted(set(swapped))
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
# Boxes given from outside: each frame's box is added as a detection of its own (with the joints of whichever detected person
# it overlaps most, if any) and chosen. A box far larger than its neighbours in time is the outline having leaked onto other
# people for a moment; it is dropped and bridged like a missing frame.
given=None;import numpy as np
if args.boxes:
 fn,name=args.boxes.rsplit(':',1);tk=json.load(open(fn));tt=np.array(tk['times']);bx=tk['tracks'][name];ar=[b['area'] if b else np.nan for b in bx];given={}
 for n,(index,t,f) in enumerate(frames):
  k=int(np.argmin(np.abs(tt-t)))
  if abs(tt[k]-t)>.02 or not bx[k]:continue
  near=[a for a in ar[max(0,k-8):k+9] if a==a]
  if bx[k]['area']>1.9*np.median(near):continue
  b=bx[k]['box'];w,h=b[2]-b[0],b[3]-b[1];b=[max(0,b[0]-.04*w),max(0,b[1]-.04*h),b[2]+.04*w,b[3]+.04*h];boxes,kps,el=detections[n];best=max(range(len(boxes)),key=lambda d:iou(boxes[d],b),default=None)
  detections[n]=(boxes+[b],kps+[kps[best] if best is not None and iou(boxes[best],b)>.4 else []],el);given[n]=len(boxes)
 chosen=given  # a frame for which the given track has no box is the tracker saying the person is hidden there: marked like a pair's hidden performer below
heights=sorted(detections[n][0][d][3]-detections[n][0][d][1] for n,d in chosen.items());usual=heights[len(heights)//2] if heights else 0;previous=None
# One box round both. A stretch in which this performer has no box while the other has one, and which begins and ends with the
# two in contact (boxes overlapping, or centres closer than a box is wide), is this performer hidden in the hold: behind or
# wrapped in the other, not gone. Such frames are marked and are not counted as the performer missing.
hidden=set()
if pair:
 def contact(n):
  if n is None:return True
  if n not in others:return False
  a,b=detections[n][0][own[n]],detections[n][0][others[n]];return iou(a,b)>=.1 or abs((a[0]+a[2])-(b[0]+b[2]))/2<.75*max(a[2]-a[0],b[2]-b[0])
 mine_at=sorted(own);gap=[]
 for n in range(len(detections)+1):
  if n<len(detections) and n not in own:gap.append(n)
  elif gap:
   before=max((m for m in mine_at if m<gap[0]),default=None);after=min((m for m in mine_at if m>gap[-1]),default=None)
   if (before is not None or after is not None) and contact(before) and contact(after):hidden.update(m for m in gap if m in others)
   gap=[]
for n,(index,t,f) in enumerate(frames):
 boxes,keypoints,elapsed=detections[n];selected=chosen.get(n)
 # Outside the chain (a fast pose change can break the overlap), continue by overlap with the last accepted box, or take the
 # tallest figure when it is at least 60% of the performer's usual height.
 if selected is None and boxes and not pair and given is None:
  near=max(range(len(boxes)),key=lambda d:iou(boxes[d],previous)) if previous else None;tall=max(range(len(boxes)),key=lambda d:boxes[d][3]-boxes[d][1])
  selected=near if near is not None and iou(boxes[near],previous)>=.2 else tall if boxes[tall][3]-boxes[tall][1]>=.6*usual else None
 if selected is not None:previous=boxes[selected]
 k=[] if selected is None else keypoints[selected]
 rows.append({'frameIndex':index,'time':t,'clipTime':t-args.start,'detections':len(boxes),'selection':'longest overlap-linked chain of boxes, continued by overlap or height; not identity certification' if not pair else f'{args.subject} of the two largest tracked identities (BoT-SORT); not identity certification',**({'otherBBox':boxes[others[n]] if n in others else None} if pair else {}),'bbox':None if selected is None else boxes[selected],**({'hiddenByOther':True} if selected is None and (n in hidden or args.boxes) else {}),'keypoints':k,'missingOrAmbiguousSubject':selected is None,'predictWallSeconds':elapsed})
report={'status':'observational 2D pose evidence; no rig ground truth','model':modelpath.name,'modelSHA256':hashlib.sha256(modelpath.read_bytes()).hexdigest(),'versions':{n:version(n) for n in ['ultralytics','torch','opencv-python']},'sourceSHA256':args.sha256,**({'subject':args.subject,'performers':{k:int(v) for k,v in pair.items()},'stitchedIdentities':stitched,'swappedFrames':swapped,'identityEvidence':evidence,'trackedIdentities':[{'id':int(i),'firstFrame':min(m),'lastFrame':max(m),'frames':len(m),'medianArea':round(size[i])} for i,m in sorted(where.items(),key=lambda x:min(x[1]))],'legColours':{k:[int(x) for x in look[v]] for k,v in pair.items()}} if pair else {}),'interval':[args.start,args.end],'frameSize':[int(frames[0][2].shape[1]),int(frames[0][2].shape[0])],'confidenceThreshold':.5,'keypointOrder':'COCO17; anatomical labels are model estimates and may swap','timingsSeconds':{'imports':imports,'modelLoad':load,'warmup':warmup,'predictions':prediction,'wall':time.perf_counter()-start},'frames':rows}
out=Path(args.out);out.mkdir(parents=True,exist_ok=True);(out/'pose-report.json').write_text(json.dumps(report));print(json.dumps({'frames':len(rows),'missing':sum(x['missingOrAmbiguousSubject'] for x in rows),'timings':report['timingsSeconds']}))
