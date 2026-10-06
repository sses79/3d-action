import {readFileSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const path='authoring/contracts/ual2-standard.json',catalog=JSON.parse(readFileSync(path,'utf8')),input=JSON.parse(readFileSync('authoring/reviews/slide/inputs.json','utf8'));
const semantics={start:['primitive','Enter a low seated slide from a running stride; in-place source, controller supplies world travel'],loop:['loop','Sustain the low seated slide in place; body/hand support unverified, controller supplies world travel'],exit:['recovery','Leave the low slide into a running stride; does not finish in standing guard']};
for(const [suffix,[role,purpose]] of Object.entries(semantics)){
 const id='move-ual2-slide-'+suffix,m=catalog.movements.find(m=>m.id===id),source=input.sources[id];assert.ok(m&&source);assert.equal(m.motionHash,createHash('sha256').update(JSON.stringify(source.action)).digest('hex'));m.roles=[role];m.semantics={family:'locomotion-slide',purpose,equipment:'none',review:'candidate'};
}
for(const [from,to,purpose,id] of [['start','loop','continue','slide-start-to-loop'],['loop','exit','recover','slide-loop-to-exit']]) {
 const fromId='move-ual2-slide-'+from,toId='move-ual2-slide-'+to,match=input.matches[fromId].find(m=>m.movementId===toId);assert.ok(match&&match.fit==='near');
 const c={id,from:fromId,to:toId,fromHash:catalog.movements.find(m=>m.id===fromId).motionHash,toHash:catalog.movements.find(m=>m.id===toId).motionHash,purpose,policy:'positive-pose-blend-no-anchor',review:'candidate',evidence:{representation:'Adapted normalized rig revision 1 endpoint profiles; sampled source visuals stored in authoring/reviews/slide',positionRmsMeters:match.poseRmsMeters,rotationRmsDegrees:match.rotationRmsDegrees,visualReview:'pending',trajectoryValidation:'not-performed'}};
 const at=catalog.connections.findIndex(v=>v.id===id);if(at<0)catalog.connections.push(c);else catalog.connections[at]=c;
}
writeFileSync(path,JSON.stringify(catalog,null,2)+'\n');console.log('Curated three Slide semantics and two source-hash-pinned candidate links. Source tracks unchanged.');
