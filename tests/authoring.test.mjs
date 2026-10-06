import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createServer} from 'node:net';
import {Studio} from '../authoring/core.js';
const make=()=>({version:2,rig:'quaternius-ual1',id:'test-strike',name:'Test strike',phases:[{id:'ready',name:'Ready',intent:'Stand',duration:.4,clip:'Idle_Loop',from:0,to:.1},{id:'strike',name:'Strike',intent:'Strike forward',duration:.6,kind:'fast',clip:'Punch_Jab',from:0,to:1}],tracks:[{target:'upperarm_l',property:'rotation',mode:'offset',interpolation:'smooth',keys:[{time:0,value:[0,0,0,1]},{time:.4,value:[Math.sin(.4),0,0,Math.cos(.4)]},{time:1,value:[0,0,0,1]}]},{target:'$root',property:'position',mode:'absolute',interpolation:'linear',keys:[{time:0,value:[0,0,0]},{time:.5,value:[0,1,.5]},{time:1,value:[0,0,1]}]}],cues:[{type:'impact',time:.8,strength:1}]});
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'studio-test-'));try{return await fn(new Studio(process.cwd(),join(dir,'project.json')),dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('new action, stale protection, reference, undo and persisted reload',()=>fixture(async(s,dir)=>{const a=make();await s.call('create_action',{action:a});a.phases[1].duration=.7;const updated=await s.call('revise_action',{action:a,expectedRevision:1});assert.equal(updated.revision,2);assert.equal(updated.reference.phases[1].duration,.6);const before=s.snapshot();await assert.rejects(s.call('revise_action',{action:a,expectedRevision:1}),/Stale/);assert.deepEqual(s.snapshot(),before);await s.call('restore_revision',{actionId:a.id,revision:1,expectedRevision:2});const reopened=new Studio(process.cwd(),join(dir,'project.json'));assert.equal((await reopened.call('get_action',{actionId:a.id})).action.phases[1].duration,.6);}));
test('unsupported tracks and invalid imports leave project unchanged',()=>fixture(async(s)=>{await s.call('create_action',{action:make()});const before=s.snapshot();for(const mutation of [a=>a.tracks[0].target='unknown',a=>a.tracks[0].keys[0].value=[0,0,0,0],a=>a.tracks[0].keys[1].time=0,a=>a.phases.push({...a.phases[0]}),a=>a.tracks.push(a.tracks[0]),a=>a.tracks[0].script='code']){const a=make();mutation(a);await assert.rejects(s.call('revise_action',{action:a,expectedRevision:1}));assert.deepEqual(s.snapshot(),before);}const doc=await s.call('export_project');doc.actions['test-strike'].action.tracks[0].target='unknown';await assert.rejects(s.call('import_project',{project:doc,expectedSequence:s.state.sequence}));assert.deepEqual(s.snapshot(),before);}));
test('all-joint tracks sample actual rig and root movement independently',()=>fixture(async(s)=>{const a=make();await s.call('create_action',{action:a});const d=await s.call('get_diagnostics',{actionId:a.id,time:.5});assert.equal(d.joints.length,65);assert.ok(d.poseSpeed.every(Number.isFinite));assert.ok(Math.max(...d.poseSpeed)>0);const j=d.joints.find(j=>j.name==='upperarm_l');const original=make();original.id='test-base';original.tracks=[];await s.call('create_action',{action:original});const base=await s.call('get_diagnostics',{actionId:original.id,time:.5});assert.notDeepEqual(j.localRotation,base.joints.find(j=>j.name==='upperarm_l').localRotation);assert.equal(d.rootHeight[30],1);assert.ok(j.worldPosition[2]!==base.joints.find(j=>j.name==='upperarm_l').worldPosition[2]);}));
test('MCP initialization, discovery and live service revision roundtrip',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-mcp-'));const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const server=spawn(process.execPath,['authoring/server.mjs'],{env:{...process.env,STUDIO_PORT:String(port),STUDIO_STATE_PATH:join(dir,'project.json')},stdio:['ignore','ignore','pipe']});
 let mcp;try{await new Promise((r,j)=>{server.stderr.once('data',r);server.once('exit',code=>j(Error('Server exited '+code)));});mcp=spawn(process.execPath,['authoring/mcp.mjs'],{env:{...process.env,STUDIO_URL:`http://127.0.0.1:${port}`},stdio:['pipe','pipe','pipe']});const pending=new Map();createInterface({input:mcp.stdout}).on('line',line=>{const m=JSON.parse(line);pending.get(m.id)?.(m);pending.delete(m.id);});let n=0;function rpc(method,params){const id=++n;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('MCP timeout')),5000);pending.set(id,m=>{clearTimeout(timer);resolve(m);});mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
 const init=await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}});assert.equal(init.result.serverInfo.name,'animation-studio');mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');const list=await rpc('tools/list',{});assert.equal(list.result.tools.length,39);const reviews=await rpc('tools/call',{name:'get_contract_reviews',arguments:{}});assert.equal(reviews.result.isError,false);assert.equal(JSON.parse(reviews.result.content[0].text).schemaVersion,1);const common=await rpc('tools/call',{name:'find_common_motion',arguments:{movementA:'move-guard',revisionA:1,movementB:'move-guard',revisionB:1,includeHolds:true}});assert.equal(common.result.isError,false);assert.ok(JSON.parse(common.result.content[0].text).matches.length>0);const invalidSpec=await rpc('tools/call',{name:'build_action_spec',arguments:{spec:{schemaVersion:99},expectedRevision:0,commit:true}});assert.equal(invalidSpec.result.isError,true);assert.match(invalidSpec.result.content[0].text,/spec\/shape/);const created=await rpc('tools/call',{name:'create_action',arguments:{action:make()}});assert.equal(created.result.isError,false);const quality=await rpc('tools/call',{name:'inspect_motion_quality',arguments:{actionId:'test-strike',sourceRevision:1}});assert.equal(quality.result.isError,false);assert.equal(JSON.parse(quality.result.content[0].text).physicalValidation,'not-performed');const staleQuality=await rpc('tools/call',{name:'inspect_motion_quality',arguments:{actionId:'test-strike',sourceRevision:0}});assert.equal(staleQuality.result.isError,true);const state=await fetch(`http://127.0.0.1:${port}/api/state`).then(r=>r.json());assert.equal(state.preview.actionId,'test-strike');assert.equal(state.actions['test-strike'].revision,1);
 const rejected=await rpc('tools/call',{name:'revise_action',arguments:{action:make(),expectedRevision:0}});assert.equal(rejected.result.isError,true);
 const catalog=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();const unchanged=await fetch(`http://127.0.0.1:${port}/api/state?since=${catalog.sequence}`);assert.equal(unchanged.status,204);assert.equal(await unchanged.text(),'');
 const badOrigin=await fetch(`http://127.0.0.1:${port}/api/state`,{headers:{Origin:'https://untrusted.example'}});assert.equal(badOrigin.status,403);const source=await fetch(`http://127.0.0.1:${port}/authoring/core.ts`);assert.equal(source.status,404);const loaded=JSON.parse(await readFile(join(dir,'project.json'),'utf8'));assert.equal(loaded.actions['test-strike'].revision,1);
 }finally{mcp?.kill();server.kill();await new Promise(r=>server.once('exit',r));await rm(dir,{recursive:true,force:true});}
});

