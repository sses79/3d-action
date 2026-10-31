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
kit=json.load(open(os.path.join(root,'editor/assets/props/index.json')))['props'];
def movement(mid):  # a library movement with its pace: how far its hips travel per second (a walk's own speed), 0 for one on the spot
    m=call('get_movement',{'movementId':mid});k=next((t['keys'] for t in m['action']['tracks'] if t['target']=='pelvis' and t['property']=='position'),[]);B=sum(p['duration'] for p in m['action']['phases'])
    d=math.hypot(k[-1]['value'][0]-k[0]['value'][0],k[-1]['value'][1]-k[0]['value'][1]) if len(k)>1 else 0;return dict(revision=m['revision'],pace=d/B if B else 0)
def track(mid):  # a library movement's hips: times, forward travel (metres, its own forward), duration
    m=call('get_movement',{'movementId':mid});k=next(t['keys'] for t in m['action']['tracks'] if t['target']=='pelvis' and t['property']=='position');return [x['time'] for x in k],[-(x['value'][1]-k[0]['value'][1]) for x in k],sum(p['duration'] for p in m['action']['phases'])
def steady(mid,first):  # where a start reaches its own walking pace (first) or a stop leaves it: the pace over its last (first: the start's) second, nine tenths of it held over 0.3 s
    T,F,B=track(mid);v=[(F[min(len(F)-1,i+9)]-F[i])/(T[min(len(T)-1,i+9)]-T[i]+1e-9) for i in range(len(T))];j=[i for i in range(len(T)) if ((B-1.3<T[i]<B-.3) if first else T[i]<1)];pace=sum(v[i] for i in j)/len(j)
    ok=[i for i in range(len(T)-9) if v[i]>=.9*pace];i=(ok[0] if first else ok[-1]) if ok else (len(T)-1 if first else 0);return T[i],F[i],F[-1],B,pace
WALKS,START,STOP,SIT,RISE,IDLE='move-walk-tracks','move-mixamo-start-walking','move-mixamo-stop-walking','move-mixamo-stand-to-sit','move-mixamo-sit-to-stand','move-mixamo-sitting-idle'
PACE={'move-walk-tracks':0.92}  # walks on the spot: the Studio Walk_Loop's stride (1.23 m a 1.333 s loop, measured from its feet), the default walk since 2026-10-31; 'walk'/'pace' in a go or rise pick another
TURN={90:'move-mixamo-left-turn-90',-90:'move-mixamo-right-turn-90'}  # Mixamo's plain standing turns (the 'Standing Turn ... 90' pair turns in a crouched ready stance)
def spun(mid):  # how far a movement turns the hips about the vertical, degrees (left positive)
    m=call('get_movement',{'movementId':mid});k=next(t['keys'] for t in m['action']['tracks'] if t['target']=='pelvis' and t['property']=='rotation');a,b=k[0]['value'],k[-1]['value'];w=b[3]*a[3]+b[0]*a[0]+b[1]*a[1]+b[2]*a[2];z=-b[3]*a[2]+b[2]*a[3]-b[0]*a[1]+b[1]*a[0];return math.degrees(2*math.atan2(z,w))
POSE={}
def pose(mid,t):  # a movement's leg, arm and spine turns at time t (nearest key)
    if mid not in POSE:m=call('get_movement',{'movementId':mid});POSE[mid]={x['target']:x['keys'] for x in m['action']['tracks'] if x['property']=='rotation'}
    R=POSE[mid];return {n:min(R[n],key=lambda k:abs(k['time']-t))['value'] for n in ('thigh_l','thigh_r','calf_l','calf_r','foot_l','foot_r','upperarm_l','upperarm_r','spine_01','pelvis') if n in R}
def gap(a,b):return sum(1-abs(sum(x*y for x,y in zip(a[n],b[n]))) for n in a if n in b)
def phase(mid,want):  # the time in a walk cycle whose pose is closest to the given pose: where a cycle picks up from a start
    T,F,B=track(mid);return min((gap(want,pose(mid,t)),t) for t in T if t<B-1e-3)[1]
