from PIL import Image,ImageDraw
from pathlib import Path
import json,sys
root=Path('authoring/reviews/catalog'); inv=json.loads((root/('local-inventory.json' if '--local' in sys.argv else 'inventory.json')).read_text());frames=[]
for n in range(2 if '--local' in sys.argv else 3):
 p=root/f'local-frames-{n}' if '--local' in sys.argv else f'frames-{n}';frames.extend((p,f) for f in json.loads((p/'frames.json').read_text())['frames'])
for m in inv['items']:
 fs=[(p,f) for p,f in frames if f['id']==m['id']];cs=m['report']['candidateContacts']
 if not fs or not cs:continue
 out=Image.new('RGB',(840,180*len(cs)),'#eef1f3');d=ImageDraw.Draw(out)
 for y,c in enumerate(cs):
  d.text((3,y*180),f"{m['id']} #{y} {c['foot']} {c['start']:.3f}-{c['end']:.3f}s",fill='black')
  for j,(view,t) in enumerate((v,t) for v in ['front','side'] for t in [c['start'],(c['start']+c['end'])/2,c['end']]):
   p,f=min(((p,f) for p,f in fs if f['view']==view),key=lambda x:abs(x[1]['time']-t))
   if abs(f['time']-t)>1e-6:raise ValueError('Missing exact candidate frame '+str(t))
   out.paste(Image.open(p/f['file']).resize((140,140)),(j*140,y*180+35));d.text((j*140+3,y*180+18),f"{view} {t:.3f}",fill='black')
 out.save(root/'sheets'/f"{m['id']}-contacts.png")
