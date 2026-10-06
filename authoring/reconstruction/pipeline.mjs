// Video -> estimated action orchestration. Each stage is cached under its own deterministic key, so repeated or
// partially changed requests rerun only the stages whose inputs changed. Results are drafts, never approved motion.
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream,existsSync,mkdirSync,readFileSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {isAbsolute,join,resolve} from 'node:path';
import {digest} from './contracts.mjs';

export const limits={minWindow:.5,maxWindow:8,sampleRate:30,maxPhases:32,detectors:['yolo26s','yolo26n'],fits:['stable','fitted','none']};
const fail=m=>{throw Error(m);};
const round=(x,n=3)=>Math.round(x*10**n)/10**n;

export function normalizeRequest(args){
 const known=['video','start','end','detector','fit','straightKneePrior','phases','actionId','name','force'];for(const k of Object.keys(args))if(!known.includes(k))fail('Unknown reconstruction option '+k);
 const {video,start,end,detector='yolo26s',fit='stable',straightKneePrior=false,phases,actionId='video-reconstruction-draft',name='Video · Reconstruction draft',force=false}=args;
 if(typeof video!=='string'||!video||video.includes('\0'))fail('video must be a file path');
 if(![start,end].every(Number.isFinite)||start<0||end-start<limits.minWindow-1e-9||end-start>limits.maxWindow+1e-9)fail(`Window must be ${limits.minWindow}–${limits.maxWindow} seconds`);
 if(!limits.detectors.includes(detector))fail('detector must be '+limits.detectors.join(' or '));if(!limits.fits.includes(fit))fail('fit must be '+limits.fits.join(', '));
 if(typeof straightKneePrior!=='boolean'||typeof force!=='boolean')fail('straightKneePrior and force must be booleans');if(straightKneePrior&&fit==='none')fail('straightKneePrior needs a fit');
 if(!/^[-a-z0-9]{1,48}$/.test(actionId)||actionId.startsWith('move-'))fail('actionId must be a non-movement action ID');if(typeof name!=='string'||!name.trim()||name.length>80)fail('name must be 1–80 characters');
 const total=end-start;let at=0;
 if(phases!==undefined){if(!Array.isArray(phases)||!phases.length||phases.length>limits.maxPhases)fail(`phases must list 1–${limits.maxPhases} entries`);phases.forEach((p,i)=>{if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>48||!Number.isFinite(p.end)||p.end<=at+1e-6||(p.kind!==undefined&&!['move','fast','hold'].includes(p.kind))||Object.keys(p).some(k=>!['name','end','kind'].includes(k)))fail(`Invalid phase ${i}: needs name, ascending end in clip seconds and optional kind`);at=p.end;});if(Math.abs(at-total)>1e-3)fail(`Final phase must end at the window duration ${round(total)} s`);}
 return {video,start,end,detector,fit,straightKneePrior,phases:phases?.map(p=>({name:p.name.trim(),end:p.end,...(p.kind?{kind:p.kind}:{})})),actionId,name:name.trim(),force};
}

const fileHashes=new Map();
export async function hashFile(path){const s=statSync(path),tag=`${path}:${s.size}:${s.mtimeMs}`;if(fileHashes.has(tag))return fileHashes.get(tag);const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);const value=h.digest('hex');fileHashes.set(tag,value);return value;}