def still(mid):  # when a movement's hips stop travelling (under 5 cm/s for good): a stop's standing tail after it is left out
    T,F,B=track(mid);v=[(F[min(len(F)-1,i+3)]-F[i])/(T[min(len(T)-1,i+3)]-T[i]+1e-9) for i in range(len(T))];return next((T[i] for i in range(len(T)) if all(abs(x)<.05 for x in v[i:])),B)
def ahead(p,h,d):return [round(p[0]+math.sin(math.radians(h))*d,3),round(p[1]+math.cos(math.radians(h))*d,3)]
def turned(at,h0,h1):  # a turn on the spot from heading h0 to h1: the left or right 90 degree turn, the rest spread over it as a turn of the whole figure
    d=((h1-h0+180)%360)-180
    if abs(d)<20:return []
    k=90 if d>0 else -90;T,F,B=track(TURN[k]);r=spun(TURN[k]);return [dict(movement=TURN[k],once=True,at=at,heading=[h0,h0+d-r],seconds=round(B,3))]
def go(n,g):  # {go: {from, seat: true | to, heading, walk?, pace?, join?}} (walk: another walk cycle to loop between start and stop; pace: its metres a second when its hips carry no travel): start walking, walk, stop walking, turn on the spot, sit down (stand-to-sit backs into the seat), all at the walk's own pace
    seat=g.get('seat');fp=next(f for f in src['figures'] if f['name']==n)['place'];hs=g.get('heading',heading[n])
    T,Fs,B,_,_=steady(START,True);WALK=g.get('walk',WALKS);pace=g.get('pace') or PACE.get(WALK) or movement(WALK)['pace'];o0=phase(WALK,pose(START,T));WT,WF,WB=track(WALK)
    t1,Fe1,Fe,Be,_=steady(STOP,False);ST,SF,SB=track(SIT);XT,XF,XB=track(STOP)
    to=ahead(fp,hs,-SF[-1]) if seat else g['to'];fr=g['from'];dx,dz=to[0]-fr[0],to[1]-fr[1];h=math.degrees(math.atan2(dx,dz));D=math.hypot(dx,dz)
    # the stop picks up where the walk's pose is closest to its own, among its frames while still walking; the walk may be 10% longer
    # or shorter than its distance asks (its steps then stretch or shrink that much) to land on that pose, each percent costing
    # about what a tenth of a leg's mismatch does (a 10% stretch slid planted feet 3 cm and lifted them at the joins)
    best=None
    for i,tx in enumerate(XT):
        if tx>t1+.2:break
        mid=D-Fs-(Fe-XF[i])
        if mid<.2:continue
        for k in range(-10,11):P=mid/pace*(1+k/100);g2=gap(pose(WALK,(o0+P)%WB),pose(STOP,tx))+abs(k)*.01;best=min(best or (9,),(g2,tx,XF[i],mid,P))
    _,t1,Fe1,mid,P=best if best else (0,t1,Fe1,D-Fs-(Fe-Fe1),(D-Fs-(Fe-Fe1))/pace);stopTravel=Fe-Fe1
    print(f'go {n}: {D:.2f} m = start {Fs:.2f} + walk {mid:.2f} + stop {stopTravel:.2f}, at {pace:.2f} m/s',file=sys.stderr)
    if mid<-.05:raise SystemExit(f'go: {D:.2f} m from {fr} to {to} is too short for a start ({Fs:.2f} m) and a stop ({stopTravel:.2f} m); start further back')
    p1=ahead(fr,h,Fs);p2=ahead(fr,h,Fs+mid);out=[dict(movement=START,once=True,at=fr,heading=h,seconds=round(T,3)),*([dict(movement=WALK,walk={'from':p1,'to':p2},seconds=round(P,3),offset=round(o0,3),speed=1)] if mid>.2 else []),dict(movement=STOP,once=True,at=ahead(p2,h,-Fe1),heading=h,offset=round(t1,3),seconds=round(min(Be,still(STOP)+.3)-t1,3))]
    if g.get('join'):J=g['join'];JB=track(J)[2];out.append(dict(movement=J,once=True,at=to,heading=h,offset=round(2/30,3),seconds=round(JB-4/30,3),hold=False))  # a generated join (ardy-join.py) in place of the turn: its first three frames are the stop's last, its last three the sit-down's first
    else:out+=turned(to,h,hs)
    if seat:out.append(dict(movement=SIT,once=True,at=to,heading=hs,seconds=round(SB,3)))
    return out
