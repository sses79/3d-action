import * as THREE from 'three/webgpu';
import {Action, locate, rootHeight, actionId, trackValue, duration} from './action';
// The editor and future game both evaluate this adapter at absolute time.
export class CharacterPlayer {
 mixer:THREE.AnimationMixer; actions:Map<string,THREE.AnimationAction>; model:THREE.Object3D; assetScale:number; baseScale:THREE.Vector3; restTransforms:{bone:THREE.Object3D;p:THREE.Vector3;q:THREE.Quaternion;s:THREE.Vector3}[]=[]; nodes=new Map<string,THREE.Object3D>(); rootRotation:THREE.Quaternion; rootPosition:THREE.Vector3; baseRotations:{bone:THREE.Object3D;q:THREE.Quaternion}[]=[];
 constructor(model:THREE.Object3D,clips:THREE.AnimationClip[],assetScale=1){this.model=model;this.rootRotation=model.quaternion.clone();this.rootPosition=model.position.clone();this.baseScale=model.scale.clone();this.assetScale=assetScale;this.mixer=new THREE.AnimationMixer(model);this.actions=new Map(clips.map(c=>[c.name,this.mixer.clipAction(c)]));model.traverse(bone=>{this.nodes.set(bone.name,bone);if((bone as THREE.Bone).isBone){this.baseRotations.push({bone,q:bone.quaternion.clone()});this.restTransforms.push({bone,p:bone.position.clone(),q:bone.quaternion.clone(),s:bone.scale.clone()});}});}
 sample(action:Action,time:number,idle=false){
  this.mixer.stopAllAction();
  this.model.scale.copy(this.baseScale);
  this.model.quaternion.copy(this.rootRotation);this.model.position.copy(this.rootPosition);
  for(const e of this.restTransforms){e.bone.position.copy(e.p);e.bone.quaternion.copy(e.q);e.bone.scale.copy(e.s);}
  const at=locate(action,time);const entries:{name:string;time:number;weight:number}[]=[];
  if(idle)entries.push({name:'Idle_Loop',time:time%2.5,weight:1});
  else {
   const c=this.actions.get(at.phase.clip)!;entries.push({name:at.phase.clip,time:(at.phase.from+(at.phase.to-at.phase.from)*at.u)*c.getClip().duration,weight:1});
   // Blend from the previous segment for 60 ms, evaluated without state accumulation.
   if(at.index>0&&time-at.start<.06){const prev=action.phases[at.index-1];if(prev.clip!==at.phase.clip){const w=Math.max(0,(time-at.start)/.06);entries[0].weight=w;entries.push({name:prev.clip,time:prev.to*this.actions.get(prev.clip)!.getClip().duration,weight:1-w});}}
  }
  for(const a of this.actions.values()){a.enabled=false;a.setEffectiveWeight(0);}
  for(const e of entries){const a=this.actions.get(e.name)!;a.play();a.enabled=true;a.paused=true;a.time=e.time;a.setEffectiveWeight(e.weight);}
  this.mixer.update(0);
  for(const entry of this.baseRotations)entry.q.copy(entry.bone.quaternion);
  if(!idle&&actionId(action)==='burst'){
   const pose=at.phase.pose||[0,0],u=at.u*at.u*(3-2*at.u),swing=pose[0]+(pose[1]-pose[0])*u;const stretch=at.phase.stretch||[1,1];this.model.scale.y=this.baseScale.y*(stretch[0]+(stretch[1]-stretch[0])*u);
   this.model.updateWorldMatrix(true,true);
   for(const [name,side] of [['upperarm_l',1],['upperarm_r',-1]] as const){const bone=this.model.getObjectByName(name),child=bone?.children.find(n=>(n as THREE.Bone).isBone);if(bone&&child&&bone.parent){const direction=new THREE.Vector3(side*.28,swing>=0?1:-1,.18).normalize().applyQuaternion(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert());const target=new THREE.Quaternion().setFromUnitVectors(child.position.clone().normalize(),direction);bone.quaternion.slerp(target,Math.min(1,Math.abs(swing)/.65));}}

   const spine=this.model.getObjectByName('spine_03');if(spine)spine.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.18*swing));
  }
  this.model.position.y=idle?0:rootHeight(action,time)/this.assetScale;
  if(!idle&&action.version===2)for(const track of action.tracks||[]){
   const node=track.target==='$root'?this.model:this.nodes.get(track.target);if(!node)continue;
   const v=trackValue(track,time);
   if(track.property==='rotation'){const q=new THREE.Quaternion().fromArray(v);if(track.mode==='offset')node.quaternion.multiply(q);else node.quaternion.copy(q);}
   else if(track.property==='position'){const p=new THREE.Vector3().fromArray(v);if(track.target==='$root')p.divideScalar(this.assetScale);if(track.mode==='offset')node.position.add(p);else node.position.copy(p);}
   else {const scale=new THREE.Vector3().fromArray(v);if(track.mode==='offset')node.scale.multiply(scale);else node.scale.copy(scale);}
  }
  this.model.updateMatrixWorld(true);
 }
 poseSpeeds(action:Action){return Array.from(this.poseSpeedSamples(action));}
 *poseSpeedSamples(action:Action){
  const nodes=['Head','hand_l','hand_r','foot_l','foot_r','pelvis','spine_03'].map(n=>this.model.getObjectByName(n)).filter((n):n is THREE.Object3D=>!!n);
  const total=duration(action),count=Math.ceil(total*60),dt=1/60;let previous:THREE.Vector3[]|undefined;
  for(let i=0;i<=count;i++){this.sample(action,Math.min(i*dt,total));const origin=this.model.getWorldPosition(new THREE.Vector3()),positions=nodes.map(n=>n.getWorldPosition(new THREE.Vector3()).sub(origin));
   const v=previous?Math.sqrt(positions.reduce((sum,p,j)=>sum+p.distanceToSquared(previous![j]),0)/nodes.length)/dt:0;previous=positions;yield v;
  }
 }
}
