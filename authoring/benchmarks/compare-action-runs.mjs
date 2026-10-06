// Scripted end-to-end recipe benchmark; no LLM reasoning or browser review is timed.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {request,runPlan} from '../cli-lib.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),base=process.env.STUDIO_URL||'http://127.0.0.1:5174';
const out=resolve(process.argv[2]||'/private/tmp/studio-action-comparison');await mkdir(out,{recursive:true});
const child=spawn(process.execPath,['authoring/mcp.mjs'],{cwd:root,env:{...process.env,STUDIO_URL:base},stdio:['pipe','pipe','inherit']});
const pending=new Map();let next=0;createInterface({input:child.stdout}).on('line',line=>{const m=JSON.parse(line);pending.get(m.id)?.(m);pending.delete(m.id);});
function rpc(method,params){const id=++next;return new Promise((done,reject)=>{const timer=setTimeout(()=>reject(Error('MCP timeout')),120000);pending.set(id,m=>{clearTimeout(timer);if(m.error||m.result?.isError)reject(Error(JSON.stringify(m)));else done(m);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
async function mcp(name,args){const start=performance.now(),reply=await rpc('tools/call',{name,arguments:args});return {result:JSON.parse(reply.result.content[0].text),clientElapsedMs:Math.round((performance.now()-start)*100)/100};}
async function cli(plan,index){const input=resolve(out,'plan-'+index+'.json'),output=resolve(out,'cli-'+index+'.json');await writeFile(input,JSON.stringify(plan));const began=performance.now();const process=spawn(globalThis.process.execPath,['authoring/cli.mjs','batch',input,'--full','--out',output],{cwd:root,env:{...globalThis.process.env,STUDIO_URL:base},stdio:['ignore','ignore','pipe']});let error='';process.stderr.on('data',x=>error+=x);await new Promise((done,reject)=>{process.on('error',reject);process.on('exit',code=>code===0?done():reject(Error(error)));});const elapsed=performance.now()-began;return {...JSON.parse(await readFile(output,'utf8')),processElapsedMs:Math.round(elapsed*100)/100};}
function plan(kind,revision){const id='benchmark-'+kind+'-counter';const movements=['move-counter-ready','move-counter-guard','move-counter-right-cross','move-counter-finish'];return {prompt:'Scripted '+kind.toUpperCase()+' comparison: raise a defensive guard, hold briefly, counterattack and recover. Reviewed source recipe; excludes LLM selection and visual review.',actionId:id,steps:[
 {name:'list_movements',arguments:{},as:'catalog'},
 ...movements.map((movementId,i)=>({name:'get_movement',arguments:{movementId},as:'source-'+i})),
 {name:'compose_action',arguments:{actionId:id,name:'Benchmark · '+kind.toUpperCase()+' counter',expectedRevision:revision,steps:movements.map((movementId,i)=>({movementId,revision:{$ref:'source-'+i+'.revision'},speed:1,transition:[0,.24,.04,.08][i]}))},as:'compiled'},
 ...[.40,.78,1.706].map((time,i)=>({name:'get_diagnostics',arguments:{actionId:id,time},as:'check-'+i})),
 {name:'set_preview',arguments:{actionId:id,time:.78,playing:false,loop:false,view:'current',camera:'Front'},as:'preview'},
 {name:'get_action',arguments:{actionId:id},as:'baked'}]};}
function digest(report){const action=report.steps.find(s=>s.as==='baked').result.action;const {id,name,...motion}=action;return createHash('sha256').update(JSON.stringify(motion)).digest('hex');}
const results=[];try{
 await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'action-run-comparison',version:'1'}});child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const revisions={};for(const kind of ['cli','mcp']){try{revisions[kind]=(await request(base,'get_action',{actionId:'benchmark-'+kind+'-counter'})).result.revision;}catch(e){if(!e.message.includes('Unknown action ID'))throw e;revisions[kind]=0;}}
 for(let trial=1;trial<=3;trial++)for(const kind of trial%2?['mcp','cli']:['cli','mcp']){const report=kind==='cli'?await cli(plan(kind,revisions[kind]),trial):await runPlan(plan(kind,revisions[kind]),mcp);revisions[kind]++;const row={trial,transport:kind,runId:report.runId,clientElapsedMs:report.clientElapsedMs,processElapsedMs:report.processElapsedMs??null,serviceElapsedMs:report.serviceElapsedMs,steps:report.steps.length,motionHash:digest(report)};results.push(row);console.log(JSON.stringify(row));}
 const summary={measuredAt:new Date().toISOString(),results,identicalMotion:new Set(results.map(r=>r.motionHash)).size===1,notes:'Three alternating paired trials; each includes source discovery/read, compile/save, three diagnostics, preview and full action read, plus tracked begin/finish. CLI process time includes startup; persistent MCP amortizes initialization. No LLM selection, desktop dispatch or visual review time included. Two separate benchmark actions; originals unchanged.'};await writeFile(resolve(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({identicalMotion:summary.identicalMotion,summary:resolve(out,'summary.json')}));
 if(!summary.identicalMotion)throw Error('Transport outputs differ');
}finally{child.kill();}
