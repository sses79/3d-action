import json
from pathlib import Path
from PIL import Image, ImageDraw
root=Path('authoring/reviews/sword-completion'); frames=root/'frames'; data=json.loads((frames/'frames.json').read_text()); inputs=json.loads((root/'inputs.json').read_text()); recoveries=json.loads((root/'recovery-builds.json').read_text())['results']; tight=json.loads((root/'tight-build.json').read_text())
def sheet(rows,name,crop=None,width=210):
    height=width if crop is None else int(width*(crop[3]-crop[1])/(crop[2]-crop[0])); cols=max(len(r[1]) for r in rows); out=Image.new('RGB',(cols*width,len(rows)*(height+40)), '#eef1f3'); d=ImageDraw.Draw(out)
    for y,(label,items) in enumerate(rows):
        for x,(file,t) in enumerate(items):
            im=Image.open(frames/file)
            if crop: im=im.crop(crop)
            im=im.resize((width,height)); out.paste(im,(x*width,y*(height+40)+40));d.text((x*width+4,y*(height+40)+22),f'{t:.4f}s',fill='black')
        d.text((4,y*(height+40)+3),label,fill='black')
    out.save(root/name)
def files(id,times,view):
    return [(f'{id}-{t:.3f}-{view}.png',t) for t in times]
for id,r in inputs['reports'].items():
    times=[r['window']['end']*i/6 for i in range(7)]; short=id.removeprefix('move-ual2-sword-regular-');sheet([(short+' '+v,files(id,times,v)) for v in ['front','side']],f'source-{short}.png',width=180)
rows=[]
for id,r in inputs['reports'].items():
    for c in r['candidateContacts']:
        times=[c['start'],(c['start']+c['end'])/2,c['end']];short=id.removeprefix('move-ual2-sword-regular-')
        for v in ['front','side']:rows.append((f"{short} {c['foot']} {v}",files(id,times,v)))
sheet(rows,'all-contact-candidates.png',crop=(130,385,510,630),width=230)
for r in recoveries+[{'id':'sword-tight-join-review',**tight}]:
    id=r['id'];rows=[]
    for window in r['built']['receipt']['inspection'][1:]:
        times=[window['joinStart'],(window['joinStart']+window['start'])/2,window['start']]
        for v in ['front','side']:rows.append((id+f" step{window['step']} {v}",files(id,times,v)))
    sheet(rows,id+'.png',width=260)
