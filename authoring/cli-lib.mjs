import {readFile,writeFile} from 'node:fs/promises';
export function resolveRefs(value,results){
 if(Array.isArray(value))return value.map(v=>resolveRefs(v,results));
 if(value&&typeof value==='object'){
  if(Object.keys(value).length===1&&typeof value.$ref==='string'){
   const keys=value.$ref.split('.');let result=results;
   for(const key of keys){if(['__proto__','constructor','prototype'].includes(key)||!result||!Object.hasOwn(result,key))throw Error('Unknown reference: '+value.$ref);result=result[key];}
   return structuredClone(result);
  }
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolveRefs(v,results)]));
 }return value;
}
export function validatePlan(plan){
 if(!plan||typeof plan.prompt!=='string'||!plan.prompt.trim()||plan.prompt.length>8000||!Array.isArray(plan.steps)||!plan.steps.length||plan.steps.length>64)throw Error('Plan requires prompt and 1–64 steps');
 if(plan.finish!==undefined&&typeof plan.finish!=='boolean')throw Error('finish must be a boolean');
 const aliases=new Set();for(const step of plan.steps){if(!step||typeof step.name!=='string'||!step.arguments||typeof step.arguments!=='object'||Array.isArray(step.arguments)||typeof step.as!=='string'||!/^[-a-z0-9]{1,48}$/.test(step.as)||aliases.has(step.as)||['__proto__','constructor','prototype'].includes(step.as)||['begin_action_run','finish_action_run','append_action_run_event'].includes(step.name))throw Error('Invalid step or duplicate alias');aliases.add(step.as);}
}
export async function readJson(path){if(path!=='-')return JSON.parse(await readFile(path,'utf8'));let text='';for await(const chunk of process.stdin)text+=chunk;return JSON.parse(text);}
export function compact(value){
 if(Array.isArray(value))return value.map(compact);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,['tracks','joints','poseSpeed','rootHeight','history','manifest'].includes(key)?{omitted:true,count:Array.isArray(v)?v.length:undefined}:compact(v)]));
}
export async function request(base,name,args,transport='cli'){
 if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Use a loopback Studio URL');
 const began=performance.now();const response=await fetch(base+'/api/tool',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Transport':transport},body:JSON.stringify({name,arguments:args}),signal:AbortSignal.timeout(120000)});
 const body=await response.json();if(!response.ok)throw Error(body.error||'Studio request failed');if(body.result?.valid===false){const error=Error(JSON.stringify(body.result.diagnostics));error.diagnostics=body.result.diagnostics;throw error;}return {result:body.result,clientElapsedMs:Math.round((performance.now()-began)*100)/100};
}
export async function runPlan(plan,call){
 validatePlan(plan);const began=performance.now(),results=Object.create(null),steps=[];const {result:run}=await call('begin_action_run',{prompt:plan.prompt,...(plan.actionId?{actionId:plan.actionId}:{})});
 try{
  for(const step of plan.steps){const args=resolveRefs(step.arguments,results);const reply=await call(step.name,args);results[step.as]=reply.result;steps.push({name:step.name,as:step.as,clientElapsedMs:reply.clientElapsedMs,result:reply.result});}
  if(plan.finish===false){const {result:active}=await call('get_action_run',{runId:run.id});return {status:'awaiting-review',runId:run.id,actionId:plan.actionId??null,clientElapsedMs:Math.round((performance.now()-began)*100)/100,serviceElapsedMs:active.toolElapsedMs,steps};}
  const {result:finished}=await call('finish_action_run',{runId:run.id,status:'completed',note:'Scripted workflow completed; automatic checks are separate from human visual review.',...(plan.actionId?{actionId:plan.actionId}:{})});
  return {status:'completed',runId:run.id,actionId:plan.actionId??null,clientElapsedMs:Math.round((performance.now()-began)*100)/100,serviceElapsedMs:finished.toolElapsedMs,steps};
 }catch(error){let closeError;try{await call('finish_action_run',{runId:run.id,status:'failed',note:String(error.message).slice(0,2000)});}catch(e){closeError=e.message;}const report={status:'failed',runId:run.id,error:error.message,closeError,completedSteps:steps.length,clientElapsedMs:Math.round((performance.now()-began)*100)/100,steps};error.report=report;throw error;}
}
export async function output(value,path,full=false){const text=JSON.stringify(full?value:compact(value),null,2)+'\n';if(path)await writeFile(path,text);else process.stdout.write(text);}
