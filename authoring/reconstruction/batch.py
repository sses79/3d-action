"""Rebuild a set of catalogued clips after a rule change and record what changed.

  python3 authoring/reconstruction/batch.py run --catalog DIR --rule "what changed and why" [--clips 1,16,35] [--decisions]
  python3 authoring/reconstruction/batch.py compare --catalog DIR [--runs 11,12]

DIR holds catalog.json; each run is appended to DIR/runs.json with the git commit, options and per-clip numbers, and compared
with the run before it. The comparison lists the clips to look at; it does not judge them. Needs the Studio service running."""
import argparse,json,subprocess,sys,time,datetime
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('command',choices=['run','compare']);p.add_argument('--catalog',required=True);p.add_argument('--rule');p.add_argument('--clips');p.add_argument('--decisions',action='store_true');p.add_argument('--speed',type=float,default=.5);p.add_argument('--poses',type=int,default=8);p.add_argument('--runs');p.add_argument('--external',help='folder of clip<N>-h36m.json files: build each clip from those 3D joints with no fit, into its own action sam3d-<slug>');args=p.parse_args()
folder=Path(args.catalog);history_file=folder/'runs.json';history=json.loads(history_file.read_text()) if history_file.exists() else {'runs':[]}
def call(tool,arguments):
 scratch=folder/'.batch-args.json';scratch.write_text(json.dumps(arguments));out=subprocess.run(['node','authoring/cli.mjs','call',tool,'--args',str(scratch)],capture_output=True,text=True);scratch.unlink()
 try:return json.loads(out.stdout)
 except Exception:return {'error':(out.stdout+out.stderr)[-400:]}
def compare(before,after,exact=False):
 print(f"run {after['id']} ({after['commit']}) against run {before['id']} ({before['commit']}): {after['rule']}")
 look=[]
 for index,now in after['clips'].items():
  was=before['clips'].get(index) if exact else next((r['clips'][index] for r in reversed(history['runs']) if r['id']<after['id'] and index in r['clips']),None)  # the latest earlier run that has this clip
  if not was:continue
  if not now['ok'] or not was['ok']:
   if now['ok']!=was['ok']:look.append((index,now['name'],'now runs' if now['ok'] else 'NOW FAILS: '+str(now.get('error'))[-80:]))
   continue
  notes=[f"{key} {was.get(key)}→{now.get(key)}" for key in ('swapped','repaired','repairsVetoed','bridges') if was.get(key)!=now.get(key) and key in was]
  if now.get('projection') and was.get('projection') and abs(now['projection']-was['projection'])>.15*was['projection']:notes.append(f"fit error {was['projection']:.3f}→{now['projection']:.3f}"+(' WORSE' if now['projection']>was['projection'] else ''))
  if abs(now['lift']-was['lift'])>.1:notes.append(f"jump {was['lift']:.2f}→{now['lift']:.2f} m")
  if notes:look.append((index,now['name'],'; '.join(notes)))
 for index,name,note in look:print(f"  LOOK {int(index):2d} {name}: {note}")
 print(f"  {len(look)} of {len(after['clips'])} clips changed in the numbers; the rest have identical repairs and fit error within 15%.")
 return [int(index) for index,_,_ in look]
if args.command=='compare':
 a,b=([int(x) for x in args.runs.split(',')] if args.runs else [history['runs'][-2]['id'],history['runs'][-1]['id']]);by={r['id']:r for r in history['runs']};compare(by[a],by[b],exact=True);sys.exit()
if not args.rule:sys.exit('--rule is required: one sentence on what changed and what prompted it')
catalog=json.loads((folder/'catalog.json').read_text());wanted=[int(x) for x in args.clips.split(',')] if args.clips else [c['index'] for c in catalog['clips'] if c.get('group')=='upright' or 'airborne' in c]
commit=subprocess.run(['git','rev-parse','--short','HEAD'],capture_output=True,text=True).stdout.strip()+('+uncommitted' if subprocess.run(['git','status','--porcelain','--','authoring','runtime'],capture_output=True,text=True).stdout.strip() else '')
revisions={a['id']:a['revision'] for a in call('list_actions',{})['result']};started=time.time()
record={'id':(history['runs'][-1]['id']+1 if history['runs'] else 1),'date':datetime.datetime.now().isoformat(timespec='minutes'),'commit':commit,'rule':args.rule,'options':{'sourceSpeed':args.speed,'decisions':args.decisions,'fit':'none' if args.external else 'stable','straightKneePrior':not args.external,**({'externalJoints':'SAM 3D Body'} if args.external else {})},'clips':{}}
for c in catalog['clips']:
 if c['index'] not in wanted:continue
 slug=('sam3d-'+c['slug'])[:48] if args.external else c['slug'];reply=call('reconstruct_motion',dict(video=catalog['source']['file'],start=c['window'][0],end=c['window'][1],fit='none' if args.external else 'stable',sourceSpeed=args.speed,decisions=args.decisions,straightKneePrior=not args.external,airborne=c.get('airborne',True),actionId=slug,name=('SAM 3D · ' if args.external else 'Trick · ')+c['name'],commit=True,expectedRevision=revisions.get(slug,0),**({'externalJoints':f"{args.external}/clip{c['index']}-h36m.json"} if args.external else {})));row={'name':c['name'],'ok':'result' in reply}
 if row['ok']:
  r=reply['result'];e=r['estimate'];d=r.get('decisions') or {};row.update(crossings=len((r['action'].get('bodyPartsInside') or {}).get('crossings') or []),insideFrames=(r['action'].get('bodyPartsInside') or {}).get('frames'),beyondNormalRange=len(r['action'].get('jointRangesBeyondNormal',[])),revision=r['revision'],weak=r['observations']['lowConfidenceBodyFrames'],repaired=len(e['repairedLegObservations']),swapped=len(e['swappedLegObservations']),bridges=len(e.get('legArcBridges',[])),repairsVetoed=d.get('repairsVetoed'),lift=r['action']['peakLiftMeters'],projection=(r.get('fitting') or {}).get('projectionRMS'),flags=len(r['quality']['inspectionWindows']))
  sheet=call('compare_video_action',{'actionId':slug,'sourceRevision':r['revision'],'count':args.poses});row['sheet']=sheet.get('result',{}).get('file')
 else:row['error']=reply.get('error')
 record['clips'][str(c['index'])]=row;print(c['index'],c['name'],'ok' if row['ok'] else 'FAILED',flush=True)
record['seconds']=round(time.time()-started);history['runs'].append(record);history_file.write_text(json.dumps(history,indent=1))
if len(history['runs'])>1:compare(history['runs'][-2],record)
print('Sheets are in each clip\'s "sheet" path. Read the LOOK clips, then add grades and what you saw to the rule log.')
