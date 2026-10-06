import * as THREE from 'three/webgpu';
import baselineData from './kick-baseline.json';
import {Action,clone,validateAction} from './action';
import {CharacterPlayer} from './player';
export const kickBaseline=baselineData as Action;
export const kickLimits={heightDeg:{min:-8,max:8,default:0},releaseSpeed:{min:.75,max:1.25,default:1}};
export type KickParameters={heightDeg:number;releaseSpeed:number};
// Always compile from immutable source motion; never modify the last generated variant.
export function compileKick(model:THREE.Object3D,clips:THREE.AnimationClip[],scale:number,params:KickParameters):Action{
 if(Object.keys(params).some(k=>!['heightDeg','releaseSpeed'].includes(k))||!Number.isFinite(params.heightDeg)||Math.abs(params.heightDeg)>8||!Number.isFinite(params.releaseSpeed)||params.releaseSpeed<.75||params.releaseSpeed>1.25)throw Error('Kick controls: height -8…8 degrees; release speed 0.75…1.25');
 const action=clone(kickBaseline),player=new CharacterPlayer(model,clips,scale);
 const warp=(t:number)=>params.releaseSpeed===1?t:t<=.5?t:t<=.8?.5+(t-.5)/params.releaseSpeed:t+.3/params.releaseSpeed-.3;
 action.phases[1].duration=.3/params.releaseSpeed;
 const changed=['thigh_r','spine_01'];
 const samples=action.tracks!.find(t=>t.target==='thigh_r')!.keys.map(k=>k.time);
 for(let i=0;params.heightDeg!==0&&i<samples.length;i++){
  const time=samples[i];player.sample(kickBaseline,time);model.updateMatrixWorld(true);
  // Smoothly enter/leave the correction; preserve starting stance and recovery.
  const envelope=time<.4||time>1.2?0:time<=.78?Math.sin((time-.4)/.38*Math.PI/2)**2:Math.cos((time-.78)/.42*Math.PI/2)**2;
  for(const name of changed){const bone=model.getObjectByName(name)!;const world=bone.getWorldQuaternion(new THREE.Quaternion());const angle=-params.heightDeg*Math.PI/180*envelope*(name==='spine_01'?.2:1);const delta=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),angle);const local=bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(delta.multiply(world)).normalize();action.tracks!.find(t=>t.target===name&&t.property==='rotation')!.keys[i].value=local.toArray();}
 }
 for(const track of action.tracks!)for(const key of track.keys)key.time=warp(key.time);
 return validateAction(action);
}
