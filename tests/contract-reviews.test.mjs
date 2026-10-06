import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {Studio} from '../authoring/core.js';import {manifest,resolveSpec,validateContractData} from '../authoring/contracts.mjs';
const lib=JSON.parse(readFileSync('runtime/ual2-library.json'));
async function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'contract-reviews-'));try{const s=new Studio(process.cwd(),join(dir,'project.json'));for(const m of lib.movements.filter(m=>m.action.id.includes('sword-regular-')))s.state.actions[m.action.id]={category:'movement',revision:1,action:structuredClone(m.action),reference:structuredClone(m.action),metadata:m.metadata,history:[]};await fn(s,dir);}finally{rmSync(dir,{recursive:true,force:true});}}
const suffix=s=>'move-ual2-sword-regular-'+s;
const review={movementId:suffix('a-rec'),sourceRevision:1,expectedReviewRevision:0,views:['Front','Side'],notes:'Test-only visual evidence',artifacts:[],intervals:[{foot:'left',start:.75,end:.96,decision:'supported',notes:'Test-only quiet interval'}]};
const spec=steps=>({schemaVersion:1,rig:'quaternius-ual1',id:'review-test-action',name:'Review test',intent:'Test contracts',steps});
const step=s=>({movementId:suffix(s),revision:1,speed:1});
test('contact review is revision pinned, persists independently, and retimes into receipts',()=>fixture(async(s,dir)=>{
 const before=readFileSync(s.path,'utf8'),preview=JSON.stringify(s.state.preview);const r=await s.call('review_movement_contacts',review);assert.equal(r.reviewRevision,1);assert.equal(r.reviewer,'llm-visual');assert.equal(r.measurement.sampleRate,60);assert.equal(readFileSync(s.path,'utf8'),before);assert.equal(JSON.stringify(s.state.preview),preview);assert.ok(existsSync(s.path+'.contracts.json'));
 const p=s.pair(review.movementId),m=manifest(review.movementId,p,s.contracts.data,s.state);assert.equal(m.contactReviewStatus,'current');assert.equal(m.contactReview.intervals[0].decision,'supported');
 const resolved=resolveSpec(s.state,spec([{...step('a-rec'),speed:.75}]),0,false,s.contracts.data);assert.equal(resolved.valid,true);assert.equal(resolved.receipt.contactIntervals[0].reviewScope,'source-only');assert.ok(Math.abs(resolved.receipt.contactIntervals[0].start-1)<1e-9);assert.ok(Math.abs(resolved.receipt.contactIntervals[0].end-1.28)<1e-9);assert.deepEqual(validateContractData(resolved.receipt,'receipt'),[]);
 const reloaded=new Studio(process.cwd(),join(dir,'project.json'));assert.equal(reloaded.contracts.data.contacts[0].motionHash,r.motionHash);
 await assert.rejects(s.call('review_movement_contacts',review),/Stale contract review/);const revised=await s.call('review_movement_contacts',{...review,expectedReviewRevision:1});assert.equal(revised.reviewRevision,2);assert.equal(s.contracts.data.contactHistory.length,1);
 p.revision=2;assert.equal(manifest(review.movementId,p,s.contracts.data,s.state).contactReviewStatus,'stale');assert.equal(manifest(review.movementId,p,s.contracts.data,s.state).contactReview,null);assert.equal(resolveSpec(s.state,spec([{...step('a-rec'),revision:2}]),0,false,s.contracts.data).receipt.contactIntervals.length,0);
}));
test('unsupported contact and invalid review metadata never mutate review store',()=>fixture(async(s)=>{
 const before=JSON.stringify(s.contracts.data);await assert.rejects(s.call('review_movement_contacts',{...review,movementId:suffix('a'),intervals:[{foot:'left',start:0,end:.4,decision:'supported',notes:'Not quiet'}]}),/exceeds measured/);
 await assert.rejects(s.call('review_movement_contacts',{...review,views:[],intervals:[{...review.intervals[0],decision:'uncertain'}]}),/Invalid contract review/);assert.equal(JSON.stringify(s.contracts.data),before);
}));
test('seam decisions pin tested configuration, reject false support and expose both-source staleness',()=>fixture(async(s)=>{
 const steps=[{movementId:suffix('a'),revision:1,speed:1,transition:0},{movementId:suffix('b'),revision:1,speed:1,transition:.12}];await s.call('compose_action',{actionId:'seam-test',name:'Seam test',expectedRevision:0,steps});
 const args={contractId:'regular-a-to-b',fromRevision:1,toRevision:1,actionId:'seam-test',actionRevision:1,step:1,expectedReviewRevision:0,decision:'needs-review',views:['Front','Side'],notes:'Test-only seam inspection'};
 const result=await s.call('review_connection_policy',args);assert.deepEqual(result.configuration,{duration:.12,fromSpeed:1,toSpeed:1,anchor:'none'});assert.equal(result.seams.length,2);assert.ok(result.flagCodes.includes('connection/velocity-change'));
 await assert.rejects(s.call('review_connection_policy',{...args,expectedReviewRevision:1,decision:'supported'}),/configured review flags/);assert.equal(s.contracts.data.seams[0].reviewRevision,1);
 const joined=spec([step('a'),{...step('b'),connection:{contractId:'regular-a-to-b',duration:.12}}]);assert.ok(resolveSpec(s.state,joined,0,false,s.contracts.data).diagnostics.some(d=>d.code==='connection/policy-needs-review'));
 // Isolated policy fixture exercises exact-configuration enforcement; not a live visual approval.
 const simulated=structuredClone(s.contracts.data);simulated.seams[0].decision='supported';const changed=structuredClone(joined);changed.steps[1].connection.duration=.2;assert.ok(resolveSpec(s.state,changed,0,false,simulated).diagnostics.some(d=>d.code==='connection/outside-reviewed-policy'&&d.severity==='error'));simulated.seams[0].decision='rejected';assert.ok(resolveSpec(s.state,joined,0,false,simulated).diagnostics.some(d=>d.code==='connection/rejected-policy'));
 const b=s.pair(suffix('b'));b.revision=2;const m=manifest(suffix('a'),s.pair(suffix('a')),s.contracts.data,s.state);assert.equal(m.connections[0].policyStatus,'stale');assert.equal(m.connections[0].seamPolicy,null);b.action=structuredClone(b.action);b.action.phases[0].intent='Changed source';assert.equal(manifest(suffix('a'),s.pair(suffix('a')),s.contracts.data,s.state).connections[0].status,'stale-source');
}));
test('exports retain review evidence; imports do not silently rebind its source revision',()=>fixture(async(s)=>{
 await s.call('review_movement_contacts',review);const doc=await s.call('export_project');assert.equal(doc.contracts.contacts.length,1);await s.call('import_project',{project:doc,expectedSequence:s.state.sequence});assert.equal(manifest(review.movementId,s.pair(review.movementId),s.contracts.data,s.state).contactReviewStatus,'stale');
 const bad=structuredClone(doc);bad.contracts.contacts.push(bad.contracts.contacts[0]);const before=s.state.sequence;await assert.rejects(s.call('import_project',{project:bad,expectedSequence:before}),/Duplicate/);assert.equal(s.state.sequence,before);
}));
