// build_depth_scene: a depth library clip as a plain-shape 3D scene, matched at its keyframes (docs/DEPTH_LIBRARY_PLAN.md, "A 3D
// scene from a clip"). One job, steps in order, each kept in .authoring/depth-scene/<clip>/:
//  body    SAM 3D Body once per named person at each keyframe, from the clip's own boxes (authoring/render/depth-scene-body.py)
//  layout  one room: a place and heading per person, a camera and lens per shot, fitted so each person lands on their keyframe
//          points (authoring/render/depth-scene.py); its check gives the error in pixels per reading
//  builds  a coarse reconstruct_motion per shot for each person seen whole and facing the camera at a keyframe of that shot (a
//          back over a shoulder or someone cut by a side of the picture holds their nearest build, turned as in its shot)
//  scene   set_shots_scene, pair dscene-<clip>: each build moves between its person's keyframe places with its hips at the
//          fitted height; legs drawn for people sitting (hips under 0.7 m), else the tapered column
//  render  render_pair_video; check: the sheet (keyframes, then five moments a shot, source over scene)
// A person with no build anywhere is left out and named in the result. Builds are one at a time (the service runs one
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
  const builds=[];for(const {shot,name} of want.values()){const sh=S.shots.find(s=>s.index===shot),actionId=`dscene-${a.clip}-s${shot}-${name.toLowerCase()}`.slice(0,48);log(`· build shot ${shot} ${name}\n`);
   try{const have=await this.call('get_action',{actionId}).then(r=>r.revision,()=>0);await this.call('reconstruct_motion',{...(have?{expectedRevision:have}:{}),video:S.video,start:+(S.start+sh.start).toFixed(3),end:+(S.start+sh.end).toFixed(3),boxes:{file:D('boxes.json'),name},coarse:true,commit:true,force:true,actionId,name:`${a.clip} shot ${shot} ${name} (depth scene)`});
    builds.push({shot,name,actionId,from:sh.start,to:sh.end,revision:(await this.call('get_action',{actionId})).revision});}catch(e){builds.push({shot,name,actionId,failed:String(e?.message??e).slice(-300)});}}
  time('builds',t);
  step('scene');const people=S.people.filter(p=>builds.some(b=>b.name===p.name&&!b.failed)),left=S.people.filter(p=>!people.includes(p)).map(p=>p.name+(L.unplaced?.includes(p.name)?' (seen only cut by a side of the picture)':''));if(people.length<2)throw Error(`Fewer than two people have a build (${people.map(p=>p.name).join(', ')||'none'}); see the builds: ${JSON.stringify(builds)}`);
  const place=Object.fromEntries(L.people.map(p=>[p.name,p.place])),pairId=`dscene-${a.clip}`.slice(0,48);
  // where each person's hips are over a segment: their keyframe places, straight between keyframes, held before the first and after the last
  const kfs=Object.fromEntries(L.people.map(p=>[p.name,p.keyframes])),along=(n,t)=>{const k=kfs[n];if(t<=k[0].time)return k[0].place;if(t>=k[k.length-1].time)return k[k.length-1].place;const j=k.findIndex(q=>q.time>t),u=(t-k[j-1].time)/(k[j].time-k[j-1].time);return [0,1].map(i=>+(k[j-1].place[i]*(1-u)+k[j].place[i]*u).toFixed(3));};
  const hips=Object.fromEntries(L.people.map(p=>[p.name,p.hipHeight]));
  const figures=people.map(p=>({name:p.name,color:p.color,height:1.7,...(hips[p.name]<.7?{legs:true}:{}),place:place[p.name],segments:builds.filter(b=>b.name===p.name&&!b.failed).map(b=>({from:b.from,to:b.to,actionId:b.actionId,revision:b.revision,places:Array.from({length:13},(_,i)=>along(p.name,b.from+(b.to-b.from)*i/12)),hip:Math.min(1.4,Math.max(.15,hips[p.name]))}))}));
  const end=S.shots[S.shots.length-1].end,sc=await this.call('set_shots_scene',{pairId,name:`${a.clip} from its keyframes (depth scene)`,expectedRevision:this.pairRevision(pairId),duration:+end.toFixed(3),figures,cameras:L.cameras.map(c=>({name:c.name,start:c.start,position:c.position,yaw:c.yaw,pitch:c.pitch,focal:c.focal}))});
  step('render');t=Date.now();const v=await this.call('render_pair_video',{pairId,width:1280,height:720,fps:30});time('render',t);
  step('check');await this.py(vision,['authoring/render/depth-scene-check.py',D('layout.json'),v.file,D('check.jpg')],log);
  const px=L.check.filter(c=>c.weight>0).map(c=>c.pixels);
  return {clip:a.clip,pairId,revision:sc.revision,video:v.file,sheet:D('check.jpg'),layout:D('layout.json'),people:L.people,cameras:L.cameras.length,fit:{readings:px.length,medianPixels:px.sort((x,y)=>x-y)[px.length>>1]??null,worstPixels:Math.max(...px)},
   builds:builds.map(b=>b.failed?{shot:b.shot,name:b.name,failed:b.failed}:{shot:b.shot,name:b.name,actionId:b.actionId}),...(left.length?{leftOut:left}:{}),seconds:{...took,total:Math.round((Date.now()-t0)/1000)},
   note:'Matched at the keyframes only; between them the motion is each shot\'s build. Look at the sheet: the strips show actions no keyframe catches.'};}
}
