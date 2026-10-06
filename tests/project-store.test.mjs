import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,readdirSync,statSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {loadProject,saveProject} from '../authoring/project-store.mjs';
const action=(id,n)=>({id,version:2,tracks:[{joint:'pelvis',keys:[n]}]});
const sample=()=>({sequence:3,preview:{actionId:'a'},actions:{a:{revision:2,action:action('a',2),reference:action('a',1),history:[{revision:1,action:action('a',1),recipe:{steps:[]}}],recipe:{steps:[1]}},b:{revision:1,category:'movement',action:action('b',1),reference:action('b',1),history:[]}}});
const temp=fn=>{const dir=mkdtempSync(join(tmpdir(),'project-store-'));try{fn(join(dir,'project.json'),dir);}finally{rmSync(dir,{recursive:true,force:true});}};
const blobs=path=>readdirSync(path+'.blobs').sort();

test('round trip preserves state, deduplicates identical actions and keeps bodies out of the index',()=>temp(path=>{
 const state=sample();saveProject(path,state);const {state:loaded,legacy}=loadProject(path);
 assert.equal(legacy,false);assert.deepEqual(loaded,state);assert.equal(blobs(path).length,3);
 assert.ok(!readFileSync(path,'utf8').includes('tracks'));
 assert.notEqual(loaded.actions.b.action,loaded.actions.b.reference);
}));

test('a later save writes only new blobs and removes unreferenced ones',()=>temp(path=>{
 const state=sample(),known=new Set();saveProject(path,state,known);const before=new Map(blobs(path).map(f=>[f,statSync(join(path+'.blobs',f)).mtimeMs]));
 state.actions.a.history=[];state.actions.a.reference=action('a',2);state.actions.b.action=action('b',9);saveProject(path,state,known);
 const after=blobs(path);assert.equal(after.length,3);assert.equal(after.filter(f=>!before.has(f)).length,1);
 for(const f of after)if(before.has(f))assert.equal(statSync(join(path+'.blobs',f)).mtimeMs,before.get(f));
 assert.deepEqual(loadProject(path).state,state);
 assert.deepEqual(loadProject(path).state,(saveProject(path,state),loadProject(path).state));
}));

test('legacy monolith loads unchanged and is backed up once on first partitioned save',()=>temp(path=>{
 const state=sample();writeFileSync(path,JSON.stringify(state));const loaded=loadProject(path);
 assert.equal(loaded.legacy,true);assert.deepEqual(loaded.state,state);
 saveProject(path,loaded.state,new Set(),true);assert.deepEqual(JSON.parse(readFileSync(path+'.legacy.json','utf8')),state);
 assert.deepEqual(loadProject(path),{state,legacy:false});
}));

test('missing or corrupted blobs fail loudly instead of looking like an absent project',()=>temp(path=>{
 saveProject(path,sample());const [first,second]=blobs(path);
 writeFileSync(join(path+'.blobs',first),'{}');assert.throws(()=>loadProject(path),/checksum/);
 rmSync(join(path+'.blobs',first));rmSync(join(path+'.blobs',second));
 assert.throws(()=>loadProject(path),e=>e.code!=='ENOENT'&&/unreadable/.test(e.message));
 writeFileSync(path,JSON.stringify({storage:99,actions:{}}));assert.throws(()=>loadProject(path),/Unsupported/);
}));
