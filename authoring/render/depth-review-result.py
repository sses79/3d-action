"""Review a generated video against the depth package it was made from (docs/DEPTH_REFERENCE_IMPROVEMENT_PLAN.md, step 7).
  .authoring/vision-venv/bin/python authoring/render/depth-review-result.py PACKAGE-ID RESULT.mp4 [--label NAME]
Measures, without judging taste:
- length: the result's against the guide's (a 4 s result from a 5 s guide cuts the last shot short);
- cuts: the result's own cuts (a jump in the picture at least 4x the moving median and over 18 grey levels) matched to the
  guide's within 0.15 s: matched (with the offset), missing (a guide cut with no result cut), extra (a result cut the guide lacks);
- motion per beat: optical flow inside each beat (160x90 grey, frames 1/15 s apart, cuts left out), the 90th percentile of the
  displacement in picture widths a second, in the result and in the source, and their ratio; under 0.5 is flagged: the action
  may have become a pose;
- a sheet at each keyframe time: source, depth still and the result frame side by side.
Writes .authoring/video-clay/<package>/reviews/<label>/review.json and sheet.jpg (the result video is not copied; its path and
SHA-256 are recorded) and prints the report."""
import sys,json,hashlib,pathlib,time,argparse,cv2,numpy as np
p=argparse.ArgumentParser();p.add_argument('package');p.add_argument('video');p.add_argument('--label');a=p.parse_args()
pk=pathlib.Path('.authoring/video-clay')/a.package;P=json.load(open(pk/'package.json'))
label=a.label or pathlib.Path(a.video).stem[:40].replace(' ','-');out=pk/'reviews'/label;out.mkdir(parents=True,exist_ok=True)
def frames(path,step=1/30):  # grey 160x90 at even times, whatever the container's frame rate
    c=cv2.VideoCapture(str(path));n=c.get(7);fps=c.get(5);dur=n/fps if fps else 0;ts=np.arange(0,dur-1e-6,step);g=[];k=-1;cur=None
    for t in ts:
        want=int(t*fps)
        while k<want:
            ok,f=c.read();k+=1
            if not ok:break
            cur=f
        if cur is None:break
        g.append(cv2.resize(cv2.cvtColor(cur,cv2.COLOR_BGR2GRAY),(160,90)).astype(np.float32))
    return dur,ts[:len(g)],np.array(g)
def cuts_of(ts,g):
    d=np.r_[0,np.abs(np.diff(g,axis=0)).mean(axis=(1,2))];med=np.array([np.median(d[max(0,i-8):i+8]) for i in range(len(d))])
    return [round(float(ts[i]),2) for i in range(1,len(d)) if d[i]>max(18,4*med[i]) and d[i]==d[max(0,i-3):i+4].max()],d
rdur,rts,rg=frames(a.video);rcuts,rd=cuts_of(rts,rg)
gcuts=[s['start'] for s in P['shots'][1:]]
_,sts,sg=frames(pk/P['depth']) if P.get('depth') else (0,[],[])
matched=[];missing=[];used=set()
for c in gcuts:
    near=[x for x in rcuts if abs(x-c)<=.15 and x not in used]
    if near:x=min(near,key=lambda x:abs(x-c));used.add(x);matched.append(dict(guide=c,result=x,offset=round(x-c,2)))
    elif c<rdur:missing.append(c)
extra=[x for x in rcuts if x not in used]
def motion(ts,g,cuts,a0,b0):  # how far things move: optical flow between frames 1/15 s apart, the 90th percentile of the
    # displacement (the moving part, not the still background; flicker and painted texture barely move), in picture widths a second
    idx=[i for i,t in enumerate(ts) if a0<=t<b0-1/15 and all(abs(t-c)>.12 for c in cuts)][::2];v=[]
    for i in idx:
        j=i+2
        if j>=len(g) or any(ts[i]<c<=ts[j] for c in cuts):continue
        f=cv2.calcOpticalFlowFarneback(g[i].astype(np.uint8),g[j].astype(np.uint8),None,.5,3,9,3,5,1.1,0);m=np.hypot(f[...,0],f[...,1]);v.append(float(np.percentile(m,90))/160/(ts[j]-ts[i]))
    return float(np.median(v)) if v else None
# the source's motion: the guide's source video if the cut kept one, else the depth video (its change follows the same movement)
SRC=None
for e in pathlib.Path('.authoring/depth-library').glob(f'*/edits/{a.package}-source.mp4'):SRC=e
_,ots,og=frames(SRC) if SRC else (0,sts,sg);_,od=cuts_of(ots,og) if len(og) else (None,[])
beats=P.get('beats') or [dict(actor='',verb=f"shot {s['index']}",start=s['start'],end=s['end']) for s in P['shots']];mot=[]
for i,b in enumerate(beats):
    r=motion(rts,rg,rcuts,b['start'],min(b['end'],rdur));s_=motion(ots,og,gcuts,b['start'],b['end']) if len(og) else None
    ratio=round(r/s_,2) if r is not None and s_ else None
    mot.append(dict(beat=i+1,what=f"{b['actor']} {b['verb']} {b.get('target','')}".strip(),start=b['start'],end=b['end'],result=None if r is None else round(r,3),source=None if s_ is None else round(s_,3),ratio=ratio,flag=('cut off: the result ends before this beat' if b['start']>=rdur else 'little motion: the action may have become a pose' if ratio is not None and ratio<.5 else '')))
flags=[]
if abs(rdur-P['duration'])>.2:flags.append(f"length: the result is {rdur:.2f} s, the guide {P['duration']:.2f} s: set the generator to {round(P['duration'])} s")
if missing:flags.append(f"missing cuts at {', '.join(f'{x} s' for x in missing)}")
if extra:flags.append(f"extra cuts at {', '.join(f'{x} s' for x in extra)} (not in the guide)")
flags+=[f"beat {m['beat']} ({m['what']}): {m['flag']}" for m in mot if m['flag']]
# the sheet at each keyframe: source, depth, result
rc=cv2.VideoCapture(a.video);rows=[]
for i,k in enumerate(P['keyframes'],1):
    cells=[]
    for f_ in (k.get('sourceStill'),k.get('depthStill')):
        im=cv2.imread(str(pk/f_)) if f_ else None;cells.append(cv2.resize(im,(400,225)) if im is not None else np.zeros((225,400,3),np.uint8))
    rc.set(cv2.CAP_PROP_POS_MSEC,k['time']*1000);ok,fr=rc.read();cells.append(cv2.resize(fr,(400,225)) if ok and k['time']<rdur else np.full((225,400,3),40,np.uint8))
    if not ok or k['time']>=rdur:cv2.putText(cells[-1],'past the end of the result',(20,115),0,.7,(255,255,255),2)
    row=np.hstack(cells);cv2.putText(row,f"K{i} {k['time']} s",(6,22),0,.6,(255,255,255),2);rows.append(row)
cv2.imwrite(str(out/'sheet.jpg'),np.vstack(rows),[cv2.IMWRITE_JPEG_QUALITY,88])
rep=dict(package=a.package,result=str(pathlib.Path(a.video).resolve()),sha256=hashlib.sha256(open(a.video,'rb').read()).hexdigest(),reviewed=time.strftime('%Y-%m-%dT%H:%M:%S'),
  length=dict(result=round(rdur,2),guide=P['duration']),cuts=dict(guide=gcuts,result=rcuts,matched=matched,missing=missing,extra=extra),motion=mot,flags=flags,sheet=str(out/'sheet.jpg'))
json.dump(rep,open(out/'review.json','w'),indent=1);print(json.dumps(rep,indent=1))
