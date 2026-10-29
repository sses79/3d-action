import {createServer} from 'node:http';
import {readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {createReadStream,createWriteStream,mkdirSync,renameSync,unlinkSync,existsSync as exists} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {JobStore} from './jobs.mjs';
import {inspectBundle} from './reconstruction/bundle.mjs';
import {checkFixes,DepthLibrary,starStandard} from './depth-library.mjs';
import {Studio,toolDefinitions} from './core.js';
import {Intake} from './intake.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),studio=new Studio(root,process.env.STUDIO_STATE_PATH||undefined);
const intake=process.env.STUDIO_INTAKE?new Intake(root,(name,args)=>studio.call(name,args,'cli')).start():null;  // downloads from smovie taken in by themselves (authoring/intake.mjs)
const port=Number(process.env.STUDIO_PORT||5174);
// Health (docs/DEPTH_SERVICE_PLAN.md, step 1): the version running, the job queue, and whether what the jobs need is there. A bundle
// (authoring/core.js) or a library file newer than this process means a rebuild that has not been restarted into.
process.env.STUDIO_JOBS_DIR??=process.env.STUDIO_STATE_PATH?resolve(dirname(process.env.STUDIO_STATE_PATH),'jobs'):resolve(root,'.authoring/jobs');  // one jobs folder for the server and the bundle's depth library
const jobs=()=>JobStore.at(process.env.STUDIO_JOBS_DIR);
const started=Date.now(),version=await new Promise(r=>execFile('git',['rev-parse','--short','HEAD'],{cwd:root},(e,so)=>r(e?null:so.trim())));let mini=null;
async function health(){const exists=async f=>{try{await stat(resolve(root,f));return true;}catch{return false;}},newer=async f=>{try{return (await stat(resolve(root,f))).mtimeMs>started;}catch{return false;}};
 if(!mini||Date.now()-mini.at>60000)mini={at:Date.now(),up:await new Promise(r=>execFile('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=3','tim@mini4.local','true'],{timeout:6000},e=>r(!e)))};
 const stale=[];for(const f of ['authoring/core.js','authoring/depth-library.mjs','authoring/jobs.mjs','authoring/server.mjs'])if(await newer(f))stale.push(f);
 return {ok:!stale.length,version,pid:process.pid,node:process.version,startedAt:new Date(started).toISOString(),uptimeSeconds:Math.round((Date.now()-started)/1000),
  restartNeeded:stale.length?{changed:stale,note:'These files changed after the service started: restart it (npm run deploy:authoring).'}:null,
  jobs:jobs().summary(),intake:intake?.status()??null,
  workers:await (async()=>{try{const L=(await readFile(resolve(root,'.authoring/logs/workers.jsonl'),'utf8')).trim().split('\n').slice(-50).map(l=>JSON.parse(l)),by={};for(const e of L){const b=by[e.where]??={runs:0,seconds:0,frames:0};b.runs++;b.seconds+=e.seconds;b.frames+=e.frames;}
   return {recent:L.slice(-5).reverse(),last50:Object.fromEntries(Object.entries(by).map(([w,b])=>[w,{runs:b.runs,secondsPerFrame:+(b.seconds/Math.max(1,b.frames)).toFixed(3)}])),fallbacks:L.filter(e=>/failed/.test(e.note??'')).length};}catch{return null;}})(),
  checks:{visionPython:await exists('.authoring/vision-venv/bin/python'),comfyui:await exists('.authoring/comfyui/.venv/bin/python'),openRouterKey:!!(process.env.OPENROUTER_API_KEY||process.env.OPENROUTER_ENV_FILE&&await exists(process.env.OPENROUTER_ENV_FILE)),mini4:mini.up}};}