test('authored kick preserves contact, limb lengths and recovery across bounded variants',()=>fixture(async(s,dir)=>{
 await s.call('revise_kick',{heightDeg:0,releaseSpeed:1,expectedRevision:0});
 const base=s.pair('kick-study').action;const times=[0,.5,.65,.78,1,1.2,1.8333333333];
 const baseline=[];for(const time of times)baseline.push((await s.call('get_diagnostics',{actionId:'kick-study',time})).joints);
 const joint=(j,n)=>j.find(x=>x.name===n),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 for(const heightDeg of [-8,8]){
  await s.call('revise_kick',{heightDeg,releaseSpeed:1.25,expectedRevision:s.pair('kick-study').revision});
  for(let i=0;i<times.length;i++){
   const t=times[i]<=.5?times[i]:times[i]<=.8?.5+(times[i]-.5)/1.25:times[i]-.06;
   const j=(await s.call('get_diagnostics',{actionId:'kick-study',time:t})).joints,b=baseline[i];
   assert.ok(distance(joint(j,'ball_l').worldPosition,joint(b,'ball_l').worldPosition)<1e-6,'support contact retained');
   for(const [a,c]of [['thigh_r','calf_r'],['calf_r','foot_r']])assert.ok(Math.abs(distance(joint(j,a).worldPosition,joint(j,c).worldPosition)-distance(joint(b,a).worldPosition,joint(b,c).worldPosition))<1e-6,'bone lengths retained');
   assert.ok(distance(joint(j,'calf_r').localRotation,joint(b,'calf_r').localRotation)<1e-9,'knee profile retained');
   if(i===3)assert.ok(heightDeg*(joint(j,'foot_r').worldPosition[1]-joint(b,'foot_r').worldPosition[1])>0,'height moves in requested direction');
   if(i===0||i===times.length-1)for(const n of ['thigh_r','spine_01'])assert.ok(distance(joint(j,n).localRotation,joint(b,n).localRotation)<1e-6,'start and recovery unchanged');
  }
  assert.deepEqual(s.pair('kick-study').reference,base);
 }
 const before=s.snapshot();await assert.rejects(s.call('revise_kick',{heightDeg:50,releaseSpeed:1,expectedRevision:3}),/Kick controls/);assert.deepEqual(s.snapshot(),before);
 await assert.rejects(s.call('revise_kick',{heightDeg:0,releaseSpeed:1,expectedRevision:1}),/Stale/);
 const reopened=new Studio(process.cwd(),join(dir,'project.json'));assert.deepEqual(reopened.pair('kick-study').motionParameters,{heightDeg:8,releaseSpeed:1.25});
 await s.call('revise_kick',{heightDeg:0,releaseSpeed:1,expectedRevision:3});assert.deepEqual(s.pair('kick-study').action,base,'reset is deterministic');
 await s.call('restore_revision',{actionId:'kick-study',revision:3,expectedRevision:4});assert.deepEqual(s.pair('kick-study').motionParameters,{heightDeg:8,releaseSpeed:1.25});
 const exported=await s.call('export_project');await s.call('import_project',{project:exported,expectedSequence:s.state.sequence});assert.deepEqual(s.pair('kick-study').motionParameters,{heightDeg:8,releaseSpeed:1.25});
}));

