import {createServer} from 'node:http';
import {readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {inspectBundle} from './reconstruction/bundle.mjs';
import {checkFixes} from './depth-library.mjs';
import {Studio,toolDefinitions} from './core.js';
const root=fileURLToPath(new URL('../',import.meta.url)),studio=new Studio(root,process.env.STUDIO_STATE_PATH||undefined);
const port=Number(process.env.STUDIO_PORT||5174);
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
   const base=resolve(root,'.authoring/video-clay'),list=[];let names=[];try{names=await readdir(base);}catch{}
   for(const id of names.sort()){if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))continue;try{list.push({...JSON.parse(await readFile(resolve(base,id,'package.json'),'utf8')),id});}catch{}}
   return json(200,list);
  }
  if(req.method==='GET'&&path==='/api/depth-library'){
   // The depth shot library (docs/DEPTH_LIBRARY_PLAN.md): each source ingested by depth-ingest.py, with the built packages
   // (.authoring/video-clay) that were cut from the same video file.
   const base=resolve(root,'.authoring/depth-library'),pk=resolve(root,'.authoring/video-clay'),sources=[],packs=[];let names=[],pnames=[];try{names=await readdir(base);}catch{}try{pnames=await readdir(pk);}catch{}
   for(const id of pnames.sort()){if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))continue;try{const p=JSON.parse(await readFile(resolve(pk,id,'package.json'),'utf8'));packs.push({id,name:p.name,sourceVideo:p.sourceVideo,start:p.start,end:p.start+p.duration,keyframes:p.keyframes.length,depth:!!p.depth,thumb:p.keyframes[0]?.depthStill??p.keyframes[0]?.clayStill,scene:p.scene??null});}catch{}}
   for(const id of names.sort()){if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))continue;try{const s=JSON.parse(await readFile(resolve(base,id,'source.json'),'utf8'));delete s.file;sources.push({...s,packages:packs.filter(p=>p.sourceVideo===s.fileName)});}catch{}}
   return json(200,{sources,unlinked:packs.filter(p=>!sources.some(s=>s.fileName===p.sourceVideo))});
  }
  if(req.method==='GET'&&path==='/api/depth-library-file'){
   // Streams only a shot thumbnail or the overview sheet of an ingested source.
   const id=url.searchParams.get('source')||'',file=url.searchParams.get('file')||'';if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)||!/^(shot-\d{3}|overview)\.jpg$/.test(file))return json(404,{error:'Not a library file'});
   let bytes;try{bytes=await readFile(resolve(root,'.authoring/depth-library',id,file));}catch{return json(404,{error:'No such file'});}
   res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':bytes.length});return res.end(bytes);
  }
  if(req.method==='POST'&&path==='/api/depth-library/fix'){
   // Fixes by hand to a built clip, shot by shot: who each person found is (joins and splits), or drop; tint and package again (depth-fix.py, seconds).
   if(!req.headers['content-type']?.startsWith('application/json'))throw Error('Expected application/json');
   let body='';for await(const c of req){body+=c;if(body.length>100000)throw Error('Request too large');}
   const {source,clip,shots={},boxes=[]}=JSON.parse(body),ok=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(x);if(!ok(source)||!ok(clip))return json(400,{error:'source and clip'});
   try{checkFixes(shots,boxes);}catch(e){return json(400,{error:e.message});}
   await writeFile(resolve(root,'.authoring/depth-library',source,clip+'.fixes.json'),JSON.stringify({shots,boxes}));
   const out=await new Promise(done=>execFile(resolve(root,'.authoring/vision-venv/bin/python'),['authoring/render/depth-fix.py',source,clip],{cwd:root,timeout:300000},(e,so,se)=>done(e?{error:(se||e.message).slice(-1500)}:JSON.parse(so.trim().split('\n').pop()))));
   return json(out.error?400:200,out);
  }
  if(req.method==='GET'&&path==='/api/video-clay-file'){
   // Streams only the clay video or a keyframe still that a package names.
   const id=url.searchParams.get('id')||'',file=url.searchParams.get('file')||'';if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))return json(404,{error:'No such package'});
   const dir=resolve(root,'.authoring/video-clay',id);let pkg;try{pkg=JSON.parse(await readFile(resolve(dir,'package.json'),'utf8'));}catch{return json(404,{error:'No such package'});}
   const named=new Set([pkg.clay,pkg.depth,...pkg.keyframes.flatMap(k=>[k.clayStill,k.sourceStill,k.depthStill])].filter(Boolean));if(!named.has(file)||file.includes('/'))return json(404,{error:'Not a file of this package'});
   const full=resolve(dir,file),info=await stat(full),type=file.endsWith('.mp4')?'video/mp4':'image/jpeg';
   const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||''),first=match?Number(match[1]):0,last=Math.min(info.size-1,match&&match[2]?Number(match[2]):info.size-1);if(first>last||first>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});return res.end();}
   res.writeHead(match?206:200,{'Content-Type':type,'Accept-Ranges':'bytes','Content-Length':last-first+1,...(match?{'Content-Range':`bytes ${first}-${last}/${info.size}`}:{})});
   return createReadStream(full,{start:first,end:last}).on('error',()=>res.destroy()).pipe(res);
  }
  if(req.method==='GET'&&path==='/api/tools')return json(200,toolDefinitions);
  if(req.method==='POST'&&path==='/api/tool'){
   if(origin===undefined&&req.headers['content-type']!=='application/json')throw Error('Expected application/json');
   if(!req.headers['content-type']?.startsWith('application/json'))throw Error('Expected application/json');
   let body='';for await(const c of req){body+=c;if(body.length>128000000)throw Error('Request exceeds 128 MB');}
   const {name,arguments:args}=JSON.parse(body);return json(200,{result:await studio.call(name,args,req.headers['x-studio-transport']==='cli'?'cli':'mcp')});
  }
  if(req.method==='GET'&&path==='/'){res.writeHead(302,{Location:'/editor/'});return res.end();}
  if(req.method==='GET'&&files[path]){const [file,type]=files[path];res.writeHead(200,{'Content-Type':type});res.end(await readFile(resolve(root,file)));return;}
  json(404,{error:'Unknown route'});
 }catch(e){json(400,{error:e.message});}
});
server.listen(port,'127.0.0.1',()=>console.error(`Animation authoring service: http://127.0.0.1:${port}/editor/`));
