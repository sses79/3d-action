import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {Studio} from '../authoring/core.js';
import {inspectLibrary,manifest,resolveSpec,validateContractData} from '../authoring/contracts.mjs';
const catalog=JSON.parse(readFileSync('authoring/contracts/ual2-standard.json'));
const library=JSON.parse(readFileSync('runtime/ual2-library.json'));
const makeState=()=>({actions:Object.fromEntries(library.movements.filter(m=>m.action.id.includes('sword-regular-')).map(m=>[m.action.id,{category:'movement',revision:1,action:m.action,metadata:m.metadata,reference:m.action,history:[]}]))});
const step=s=>({movementId:'move-ual2-sword-regular-'+s,revision:1,speed:1});
const spec=(steps=[step('combo')])=>({schemaVersion:1,rig:'quaternius-ual1',id:'sword-contract-study',name:'Sword contract study',intent:'Continue attacks and recover',steps});
test('43 source manifests distinguish whole combos and recovery, without claiming verified contact',()=>{assert.equal(catalog.movements.length,43);assert.deepEqual(validateContractData(catalog),[]);const state=makeState(),items=inspectLibrary(state,{query:'sword-regular',limit:20}).items;assert.equal(items.length,6);assert.deepEqual(items.find(m=>m.id.endsWith('-combo')).roles,['source-sequence']);assert.deepEqual(items.find(m=>m.id.endsWith('-a-rec')).roles,['recovery']);const a=items.find(m=>m.id.endsWith('-a'));assert.deepEqual(a.connections.map(c=>c.purpose),['continue','recover']);assert.equal(a.measurements,null);assert.equal(a.source.matchesOriginal,true);assert.equal(a.semantics.review,'candidate');assert.ok(a.unknowns.includes('support intervals'));});
test('strict specs reject unknown fields, missing connections, stale pins and over-limit sequences',()=>{const state=makeState();for(const bad of [{...spec(),unexpected:1},spec([step('a'),step('b')]),spec([{...step('a'),revision:2}]),spec([{...step('combo'),speed:.5}]),spec([{...step('a'),speed:NaN}])])assert.equal(resolveSpec(state,bad,0,false).valid,false);assert.equal(resolveSpec(state,spec(),0,false).valid,true);const joined=spec([step('a'),{...step('b'),connection:{contractId:'regular-a-to-b',duration:.12}}, {...step('c'),connection:{contractId:'regular-b-to-c',duration:.12}}]);assert.equal(resolveSpec(state,joined,0,false).valid,true);const changed=structuredClone(state);changed.actions[step('a').movementId].action.phases[0].intent='Edited';assert.ok(resolveSpec(changed,joined,0,false).diagnostics.some(d=>d.code==='connection/stale'));assert.deepEqual(manifest(step('a').movementId,changed.actions[step('a').movementId]).roles,['unclassified']);});
test('build stage checks without writing, commits once with receipts, reloads, and failed revisions preserve action',async()=>{const dir=mkdtempSync(join(tmpdir(),'studio-contract-'));try{const s=new Studio(process.cwd(),join(dir,'project.json'));Object.assign(s.state.actions,makeState().actions);let writes=0;const persist=s.persist.bind(s);s.persist=()=>{writes++;persist();};const checked=await s.call('build_action_spec',{spec:spec(),expectedRevision:0,commit:false});assert.equal(checked.valid,true);assert.equal(writes,0);assert.equal(s.state.actions[spec().id],undefined);const baseline=await s.call('build_action_spec',{spec:spec(),expectedRevision:0,commit:true});assert.equal(baseline.committed,true);assert.equal(writes,1);assert.equal(baseline.receipt.sources.length,1);assert.deepEqual(validateContractData(baseline.receipt,'receipt'),[]);assert.equal(baseline.receipt.visualReview,'pending');assert.equal(s.pair(spec().id).semanticSpec.intent,spec().intent);const before=s.pair(spec().id),sequence=s.state.sequence;const bad=await s.call('build_action_spec',{spec:spec([step('a'),step('b')]),expectedRevision:1,commit:true});assert.equal(bad.valid,false);assert.equal(writes,1);assert.equal(s.pair(spec().id),before);assert.equal(s.state.sequence,sequence);const reloaded=new Studio(process.cwd(),join(dir,'project.json'));assert.deepEqual(reloaded.pair(spec().id).buildReceipt,baseline.receipt);const joined=spec([step('a'),{...step('b'),connection:{contractId:'regular-a-to-b',duration:.12}},{...step('c'),connection:{contractId:'regular-b-to-c',duration:.12}}]);const action=await s.call('build_action_spec',{spec:joined,expectedRevision:1,commit:true});assert.equal(action.committed,true);assert.equal(writes,2);assert.equal(action.receipt.inspection.length,3);assert.equal(action.phases.filter(p=>p.id.startsWith('join-')).length,2);assert.equal(s.pair(spec().id).history[0].semanticSpec.steps.length,1);assert.equal(s.pair(spec().id).reference.phases.length,baseline.phases.length);}finally{rmSync(dir,{recursive:true,force:true});}});
test('structured build rejection is recorded as a failed run step without mutation',async()=>{const dir=mkdtempSync(join(tmpdir(),'studio-contract-log-'));try{const s=new Studio(process.cwd(),join(dir,'project.json'));Object.assign(s.state.actions,makeState().actions);const run=await s.call('begin_action_run',{prompt:'Test invalid joined recipe'});const result=await s.call('build_action_spec',{spec:spec([step('a'),step('b')]),expectedRevision:0,commit:true});assert.equal(result.valid,false);const events=(await s.call('get_action_run',{runId:run.id})).events;assert.ok(events.some(e=>e.name==='build_action_spec'&&e.status==='failed'&&e.error.includes('connection/unknown')));}finally{rmSync(dir,{recursive:true,force:true});}});