def rise(n,g):  # {rise: {to, walk?, pace?, join?}} (join: a generated turn, ardy-join.py, in place of the turn on the spot): stand up from the seat (sit-to-stand), turn toward the way out, start walking and walk on
    fp=next(f for f in src['figures'] if f['name']==n)['place'];hs=g.get('heading',heading[n]);RT,RF,RB=track(RISE);up=ahead(fp,hs,RF[-1]);dx,dz=g['to'][0]-up[0],g['to'][1]-up[1];h=math.degrees(math.atan2(dx,dz))
    T,Fs,B,_,_=steady(START,True);WALK=g.get('walk',WALKS);pace=g.get('pace') or PACE.get(WALK) or movement(WALK)['pace'];o0=phase(WALK,pose(START,T));J=g.get('join');JB=track(J)[2] if J else 0;out=[dict(movement=RISE,once=True,at=fp,heading=hs,seconds=round(RB,3))]+([dict(movement=J,once=True,at=up,heading=hs,offset=round(2/30,3),seconds=round(JB-4/30,3),hold=False)] if J else turned(up,hs,h))+[dict(movement=START,once=True,at=up,heading=h,seconds=round(T,3))]
    rest=math.hypot(dx,dz)-Fs;out.append(dict(movement=WALK,walk={'from':ahead(up,h,Fs),'to':g['to']},seconds=round(max(.5,rest)/pace,3),offset=round(o0,3),speed=1));return out
def expand(n,plays):  # go and rise steps into their movements; a step's seconds may be left out ('rest': what the shot has left)
    out=[]
    for pl in plays:out+=go(n,pl['go']) if 'go' in pl else rise(n,pl['rise']) if 'rise' in pl else [pl]
    return out
moved={n:[0.0,0.0] for n in P['roles']}  # a person's place as moved so far by the text
def build(name,shot):  # the person's segment whose time is that shot's in the fitted scene
    c=cams[shot];f=next(f for f in src['figures'] if f['name']==name);return f,next(g for g in f['segments'] if abs(g['from']-c['start'])<.05)
