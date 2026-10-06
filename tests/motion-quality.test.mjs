import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildSync} from 'esbuild';
import * as T from 'three/webgpu';
import {Studio,toolDefinitions} from '../authoring/core.js';
const directory=mkdtempSync(join(tmpdir(),'quality-module-'));
buildSync({entryPoints:['runtime/motion-quality.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:join(directory,'quality.mjs')});
// Use the repository for external three resolution, without duplicate Three constructors.
const text=readFileSync(join(directory,'quality.mjs'),'utf8').replaceAll('"three/webgpu"',JSON.stringify(new URL('../node_modules/three/build/three.webgpu.js',import.meta.url).href));
const {writeFileSync}=await import('node:fs');writeFileSync(join(directory,'quality.mjs'),text);
const {inspectMotionQuality,qualityRequest}=await import(join(directory,'quality.mjs'));rmSync(directory,{recursive:true,force:true});
const names=['root','pelvis','spine_03','Head','upperarm_l','lowerarm_l','hand_l','upperarm_r','lowerarm_r','hand_r','thigh_l','calf_l','foot_l','thigh_r','calf_r','foot_r','ball_l','ball_r'];
const action={version:2,rig:'quaternius-ual1',id:'quality-test',name:'Test',phases:[{id:'first',name:'First',duration:.5,clip:'A_TPose',from:0,to:0},{id:'join-1',name:'Join',duration:.5,clip:'A_TPose',from:0,to:0}],tracks:[]};
function rig(options={}){
 const model=new T.Group(),holder=new T.Group();holder.add(model);const map=new Map();
 for(const name of names){const bone=new T.Bone();bone.name=name;bone.position.set(name.endsWith('_l')?-.2:.2,name.includes('foot')||name.includes('ball')?0:1,0);model.add(bone);map.set(name,bone);}
 map.get('root').position.set(0,0,0);map.get('root').add(map.get('pelvis'));
 const calf=map.get('calf_r'),foot=map.get('foot_r');calf.position.set(.2,.5,0);calf.add(foot);foot.position.set(0,-.5,0);
 for(const side of ['l','r']){map.get('foot_'+side).add(map.get('ball_'+side));map.get('ball_'+side).position.set(0,0,0);}
 const restTransforms=names.map(n=>({bone:map.get(n),p:map.get(n).position.clone(),q:map.get(n).quaternion.clone(),s:map.get(n).scale.clone()}));
 return {model,restTransforms,baseScale:new T.Vector3(1,1,1),rootPosition:new T.Vector3(),rootRotation:new T.Quaternion(),sample(a,t){for(const e of restTransforms){e.bone.position.copy(e.p);e.bone.quaternion.copy(e.q);e.bone.scale.copy(e.s);}model.scale.set(1,1,1);model.position.set(0,0,options.seam?t<=.5?t:.5+2*(t-.5):(options.speed||0)*t);if(options.bodyMotion)map.get('pelvis').position.y+=.2*t;if(options.flaw)calf.scale.y=1.8;if(options.rotate)map.get('upperarm_r').quaternion.setFromAxisAngle(new T.Vector3(0,0,1),t<=.5?Math.PI*t:Math.PI*(1-t));model.updateWorldMatrix(true,true);}};
}
test('stationary rest rig has contact candidates and no configured flags',()=>{
 const result=inspectMotionQuality(rig(),action);assert.equal(result.status,'no-configured-flags');assert.equal(result.candidateContacts.length,2);assert.equal(result.candidateContacts[0].start,0);assert.equal(result.candidateContacts[0].end,1);assert.deepEqual(result.travel.root.delta,[0,0,0]);assert.equal(result.physicalValidation,'not-performed');assert.ok(result.boneLengths.some(b=>!b.measurable));
});
test('root-bone to pelvis travel is a body offset rather than changing anatomy',()=>{const result=inspectMotionQuality(rig({bodyMotion:true}),action);const pelvis=result.boneLengths.find(b=>b.bone==='pelvis');assert.equal(pelvis.kind,'body-offset');assert.ok(pelvis.maxRelativeChange>.1);assert.equal(result.diagnostics.filter(d=>d.code==='rig/bone-length').length,0);assert.ok(result.travel.pelvis.delta[1]>.19);});
test('first-frame distortion is measured against rest, not accepted as baseline',()=>{
 const result=inspectMotionQuality(rig({flaw:true}),action);const bone=result.boneLengths.find(b=>b.bone==='foot_r');assert.ok(Math.abs(bone.maxRelativeChange-.8)<1e-9);assert.ok(result.diagnostics.some(d=>d.code==='rig/bone-length'));assert.ok(result.scaleChanges.some(s=>s.target==='calf_r'));assert.equal(bone.peakTime,0);
});
test('declared foot sliding is measured separately from low-speed contact candidates',()=>{
 const result=inspectMotionQuality(rig({speed:1}),action,{start:.2,end:.8,contacts:[{foot:'left',start:0,end:1}]});assert.equal(result.candidateContacts.length,0);assert.ok(Math.abs(result.declaredContacts[0].maxHorizontalDriftMeters-.6)<1e-8);assert.ok(result.diagnostics.some(d=>d.code==='contact/drift'));assert.ok(Math.abs(result.travel.root.delta[2]-.6)<1e-8);assert.ok(Math.abs(result.travel.pelvis.delta[2]-.6)<1e-8);assert.equal(result.window.start,.2);
});
test('seams distinguish root translation from root-relative pose and angular reversal',()=>{
 const result=inspectMotionQuality(rig({seam:true,rotate:true}),action,{thresholds:{angularVelocityJumpTolerance:20}});const seam=result.seams[0];assert.ok(Math.abs(seam.rootVelocityJumpMetersPerSecond-1)<1e-8);assert.ok(seam.jointVelocityJumpRmsMetersPerSecond<1e-8);assert.ok(seam.angularVelocityJumpRmsDegreesPerSecond>90);assert.equal(seam.peakAngularJoint,'upperarm_r');assert.ok(result.diagnostics.some(d=>d.code==='connection/velocity-change'));assert.equal(seam.kind,'join-start');
});
test('invalid windows, thresholds and contact declarations fail early',()=>{
 for(const args of [{contacts:null},{start:null},{start:0,end:1e-10},{end:2},{start:.9,end:.1},{thresholds:{bad:1}},{thresholds:{floorY:NaN}},{thresholds:{footSpeedTolerance:0}},{contacts:[{foot:'left',start:0,end:2}]},{contacts:[{foot:'left',start:0,end:1,verified:true}]}])assert.throws(()=>qualityRequest(1,args));
});
test('service checks revisions, preserves project and handles source and joined motion',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'studio-quality-'));try{
 const studio=new Studio(process.cwd(),join(directory,'project.json'));
 const lib=JSON.parse(readFileSync('runtime/ual2-library.json'));
 const movement=lib.movements.find(m=>m.action.id==='move-ual2-sword-regular-a');studio.state.actions[movement.action.id]={category:'movement',revision:1,action:movement.action,reference:movement.action,metadata:movement.metadata,history:[]};
 const id=movement.action.id,sequence=studio.state.sequence,preview=JSON.stringify(studio.state.preview),file=readFileSync(studio.path,'utf8');
 const report=await studio.call('inspect_motion_quality',{actionId:id,sourceRevision:1});assert.equal(report.revision,1);assert.equal(report.boneLengths.length,64);assert.ok(report.sampledFrames>=27);assert.ok(report.motionHash);assert.ok(report.measuredAt);assert.equal(studio.state.sequence,sequence);assert.equal(JSON.stringify(studio.state.preview),preview);assert.equal(readFileSync(studio.path,'utf8'),file);
 await studio.call('compose_action',{actionId:'quality-joined',name:'Quality',expectedRevision:0,steps:[{movementId:id,revision:1,speed:1,transition:0},{movementId:id,revision:1,speed:1,transition:.12,contact:'left'}]});
 const joined=await studio.call('inspect_motion_quality',{actionId:'quality-joined',sourceRevision:1});assert.equal(joined.seams.filter(s=>s.kind.startsWith('join')).length,2);assert.equal(joined.declaredContacts[0].origin,'recipe-anchor-intent');assert.ok(joined.declaredContacts[0].end>joined.declaredContacts[0].start);
 await assert.rejects(studio.call('inspect_motion_quality',{actionId:id,sourceRevision:2}),/Stale/);await assert.rejects(studio.call('inspect_motion_quality',{actionId:id,sourceRevision:1,thresholds:{bad:1}}),/Invalid/);studio.state.actions[id].archived=true;await assert.rejects(studio.call('inspect_motion_quality',{actionId:id,sourceRevision:1}),/active/);assert.ok(toolDefinitions.find(t=>t.name==='inspect_motion_quality'));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
