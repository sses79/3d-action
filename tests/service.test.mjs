// The service that stays up (docs/DEPTH_SERVICE_PLAN.md, step 1): jobs on disk, recovery after a stop, package locks and revisions,
// a long call answered with a job, /api/health.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {JobStore,withLock} from '../authoring/jobs.mjs';
import {DepthLibrary,renameDescription,checkFixes} from '../authoring/depth-library.mjs';
const temp=async fn=>{const dir=await mkdtemp(join(tmpdir(),'service-test-'));try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}};
const until=async(f,ms=10000)=>{const t0=Date.now();for(;;){const v=await f();if(v)return v;if(Date.now()-t0>ms)throw Error('timed out');await new Promise(r=>setTimeout(r,50));}};

test('jobs run one at a time, are kept on disk and are failed after a stop',()=>temp(async dir=>{
 const s=new JobStore(dir),order=[];
 const a=s.enqueue('one',{},async(j,log,step)=>{step('first');log('hello\n');await new Promise(r=>setTimeout(r,80));order.push('a');return {n:1};});
 const b=s.enqueue('two',{},async()=>{order.push('b');throw Error('broken');});
 assert.equal(s.status(b.id).status,'queued');
 await until(()=>s.read(b.id)?.status==='failed');assert.deepEqual(order,['a','b']);
 const ja=JSON.parse(await readFile(join(dir,a.id+'.json'),'utf8'));assert.equal(ja.status,'done');assert.deepEqual(ja.result,{n:1});assert.equal(ja.step,'first');
 assert.match(s.status(b.id).error,/broken/);
 await writeFile(join(dir,'ghost-1.json'),JSON.stringify({id:'ghost-1',kind:'ghost',status:'running',pid:999999}));
 const again=new JobStore(dir);assert.equal(again.status('ghost-1').status,'failed');assert.match(again.status('ghost-1').error,/service stopped while this job was running/);
 assert.throws(()=>again.status('nope-1'),/No such job/);
}));

test('a package lock lets one write in at a time',()=>temp(async dir=>{
 const seen=[];await Promise.all([1,2,3].map(i=>withLock(dir,async()=>{seen.push('in'+i);await new Promise(r=>setTimeout(r,30));seen.push('out'+i);})));
 for(let i=0;i<seen.length;i+=2)assert.equal(seen[i].slice(2),seen[i+1].slice(3));
}));

test('package revisions refuse a stale write',()=>temp(async dir=>{
 await mkdir(join(dir,'.authoring/video-clay/pk'),{recursive:true});await mkdir(join(dir,'.authoring/depth-library'),{recursive:true});
 await writeFile(join(dir,'.authoring/video-clay/pk/package.json'),JSON.stringify({people:[],keyframes:[],duration:4}));
 process.env.STUDIO_JOBS_DIR=join(dir,'jobs');const lib=new DepthLibrary(dir);
 assert.equal(lib.rev('pk'),1);const r=await lib.write('pk',1,async()=>({done:true}));assert.equal(r.revision,2);assert.equal(r.done,true);
 await assert.rejects(lib.write('pk',1,async()=>({})),/stale: package pk is at revision 2/);
 assert.equal((await lib.write('pk',undefined,async()=>({}))).revision,3);
}));

test('a call can be a job, and /api/health says what is running',()=>temp(async dir=>{
 const l=createServer();await new Promise(r=>l.listen(0,'127.0.0.1',r));const port=l.address().port;await new Promise(r=>l.close(r));
 const env={...process.env,STUDIO_PORT:String(port),STUDIO_STATE_PATH:join(dir,'project.json')};delete env.STUDIO_JOBS_DIR;const p=spawn(process.execPath,['authoring/server.mjs'],{env,stdio:'ignore'});
 try{const base=`http://127.0.0.1:${port}`;await until(async()=>{try{return (await fetch(base+'/api/health')).ok;}catch{return false;}});
  const call=async b=>(await fetch(base+'/api/tool',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)})).json();
  const started=await call({name:'get_capabilities',arguments:{},async:true});assert.match(started.result.job,/^tool-get-capabilities-/);
  const done=await until(async()=>{const s=await call({name:'get_depth_job',arguments:{job:started.result.job}});return s.result?.status==='done'&&s.result;});
  assert.ok(Array.isArray(done.result.tools));
  const quick=await call({name:'get_capabilities',arguments:{}});assert.ok(Array.isArray(quick.result.tools));
  const h=await (await fetch(base+'/api/health')).json();assert.equal(typeof h.uptimeSeconds,'number');assert.ok(h.jobs.counts.done>=1);assert.equal(typeof h.checks.visionPython,'boolean');assert.equal(h.restartNeeded,null);
 }finally{p.kill();}
}));

