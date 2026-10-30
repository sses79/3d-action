"""A depth scene performed as a text of ours (docs/OWNED_SCENE_PLAN.md, part 1b): a performance spec (authoring/plays/*.json) names the
fitted scene it comes from (build_depth_scene's pair), who plays whom in which body, the shots in our order and lengths (a shot may
come back), which build each person plays in each shot (speed, offset, loop) and the blocking the text asks for (turn: degrees or
[from, to] across the shot; move: [dx, dz] metres across the shot, kept afterwards), the set (props from editor/assets/props; a role's
seat puts that prop under them, turned their way and scaled to their hip height) and the lines with their times. Writes the scene as
its own pair (set_shots_scene, pair = the spec's id), renders it, and in .authoring/plays/<id>/ writes scene.mp4, captioned.mp4
(the lines burned in), one keyframe still per line at its middle and keyframes.jpg (the stills with their lines).
  .authoring/vision-venv/bin/python authoring/render/perform.py authoring/plays/SPEC.json [--cast CAST.json]"""
import sys,os,json,subprocess,urllib.request,shutil
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'));P=json.load(open(sys.argv[1]));
if '--cast' in sys.argv:  # a viewer's choice of bodies (the Scenes page): {role: character}, over the spec's
    for k,c in json.load(open(sys.argv[sys.argv.index('--cast')+1])).items():
        if k in P['roles'] and c:P['roles'][k]['character']=c
out=os.path.join(root,'.authoring/plays',P['id']);os.makedirs(out,exist_ok=True)
def call(name,args,timeout=900):
    r=urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:5174/api/tool',json.dumps(dict(name=name,arguments=args)).encode(),{'Content-Type':'application/json'}),timeout=timeout);d=json.load(r)
    if d.get('error'):raise SystemExit(f'{name}: {d["error"]}')
    return d['result']
src=call('export_pair_reference',dict(pairId=P['from']['pair'],viewOnly=True))['shotsScene'];cams={c['name']:c for c in src['cameras']}
import math
L=json.load(open(os.path.join(root,'.authoring/depth-scene',P['from']['pair'].removeprefix('dscene-'),'layout.json')));heading={p['name']:p['heading'] for p in L['people']};hips={p['name']:p['hipHeight'] for p in L['people']}
kit=json.load(open(os.path.join(root,'editor/assets/props/index.json')))['props'];moved={n:[0.0,0.0] for n in P['roles']}  # a person's place as moved so far by the text
def build(name,shot):  # the person's segment whose time is that shot's in the fitted scene
    c=cams[shot];f=next(f for f in src['figures'] if f['name']==name);return f,next(g for g in f['segments'] if abs(g['from']-c['start'])<.05)
cameras,segs,t=[],{n:[] for n in P['roles']},0.0
for sh in P['shots']:
    c=cams[sh['camera']];cameras.append({**{k:c[k] for k in ('position','yaw','pitch','focal')},'name':sh['camera'],'start':round(t,3)})
    for n,pl in sh.get('play',{}).items():
        f,g=build(n,pl['build']);B=g['to']-g['from'];sp=pl.get('speed',B/sh['seconds']);loop=pl.get('loop',False)
        if not .7<=sp<=1.4 and 'speed' not in pl:sp=min(1.4,max(.7,sp));loop=True  # within what keeps a build believable; the rest goes back and forth
        e={k:g[k] for k in ('actionId','revision','places','hip','settle') if k in g}|dict(start=round(t,3),end=round(t+sh['seconds'],3),speed=round(sp,3),offset=pl.get('offset',0),loop=loop,frame=pl['build'])  # frame: the build keeps the camera it was made in, wherever it plays
        if 'turn' in pl:e['turn']=pl['turn']  # blocking from the text: a turn about the hips, or [from, to] across the shot
        m0,mv=list(moved[n]),pl.get('move',[0,0]);moved[n]=[moved[n][0]+mv[0],moved[n][1]+mv[1]]  # a move [dx, dz] across the shot, kept afterwards
        if any(m0)or any(mv):q=e.get('places',[f['place'],f['place']]);e['places']=[[round(x+m0[0]+mv[0]*k/(len(q)-1),3),round(z+m0[1]+mv[1]*k/(len(q)-1),3)] for k,(x,z) in enumerate(q)]
        segs[n].append(e)
    t+=sh['seconds']
