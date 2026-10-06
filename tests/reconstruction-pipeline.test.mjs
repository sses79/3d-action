import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {reconstruct,normalizeRequest,applyCorrections} from '../authoring/reconstruction/pipeline.mjs';
// Stage processes are replaced by fakes that write the files each real script produces, so caching is tested without Python.
const fixture=()=>{const dir=mkdtempSync(join(tmpdir(),'reconstruct-'));for(const f of ['video.mp4','python','model.pt','checkpoint.bin','lock.txt','asset.glb'])writeFileSync(join(dir,f),f);mkdirSync(join(dir,'vendor'));
 const calls=[],arg=(a,n)=>a[a.indexOf(n)+1];
 const env={python:join(dir,'python'),models:{yolo26s:join(dir,'model.pt'),yolo26n:join(dir,'model.pt')},checkpoint:join(dir,'checkpoint.bin'),vendor:join(dir,'vendor'),vendorCommit:'abc',lock:join(dir,'lock.txt'),asset:join(dir,'asset.glb'),cache:join(dir,'cache'),failStage:null,
  run:async(_python,a)=>{const stage=a[0].split('/').at(-1).replace('.py','');calls.push(stage);if(env.failStage===stage)throw Error('boom');const out=arg(a,'--out');
   if(stage==='observe'){const start=+arg(a,'--start');writeFileSync(join(out,'pose-report.json'),JSON.stringify({model:'fake',confidenceThreshold:.5,frames:[0,1,2].map(i=>({clipTime:i/30,time:start+i/30,detections:1,missingOrAmbiguousSubject:i===1,keypoints:i===1?[]:Array.from({length:17},(_,j)=>[0,0,i===2&&j===16?.2:.9])}))}));}
   else{const fit=stage==='fit';writeFileSync(join(out,'motion-ir.json'),JSON.stringify({times:[0,1],rootRelativePositions:[0,1].map(()=>Array.from({length:17},()=>[0,0,0])),backend:'fake',bridgedFrames:1,repairedLegObservations:[{side:'right',time:1.5}],...(fit?{fitting:{algorithm:a.includes('--stable')?'stable':'fitted',straightKneePrior:!a.includes('--no-straight-knee-prior'),projectionRMS:.01,segmentLengthRMS:.02,rejectedObservations:[]}}:{})}));}},
  retarget:(_ir,r)=>{calls.push('retarget');return {action:{id:r.actionId,name:r.name,phases:(r.phases||[{name:'Estimated motion',end:2}]).map(p=>({name:p.name,duration:1,kind:p.kind||'move'})),tracks:[1,2]},metadata:{}};}};
 return {dir,env,calls,request:{video:join(dir,'video.mp4'),start:1,end:3}};};
const ran=async(f,request)=>{f.calls.length=0;const {summary}=await reconstruct(process.cwd(),request,f.env);return [f.calls.join(','),summary];};

test('repeat requests reuse every stage and changed options rerun only downstream stages',async()=>{const f=fixture();try{
 let [calls,summary]=await ran(f,f.request);assert.equal(calls,'observe,lift,fit,retarget');assert.equal(summary.cachedStages,0);assert.equal(summary.status,'estimated-draft-unreviewed');
 assert.deepEqual([summary.observations.missingSubjectFrames,summary.observations.lowConfidenceBodyFrames,summary.estimate.bridgedFrames],[1,1,1]);assert.equal(summary.fitting.straightKneePrior,false);assert.deepEqual(summary.estimate.repairedLegObservations,[{side:'right',clipTime:.5}]);
 [calls,summary]=await ran(f,f.request);assert.equal(calls,'');assert.equal(summary.cachedStages,4);assert.ok(existsSync(summary.artifacts.action));
 assert.equal((await ran(f,{...f.request,phases:[{name:'A',end:1},{name:'B',end:2,kind:'fast'}]}))[0],'retarget');
 assert.equal((await ran(f,{...f.request,airborne:true}))[0],'retarget');
 {const [calls,summary]=await ran(f,{...f.request,corrections:[{type:'hold',part:'head',start:0,end:1}]});assert.equal(calls,'retarget');assert.equal(summary.stages.map(x=>x.stage).join(),'observe,lift,fit,correct,retarget');assert.equal(summary.corrections.length,1);}
 assert.equal((await ran(f,{...f.request,fit:'fitted'}))[0],'fit,retarget');
 assert.equal((await ran(f,{...f.request,straightKneePrior:true}))[0],'fit,retarget');
 [calls,summary]=await ran(f,{...f.request,fit:'none'});assert.equal(calls,'retarget');assert.deepEqual(summary.fitting,{mode:'none'});assert.equal(summary.stages.length,3);
 assert.equal((await ran(f,{...f.request,end:2.5}))[0],'observe,lift,fit,retarget');
 writeFileSync(join(f.dir,'video.mp4'),'different footage');assert.equal((await ran(f,f.request))[0],'observe,lift,fit,retarget');
 assert.equal((await ran(f,{...f.request,force:true}))[0],'observe,lift,fit,retarget');
}finally{rmSync(f.dir,{recursive:true,force:true});}});

