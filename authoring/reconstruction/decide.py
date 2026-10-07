"""Ask a vision model what the detector cannot tell: which way the performer faces and which of their own legs is raised.
Sends cropped frames of the video to OpenRouter. Answers are evidence for later stages, not ground truth."""
import argparse,json,os,re,time,base64,urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
p=argparse.ArgumentParser();p.add_argument('--video',required=True);p.add_argument('--pose',required=True);p.add_argument('--out',required=True);p.add_argument('--model',default='openai/gpt-6-luna');p.add_argument('--interval',type=float,default=.1);args=p.parse_args();started=time.perf_counter()
key=os.environ.get('OPENROUTER_API_KEY')
if not key and os.environ.get('OPENROUTER_ENV_FILE'):
 found=re.search(r'^OPENROUTER_API_KEY=["\']?([^"\'\n]+)',Path(os.environ['OPENROUTER_ENV_FILE']).read_text(),re.M);key=found.group(1) if found else None
if not key:raise SystemExit('Set OPENROUTER_API_KEY, or OPENROUTER_ENV_FILE to a file that defines it')
import cv2
pose=json.loads(Path(args.pose).read_text());frames=[f for f in pose['frames'] if f['bbox']];chosen=[];last=-1e9
for f in frames:
 if f['time']-last>=args.interval-1e-6:chosen.append(f);last=f['time']
wanted={f['frameIndex']:f for f in chosen};cap=cv2.VideoCapture(args.video);cap.set(cv2.CAP_PROP_POS_FRAMES,min(wanted));i=min(wanted);images={}
while i<=max(wanted):
 ok,img=cap.read()
 if not ok:break
 if i in wanted:images[i]=img
 i+=1
PROMPT="One frame of a martial-arts or acrobatic move. Judge the performer's body from anatomy (which hip each leg attaches to, where the chest and face point), not from image position. facing: the direction the chest points. raised_leg: which of the PERFORMER'S OWN legs (their anatomical left or right) is lifted clearly higher than the other; 'none' if both are about level, 'both' if both are tucked or airborne at similar height."
SCHEMA={'type':'object','additionalProperties':False,'required':['facing','raised_leg','confidence'],'properties':{'facing':{'enum':['toward_camera','away_from_camera','image_left','image_right']},'raised_leg':{'enum':['left','right','none','both']},'confidence':{'enum':['high','medium','low']}}}
def ask(index):
 f=wanted[index];b=f['bbox'];cx,cy=(b[0]+b[2])/2,(b[1]+b[3])/2;s=max(b[2]-b[0],b[3]-b[1])*.65;img=images[index];x0,y0=int(max(0,cx-s)),int(max(0,cy-s));crop=cv2.resize(img[y0:int(cy+s),x0:int(cx+s)],(512,512));ok,buf=cv2.imencode('.jpg',crop,[cv2.IMWRITE_JPEG_QUALITY,90])
 body={'model':args.model,'temperature':0,'messages':[{'role':'user','content':[{'type':'text','text':PROMPT},{'type':'image_url','image_url':{'url':'data:image/jpeg;base64,'+base64.b64encode(buf).decode()}}]}],'response_format':{'type':'json_schema','json_schema':{'name':'pose_decision','strict':True,'schema':SCHEMA}}}
 for attempt in range(3):
  try:
   reply=json.load(urllib.request.urlopen(urllib.request.Request('https://openrouter.ai/api/v1/chat/completions',json.dumps(body).encode(),{'Authorization':'Bearer '+key,'Content-Type':'application/json'}),timeout=90));answer=json.loads(reply['choices'][0]['message']['content'])
   if answer['facing'] in SCHEMA['properties']['facing']['enum'] and answer['raised_leg'] in SCHEMA['properties']['raised_leg']['enum']:return {'frameIndex':index,'time':f['time'],'clipTime':f['clipTime'],'facing':answer['facing'],'raisedLeg':answer['raised_leg'],'confidence':answer.get('confidence','low'),'cost':(reply.get('usage') or {}).get('cost') or 0}
  except Exception as error:failure=str(error)[:200]
  time.sleep(1+attempt)
 return {'frameIndex':index,'time':f['time'],'clipTime':f['clipTime'],'error':failure if 'failure' in dir() else 'invalid answer'}
with ThreadPoolExecutor(8) as pool:rows=list(pool.map(ask,sorted(images)))
good=[r for r in rows if 'error' not in r]
if len(good)<.7*len(rows):raise SystemExit(f'Vision decisions failed for {len(rows)-len(good)} of {len(rows)} frames: {next(r["error"] for r in rows if "error" in r)}')
out=Path(args.out);out.mkdir(parents=True,exist_ok=True);(out/'decisions.json').write_text(json.dumps({'model':args.model,'prompt':PROMPT,'intervalSeconds':args.interval,'status':'vision-model answers; evidence, not ground truth','costUSD':sum(r['cost'] for r in good),'wallSeconds':time.perf_counter()-started,'decisions':good,'failed':len(rows)-len(good)}))
print(json.dumps({'frames':len(rows),'answered':len(good),'costUSD':sum(r['cost'] for r in good),'seconds':time.perf_counter()-started}))
