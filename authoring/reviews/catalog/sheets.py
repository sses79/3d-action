from PIL import Image,ImageDraw
from pathlib import Path
import json,sys
root=Path('authoring/reviews/catalog');inv=json.loads((root/('local-inventory.json' if '--local' in sys.argv else 'inventory.json')).read_text());(root/'sheets').mkdir(exist_ok=True)
allframes=[]
for n in range(2 if '--local' in sys.argv else 3):
 p=root/f'local-frames-{n}' if '--local' in sys.argv else f'frames-{n}';v=json.loads((p/'frames.json').read_text());allframes.extend([(p,f) for f in v['frames']])
for m in inv['items']:
 frames=[(p,f) for p,f in allframes if f['id']==m['id']]
 if not frames:continue
 out=Image.new('RGB',(7*165,2*195),'#eef1f3');d=ImageDraw.Draw(out)
 for y,view in enumerate(['front','side']):
  d.text((3,y*195+2),m['id']+' '+view,fill='black')
  for x in range(7):
   t=m['duration']*x/6;p,f=min(((p,f) for p,f in frames if f['view']==view),key=lambda v:abs(v[1]['time']-t));out.paste(Image.open(p/f['file']).resize((165,165)),(x*165,y*195+30));d.text((x*165+3,y*195+16),f"{f['time']:.3f}s",fill='black')
 out.save(root/'sheets'/f"{m['id']}.png")
