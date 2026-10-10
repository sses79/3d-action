import * as THREE from 'three/webgpu';
import {Action,clone,duration,validateAction} from './action';
import {CharacterPlayer} from './player';
import {rigManifest} from './rig';
import {hermite,rotationBridge} from './connection';
import {kickBaseline} from './kick';
export type MovementMetadata={source:string;support:'both'|'left'|'right'|'unknown';travel:'in-place'|'source';notes:string};
export type MovementStep={movementId:string;revision:number;speed:number;transition:number;contact?:'left'|'right';blend?:'pose'|'velocity';travel?:'source'|'continue'};
export function seedMovements(){
 const guard=clone(kickBaseline);guard.id='move-guard';guard.name='Kick guard';guard.phases=[{id:'guard',name:'Guard',intent:'Hold the kick source’s own starting stance',duration:.5,kind:'hold',clip:'A_TPose',from:0,to:0}];guard.tracks=guard.tracks!.map(t=>({...t,keys:[{time:0,value:t.keys[0].value}]}));
 const kick=clone(kickBaseline);kick.id='move-kick';kick.name='Forward kick';
 const source=(id:string,name:string,clip:string):Action=>({version:2,rig:'quaternius-ual1',id,name,phases:[{id:'motion',name,intent:'Unmodified source movement; review before composition',duration:rigManifest.clipDurations[clip as keyof typeof rigManifest.clipDurations],kind:'move',clip,from:0,to:1}],tracks:[],cues:[]});
 return [{action:guard,metadata:{source:'Mesh2Motion Kick_Breach · adapted CC0',support:'both',travel:'in-place',notes:'Starting stance of the kick; suitable for kick entry/exit.'}}, {action:kick,metadata:{source:'Mesh2Motion Kick_Breach · adapted CC0',support:'left',travel:'in-place',notes:'Right-leg forward kick with left-ball contact correction.'}}, {action:source('move-punch','Right cross','Punch_Cross'),metadata:{source:'Quaternius UAL1 · CC0',support:'unknown',travel:'source',notes:'Source clip only; contact compatibility has not been established.'}}, {action:source('move-walk','Walk cycle','Walk_Loop'),metadata:{source:'Quaternius UAL1 · CC0',support:'unknown',travel:'source',notes:'Complete source cycle, not yet a verified single step.'}}] as {action:Action;metadata:MovementMetadata}[];
}
// Bake source poses and explicit connection phases. This is pose blending, not IK.
export function composeMovements(model:THREE.Object3D,clips:THREE.AnimationClip[],scale:number,id:string,name:string,steps:{action:Action;speed:number;transition:number;contact?:'left'|'right';blend?:'pose'|'velocity';travel?:'source'|'continue';facing?:'source'|'continue'|'target';aim?:number;order?:'together'|'turn-first'}[]):Action{
 if(!steps.length||steps.length>8)throw Error('Compose 1–8 movements');
 const phases:Action['phases']=[],segments:{start:number;end:number;step:number;blend:boolean}[]=[];let total=0;
 steps.forEach((s,i)=>{if(!Number.isFinite(s.speed)||s.speed<.5||s.speed>1.5||!Number.isFinite(s.transition)||s.transition<0||s.transition>1||i===0&&s.transition!==0)throw Error('Use speed 0.5–1.5, transition 0–1 seconds, first transition 0');
  if(s.blend!==undefined&&!['pose','velocity'].includes(s.blend)||s.travel!==undefined&&!['source','continue'].includes(s.travel)||s.facing!==undefined&&!['source','continue','target'].includes(s.facing)||s.contact&&(s.blend==='velocity'||s.travel==='continue'||(s.facing??'source')!=='source')||!i&&(s.blend||s.travel||s.facing||s.aim!==undefined||s.order)||s.aim!==undefined&&(s.facing!=='target'||!Number.isFinite(s.aim)||s.aim<0||s.aim>1)||s.order!==undefined&&!['together','turn-first'].includes(s.order)||s.order==='turn-first'&&!!s.contact)throw Error('Invalid connection mode; velocity/travel continuation does not support anchoring');
  if(i&&s.transition===0)throw Error('A connection phase is required between movements');
  if(i){phases.push({id:`join-${i}`,name:`Join → ${s.action.name}`,intent:s.contact?`Keep ${s.contact} toe in place with whole-body translation; rear foot remains free`:'Smooth pose connection; review support and balance',duration:s.transition,kind:'move',clip:'A_TPose',from:0,to:0});segments.push({start:total,end:total+s.transition,step:i,blend:true});total+=s.transition;}
  for(const p of s.action.phases)phases.push({...p,id:`m${i}-${p.id}`,duration:p.duration/s.speed,clip:'A_TPose',from:0,to:0});segments.push({start:total,end:total+duration(s.action)/s.speed,step:i,blend:false});total+=duration(s.action)/s.speed;
 });
 // Phase sums can differ from segment sums by a floating-point epsilon. Use one endpoint.
 total=phases.reduce((n,p)=>n+p.duration,0);segments.at(-1)!.end=total;
 if(total>4)throw Error('This first composer supports actions up to 4 seconds (256 baked keys per track)');
 const restHead=model.getObjectByName('Head')!.getWorldQuaternion(new THREE.Quaternion());
 const player=new CharacterPlayer(model,clips,scale),bones:THREE.Object3D[]=[];model.traverse(b=>{if((b as THREE.Bone).isBone)bones.push(b)});
 const capture=(a:Action,t:number)=>{player.sample(a,t);return {hips:model.getObjectByName('thigh_l')!.getWorldPosition(new THREE.Vector3()).sub(model.getObjectByName('thigh_r')!.getWorldPosition(new THREE.Vector3())),feet:{left:model.getObjectByName('ball_l')!.getWorldPosition(new THREE.Vector3()),right:model.getObjectByName('ball_r')!.getWorldPosition(new THREE.Vector3())},root:{p:model.position.clone(),q:model.quaternion.clone(),s:model.scale.clone()},bones:bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}))};};
 const offsets:THREE.Vector3[]=steps.map(()=>new THREE.Vector3());
 // Facing continuation. Each movement faces wherever its source did (a video clip faces wherever the camera saw the performer),
 // so a join would otherwise turn the body by the difference as well as blend the pose. With facing 'continue' the incoming
 // movement is turned about the vertical so that its hips at entry point the way the previous movement's hips point at exit,
 // and its travel turns with it. The hip line (left hip to right hip, seen from above) is the measure; where it is closer to
 // vertical than horizontal (a body on its side) the facing cannot be read and the previous turn is kept.
 const yaws:number[]=steps.map(()=>0),turns:THREE.Quaternion[]=steps.map(()=>new THREE.Quaternion()),up=new THREE.Vector3(0,1,0),heading=(h:THREE.Vector3)=>Math.hypot(h.x,h.z)>Math.abs(h.y)?Math.atan2(h.x,h.z):null;
 // Facing 'target' is for combat: the opponent stands in one place for the whole action, in front of the first movement
 // (where its head faces as it starts). A step with facing 'target' is turned so that its own head faces that way as it
 // starts. A performer looks at what they attack, so the head's direction at the start of a clip is the attack direction,
 // whatever the hips and the travel do during a spin; and a stance placed after an attack faces the opponent again instead
 // of wherever the attack left the body. Unlike 'continue' the turn does not depend on the previous movement. Where the head
 // points more up or down than along the floor, the hips' facing stands in.
 const looking=(a:Action,t:number)=>{const pose=capture(a,t),f=new THREE.Vector3(0,0,1).applyQuaternion(model.getObjectByName('Head')!.getWorldQuaternion(new THREE.Quaternion()).multiply(restHead.clone().invert()));return Math.hypot(f.x,f.z)>Math.abs(f.y)?Math.atan2(f.x,f.z):Math.hypot(pose.hips.x,pose.hips.z)>Math.abs(pose.hips.y)?Math.atan2(-pose.hips.z,pose.hips.x):null;},target=looking(steps[0].action,0);
 for(let i=1;i<steps.length;i++){const mode=steps[i].facing??'source';yaws[i]=mode==='continue'?yaws[i-1]:0;
  if(mode==='continue'){const out=heading(capture(steps[i-1].action,duration(steps[i-1].action)).hips),into=heading(capture(steps[i].action,0).hips);if(out!==null&&into!==null)yaws[i]=yaws[i-1]+out-into;}
  /* aim: the moment in this movement, as a fraction of its length, when its head is on the opponent (the strike of a spinning attack, say); the start by default */if(mode==='target'){const into=looking(steps[i].action,duration(steps[i].action)*(steps[i].aim??0));if(target!==null&&into!==null)yaws[i]=target-into;else yaws[i]=yaws[i-1];}
  turns[i].setFromAxisAngle(up,yaws[i]);}
 for(let i=1;i<steps.length;i++){const contact=steps[i].contact;if(contact!==undefined&&!['left','right'].includes(contact))throw Error('Contact must be left or right');if(steps[i].travel==='continue'){const prev=steps[i-1],next=steps[i],h0=Math.min(1/60,duration(prev.action)/prev.speed),h1=Math.min(1/60,duration(next.action)/next.speed),a=capture(prev.action,duration(prev.action)),b=capture(next.action,0),va=a.root.p.clone().sub(capture(prev.action,duration(prev.action)-h0*prev.speed).root.p).divideScalar(h0),vb=capture(next.action,h1*next.speed).root.p.clone().sub(b.root.p).divideScalar(h1);offsets[i].copy(a.root.p.applyQuaternion(turns[i-1])).sub(b.root.p.applyQuaternion(turns[i])).add(offsets[i-1]).addScaledVector(va.applyQuaternion(turns[i-1]).add(vb.applyQuaternion(turns[i])),next.transition/2);/* travel continues along the floor only: each movement's root height is measured from the floor, so carrying a height difference would leave everything after it floating or sunk */offsets[i].y=0;}
  if(contact){const prev=capture(steps[i-1].action,duration(steps[i-1].action)),next=capture(steps[i].action,0);offsets[i].copy(prev.feet[contact]).sub(next.feet[contact]).divideScalar(scale).add(offsets[i-1]);}}
 const place=(pose:ReturnType<typeof capture>,i:number)=>{pose.root.p.applyQuaternion(turns[i]).add(offsets[i]);pose.root.q.premultiply(turns[i]);return pose;};
 const bridges=steps.map((step,i)=>{if(!i||step.blend!=='velocity')return null;const previous=steps[i-1],h0=Math.min(1/60,duration(previous.action)/previous.speed),h1=Math.min(1/60,duration(step.action)/step.speed);return {a:place(capture(previous.action,duration(previous.action)),i-1),b:place(capture(step.action,0),i),before:place(capture(previous.action,duration(previous.action)-h0*previous.speed),i-1),after:place(capture(step.action,h1*step.speed),i),h0,h1};});
 const tracks:NonNullable<Action['tracks']>=[];for(const target of ['$root',...bones.map(b=>b.name)])for(const property of ['rotation','position','scale'] as const)tracks.push({target,property,mode:'absolute',interpolation:'linear',keys:[]});
 const times=new Set<number>([0,total]);for(let t=1/60;t<total;t+=1/60)times.add(t);for(const s of segments){times.add(s.start);times.add(s.end);}if(times.size>256)throw Error('Composition exceeds baked sample limit; shorten action');
 for(const time of [...times].sort((a,b)=>a-b)){
  const seg=segments.find(s=>time<s.end)||segments.at(-1)!;const step=steps[seg.step];let pose:{root:{p:THREE.Vector3;q:THREE.Quaternion;s:THREE.Vector3};bones:{p:THREE.Vector3;q:THREE.Quaternion;s:THREE.Vector3}[]};
  if(seg.blend){const previous=steps[seg.step-1];const a=place(capture(previous.action,duration(previous.action)),seg.step-1),b=place(capture(step.action,0),seg.step);const x=(time-seg.start)/(seg.end-seg.start),u=x*x*(3-2*x);
   // order 'turn-first': the body turns to its new facing early in the join and takes up the new pose (height, limbs) late,
   // as a person turns toward something and then drops into a stance. The turn is the root's and the pelvis's rotation; they
   // run ahead of the clock and everything else runs behind it, by 0.3 sin^2(pi x): 80% and 20% of the way at mid-join.
   // That offset has no slope at either end, so the speeds at both ends of the join are the ones the plain join has.
   const lead=step.order==='turn-first'?.3*Math.sin(Math.PI*x)**2:0,ease=(y:number)=>y*y*(3-2*y),pelvisAt=bones.findIndex(b=>b.name==='pelvis');
   const blend=(v:typeof a.root,w:typeof a.root,turning:boolean)=>({p:v.p.lerp(w.p,ease(x-lead)),q:v.q.slerp(w.q,ease(turning?x+lead:x-lead)),s:v.s.lerp(w.s,u)});const bridge=bridges[seg.step];if(bridge){const {a,b,before,after,h0,h1}=bridge;const velocityBlend=(v:typeof a.root,w:typeof a.root,p:typeof a.root,n:typeof a.root,turning:boolean)=>({p:hermite(v.p,w.p,v.p.clone().sub(p.p).divideScalar(h0),n.p.clone().sub(w.p).divideScalar(h1),x-lead,step.transition),q:rotationBridge(v.q,w.q,p.q,n.q,turning?x+lead:x-lead,step.transition,h0,h1),s:v.s.clone().lerp(w.s,u)});pose={root:velocityBlend(a.root,b.root,before.root,after.root,true),bones:a.bones.map((v,j)=>velocityBlend(v,b.bones[j],before.bones[j],after.bones[j],j===pelvisAt))};}else pose={root:blend(a.root,b.root,true),bones:a.bones.map((v,i)=>blend(v,b.bones[i],i===pelvisAt))};
   if(step.contact){model.position.copy(pose.root.p);model.quaternion.copy(pose.root.q);model.scale.copy(pose.root.s);bones.forEach((bone,j)=>{bone.position.copy(pose.bones[j].p);bone.quaternion.copy(pose.bones[j].q);bone.scale.copy(pose.bones[j].s);});model.updateMatrixWorld(true);const foot=model.getObjectByName(step.contact==='left'?'ball_l':'ball_r')!.getWorldPosition(new THREE.Vector3());const anchor=a.feet[step.contact].clone().addScaledVector(offsets[seg.step-1],scale);pose.root.p.add(anchor.sub(foot).divideScalar(scale));}
}
  else pose=place(capture(step.action,Math.min(duration(step.action),(time-seg.start)*step.speed)),seg.step);
  const values=[pose.root,...pose.bones];for(let j=0;j<values.length;j++){const v=values[j];tracks[j*3].keys.push({time,value:v.q.normalize().toArray()});tracks[j*3+1].keys.push({time,value:v.p.clone().multiplyScalar(j===0?scale:1).toArray()});tracks[j*3+2].keys.push({time,value:v.s.toArray()});}
 }
 for(const track of tracks){const first=track.keys[0].value;if(track.keys.every(k=>k.value.every((v,i)=>Math.abs(v-first[i])<1e-7)))track.keys=[track.keys[0]];}
 const cues:NonNullable<Action['cues']>=[];for(const seg of segments.filter(s=>!s.blend))for(const cue of steps[seg.step].action.cues||[])cues.push({...cue,time:seg.start+cue.time/steps[seg.step].speed});
 // Bone scale/position channels are retained so source playback is reproduced exactly.
 return validateAction({version:2,rig:'quaternius-ual1',id,name,phases,tracks,cues});
}
