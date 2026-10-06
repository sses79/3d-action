from PIL import Image,ImageDraw
import json
from pathlib import Path
root=Path('authoring/reviews/sword-completion'); r=json.loads((root/'prompt-test.json').read_text()); id=r['built']['actionId']; total=r['built']['duration']; times=[total*i/8 for i in range(9)];out=Image.new('RGB',(9*160,2*200),'#eef1f3');d=ImageDraw.Draw(out)
for y,v in enumerate(['front','side']):
 for x,t in enumerate(times):
  image=Image.open(root/'prompt-frames'/f'{id}-{t:.3f}-{v}.png').resize((160,160));out.paste(image,(x*160,y*200+40));d.text((x*160+3,y*200+22),f'{t:.3f}s',fill='black')
 d.text((3,y*200+3),v,fill='black')
out.save(root/'prompt-sequence.png')
