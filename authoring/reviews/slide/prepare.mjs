import {request} from '../../cli-lib.mjs';import {writeFile} from 'node:fs/promises';
const call=(n,a)=>request('http://127.0.0.1:5174',n,a),dir='authoring/reviews/slide';
const {result:run}=await call('begin_action_run',{prompt:'Expand movement contracts to the available locomotion slide family: inspect Slide Start, Loop and Exit, review their joins, and create a contract-based preview.'});
const {result:caps}=await call('get_capabilities',{}),{result:movements}=await call('list_movements',{});
const {result:library}=await call('inspect_movement_library',{query:'slide',limit:20});const sources={},reports={},matches={};
for(const s of ['start','loop','exit']){const id='move-ual2-slide-'+s;const {result:m}=await call('get_movement',{movementId:id});sources[id]={revision:m.revision,action:m.action,metadata:m.metadata,profile:m.profile};reports[id]=(await call('inspect_motion_quality',{actionId:id,sourceRevision:m.revision})).result;matches[id]=(await call('find_movement_connections',{movementId:id,sourceRevision:m.revision})).result;}
await writeFile(dir+'/inputs.json',JSON.stringify({at:new Date().toISOString(),runId:run.id,library,sources,reports,matches},null,2)+'\n');
const cases=Object.entries(reports).map(([id,r])=>[id,Array.from({length:9},(_,i)=>r.window.end*i/8)]);
await writeFile(dir+'/capture-cases.json',JSON.stringify(cases,null,2)+'\n');
console.log(JSON.stringify({runId:run.id,sources:Object.entries(reports).map(([id,r])=>({id,duration:r.window.end,contacts:r.candidateContacts,travel:r.travel,flags:r.diagnostics})),matchKeys:Object.fromEntries(Object.entries(matches).map(([id,m])=>[id,Object.keys(m)]))}));