test('a failed stage is reported, leaves no cache entry and does not block the next run',async()=>{const f=fixture();try{
 f.env.failStage='lift';await assert.rejects(ran(f,f.request),/lift stage failed: boom/);assert.deepEqual(readdirSync(f.env.cache).map(n=>n.split('-')[0]),['observe']);
 f.env.failStage=null;assert.equal((await ran(f,f.request))[0],'lift,fit,retarget');
}finally{rmSync(f.dir,{recursive:true,force:true});}});

test('requests are validated before any stage runs',async()=>{const f=fixture();try{
 for(const bad of [{end:1.2},{end:20},{detector:'other'},{fit:'none',straightKneePrior:true},{actionId:'move-kick'},{phases:[{name:'A',end:1}]},{phases:[{name:'A',end:2},{name:'B',end:1.5}]},{extra:1},{video:join(f.dir,'missing.mp4')}])await assert.rejects(reconstruct(process.cwd(),{...f.request,...bad},f.env));
 assert.equal(f.calls.length,0);assert.equal(normalizeRequest(f.request).fit,'stable');
 rmSync(join(f.dir,'checkpoint.bin'));await assert.rejects(reconstruct(process.cwd(),f.request,f.env),/Missing MotionBERT checkpoint/);
}finally{rmSync(f.dir,{recursive:true,force:true});}});

test('corrections change only the named part inside the window and keep its edges continuous',()=>{
 const make=()=>({times:Array.from({length:31},(_,i)=>10+i/30),rootRelativePositions:Array.from({length:31},(_,i)=>Array.from({length:17},(_,j)=>[j+(i%2?.1:-.1),i/30,0]))});
 const original=make().rootRelativePositions,smooth=applyCorrections(make(),[{type:'smooth',part:'left-leg',start:.3,end:.7,strength:3}],10).rootRelativePositions;
 const jitter=P=>{let s=0;for(let i=10;i<20;i++)s+=Math.abs(P[i+1][5][0]-2*P[i][5][0]+P[i-1][5][0]);return s;};
 assert.ok(jitter(smooth)<jitter(original)/4);assert.deepEqual(smooth[9],original[9]);assert.deepEqual(smooth[21],original[21]);assert.deepEqual(smooth[15][2],original[15][2]);assert.deepEqual(smooth[8],original[8]);assert.deepEqual(smooth[22],original[22]);
 const hold=applyCorrections(make(),[{type:'hold',part:'right-arm',start:.3,end:.7}],10).rootRelativePositions;
 assert.deepEqual(hold[12][15],original[9][15]);assert.deepEqual(hold[21][15],original[21][15]);assert.deepEqual(hold[12][12],original[12][12]);
 for(const bad of [{type:'twist',part:'left-leg',start:0,end:1},{type:'smooth',part:'tail',start:0,end:1},{type:'smooth',part:'legs',start:0,end:.05},{type:'smooth',part:'legs',start:1,end:9},{type:'hold',part:'legs',start:0,end:1,strength:2}])assert.throws(()=>normalizeRequest({video:'v.mp4',start:1,end:3,corrections:[bad]}));
 assert.equal(normalizeRequest({video:'v.mp4',start:1,end:3,corrections:[{type:'smooth',part:'legs',start:0,end:1}]}).corrections[0].strength,2);
});
