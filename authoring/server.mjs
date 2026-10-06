import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {inspectBundle} from './reconstruction/bundle.mjs';
import {Studio,toolDefinitions} from './core.js';
const root=fileURLToPath(new URL('../',import.meta.url)),studio=new Studio(root,process.env.STUDIO_STATE_PATH||undefined);
const port=Number(process.env.STUDIO_PORT||5174);
const origins=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:5173','http://localhost:5173']);
const files={'/editor/':['editor/index.html','text/html'],'/editor/app.js':['editor/app.js','text/javascript'],'/editor/style.css':['editor/style.css','text/css'],'/editor/assets/character.glb':['editor/assets/character.glb','model/gltf-binary']};
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
