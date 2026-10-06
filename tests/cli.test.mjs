import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveRefs,validatePlan,runPlan,compact,request} from '../authoring/cli-lib.mjs';
test('batch resolves dependent revision fields without evaluating code',()=>{
 assert.deepEqual(resolveRefs({expectedRevision:{$ref:'created.revision'},steps:[{$ref:'catalog.steps'}]},{created:{revision:2},catalog:{steps:[1,2]}}),{expectedRevision:2,steps:[[1,2]]});
 assert.throws(()=>resolveRefs({$ref:'constructor.name'},{}),/Unknown reference/);
 assert.throws(()=>resolveRefs({$ref:'missing.revision'},{}),/Unknown reference/);
});
test('scripted run tracks completion and passes resolved arguments',async()=>{
 const calls=[];const plan={prompt:'Test action',actionId:'test-action',steps:[{name:'create_action',arguments:{action:{}},as:'created'},{name:'revise_action',arguments:{expectedRevision:{$ref:'created.revision'}},as:'revised'}]};
 const report=await runPlan(plan,async(name,args)=>{calls.push({name,args});return {result:name==='begin_action_run'?{id:'run-id'}:name==='finish_action_run'?{toolElapsedMs:12}:{revision:1},clientElapsedMs:3};});
 assert.equal(report.status,'completed');assert.equal(report.serviceElapsedMs,12);assert.equal(calls[2].args.expectedRevision,1);assert.equal(calls.at(-1).args.status,'completed');
});
test('failed batch stops and closes its run, reports already committed steps',async()=>{
 const calls=[];await assert.rejects(runPlan({prompt:'Failure',steps:[{name:'first',arguments:{},as:'first'},{name:'bad',arguments:{},as:'bad'},{name:'never',arguments:{},as:'never'}]},async(name,args)=>{calls.push(name);if(name==='bad')throw Error('Stale revision');return {result:name==='begin_action_run'?{id:'run-id'}:{},clientElapsedMs:1};}),e=>{assert.equal(e.report.completedSteps,1);assert.equal(e.report.status,'failed');return true;});assert.deepEqual(calls,['begin_action_run','first','bad','finish_action_run']);
});
test('invalid batch has no service effects and compact results omit motion payloads',async()=>{
 await assert.rejects(runPlan({prompt:'',steps:[]},()=>{throw Error('Should not call');}),/Plan requires/);
 assert.throws(()=>validatePlan({prompt:'Test',steps:[{name:'first',arguments:{},as:'constructor'}]}),/Invalid step/);
 assert.deepEqual(compact({revision:2,action:{tracks:[{keys:[1]}]},joints:[1,2]}),{revision:2,action:{tracks:{omitted:true,count:1}},joints:{omitted:true,count:2}});
 await assert.rejects(request('https://example.com','list_actions',{}),/loopback/);
});
test('visual review mode retains an open run for inspection checkpoints',async()=>{
 const calls=[];const report=await runPlan({prompt:'Review action',finish:false,steps:[{name:'compose_action',arguments:{},as:'compiled'}]},async(name)=>{calls.push(name);return {result:name==='begin_action_run'?{id:'run-id'}:{toolElapsedMs:10},clientElapsedMs:1};});assert.equal(report.status,'awaiting-review');assert.equal(report.runId,'run-id');assert.ok(!calls.includes('finish_action_run'));
});
