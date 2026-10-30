"""The GLBs mixamo-retarget.py wrote, as base movements in the library (register_movement): every joint's local rotation per frame
and the pelvis' position, in the Studio's Action v2 (the same tracks as the adapted UAL2 movements), one phase, ids move-mixamo-<clip>.
A movement that already exists becomes a new revision. Needs the service.
  python3 authoring/render/mixamo-register.py DIR [--source 'Mixamo via the Humane-Basics pack']"""
import sys,os,json,struct,urllib.request
argv=sys.argv[1:];d=os.path.abspath(argv[0]);src=argv[argv.index('--source')+1] if '--source' in argv else 'Mixamo'
def call(n,a):
    r=json.load(urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:5174/api/tool',json.dumps(dict(name=n,arguments=a)).encode(),{'Content-Type':'application/json'}),timeout=300))
    if r.get('error'):raise RuntimeError(r['error'])
    return r['result']
def glb(p):
    b=open(p,'rb').read();n=struct.unpack('<I',b[12:16])[0];g=json.loads(b[20:20+n]);o=20+n;m=struct.unpack('<I',b[o:o+4])[0];return g,b[o+8:o+8+m]
def acc(g,bin_,i):
    a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];w={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']];s=v.get('byteOffset',0)+a.get('byteOffset',0)
    f=struct.unpack_from(f'<{a["count"]*w}f',bin_,s);return [list(f[k*w:(k+1)*w]) for k in range(a['count'])]
have={m.get('movementId',m.get('id')):m.get('revision',0) for m in call('list_movements',{'includeArchived':True})}
out=[]
for f in sorted(x for x in os.listdir(d) if x.endswith('.glb')):
    g,bin_=glb(os.path.join(d,f));joints=[g['nodes'][j] for j in g['skins'][0]['joints']];names=[n['name'] for n in joints];an=g['animations'][0];ch={}
    for c in an['channels']:
        s=an['samplers'][c['sampler']];nm=g['nodes'][c['target']['node']].get('name');ch[(nm,c['target']['path'])]=(acc(g,bin_,s['input']),acc(g,bin_,s['output']))
    t0=min(T[0][0] for T,V in ch.values());r=lambda x:round(x,6)
    def keys(nm,path,rest):
        if (nm,path) in ch:T,V=ch[(nm,path)];return [{'time':r(t[0]-t0),'value':[r(x) for x in v]} for t,v in zip(T,V)]
        return [{'time':0,'value':[r(x) for x in rest]}]
    tracks=[{'target':n['name'],'property':'rotation','mode':'absolute','interpolation':'linear','keys':keys(n['name'],'rotation',n.get('rotation',[0,0,0,1]))} for n in joints]
    pel=next(n for n in joints if n['name']=='pelvis');tracks.append({'target':'pelvis','property':'position','mode':'absolute','interpolation':'linear','keys':keys('pelvis','translation',pel.get('translation',[0,0,0]))})
    dur=max(k['time'] for t in tracks for k in t['keys']);slug=f[:-4];mid='move-mixamo-'+slug;title=slug.replace('-',' ').capitalize()
    action={'version':2,'rig':'quaternius-ual1','id':mid,'name':'Mixamo · '+title,'phases':[{'id':'motion-0','name':title,'intent':'Retargeted Mixamo motion; contact and travel need review','duration':round(dur,6),'kind':'move','clip':'A_TPose','from':0,'to':0}],'tracks':tracks,'cues':[]}
    meta={'source':f'{src} · {title}','support':'unknown','travel':'source','notes':'Retargeted from the Mixamo skeleton by world rotation offsets from the shared T-pose (authoring/render/mixamo-retarget.py); hips travel scaled by hip height. Fingers from Mixamo, leaf joints at rest. Foot contacts not checked.'}
    try:res=call('register_movement',{'action':action,'metadata':meta,'expectedRevision':have.get(mid,0)});out.append({'movement':mid,'revision':res.get('revision') if isinstance(res,dict) else res,'seconds':round(dur,2)})
    except Exception as e:out.append({'movement':mid,'error':str(e)[:300]})
print(json.dumps(out,indent=0))
