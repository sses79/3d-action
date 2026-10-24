// The service that stays up (docs/DEPTH_SERVICE_PLAN.md, step 1): jobs on disk, recovery after a stop, package locks and revisions,
// a long call answered with a job, /api/health.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {JobStore,withLock} from '../authoring/jobs.mjs';
import {DepthLibrary} from '../authoring/depth-library.mjs';
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
