import * as T from 'three/webgpu';
import {Action,validateAction} from '../../runtime/action';
// Specific H36M17 -> Quaternius adapter. No joint positions/scales are authored.
export function bodyFrame(left:T.Vector3,right:T.Vector3,up:T.Vector3){const x=left.clone().sub(right).normalize(),y=up.clone().addScaledVector(x,-up.dot(x)).normalize();if(x.lengthSq()<.9||y.lengthSq()<.9)throw Error('Degenerate body frame');const z=new T.Vector3().crossVectors(x,y).normalize();return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));}
// Torso frame: the pelvis-to-neck direction is kept exactly and the shoulder line is squared to it. Squaring the spine to
// the shoulders instead would remove any sideways lean whenever the shoulders stay level.
export function torsoFrame(left:T.Vector3,right:T.Vector3,up:T.Vector3){const y=up.clone().normalize(),across=left.clone().sub(right),x=across.addScaledVector(y,-across.dot(y)).normalize();if(y.lengthSq()<.9||x.lengthSq()<.9)throw Error('Degenerate torso frame');const z=new T.Vector3().crossVectors(x,y).normalize();return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));}
export function localForDirection(parentWorld:T.Quaternion,restWorld:T.Quaternion,restDirection:T.Vector3,direction:T.Vector3){if(direction.lengthSq()<1e-10)throw Error('Degenerate limb direction');const world=new T.Quaternion().setFromUnitVectors(restDirection.clone().normalize(),direction.clone().normalize()).multiply(restWorld);return parentWorld.clone().invert().multiply(world).normalize();}
export function retarget(model:T.Object3D,positions:number[][][],times:number[],imagePelvis:number[][],pixelScale:number,id='video-side-kick-draft',options?:{name:string,airborne?:boolean,lowestAnkleImageY?:number[],phases?:{name:string,end:number,kind?:'move'|'fast'|'hold'}[]}){
 if(positions.length!==times.length||times.length<2||times.length>256||positions.some(f=>f.length!==17||f.some(p=>p.length!==3||p.some(x=>!Number.isFinite(x)))))throw Error('Invalid estimated motion');
 if(imagePelvis.length!==times.length||imagePelvis.some(p=>p.length!==2||p.some(x=>!Number.isFinite(x)))||!Number.isFinite(pixelScale)||pixelScale<=0)throw Error('Invalid image trajectory');
 const start=times[0],total=times.at(-1)!-start;if(total<=0||times.some((t,i)=>!Number.isFinite(t)||i>0&&t<=times[i-1]))throw Error('Invalid times');
 if(!options&&Math.abs(total-2.3)>1e-6)throw Error('Pilot adapter requires the 2.3-second side-kick window');
 const bones:T.Object3D[]=[];model.traverse(b=>{if((b as T.Bone).isBone)bones.push(b)});const depth=(b:T.Object3D):number=>b.parent?1+depth(b.parent):0;bones.sort((a,b)=>depth(a)-depth(b));model.updateMatrixWorld(true);
 const get=(n:string)=>{const b=model.getObjectByName(n);if(!b)throw Error('Missing bone '+n);return b;},point=(n:string)=>get(n).getWorldPosition(new T.Vector3());
 const restFrame=bodyFrame(point('thigh_l'),point('thigh_r'),point('neck_01').sub(point('pelvis'))),restTorso=options?torsoFrame(point('upperarm_l'),point('upperarm_r'),point('neck_01').sub(point('pelvis'))):restFrame;
 const limbMap:Record<string,[number,number,string]>={thigh_r:[1,2,'calf_r'],calf_r:[2,3,'foot_r'],thigh_l:[4,5,'calf_l'],calf_l:[5,6,'foot_l'],upperarm_l:[11,12,'lowerarm_l'],lowerarm_l:[12,13,'hand_l'],upperarm_r:[14,15,'lowerarm_r'],lowerarm_r:[15,16,'hand_r']};
 const rest=bones.map(b=>({b,q:b.quaternion.clone(),world:b.getWorldQuaternion(new T.Quaternion()),direction:limbMap[b.name]?point(limbMap[b.name][2]).sub(b.getWorldPosition(new T.Vector3())):null}));
 const tracks:Action['tracks']=bones.map(b=>({target:b.name,property:'rotation',mode:'absolute',interpolation:'linear',keys:[]}));const rootTrack:NonNullable<Action['tracks']>[number]={target:'$root',property:'position',mode:'absolute',interpolation:'linear',keys:[]};
 const scale=new T.Vector3();model.getWorldScale(scale);const worldScale=scale.x;
 positions.forEach((frame,i)=>{
  // Camera x-right/y-down/z-away -> Three x-right/y-up/z-toward camera.
  const p=frame.map(v=>new T.Vector3(v[0],-v[1],-v[2]));const hipFrame=bodyFrame(p[4],p[1],p[8].clone().sub(p[0])),torso=options?torsoFrame(p[11],p[14],p[8].clone().sub(p[0])):bodyFrame(p[11],p[14],p[8].clone().sub(p[0]));
  model.position.set(0,0,0);model.updateMatrixWorld(true);
  for(let j=0;j<rest.length;j++){
   const r=rest[j],b=r.b,parent=b.parent!.getWorldQuaternion(new T.Quaternion());let q=r.q.clone();
   if(b.name==='pelvis'||['spine_01','spine_02','spine_03'].includes(b.name))q=parent.clone().invert().multiply((b.name==='pelvis'?hipFrame.clone().multiply(restFrame.clone().invert()):torso.clone().multiply(restTorso.clone().invert())).multiply(r.world)).normalize();
   else if(limbMap[b.name]){const [a,c]=limbMap[b.name];q=localForDirection(parent,r.world,r.direction!,p[c].clone().sub(p[a]));}
   b.quaternion.copy(q);b.updateWorldMatrix(false,true);
   const prior=tracks![j].keys.at(-1)?.value;if(prior&&q.dot(new T.Quaternion().fromArray(prior))<0)q.set(-q.x,-q.y,-q.z,-q.w);tracks![j].keys.push({time:times[i]-start,value:q.toArray()});
  }
  model.updateMatrixWorld(true);const floor=Math.min(point('ball_l').y,point('ball_r').y);const x=(imagePelvis[i][0]-imagePelvis[0][0])*pixelScale;
  // Explicit approximate image-X travel and geometric floor placement, not contact reconstruction.
  rootTrack.keys.push({time:times[i]-start,value:[x,.035-floor,0]});
 });
 // Airborne clips: the lowest foot is no longer assumed to touch the floor. Its height comes from how far the lowest ankle
 // sits above the lowest line it reaches in the clip. Rising onto the toes lifts an ankle by up to about 20 cm without
 // leaving the floor, so the lift fades in between 20 and 40 cm.
 let peakLift=0;if(options?.airborne){const y=options.lowestAnkleImageY;if(!y||y.length!==times.length||y.some(v=>!Number.isFinite(v)))throw Error('Airborne retargeting needs ankle image heights');const ground=[...y].sort((a,b)=>a-b)[Math.floor(y.length*.95)];rootTrack.keys.forEach((k,i)=>{const h=Math.max(0,(ground-y[i])*pixelScale),u=Math.min(1,Math.max(0,(h-.2)/.2)),lift=h*u*u*(3-2*u);peakLift=Math.max(peakLift,lift);(k.value as number[])[1]+=lift;});}
 tracks!.push(rootTrack);const boundaries=[0,.25,1.05,1.33,1.47,1.7,1.95,total],names=['Ready','Gather','Chamber','Lateral snap','Recoil','Return','Ready hold'];
 if(options){const phases=options.phases?.length?options.phases:[{name:'Estimated motion',end:total}];let at=0;phases.forEach((p,i)=>{const end=i===phases.length-1?total:p.end;if(!(end>at+1e-6)||end>total+1e-6)throw Error('Phase ends must ascend within the window');at=end;});if(Math.abs(phases.at(-1)!.end-total)>1e-3)throw Error('Final phase must end at the window duration');at=0;const custom:Action={version:2,rig:'quaternius-ual1',id,name:options.name,phases:phases.map((p,i)=>{const end=i===phases.length-1?total:p.end,phase={id:'video-'+i,name:p.name,intent:'Estimated video motion; support, twist and travel need review',duration:end-at,kind:p.kind||'move',clip:'A_TPose',from:0,to:0};at=end;return phase;}),tracks};validateAction(custom);return {action:custom,metadata:{adapter:'h36m17-quaternius-direction-v1',worldScale,rootTravel:'image-X normalized by initial bounding-box height; no calibrated world Z',floorPlacement:options.airborne?'lowest ball joint on the floor, plus the lowest ankle image height once it exceeds 20-40 cm; assumes a level camera and a subject at constant distance':'lowest ball joint per frame, no confirmed support/contact',peakLiftMeters:peakLift,unknown:['twist','foot/finger articulation','calibrated root travel','mirroring'],boneLengths:'rest local translations/scales preserved'}};}
 const action:Action={version:2,rig:'quaternius-ual1',id,name:'Video · Side kick reconstruction draft',phases:names.map((name,i)=>({id:'video-'+i,name,intent:'Estimated video motion; support, twist and travel need review',duration:boundaries[i+1]-boundaries[i],kind:i===3?'fast':i===0||i===6?'hold':'move',clip:'A_TPose',from:0,to:0})),tracks};validateAction(action);
 return {action,metadata:{adapter:'h36m17-quaternius-direction-v1',worldScale,rootTravel:'image-X normalized by initial bounding-box height; no calibrated world Z',floorPlacement:'lowest ball joint per frame, no confirmed support/contact',unknown:['twist','foot/finger articulation','calibrated root travel','mirroring'],boneLengths:'rest local translations/scales preserved'}};
}
