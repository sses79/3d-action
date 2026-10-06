from PIL import Image,ImageDraw
from pathlib import Path
import json
r=Path('authoring/reviews/velocity');xs=json.loads((r/'results.json').read_text());manifest=json.loads((r/'frames/frames.json').read_text());(r/'sheets').mkdir(exist_ok=True)
for x in xs:
 fs=[f for f in manifest['frames'] if f['id']==x['spec']['id']];w=x['built']['receipt']['inspection'][1];groups=[('progression',[x['report']['window']['end']*i/6 for i in range(7)]),('join',[w['joinStart']-1/60,w['joinStart'],(w['joinStart']+w['start'])/2,w['start'],w['start']+1/60])];out=Image.new('RGB',(1050,680),'#eef1f3');d=ImageDraw.Draw(out)
 for g,(label,times) in enumerate(groups):
  for y,v in enumerate(['front','side']):
   row=g*2+y;d.text((3,row*170),x['contract']['id']+' '+label+' '+v,fill='black')
   for j,t in enumerate(times):
    f=min((f for f in fs if f['view']==v),key=lambda f:abs(f['time']-t));out.paste(Image.open(r/'frames'/f['file']).resize((150,150)),(j*150,row*170+20));d.text((j*150+3,row*170+10),f"{t:.3f}",fill='black')
 out.save(r/'sheets'/f"{x['contract']['id']}.png")
