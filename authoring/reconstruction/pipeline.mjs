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
 const known=['video','start','end','detector','fit','straightKneePrior','airborne','sourceSpeed','decisions','phases','corrections','actionId','name','force','externalJoints','source','smooth','secondLook','despike','pose'];for(const k of Object.keys(args))if(!known.includes(k))fail('Unknown reconstruction option '+k);
 const {video,start,end,detector='yolo26s',fit='stable',straightKneePrior=false,airborne=false,sourceSpeed=1,decisions=false,phases,corrections,actionId='video-reconstruction-draft',name='Video · Reconstruction draft',force=false,externalJoints,secondLook=true,despike=true,pose='positions'}=args;
 if(!['positions','rotations'].includes(pose))fail('pose must be positions or rotations');
 if(typeof secondLook!=='boolean'||typeof despike!=='boolean')fail('secondLook and despike must be booleans');
 // source: 'auto' (default) uses the body model when it is installed and the request asks for nothing only the rule pipeline has;
 // otherwise the rule pipeline. Asking for a fit, the knee prior, vision decisions or external joints is asking for the rules.
 const rulesOnly=args.fit!==undefined||straightKneePrior||decisions||externalJoints!==undefined,source=args.source??'auto',smooth=args.smooth??(source==='rules'||rulesOnly?0:1);
 if(!['auto','rules','body'].includes(source))fail('source must be auto, rules or body');if(source==='body'&&rulesOnly)fail('source body takes no fit, straightKneePrior, decisions or externalJoints');
 if(!Number.isFinite(smooth)||smooth<0||smooth>1)fail('smooth must be 0–1');if(smooth>0&&(source==='rules'||rulesOnly))fail('smooth applies to source body');
 if(externalJoints!==undefined&&(typeof externalJoints!=='string'||!externalJoints||externalJoints.includes('\0')))fail('externalJoints must be a file path');
 if(typeof video!=='string'||!video||video.includes('\0'))fail('video must be a file path');
 if(![start,end].every(Number.isFinite)||start<0||end-start<limits.minWindow-1e-9||end-start>limits.maxWindow+1e-9)fail(`Window must be ${limits.minWindow}–${limits.maxWindow} seconds`);
 if(!limits.detectors.includes(detector))fail('detector must be '+limits.detectors.join(' or '));if(!limits.fits.includes(fit))fail('fit must be '+limits.fits.join(', '));
 if(typeof straightKneePrior!=='boolean'||typeof force!=='boolean'||typeof airborne!=='boolean'||typeof decisions!=='boolean')fail('straightKneePrior, airborne, decisions and force must be booleans');if(!Number.isFinite(sourceSpeed)||sourceSpeed<.1||sourceSpeed>1)fail('sourceSpeed must be 0.1–1 (1 = real time, 0.4 = footage slowed to 40%)');if(straightKneePrior&&fit==='none')fail('straightKneePrior needs a fit');
 if(!/^[-a-z0-9]{1,48}$/.test(actionId)||actionId.startsWith('move-'))fail('actionId must be a non-movement action ID');if(typeof name!=='string'||!name.trim()||name.length>80)fail('name must be 1–80 characters');
 const total=end-start;let at=0;
 if(phases!==undefined){if(!Array.isArray(phases)||!phases.length||phases.length>limits.maxPhases)fail(`phases must list 1–${limits.maxPhases} entries`);phases.forEach((p,i)=>{if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>48||!Number.isFinite(p.end)||p.end<=at+1e-6||(p.kind!==undefined&&!['move','fast','hold'].includes(p.kind))||Object.keys(p).some(k=>!['name','end','kind'].includes(k)))fail(`Invalid phase ${i}: needs name, ascending end in clip seconds and optional kind`);at=p.end;});if(Math.abs(at-total)>1e-3)fail(`Final phase must end at the window duration ${round(total)} s`);}
 if(corrections!==undefined){if(!Array.isArray(corrections)||corrections.length>8)fail('corrections must list at most 8 entries');corrections.forEach((c,i)=>{if(!c||!['smooth','hold'].includes(c.type)||!Object.hasOwn(bodyParts,c.part)||!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end>total+1e-6||c.end-c.start<.1||(c.type==='smooth'&&c.strength!==undefined&&(!Number.isInteger(c.strength)||c.strength<1||c.strength>5))||(c.type==='hold'&&c.strength!==undefined)||Object.keys(c).some(k=>!['type','part','start','end','strength'].includes(k)))fail(`Invalid correction ${i}: needs type smooth|hold, part ${Object.keys(bodyParts).join('|')}, start and end in clip seconds at least 0.1 s apart, and for smooth an optional strength 1–5`);});}
 return {video,start,end,detector,fit,straightKneePrior,airborne,sourceSpeed,decisions,corrections:corrections?.length?corrections.map(c=>({type:c.type,part:c.part,start:c.start,end:c.end,...(c.type==='smooth'?{strength:c.strength??2}:{})})):undefined,phases:phases?.map(p=>({name:p.name.trim(),end:p.end,...(p.kind?{kind:p.kind}:{})})),actionId,name:name.trim(),force,externalJoints,source:source==='auto'&&rulesOnly?'rules':source,requestedSource:source,smooth,secondLook,despike,pose};
}

