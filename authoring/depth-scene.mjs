// build_depth_scene: a depth library clip as a plain-shape 3D scene, matched at its keyframes (docs/DEPTH_LIBRARY_PLAN.md, "A 3D
// scene from a clip"). One job, steps in order, each kept in .authoring/depth-scene/<clip>/:
//  body    SAM 3D Body once per named person at each keyframe, from the clip's own boxes (authoring/render/depth-scene-body.py)
//  layout  one room: a place and heading per person, a camera and lens per shot, fitted so each person lands on their keyframe
//          points (authoring/render/depth-scene.py); its check gives the error in pixels per reading
//  builds  a coarse reconstruct_motion per shot for each person seen whole and facing the camera at a keyframe of that shot (a
//          back, the body or in a close shot the head turned away, over a shoulder or someone cut by a side of the picture holds their nearest build, turned as in its shot)
//  scene   set_shots_scene, pair dscene-<clip>: each build moves between its person's keyframe places with its hips at the
//          then the legs of anyone seated (hips under 0.7 m) or small (under 300 px) are smoothed from when the hips settle (smoothLegs)
//          fitted height; legs drawn for people sitting (hips under 0.7 m), else the tapered column
//  look    with look: true and a character worn (characters: {name: id}, kept from the last build when not given): the Blender
//          render in their own clothes (export_pair_reference renderer blender, look.mp4), about half a minute per second
//  render  render_pair_video; check: the sheet (keyframes, then five moments a shot, source over scene)
// A build already made for that shot and person is kept unless again: true (which also reads the bodies again). A person with no
// build anywhere is left out and named in the result. Builds are one at a time (the service runs one
// reconstruction at a time), 1.5-3 minutes each.
import {readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {spawn} from 'node:child_process';
export class DepthScene{
 constructor(lib,call,pairRevision){this.lib=lib;this.call=call;this.pairRevision=pairRevision;this.root=lib.root;}
 find(clip){for(const d of readdirSync(this.lib.base,{withFileTypes:true})){if(!d.isDirectory())continue;const b=resolve(this.lib.base,d.name,clip),spec=b+'.spec.json',tracks=[b+'.tracks-fixed.json',b+'.tracks.json'].find(existsSync);if(existsSync(spec))return {source:d.name,spec,tracks};}return null;}
 start(a){if(typeof a.clip!=='string'||!/^[a-z0-9][a-z0-9-]{1,40}$/.test(a.clip))throw Error('clip: a depth library clip ID');const f=this.find(a.clip);if(!f)throw Error(`No clip ${a.clip} in the depth library`);if(!f.tracks)throw Error(`${a.clip} has no tracks yet: build it first (build_depth_clip)`);
  const job=this.lib.store.enqueue('depth-scene',{clip:a.clip},(j,log,step)=>this.run(a,f,log,step));return {job:job.id,status:job.status,note:'Poll get_depth_job; 5-15 minutes, mostly the builds.'};}
 py(bin,args,log,timeout=3600000){return new Promise((ok,fail)=>{const p=spawn(bin,args,{cwd:this.root});let out='',err='';const t=setTimeout(()=>p.kill('SIGTERM'),timeout);
  p.stdout.on('data',b=>{out+=b;log?.(b.toString());});p.stderr.on('data',b=>{err+=b;});p.on('close',code=>{clearTimeout(t);code===0?ok(out):fail(Error(`${basename(args[0])}: ${(err||out).slice(-1200)}`));});});}
 async run(a,f,log,step){const dir=resolve(this.root,'.authoring/depth-scene',a.clip),D=n=>resolve(dir,n),vision=this.lib.py,comfy=resolve(this.root,'.authoring/comfyui/.venv/bin/python'),t0=Date.now(),took={};mkdirSync(dir,{recursive:true});
  const S=JSON.parse(readFileSync(f.spec,'utf8')),time=(k,t)=>{took[k]=Math.round((Date.now()-t)/1000);};let t=Date.now();
  step('body');if(a.again||!existsSync(D('body.npz')))await this.py(comfy,['authoring/render/depth-scene-body.py',f.spec,f.tracks,D('body.npz')],log);time('body',t);
  step('layout');t=Date.now();await this.py(vision,['authoring/render/depth-scene.py',D('body.json'),D('layout.json')],log);const L=JSON.parse(readFileSync(D('layout.json'),'utf8'));time('layout',t);
  // the boxes file reconstruct_motion reads: the clip's tracks, each box with its area
  const TR=JSON.parse(readFileSync(f.tracks,'utf8'));for(const v of Object.values(TR.tracks))for(const b of v)if(b){const [x0,y0,x1,y1]=b.box;b.area=(x1-x0)*(y1-y0);}
  writeFileSync(D('boxes.json'),JSON.stringify({video:TR.video,start:TR.start,end:TR.end,times:TR.times,size:TR.size,tracks:TR.tracks}));
  step('builds');t=Date.now();const want=new Map();for(const c of L.check)if(c.weight>=1&&c.boxHeight>=150)want.set(`${c.shot}:${c.name}`,{shot:c.shot,name:c.name});
  const hips=Object.fromEntries(L.people.map(p=>[p.name,p.hipHeight]));
  // when the hips have settled: the last moment the hips (root height, averaged over 0.3 s) are more than 10 cm from their height over
  // the second half, plus 0.1 s; 0 for someone who never rises or sits (the build's root drifts a few cm and jumps under 10 cm)
  // leg rotation tracks averaged over neighbouring frames (sign-aligned quaternions, [1 2 1]/4, ten passes) inside [from, to]; the first
  // frame of the window stays, and from the shot's last 0.2 s the last steady pose holds (the cut leaks into a build's final frames)
  const LEG=['thigh_l','calf_l','foot_l','ball_l','thigh_r','calf_r','foot_r','ball_r'],smoothLegs=(act,from,to)=>{for(const t of act.tracks){if(t.property!=='rotation'||!LEG.includes(t.target))continue;const K=t.keys,q=K.map(k=>[...k.value]);for(let i=1;i<q.length;i++)if(q[i].reduce((n,v,j)=>n+v*q[i-1][j],0)<0)q[i]=q[i].map(v=>-v);const inside=K.map(k=>k.time>=from-1e-6&&k.time<=to+1e-6),hold=K.findIndex(k=>k.time>=to-.2);
    for(let pass=0;pass<10;pass++){const b=q.map(v=>[...v]);for(let i=1;i<q.length;i++)if(inside[i]){const n=b[Math.min(i+1,q.length-1)];q[i]=b[i].map((v,j)=>(b[i-1][j]+2*v+n[j])/4);const m=Math.hypot(...q[i]);q[i]=q[i].map(v=>v/m);}}
    if(hold>0)for(let i=hold;i<q.length;i++)q[i]=[...q[hold-1]];K.forEach((k,i)=>{k.value=q[i].map(v=>+v.toFixed(6));});}return act;};
  const settles=act=>{const k=(act.tracks.find(t=>t.target==='$root'&&t.property==='position')?.keys??[]).map(q=>[q.time,q.value[1]]);if(!k.length)return 0;const ys=k.map((_,i)=>{const w=k.slice(Math.max(0,i-4),i+5);return w.reduce((n,q)=>n+q[1],0)/w.length;}),h=[...ys.slice(ys.length>>1)].sort((x,y)=>x-y),mid=h[h.length>>1];let at=-1;ys.forEach((y,i)=>{if(Math.abs(y-mid)>.1)at=k[i][0];});return at<0?0:+Math.min(at+.1,k.at(-1)[0]).toFixed(2);};
  const builds=[];for(const {shot,name} of want.values()){const sh=S.shots.find(s=>s.index===shot),actionId=`dscene-${a.clip}-s${shot}-${name.toLowerCase()}`.slice(0,48);log(`· build shot ${shot} ${name}\n`);
   try{const have=await this.call('get_action',{actionId}).then(r=>r.revision,()=>0);if(have&&!a.again)log(`  kept (revision ${have}; again: true rebuilds)\n`);else await this.call('reconstruct_motion',{...(have?{expectedRevision:have}:{}),video:S.video,start:+(S.start+sh.start).toFixed(3),end:+(S.start+sh.end).toFixed(3),boxes:{file:D('boxes.json'),name},coarse:true,commit:true,force:true,actionId,name:`${a.clip} shot ${shot} ${name} (depth scene)`});
    // legs of someone seated or small in the shot: a coarse build reads every third frame of the least sure part, and they shake.
    // Their rotations (thighs, calves, feet) are averaged frame to frame from when the hips settle to the end, so a sit-down stays
    // sharp; the build keeps the body model's rotations (a reconstruct_motion correction would pose it all from positions). Saved
    // with revise_action; the phase's intent says it was done, so a kept build is not smoothed twice.
    let got=await this.call('get_action',{actionId}),smooth=null;const tall=Math.max(...L.check.filter(c=>c.shot===shot&&c.name===name).map(c=>c.boxHeight)),ph=got.action.phases?.[0];
    if((hips[name]<.7||tall<300)&&ph&&!/Legs smoothed/.test(ph.intent??'')){const dur=+(sh.end-sh.start).toFixed(3),at=settles(got.action);if(at<dur-.3){smooth=at;const act=smoothLegs(structuredClone(got.action),at,dur);act.phases[0].intent=`${ph.intent??''} Legs smoothed from ${at} s (build_depth_scene).`.trim();await this.call('revise_action',{action:act,expectedRevision:got.revision});got=await this.call('get_action',{actionId});log(`  legs smoothed from ${at} s\n`);}}
    builds.push({shot,name,actionId,from:sh.start,to:sh.end,revision:got.revision,settle:settles(got.action),...(smooth!==null?{legsSmoothedFrom:smooth}:{})});}catch(e){builds.push({shot,name,actionId,failed:String(e?.message??e).slice(-300)});}}
  time('builds',t);
  step('scene');const people=S.people.filter(p=>builds.some(b=>b.name===p.name&&!b.failed)),left=S.people.filter(p=>!people.includes(p)).map(p=>p.name+(L.unplaced?.includes(p.name)?' (seen only cut by a side of the picture)':''));if(people.length<2)throw Error(`Fewer than two people have a build (${people.map(p=>p.name).join(', ')||'none'}); see the builds: ${JSON.stringify(builds)}`);
  const place=Object.fromEntries(L.people.map(p=>[p.name,p.place])),pairId=`dscene-${a.clip}`.slice(0,48);
  // where each person's hips are over a segment: their keyframe places, straight between keyframes, held before the first and after the last
  const kfs=Object.fromEntries(L.people.map(p=>[p.name,p.keyframes])),along=(n,t)=>{const k=kfs[n];if(t<=k[0].time)return k[0].place;if(t>=k[k.length-1].time)return k[k.length-1].place;const j=k.findIndex(q=>q.time>t),u=(t-k[j-1].time)/(k[j].time-k[j-1].time);return [0,1].map(i=>+(k[j-1].place[i]*(1-u)+k[j].place[i]*u).toFixed(3));};
  const was=await this.call('export_pair_reference',{pairId,viewOnly:true}).then(v=>Object.fromEntries((v.shotsScene?.figures??[]).filter(f=>f.character).map(f=>[f.name,f.character])),()=>({})),wear={...was,...(a.characters??{})};  // who wears which body: as asked, else as the scene had it
  const figures=people.map(p=>({name:p.name,color:p.color,height:1.7,...(wear[p.name]&&wear[p.name]!=='mannequin'?{character:wear[p.name]}:{}),...(hips[p.name]<.7?{legs:true}:{}),place:place[p.name],segments:builds.filter(b=>b.name===p.name&&!b.failed).map(b=>({from:b.from,to:b.to,actionId:b.actionId,revision:b.revision,places:Array.from({length:13},(_,i)=>along(p.name,b.from+(b.to-b.from)*i/12)),hip:Math.min(1.4,Math.max(.15,hips[p.name])),...(b.settle>.2?{settle:b.settle}:{})}))}));
  const end=S.shots[S.shots.length-1].end,sc=await this.call('set_shots_scene',{pairId,name:`${a.clip} from its keyframes (depth scene)`,expectedRevision:this.pairRevision(pairId),duration:+end.toFixed(3),figures,cameras:L.cameras.map(c=>({name:c.name,start:c.start,position:c.position,yaw:c.yaw,pitch:c.pitch,focal:c.focal}))});
  step('render');t=Date.now();const v=await this.call('render_pair_video',{pairId,width:1280,height:720,fps:30});time('render',t);
  let look=null;if(a.look&&Object.values(wear).some(c=>c&&c!=='mannequin')){step('look');t=Date.now();const r=await this.call('export_pair_reference',{pairId,renderer:'blender',width:1280,height:720,fps:30});look=resolve(r.folder??r.dir??'', 'look.mp4');time('look',t);}
  step('check');await this.py(vision,['authoring/render/depth-scene-check.py',D('layout.json'),v.file,D('check.jpg')],log);
  const px=L.check.filter(c=>c.weight>0).map(c=>c.pixels);
  return {clip:a.clip,pairId,revision:sc.revision,video:v.file,sheet:D('check.jpg'),layout:D('layout.json'),people:L.people,cameras:L.cameras.length,fit:{readings:px.length,medianPixels:px.sort((x,y)=>x-y)[px.length>>1]??null,worstPixels:Math.max(...px)},
   builds:builds.map(b=>b.failed?{shot:b.shot,name:b.name,failed:b.failed}:{shot:b.shot,name:b.name,actionId:b.actionId,...(b.legsSmoothedFrom!==undefined?{legsSmoothedFrom:b.legsSmoothedFrom}:{})}),...(left.length?{leftOut:left}:{}),characters:Object.fromEntries(people.map(p=>[p.name,wear[p.name]??'mannequin'])),...(look?{look}:{}),seconds:{...took,total:Math.round((Date.now()-t0)/1000)},
   note:'Matched at the keyframes only; between them the motion is each shot\'s build. Look at the sheet: the strips show actions no keyframe catches.'};}
}