test('movement library builds sources, separates actions, and archives reversibly',()=>fixture(async(s,dir)=>{
 const movements=await s.call('list_movements');assert.equal(movements.length,4);assert.ok(!(await s.call('list_actions')).some(a=>a.id.startsWith('move-')));
 const metadata={source:'Quaternius CC0',support:'unknown',travel:'source',notes:'Contact requires review'};
 await s.call('build_movement',{movementId:'move-jab',name:'Jab',clip:'Punch_Jab',from:.1,to:.9,duration:.7,metadata,expectedRevision:0});
 const p=await s.call('get_movement',{movementId:'move-jab'});assert.equal(p.action.phases[0].from,.1);assert.equal(p.metadata.support,'unknown');
 await assert.rejects(s.call('build_movement',{movementId:'move-jab',name:'Jab',clip:'Punch_Jab',metadata,expectedRevision:0}),/Stale/);
 await s.call('archive_entry',{entryId:'move-jab',archived:true,expectedRevision:1});assert.ok(!(await s.call('list_movements')).some(m=>m.id==='move-jab'));await assert.rejects(s.call('set_preview',{actionId:'move-jab'}),/archived/);
 await s.call('archive_entry',{entryId:'move-jab',archived:false,expectedRevision:2});assert.equal(new Studio(process.cwd(),join(dir,'project.json')).pair('move-jab').archived,false);
}));
test('composed action pins movement revisions, bakes connections and exports library',()=>fixture(async(s)=>{
 const steps=[{movementId:'move-guard',revision:1,speed:1,transition:0},{movementId:'move-kick',revision:1,speed:1,transition:.2},{movementId:'move-guard',revision:1,speed:1,transition:.2}];
 const result=await s.call('compose_action',{actionId:'guard-kick-guard',name:'Guard → Kick → Guard',steps,expectedRevision:0});assert.equal(result.phases.filter(p=>p.id.startsWith('join-')).length,2);assert.deepEqual(result.recipe.steps,steps);
 const start=(await s.call('get_diagnostics',{actionId:'guard-kick-guard',time:0})).joints;
 const end=(await s.call('get_diagnostics',{actionId:'guard-kick-guard',time:result.duration})).joints;assert.deepEqual(start,end);
 const at=.7+.78;const kick=(await s.call('get_diagnostics',{actionId:'move-kick',time:.78})).joints;const joined=(await s.call('get_diagnostics',{actionId:'guard-kick-guard',time:at})).joints;
 const foot=j=>j.find(n=>n.name==='foot_r').worldPosition;assert.ok(Math.hypot(...foot(kick).map((v,i)=>v-foot(joined)[i]))<.005);
 const original=JSON.stringify(s.pair('guard-kick-guard').action);const movement=s.pair('move-guard');const action=structuredClone(movement.action);action.name='Revised guard';await s.call('register_movement',{action,metadata:movement.metadata,expectedRevision:1});assert.equal(JSON.stringify(s.pair('guard-kick-guard').action),original,'movement changes do not alter baked action');
 const before=s.snapshot();await assert.rejects(s.call('compose_action',{actionId:'guard-kick-guard',name:'Stale composition',steps,expectedRevision:1}),/Stale/);assert.deepEqual(s.snapshot(),before);
 const doc=await s.call('export_project');assert.equal(doc.actions['move-kick'].category,'movement');assert.equal(doc.actions['guard-kick-guard'].recipe.steps[0].revision,1);await s.call('import_project',{project:doc,expectedSequence:s.state.sequence});assert.equal(s.pair('move-kick').category,'movement');assert.deepEqual(s.pair('guard-kick-guard').recipe.steps,steps);
 await s.call('capture_reference',{actionId:'guard-kick-guard',expectedRevision:s.pair('guard-kick-guard').revision});const pair=s.pair('guard-kick-guard');const restored=await s.call('restore_revision',{actionId:'guard-kick-guard',revision:pair.history.at(-1).revision,expectedRevision:pair.revision});assert.deepEqual(restored.recipe.steps,steps,'Undo retains recipe metadata');
 const invalid=structuredClone(doc);invalid.actions['guard-kick-guard'].recipe.steps=null;const unchanged=s.snapshot();await assert.rejects(s.call('import_project',{project:invalid,expectedSequence:s.state.sequence}),/recipe/);assert.deepEqual(s.snapshot(),unchanged);
}));

