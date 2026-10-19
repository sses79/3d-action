"""Measure an ingested source again with the current control rule (control-need.py) without losing what was built on it:
descriptions, builds, fixes and ratings stay; each shot's numbers and verdict are replaced, and each depth clip gets
needsControl: whether any of its shots still needs control under the rule (a bridged sequence counts if any shot does).
A person's override (set_depth_clip_control) is kept and wins.
  .authoring/vision-venv/bin/python authoring/render/depth-remeasure.py SOURCE-ID [--measured CONTROL.json]"""
import sys,json,pathlib,subprocess,tempfile,argparse
p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('--measured');a=p.parse_args()
root=pathlib.Path('.authoring/depth-library')/a.source;S=json.load(open(root/'source.json'))
if a.measured:R=json.load(open(a.measured))['shots']
else:
    t=tempfile.mkdtemp();sj=pathlib.Path(t)/'shots.json';json.dump({'shots':[{k:s[k] for k in ('index','start','end')} for s in S['shots']]},open(sj,'w'))
    args=[sys.executable,'authoring/render/control-need.py',S['file'],str(sj),str(pathlib.Path(t)/'c.json')]
    if (root/'speech-times.json').exists():args+=['--speech',str(root/'speech-times.json')]
    subprocess.run(args,check=True,capture_output=True);R=json.load(open(pathlib.Path(t)/'c.json'))['shots']
new={r['index']:r for r in R};changed=[]
for s in S['shots']:
    r=new[s['index']];was=s['control']
    for k in ('camera','cameraNet','move','travel','people','size','control','why'):
        if k in r:s[k]=r[k]
    if was!=s['control']:changed.append((s['index'],was,s['control']))
out=[]
for C in S['clips']:
    if C['kind']!='control':continue
    on=[i for i in C['shots'] if next(s for s in S['shots'] if s['index']==i)['control']=='on']
    C['needsControl']=bool(on);C['measuredWhy']=sorted({w for i in on for w in next(s for s in S['shots'] if s['index']==i)['why']})
    out.append((C['id'],C['needsControl'],C.get('controlOverride',{}).get('control')))
S['rule']='control-need.py with net camera change and person travel (2026-10-19)';json.dump(S,open(root/'source.json','w'),indent=1)
print(json.dumps(dict(source=a.source,changed=changed,clips=out)))