const origins=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:5173','http://localhost:5173']);
const files={'/editor/':['editor/index.html','text/html'],'/editor/app.js':['editor/app.js','text/javascript'],'/editor/clay.html':['editor/clay.html','text/html'],'/editor/clay.js':['editor/clay.js','text/javascript'],'/editor/depth.html':['editor/depth.html','text/html'],'/editor/depth.js':['editor/depth.js','text/javascript'],'/editor/style.css':['editor/style.css','text/css'],'/editor/assets/character.glb':['editor/assets/character.glb','model/gltf-binary'],'/editor/assets/characters/superhero-female.glb':['editor/assets/characters/superhero-female.glb','model/gltf-binary'],'/editor/assets/characters/superhero-male.glb':['editor/assets/characters/superhero-male.glb','model/gltf-binary']};
const server=createServer(async(req,res)=>{
 const host=req.headers.host;if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)){res.writeHead(403);res.end();return;}
 const origin=req.headers.origin;if(origin&&!origins.has(origin)){res.writeHead(403);res.end();return;}
 if(origin)res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Studio-Transport');res.writeHead(204);res.end();return;}
 const url=new URL(req.url,`http://${host}`),path=url.pathname;
 const json=(status,v)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(v));};
 try{
  if(req.method==='GET'&&path==='/api/state'){if(url.searchParams.get('since')===String(studio.state.sequence)){res.writeHead(204);res.end();return;}return json(200,studio.viewerSnapshot());}
  if(req.method==='GET'&&path==='/api/runs')return json(200,studio.logs.list(url.searchParams.get('actionId')||undefined));
  if(req.method==='GET'&&path==='/api/run')return json(200,studio.logs.get(url.searchParams.get('id')));
  if(req.method==='GET'&&path.startsWith('/api/video-review/')){
   const base=resolve(root,'authoring/reviews/video/kick-reference/bundle'),file=path.slice('/api/video-review/'.length);
   const allowed=new Set(['bundle.json','reference.json','action.json','reference.mp4']);if(!allowed.has(file))return json(404,{error:'Unknown review artifact'});
   inspectBundle(resolve(base,'bundle.json'));const bytes=await readFile(resolve(base,file));
   const type=file.endsWith('.mp4')?'video/mp4':'application/json';res.setHeader('Content-Type',type);
   if(file.endsWith('.mp4')&&req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match)return json(416,{error:'Invalid range'});const start=Number(match[1]),end=Math.min(bytes.length-1,match[2]?Number(match[2]):bytes.length-1);if(start>end||start>=bytes.length){res.writeHead(416,{'Content-Range':`bytes */${bytes.length}`});return res.end();}res.writeHead(206,{'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':end-start+1});return res.end(bytes.subarray(start,end+1));}
   res.writeHead(200,{'Accept-Ranges':'bytes','Content-Length':bytes.length});return res.end(bytes);
  }
  if(req.method==='GET'&&path==='/api/character-file'){
   // Streams only a file registered as a character (register_character), and only while its size is as registered.
   const id=url.searchParams.get('id'),c=Object.hasOwn(studio.state.characters??{},id)?studio.state.characters[id]:null;if(!c)return json(404,{error:'No such registered character'});let info;try{info=await stat(c.file);}catch{return json(404,{error:'The character file is no longer at '+c.file});}if(info.size!==c.bytes)return json(409,{error:'The character file has changed since it was registered'});
   res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':info.size});return createReadStream(c.file).pipe(res);
  }
  if(req.method==='GET'&&path==='/api/video-source'){
   // Streams only a file the service itself linked to an action, and only while that file is unchanged.
   const id=url.searchParams.get('actionId'),source=Object.hasOwn(studio.state.actions,id)?studio.state.actions[id].videoSource:null;if(!source)return json(404,{error:'No source video is linked to this action'});
   let info;try{info=await stat(source.file);}catch{return json(404,{error:'The linked source video is no longer at '+source.file});}
   if(info.size!==source.bytes||info.mtimeMs!==source.modifiedMs)return json(409,{error:'The linked source video has changed since it was linked'});
   const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||''),first=match?Number(match[1]):0,last=Math.min(info.size-1,match&&match[2]?Number(match[2]):info.size-1);if(first>last||first>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});return res.end();}
   res.writeHead(match?206:200,{'Content-Type':/\.webm$/i.test(source.file)?'video/webm':'video/mp4','Accept-Ranges':'bytes','Content-Length':last-first+1,...(match?{'Content-Range':`bytes ${first}-${last}/${info.size}`}:{})});
   return createReadStream(source.file,{start:first,end:last}).on('error',()=>res.destroy()).pipe(res);
  }
  if(req.method==='GET'&&path==='/api/video-clay'){
   // Video-to-clay packages (authoring/render/video-clay-pack.py): one folder each under .authoring/video-clay with a package.json.
   const base=resolve(root,'.authoring/video-clay'),list=[],revs=new DepthLibrary(root);let names=[];try{names=await readdir(base);}catch{}
   for(const id of names.sort()){if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))continue;try{list.push({...JSON.parse(await readFile(resolve(base,id,'package.json'),'utf8')),id,revision:revs.rev(id)});}catch{}}
   return json(200,list);
  }
  if(req.method==='GET'&&path==='/api/depth-library'){
   // The depth shot library (docs/DEPTH_LIBRARY_PLAN.md): each source ingested by depth-ingest.py, with the built packages
   // (.authoring/video-clay) that were cut from the same video file.
   const base=resolve(root,'.authoring/depth-library'),pk=resolve(root,'.authoring/video-clay'),sources=[],packs=[];let names=[],pnames=[];try{names=await readdir(base);}catch{}try{pnames=await readdir(pk);}catch{}
   for(const id of pnames.sort()){if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))continue;try{const p=JSON.parse(await readFile(resolve(pk,id,'package.json'),'utf8'));packs.push({id,name:p.name,sourceVideo:p.derivedFrom?.sourceVideo??p.sourceVideo,start:p.start,end:p.start+p.duration,keyframes:p.keyframes.length,depth:!!p.depth,thumb:p.keyframes[0]?.depthStill??p.keyframes[0]?.clayStill,scene:p.scene??null,summary:p.summary??null});}catch{}}
   for(const id of names.sort()){if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))continue;try{const s=JSON.parse(await readFile(resolve(base,id,'source.json'),'utf8'));delete s.file;sources.push({...s,packages:packs.filter(p=>p.sourceVideo===s.fileName)});}catch{}}
   const lib=new DepthLibrary(root);for(const p of packs){p.stars=lib.stars(p.id,null);p.status=lib.statusOf(p.id);const rv=lib.reviews(p.id);p.results=rv.length;p.used=rv.filter(r=>r.verdict==='used').length;}
   for(const S of sources)for(const C of S.clips){const sm=lib.summary(S,C);C.stars=sm.stars;C.starsSuggested=sm.starsSuggested;C.bestPackage=sm.bestPackage;C.needsControlNow=sm.needsControl;C.controlWhy=sm.controlWhy;}
   return json(200,{sources,unlinked:packs.filter(p=>!sources.some(s=>s.fileName===p.sourceVideo)),starStandard});
  }
  if(req.method==='GET'&&path==='/api/depth-library-file'){
   // Streams only a shot thumbnail or the overview sheet of an ingested source.
   const id=url.searchParams.get('source')||'',file=url.searchParams.get('file')||'';if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)||!/^(shot-\d{3}|overview)\.jpg$/.test(file))return json(404,{error:'Not a library file'});
   let bytes;try{bytes=await readFile(resolve(root,'.authoring/depth-library',id,file));}catch{return json(404,{error:'No such file'});}
   res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':bytes.length});return res.end(bytes);
  }
  if(req.method==='GET'&&(path==='/api/depth-scene'||path==='/api/depth-scene-file')){
   // A clip's 3D scene (build_depth_scene): its latest job (running or not) and its latest finished result; the file route streams that
   // result's check sheet or scene video only.
   const clip=url.searchParams.get('clip')||'';if(!/^[a-z0-9][a-z0-9-]{1,40}$/.test(clip))return json(404,{error:'Not a clip'});
   const dir=new DepthLibrary(root).store.dir,jobs=[];for(const f of await readdir(dir).catch(()=>[]))if(f.startsWith('depth-scene-')&&f.endsWith('.json')){try{const j=JSON.parse(await readFile(resolve(dir,f),'utf8'));if(j.clip===clip)jobs.push(j);}catch{}}
   jobs.sort((a,b)=>String(a.queuedAt).localeCompare(String(b.queuedAt)));const last=jobs.at(-1),done=jobs.filter(j=>j.status==='done'&&j.result).at(-1);
   if(path==='/api/depth-scene')return json(200,{job:last?{id:last.id,status:last.status,step:last.step??null,error:last.error,queuedAt:last.queuedAt,finishedAt:last.finishedAt??null,log:last.status==='running'?String(last.log??'').trim().split('\n').pop():undefined}:null,result:done?{...done.result,people:undefined,finishedAt:done.finishedAt}:null});
   const file=url.searchParams.get('file')||'',full=file==='check.jpg'?resolve(root,'.authoring/depth-scene',clip,'check.jpg'):file==='scene.mp4'&&done?.result?.video?resolve(done.result.video):null;
   if(!full||!full.startsWith(resolve(root,'.authoring')+'/'))return json(404,{error:'Not a scene file'});let info;try{info=await stat(full);}catch{return json(404,{error:'Not made yet'});}
   const type=file.endsWith('.mp4')?'video/mp4':'image/jpeg',match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||''),first=match?Number(match[1]):0,last2=Math.min(info.size-1,match&&match[2]?Number(match[2]):info.size-1);if(first>last2||first>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});return res.end();}
   res.writeHead(match?206:200,{'Content-Type':type,'Accept-Ranges':'bytes','Content-Length':last2-first+1,'Cache-Control':'no-store',...(match?{'Content-Range':`bytes ${first}-${last2}/${info.size}`}:{})});
   return createReadStream(full,{start:first,end:last2}).on('error',()=>res.destroy()).pipe(res);
  }
  if(req.method==='POST'&&path==='/api/depth-library/fix'){
   // Fixes by hand to a built clip, shot by shot: who each person found is (joins and splits), or drop; tint and package again (depth-fix.py, seconds).
   if(!req.headers['content-type']?.startsWith('application/json'))throw Error('Expected application/json');
   let body='';for await(const c of req){body+=c;if(body.length>100000)throw Error('Request too large');}
   const {source,clip,shots={},boxes=[],follow=[],findMissed=false,expectedRevision}=JSON.parse(body),ok=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(x);if(!ok(source)||!ok(clip))return json(400,{error:'source and clip'});
   try{checkFixes(shots,boxes,follow);}catch(e){return json(400,{error:e.message});}
   try{return json(200,await new DepthLibrary(root).fix({clip,shots,boxes,follow,findMissed,expectedRevision}));}catch(e){return json(/^stale:/.test(e.message)?409:400,{error:e.message});}  // the library's fix: the package's lock and revision
  }
  if(req.method==='POST'&&path==='/api/depth-upload'){
   // A video added from the Depth library page: streamed to .authoring/depth-library/uploads/, then ingested as a job (shots, control,
   // proposed clips). The same video already in the library (by SHA-256) is not ingested again: its source is returned instead.
   const name=String(url.searchParams.get('name')||'').slice(0,120),file=String(url.searchParams.get('file')||'video.mp4'),rights=url.searchParams.get('rights')||undefined;
   const ext=(file.match(/\.(mp4|mov|m4v|mkv|webm)$/i)||[])[1];if(!ext)return json(400,{error:'A video file: .mp4, .mov, .m4v, .mkv or .webm'});
   const size=Number(req.headers['content-length']||0);if(!size)return json(411,{error:'Content-Length needed'});if(size>4e9)return json(413,{error:'Up to 4 GB'});
   const lib=new DepthLibrary(root),dir=resolve(root,'.authoring/depth-library/uploads');mkdirSync(dir,{recursive:true});
   const slug=(name||file.replace(/\.[^.]+$/,'')).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,36)||'video';
   const tmp=resolve(dir,`.upload-${Date.now()}.${ext.toLowerCase()}`),h=createHash('sha256');let got=0;
   try{await new Promise((ok,fail)=>{const w=createWriteStream(tmp);req.on('data',c=>{got+=c.length;h.update(c);});req.on('error',fail);w.on('error',fail);w.on('finish',ok);req.pipe(w);});}catch(e){try{unlinkSync(tmp);}catch{}return json(400,{error:'Upload broke off: '+e.message});}
   if(got!==size){try{unlinkSync(tmp);}catch{}return json(400,{error:`Upload incomplete (${got} of ${size} bytes)`});}
   const sha=h.digest('hex'),same=lib.sameAs(sha);if(same){unlinkSync(tmp);return json(200,{existing:true,source:same.id,name:same.name});}
   let id=slug;for(let n=2;lib.sources().some(S=>S.id===id)||exists(resolve(root,'.authoring/depth-library',id));n++)id=`${slug}-${n}`;
   const dest=resolve(dir,`${id}.${ext.toLowerCase()}`);renameSync(tmp,dest);
   try{const r=lib.ingest({video:dest,id,name:name||file.replace(/\.[^.]+$/,''),rights});return json(200,{existing:false,source:id,job:r.job,file:dest,bytes:got});}catch(e){return json(400,{error:e.message});}
  }
  if(req.method==='GET'&&path==='/api/depth-packages'){
   // Every package with what worked (docs/DEPTH_SERVICE_PLAN.md, step 5): status, stars, takes and the last one, deliveries.
   const lib=new DepthLibrary(root),srcs=lib.sources(),out=[];let names=[];try{names=await readdir(resolve(root,'.authoring/video-clay'));}catch{}
   for(const id of names.sort()){if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))continue;const P=lib.pack(id);if(!P)continue;const sv=P.derivedFrom?.sourceVideo??P.sourceVideo,S=srcs.find(x=>x.fileName===sv),clip=S?.clips.find(c=>c.package===id);
    out.push({id,name:P.name??id,source:S?.id??null,clip:clip?.id??null,seconds:P.duration,from:P.derivedFrom?.package??null,lead:!!P.derivedFrom?.lead,beats:P.beats?.length??0,summary:P.summary??clip?.description?.summary??null,
     status:lib.statusOf(id),stars:lib.stars(id,null),results:lib.results(id),deliveries:lib.deliveries(id),revision:lib.rev(id),thumb:P.keyframes[0]?.depthStill??null});}
   return json(200,out);
  }
  if(req.method==='GET'&&path==='/api/depth-package-extras'){
   // A package's status and the results reviewed against it (review_depth_result), for the Depth library page.
   const id=url.searchParams.get('id')||'';if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))return json(404,{error:'No such package'});const lib=new DepthLibrary(root);if(!lib.pack(id))return json(404,{error:'No such package'});
   return json(200,{status:lib.statusOf(id),reviews:lib.reviews(id).map(({result,sha256,...r})=>({...r,original:result}))});
  }
  if(req.method==='GET'&&path==='/api/video-clay-review-file'){
   // A reviewed result's sheet or video copy (reviews/<label>/sheet.jpg, result.mp4).
   const id=url.searchParams.get('id')||'',label=url.searchParams.get('label')||'',file=url.searchParams.get('file')||'';
   if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)||!/^[a-z0-9][a-z0-9-]{0,39}$/.test(label)||!['sheet.jpg','result.mp4'].includes(file))return json(404,{error:'Not a review file'});
   const full=resolve(root,'.authoring/video-clay',id,'reviews',label,file);let info;try{info=await stat(full);}catch{return json(404,{error:'Not made'});}
   const type=file.endsWith('.mp4')?'video/mp4':'image/jpeg',range=req.headers.range&&/bytes=(\d*)-(\d*)/.exec(req.headers.range);
   if(range&&type==='video/mp4'){const a=range[1]?+range[1]:0,z=range[2]?Math.min(+range[2],info.size-1):info.size-1;res.writeHead(206,{'Content-Type':type,'Content-Range':`bytes ${a}-${z}/${info.size}`,'Accept-Ranges':'bytes','Content-Length':z-a+1,'Cache-Control':'no-store'});createReadStream(full,{start:a,end:z}).pipe(res);return;}
   res.writeHead(200,{'Content-Type':type,'Content-Length':info.size,'Accept-Ranges':'bytes','Cache-Control':'no-store'});createReadStream(full).pipe(res);return;
  }
  if(req.method==='GET'&&path==='/api/video-clay-file'){
   // Streams only the clay video or a keyframe still that a package names.
   const id=url.searchParams.get('id')||'',file=url.searchParams.get('file')||'';if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))return json(404,{error:'No such package'});
   const dir=resolve(root,'.authoring/video-clay',id);let pkg;try{pkg=JSON.parse(await readFile(resolve(dir,'package.json'),'utf8'));}catch{return json(404,{error:'No such package'});}
   const named=new Set([pkg.clay,pkg.depth,'check.json','check.jpg',...pkg.keyframes.flatMap(k=>[k.clayStill,k.sourceStill,k.depthStill,k.contactStill])].filter(Boolean));if(!named.has(file)||file.includes('/'))return json(404,{error:'Not a file of this package'});
   const full=resolve(dir,file);let info;try{info=await stat(full);}catch{return json(404,{error:'Not made yet'});}const type=file.endsWith('.mp4')?'video/mp4':file.endsWith('.json')?'application/json':'image/jpeg';
   const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||''),first=match?Number(match[1]):0,last=Math.min(info.size-1,match&&match[2]?Number(match[2]):info.size-1);if(first>last||first>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});return res.end();}
   res.writeHead(match?206:200,{'Content-Type':type,'Accept-Ranges':'bytes','Content-Length':last-first+1,...(match?{'Content-Range':`bytes ${first}-${last}/${info.size}`}:{})});
   return createReadStream(full,{start:first,end:last}).on('error',()=>res.destroy()).pipe(res);
  }
  if(req.method==='GET'&&path==='/api/tools')return json(200,toolDefinitions);
  if(req.method==='POST'&&path==='/api/tool'){
   if(origin===undefined&&req.headers['content-type']!=='application/json')throw Error('Expected application/json');
   if(!req.headers['content-type']?.startsWith('application/json'))throw Error('Expected application/json');
   let body='';for await(const c of req){body+=c;if(body.length>128000000)throw Error('Request exceeds 128 MB');}
   // a call that outlasts its wait (240 s by default, under the 300 s a fetch waits for its answer; async: true waits 0) is answered
   // with a job ID and goes on as a job kept on disk (authoring/jobs.mjs), read with get_depth_job
   const {name,arguments:args,async:now,wait}=JSON.parse(body),ms=now===true?0:Number.isFinite(wait)?Math.max(0,Math.min(wait,280))*1000:Number(process.env.STUDIO_SYNC_WAIT_MS||240000);
   const work=studio.call(name,args,req.headers['x-studio-transport']==='cli'?'cli':'mcp');let timer;const late=Symbol();
   const first=now===true?late:await Promise.race([work,new Promise(r=>{timer=setTimeout(()=>r(late),ms);})]).finally(()=>clearTimeout(timer));
   if(first!==late)return json(200,{result:first});
   const job=jobs().follow('tool-'+name,{tool:name},work);return json(200,{result:{job:job.id,status:'running',tool:name,note:'Still running: poll get_depth_job with this job ID for the result.'}});
  }
  if(req.method==='GET'&&path==='/api/health')return json(200,await health());
  if(req.method==='GET'&&path==='/'){res.writeHead(302,{Location:'/editor/'});return res.end();}
  if(req.method==='GET'&&files[path]){const [file,type]=files[path];res.writeHead(200,{'Content-Type':type});res.end(await readFile(resolve(root,file)));return;}
  json(404,{error:'Unknown route'});
 }catch(e){json(400,{error:e.message});}
});
server.listen(port,'127.0.0.1',()=>console.error(`Animation authoring service: http://127.0.0.1:${port}/editor/`));
