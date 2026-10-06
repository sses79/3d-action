import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildSync} from 'esbuild';
import * as T from 'three/webgpu';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const dir=mkdtempSync(join(tmpdir(),'reconstruction-'));
buildSync({entryPoints:['authoring/reconstruction/retarget.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:join(dir,'retarget.mjs')});
writeFileSync(join(dir,'retarget.mjs'),readFileSync(join(dir,'retarget.mjs'),'utf8').replaceAll('"three/webgpu"',JSON.stringify(new URL('../node_modules/three/build/three.webgpu.js',import.meta.url).href)));
const {bodyFrame,localForDirection,retarget}=await import(join(dir,'retarget.mjs'));rmSync(dir,{recursive:true,force:true});
test('direction retarget respects rotated parent and preserves desired world direction',()=>{
 const rest=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),.4),parent=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),.8),localAxis=new T.Vector3(0,-1,0),restDirection=localAxis.clone().applyQuaternion(rest),target=new T.Vector3(1,2,3).normalize();
 const q=localForDirection(parent,rest,restDirection,target);assert.ok(localAxis.applyQuaternion(parent.clone().multiply(q)).distanceTo(target)<1e-10);assert.ok(Math.abs(q.length()-1)<1e-10);
});
test('body frame removes shear and rejects degenerate axes',()=>{
 const q=bodyFrame(new T.Vector3(1,0,0),new T.Vector3(-1,0,0),new T.Vector3(.4,1,0));assert.ok(q.angleTo(new T.Quaternion())<1e-8);assert.throws(()=>bodyFrame(new T.Vector3(),new T.Vector3(),new T.Vector3(0,1,0)));assert.throws(()=>localForDirection(new T.Quaternion(),new T.Quaternion(),new T.Vector3(0,1,0),new T.Vector3()));
});
test('actual estimated clip bakes finite continuous unit rotations without altering bone positions/scales',async()=>{
 globalThis.ProgressEvent=class{};const b=readFileSync('editor/assets/character.glb'),g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');const rest=[];g.scene.traverse(x=>{if(x.isBone)rest.push([x,x.position.clone(),x.scale.clone()])});
 const ir=JSON.parse(readFileSync('authoring/reviews/video/kick-reference/reconstruction-small/motion-ir.json','utf8'));const r=retarget(g.scene,ir.rootRelativePositions,ir.times,ir.imagePelvis,.003);
 for(const [b,p,s] of rest){assert.deepEqual(b.position.toArray(),p.toArray());assert.deepEqual(b.scale.toArray(),s.toArray());}
 for(const t of r.action.tracks){assert.equal(t.keys.length,70);for(let i=0;i<t.keys.length;i++){const v=t.keys[i].value;assert.ok(v.every(Number.isFinite));if(t.property==='rotation'){const q=new T.Quaternion().fromArray(v);assert.ok(Math.abs(q.length()-1)<1e-6);if(i)assert.ok(q.dot(new T.Quaternion().fromArray(t.keys[i-1].value))>=-1e-10);}}}
 assert.throws(()=>retarget(g.scene,ir.rootRelativePositions,[1,0],ir.imagePelvis,.003));
});

test('fitted fixture retains timing/provenance and improves the observed extension',()=>{
 const original=JSON.parse(readFileSync('authoring/reviews/video/kick-reference/reconstruction-small/motion-ir.json'));const fitted=JSON.parse(readFileSync('authoring/reviews/video/kick-reference/reconstruction-fitted/motion-ir.json'));
 assert.deepEqual(fitted.times,original.times);assert.equal(fitted.sourceSHA256,original.sourceSHA256);assert.deepEqual(fitted.unfittedPositions,original.rootRelativePositions);assert.ok(fitted.rootRelativePositions.flat(2).every(Number.isFinite));assert.ok(fitted.fitting.rightKneePeakDegrees.after>165);assert.ok(fitted.fitting.rightKneePeakDegrees.before<100);assert.ok(fitted.fitting.limits.some(s=>s.includes('side-view')));
});

test('stability fixture preserves source timing and peak extension while reducing temporal variation',()=>{
 const a=JSON.parse(readFileSync('authoring/reviews/video/kick-reference/reconstruction-fitted/motion-ir.json'));const b=JSON.parse(readFileSync('authoring/reviews/video/kick-reference/reconstruction-stable/motion-ir.json'));const m=JSON.parse(readFileSync('authoring/reviews/video/kick-reference/reconstruction-stable/comparison.json'));
 assert.deepEqual(b.times,a.times);assert.equal(b.sourceSHA256,a.sourceSHA256);assert.deepEqual(b.imagePelvis[0],a.imagePelvis[0]);assert.deepEqual(b.imagePelvis.at(-1),a.imagePelvis.at(-1));assert.ok(b.fitting.rightKneePeakDegrees.after>165);assert.ok(m['reconstruction-stable'].depthSecondDifferenceRMS<m['reconstruction-fitted'].depthSecondDifferenceRMS);assert.ok(b.rootRelativePositions.flat(2).every(Number.isFinite));
});
