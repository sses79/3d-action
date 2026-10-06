from PIL import Image,ImageDraw
from pathlib import Path
import json
r=Path('authoring/reviews/catalog');built=json.loads((r/'built-pairs.json').read_text());frames=[]
for n in range(2):
 p=r/f'pairs-frames-{n}';frames.extend((p,f) for f in json.loads((p/'frames.json').read_text())['frames'])
for x in built:
 fs=[(p,f) for p,f in frames if f['id']==x['spec']['id']];w=x['built']['receipt']['inspection'][1];ts=[w['joinStart']-1/60,w['joinStart'],(w['joinStart']+w['start'])/2,w['start'],w['start']+1/60]
 out=Image.new('RGB',(900,410),'#eef1f3');d=ImageDraw.Draw(out)
 for y,v in enumerate(['front','side']):
  d.text((3,y*205),x['plan']['id']+' '+v,fill='black')
  for j,t in enumerate(ts):
   p,f=min(((p,f) for p,f in fs if f['view']==v),key=lambda z:abs(z[1]['time']-t));out.paste(Image.open(p/f['file']).resize((180,180)),(j*180,y*205+25));d.text((j*180+3,y*205+12),f"{t:.3f}s",fill='black')
 out.save(r/'sheets'/f"{x['plan']['id']}-join.png")