// Bounded corrections act on the estimated joint positions of one body part inside one time window; nothing else moves.
export const bodyParts={'left-leg':[5,6],'right-leg':[2,3],'left-arm':[12,13],'right-arm':[15,16],head:[9,10],legs:[2,3,5,6],arms:[12,13,15,16]};
export function applyCorrections(ir,corrections,start){
 const P=ir.rootRelativePositions,clip=ir.times.map(t=>t-start);
 for(const c of corrections){const frames=clip.map((t,i)=>t>=c.start-1e-6&&t<=c.end+1e-6?i:-1).filter(i=>i>=0),joints=bodyParts[c.part];if(frames.length<3)continue;const first=frames[0],last=frames.at(-1);
  // smooth: repeated three-sample averaging inside the window; the window's first and last frames stay fixed, so its edges remain continuous.
  if(c.type==='smooth')for(let pass=0;pass<c.strength*2;pass++){const before=P.map(f=>f.map(v=>[...v]));for(const i of frames)if(i>first&&i<last)for(const j of joints)for(let k=0;k<3;k++)P[i][j][k]=(before[i-1][j][k]+2*before[i][j][k]+before[i+1][j][k])/4;}
  // hold: the part keeps its pose from the window start, easing back to the estimate over the last three frames.
  else{const pose=joints.map(j=>[...P[first][j]]);for(const i of frames){const w=Math.min(1,(last-i)/3);joints.forEach((j,n)=>{for(let k=0;k<3;k++)P[i][j][k]=P[i][j][k]*(1-w)+pose[n][k]*w;});}}
 }
 ir.corrections=corrections;return ir;
}
const fileHashes=new Map();
export async function hashFile(path){const s=statSync(path),tag=`${path}:${s.size}:${s.mtimeMs}`;if(fileHashes.has(tag))return fileHashes.get(tag);const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);const value=h.digest('hex');fileHashes.set(tag,value);return value;}

