import * as THREE from 'three/webgpu';
import {Action,duration} from './action';
import {CharacterPlayer} from './player';
// Two performers in one space: solid bodies between them. Within one body the retarget already keeps limbs out of the trunk,
// the head and the legs (R30, R40). The same measure is applied here across the two bodies: points along one performer's limbs
// against rods along the other's body, with the radii the retarget uses, both placed as their pair record says.
// Where a limb point is inside the other body, that limb gives way: it is turned at its root joint (hip for a leg, shoulder for
// an arm) by the smallest angle that brings the point to the surface. So an attacker's foot stops on the body it hits; the body
// that is hit is not moved. The turn starts 4 cm before the touch and grows smoothly, as in R40, so it does not pop.
// Contacts are the stretches where, after that, a limb point is within 1.5 cm of the other's surface.
const limbs:{root:string,side:string,kind:'leg'|'arm',points:[string,string|null,number,string][]}[]=['l','r'].flatMap(s=>[
 {root:'thigh_'+s,side:s,kind:'leg' as const,points:[['calf_'+s,null,.06,'knee_'+s],['calf_'+s,'foot_'+s,.055,'shin_'+s],['foot_'+s,null,.045,'ankle_'+s],['ball_'+s,null,.035,'toes_'+s]] as [string,string|null,number,string][]},
 {root:'upperarm_'+s,side:s,kind:'arm' as const,points:[['lowerarm_'+s,null,.04,'elbow_'+s],['lowerarm_'+s,'hand_'+s,.04,'forearm_'+s],['hand_'+s,null,.035,'wrist_'+s],['middle_01_'+s,null,.025,'palm_'+s]] as [string,string|null,number,string][]}]);
