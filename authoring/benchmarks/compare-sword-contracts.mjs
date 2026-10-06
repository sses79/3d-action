// Live end-to-end source selection/check/build comparison; does not overwrite originals.
import {request,output} from '../cli-lib.mjs';
const base=process.env.STUDIO_URL||'http://127.0.0.1:5174';
const call=(n,a)=>request(base,n,a);
const prompt='Continue the Regular Sword attack chain and finish its authored recovery.';
const {result:run}=await call('begin_action_run',{prompt});
try{
 const selectionStarted=performance.now();const {result:library}=await call('inspect_movement_library',{query:'sword-regular',limit:20});
 const {result:actions}=await call('list_actions',{});const selectionTotalMs=performance.now()-selectionStarted;
 const step=s=>{const m=library.items.find(m=>m.id==='move-ual2-sword-regular-'+s);if(!m)throw Error('Sync UAL2 Standard first');return {movementId:m.id,revision:m.revision,speed:1};};
 const cases=[{id:'sword-source-study',name:'Sword · Authored Combo',steps:[step('combo')]},{id:'sword-joined-study',name:'Sword · Joined A → B → C',steps:[step('a'),{...step('b'),connection:{contractId:'regular-a-to-b',duration:.12}},{...step('c'),connection:{contractId:'regular-b-to-c',duration:.12}}]}];
 const results=[];
 for(const c of cases){const spec={schemaVersion:1,rig:'quaternius-ual1',...c,intent:prompt},expectedRevision=actions.find(a=>a.id===c.id)?.revision??0;const checked=await call('build_action_spec',{spec,expectedRevision,commit:false});const built=await call('build_action_spec',{spec,expectedRevision,commit:true});results.push({id:c.id,validationClientMs:checked.clientElapsedMs,buildClientMs:built.clientElapsedMs,...built.result});}
 await call('set_preview',{actionId:'sword-joined-study',time:0,playing:false,loop:false,camera:'Orbit'});
 await call('append_action_run_event',{runId:run.id,phase:'comparison',note:'Created whole-source and A/B/C studies. Each build committed once, sources unchanged. Visual inspection still pending; elapsed values include compilation and project persistence, not LLM planning.'});
 await output({at:new Date().toISOString(),prompt,runId:run.id,selectionTotalMs,results},'authoring/benchmarks/sword-contract-builds.json',true);
 console.log(JSON.stringify({runId:run.id,results:results.map(r=>({id:r.id,duration:r.duration,buildClientMs:r.buildClientMs,inspection:r.receipt.inspection}))}));
}catch(e){await call('finish_action_run',{runId:run.id,status:'failed',note:e.message.slice(0,2000)});throw e;}