cameras,segs,t=[],{n:[] for n in P['roles']},0.0
for sh in P['shots']:
    c=cams[sh['camera']];cameras.append({**{k:c[k] for k in ('position','yaw','pitch','focal')},'name':sh['camera'],'start':round(t,3)})
    for n,plays in sh.get('play',{}).items():
        u=t;plays=plays if isinstance(plays,list) else [dict(plays,seconds=sh['seconds'])]  # one entry for the shot, or steps in order, each with its seconds
        plays=expand(n,plays);left=sh['seconds']-sum(p.get('seconds',0) for p in plays)
        if left<-.05:print(f'warning: {n} in {sh["camera"]} at {t:.1f} s: steps run {-left:.2f} s past the shot',file=sys.stderr)
        plays=[dict(p,seconds=p.get('seconds',max(.1,left))) for p in plays]
        for pl in plays:
            secs=pl['seconds'];f=next(f for f in src['figures'] if f['name']==n)
            if 'movement' in pl:  # a library movement: walk {from, to} at its own pace, in place, places carrying it; or a turn [from, to] (headings) where it stands
                mv=movement(pl['movement']);a=pl.get('walk');at=pl.get('at',a['to'] if a else f['place']);cy=c['yaw']
                if pl.get('once'):  # played once where it stands, its own hip travel moving the figure (start or stop walking, a turn on the spot, sitting down, standing up)
                    hh=pl['heading'];tr=[round(((x-cy+180)%360)-180,1) for x in hh] if isinstance(hh,list) else round(((hh-cy+180)%360)-180,1);segs[n].append(dict(actionId=pl['movement'],revision=mv['revision'],places=[at,at],start=round(u,3),end=round(u+secs,3),speed=pl.get('speed',1),offset=pl.get('offset',0),loop=False,frame=sh['camera'],turn=tr,**({'seat':round(hips[n],3)} if pl['movement'] in (SIT,IDLE,RISE) and P['roles'][n].get('seat') else {}),**({'hold':False} if pl.get('hold') is False else {})));u+=secs;continue  # a sit meets the role's chair: its hips at the seated hip height the chair is scaled to
                if a:dx,dz=a['to'][0]-a['from'][0],a['to'][1]-a['from'][1];h=math.degrees(math.atan2(dx,dz));dist=math.hypot(dx,dz);sp=pl['speed'] if 'speed' in pl else min(2,max(.5,dist/secs/mv['pace'])) if mv['pace'] else 1;q=[[round(a['from'][0]+dx*k/12,3),round(a['from'][1]+dz*k/12,3)] for k in range(13)];tr=round(((h-cy+180)%360)-180,1)
                else:sp=pl.get('speed',1);q=[at,at];tr=[round(((x-cy+180)%360)-180,1) for x in pl['turn']] if isinstance(pl.get('turn'),list) else round(((pl.get('turn',heading[n])-cy+180)%360)-180,1)
                e=dict(actionId=pl['movement'],revision=mv['revision'],places=q,start=round(u,3),end=round(u+secs,3),speed=round(sp,3),offset=pl.get('offset',0),loop='cycle',inPlace=True,frame=sh['camera'],turn=tr)
            else:
                f,g=build(n,pl['build']);B=g['to']-g['from'];sp=pl.get('speed',B/secs);loop=pl.get('loop',False)
                if not .7<=sp<=1.4 and 'speed' not in pl:sp=min(1.4,max(.7,sp));loop=True  # within what keeps a build believable; the rest goes back and forth
                e={k:g[k] for k in ('actionId','revision','places','hip','settle') if k in g}|dict(start=round(u,3),end=round(u+secs,3),speed=round(sp,3),offset=pl.get('offset',0),loop=loop,frame=pl['build'])  # frame: the build keeps the camera it was made in, wherever it plays
                if pl.get('reverse'):e['reverse']=True  # played backwards: a sit-down becomes standing up
                if 'turn' in pl:e['turn']=pl['turn']  # blocking from the text: a turn about the hips, or [from, to] across the shot
                m0,mv2=list(moved[n]),pl.get('move',[0,0]);moved[n]=[moved[n][0]+mv2[0],moved[n][1]+mv2[1]]  # a move [dx, dz] across the shot, kept afterwards
                if any(m0)or any(mv2):q=e.get('places',[f['place'],f['place']]);e['places']=[[round(x+m0[0]+mv2[0]*k/(len(q)-1),3),round(z+m0[1]+mv2[1]*k/(len(q)-1),3)] for k,(x,z) in enumerate(q)]
            segs[n].append(e);u+=secs
    t+=sh['seconds']
figures=[]
for n,role in P['roles'].items():
    f=next(f for f in src['figures'] if f['name']==n)
    figures.append(dict(name=role['name'],color=f['color'],height=role.get('height',f['height']),place=f['place'],**({'legs':True} if f.get('legs') else {}),**({'character':role['character']} if role.get('character') else {}),
        segments=[{k:v for k,v in s.items() if k not in ('start','end')}|{'from':s['start'],'to':s['end']} for s in segs[n]]))
