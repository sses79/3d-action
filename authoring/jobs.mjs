// Jobs kept on disk (docs/DEPTH_SERVICE_PLAN.md, step 1): .authoring/jobs/<id>.json, so a job outlives the request that started it
// and the service's restarts. Work runs one at a time in a queue (Depth Anything, SAM and the depth scripts each fill the Mac);
// a job that was running when the service stopped is marked failed on the next start, with that reason. Any process may read a job
// by its ID from the folder (the service's bundle and server.mjs each load this module).
import {readFileSync,writeFileSync,readdirSync,existsSync,mkdirSync,renameSync,unlinkSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
const ID=/^[a-z][a-z0-9_-]{2,63}$/;
const stores=new Map();
export class JobStore{
 static at(dir){return stores.get(dir)??(stores.set(dir,new JobStore(dir)),stores.get(dir));}
 constructor(dir){this.dir=dir;this.live=new Map();this.queue=[];this.busy=false;mkdirSync(dir,{recursive:true});this.recover();}
 file(id){return resolve(this.dir,id+'.json');}
 save(j){const f=this.file(j.id),t=f+'.tmp';writeFileSync(t,JSON.stringify(j,null,1));renameSync(t,f);return j;}
 read(id){if(typeof id!=='string'||!ID.test(id))return null;const j=this.live.get(id);if(j)return j;try{return JSON.parse(readFileSync(this.file(id),'utf8'));}catch{return null;}}
 // jobs left queued or running by a service that has stopped: their work died with it
 recover(){for(const f of readdirSync(this.dir).filter(f=>f.endsWith('.json'))){try{const j=JSON.parse(readFileSync(resolve(this.dir,f),'utf8'));if((j.status==='queued'||j.status==='running')&&j.pid!==process.pid&&!alive(j.pid)){j.error='The service stopped while this job was '+j.status+'; run it again.';j.status='failed';j.finishedAt=new Date().toISOString();this.save(j);}}catch{}}
  this.prune();}
 // keep the folder small: done and failed jobs older than 14 days go
 prune(){const old=Date.now()-14*864e5;for(const f of readdirSync(this.dir).filter(f=>f.endsWith('.json'))){try{const p=resolve(this.dir,f);if(statSync(p).mtimeMs<old){const j=JSON.parse(readFileSync(p,'utf8'));if(j.status==='done'||j.status==='failed')unlinkSync(p);}}catch{}}}
 // a job record for work already running (a call that outlasted its wait): it is not queued, it is followed
 follow(kind,meta,promise){const j=this.save({id:newId(kind),kind,...meta,status:'running',pid:process.pid,startedAt:new Date().toISOString(),log:'',result:null,error:null});this.live.set(j.id,j);
  promise.then(r=>{j.status='done';j.result=r;},e=>{j.status='failed';j.error=String(e?.message??e).slice(-2000);}).finally(()=>{j.finishedAt=new Date().toISOString();this.save(j);this.live.delete(j.id);});return j;}
 // queue work: run(job, log, step) returns a promise of the result; log(text) keeps the last 4000 characters and step(name) says where it is;
 // a result with needsInput ends the job as needs_input, with its questions (the work is carried on by a new job once answered)
 enqueue(kind,meta,run){const j=this.save({id:newId(kind),kind,...meta,status:'queued',pid:process.pid,queuedAt:new Date().toISOString(),log:'',result:null,error:null});this.live.set(j.id,j);this.queue.push({j,run});this.next();return j;}
 next(){if(this.busy||!this.queue.length)return;const {j,run}=this.queue.shift();this.busy=true;j.status='running';j.startedAt=new Date().toISOString();this.save(j);
  let saved=0;const log=t=>{j.log=(j.log+t).slice(-4000);if(Date.now()-saved>2000){saved=Date.now();this.save(j);}},step=s=>{j.step=s;this.save(j);};
  Promise.resolve().then(()=>run(j,log,step)).then(r=>{if(r&&r.needsInput){j.status='needs_input';j.questions=r.questions;j.result=r;}else{j.status='done';j.result=r??null;}},e=>{j.status='failed';j.error=String(e?.message??e).slice(-2000);}).finally(()=>{j.finishedAt=new Date().toISOString();this.save(j);this.live.delete(j.id);this.busy=false;this.next();});}
 status(id){const j=this.read(id);if(!j)throw Error('No such job: '+id);const {pid,...o}=j;return {...o,log:j.status==='running'?String(j.log??'').slice(-600):undefined,position:j.status==='queued'?this.queue.findIndex(q=>q.j.id===id)+1||undefined:undefined};}
 summary(){const all=readdirSync(this.dir).filter(f=>f.endsWith('.json')).map(f=>{try{return JSON.parse(readFileSync(resolve(this.dir,f),'utf8'));}catch{return null;}}).filter(Boolean),by={};for(const j of all)by[j.status]=(by[j.status]??0)+1;
  return {counts:by,running:all.filter(j=>j.status==='running').map(j=>({id:j.id,kind:j.kind,step:j.step??null,startedAt:j.startedAt})),queued:this.queue.length};}
}
const newId=kind=>String(kind).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/^(?![a-z])/,'job-')+'-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const alive=pid=>{if(!pid)return false;try{process.kill(pid,0);return true;}catch{return false;}};
// A write lock on a package folder, across processes (the service's bundle and server.mjs each write packages): a lock file made
// exclusively; one older than 15 minutes, or left by a process that has gone, is taken over.
export async function withLock(dir,fn,waitMs=600000){mkdirSync(dir,{recursive:true});const f=resolve(dir,'.lock'),t0=Date.now();
 for(;;){try{writeFileSync(f,JSON.stringify({pid:process.pid,at:Date.now()}),{flag:'wx'});break;}catch(e){if(e.code!=='EEXIST')throw e;
  try{const l=JSON.parse(readFileSync(f,'utf8'));if(Date.now()-l.at>15*60000||!alive(l.pid)){unlinkSync(f);continue;}}catch{try{unlinkSync(f);}catch{}continue;}
  if(Date.now()-t0>waitMs)throw Error('The package is busy with another write; try again');await new Promise(r=>setTimeout(r,250));}}
 try{return await fn();}finally{try{unlinkSync(f);}catch{}}}