test('step-punch connection anchors lead foot and carries root travel into punch',()=>fixture(async(s)=>{
 const prepared=JSON.parse(await readFile('authoring/source/step-forward.json','utf8'));await s.call('register_movement',prepared);
 const step=s.pair('move-step-forward').action,stepDuration=step.phases.reduce((n,p)=>n+p.duration,0);
 const result=await s.call('compose_action',{actionId:'step-punch-test',name:'Step → Punch',expectedRevision:0,steps:[{movementId:'move-step-forward',revision:1,speed:1,transition:0},{movementId:'move-punch',revision:1,speed:1,transition:.3,contact:'left'}]});
 const sample=async t=>(await s.call('get_diagnostics',{actionId:'step-punch-test',time:t})).joints;
 const pos=(j,n)=>j.find(x=>x.name===n).worldPosition;const start=await sample(stepDuration),anchor=pos(start,'ball_l');
 for(let i=0;i<=20;i++){const j=await sample(stepDuration+i*.3/20);assert.ok(Math.hypot(...pos(j,'ball_l').map((v,k)=>v-anchor[k]))<.004,'lead toe stays in place across connection');}
 const finish=await sample(result.duration),base=(await s.call('get_diagnostics',{actionId:'move-punch',time:1})).joints;assert.ok(pos(finish,'pelvis')[2]>.3,'punch retains advanced location');
 for(const name of ['upperarm_r','lowerarm_r','thigh_l','calf_l'])assert.ok(Math.hypot(...finish.find(j=>j.name===name).localRotation.map((v,i)=>v-base.find(j=>j.name===name).localRotation[i]))<1e-6,'source joint motion unchanged');
 const before=s.snapshot();await assert.rejects(s.call('compose_action',{actionId:'bad-contact',name:'Invalid',expectedRevision:0,steps:[{movementId:'move-punch',revision:1,speed:1,transition:0},{movementId:'move-punch',revision:1,speed:1,transition:.2,contact:'head'}]}),/Contact/);assert.deepEqual(s.snapshot(),before);
}));

