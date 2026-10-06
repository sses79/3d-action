import {request} from '../../cli-lib.mjs';import {readFile,writeFile} from 'node:fs/promises';
const dir='authoring/reviews/sword-completion',input=JSON.parse(await readFile(dir+'/inputs.json','utf8')),call=(n,a)=>request('http://127.0.0.1:5174',n,a);
const step=s=>{const m=input.library.items.find(m=>m.id==='move-ual2-sword-regular-'+s);return {movementId:m.id,revision:m.revision,speed:1};};
const id='sword-tight-join-review',spec={schemaVersion:1,rig:'quaternius-ual1',id,name:'Sword · Shorter first join',intent:'Compare a 0.06-second A→B blend with the 0.12-second baseline, retaining B→C for inspection.',steps:[step('a'),{...step('b'),connection:{contractId:'regular-a-to-b',duration:.06}},{...step('c'),connection:{contractId:'regular-b-to-c',duration:.12}}]};
const {result:actions}=await call('list_actions',{}),expectedRevision=actions.find(a=>a.id===id)?.revision??0;
await call('build_action_spec',{spec,expectedRevision,commit:false});const {result:built}=await call('build_action_spec',{spec,expectedRevision,commit:true});const {result:report}=await call('inspect_motion_quality',{actionId:id,sourceRevision:built.revision});await writeFile(dir+'/tight-build.json',JSON.stringify({built,report},null,2)+'\n');
const cases=[];
for(const [id,r] of Object.entries(input.reports)){
 const times=new Set(Array.from({length:7},(_,i)=>r.window.end*i/6));
 for(const c of r.candidateContacts)for(const t of [c.start,(c.start+c.end)/2,c.end])times.add(t);
 cases.push([id,[...times].sort((a,b)=>a-b)]);
}
const recoveries=JSON.parse(await readFile(dir+'/recovery-builds.json','utf8')).results;
for(const r of [...recoveries,{id,built,report}]){
 const total=r.report.window.end,times=new Set(Array.from({length:9},(_,i)=>total*i/8));
 for(const range of r.built.receipt.inspection.slice(1))for(const t of [range.joinStart,(range.joinStart+range.start)/2,range.start])times.add(t);
 cases.push([r.id,[...times].sort((a,b)=>a-b)]);
}
cases.push(['sword-joined-study',[.4333333373,.4933333373,.5533333373,1.0866666985,1.1466666985,1.2066666985]]);
await writeFile(dir+'/capture-cases.json',JSON.stringify(cases,null,2)+'\n');
await call('append_action_run_event',{runId:input.runId,phase:'timing-sweep',note:'20 transient production-compiler pair builds at 1/60,1/30,.06,.12,.2s. A→B .06 reduces both sampled velocity jumps below thresholds; B→C flags persist at all tested values. Created separate shorter-first-join action. Source and original studies unchanged. Numerical sweep is not visual approval.'});
console.log(JSON.stringify({cases:cases.length,frames:cases.reduce((n,c)=>n+2*c[1].length,0),tightFlags:report.diagnostics.map(d=>d.code)}));