sets=list(P.get('set',[]))
for n,role in P['roles'].items():  # a seat under a seated role: half a step (25 cm) behind their hips, so someone who sits down stands clear of it first, turned their way, scaled to their hip height
    if not role.get('seat'):continue
    f=next(f for f in src['figures'] if f['name']==n);h=math.radians(heading[n]);k=kit[role['seat']];sc=round(min(1.3,max(.6,(hips[n]-.1)/k['seat'])),3) if k.get('seat') else 1
    sets.append(dict(prop=role['seat'],place=[round(f['place'][0]-math.sin(h)*.25,3),round(f['place'][1]-math.cos(h)*.25,3)],turn=round(heading[n],1),scale=sc))
if '--figures' in sys.argv:json.dump(figures,sys.stdout);raise SystemExit  # the scene's figures as they would be written, nothing written or rendered
pairs=call('list_pairs',{});rev=next((p.get('revision',0) for p in (pairs if isinstance(pairs,list) else pairs.get('pairs',[])) if p.get('pairId',p.get('id'))==P['id']),0)
sc=call('set_shots_scene',dict(pairId=P['id'],name=P['name'],expectedRevision=rev,duration=round(t,3),figures=figures,cameras=cameras,set=sets))
v=call('render_pair_video',dict(pairId=P['id'],width=1280,height=720,fps=30,feet=True));shutil.copy(v['file'],os.path.join(out,'scene.mp4'))
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
def feet_check(path):  # per role, from the rendered feet (heels and balls, every frame): how far a planted foot slides and where the feet are to the floor
    F=json.load(open(path));fps=F['fps'];res={}
    for i,(k,role) in enumerate(P['roles'].items()):
        sole=F['soles'][i] if F.get('soles') else [min(fr[i][j][1] for fr in F['frames']) for j in range(4)];pts=[[(p[0],p[1]-sole[j],p[2]) for j,p in enumerate(fr[i])] for fr in F['frames']];segs=figures[i]['segments'];n=len(pts)
        walk=[f for f in range(n) if any((s.get('inPlace') or s['actionId'].startswith('move-')) and s['from']<=f/fps<=s['to'] for s in segs)];low=[min(p[1] for p in pts[f]) for f in range(n)]
        slides=[]
        for j in (1,3):  # balls: held still from where they come down
            run=[]
            for f in walk+[None]:
                if f is not None and pts[f][j][1]<.02 and (not run or run[-1]==f-1):run.append(f);continue
                if len(run)>=4:slides.append(max(math.hypot(pts[g][j][0]-pts[run[0]][j][0],pts[g][j][2]-pts[run[0]][j][2]) for g in run))
                run=[f] if f is not None and pts[f][j][1]<.02 else []
        res[k]=dict(walkSeconds=round(len(walk)/fps,2),plants=len(slides),slideCm=dict(median=round(100*sorted(slides)[len(slides)//2],1),max=round(100*max(slides),1)) if slides else None,
            walkFloorCm=dict(low=round(100*min(low[f] for f in walk),1),high=round(100*max(low[f] for f in walk),1)) if walk else None,belowFloorCm=round(100*min(0,min(low)),1),belowFloorFrames=sum(1 for x in low if x<-.02))
    return res
feet=feet_check(v['file'].replace('.mp4','.feet.json'))
json.dump(dict(spec=os.path.relpath(sys.argv[1],root),roles={k:{'name':r['name'],'character':r.get('character')} for k,r in P['roles'].items()},pair=P['id'],revision=sc.get('revision'),seconds=round(t,2),cameras=len(cameras),lines=len(P['lines']),feet=feet,files=sorted(os.listdir(out))),open(os.path.join(out,'perform.json'),'w'),indent=1)
print(json.dumps(dict(out=out,pair=P['id'],seconds=round(t,2),revision=sc.get('revision'),feet=feet)))