figures=[]
for n,role in P['roles'].items():
    f=next(f for f in src['figures'] if f['name']==n)
    figures.append(dict(name=role['name'],color=f['color'],height=role.get('height',f['height']),place=f['place'],**({'legs':True} if f.get('legs') else {}),**({'character':role['character']} if role.get('character') else {}),
        segments=[{k:v for k,v in s.items() if k not in ('start','end')}|{'from':s['start'],'to':s['end']} for s in segs[n]]))
sets=list(P.get('set',[]))
for n,role in P['roles'].items():  # a seat under a seated role: at their hips, a little behind, turned their way, scaled to their hip height
    if not role.get('seat'):continue
    f=next(f for f in src['figures'] if f['name']==n);h=math.radians(heading[n]);k=kit[role['seat']];sc=round(min(1.3,max(.6,(hips[n]-.1)/k['seat'])),3) if k.get('seat') else 1
    sets.append(dict(prop=role['seat'],place=[round(f['place'][0]-math.sin(h)*.06,3),round(f['place'][1]-math.cos(h)*.06,3)],turn=round(heading[n],1),scale=sc))
pairs=call('list_pairs',{});rev=next((p.get('revision',0) for p in (pairs if isinstance(pairs,list) else pairs.get('pairs',[])) if p.get('pairId',p.get('id'))==P['id']),0)
sc=call('set_shots_scene',dict(pairId=P['id'],name=P['name'],expectedRevision=rev,duration=round(t,3),figures=figures,cameras=cameras,set=sets))
v=call('render_pair_video',dict(pairId=P['id'],width=1280,height=720,fps=30));shutil.copy(v['file'],os.path.join(out,'scene.mp4'))
names={k:r['name'] for k,r in P['roles'].items()};from PIL import Image,ImageDraw,ImageFont  # this ffmpeg has no drawtext: each line drawn as a picture and laid over in its time
font=ImageFont.truetype('/System/Library/Fonts/HelveticaNeue.ttc',30);ins,chain,prev=[],[],'0:v'
for i,l in enumerate(P['lines']):
    im=Image.new('RGBA',(1280,720),(0,0,0,0));d=ImageDraw.Draw(im);txt=f"{names[l['who']].upper()}: {l['text']}";w=d.textlength(txt,font=font)
    d.text(((1280-w)/2,650),txt,font=font,fill='white',stroke_width=3,stroke_fill=(0,0,0,200));f=os.path.join(out,f'line-{i+1}.png');im.save(f);ins+=['-i',f]
    chain.append(f"[{prev}][{i+1}:v]overlay=enable='between(t,{l['from']},{l['to']})'[v{i}]");prev=f'v{i}'
subprocess.run(['ffmpeg','-v','error','-y','-i',os.path.join(out,'scene.mp4'),*ins,'-filter_complex',';'.join(chain),'-map',f'[{prev}]','-c:v','libx264','-pix_fmt','yuv420p','-crf','18',os.path.join(out,'captioned.mp4')],check=True)
stills=[]
for i,l in enumerate(P['lines']):  # a keyframe per line, at its middle: our beat, rendered from our scene
    s=os.path.join(out,f'key-{i+1}.jpg');subprocess.run(['ffmpeg','-v','error','-y','-ss',f"{(l['from']+l['to'])/2:.2f}",'-i',os.path.join(out,'captioned.mp4'),'-frames:v','1','-vf','scale=640:-2',s],check=True);stills.append(s)
cols=3;rows=[stills[k:k+cols] for k in range(0,len(stills),cols)];rows[-1]+=[stills[-1]]*(cols-len(rows[-1])) if len(rows[-1])<cols else []
subprocess.run(['ffmpeg','-v','error','-y',*sum((['-i',s] for r in rows for s in r),[]),'-filter_complex',''.join(f'[{k}]' for k in range(cols*len(rows)))+f'xstack=inputs={cols*len(rows)}:layout='+'|'.join(f'{c*640}_{r*360}' for r in range(len(rows)) for c in range(cols)),os.path.join(out,'keyframes.jpg')],check=True)
json.dump(dict(spec=os.path.relpath(sys.argv[1],root),roles={k:{'name':r['name'],'character':r.get('character')} for k,r in P['roles'].items()},pair=P['id'],revision=sc.get('revision'),seconds=round(t,2),cameras=len(cameras),lines=len(P['lines']),files=sorted(os.listdir(out))),open(os.path.join(out,'perform.json'),'w'),indent=1)
print(json.dumps(dict(out=out,pair=P['id'],seconds=round(t,2),revision=sc.get('revision'))))