test('Slide contracts describe in-place entry/sustain/stride exit and reject wrong pairs or changed source pins',()=>{
 const state={actions:Object.fromEntries(library.movements.filter(m=>m.action.id.startsWith('move-ual2-slide-')).map(m=>[m.action.id,{category:'movement',revision:1,action:structuredClone(m.action),metadata:m.metadata,reference:m.action,history:[]}]))};
 const items=inspectLibrary(state,{query:'locomotion-slide',limit:10}).items;assert.equal(items.length,3);assert.deepEqual(items.find(m=>m.id.endsWith('-loop')).roles,['loop']);const exit=items.find(m=>m.id.endsWith('-exit'));assert.deepEqual(exit.roles,['recovery']);assert.match(exit.semantics.purpose,/running stride/);assert.match(exit.semantics.purpose,/does not finish in standing guard/);assert.equal(exit.contactReview,null);
 const step=s=>({movementId:'move-ual2-slide-'+s,revision:1,speed:1});const spec={schemaVersion:1,rig:'quaternius-ual1',id:'slide-contract-test',name:'Slide test',intent:'Slide in place then return to stride',steps:[step('start'),{...step('loop'),connection:{contractId:'slide-start-to-loop',duration:.06}},{...step('exit'),connection:{contractId:'slide-loop-to-exit',duration:.06}}]};
 const result=resolveSpec(state,spec,0,false);assert.equal(result.valid,true);assert.ok(Math.abs(result.receipt.duration-3.4533333134651185)<1e-8);assert.equal(result.receipt.contactIntervals.length,0);assert.equal(result.receipt.physicalValidation,'not-performed');
 const wrong=structuredClone(spec);wrong.steps[1].connection.contractId='slide-loop-to-exit';assert.ok(resolveSpec(state,wrong,0,false).diagnostics.some(d=>d.code==='connection/unknown'));
 state.actions['move-ual2-slide-loop'].action=structuredClone(state.actions['move-ual2-slide-loop'].action);state.actions['move-ual2-slide-loop'].action.tracks[0].keys[0].value[0]+=.01;assert.ok(resolveSpec(state,spec,0,false).diagnostics.some(d=>d.code==='connection/stale'));
});

test('complete UAL2 semantics retain equipment and controller requirements',()=>{
 assert.equal(catalog.movements.filter(m=>m.semantics.family==='unknown').length,0);
 const get=s=>catalog.movements.find(m=>m.id==='move-ual2-'+s);
 assert.match(get('hit-knockback').semantics.purpose,/lying down/);
 assert.deepEqual(get('laytoidle').roles,['recovery']);
 assert.match(get('ninjajump-idle-loop').semantics.purpose,/controller/);
 assert.match(get('idle-rail-loop').semantics.equipment,/rail/);
 assert.deepEqual(get('sword-heavy-combo').roles,['source-sequence']);
});

test('local contracts keep provenance separate and support cross-catalog composition',async()=>{
 const {validateLocalContractData,findContract}=await import('../authoring/contracts.mjs');
 const local=JSON.parse(readFileSync('authoring/contracts/studio-local.json'));
 assert.equal(local.movements.length,18);assert.deepEqual(validateLocalContractData(local),[]);
 const invalid=structuredClone(local);invalid.movements[0].provenance.license='invented';assert.ok(validateLocalContractData(invalid).length);
 assert.equal(findContract('quick-hook-recovery').to,'move-ual2-melee-hook-rec');
 const dir=mkdtempSync(join(tmpdir(),'studio-local-contract-'));
 try{
  const studio=new Studio(process.cwd(),join(dir,'project.json'));
  const p=studio.pair('move-guard'),m=manifest('move-guard',p);
  assert.equal(m.source.library,'studio-local');assert.match(m.source.sourceDescription,/Mesh2Motion/);
  assert.deepEqual(m.roles,['primitive']);assert.match(m.semantics.purpose,/not a defensive guard/);
  const s={schemaVersion:1,rig:'quaternius-ual1',id:'local-contract-test',name:'Local contract test',intent:'Enter kick',steps:[{movementId:'move-guard',revision:1,speed:1},{movementId:'move-kick',revision:1,speed:1,connection:{contractId:'kick-entry',duration:.06}}]};
  assert.equal(resolveSpec(studio.state,s,0,false).valid,true);
  studio.state.actions['move-guard']={...p,action:structuredClone(p.action)};studio.state.actions['move-guard'].action.name='Changed';
  assert.deepEqual(manifest('move-guard',studio.state.actions['move-guard']).roles,['unclassified']);
  assert.ok(resolveSpec(studio.state,s,0,false).diagnostics.some(d=>d.code==='connection/stale'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
