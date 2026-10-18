"""A video-to-clay package for the Clay page's "From a video" section: the clay video, a still of the source and of the clay at
each keyframe, and what happens at each one (who is there, what they do, say and show on their face), for regenerating the
keyframes in another style and matching the clip to another scene.
  .authoring/vision-venv/bin/python authoring/render/video-clay-pack.py SPEC.json
SPEC.json: {id, name, video, start, depth (the tinted depth video of the window from depth-tint.py, its time 0 = start), clay
(optional: an mp4 from depth-clay.py), cast, style, scene (optional suggestions for the page), people: [{name, color, represents}],
shots: [{index, start, end, camera}], audio: [{start, end, who, kind: speech|sound, text}], keyframes: [{time, shot, summary,
people: [{name, doing, speaking, expression}]}], notes}. Times are seconds from the clip's start. Speech is told in
summary, not quoted. Writes .authoring/video-clay/<id>/: clay.mp4, key-N-source.jpg, key-N-clay.jpg and package.json (the spec
plus file names, size, fps and duration). The source stills are for checking against the original only; the clay stills give the
composition of each keyframe."""
import sys,json,shutil,pathlib,re,cv2
spec=json.load(open(sys.argv[1]));assert re.fullmatch(r'[a-z0-9][a-z0-9-]{0,47}',spec['id']),'id: lower-case letters, digits and dashes'
out=pathlib.Path('.authoring/video-clay')/spec['id'];out.mkdir(parents=True,exist_ok=True)
if spec.get('clay'):shutil.copyfile(spec['clay'],out/'clay.mp4')  # optional since the A/B: footage clips go with the tinted depth alone
if spec.get('depth'):shutil.copyfile(spec['depth'],out/'depth.mp4')  # optional: the tinted depth video of the same window (depth-tint.py), the other reference video to choose
clay=cv2.VideoCapture(str(out/('clay.mp4' if spec.get('clay') else 'depth.mp4')));src=cv2.VideoCapture(spec['video']);W,H=int(clay.get(3)),int(clay.get(4));fps=clay.get(5);n=int(clay.get(7))
names={p['name'] for p in spec['people']}
for i,k in enumerate(spec['keyframes'],1):
    assert all(p['name'] in names for p in k['people']),f'keyframe {i}: a name not in people'
    clay.set(cv2.CAP_PROP_POS_FRAMES,min(n-1,round(k['time']*fps)));ok,c=clay.read();assert ok,f'keyframe {i}: past the reference video'
    src.set(cv2.CAP_PROP_POS_MSEC,(spec['start']+k['time'])*1000);ok,s=src.read();assert ok,f'keyframe {i}: past the source video'
    if spec.get('clay'):cv2.imwrite(str(out/f'key-{i}-clay.jpg'),c,[cv2.IMWRITE_JPEG_QUALITY,90])
    cv2.imwrite(str(out/f'key-{i}-source.jpg'),cv2.resize(s,(W,H)),[cv2.IMWRITE_JPEG_QUALITY,88])
    k['clayStill'],k['sourceStill']=f'key-{i}-clay.jpg' if spec.get('clay') else None,f'key-{i}-source.jpg'
    if spec.get('depth'):
        dv=cv2.VideoCapture(str(out/'depth.mp4'));dv.set(cv2.CAP_PROP_POS_FRAMES,min(int(dv.get(7))-1,round(k['time']*dv.get(5))));ok,g=dv.read();assert ok,f'keyframe {i}: past the depth video'
        cv2.imwrite(str(out/f'key-{i}-depth.jpg'),cv2.resize(g,(W,H)),[cv2.IMWRITE_JPEG_QUALITY,90]);k['depthStill']=f'key-{i}-depth.jpg'
pkg=dict(spec,clay='clay.mp4' if spec.get('clay') else None,depth='depth.mp4' if spec.get('depth') else None,size=[W,H],fps=round(fps,3),duration=round(n/fps,3),sourceVideo=pathlib.Path(spec['video']).name)
pkg.pop('video');json.dump(pkg,open(out/'package.json','w'),indent=1)
print(json.dumps(dict(folder=str(out),keyframes=len(spec['keyframes']),duration=pkg['duration'])))
