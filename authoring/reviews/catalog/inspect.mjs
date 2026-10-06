import {request} from '../../cli-lib.mjs';import {writeFile,mkdir} from 'node:fs/promises';
const dir='authoring/reviews/catalog',call=(n,a)=>request('http://127.0.0.1:5174',n,a);
const {result:runs}=await call('list_action_runs',{});if(runs.some(r=>r.status==='running'))throw Error('An authoring run is already active; inspect before starting');
const {result:run}=await call('begin_action_run',{prompt:'Finish contracts for the full active movement library: inspect remaining UAL2 sources, classify observed purpose/roles/equipment, review available contacts and semantically justified joins; preserve uncertain support and exact source pins.'});
const {result:capabilities}=await call('get_capabilities',{}),{result:movements}=await call('list_movements',{}),items=[];
for(const m of movements.filter(m=>m.id.startsWith('move-ual2-'))){
 const {result:p}=await call('get_movement',{movementId:m.id});const {result:r}=await call('inspect_motion_quality',{actionId:m.id,sourceRevision:p.revision});
 const compact={id:m.id,name:p.action.name,revision:p.revision,motionHash:r.motionHash,metadata:p.metadata,profile:p.profile,duration:r.window.end,report:r};items.push(compact);
 await writeFile(dir+'/'+m.id+'.json',JSON.stringify(compact,null,2)+'\n');
}
await writeFile(dir+'/inventory.json',JSON.stringify({at:new Date().toISOString(),runId:run.id,allMovements:movements.map(m=>({id:m.id,name:m.name,revision:m.revision})),items},null,2)+'\n');
const remaining=items.filter(m=>!m.id.includes('sword-regular-')&&!m.id.includes('slide-'));
for(let start=0;start<remaining.length;start+=12){const batch=remaining.slice(start,start+12);const cases=batch.map(m=>{const times=new Set(Array.from({length:7},(_,i)=>m.duration*i/6));for(const c of m.report.candidateContacts)for(const t of [c.start,(c.start+c.end)/2,c.end])times.add(t);return [m.id,[...times].sort((a,b)=>a-b).slice(0,30)];});await writeFile(dir+'/capture-'+Math.floor(start/12)+'.json',JSON.stringify(cases,null,2)+'\n');}
console.log(JSON.stringify({runId:run.id,allMovements:movements.length,sources:items.length,remaining:remaining.length,contacts:items.reduce((n,m)=>n+m.report.candidateContacts.length,0),flagged:items.filter(m=>m.report.diagnostics.length).map(m=>({id:m.id,flags:m.report.diagnostics.map(d=>d.code)}))}));
