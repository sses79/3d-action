import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneRig} from 'three/addons/utils/SkeletonUtils.js';
const result=await build({entryPoints:['runtime/action.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {jump,burst,impactTime,clone,duration,locate,rootHeight,validateAction}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const playerBuild=await build({entryPoints:['runtime/player.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {CharacterPlayer}=await import('data:text/javascript;base64,'+Buffer.from(playerBuild.outputFiles[0].text).toString('base64'));
const bytes=await readFile('editor/assets/character.glb');
const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
test('phase boundaries are ordered and total duration follows timing edits',()=>{
 const a=clone(jump),ref=clone(jump);a.phases[2].duration+=.4;
 assert.ok(Math.abs(duration(a)-duration(ref)-.4)<1e-10);assert.equal(ref.phases[2].duration,.32);
 assert.equal(locate(a,.7).phase.id,'hang');assert.equal(locate(a,duration(a)).phase.id,'guard');
});
test('root trajectory is continuous and grounded at both ends',()=>{
 assert.equal(rootHeight(jump,0),0);assert.equal(rootHeight(jump,duration(jump)),0);
 for(let t=0;t<duration(jump);t+=.001)assert.ok(Math.abs(rootHeight(jump,t+.001)-rootHeight(jump,t))<.02);
});
test('reject stale/unsupported shape and invalid phase timing on import',()=>{
 const a=clone(jump);a.phases[0].duration=-1;assert.throws(()=>validateAction(a));
 a.phases[0].duration=.3;a.phases[0].clip='unknown';assert.throws(()=>validateAction(a));
 assert.deepEqual(validateAction(JSON.parse(JSON.stringify(jump))),jump);
});
function pose(root){const out=[];root.traverse(n=>{if(n.isBone)out.push(...n.position.toArray(),...n.quaternion.toArray(),...n.scale.toArray());});return out;}
test('real rig samples identically after seeking away and back',()=>{
 const rig=cloneRig(asset.scene),p=new CharacterPlayer(rig,asset.animations);
 p.sample(jump,.82);const expected=pose(rig);p.sample(jump,1.7);p.sample(jump,.1);p.sample(jump,.82);
 assert.deepEqual(pose(rig),expected);
});
test('comparison skeletons remain independent',()=>{
 const a=cloneRig(asset.scene),b=cloneRig(asset.scene),p=new CharacterPlayer(a,asset.animations),q=new CharacterPlayer(b,asset.animations);
 p.sample(jump,.82);const expected=pose(a);q.sample(jump,1.5);assert.deepEqual(pose(a),expected);assert.notDeepEqual(pose(b),expected);
});

test('burst keeps eleven phases and survives project validation',()=>{assert.equal(burst.phases.length,11);assert.deepEqual(validateAction(JSON.parse(JSON.stringify(burst))),burst);assert.ok(impactTime(burst)>0);assert.equal(rootHeight(burst,impactTime(burst)),0);});
test('burst overlays do not accumulate during paused replay or repeated seeking',()=>{const root=cloneRig(asset.scene),p=new CharacterPlayer(root,asset.animations);const t=burst.phases.slice(0,5).reduce((s,x)=>s+x.duration,0)+.08;p.sample(burst,t);const expected=pose(root);for(let i=0;i<20;i++)p.sample(burst,t);assert.deepEqual(pose(root),expected);p.sample(burst,.2);p.sample(burst,t);assert.deepEqual(pose(root),expected);});
test('pose-speed curves are measured and leave subsequent sampling deterministic',()=>{const root=cloneRig(asset.scene),p=new CharacterPlayer(root,asset.animations);p.sample(burst,1);const expected=pose(root);const speeds=p.poseSpeeds(burst);assert.ok(speeds.length>150);assert.ok(speeds.every(Number.isFinite));assert.ok(Math.max(...speeds)>1);p.sample(burst,1);assert.deepEqual(pose(root),expected);});

test('authored joint and root tracks do not accumulate or leak into legacy playback',()=>{
 const a=validateAction({version:2,rig:'quaternius-ual1',id:'pose-test',name:'Pose test',phases:[{id:'pose',name:'Pose',intent:'Independent left arm',duration:1,clip:'Idle_Loop',from:0,to:.1}],tracks:[{target:'upperarm_l',property:'rotation',mode:'offset',interpolation:'smooth',keys:[{time:0,value:[0,0,0,1]},{time:1,value:[Math.sin(.5),0,0,Math.cos(.5)]}]},{target:'hand_l',property:'position',mode:'offset',interpolation:'linear',keys:[{time:0,value:[.01,0,0]}]},{target:'foot_l',property:'scale',mode:'offset',interpolation:'linear',keys:[{time:0,value:[1.1,1,1]}]},{target:'$root',property:'position',mode:'absolute',interpolation:'linear',keys:[{time:0,value:[0,0,0]},{time:1,value:[1,.5,2]}]}]});
 const root=cloneRig(asset.scene),player=new CharacterPlayer(root,asset.animations,2);player.sample(jump,.82);const legacy=pose(root);player.sample(a,.5);const expected=pose(root),position=root.position.toArray();assert.deepEqual(position,[.25,.125,.5]);for(let i=0;i<20;i++)player.sample(a,.5);assert.deepEqual(pose(root),expected);player.sample(a,.1);player.sample(jump,.3);player.sample(a,.5);assert.deepEqual(pose(root),expected);player.sample(jump,.82);assert.deepEqual(pose(root),legacy);
});