test('split source phases compose without endpoint rounding exceeding duration',()=>fixture(async(s)=>{
 const m=s.pair('move-punch'),action=structuredClone(m.action);let from=0;action.phases=[.18,.22,.25,.35].map((duration,i)=>{const to=from+duration;const phase={id:'part-'+i,name:'Part '+i,intent:'Original source timing',duration,kind:'move',clip:'Punch_Cross',from,to};from=to;return phase;});await s.call('register_movement',{action,metadata:m.metadata,expectedRevision:1});
 const prepared=JSON.parse(await readFile('authoring/source/step-forward.json','utf8'));await s.call('register_movement',prepared);
 const result=await s.call('compose_action',{actionId:'rounded-end-test',name:'Rounded endpoint',expectedRevision:0,steps:[{movementId:'move-step-forward',revision:1,speed:1,transition:0},{movementId:'move-punch',revision:2,speed:1,transition:.3,contact:'left'}]});const baked=s.pair('rounded-end-test').action;assert.equal(baked.phases.length,7);for(const track of baked.tracks)assert.ok(track.keys.at(-1).time<=result.duration);
}));

test('UAL2 sync is idempotent, preserves edits and archives, and serves compact previews',()=>fixture(async(s)=>{
 const before=s.state.preview.actionId;const first=await s.call('sync_movement_library',{library:'ual2-standard',expectedSequence:s.state.sequence});assert.equal(first.added.length,43);assert.equal(s.state.preview.actionId,before);const id='move-ual2-melee-hook',p=s.pair(id),action=structuredClone(p.action);action.name='Edited hook';await s.call('register_movement',{action,metadata:p.metadata,expectedRevision:1});await s.call('archive_entry',{entryId:id,archived:true,expectedRevision:2});const next=await s.call('sync_movement_library',{library:'ual2-standard',expectedSequence:s.state.sequence});assert.equal(next.added.length,0);assert.equal(s.pair(id).action.name,'Edited hook');assert.ok(s.pair(id).archived);
 const preview=s.viewerSnapshot();assert.equal(preview.actions['move-ual2-sword-regular-a'].action.tracks.length,0);assert.equal(preview.actions['move-ual2-sword-regular-a'].previewOnly,true);await s.call('set_preview',{actionId:'move-ual2-sword-regular-a'});assert.ok(s.viewerSnapshot().actions['move-ual2-sword-regular-a'].action.tracks.length>0);await assert.rejects(s.call('sync_movement_library',{library:'ual2-standard',expectedSequence:0}),/stale/);
}));
test('UAL2 movement can be trimmed, retimed, revised and joined with its recovery',()=>fixture(async(s)=>{
 await s.call('sync_movement_library',{library:'ual2-standard',expectedSequence:s.state.sequence});const source=s.pair('move-ual2-melee-hook');const original=JSON.stringify(source.action);
 await s.call('adapt_movement',{sourceMovementId:'move-ual2-melee-hook',sourceRevision:1,movementId:'move-hook-fast',name:'Fast hook',from:.1,to:.9,speed:1.2,expectedRevision:0});const variant=s.pair('move-hook-fast').action,total=variant.phases.reduce((n,p)=>n+p.duration,0);assert.ok(Math.abs(total-source.action.phases[0].duration*.8/1.2)<1e-8);for(const t of variant.tracks){assert.equal(t.keys[0].time,0);assert.equal(t.keys.at(-1).time,total);}assert.equal(JSON.stringify(source.action),original);
 const joined=await s.call('compose_action',{actionId:'ual2-hook-test',name:'Hook + recovery',expectedRevision:0,steps:[{movementId:'move-hook-fast',revision:1,speed:1,transition:0},{movementId:'move-ual2-melee-hook-rec',revision:1,speed:1,transition:.12}]});assert.ok(joined.duration<2);const d=await s.call('get_diagnostics',{actionId:'ual2-hook-test',time:.25});assert.ok(d.poseSpeed.every(Number.isFinite));assert.equal(d.joints.length,65);
 await assert.rejects(s.call('adapt_movement',{sourceMovementId:'move-ual2-melee-hook',sourceRevision:0,movementId:'move-hook-fast',name:'Stale',from:0,to:1,speed:1,expectedRevision:1}),/Stale/);
}));

test('preview changes persist separately without rewriting the movement library',()=>fixture(async(s,dir)=>{
 await s.call('create_action',{action:make()});const path=join(dir,'project.json'),original=await readFile(path,'utf8');await s.call('set_preview',{actionId:'move-walk',time:.5,camera:'Side'});assert.equal(await readFile(path,'utf8'),original,'preview does not rewrite full project');const reopened=new Studio(process.cwd(),path);assert.deepEqual(reopened.state.preview,s.state.preview);assert.equal(reopened.state.sequence,s.state.sequence);await reopened.call('build_movement',{movementId:'move-preview-test',name:'Preview test',clip:'Idle_Loop',metadata:{source:'test',support:'unknown',travel:'in-place',notes:'test'},expectedRevision:0});const after=new Studio(process.cwd(),path);assert.equal(after.state.preview.actionId,'move-preview-test','older sidecar cannot override newer full project');
}));