// Default stage process runner: resolves with stdout, rejects with the tail of stderr.
export function runProcess(command,args,cwd,timeoutMs=300000){return new Promise((done,reject)=>{const child=spawn(command,args,{cwd,stdio:['ignore','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error(`Stage timed out after ${timeoutMs/1000} s`));},timeoutMs);child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>{err=(err+d).slice(-4000);});child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?done(out):reject(Error((err.trim().split('\n').slice(-3).join(' | ')||out.trim()||'no output').slice(-600)));});});}

// environment: {python, models:{yolo26s,yolo26n}, checkpoint, vendor, lock, asset, cache, run?, retarget(ir,request)}
export function defaultEnvironment(root){const a=p=>resolve(root,p);return {python:a('.authoring/vision-venv/bin/python'),models:{yolo26s:a('.authoring/vision-models/yolo26s-pose.pt'),yolo26n:a('.authoring/vision-models/yolo26n-pose.pt')},checkpoint:a('.authoring/reconstruction-models/motionbert-lite.bin'),vendor:a('.authoring/vendor/MotionBERT'),lock:a('authoring/vision/requirements-lock.txt'),asset:a('editor/assets/character.glb'),cache:a('.authoring/reconstruction-cache')};}

let active=false;
export async function reconstruct(root,args,environment){
 if(active)fail('A reconstruction is already running');active=true;
 try{return await pipeline(root,normalizeRequest(args),{...defaultEnvironment(root),run:runProcess,...environment});}finally{active=false;}
}

async function pipeline(root,request,env){
 const began=performance.now(),video=isAbsolute(request.video)?request.video:resolve(root,request.video);
 if(!existsSync(video)||!statSync(video).isFile())fail('Video file not found');
 for(const [label,path] of [['Python environment',env.python],['detector model',env.models[request.detector]],['MotionBERT checkpoint',env.checkpoint],['MotionBERT source',env.vendor]])if(!existsSync(path))fail(`Missing ${label}: ${path}`);
 const script=name=>resolve(root,'authoring/reconstruction',name),code=async names=>digest(await Promise.all(names.map(n=>hashFile(script(n)))));
 const sourceSHA256=await hashFile(video),window=[request.start,request.end],stages=[];mkdirSync(env.cache,{recursive:true});
 // Runs produce(dir) into a temporary folder and publish it atomically; a failed stage leaves no cache entry.
 const stage=async(name,inputs,produce)=>{
  const key=digest({stage:name,...inputs}),dir=join(env.cache,`${name}-${key.slice(0,20)}`),meta=join(dir,'stage.json');
  if(!request.force&&existsSync(meta)){const saved=JSON.parse(readFileSync(meta,'utf8'));if(saved.key===key){stages.push({stage:name,key,cached:true,seconds:0,originalSeconds:saved.seconds});return dir;}}
  const tmp=`${dir}.tmp-${process.pid}`,t=performance.now();rmSync(tmp,{recursive:true,force:true});mkdirSync(tmp,{recursive:true});
  try{await produce(tmp);const seconds=round((performance.now()-t)/1000);writeFileSync(join(tmp,'stage.json'),JSON.stringify({stage:name,key,inputs,seconds,createdAt:new Date().toISOString()}));rmSync(dir,{recursive:true,force:true});renameSync(tmp,dir);stages.push({stage:name,key,cached:false,seconds});return dir;}
  catch(e){rmSync(tmp,{recursive:true,force:true});throw Error(`${name} stage failed: ${e.message}`);}
 };
 const environmentKey=existsSync(env.lock)?await hashFile(env.lock):'unpinned';
 const observeDir=await stage('observe',{code:await code(['observe.py']),sourceSHA256,window,model:await hashFile(env.models[request.detector]),environment:environmentKey},dir=>env.run(env.python,[script('observe.py'),'--video',video,'--sha256',sourceSHA256,'--start',String(request.start),'--end',String(request.end),'--model',env.models[request.detector],'--out',dir],root));
 const commit=env.vendorCommit??execFileSync('git',['-C',env.vendor,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const liftDir=await stage('lift',{code:await code(['lift.py']),observe:stages[0].key,checkpoint:await hashFile(env.checkpoint),commit,environment:environmentKey},dir=>env.run(env.python,[script('lift.py'),'--pose',join(observeDir,'pose-report.json'),'--out',dir],root));
 let motionDir=liftDir;
 if(request.fit!=='none')motionDir=await stage('fit',{code:await code(['fit.py']),lift:stages[1].key,mode:request.fit,straightKneePrior:request.straightKneePrior,environment:environmentKey},dir=>env.run(env.python,[script('fit.py'),'--input',join(liftDir,'motion-ir.json'),'--out',dir,...(request.fit==='stable'?['--stable']:[]),...(request.straightKneePrior?[]:['--no-straight-knee-prior'])],root));
 const actionDir=await stage('retarget',{code:await code(['retarget.ts']),motion:stages.at(-1).key,asset:await hashFile(env.asset),actionId:request.actionId,name:request.name,phases:request.phases??null},async dir=>{const ir=JSON.parse(readFileSync(join(motionDir,'motion-ir.json'),'utf8')),result=await env.retarget(ir,request);writeFileSync(join(dir,'action.json'),JSON.stringify(result.action));writeFileSync(join(dir,'retarget-report.json'),JSON.stringify(result.metadata));});
 const pose=JSON.parse(readFileSync(join(observeDir,'pose-report.json'),'utf8')),ir=JSON.parse(readFileSync(join(motionDir,'motion-ir.json'),'utf8')),action=JSON.parse(readFileSync(join(actionDir,'action.json'),'utf8'));
 // Body landmarks only (shoulders to ankles); face points do not drive the estimate.
 const weak=pose.frames.filter(f=>f.keypoints.length===17&&f.keypoints.slice(5).some(k=>k[2]<pose.confidenceThreshold)).map(f=>round(f.clipTime)),missing=pose.frames.filter(f=>f.missingOrAmbiguousSubject).map(f=>round(f.clipTime));
 // A box touching the frame border means part of the subject is out of view; those poses are guesses.
 const [width,height]=pose.frameSize??[Infinity,Infinity],clipped=pose.frames.filter(f=>f.bbox&&(f.bbox[0]<=2||f.bbox[1]<=2||f.bbox[2]>=width-2||f.bbox[3]>=height-2)).map(f=>round(f.clipTime)),span=t=>t.length?[t[0],t.at(-1)]:null;
 const summary={status:'estimated-draft-unreviewed',video:{file:video,sha256:sourceSHA256,window},totalSeconds:round((performance.now()-began)/1000),cachedStages:stages.filter(s=>s.cached).length,stages:stages.map(s=>({...s,key:s.key.slice(0,20)})),
  observations:{frames:pose.frames.length,detector:pose.model,missingSubjectTimes:missing.slice(0,20),missingSubjectFrames:missing.length,lowConfidenceBodyTimes:weak.slice(0,20),lowConfidenceBodyFrames:weak.length,subjectClippedByFrameEdge:{frames:clipped.length,clipTimeRange:span(clipped)},peopleDetected:[Math.min(...pose.frames.map(f=>f.detections)),Math.max(...pose.frames.map(f=>f.detections))]},
  estimate:{samples:ir.times.length,sampleRate:limits.sampleRate,backend:ir.backend,bridgedFrames:ir.bridgedFrames??0},
  fitting:ir.fitting?{mode:request.fit,algorithm:ir.fitting.algorithm,straightKneePrior:ir.fitting.straightKneePrior,projectionRMS:round(ir.fitting.projectionRMS,5),segmentLengthRMS:round(ir.fitting.segmentLengthRMS,5),rejectedObservations:ir.fitting.rejectedObservations.length}:{mode:'none'},
  action:{id:action.id,name:action.name,duration:round(action.phases.reduce((s,p)=>s+p.duration,0)),phases:action.phases.map(p=>({name:p.name,duration:round(p.duration),kind:p.kind})),trackCount:action.tracks.length,file:join(actionDir,'action.json')},
  artifacts:{observations:join(observeDir,'pose-report.json'),motion:join(motionDir,'motion-ir.json'),action:join(actionDir,'action.json')},
  limits:['Single-camera estimate: depth, twist, foot orientation, mirroring and world scale are uncertain','Root travel is approximate image-X only; no contact, IK or balance solving','Subject selection is tallest-then-overlap, not identity tracking','Draft only: inspect against the video before registering any movement']};
 return {summary,action};
}
