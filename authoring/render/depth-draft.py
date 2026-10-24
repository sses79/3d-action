"""Drafts by a vision model for a depth request (docs/DEPTH_SERVICE_PLAN.md, step 2): what a person in a session used to write by hand.
  .authoring/vision-venv/bin/python authoring/render/depth-draft.py describe|cast|beats IN.json OUT.json
Each answer is a draft: it is stored on the package with the model's name, shown on the page, and a person can overrule it.
- describe: from the package's keyframe stills (the source frame and the tinted depth side by side) and its shots, the clip's summary,
  labels (from the library's vocabulary only), one line per tinted person, one line per shot's camera, and per keyframe what happens;
- cast: which tinted person each of the scene's characters is, with how sure the model is (low or unsure goes back to the caller);
- beats: the scene's action split into beats over the window (actor, verb, target, contact, change, from, to in window seconds), at
  most the number the take's length allows.
IN.json carries what each needs (written by authoring/depth-request.mjs). The key comes from OPENROUTER_API_KEY or the file
OPENROUTER_ENV_FILE names; the model from DEPTH_DRAFT_MODEL (default openai/gpt-6-luna). Source frames go only to this model, as
layout evidence; nothing here goes to a video model."""
import sys,os,re,json,base64,time,urllib.request
from pathlib import Path
import cv2,numpy as np
mode,inp,outp=sys.argv[1],Path(sys.argv[2]),Path(sys.argv[3]);I=json.loads(inp.read_text());model=os.environ.get('DEPTH_DRAFT_MODEL','openai/gpt-6-luna')
key=os.environ.get('OPENROUTER_API_KEY')
if not key and os.environ.get('OPENROUTER_ENV_FILE'):
    m=re.search(r'^OPENROUTER_API_KEY=["\']?([^"\'\n]+)',Path(os.environ['OPENROUTER_ENV_FILE']).read_text(),re.M);key=m.group(1) if m else None
if not key:raise SystemExit('Set OPENROUTER_API_KEY, or OPENROUTER_ENV_FILE to a file that defines it')
def pair(k):  # the source frame and the tinted depth side by side, 1024 wide, labelled with the time
    a=cv2.imread(k['source']);b=cv2.imread(k['depth'])
    if a is None or b is None:return None
    a=cv2.resize(a,(512,288));b=cv2.resize(b,(512,288));im=np.hstack([a,b]);cv2.putText(im,f"{k['time']} s",(8,24),0,.7,(0,255,255),2)
    ok,buf=cv2.imencode('.jpg',im,[cv2.IMWRITE_JPEG_QUALITY,85]);return 'data:image/jpeg;base64,'+base64.b64encode(buf).decode()
def ask(prompt,schema,keys):
    content=[{'type':'text','text':prompt}]+[{'type':'image_url','image_url':{'url':u}} for u in (pair(k) for k in keys) if u]
    body={'model':model,'temperature':0,'messages':[{'role':'user','content':content}],'response_format':{'type':'json_schema','json_schema':{'name':mode,'strict':True,'schema':schema}}}
    for attempt in range(3):
        try:
            r=json.load(urllib.request.urlopen(urllib.request.Request('https://openrouter.ai/api/v1/chat/completions',json.dumps(body).encode(),{'Authorization':'Bearer '+key,'Content-Type':'application/json'}),timeout=180))
            return json.loads(r['choices'][0]['message']['content'])
        except Exception as e:
            if attempt==2:raise SystemExit(f'the model did not answer: {e}')
            time.sleep(3*(attempt+1))