test('movement profiles rank matching endpoints, persist, export and invalidate on revision',()=>fixture(async(s,dir)=>{
 const before=JSON.stringify(s.pair('move-guard').action);const result=await s.call('profile_movement_library',{expectedSequence:s.state.sequence});assert.equal(result.profiled.length,4);const guard=s.pair('move-guard');assert.equal(guard.profile.sourceRevision,1);assert.equal(JSON.stringify(guard.action),before);assert.ok(guard.profile.entry.positions.flat().every(Number.isFinite));assert.ok(guard.profile.travel.rootDistance<1e-6);const matches=await s.call('find_movement_connections',{movementId:'move-guard',sourceRevision:1,limit:4});assert.equal(matches[0].movementId,'move-guard');assert.equal(matches[0].fit,'near');assert.equal(matches[0].reviewed,false);await s.call('review_movement_profile',{movementId:'move-guard',sourceRevision:1,entrySupport:'both',exitSupport:'both',notes:'Reviewed held pose.'});assert.equal(new Studio(process.cwd(),join(dir,'project.json')).pair('move-guard').profile.review.exitSupport,'both');const doc=await s.call('export_project');assert.ok(doc.actions['move-guard'].profile);await assert.rejects(s.call('profile_movement_library',{expectedSequence:0}),/Stale/);await s.call('register_movement',{action:guard.action,metadata:guard.metadata,expectedRevision:1});await assert.rejects(s.call('find_movement_connections',{movementId:'move-guard',sourceRevision:2}),/Profile/);assert.equal((await s.call('list_movements')).find(m=>m.id==='move-guard').profile,null);await s.call('profile_movement_library',{expectedSequence:s.state.sequence});assert.equal(s.pair('move-guard').profile.sourceRevision,2);assert.equal(s.pair('move-guard').profile.review,undefined);
}));

test('single recipe revision retimes a hold, preserves sources/reference and seeks changed connections',()=>fixture(async(s,dir)=>{
 const steps=[{movementId:'move-guard',revision:1,speed:1,transition:0},{movementId:'move-kick',revision:1,speed:1,transition:.15},{movementId:'move-guard',revision:1,speed:1,transition:.15}];await s.call('compose_action',{actionId:'recipe-revision-test',name:'Recipe revision',steps,expectedRevision:0});const previous=JSON.stringify(s.pair('recipe-revision-test').action),source=JSON.stringify(s.pair('move-guard'));const result=await s.call('revise_action_recipe',{actionId:'recipe-revision-test',expectedRevision:1,changes:[{step:0,duration:.7},{step:1,speed:1.2,transition:.2}]});assert.equal(result.revision,2);assert.equal(result.recipe.steps[0].speed,.5/.7);assert.equal(result.recipe.steps[1].speed,1.2);assert.equal(JSON.stringify(s.pair('recipe-revision-test').reference),previous);assert.equal(JSON.stringify(s.pair('move-guard')),source);assert.equal(s.state.preview.time,result.inspection.start);assert.equal(s.state.preview.loop,false);assert.ok(result.inspection.end>result.inspection.start);const reloaded=new Studio(process.cwd(),join(dir,'project.json'));assert.deepEqual(reloaded.state.preview,s.state.preview);assert.deepEqual(reloaded.pair('recipe-revision-test').recipe,result.recipe);const before=JSON.stringify(s.snapshot());for(const changes of [[{step:0,duration:.01}],[{step:1,speed:2}],[{step:1,speed:1.1},{step:1,speed:1.2}],[{step:0,speed:.5},{step:1,speed:.5},{step:2,speed:.5}]])await assert.rejects(s.call('revise_action_recipe',{actionId:'recipe-revision-test',expectedRevision:2,changes}));assert.equal(JSON.stringify(s.snapshot()),before);await assert.rejects(s.call('revise_action_recipe',{actionId:'recipe-revision-test',expectedRevision:1,changes:[{step:0,speed:1}]}),/Stale/);
}));

