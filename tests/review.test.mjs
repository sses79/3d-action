import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Studio} from '../authoring/core.js';
const make=()=>({version:2,rig:'quaternius-ual1',id:'review-probe',name:'Review probe',phases:[{id:'a',name:'A',intent:'A',duration:.5,kind:'move',clip:'A_TPose',from:0,to:0},{id:'b',name:'B',intent:'B',duration:.5,kind:'move',clip:'A_TPose',from:0,to:0}],tracks:[]});
test('confidence level and notes persist, survive revisions and protect an action from rebuilds',async()=>{const dir=await mkdtemp(join(tmpdir(),'studio-review-'));try{
 let s=new Studio(process.cwd(),join(dir,'project.json'));const a=make();await s.call('create_action',{action:a});
 let r=await s.call('set_review',{entryId:'review-probe',level:1,note:{text:'leg through body',time:.6},by:'user'});assert.equal(r.review.level,1);assert.equal(r.levelName,'has issues');assert.equal(r.review.notes.length,2);assert.equal(r.review.notes[1].time,.6);assert.equal(r.review.notes[1].revision,1);
 a.phases[1].duration=.7;const revised=await s.call('revise_action',{action:a,expectedRevision:1});assert.equal(revised.revision,2);
 let listed=(await s.call('list_reviews',{minLevel:1})).find(x=>x.id==='review-probe');assert.equal(listed.level,1);assert.equal(listed.revision,2);assert.deepEqual(listed.retainedRevisions,[1]);assert.equal(listed.notes.length,2,'review survives a new revision');
 assert.equal((await s.call('list_actions',{})).find(x=>x.id==='review-probe').confidence,1);
 await s.call('set_review',{entryId:'review-probe',removeNoteId:2});await s.call('set_review',{entryId:'review-probe',level:2});
 await assert.rejects(s.call('reconstruct_motion',{video:'missing.mp4',start:0,end:1,actionId:'review-probe',commit:true,expectedRevision:2}),/acceptable.*overrideConfidence/);
 await assert.rejects(s.call('reconstruct_motion',{video:'missing.mp4',start:0,end:1,actionId:'review-probe',commit:true,expectedRevision:2,overrideConfidence:true}),/Video file not found/);
 assert.equal((await s.call('set_reference_revision',{actionId:'review-probe',revision:1})).referenceRevision,1);await assert.rejects(s.call('set_reference_revision',{actionId:'review-probe',revision:9}),/not in retained history/);
 await assert.rejects(s.call('set_review',{entryId:'review-probe'}),/Give a level/);await assert.rejects(s.call('set_review',{entryId:'review-probe',removeNoteId:99}),/No such note/);
 s=new Studio(process.cwd(),join(dir,'project.json'));listed=(await s.call('list_reviews',{})).find(x=>x.id==='review-probe');assert.equal(listed.level,2);assert.equal(listed.notes.at(-1).text,'Confidence has issues → acceptable');
}finally{await rm(dir,{recursive:true,force:true});}});
