"""A window of a library movement as a movement of its own (register_movement), times from 0: a steady walk cycle cut from a start, so a
walk loops at the start's own pace and gait. The hips' travel is moved to start where the source's starts. With --cycle the window's best loop is searched near the given times (the pair of frames
up to 0.15 s away whose legs, arms and spine are closest), and the last frame is left out so a loop does not repeat a pose. Needs the
service.
  python3 authoring/render/movement-cut.py MOVEMENT FROM TO NEW_ID [--name NAME] [--cycle]"""
import sys,json,urllib.request
argv=sys.argv[1:];src,a,b,new=argv[0],float(argv[1]),float(argv[2]),argv[3];name=argv[argv.index('--name')+1] if '--name' in argv else new
def call(n,x):
    r=json.load(urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:5174/api/tool',json.dumps(dict(name=n,arguments=x)).encode(),{'Content-Type':'application/json'}),timeout=300))
    if r.get('error'):raise RuntimeError(r['error'])
    return r['result']
m=call('get_movement',{'movementId':src});A=m['action'];R={t['target']:t['keys'] for t in A['tracks'] if t['property']=='rotation'}
T=[k['time'] for k in R['pelvis']]
def q(n,t):ks=R[n];return min(ks,key=lambda k:abs(k['time']-t))['value']
J=[n for n in ('thigh_l','thigh_r','calf_l','calf_r','foot_l','foot_r','upperarm_l','upperarm_r','spine_01','pelvis') if n in R]
gap=lambda t1,t2:sum(1-abs(sum(x*y for x,y in zip(q(n,t1),q(n,t2)))) for n in J)
if '--cycle' in argv:_,a,b=min((gap(x,y),x,y) for x in T if abs(x-a)<=.15 for y in T if abs(y-b)<=.15 and y>x)
end=b-1e-6 if '--cycle' not in argv else max(t for t in T if t<b-1e-6)
P0=next(t for t in A['tracks'] if t['target']=='pelvis' and t['property']=='position')['keys'];pa=min(P0,key=lambda k:abs(k['time']-a))['value'];shift=[pa[0]-P0[0]['value'][0],pa[1]-P0[0]['value'][1],0]  # the hips' travel starts where the source's does (its x, y at its first frame), not where the window found it
move=lambda t,v:[round(x-d,6) for x,d in zip(v,shift)] if t['target']=='pelvis' and t['property']=='position' else v
tracks=[{**t,'keys':[{**k,'time':round(k['time']-a,6),'value':move(t,k['value'])} for k in t['keys'] if a-1e-6<=k['time']<=end]} for t in A['tracks']]
tracks=[t if t['keys'] else {**t,'keys':[{'time':0,'value':min(next(x for x in A['tracks'] if x is not None and x['target']==t['target'] and x['property']==t['property'])['keys'],key=lambda k:abs(k['time']-a))['value']}]} for t in tracks]
dur=round(end-a+(1/30 if '--cycle' in argv else 0),6)
action={**A,'id':new,'name':name,'phases':[{**A['phases'][0],'id':'motion-0','name':name,'duration':dur,'intent':f'{src} from {a:.2f} s to {b:.2f} s'}],'tracks':tracks,'cues':[]}
have={x.get('movementId',x.get('id')):x.get('revision',0) for x in call('list_movements',{'includeArchived':True})}
meta={'source':f'{src} {a:.2f}-{b:.2f} s (authoring/render/movement-cut.py)','support':'unknown','travel':'source','notes':f'Cut from {src}; loop gap {gap(a,b):.4f}.' if '--cycle' in argv else f'Cut from {src}.'}
res=call('register_movement',{'action':action,'metadata':meta,'expectedRevision':have.get(new,0)})
print(json.dumps({'movement':new,'from':round(a,3),'to':round(b,3),'seconds':dur,'revision':res.get('revision') if isinstance(res,dict) else res}))
