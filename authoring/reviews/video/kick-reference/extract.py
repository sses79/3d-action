import cv2,json,subprocess,hashlib
from pathlib import Path
from PIL import Image,ImageDraw
p=Path('/Users/tim/Desktop/Screen Recording 2026-10-05 at 17.23.25.mov');d=Path('authoring/reviews/video/kick-reference');(d/'frames').mkdir(exist_ok=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(p)]));pts=[float(f['best_effort_timestamp_time']) for f in probe['frames']]
targets=[3.5+i*.25 for i in range(25)]+[10.5+i*.25 for i in range(23)];indices=sorted(set(min(range(len(pts)),key=lambda i:abs(pts[i]-t)) for t in targets));wanted=set(indices);cap=cv2.VideoCapture(str(p));records=[];i=0
while True:
 ok,frame=cap.read()
 if not ok:break
 if i in wanted:
  name=f'frame-{i:04d}.jpg';cv2.imwrite(str(d/'frames'/name),frame);records.append({'frameIndex':i,'time':pts[i],'file':'frames/'+name})
 i+=1
cap.release();assert i==len(pts),(i,len(pts))
manifest={'source':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'decodedFrames':i,'timestamps':'ffprobe best_effort_timestamp_time matched by decoded frame index','frames':records};(d/'video-manifest.json').write_text(json.dumps(manifest,indent=2))
for group,(a,b) in enumerate([(3.5,9.6),(10.5,16.1)]):
 fs=[f for f in records if a<=f['time']<=b];sheet=Image.new('RGB',(1440,((len(fs)+3)//4)*224),'#18212b');draw=ImageDraw.Draw(sheet)
 for n,f in enumerate(fs):
  im=Image.open(d/f['file']);im.thumbnail((360,200));x=n%4*360;y=n//4*224;sheet.paste(im,(x,y+24));draw.text((x+5,y+5),f"{f['time']:.3f}s / frame {f['frameIndex']}",fill='white')
 sheet.save(d/f'dense-{group}.jpg')
print(len(records),i)