// Default stage process runner: resolves with stdout, rejects with the tail of stderr.
export function runProcess(command,args,cwd,timeoutMs=300000){return new Promise((done,reject)=>{const child=spawn(command,args,{cwd,stdio:['ignore','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error(`Stage timed out after ${timeoutMs/1000} s`));},timeoutMs);child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>{err=(err+d).slice(-4000);});child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?done(out):reject(Error((err.trim().split('\n').slice(-3).join(' | ')||out.trim()||'no output').slice(-600)));});});}

// environment: {python, models:{yolo26s,yolo26n}, checkpoint, vendor, lock, asset, cache, run?, retarget(ir,request),
//  comfy, bodyPython, bodyWeights, bodyReuse? (folder of earlier raw results, reused when the frames match)}
export function defaultEnvironment(root){const a=p=>resolve(root,p);return {python:a('.authoring/vision-venv/bin/python'),models:{yolo26s:a('.authoring/vision-models/yolo26s-pose.pt'),yolo26n:a('.authoring/vision-models/yolo26n-pose.pt')},checkpoint:a('.authoring/reconstruction-models/motionbert-lite.bin'),vendor:a('.authoring/vendor/MotionBERT'),lock:a('authoring/vision/requirements-lock.txt'),asset:a('editor/assets/character.glb'),cache:a('.authoring/reconstruction-cache'),comfy:a('.authoring/comfyui'),bodyPython:a('.authoring/comfyui/.venv/bin/python'),bodyWeights:'sam_3d_body_dinov3_bf16.safetensors',bodyReuse:a('.authoring/sam3d-trial')};}

let active=false;
export async function reconstruct(root,args,environment){
 if(active)fail('A reconstruction is already running');active=true;
 try{return await pipeline(root,normalizeRequest(args),{...defaultEnvironment(root),run:runProcess,...environment});}finally{active=false;}
}

async function pipeline(root,request,env){
 const began=performance.now(),video=isAbsolute(request.video)?request.video:resolve(root,request.video);
 if(!existsSync(video)||!statSync(video).isFile())fail('Video file not found');
 const bodyParts=[['ComfyUI checkout',env.comfy],['ComfyUI Python environment',env.bodyPython],['SAM 3D Body weights',env.comfy&&env.bodyWeights?join(env.comfy,'models/detection',env.bodyWeights):undefined]],bodyMissing=bodyParts.filter(([,path])=>!path||!existsSync(path)).map(([label])=>label);
 // Which source runs: asked for outright, or chosen. The choice and any reason for falling back are reported in the summary.
 let source=request.source==='auto'?(bodyMissing.length?'rules':'body'):request.source,fallbackReason=request.source==='auto'&&bodyMissing.length?`SAM 3D Body is not installed (missing ${bodyMissing.join(', ')})`:undefined;
 if(source==='body'&&bodyMissing.length)fail(`Missing ${bodyMissing[0]}`);
 const needRules=()=>{for(const [label,path] of [['MotionBERT checkpoint',env.checkpoint],['MotionBERT source',env.vendor]])if(!existsSync(path))fail(`Missing ${label}: ${path}`);};
 for(const [label,path] of [['Python environment',env.python],['detector model',env.models[request.detector]]])if(!existsSync(path))fail(`Missing ${label}: ${path}`);
 if(source==='rules')needRules();
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
 let motionDir;const observeKey=stages[0].key;
 // Source 'body': one model (SAM 3D Body) estimates the whole body per frame from the performer's boxes. The lift, the vision
 // decisions and the fit are not run; the retarget reads its joints, hip centre, lowest point and face direction directly.
 if(source==='body'){try{const weights=join(env.comfy,'models/detection',env.bodyWeights),comfyCommit=env.comfyCommit??execFileSync('git',['-C',env.comfy,'rev-parse','HEAD'],{encoding:'utf8'}).trim();motionDir=await stage('body',{code:await code(['body.py','mhr-rig.json']),observe:observeKey,weights:[env.bodyWeights,statSync(weights).size],comfy:comfyCommit,smooth:request.smooth,secondLook:request.secondLook,despike:request.despike},dir=>env.run(env.bodyPython,[script('body.py'),'--comfy',env.comfy,'--weights',env.bodyWeights,'--pose',join(observeDir,'pose-report.json'),'--video',video,'--out',dir,'--smooth',String(request.smooth),...(request.secondLook?[]:['--no-second-look']),...(request.despike?[]:['--no-despike']),...(env.bodyReuse&&existsSync(env.bodyReuse)?['--reuse',env.bodyReuse]:[])],root));}catch(error){if(request.source!=='auto')throw error;fallbackReason=`SAM 3D Body failed: ${String(error.message).slice(0,300)}`;source='rules';needRules();}}
 if(source==='rules'){
 const commit=env.vendorCommit??execFileSync('git',['-C',env.vendor,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 // Optional: a vision model (via OpenRouter) says which way the performer faces and which leg is raised. Frames leave this machine.
 const decideDir=request.decisions?await stage('decide',{code:await code(['decide.py']),observe:observeKey,model:env.decisionModel??'openai/gpt-6-luna'},dir=>env.run(env.python,[script('decide.py'),'--video',video,'--pose',join(observeDir,'pose-report.json'),'--out',dir,'--model',env.decisionModel??'openai/gpt-6-luna'],root)):null,decideKey=decideDir?stages.at(-1).key:null;
 const liftDir=await stage('lift',{code:await code(['lift.py','reobserve.py']),observe:observeKey,decide:decideKey,checkpoint:await hashFile(env.checkpoint),commit,sourceSpeed:request.sourceSpeed,environment:environmentKey},dir=>env.run(env.python,[script('lift.py'),'--pose',join(observeDir,'pose-report.json'),'--out',dir,'--speed',String(request.sourceSpeed),'--video',video,'--model',env.models[request.detector],...(decideDir?['--decisions',join(decideDir,'decisions.json')]:[])],root));const liftKey=stages.at(-1).key;
 motionDir=liftDir;
 // Trial: 3D joints from another model (H36M17 order, the lift's units and camera axes, one entry per source time) replace the
 // lift's joints. Everything the lift learned from the picture (2D input, bridges, pelvis track, face) is kept, so the fit and
 // the retarget run as usual on the other model's estimate. Times are matched to the nearest sample. If the file also gives
 // the lowest body point and the hip centre in the picture, those replace the detector's for height and travel.
 if(request.externalJoints){if(!existsSync(request.externalJoints))fail('externalJoints file not found');motionDir=await stage('external',{version:'external-v3',lift:liftKey,file:await hashFile(request.externalJoints)},async dir=>{const ir=JSON.parse(readFileSync(join(liftDir,'motion-ir.json'),'utf8')),ext=JSON.parse(readFileSync(request.externalJoints,'utf8'));if(!Array.isArray(ext.times)||!Array.isArray(ext.positions)||ext.times.length!==ext.positions.length||ext.positions.some(f=>f.length!==17||f.some(p=>p.length!==3||p.some(x=>!Number.isFinite(x)))))fail('externalJoints needs times and positions[frame][17][3]');const at=ir.times.map(t=>ext.times.reduce((best,x,i)=>Math.abs(x-t)<Math.abs(ext.times[best]-t)?i:best,0));ir.liftPositions=ir.rootRelativePositions;ir.rootRelativePositions=at.map(i=>ext.positions[i]);if(Array.isArray(ext.lowestBodyImageY)&&ext.lowestBodyImageY.length===ext.times.length){ir.lowestSupportImageY=at.map(i=>ext.lowestBodyImageY[i]);ir.lowestSupportSource='body';}if(Array.isArray(ext.imagePelvis)&&ext.imagePelvis.length===ext.times.length)ir.imagePelvis=at.map(i=>ext.imagePelvis[i]);ir.backend=`${ext.backend??'external joints'} (2D evidence from ${ir.backend})`;writeFileSync(join(dir,'motion-ir.json'),JSON.stringify(ir));});}
 const fitInput=motionDir;
 if(request.fit!=='none')motionDir=await stage('fit',{code:await code(['fit.py']),lift:stages.at(-1).key,mode:request.fit,straightKneePrior:request.straightKneePrior,sourceSpeed:request.sourceSpeed,environment:environmentKey},dir=>env.run(env.python,[script('fit.py'),'--input',join(fitInput,'motion-ir.json'),'--out',dir,...(request.fit==='stable'?['--stable']:[]),...(request.straightKneePrior?[]:['--no-straight-knee-prior']),'--speed',String(request.sourceSpeed)],root));
 }
 if(request.corrections)motionDir=await stage('correct',{version:'correct-v1',motion:stages.at(-1).key,start:request.start,corrections:request.corrections},async dir=>{const source=motionDir;writeFileSync(join(dir,'motion-ir.json'),JSON.stringify(applyCorrections(JSON.parse(readFileSync(join(source,'motion-ir.json'),'utf8')),request.corrections,request.start)));});
 const actionDir=await stage('retarget',{code:await code(['retarget.ts']),motion:stages.at(-1).key,asset:await hashFile(env.asset),actionId:request.actionId,name:request.name,pose:request.pose,airborne:request.airborne,sourceSpeed:request.sourceSpeed,phases:request.phases??null},async dir=>{const ir=JSON.parse(readFileSync(join(motionDir,'motion-ir.json'),'utf8')),result=await env.retarget(ir,request);writeFileSync(join(dir,'action.json'),JSON.stringify(result.action));writeFileSync(join(dir,'retarget-report.json'),JSON.stringify(result.metadata));});
 const pose=JSON.parse(readFileSync(join(observeDir,'pose-report.json'),'utf8')),ir=JSON.parse(readFileSync(join(motionDir,'motion-ir.json'),'utf8')),action=JSON.parse(readFileSync(join(actionDir,'action.json'),'utf8'));
 // Body landmarks only (shoulders to ankles); face points do not drive the estimate.
 const weak=pose.frames.filter(f=>f.keypoints.length===17&&f.keypoints.slice(5).some(k=>k[2]<pose.confidenceThreshold)).map(f=>round(f.clipTime)),missing=pose.frames.filter(f=>f.missingOrAmbiguousSubject).map(f=>round(f.clipTime));
 // A box touching the frame border means part of the subject is out of view; those poses are guesses.
 const [width,height]=pose.frameSize??[Infinity,Infinity],clipped=pose.frames.filter(f=>f.bbox&&(f.bbox[0]<=2||f.bbox[1]<=2||f.bbox[2]>=width-2||f.bbox[3]>=height-2)).map(f=>round(f.clipTime)),span=t=>t.length?[t[0],t.at(-1)]:null;
 const retargetReport=JSON.parse(readFileSync(join(actionDir,'retarget-report.json'),'utf8'));
 const summary={status:'estimated-draft-unreviewed',pose:retargetReport.pose??{requested:request.pose,used:'positions'},source:{requested:request.requestedSource,used:source,...(fallbackReason?{fallbackReason}:{})},video:{file:video,sha256:sourceSHA256,window,sourceSpeed:request.sourceSpeed},totalSeconds:round((performance.now()-began)/1000),cachedStages:stages.filter(s=>s.cached).length,stages:stages.map(s=>({...s,key:s.key.slice(0,20)})),
  observations:{frames:pose.frames.length,detector:pose.model,missingSubjectTimes:missing.slice(0,20),missingSubjectFrames:missing.length,lowConfidenceBodyTimes:weak.slice(0,20),lowConfidenceBodyFrames:weak.length,subjectClippedByFrameEdge:{frames:clipped.length,clipTimeRange:span(clipped)},peopleDetected:[Math.min(...pose.frames.map(f=>f.detections)),Math.max(...pose.frames.map(f=>f.detections))]},
  estimate:{...(ir.turnedSecondLook?{turnedSecondLook:{looked:ir.turnedSecondLook.frames.length,changed:ir.turnedSecondLook.changed.map(x=>({clipTime:round(x.time-request.start),turnedDegrees:x.turnedDegrees}))}}:{}),...(ir.despiked?{despiked:{frames:ir.despiked.frames.length,keypoints:ir.despiked.keypoints}}:{}),samples:ir.times.length,sampleRate:limits.sampleRate,backend:ir.backend,bridgedFrames:ir.bridgedFrames??0,repairedLegObservations:(ir.repairedLegObservations??[]).map(x=>({side:x.side,clipTime:round(x.time-request.start)})),reobservedLegFrames:(ir.reobservedLegFrames??[]).map(x=>({side:x.side,clipTime:round(x.time-request.start)})),swappedLegObservations:(ir.swappedLegObservations??[]).map(x=>round(x.time-request.start)),legArcBridges:(ir.legArcBridges??[]).map(b=>({side:b.side,from:round(b.from-request.start),to:round(b.to-request.start),sweepDegrees:Math.round(b.sweepDegrees)})),extendedLegReach:(ir.extendedLegReach??[]).map(x=>({side:x.side,clipTime:round(x.time-request.start),gain:round(x.reachGain,2)}))},
  corrections:request.corrections??[],decisions:ir.decisionSummary??null,fitting:ir.fitting?{mode:request.fit,algorithm:ir.fitting.algorithm,straightKneePrior:ir.fitting.straightKneePrior,projectionRMS:round(ir.fitting.projectionRMS,5),segmentLengthRMS:round(ir.fitting.segmentLengthRMS,5),rejectedObservations:ir.fitting.rejectedObservations.length,backwardKnee:ir.fitting.backwardKnee?.before,crossedLegs:ir.fitting.crossedLegs?.before,bodyPartsInside:ir.fitting.bodyPartsInside??null,legOverlap:ir.fitting.legOverlap?{before:round(ir.fitting.legOverlap.before,4),after:round(ir.fitting.legOverlap.after,4)}:undefined}:{mode:'none'},
  action:{id:action.id,name:action.name,duration:round(action.phases.reduce((s,p)=>s+p.duration,0)),phases:action.phases.map(p=>({name:p.name,duration:round(p.duration),kind:p.kind})),trackCount:action.tracks.length,peakLiftMeters:round(JSON.parse(readFileSync(join(actionDir,'retarget-report.json'),'utf8')).peakLiftMeters??0),bodyPartsInside:JSON.parse(readFileSync(join(actionDir,'retarget-report.json'),'utf8')).bodyPartsInside??null,jitter:JSON.parse(readFileSync(join(actionDir,'retarget-report.json'),'utf8')).jitter??null,jointRangesBeyondNormal:(JSON.parse(readFileSync(join(actionDir,'retarget-report.json'),'utf8')).jointRanges??[]).filter(x=>x.framesBeyond>0),file:join(actionDir,'action.json')},
  artifacts:{observations:join(observeDir,'pose-report.json'),motion:join(motionDir,'motion-ir.json'),action:join(actionDir,'action.json')},
  limits:['Single-camera estimate: depth, twist, foot orientation, mirroring and world scale are uncertain','Root travel is approximate image-X only; no contact, IK or balance solving','Subject selection is tallest-then-overlap, not identity tracking','Draft only: inspect against the video before registering any movement']};
 return {summary,action};
}
