import * as THREE from 'three/webgpu';
import {Action,duration} from './action';
import {CharacterPlayer} from './player';
// Staging: one performer's whole part in a scene, baked into one action in the room's own coordinates (x right, y up, z toward
// the viewer of the room's plan, metres; floor at y=0). The part is a list of items played one after another. Each item is a
// library movement, looped to fill its time, either on the spot or walking to a mark:
//  on the spot  the performer stays where they are and turns to face `face` (a point on the floor) over the first half second.
//               The movement's own drift over the floor is dropped.
//  walking      the performer goes in a straight line to `walkTo`. How far the movement carries the body is read from its feet:
//               while a foot is the lower one, the body moves so that foot stays put. Whole cycles are played (as many as come
//               nearest the distance at the movement's own stride) and the stride is then stretched or shortened to land on the
//               mark; the figures are in the report. The body turns to the direction of travel over the first half second.
// Looks: for a stretch of time the head is turned toward a point in the room (the other performer's head, a spot on the
// floor). The turn is shared between the upper spine (15%), the neck (35%) and the head (50%), eases in and out over 0.3 s,
// and stops at 70 degrees from where the movement itself points the head, so a target behind is looked at over the shoulder
// as far as that goes. Eyes are not modelled: this is where the face points.
// Items are joined by blending poses for `blend` seconds. This is pose blending: no balance, no reaching, no obstacle
// avoidance. Turning on the spot does not step: the feet swivel.
export type StageItem={action:Action;name:string;duration?:number;speed?:number;walkTo?:number[];face?:number[]};
export type StageLook={start:number;end:number;target:(time:number)=>number[]};
// A reach: over start..end one hand goes to a point in the room and comes back (0.5 s out, 0.5 s back), the arm bent or
// straightened at shoulder and elbow, with the trunk leaning a little when the point is past arm's length.
export type StageReach={start:number;end:number;hand:'l'|'r';target:number[]};
export type StageReport={item:number;name:string;start:number;end:number;kind:'on the spot'|'walk';from:number[];to:number[];cycles?:number;strideScale?:number;speed:number}[];
const FEET=['foot_l','ball_l','foot_r','ball_r'];
export function stagePerformer(model:THREE.Object3D,clips:THREE.AnimationClip[],scale:number,id:string,name:string,start:{position:number[];facing:number[]},items:StageItem[],looks:StageLook[]=[],blend=.3,reaches:StageReach[]=[]):{action:Action;report:StageReport;duration:number;reaches:{start:number;end:number;hand:string;shortByMeters:number}[]}{
 const reached=reaches.map(r=>({start:r.start,end:r.end,hand:r.hand,shortByMeters:0,best:Infinity}));
 if(!items.length||items.length>30)throw Error('Stage 1–30 items for a performer');
 const player=new CharacterPlayer(model,clips,scale),bones:THREE.Object3D[]=[];model.traverse(b=>{if((b as THREE.Bone).isBone)bones.push(b);});
 const up=new THREE.Vector3(0,1,0),v=new THREE.Vector3(),world=(n:string)=>model.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
 type Pose={rootP:THREE.Vector3;rootQ:THREE.Quaternion;rootS:THREE.Vector3;bones:{p:THREE.Vector3;q:THREE.Quaternion;s:THREE.Vector3}[];feet:THREE.Vector3[];forward:number};
 // a pose of a movement at a time in it: bones, root, where the feet are relative to the root (metres), and which way the hips face
 const capture=(a:Action,t:number):Pose=>{player.sample(a,t);model.updateMatrixWorld(true);const rootW=model.getWorldPosition(new THREE.Vector3()),across=world('thigh_r').sub(world('thigh_l')),f=v.copy(up).cross(across);return {rootP:model.position.clone(),rootQ:model.quaternion.clone(),rootS:model.scale.clone(),bones:bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()})),feet:FEET.map(n=>world(n).sub(rootW)),forward:Math.atan2(f.x,f.z)};};
 // how far along its own forward a movement carries the body by each time in one cycle, from the feet (see above)
 const travelOf=(a:Action,speed:number,rate:number)=>{const T=duration(a),n=Math.max(2,Math.round(T/speed*rate)),first=capture(a,0),dir=new THREE.Vector3(Math.sin(first.forward),0,Math.cos(first.forward)),out=[0];let prev=first,support=-1;for(let k=1;k<=n;k++){const p=capture(a,Math.min(T,k/n*T));let low=0;for(let j=1;j<4;j++)if(prev.feet[j].y+p.feet[j].y<prev.feet[low].y+p.feet[low].y)low=j;if(support<0||Math.floor(support/2)!==Math.floor(low/2))support=low;const rel=p.feet[support].clone().sub(prev.feet[support]);out.push(out[k-1]+Math.max(0,-rel.dot(dir)));prev=p;}return {cycle:T/speed,samples:out};};
 // which way the head's own axes point when the head faces forward, read from the T-pose
 const tpose:Action={version:2,rig:'quaternius-ual1',id:'tpose',name:'T',phases:[{id:'t',name:'T',intent:'',duration:.1,kind:'hold',clip:'A_TPose',from:0,to:0}],tracks:[],cues:[]},t0=capture(tpose,0),headBone=model.getObjectByName('Head')!,headAxis=new THREE.Vector3(Math.sin(t0.forward),0,Math.cos(t0.forward)).applyQuaternion(headBone.getWorldQuaternion(new THREE.Quaternion()).invert());
 const chain=[['spine_03',.15],['neck_01',.35],['Head',.5]] as const,boneIndex=new Map(bones.map((b,j)=>[b.name,j]));
 const total=items.reduce((s,i)=>s+(i.duration??duration(i.action)/(i.speed??1)),0);if(!(total>0)||total>30)throw Error('A part runs up to 30 seconds');
 const rate=Math.min(30,Math.floor(510/total)),ease=(x:number)=>x<=0?0:x>=1?1:x*x*(3-2*x),wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
 const tracks:NonNullable<Action['tracks']>=[];for(const target of ['$root',...bones.map(b=>b.name)])for(const property of ['rotation','position','scale'] as const)tracks.push({target,property,mode:'absolute',interpolation:'linear',keys:[]});
 const phases:Action['phases']=[],report:StageReport=[];let at=new THREE.Vector2(start.position[0],start.position[1]),yaw=Math.atan2(start.facing[0]-start.position[0],start.facing[1]-start.position[1]),clock=0;
 const plans=items.map((item,i)=>{const speed=item.speed??1;if(!(speed>=.4&&speed<=1.6))throw Error('Use speed 0.4–1.6');const T=duration(item.action)/speed,begin=clock,from=at.clone(),yawFrom=yaw;let length=item.duration??T,walk:any=null,yawTo=yaw;
   if(item.walkTo){const to=new THREE.Vector2(item.walkTo[0],item.walkTo[1]),dist=to.distanceTo(from);if(dist<.05)throw Error(`${item.name}: already at that mark`);const tr=travelOf(item.action,speed,rate),per=tr.samples[tr.samples.length-1];if(per<.02)throw Error(`${item.name}: this movement does not carry the body forward, so it cannot walk`);
    const cycles=Math.max(1,item.duration?Math.round(item.duration/T):Math.round(dist/per));length=cycles*T;walk={to,dist,cycles,per,samples:tr.samples,stride:dist/(cycles*per)};yawTo=Math.atan2(to.x-from.x,to.y-from.y);at=to;yaw=yawTo;}
   else if(item.face){yawTo=Math.atan2(item.face[0]-from.x,item.face[1]-from.y);yaw=yawTo;}
   if(length<.1||length>16)throw Error(`${item.name}: an item runs 0.1–16 seconds`);clock+=length;
   phases.push({id:`s${i}`,name:item.name.slice(0,64),intent:walk?`Walk ${walk.dist.toFixed(2)} m in ${walk.cycles} cycle(s), stride x${walk.stride.toFixed(2)}`:'On the spot',duration:length,kind:walk?'move':'hold',clip:'A_TPose',from:0,to:0});
   report.push({item:i,name:item.name,start:Math.round(begin*100)/100,end:Math.round(clock*100)/100,kind:walk?'walk':'on the spot',from:from.toArray().map(x=>Math.round(x*100)/100),to:at.toArray().map(x=>Math.round(x*100)/100),...(walk?{cycles:walk.cycles,strideScale:Math.round(walk.stride*100)/100}:{}),speed});
   return {item,speed,T,begin,length,from,walk,yawFrom,yawTo,forward:capture(item.action,0).forward,last:null as Pose|null};});
 const sum=phases.reduce((n,p)=>n+p.duration,0),frames=Math.floor(sum*rate-1e-6);  // whole frames, then one last key exactly at the end
 for(let k=0;k<=frames+1;k++){const time=k>frames?sum:k/rate,plan=plans.find(p=>time<p.begin+p.length-1e-9)??plans[plans.length-1],local=Math.max(0,time-plan.begin),cycleTime=(Math.min(local,plan.length-1e-6)%plan.T)*plan.speed,pose=capture(plan.item.action,Math.min(duration(plan.item.action),cycleTime));
  // where the body is and which way it faces
  const turn=wrap(plan.yawTo-plan.yawFrom),facing=plan.yawFrom+turn*ease(local/.5),place=plan.from.clone();
  if(plan.walk){const w=plan.walk,done=Math.floor(local/plan.T+1e-9),part=(local-done*plan.T)/plan.T*(w.samples.length-1),lo=Math.min(w.samples.length-1,Math.floor(part)),hi=Math.min(w.samples.length-1,lo+1),along=(Math.min(done,w.cycles)*w.per+(done>=w.cycles?0:w.samples[lo]+(w.samples[hi]-w.samples[lo])*(part-lo)))*w.stride,u=Math.min(1,along/w.dist);place.lerp(w.to,u);}
  // blend from the pose the previous item ended on
  const prior=plans[plans.indexOf(plan)-1];if(prior&&local<blend){const held=prior.last??=capture(prior.item.action,Math.min(duration(prior.item.action),((prior.length-1e-6)%prior.T)*prior.speed));const x=ease(local/blend);pose.rootQ=held.rootQ.clone().slerp(pose.rootQ,x);pose.rootP=held.rootP.clone().lerp(pose.rootP,x);pose.bones=pose.bones.map((b,j)=>({p:held!.bones[j].p.clone().lerp(b.p,x),q:held!.bones[j].q.clone().slerp(b.q,x),s:held!.bones[j].s.clone().lerp(b.s,x)}));}
  // root: the movement's own turn and height, stood at the place and turned to the facing; its drift over the floor is dropped
  const q=new THREE.Quaternion().setFromAxisAngle(up,facing-plan.forward).multiply(pose.rootQ).normalize(),p=[place.x,pose.rootP.y*scale,place.y];
  // looks: with the pose stood in the room, turn spine, neck and head toward the target
  const look=looks.find(l=>time>=l.start&&time<=l.end);if(look){const w=ease(Math.min((time-look.start)/.3,(look.end-time)/.3,1));if(w>0){model.position.set(p[0]/scale,p[1]/scale,p[2]/scale);model.quaternion.copy(q);pose.bones.forEach((b,j)=>{bones[j].position.copy(b.p);bones[j].quaternion.copy(b.q);bones[j].scale.copy(b.s);});model.updateMatrixWorld(true);
    const target=new THREE.Vector3().fromArray(look.target(time));let left=1;for(const [name,share] of chain){const bone=model.getObjectByName(name)!,head=headBone.getWorldPosition(new THREE.Vector3()),now=headAxis.clone().applyQuaternion(headBone.getWorldQuaternion(new THREE.Quaternion())),want=target.clone().sub(head).normalize(),angle=Math.min(now.angleTo(want),70*Math.PI/180*left),axis=now.clone().cross(want);if(axis.lengthSq()<1e-10||angle<1e-5)continue;
     const R=new THREE.Quaternion().setFromAxisAngle(axis.normalize(),angle*w*share/left),parent=bone.parent!.getWorldQuaternion(new THREE.Quaternion());bone.quaternion.premultiply(parent.clone().invert().multiply(R).multiply(parent));bone.updateMatrixWorld(true);pose.bones[boneIndex.get(name)!].q=bone.quaternion.clone();left-=share;}}}
  // reaches: with the pose stood in the room, lean the trunk if the point is far, then bend the arm so the wrist gets there
  const reach=reaches.find(r=>time>=r.start&&time<=r.end);if(reach){const w=ease(Math.min((time-reach.start)/.5,(reach.end-time)/.5,1));if(w>0){model.position.set(p[0]/scale,p[1]/scale,p[2]/scale);model.quaternion.copy(q);pose.bones.forEach((b,j)=>{bones[j].position.copy(b.p);bones[j].quaternion.copy(b.q);bones[j].scale.copy(b.s);});model.updateMatrixWorld(true);
    const s=reach.hand,goal=new THREE.Vector3().fromArray(reach.target),bone=(n:string)=>model.getObjectByName(n)!,keep=(n:string)=>{pose.bones[boneIndex.get(n)!].q=bone(n).quaternion.clone();};
    const turn=(n:string,R:THREE.Quaternion)=>{const b=bone(n),parent=b.parent!.getWorldQuaternion(new THREE.Quaternion());b.quaternion.premultiply(parent.clone().invert().multiply(R).multiply(parent)).normalize();b.updateWorldMatrix(false,true);keep(n);};
    {const S=world('upperarm_'+s),arm=world('lowerarm_'+s).distanceTo(S)+world('hand_'+s).distanceTo(world('lowerarm_'+s)),to=goal.clone().sub(S),over=to.length()-arm*.95;if(over>0){const flat=to.clone().setY(0);if(flat.lengthSq()>1e-8)turn('spine_02',new THREE.Quaternion().setFromAxisAngle(up.clone().cross(flat.normalize()).normalize(),Math.min(.45,over/.22)*w));}}
    const S=world('upperarm_'+s),E=world('lowerarm_'+s),W0=world('hand_'+s),l1=E.distanceTo(S),l2=W0.distanceTo(E),aimAt=W0.clone().lerp(goal,w),to=aimAt.clone().sub(S),far=to.length();
    if(far>1e-4){const dir=to.divideScalar(far),d=Math.min(l1+l2-1e-3,Math.max(Math.abs(l1-l2)+1e-3,far)),along=(l1*l1-l2*l2+d*d)/(2*d),out=Math.sqrt(Math.max(0,l1*l1-along*along)),e0=E.clone().sub(S);let side=e0.addScaledVector(dir,-e0.dot(dir));if(side.lengthSq()<1e-8)side=new THREE.Vector3(0,-1,0).addScaledVector(dir,dir.y);side.normalize();
     const elbow=S.clone().addScaledVector(dir,along).addScaledVector(side,out),wrist=S.clone().addScaledVector(dir,d);turn('upperarm_'+s,new THREE.Quaternion().setFromUnitVectors(E.clone().sub(S).normalize(),elbow.clone().sub(S).normalize()));const E2=world('lowerarm_'+s);turn('lowerarm_'+s,new THREE.Quaternion().setFromUnitVectors(world('hand_'+s).sub(E2).normalize(),wrist.sub(E2).normalize()));}
    const rec=reached[reaches.indexOf(reach)],off=Math.abs(time-(reach.start+reach.end)/2);if(off<rec.best){rec.best=off;rec.shortByMeters=Math.round(world('hand_'+s).distanceTo(goal)*1000)/1000;}}}
  tracks[0].keys.push({time,value:q.toArray()});tracks[1].keys.push({time,value:p});tracks[2].keys.push({time,value:pose.rootS.toArray()});
  pose.bones.forEach((b,j)=>{tracks[(j+1)*3].keys.push({time,value:b.q.clone().normalize().toArray()});tracks[(j+1)*3+1].keys.push({time,value:b.p.toArray()});tracks[(j+1)*3+2].keys.push({time,value:b.s.toArray()});});
 }
 for(const track of tracks){const first=track.keys[0].value;if(track.keys.every(k=>k.value.every((x,i)=>Math.abs(x-first[i])<1e-7)))track.keys=[track.keys[0]];}
 return {action:{version:2,rig:'quaternius-ual1',id,name,phases,tracks,cues:[]},report,duration:sum,reaches:reached.map(({best,...r})=>r)};
}
