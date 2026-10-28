// Downloads from smovie (/Users/tim/Yun/s-movie, a yt-dlp queue) taken in by themselves (docs/DEPTH_SERVICE_PLAN.md, "Intake from smovie").
// With STUDIO_INTAKE set to smovie's address (the launchd agent sets http://127.0.0.1:8787), the service asks smovie once a minute for
// finished jobs with options.purpose "depth" or "action" and takes each in once: the file is hardlinked (same disk; else fetched over
// HTTP) to .authoring/downloads/<smovie job>.mp4, so it outlives smovie deleting the job; then, with studio.window and studio.scene,
// make_depth_reference (a package for that window, stopping with needs_input as usual), otherwise ingest_source_video (shots and
// proposed clips; choosing and describing clips stays with a person or an agent). Where it came from (url, title, uploader, job) is
// kept on the source as origin. A video whose content is already a source is not taken in again. Under 10 GB free on the disk it
// waits. The ledger is .authoring/intake.json (smovie job -> what was done); a failed one is tried again only after it is removed there.
import {readFileSync,writeFileSync,renameSync,existsSync,mkdirSync,linkSync,copyFileSync,statfsSync,createReadStream,createWriteStream,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
const REQUEST=['window','scene','cast','style','duration','beats','people','lead','deliverTo','sound'];  // studio fields passed to make_depth_reference
export class Intake{
 constructor(root,call,{url=process.env.STUDIO_INTAKE,data=process.env.SMOVIE_DATA_DIR||'/Users/tim/Yun/s-movie/data',token=process.env.SMOVIE_TOKEN,minFree=10*2**30}={}){
  this.root=root;this.call=call;this.url=String(url).replace(/\/$/,'');this.data=data;this.token=token;this.minFree=minFree;this.file=resolve(root,'.authoring/intake.json');this.busy=false;}
 ledger(){try{return JSON.parse(readFileSync(this.file,'utf8'));}catch{return {jobs:{}};}}
 save(L){const t=this.file+'.tmp';writeFileSync(t,JSON.stringify(L,null,1));renameSync(t,this.file);}
 start(every=60000){const tick=()=>this.tick().catch(e=>console.error('intake:',e.message));setTimeout(tick,5000);this.timer=setInterval(tick,every);this.timer.unref?.();return this;}
 async get(path){const r=await fetch(this.url+path,{headers:this.token?{Authorization:'Bearer '+this.token}:{}});if(!r.ok)throw Error(`smovie ${path}: ${r.status}`);return r;}
 async tick(){if(this.busy)return;this.busy=true;try{
  const L=this.ledger();await this.refresh(L);
  const done=await (await this.get('/api/jobs?status=done&limit=200')).json();
  for(const j of done.filter(j=>['depth','action'].includes(j.options?.purpose)&&!L.jobs[j.id]).reverse()){
   if(statfsSync(this.root).bavail*statfsSync(this.root).bsize<this.minFree){L.waiting=`under ${this.minFree/2**30} GB free on the disk: ${done.length} finished downloads wait`;break;}
   delete L.waiting;L.jobs[j.id]={url:j.url,title:j.title,purpose:j.options.purpose,at:new Date().toISOString(),status:'taking'};this.save(L);
   try{L.jobs[j.id]={...L.jobs[j.id],...await this.take(j)};}catch(e){L.jobs[j.id]={...L.jobs[j.id],status:'failed',error:String(e.message).slice(-600)};}
   this.save(L);}
  this.save(L);}finally{this.busy=false;}}
 async take(j){const st=j.options.studio??{},dir=resolve(this.root,'.authoring/downloads'),video=resolve(dir,j.id+'.mp4'),have=new Set(this.sources().map(S=>S.id));mkdirSync(dir,{recursive:true});let id=st.id;
  if(!id){const b=slug(j.title||j.id);id=b;for(let n=2;have.has(id);n++)id=`${b.slice(0,44)}-${n}`;}  // from the title, numbered when taken
  if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))throw Error('studio.id: lower-case letters, digits and dashes');
  if(!existsSync(video)){const here=resolve(this.data,'downloads',j.id,j.filename);
   if(existsSync(here)){try{linkSync(here,video);}catch{copyFileSync(here,video);}}  // the same disk: no second copy
   else{const t=video+'.part';await pipeline(Readable.fromWeb((await this.get(`/api/jobs/${j.id}/file`)).body),createWriteStream(t));renameSync(t,video);}}
  const origin={url:j.url,platform:j.platform,title:j.title,uploader:j.uploader,smovieJob:j.id,downloaded:j.finished_at},rights=st.rights??`${j.platform} download (${j.uploader??'unknown uploader'}) through smovie; rights not stated`;
  const sha=await hash(video),same=this.sources().find(S=>S.sha256===sha);
  if(st.window&&st.scene){const r=await this.call('make_depth_reference',{video,id,rights,...Object.fromEntries(REQUEST.filter(k=>st[k]!==undefined).map(k=>[k,st[k]]))});return {status:'started',kind:'make_depth_reference',video,source:same?.id??id,studioJob:r.job??null,request:r.request??null,origin};}
  if(same){this.origin(same.id,origin);return {status:'done',kind:'already a source',video,source:same.id,origin};}
  const r=await this.call('ingest_source_video',{video,id,name:(st.name??j.title??id).slice(0,120),rights});return {status:'started',kind:'ingest_source_video',video,source:id,studioJob:r.job??null,origin};}
 // a started one: its job's outcome, and the origin written on the new source
 async refresh(L){for(const [k,e] of Object.entries(L.jobs)){if(e.status!=='started'||!e.studioJob)continue;let j;try{j=await this.call('get_depth_job',{job:e.studioJob});}catch{continue;}
   if(j.status==='done'||j.status==='needs_input'){e.status=j.status;if(this.sources().some(S=>S.id===e.source))this.origin(e.source,e.origin);if(j.status==='needs_input')e.questions=(j.questions??[]).length;}
   else if(j.status==='failed'){e.status='failed';e.error=String(j.error??'').slice(-600);}}}
 sources(){const base=resolve(this.root,'.authoring/depth-library'),out=[];try{for(const d of require_dirs(base)){try{out.push(JSON.parse(readFileSync(resolve(base,d,'source.json'),'utf8')));}catch{}}}catch{}return out;}
 origin(id,o){const f=resolve(this.root,'.authoring/depth-library',id,'source.json');try{const S=JSON.parse(readFileSync(f,'utf8'));if(S.origin)return;S.origin=o;writeFileSync(f,JSON.stringify(S,null,1));}catch{}}
 status(){const L=this.ledger(),c={};for(const e of Object.values(L.jobs))c[e.status]=(c[e.status]??0)+1;return {from:this.url,counts:c,waiting:L.waiting??null};}
}
const require_dirs=base=>readdirSync(base,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name);
const slug=t=>String(t).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'')||'download';
const hash=f=>new Promise((ok,fail)=>{const h=createHash('sha256');createReadStream(f).on('data',d=>h.update(d)).on('end',()=>ok(h.digest('hex'))).on('error',fail);});
