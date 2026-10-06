import {request} from '../../cli-lib.mjs';
import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:5174',call=(n,a)=>request(base,n,a),dir='authoring/reviews/sword-completion';
const {result:runs}=await call('list_action_runs',{});if(runs.some(r=>r.status==='running'))throw Error('Inspect active run before starting');
const {result:run}=await call('begin_action_run',{prompt:'Finish the Regular Sword contact and recovery-join review; compare blend timings against the authored Combo.'});
const {result:capabilities}=await call('get_capabilities',{});
const {result:library}=await call('inspect_movement_library',{query:'sword-regular',limit:20});
const {result:actions}=await call('list_actions',{});
const sources={},reports={};
for(const m of library.items){const source=(await call('get_movement',{movementId:m.id})).result;sources[m.id]={revision:source.revision,action:source.action,metadata:source.metadata};reports[m.id]=(await call('inspect_motion_quality',{actionId:m.id,sourceRevision:m.revision})).result;}
await writeFile(dir+'/inputs.json',JSON.stringify({at:new Date().toISOString(),runId:run.id,library,sources,reports},null,2)+'\n');
const step=s=>{const m=library.items.find(m=>m.id==='move-ual2-sword-regular-'+s);return {movementId:m.id,revision:m.revision,speed:1};};
const results=[];
for(const [id,from,to,contractId] of [['sword-a-recovery-review','a','a-rec','regular-a-to-a-rec'],['sword-b-recovery-review','b','b-rec','regular-b-to-b-rec']]) {
 const spec={schemaVersion:1,rig:'quaternius-ual1',id,name:from.toUpperCase()+' · Attack to recovery',intent:'Inspect authored Sword attack release into its dedicated recovery.',steps:[step(from),{...step(to),connection:{contractId,duration:.12}}]};
 const expectedRevision=actions.find(a=>a.id===id)?.revision??0;
 await call('build_action_spec',{spec,expectedRevision,commit:false});
 const built=(await call('build_action_spec',{spec,expectedRevision,commit:true})).result;
 const report=(await call('inspect_motion_quality',{actionId:id,sourceRevision:built.revision})).result;
 results.push({id,contractId,built,report});
}
await writeFile(dir+'/recovery-builds.json',JSON.stringify({runId:run.id,results},null,2)+'\n');
await call('append_action_run_event',{runId:run.id,phase:'measurement',note:'Measured all six current Sword sources and created separate A→A Rec/B→B Rec inspection actions. Existing movements and studies unchanged. Visual review and transient timing sweep pending.'});
console.log(JSON.stringify({runId:run.id,sources:Object.entries(reports).map(([id,r])=>({id,contacts:r.candidateContacts})),recoveries:results.map(r=>({id:r.id,contract:r.contractId,seams:r.report.seams,flags:r.report.diagnostics}))}));
