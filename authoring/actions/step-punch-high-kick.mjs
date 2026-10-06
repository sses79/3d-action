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
 {t:0,z:0,x:0,lower:.055,yaw:0,lean:0,punch:0,kick:0,rightZ:.14,rightLift:0,left:[.13,ankleY,-.18],pivot:0},
 {t:.20,z:0,x:0,lower:.055,yaw:0,lean:0,punch:0,kick:0,rightZ:.14,rightLift:0,left:[.13,ankleY,-.18],pivot:0},
 {t:.36,z:.13,x:-.015,lower:.065,yaw:0,lean:0,punch:0,kick:0,rightZ:.27,rightLift:.075,left:[.13,ankleY,-.18],pivot:0},
 {t:.48,z:.26,x:-.02,lower:.05,yaw:0,lean:0,punch:0,kick:0,rightZ:.40,rightLift:0,left:[.13,ankleY,-.18],pivot:0},
 {t:.52,z:.26,x:-.02,lower:.05,yaw:0,lean:0,punch:0,kick:0,rightZ:.40,rightLift:0,left:[.13,ankleY,-.18],pivot:0},
 {t:.61,z:.26,x:-.025,lower:.045,yaw:.12,lean:.06,punch:.75,kick:0,rightZ:.40,rightLift:0,left:[.13,ankleY,-.18],pivot:0},
 {t:.69,z:.26,x:-.025,lower:.04,yaw:.22,lean:.085,punch:1,kick:0,rightZ:.40,rightLift:0,left:[.13,ankleY,-.18],pivot:0},
 {t:.74,z:.26,x:-.03,lower:.045,yaw:.22,lean:.07,punch:.80,kick:0,rightZ:.40,rightLift:0,left:[.13,ankleY,-.18],pivot:0},
 {t:.94,z:.26,x:-.08,lower:.08,yaw:.52,lean:0,punch:0,kick:0,rightZ:.40,rightLift:0,left:[.13,ankleY,-.18],pivot:.18},
 {t:1.02,z:.26,x:-.085,lower:.075,yaw:.52,lean:-.05,punch:0,kick:.15,rightZ:.40,rightLift:0,left:[.18,.29,-.02],pivot:.18},
 {t:1.16,z:.26,x:-.09,lower:.055,yaw:.12,lean:-.16,punch:0,kick:.55,rightZ:.40,rightLift:0,left:[.42,.83,.34],pivot:-.15},
 {t:1.24,z:.26,x:-.09,lower:.045,yaw:-.15,lean:-.24,punch:0,kick:.75,rightZ:.40,rightLift:0,left:[.42,1.15,.40],pivot:-.35},
 {t:1.42,z:.26,x:-.085,lower:.045,yaw:-.82,lean:-.35,punch:0,kick:1,rightZ:.40,rightLift:0,left:[.16,1.52,.80],pivot:-.88},
 {t:1.54,z:.26,x:-.085,lower:.055,yaw:-1.0,lean:-.35,punch:0,kick:.90,rightZ:.40,rightLift:0,left:[-.12,1.42,.86],pivot:-1.05},
 {t:1.68,z:.26,x:-.085,lower:.06,yaw:-.55,lean:0,punch:0,kick:.55,rightZ:.40,rightLift:0,left:[.23,.91,.30],pivot:-.65},
 {t:1.82,z:.26,x:-.065,lower:.07,yaw:-.18,lean:0,punch:0,kick:.1,rightZ:.40,rightLift:0,left:[.16,.34,.08],pivot:-.18},
 {t:2.08,z:.26,x:-.015,lower:.06,yaw:0,lean:0,punch:0,kick:0,rightZ:.40,rightLift:0,left:[.13,ankleY,.08],pivot:0},
 {t:2.25,z:.26,x:0,lower:.055,yaw:0,lean:0,punch:0,kick:0,rightZ:.40,rightLift:0,left:[.13,ankleY,.08],pivot:0},
 {t:2.45,z:.26,x:0,lower:.055,yaw:0,lean:0,punch:0,kick:0,rightZ:.40,rightLift:0,left:[.13,ankleY,.08],pivot:0}
];
function poseAt(t){let i=poses.findIndex(p=>p.t>t);if(i<0)return poses.at(-1);if(i===0)return poses[0];const a=poses[i-1],b=poses[i];let u=(t-a.t)/(b.t-a.t);u=u*u*(3-2*u);const out={t};for(const key of Object.keys(a).filter(k=>k!=='t'))out[key]=Array.isArray(a[key])?a[key].map((x,j)=>x+(b[key][j]-x)*u):a[key]+(b[key]-a[key])*u;return out;}
const smooth=u=>{u=Math.max(0,Math.min(1,u));return u*u*(3-2*u);};
const extensionAt=t=>t<1.32?smooth((t-1.24)/.08):1-smooth((t-1.54)/.14);
const qYaw=r=>new T.Quaternion().setFromAxisAngle(v(0,1,0),r);
function worldRotation(name,q){const n=model.getObjectByName(name);n.quaternion.copy(n.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));holder.updateMatrixWorld(true);}
function aim(name,child,target){const bone=model.getObjectByName(name),next=model.getObjectByName(child);const from=next.position.clone().normalize().applyQuaternion(bone.getWorldQuaternion(new T.Quaternion()));const desired=target.clone().sub(world(name)).normalize();const q=new T.Quaternion().setFromUnitVectors(from,desired).multiply(bone.getWorldQuaternion(new T.Quaternion()));worldRotation(name,q);}
function leg(side,ankle,hint){const hip=world('thigh_'+side),[l1,l2]=lengths[side],d=ankle.clone().sub(hip),distance=Math.min(l1+l2-.00005,Math.max(Math.abs(l1-l2)+.005,d.length()));d.normalize();const along=(l1*l1-l2*l2+distance*distance)/(2*distance),rad=Math.sqrt(Math.max(0,l1*l1-along*along));let bend=hint.clone().addScaledVector(d,-hint.dot(d));if(bend.length()<.01)bend=v(1,0,0).addScaledVector(d,-d.x);bend.normalize();const knee=hip.clone().addScaledVector(d,along).addScaledVector(bend,rad);aim('thigh_'+side,'calf_'+side,knee);aim('calf_'+side,'foot_'+side,ankle);}
function arm(side,upperDir,lowerDir){const upper=model.getObjectByName('upperarm_'+side),lower=model.getObjectByName('lowerarm_'+side),hand=model.getObjectByName('hand_'+side);aim(upper.name,lower.name,world(upper.name).add(upperDir.clone()));aim(lower.name,hand.name,world(lower.name).add(lowerDir.clone()));}
const names=['pelvis','spine_01','spine_02','spine_03','Head','upperarm_r','lowerarm_r','upperarm_l','lowerarm_l','thigh_r','calf_r','foot_r','thigh_l','calf_l','foot_l'];
const tracks=names.map(target=>({target,property:'rotation',mode:'absolute',interpolation:'linear',keys:[]}));
const pelvisPosition={target:'pelvis',property:'position',mode:'absolute',interpolation:'linear',keys:[]},rootPosition={target:'$root',property:'position',mode:'absolute',interpolation:'linear',keys:[]};
const times=[...new Set([...Array.from({length:75},(_,i)=>Math.min(2.45,i/30)),1.32,...poses.map(p=>p.t)].map(t=>Number(t.toFixed(6))))].sort((a,b)=>a-b);
for(const time of times){const p=poseAt(time);reset();model.position.set(p.x/scale,0,p.z/scale);holder.updateMatrixWorld(true);
 const pelvis=model.getObjectByName('pelvis');pelvis.position.copy(pelvis.parent.worldToLocal(basePelvis.clone().add(v(p.x,-p.lower,p.z))));holder.updateMatrixWorld(true);
 worldRotation('pelvis',qYaw(p.yaw).multiply(pelvis.getWorldQuaternion(new T.Quaternion())));
 // Distribute the counterlean from the lower spine so the whole torso moves back.
 const lowerSpine=model.getObjectByName('spine_01');
 worldRotation('spine_01',new T.Quaternion().setFromAxisAngle(v(1,0,0),p.lean*.7).multiply(lowerSpine.getWorldQuaternion(new T.Quaternion())));
 const spine=model.getObjectByName('spine_03');
 worldRotation('spine_03',new T.Quaternion().setFromAxisAngle(v(1,0,0),p.lean*.3).multiply(qYaw(-p.yaw*.45+p.punch*.18)).multiply(spine.getWorldQuaternion(new T.Quaternion())));
 worldRotation('Head',headQ);
 const right=v(-.13,ankleY+p.rightLift,p.rightZ),left=new T.Vector3(...p.left);
 const extension=extensionAt(time),hip=world('thigh_l');
 // Extend along the raised thigh direction, keeping anatomical bone lengths.
 const straight=left.clone().sub(hip).normalize().multiplyScalar(lengths.l[0]+lengths.l[1]-.00005).add(hip);
 left.lerp(straight,extension);
 leg('r',right,v(0,0,1));leg('l',left,v(.18,0,1));
 worldRotation('foot_r',qYaw(p.pivot).multiply(flatFeet.r));worldRotation('foot_l',qYaw(p.kick*Math.atan2(left.x-p.x,left.z-p.z)).multiply(flatFeet.l));
 // Point the toes along the lower leg instead of leaving the airborne foot flat.
 const foot=model.getObjectByName('foot_l'),flat=foot.getWorldQuaternion(new T.Quaternion());
 const toeDirection=model.getObjectByName('ball_l').position.clone().normalize().applyQuaternion(flat);
 const legDirection=world('foot_l').sub(world('calf_l')).normalize();
 const pointed=new T.Quaternion().setFromUnitVectors(toeDirection,legDirection).multiply(flat);
 worldRotation('foot_l',flat.slerp(pointed,extension));
 const rUp=v(-.25,-.55,.4).lerp(v(-.06,.12,1),p.punch),rLow=v(.05,.95,.65).lerp(v(0,.17,1),p.punch);arm('r',rUp,rLow);
 arm('l',v(.25,-.5,.35).lerp(v(.55,-.3,-.15),p.kick*.25),v(-.1,.95,.65));
 for(const track of tracks)track.keys.push({time,value:model.getObjectByName(track.target).quaternion.clone().normalize().toArray()});pelvisPosition.keys.push({time,value:pelvis.position.toArray()});rootPosition.keys.push({time,value:[p.x,0,p.z]});
}
const phase=(id,name,intent,duration,kind)=>({id,name,intent,duration,kind,clip:'A_TPose',from:0,to:0});
// Reuse the asset's authored fist shape, while independently posing the body.
reset();mixer.stopAllAction();const jab=mixer.clipAction(g.animations.find(c=>c.name==='Punch_Jab'));jab.play();jab.paused=true;jab.time=.45;mixer.update(0);
const fingers=[];model.traverse(n=>{if(n.isBone&&/^(index|middle|pinky|ring|thumb)_0[123]_[lr]$/.test(n.name))fingers.push({target:n.name,property:'rotation',mode:'absolute',interpolation:'linear',keys:[{time:0,value:n.quaternion.clone().normalize().toArray()}]});});
const action={version:2,rig:'quaternius-ual1',id:'pouch-coil-launch',name:'Step → Punch → High Kick',phases:[
 phase('ready','Ready','Right-lead stance; fists held in guard',.20,'hold'),
 phase('step','Step','Advance the right foot and plant it before punching',.32,'move'),
 phase('punch','Right Punch','Drive a closed right fist forward, then begin retracting',.22,'fast'),
 phase('turn','Hip Turn','Retract the punch and rotate the pelvis to load the rear left leg',.28,'move'),
 phase('chamber','Chamber','Lift the left knee while the right foot supports the body',.22,'move'),
 phase('high-kick','High Kick','Straighten the raised knee and point the foot; counterlean the upper body',.18,'fast'),
 phase('follow','Follow','Keep the leg extended and the torso slightly back through the follow-through',.12,'move'),
 phase('recoil','Recoil','Fold the left knee and bring the upper body back upright',.28,'move'),
 phase('recover','Recover','Replace the rear foot and restore the torso and fists to guard',.43,'move'),
 phase('guard','Guard','Hold the advanced stance, ready for the next action',.20,'hold')
 ],tracks:[...tracks,pelvisPosition,rootPosition,...fingers],cues:[]};
await writeFile('authoring/actions/step-punch-high-kick.json',JSON.stringify({action},null,2));
await writeFile('/private/tmp/high-kick-preview.json',JSON.stringify({actionId:action.id,time:1.41,playing:false,view:'current',camera:'Side',idle:false,metric:'pose'}));
console.log({id:action.id,phases:action.phases.length,tracks:action.tracks.length,fingerTracks:fingers.length,keysPerBodyTrack:times.length,duration:action.phases.reduce((s,p)=>s+p.duration,0)});