const rods:[string,string,number,string][]=[['pelvis','neck_01',.11,'trunk'],['neck_01','Head',.07,'neck'],...['l','r'].flatMap(s=>[['thigh_'+s,'calf_'+s,.075,'thigh_'+s],['calf_'+s,'foot_'+s,.055,'shin_'+s],['upperarm_'+s,'lowerarm_'+s,.045,'upperarm_'+s],['lowerarm_'+s,'hand_'+s,.04,'forearm_'+s]] as [string,string,number,string][])];
export type PairContactReport={sampleRate:number,frames:number,thresholdMeters:number,before:{framesInside:number,worstMeters:number,stretches:{from:number,to:number,worstMeters:number,pair:string}[]},after:{framesInside:number,worstMeters:number,stretches:{from:number,to:number,worstMeters:number,pair:string}[]},limbsTurnedFrames:{left:number,right:number},contacts:{from:number,to:number,pair:string}[]};
export function resolvePairContact(models:[THREE.Object3D,THREE.Object3D],clips:THREE.AnimationClip[],scale:number,actions:[Action,Action],offsets:[number[],number[]],apply:boolean):{actions:[Action,Action],report:PairContactReport}{
 const names=['left','right'],out=[structuredClone(actions[0]),structuredClone(actions[1])] as [Action,Action],players=models.map(m=>new CharacterPlayer(m,clips,scale));
 const get=(m:THREE.Object3D,n:string)=>{const b=m.getObjectByName(n);if(!b)throw Error('Missing bone '+n);return b;},at=(m:THREE.Object3D,n:string)=>get(m,n).getWorldPosition(new THREE.Vector3());
 const track=(a:Action,bone:string)=>a.tracks?.find(t=>t.target===bone&&t.property==='rotation'),times=track(out[0],'thigh_l')?.keys.map(k=>k.time)||[];
 if(times.length<2)throw Error('Pair contact needs baked actions with per-frame keys');
 for(const a of out)for(const l of limbs){const t=track(a,l.root);if(!t||t.keys.length!==times.length||t.keys.some((k,i)=>Math.abs(k.time-times[i])>1e-6))throw Error('The two actions do not share key times; rebuild both from the same window');}
 // Deepest overlap of any limb point of body `a` in any rod of body `b`; depth is positive inside.
 const deepest=(a:number,b:number,only?:typeof limbs[number])=>{let best={depth:-1,limb:limbs[0],point:new THREE.Vector3(),push:new THREE.Vector3(),pair:''};
  for(const limb of only?[only]:limbs)for(const [p0,p1,r,label] of limb.points){if(!models[a].getObjectByName(p0))continue;const q=p1?at(models[a],p0).lerp(at(models[a],p1),.5):at(models[a],p0);
   for(const [r0,r1,R,part] of rods){const s=at(models[b],r0),e=at(models[b],r1),ab=e.clone().sub(s),u=Math.min(1,Math.max(0,q.clone().sub(s).dot(ab)/Math.max(ab.lengthSq(),1e-9))),near=s.addScaledVector(ab,u),gap=q.distanceTo(near),d=r+R-gap;if(d>best.depth&&gap>1e-6)best={depth:d,limb,point:q,push:q.clone().sub(near).divideScalar(gap),pair:`${names[a]} ${label} in ${names[b]} ${part}`};}}
  return best;};
 const worstOf=()=>{const x=deepest(0,1),y=deepest(1,0);return x.depth>=y.depth?{...x,body:0}:{...y,body:1};};
 const before:{time:number,depth:number,pair:string}[]=[],after:typeof before=[],turned=[0,0],ease=.04,touch=.015;
 times.forEach((time,k)=>{
  models.forEach((m,i)=>{players[i].sample(actions[i],Math.min(time,duration(actions[i])));m.parent!.position.set(offsets[i][0],offsets[i][1],offsets[i][2]);m.parent!.updateMatrixWorld(true);});
  const first=worstOf();before.push({time,depth:first.depth,pair:first.pair});
  if(apply){const moved=[new Set<string>(),new Set<string>()];
   for(let pass=0;pass<8;pass++){const w=worstOf();if(w.depth<=(pass?1e-4:-ease))break;const by=pass||w.depth>=ease?w.depth:(w.depth+ease)**2/(4*ease),bone=get(models[w.body],w.limb.root),pivot=bone.getWorldPosition(new THREE.Vector3()),lever=w.point.clone().sub(pivot),axis=lever.clone().cross(w.push),reach=axis.length();if(reach<1e-4)break;
    const parent=bone.parent!.getWorldQuaternion(new THREE.Quaternion());bone.quaternion.copy(parent.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(axis.divideScalar(reach),Math.min(.35,by/reach)).multiply(bone.getWorldQuaternion(new THREE.Quaternion()))).normalize());bone.updateWorldMatrix(false,true);moved[w.body].add(w.limb.root);}
   moved.forEach((set,i)=>{if(set.size&&first.depth>0)turned[i]++;for(const root of set){const key=track(out[i],root)!.keys[k],q=get(models[i],root).quaternion.clone(),prior=k?track(out[i],root)!.keys[k-1].value:null;if(prior&&q.dot(new THREE.Quaternion().fromArray(prior))<0)q.set(-q.x,-q.y,-q.z,-q.w);key.value=q.toArray();}});}
  const last=worstOf();after.push({time,depth:last.depth,pair:last.pair});
 });
 const threshold=.02,round=(x:number)=>Math.round(x*1000)/1000,runs=(rows:typeof before,test:(d:number)=>boolean)=>rows.reduce((list:{from:number,to:number,worstMeters:number,pair:string}[],r)=>{if(!test(r.depth))return list;const prev=list.at(-1);if(prev&&r.time-prev.to<=2.5*(times[1]-times[0])&&prev.pair===r.pair){prev.to=round(r.time);prev.worstMeters=Math.max(prev.worstMeters,round(r.depth));}else list.push({from:round(r.time),to:round(r.time),worstMeters:round(r.depth),pair:r.pair});return list;},[]);
 const summary=(rows:typeof before)=>({framesInside:rows.filter(r=>r.depth>threshold).length,worstMeters:round(Math.max(0,...rows.map(r=>r.depth))),stretches:runs(rows,d=>d>threshold)});
 return {actions:out,report:{sampleRate:Math.round(1/(times[1]-times[0])),frames:times.length,thresholdMeters:threshold,before:summary(before),after:summary(after),limbsTurnedFrames:{left:turned[0],right:turned[1]},contacts:runs(apply?after:before,d=>d>-touch).map(({from,to,pair})=>({from,to,pair:pair.replace(' in ',' on ')}))}};
}
