// Author pose data offline, then submit JSON through MCP; runtime executes no generated code.
import {readFile,writeFile} from 'node:fs/promises';
import * as T from 'three/webgpu';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const bytes=await readFile('editor/assets/character.glb');const g=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const model=g.scene,holder=new T.Group();holder.add(model);const scale=1.85/new T.Box3().setFromObject(model).getSize(new T.Vector3()).y;holder.scale.setScalar(scale);
const mixer=new T.AnimationMixer(model),clip=mixer.clipAction(g.animations.find(c=>c.name==='A_TPose'));
function reset(){mixer.stopAllAction();model.position.set(0,0,0);clip.play();clip.paused=true;clip.time=0;mixer.update(0);holder.updateMatrixWorld(true);}
const v=(x,y,z)=>new T.Vector3(x,y,z),world=n=>model.getObjectByName(n).getWorldPosition(new T.Vector3());
reset();const basePelvis=world('pelvis'),ankleY=world('foot_r').y,flatFeet={l:model.getObjectByName('foot_l').getWorldQuaternion(new T.Quaternion()),r:model.getObjectByName('foot_r').getWorldQuaternion(new T.Quaternion())},headQ=model.getObjectByName('Head').getWorldQuaternion(new T.Quaternion());
const lengths={};for(const side of ['l','r'])lengths[side]=[world('thigh_'+side).distanceTo(world('calf_'+side)),world('calf_'+side).distanceTo(world('foot_'+side))];
const poses=[
 {t:0,z:0,x:0,lower:.055,yaw:0,lean:0,check:0,kick:0,rightZ:.14,rightLift:0,left:[.13,ankleY,-.18],pivot:0},
 {t:.25,z:0,x:0,lower:.055,yaw:0,lean:0,check:0,kick:0,rightZ:.14,rightLift:0,left:[.13,ankleY,-.18],pivot:0},
 {t:.46,z:.10,x:-.015,lower:.06,yaw:-.05,lean:.035,check:.7,kick:0,rightZ:.23,rightLift:.07,left:[.13,ankleY,-.18],pivot:0},
 {t:.66,z:.22,x:-.03,lower:.05,yaw:-.08,lean:.06,check:1,kick:0,rightZ:.36,rightLift:0,left:[.13,ankleY,-.18],pivot:0},
 {t:.80,z:.22,x:-.03,lower:.05,yaw:-.08,lean:.06,check:1,kick:0,rightZ:.36,rightLift:0,left:[.13,ankleY,-.18],pivot:0},
 {t:1.07,z:.22,x:-.07,lower:.085,yaw:-.50,lean:0,check:.15,kick:0,rightZ:.36,rightLift:0,left:[.13,ankleY,-.18],pivot:-.1},
 {t:1.25,z:.22,x:-.085,lower:.085,yaw:-.50,lean:0,check:0,kick:.1,rightZ:.36,rightLift:0,left:[.18,.23,-.12],pivot:-.1},
 {t:1.36,z:.22,x:-.09,lower:.055,yaw:-.12,lean:-.09,check:0,kick:.55,rightZ:.36,rightLift:0,left:[.42,.55,.25],pivot:.2},
 {t:1.52,z:.22,x:-.085,lower:.045,yaw:.65,lean:-.16,check:0,kick:1,rightZ:.36,rightLift:0,left:[.52,.91,.78],pivot:.8},
 {t:1.66,z:.22,x:-.085,lower:.06,yaw:.85,lean:-.15,check:0,kick:.9,rightZ:.36,rightLift:0,left:[-.26,.78,.83],pivot:.95},
 {t:1.86,z:.22,x:-.085,lower:.06,yaw:.45,lean:-.08,check:0,kick:.55,rightZ:.36,rightLift:0,left:[.22,.58,.32],pivot:.55},
 {t:2.05,z:.22,x:-.065,lower:.07,yaw:.18,lean:0,check:0,kick:.1,rightZ:.36,rightLift:0,left:[.16,.3,.07],pivot:.18},
 {t:2.34,z:.22,x:-.015,lower:.06,yaw:.03,lean:0,check:0,kick:0,rightZ:.36,rightLift:0,left:[.13,ankleY,.04],pivot:0},
 {t:2.65,z:.22,x:0,lower:.055,yaw:0,lean:0,check:0,kick:0,rightZ:.36,rightLift:0,left:[.13,ankleY,.04],pivot:0},
 {t:2.85,z:.22,x:0,lower:.055,yaw:0,lean:0,check:0,kick:0,rightZ:.36,rightLift:0,left:[.13,ankleY,.04],pivot:0}
];
function poseAt(t){let i=poses.findIndex(p=>p.t>t);if(i<0)return poses.at(-1);if(i===0)return poses[0];const a=poses[i-1],b=poses[i];let u=(t-a.t)/(b.t-a.t);u=u*u*(3-2*u);const out={t};for(const key of Object.keys(a).filter(k=>k!=='t'))out[key]=Array.isArray(a[key])?a[key].map((x,j)=>x+(b[key][j]-x)*u):a[key]+(b[key]-a[key])*u;return out;}
const qYaw=r=>new T.Quaternion().setFromAxisAngle(v(0,1,0),r);
function worldRotation(name,q){const n=model.getObjectByName(name);n.quaternion.copy(n.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));holder.updateMatrixWorld(true);}
function aim(name,child,target){const bone=model.getObjectByName(name),next=model.getObjectByName(child);const from=next.position.clone().normalize().applyQuaternion(bone.getWorldQuaternion(new T.Quaternion()));const desired=target.clone().sub(world(name)).normalize();const q=new T.Quaternion().setFromUnitVectors(from,desired).multiply(bone.getWorldQuaternion(new T.Quaternion()));worldRotation(name,q);}
function leg(side,ankle,hint){const hip=world('thigh_'+side),[l1,l2]=lengths[side],d=ankle.clone().sub(hip),distance=Math.min(l1+l2-.002,Math.max(Math.abs(l1-l2)+.005,d.length()));d.normalize();const along=(l1*l1-l2*l2+distance*distance)/(2*distance),rad=Math.sqrt(Math.max(0,l1*l1-along*along));let bend=hint.clone().addScaledVector(d,-hint.dot(d));if(bend.length()<.01)bend=v(1,0,0).addScaledVector(d,-d.x);bend.normalize();const knee=hip.clone().addScaledVector(d,along).addScaledVector(bend,rad);aim('thigh_'+side,'calf_'+side,knee);aim('calf_'+side,'foot_'+side,ankle);}
function arm(side,upperDir,lowerDir){const upper=model.getObjectByName('upperarm_'+side),lower=model.getObjectByName('lowerarm_'+side),hand=model.getObjectByName('hand_'+side);aim(upper.name,lower.name,world(upper.name).add(upperDir.clone()));aim(lower.name,hand.name,world(lower.name).add(lowerDir.clone()));}
const names=['pelvis','spine_01','spine_02','spine_03','Head','upperarm_r','lowerarm_r','upperarm_l','lowerarm_l','thigh_r','calf_r','foot_r','thigh_l','calf_l','foot_l'];
const tracks=names.map(target=>({target,property:'rotation',mode:'absolute',interpolation:'linear',keys:[]}));
const pelvisPosition={target:'pelvis',property:'position',mode:'absolute',interpolation:'linear',keys:[]},rootPosition={target:'$root',property:'position',mode:'absolute',interpolation:'linear',keys:[]};
const times=[...new Set([...Array.from({length:87},(_,i)=>Math.min(2.85,i/30)),...poses.map(p=>p.t)].map(t=>Number(t.toFixed(6))))].sort((a,b)=>a-b);
for(const time of times){const p=poseAt(time);reset();model.position.set(p.x/scale,0,p.z/scale);holder.updateMatrixWorld(true);
 const pelvis=model.getObjectByName('pelvis');pelvis.position.copy(pelvis.parent.worldToLocal(basePelvis.clone().add(v(p.x,-p.lower,p.z))));holder.updateMatrixWorld(true);
 worldRotation('pelvis',qYaw(p.yaw).multiply(pelvis.getWorldQuaternion(new T.Quaternion())));
 const spine=model.getObjectByName('spine_03');worldRotation('spine_03',qYaw(-p.yaw*.45).multiply(new T.Quaternion().setFromAxisAngle(v(1,0,0),p.lean)).multiply(spine.getWorldQuaternion(new T.Quaternion())));worldRotation('Head',headQ);
 const right=v(-.13,ankleY+p.rightLift,p.rightZ),left=new T.Vector3(...p.left);
 leg('r',right,v(0,0,1));leg('l',left,v(.18,0,1));
 worldRotation('foot_r',qYaw(p.pivot).multiply(flatFeet.r));worldRotation('foot_l',qYaw(p.kick*Math.atan2(left.x-p.x,left.z-p.z)).multiply(flatFeet.l));
 const rUp=v(-.35,-.75,.4).lerp(v(-.08,.30,1),p.check),rLow=v(.1,.85,.8).lerp(v(0,.40,1),p.check);arm('r',rUp,rLow);
 arm('l',v(.35,-.6,.32).lerp(v(.65,-.4,-.35),p.kick*.55),v(-.1,.9,.65).lerp(v(.35,.4,.55),p.kick*.35));
 for(const track of tracks)track.keys.push({time,value:model.getObjectByName(track.target).quaternion.clone().normalize().toArray()});pelvisPosition.keys.push({time,value:pelvis.position.toArray()});rootPosition.keys.push({time,value:[p.x,0,p.z]});
}
const phase=(id,name,intent,duration,kind)=>({id,name,intent,duration,kind,clip:'A_TPose',from:0,to:0});
const action={version:2,rig:'quaternius-ual1',id:'pouch-coil-launch',name:'Pouch → Coil → Launch',phases:[phase('ready','Ready','Right lead foot, left rear leg; hands in guard',.25,'hold'),phase('pouch','The Pouch','Step right foot forward and extend the right arm to check the line',.55,'move'),phase('coil','The Coil','Retract the right hand as the hips wind up and weight shifts over the support leg',.45,'hold'),phase('launch','The Launch','Reverse the hip turn; chamber and extend the left rear-leg kick',.27,'fast'),phase('follow','Follow','Carry the kick through its arc without freezing at extension',.16,'move'),phase('recoil','Recoil','Fold the left knee and return it under control',.37,'move'),phase('recover','Recover','Replace the left foot and unwind the torso into guard',.60,'move'),phase('guard','Guard','Finish in the advanced right-lead stance',.20,'hold')],tracks:[...tracks,pelvisPosition,rootPosition],cues:[]};
await writeFile('authoring/actions/pouch-coil-launch.json',JSON.stringify({action},null,2));
await writeFile('/private/tmp/pouch-preview.json',JSON.stringify({actionId:action.id,time:1.52,playing:false,view:'current',camera:'Orbit',idle:false,metric:'pose'}));
console.log({id:action.id,phases:action.phases.length,tracks:action.tracks.length,keysPerTrack:times.length,duration:action.phases.reduce((s,p)=>s+p.duration,0)});
