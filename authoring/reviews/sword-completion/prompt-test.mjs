import {request} from '../../cli-lib.mjs';import {writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const dir='authoring/reviews/sword-completion',call=(n,a)=>request('http://127.0.0.1:5174',n,a),prompt='Perform two linked sword attacks, then smoothly recover to standing.',id='sword-two-hit-recover';
const began=performance.now(),{result:run}=await call('begin_action_run',{prompt,actionId:id});
try {
 const calls=[];const invoke=async(name,args)=>{const reply=await call(name,args);calls.push({name,clientElapsedMs:reply.clientElapsedMs});return reply.result;};
 const library=await invoke('inspect_movement_library',{query:'sword-regular',limit:20}),actions=await invoke('list_actions',{});
 const step=s=>{const m=library.items.find(m=>m.id==='move-ual2-sword-regular-'+s);if(!m)throw Error('Missing movement');return {movementId:m.id,revision:m.revision,speed:1};};
 const spec={schemaVersion:1,rig:'quaternius-ual1',id,name:'Sword · Two attacks → Recover',intent:prompt,steps:[step('a'),{...step('b'),connection:{contractId:'regular-a-to-b',duration:.06}},{...step('b-rec'),connection:{contractId:'regular-b-to-b-rec',duration:.12}}]},expectedRevision=actions.find(a=>a.id===id)?.revision??0;
 await invoke('append_action_run_event',{runId:run.id,phase:'selection',note:'Use A→B→B Rec for two attacks then standing recovery. Exact saved A→B .06s and B→B Rec .12s policies,1× speeds,no anchor. Complete Combo includes a third attack and would not satisfy this test prompt. No source preparation/joint editing needed.'});
 const checked=await invoke('build_action_spec',{spec,expectedRevision,commit:false});assert.equal(checked.valid,true);assert.ok(checked.receipt.seamPolicies.every(p=>p.decision==='supported'&&p.matchesConfiguration));
 const built=await invoke('build_action_spec',{spec,expectedRevision,commit:true});const report=await invoke('inspect_motion_quality',{actionId:id,sourceRevision:built.revision});assert.equal(report.diagnostics.length,0);
 await invoke('set_preview',{actionId:id,time:0,playing:false,loop:false,camera:'Side',speed:1});
 await invoke('append_action_run_event',{runId:run.id,phase:'inspection',note:'Single build succeeded with both exact supported seam configurations; full-action deterministic inspection reports no configured flags. Whole action sampled Front/Side visual check and browser replay pending. No confirmed contact intervals in these attack/recovery sources.'});
 const output={at:new Date().toISOString(),prompt,runId:run.id,calls,automatedStageClientMs:performance.now()-began,built,report,wholeActionVisualReview:'pending'};
 await writeFile(dir+'/prompt-test.json',JSON.stringify(output,null,2)+'\n');
 const times=new Set(Array.from({length:9},(_,i)=>report.window.end*i/8));for(const w of built.receipt.inspection.slice(1))for(const t of [w.joinStart,(w.joinStart+w.start)/2,w.start])times.add(t);
 await writeFile(dir+'/prompt-capture-cases.json',JSON.stringify([[id,[...times].sort((a,b)=>a-b)]],null,2)+'\n');
 console.log(JSON.stringify({runId:run.id,id,automatedStageClientMs:output.automatedStageClientMs,duration:built.duration,seams:built.receipt.seamPolicies,flags:report.diagnostics}));
} catch(e){await call('finish_action_run',{runId:run.id,status:'failed',note:e.message.slice(0,2000)});throw e;}