people=I.get('people',[]);who='; '.join(f"{p['name']} is tinted {p['color']}" for p in people)
shots='\n'.join(f"shot {s['index']}: {s['start']:.2f}-{s['end']:.2f} s" for s in I.get('shots',[]))
obj=lambda props,req=None:{'type':'object','additionalProperties':False,'required':req or list(props),'properties':props}
if mode=='describe':
    L=I['labels'];allowed=sorted({l for v in L.values() for l in v})
    prompt=(f"A clip from a film, as keyframes: each image is the source frame (left) and a tinted depth map of it (right: white is near; each tracked person has one colour: {who}). Shots:\n{shots}\n"
            "Describe it for a library of reference clips. summary: two or three plain sentences of what happens and how it is filmed. labels: those that apply, only from this list: "+json.dumps(L)+
            ". people: for each tinted name, one line on who they appear to be (role, age, clothes), not a real person's name. shots: for each shot index, one line on the camera (e.g. 'close, low: the blue figure grins up'), refer to people as 'the <colour> figure'. "
            "keyframes: for each keyframe time, one line on what happens and, per tinted name visible, what they are doing. Say only what the images show.")
    pp=obj({p['name']:{'type':'string'} for p in people}) if people else obj({})
    schema=obj({'summary':{'type':'string'},'labels':{'type':'array','items':{'enum':allowed}},'people':pp,'peopleCount':{'type':'integer'},
        'shots':{'type':'array','items':obj({'index':{'type':'integer'},'camera':{'type':'string'}})},
        'keyframes':{'type':'array','items':obj({'time':{'type':'number'},'summary':{'type':'string'},'people':{'type':'array','items':obj({'name':{'enum':[p['name'] for p in people] or ['none']},'doing':{'type':'string'}})}})}})
    a=ask(prompt,schema,I['keyframes'])
    out=dict(summary=a['summary'],labels=[l for l in a['labels'] if l in allowed] or ['still'],people=a['people'],peopleCount=a['peopleCount'],shots={str(s['index']):s['camera'] for s in a['shots']},
             keyframes=[dict(time=k['time'],summary=k['summary'],people={p['name']:p['doing'] for p in k['people']}) for k in a['keyframes']])
elif mode=='cast':
    cast=I['cast'];desc='; '.join(f"{p['name']} ({p['color']}): {I['described'].get(p['name'],'')}" for p in people)
    prompt=(f"A reference clip with tinted people ({desc}). It will be recast as a scene: {I['scene']}\nThe scene's characters: "+'; '.join(f'{n}: {d}' for n,d in cast.items())+
            ".\nFor each character, which tinted person plays them, judged by the action and the roles in the images (who acts on whom, who is older, who is armoured...), or 'none' if no one fits. confidence: high only when the roles leave no doubt. why: one line.")
    schema=obj({'cast':{'type':'array','items':obj({'character':{'enum':list(cast)},'person':{'enum':[p['name'] for p in people]+['none']}})},'confidence':{'enum':['high','medium','low']},'why':{'type':'string'}})
    a=ask(prompt,schema,I['keyframes']);out=dict(cast={c['character']:c['person'] for c in a['cast']},confidence=a['confidence'],why=a['why'])
elif mode=='beats':
    names=[p['name'] for p in people];cast=I.get('castOf',{})
    prompt=(f"A reference clip ({I['seconds']:.2f} s) will guide a {I['duration']} s video take of this scene: {I['scene']}\nWhat the clip shows: {I['summary']}\nShots (seconds in the clip):\n{shots}\n"
            f"People: "+'; '.join(f"{n} plays {cast.get(n,'?')}" for n in names)+".\n"
            f"Split the action into beats: the fewest that tell it, at most {I['maxBeats']}, each 2 s or more of the take, in order, together covering the clip. Merge small steps (an approach into what follows) rather than giving each its own beat. Each beat: actor and target (tinted names), "
            "verb (what the actor does, present tense, e.g. 'seizes the chain at the neck of'), contact (whose hand is on what, e.g. 'A's right hand on B's throat', or ''), change (what it causes, e.g. 'B is lifted off his feet', or ''), "
            "from and to (seconds in the clip where it shows; beats should start on a cut or a clear change). If beats are given, keep their actors, verbs and order and only set from and to: "+(json.dumps(I['given']) if I.get('given') else 'none given')+". summary: the beats in one line using the characters' names. Follow what the images show, steered by the scene.")
    schema=obj({'summary':{'type':'string'},'beats':{'type':'array','items':obj({'actor':{'enum':names},'verb':{'type':'string'},'target':{'enum':names+['none']},'contact':{'type':'string'},'change':{'type':'string'},'from':{'type':'number'},'to':{'type':'number'}})}})
    a=ask(prompt,schema,I['keyframes']);out=dict(summary=a['summary'],beats=[{k:v for k,v in b.items() if v not in ('','none')} for b in a['beats']])
else:raise SystemExit('mode: describe, cast or beats')
out['by']='model:'+model;outp.write_text(json.dumps(out,indent=1));print(json.dumps(out))