test('run logs persist timestamped decisions and MCP successes/errors independently of motion',()=>fixture(async(s,dir)=>{
 const run=await s.call('begin_action_run',{prompt:'React and return to guard',actionId:'test-strike'});
 const projectBefore=await readFile(join(dir,'project.json'),'utf8');
 await s.call('append_action_run_event',{runId:run.id,phase:'selection',note:'Choose a standing chest reaction.'});
 await s.call('list_actions');
 await assert.rejects(s.call('get_action',{actionId:'missing-action'}),/Unknown action/);
 assert.equal(await readFile(join(dir,'project.json'),'utf8'),projectBefore,'logging never rewrites motion storage');
 await s.call('create_action',{action:make()});
 const done=await s.call('finish_action_run',{runId:run.id,status:'completed',note:'Checked final guard.'});
 assert.equal(done.actionRevision,1);assert.equal(done.toolCalls,3);
 const detail=await s.call('get_action_run',{runId:run.id});assert.equal(detail.events.length,6);
 const calls=detail.events.filter(e=>e.source==='mcp');assert.deepEqual(calls.map(e=>e.status),['completed','failed','completed']);
 for(const e of calls){assert.ok(!Number.isNaN(Date.parse(e.timestamp)));assert.ok(Date.parse(e.finishedAt)>=Date.parse(e.timestamp));assert.ok(e.elapsedMs>=0);}
 for(let i=1;i<detail.events.length;i++)assert.ok(detail.events[i].relativeMs>=detail.events[i-1].relativeMs);
 await s.call('list_actions');assert.equal((await s.call('get_action_run',{runId:run.id})).events.length,6,'closed runs do not capture further tools');
 const reopened=new Studio(process.cwd(),join(dir,'project.json'));assert.deepEqual(await reopened.call('get_action_run',{runId:run.id}),detail);
 assert.equal((await reopened.call('list_action_runs',{actionId:'test-strike'})).length,1);
}));
test('run lifecycle rejects conflicting starts and closed edits without altering logs',()=>fixture(async(s)=>{
 await assert.rejects(s.call('begin_action_run',{prompt:''}),/Invalid log/);
 const run=await s.call('begin_action_run',{prompt:'Test cancellation'});
 await assert.rejects(s.call('begin_action_run',{prompt:'Another'}),/active run/);
 await assert.rejects(s.call('append_action_run_event',{runId:run.id,phase:'selection',note:''}),/Invalid log/);
 await assert.rejects(s.call('finish_action_run',{runId:run.id,status:'invalid',note:'Bad'}),/Invalid run/);
 await s.call('finish_action_run',{runId:run.id,status:'cancelled',note:'Cancelled by user.'});
 const before=await s.call('get_action_run',{runId:run.id});
 await assert.rejects(s.call('append_action_run_event',{runId:run.id,phase:'late',note:'Too late'}),/closed/);
 assert.deepEqual(await s.call('get_action_run',{runId:run.id}),before);
 assert.equal((await s.call('begin_action_run',{prompt:'Next request'})).status,'running');
}));
test('nested authoring operations produce one timed top-level event',()=>fixture(async(s)=>{
 const run=await s.call('begin_action_run',{prompt:'Prepare a movement'});
 await s.call('build_movement',{movementId:'move-log-test',name:'Ready',clip:'Idle_Loop',from:0,to:.1,duration:.2,metadata:{source:'UAL1',support:'both',travel:'in-place',notes:''},expectedRevision:0});
 const d=await s.call('get_action_run',{runId:run.id});assert.equal(d.toolCalls,1);assert.equal(d.events[1].name,'build_movement');
}));
test('restart preserves an active run and marks unfinished service calls interrupted',()=>fixture(async(s,dir)=>{
 const run=await s.call('begin_action_run',{prompt:'Restart recovery test'});
 s.logs.event(run.id,{source:'mcp',name:'compose_action',phase:'tool',status:'running',startedAt:new Date().toISOString()});
 const reopened=new Studio(process.cwd(),join(dir,'project.json'));
 const d=await reopened.call('get_action_run',{runId:run.id});assert.equal(d.status,'running');assert.equal(d.events[1].status,'interrupted');assert.equal(d.events[1].elapsedMs,undefined);
 assert.equal(reopened.logs.data.activeRunId,run.id);
 await reopened.call('finish_action_run',{runId:run.id,status:'failed',note:'Operation interrupted on restart.'});
}));