test('a depth request stops for a question, carries on without redoing finished steps, and redoes from a step',()=>temp(async dir=>{
 const {DepthRequests}=await import('../authoring/depth-request.mjs');
 const lib={base:dir,store:new JobStore(join(dir,'jobs')),pack:()=>null};const ran=[];
 class Fake extends DepthRequests{}
 for(const s of ['source','window','build','checkBuild','describe','cast','beats','lead','cut','keys','contact','checkFinal','handover','deliver'])Fake.prototype[s]=async function(R){ran.push(s);
  if(s==='cast'&&!R.answers.cast)return {ask:[{id:'cast',question:'who plays whom?'}]};return s==='handover'?{package:'pk',page:'p',revision:2,handover:{}}:{ok:s};};
 const video=join(dir,'v.mp4');await writeFile(video,'x');const q=new Fake(lib,async()=>({}));
 assert.throws(()=>q.start({video,scene:'a scene',cast:{A:'x'}}),/duration: needed/);
 assert.throws(()=>q.start({video,scene:'a scene',cast:{A:'x'},duration:4,lead:{image:join(dir,'none.png')}}),/lead: \{image/);
 const r=q.start({video,scene:'a scene',cast:{A:'x'},duration:4});
 await until(()=>lib.store.read(r.job)?.status==='needs_input');assert.deepEqual(ran,['source','window','build','checkBuild','describe','cast']);
 assert.equal(lib.store.status(r.job).questions[0].id,'cast');assert.equal(q.read(r.request).status,'needs_input');
 ran.length=0;const r2=q.start({request:r.request,answers:{cast:{A:'A'}}});await until(()=>lib.store.read(r2.job)?.status==='done');
 assert.deepEqual(ran,['cast','beats','lead','cut','keys','contact','checkFinal','handover','deliver']);assert.equal(lib.store.status(r2.job).result.package,'pk');
 ran.length=0;const r3=q.start({request:r.request,redo:'keys'});await until(()=>lib.store.read(r3.job)?.status==='done');assert.deepEqual(ran,['keys','contact','checkFinal','handover','deliver']);
}));

test('delivery writes the task, upload steps and prompt, and a second delivery writes -v2 with what changed',()=>temp(async dir=>{
 const {deliver}=await import('../authoring/depth-deliver.mjs');const pk=join(dir,'packs','pk');await mkdir(pk,{recursive:true});
 for(const f of ['depth.mp4','key-1-depth.jpg','key-1-source.jpg','key-2-depth.jpg','key-2-source.jpg','key-2-contact.jpg','lead.png'])await writeFile(join(pk,f),f);
 const P={name:'Test',duration:4,depth:'depth.mp4',people:[{name:'A',color:'blue'},{name:'B',color:'orange'}],shots:[{index:1,start:0,end:.5,camera:'held'},{index:2,start:.5,end:4,camera:'from below: the blue figure held up'}],
  beats:[{actor:'B',verb:'lifts',target:'A',contact:"B's hand at A's throat",start:0,end:4}],keyframes:[{time:.15,shot:1,depthStill:'key-1-depth.jpg',sourceStill:'key-1-source.jpg'},{time:1,shot:2,depthStill:'key-2-depth.jpg',sourceStill:'key-2-source.jpg',contactStill:'key-2-contact.jpg'}],derivedFrom:{lead:{seconds:.5,image:join(pk,'lead.png')}}};
 await writeFile(join(pk,'package.json'),JSON.stringify(P));let rev=3;
 const lib={packs:join(dir,'packs'),pack:id=>id==='pk'?JSON.parse(String(readFileSync(join(pk,'package.json')))):null,rev:()=>rev};
 const castFn=async()=>({keyframeGeneration:[{index:1,time:.15,given:true,references:[]},{index:2,time:1,previous:{index:1},beat:{n:1,of:1,actor:'B',verb:'lifts',target:'A'},references:[{role:'depth still',file:join(pk,'key-2-depth.jpg')},{role:'keyframe 1, the first frame (given): continuity',file:'keyframe-1.png (yours)'},{role:'character sheets',file:'yours'}],prompt:'Keyframe 2 prompt'}],videoGeneration:{}});
 const to=join(dir,'project'),cast={A:'Macbeth: battle-worn',B:'Macduff: in armour'};
 const r=await deliver({lib,castFn,pkg:'pk',to,cast,style:'soft painting',sheets:{Macbeth:'sheets/macbeth.png'}});
 assert.equal(r.version,1);assert.deepEqual(r.keyframesToMake.map(k=>k.id),['K2']);
 const prompt=String(readFileSync(join(to,'generation-prompt-v1.txt')));assert.match(prompt,/blue=Macbeth @Image1,orange=Macduff/);assert.match(prompt,/@Image2 is the first frame/);assert.match(prompt,/1s @Image3/);assert.match(prompt,/0-0\.5s: As @Image2, held\./);assert.match(prompt,/From below: Macbeth held up\. Macduff lifts Macbeth; contact: Macduff's hand at Macbeth's throat\./);
 const task=String(readFileSync(join(to,'TASK-v1.md')));assert.match(task,/### K1 — 0\.15 s: given/);assert.match(task,/`references\/package-v1\/first-frame\.png` \(the first frame, given\)/);assert.match(task,/Save as `references\/keyframes\/K2-v1\.png`/);
 assert.ok(existsSync(join(to,'references/package-v1/key-2-contact.jpg')));assert.match(String(readFileSync(join(to,'upload-steps-v1.md'))),/never for the video model/);
 await writeFile(join(pk,'key-2-depth.jpg'),'changed');rev=4;const r2=await deliver({lib,castFn,pkg:'pk',to,cast});
 assert.equal(r2.version,2);assert.ok(r2.changes.includes('revision 3 → 4'));assert.ok(r2.changes.includes('key-2-depth.jpg changed'));assert.ok(existsSync(join(to,'TASK-v2.md'))&&existsSync(join(to,'TASK-v1.md')));
}));

test('search ranks by fit, then by what worked: a person\'s stars and a used take lift a fitting package, not an unfitting one',()=>temp(async dir=>{
 const pk=(id,summary,camera)=>({name:id,summary,duration:4,people:[{name:'A',color:'blue',represents:'a man'},{name:'B',color:'orange',represents:'a knight'}],shots:[{index:1,start:0,end:4,camera}],beats:[{actor:'B',verb:'lifts',target:'A',start:0,end:4}],keyframes:[]});
 for(const [id,P] of Object.entries({proven:pk('proven','The knight lifts the man by the throat','from below'),plain:pk('plain','The knight lifts the man by the throat','from below'),other:pk('other','Two men talk by a fire','still, wide')})){await mkdir(join(dir,'.authoring/video-clay',id),{recursive:true});await writeFile(join(dir,'.authoring/video-clay',id,'package.json'),JSON.stringify(P));}
 await mkdir(join(dir,'.authoring/depth-library'),{recursive:true});await writeFile(join(dir,'.authoring/depth-library/ratings.json'),JSON.stringify({proven:{stars:5,why:'used',by:'Tim'},other:{stars:5,why:'x',by:'Tim'}}));
 await mkdir(join(dir,'.authoring/video-clay/proven/reviews/take-1'),{recursive:true});await writeFile(join(dir,'.authoring/video-clay/proven/reviews/take-1/review.json'),JSON.stringify({label:'take-1',verdict:'used',reviewed:'2026-10-25T10:00:00'}));
 process.env.STUDIO_JOBS_DIR=join(dir,'jobs');const lib=new DepthLibrary(dir);
 const r=lib.find({beat:'lifted by the throat, camera low'});assert.deepEqual(r.map(x=>x.package),['proven','plain']);assert.ok(r[0].score>r[1].score);assert.equal(r[0].results.used,1);assert.match(r[0].why.join(' '),/1 take used/);
 assert.ok(!r.some(x=>x.package==='other'),'5 stars do not make an unfitting package a match');
 const q=lib.find({beat:'two men talk by the fire'});assert.equal(q[0].package,'other');
}));

test('the clip proposer grows a short fast shot into the quick cuts around it, and stops at a long or calm shot',()=>{
 const sh=(i,s,e,on,move)=>({index:i,start:s,end:e,seconds:+(e-s).toFixed(2),control:on?'on':'off',move,travel:0,camera:on?.4:0,why:on?['camera moves']:['people in place, camera holds']});
 const rows=[sh(1,0,3,false,.01),sh(2,3,4.5,false,.15),sh(3,4.5,5.4,true,.7),sh(4,5.4,6.6,false,.1),sh(5,6.6,12,false,.2),sh(6,12,17,true,.6)];  // shots 4-5 last 6.6 s: too long to bridge 3 and 6
 const r=spawnSync('.authoring/vision-venv/bin/python',['-c',`import sys,json;sys.path.insert(0,'authoring/render');from depth_propose import propose,entries;print(json.dumps(entries(propose(json.load(sys.stdin)),'t')))`],{input:JSON.stringify(rows),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);const c=JSON.parse(r.stdout).filter(x=>x.kind==='control');
 assert.deepEqual(c.map(x=>x.shots),[[2,3,4],[6]]);  // shot 1 is calm, shot 5 too long: both stop the growth; shot 6 is long enough on its own
 assert.match(c[0].why.join(' '),/grown: the action around a short shot/);assert.equal(c[0].start,3);assert.equal(c[0].end,6.6);
});

test('a fix renames the description\'s letters: a swap, a drop, a later undo, and shots that disagree', () => {
 const shots=[{index:5,start:0,end:2},{index:6,start:2,end:4}];
 const desc={summary:'s',labels:['still'],people:{A:'a guard',E:'Littlefinger',B:'Cersei'},keyframes:[{time:.15,people:{A:'walks',E:'stands'}},{time:3,people:{A:'walks',B:'watches'}}]};
 const both={5:{A:'E',E:'A'},6:{A:'E',E:'A'}};let r=renameDescription(desc,{},both,shots);
 assert.equal(r.changed,true);assert.equal(r.note,null);assert.deepEqual(r.description.people,{B:'Cersei',E:'a guard',A:'Littlefinger'});assert.deepEqual(r.description.keyframes[0].people,{E:'walks',A:'stands'});
 assert.deepEqual(renameDescription(r.description,both,{},shots).description.people,desc.people);  // undoing the fix puts the letters back
 assert.equal(renameDescription(desc,both,both,shots).changed,false);  // the same set again changes nothing
 r=renameDescription(desc,{},{6:{A:'-'}},shots);assert.deepEqual(r.description.keyframes[1].people,{B:'watches'});assert.deepEqual(r.description.keyframes[0].people,desc.keyframes[0].people);
 assert.match(r.note,/differs by shot/);assert.deepEqual(r.description.people,desc.people);  // A is gone in shot 6 only: the clip-wide text is left
});

test('a fix may follow a person through a shot from a box (ARROW); bad entries are refused', () => {
 assert.doesNotThrow(()=>checkFixes({},[],[{name:'A',shot:'27',time:3.05,box:[0,.16,.41,.94]}]));
 assert.doesNotThrow(()=>checkFixes({},[]));  // follow is optional
 assert.doesNotThrow(()=>checkFixes({},[],[{name:'A',shot:'27',keys:[{time:3.05,box:[0,.16,.41,.94]},{time:5,box:[.1,.2,.5,1]}]}]));  // seeded again later in the shot
 for(const bad of [[{name:'a',shot:'27',time:1,box:[0,0,.5,1]}],[{name:'A',shot:'x',time:1,box:[0,0,.5,1]}],[{name:'A',shot:'27',box:[0,0,.5,1]}],[{name:'A',shot:'27',time:1,box:[.5,0,.4,1]}],[{name:'A',shot:'27',keys:[]}],[{name:'A',shot:'27',keys:[{time:1,box:[0,0,.5]}]}],{}])
  assert.throws(()=>checkFixes({},[],bad),/follow:/);
});
