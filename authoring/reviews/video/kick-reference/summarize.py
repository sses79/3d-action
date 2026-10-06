import json,math,statistics
from pathlib import Path
from PIL import Image,ImageDraw
D=Path('authoring/reviews/video/kick-reference');r=json.loads((D/'pose-report.json').read_text());fs=r['frames'];
def angle(a,b,c):
 u=[a[i]-b[i] for i in [0,1]];v=[c[i]-b[i] for i in [0,1]];return math.degrees(math.acos(max(-1,min(1,sum(x*y for x,y in zip(u,v))/math.hypot(*u)/math.hypot(*v)))))
measure=[]
for f in fs:
 k=f['keypoints'];conf=min(k[i][2] for i in [12,14,16]);measure.append({'time':f['time'],'rightProjectedKneeAngle':angle(k[12],k[14],k[16]) if conf>=.5 else None,'kneeConfidence':conf,'rightAnkle':k[16],'leftAnkle':k[15],'frameIndex':f['frameIndex']})
window=[x for x in measure if 12.6<=x['time']<=13.05];maximum=max(window,key=lambda x:x['rightProjectedKneeAngle']);summary={'frames':len(fs),'missingSubject':sum(f['missingOrAmbiguousSubject'] for f in fs),'confidentBodyLandmarksPerFrame':{'min':min(sum(p[2]>=.5 for p in f['keypoints'][5:]) for f in fs),'max':max(sum(p[2]>=.5 for p in f['keypoints'][5:]) for f in fs)},'maximumProjectedRightKneeAngleInKickWindow':maximum,'timingsSeconds':r['timingsSeconds'],'limits':['Screen-space knee angle only; not anatomical 3D angle','No exact contact or foot orientation','Same identified detection not physical identity guarantee','Timing refinement confounds denser frames with pose assistance'],'measurements':measure};(D/'pose-summary.json').write_text(json.dumps(summary,indent=2))
targets=[11.483,12.25,12.583,12.75,12.85,12.983,13.183,13.483];key=[];crop=(550,140,1478,780)
# Original frames decoded by exact chosen index.
import cv2
p=json.loads((D/'video-manifest.json').read_text())['source'];cap=cv2.VideoCapture(p);chosen={min(fs,key=lambda x:abs(x['time']-t))['frameIndex'] for t in targets};originals={};i=0
while True:
 ok,f=cap.read()
 if not ok:break
 if i in chosen:
  name=f'keyframe-{i:04d}.jpg';cv2.imwrite(str(D/name),f);originals[i]=Image.fromarray(cv2.cvtColor(f,cv2.COLOR_BGR2RGB))
 i+=1
cap.release()
for mode in ['original','pose']:
 sheet=Image.new('RGB',(1440,2*276),'#18212b');draw=ImageDraw.Draw(sheet)
 for n,t in enumerate(targets):
  f=min(fs,key=lambda x:abs(x['time']-t));im=originals[f['frameIndex']] if mode=='original' else Image.open(D/f['file']);im=im.crop(crop);im.thumbnail((360,248));x=n%4*360;y=n//4*276;sheet.paste(im,(x,y+28));draw.text((x+5,y+5),f"{f['time']:.3f}s | cut {f['clipTime']:.3f}s",fill='white')
  if mode=='original':key.append({'time':f['time'],'clipTime':f['clipTime'],'frameIndex':f['frameIndex'],'file':f"keyframe-{f['frameIndex']:04d}.jpg",'sheetCrop':crop})
 sheet.save(D/f'keyframes-{mode}.jpg')
(D/'keyframes.json').write_text(json.dumps(key,indent=2));print(json.dumps({k:v for k,v in summary.items() if k!='measurements'},indent=2))
