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
// In sustained contact (a clinch) the deepest overlap moves from point to point between frames, and correcting each frame alone
// made the arms jerk: turns of up to 77 degrees in one frame on the first clinch tried. So the corrections are smoothed over
// time before they are kept: for each limb, the turn applied in each frame (against the action as it came in) is averaged with
// its neighbours over seven frames (weights 1 2 3 4 3 2 1). That gives back some of the overlap in exchange for movement that
// reads as an arm resting on a body. Correcting and smoothing are repeated four times, each round on what the last left.
// The "after" figures are measured on the final result.
// Reaction (optional, 0-1): the limb that is struck takes that share of the overlap instead of standing still. It is turned at
// its own hip or shoulder so that the place that was hit moves away along the line of the strike, and that turn then dies away
// with a time constant of 0.12 s (a third of it left after one eighth of a second), so the limb is knocked and recovers
// instead of snapping back in the next frame. A strike on the trunk or the neck has no reaction yet: nothing is turned there.
const limbs:{root:string,side:string,kind:'leg'|'arm',points:[string,string|null,number,string][]}[]=['l','r'].flatMap(s=>[
 {root:'thigh_'+s,side:s,kind:'leg' as const,points:[['calf_'+s,null,.06,'knee_'+s],['calf_'+s,'foot_'+s,.055,'shin_'+s],['foot_'+s,null,.045,'ankle_'+s],['ball_'+s,null,.035,'toes_'+s]] as [string,string|null,number,string][]},
 {root:'upperarm_'+s,side:s,kind:'arm' as const,points:[['lowerarm_'+s,null,.04,'elbow_'+s],['lowerarm_'+s,'hand_'+s,.04,'forearm_'+s],['hand_'+s,null,.035,'wrist_'+s],['middle_01_'+s,null,.025,'palm_'+s]] as [string,string|null,number,string][]}]);
const rods:[string,string,number,string][]=[['pelvis','neck_01',.11,'trunk'],['neck_01','Head',.07,'neck'],...['l','r'].flatMap(s=>[['thigh_'+s,'calf_'+s,.075,'thigh_'+s],['calf_'+s,'foot_'+s,.055,'shin_'+s],['upperarm_'+s,'lowerarm_'+s,.045,'upperarm_'+s],['lowerarm_'+s,'hand_'+s,.04,'forearm_'+s]] as [string,string,number,string][])];
export type PairContactReport={sampleRate:number,frames:number,thresholdMeters:number,before:{framesInside:number,worstMeters:number,stretches:{from:number,to:number,worstMeters:number,pair:string}[]},after:{framesInside:number,worstMeters:number,stretches:{from:number,to:number,worstMeters:number,pair:string}[]},limbsTurnedFrames:{left:number,right:number},struckFrames:{left:number,right:number},reaction:number,contacts:{from:number,to:number,pair:string}[]};
export function resolvePairContact(models:[THREE.Object3D,THREE.Object3D],clips:THREE.AnimationClip[],scale:number,actions:[Action,Action],offsets:[number[],number[]],apply:boolean,reaction=0,raw:[Action,Action]=actions,rounds=12):{actions:[Action,Action],report:PairContactReport}{
 const names=['left','right'],out=[structuredClone(actions[0]),structuredClone(actions[1])] as [Action,Action],players=models.map(m=>new CharacterPlayer(m,clips,scale));
 const get=(m:THREE.Object3D,n:string)=>{const b=m.getObjectByName(n);if(!b)throw Error('Missing bone '+n);return b;},at=(m:THREE.Object3D,n:string)=>get(m,n).getWorldPosition(new THREE.Vector3());
 const track=(a:Action,bone:string)=>a.tracks?.find(t=>t.target===bone&&t.property==='rotation'),times=track(out[0],'thigh_l')?.keys.map(k=>k.time)||[];
 if(times.length<2)throw Error('Pair contact needs baked actions with per-frame keys');
 for(const a of out)for(const l of limbs){const t=track(a,l.root);if(!t||t.keys.length!==times.length||t.keys.some((k,i)=>Math.abs(k.time-times[i])>1e-6))throw Error('The two actions do not share key times; rebuild both from the same window');}
 // Deepest overlap of any limb point of body `a` in any rod of body `b`; depth is positive inside.
 const deepest=(a:number,b:number,only?:typeof limbs[number])=>{let best={depth:-1,limb:limbs[0],point:new THREE.Vector3(),push:new THREE.Vector3(),near:new THREE.Vector3(),part:'',pair:''};
  for(const limb of only?[only]:limbs)for(const [p0,p1,r,label] of limb.points){if(!models[a].getObjectByName(p0))continue;const q=p1?at(models[a],p0).lerp(at(models[a],p1),.5):at(models[a],p0);
   for(const [r0,r1,R,part] of rods){const s=at(models[b],r0),e=at(models[b],r1),ab=e.clone().sub(s),u=Math.min(1,Math.max(0,q.clone().sub(s).dot(ab)/Math.max(ab.lengthSq(),1e-9))),near=s.addScaledVector(ab,u),gap=q.distanceTo(near),d=r+R-gap;if(d>best.depth&&gap>1e-6)best={depth:d,limb,point:q,push:q.clone().sub(near).divideScalar(gap),near:near.clone(),part,pair:`${names[a]} ${label} in ${names[b]} ${part}`};}}
  return best;};
 const worstOf=()=>{const x=deepest(0,1),y=deepest(1,0);return x.depth>=y.depth?{...x,body:0}:{...y,body:1};};
 function summarise(rows:{time:number,depth:number,pair:string}[]){const threshold=.02,round=(x:number)=>Math.round(x*1000)/1000,step=times[1]-times[0],list:{from:number,to:number,worstMeters:number,pair:string}[]=[];for(const r of rows){if(r.depth<=threshold)continue;const prev=list.at(-1);if(prev&&r.time-prev.to<=2.5*step&&prev.pair===r.pair){prev.to=round(r.time);prev.worstMeters=Math.max(prev.worstMeters,round(r.depth));}else list.push({from:round(r.time),to:round(r.time),worstMeters:round(r.depth),pair:r.pair});}return list;}
 const before:{time:number,depth:number,pair:string}[]=[],after:typeof before=[],turned=[0,0],struck=[0,0],ease=.04,touch=.015,knocks=[new Map<string,THREE.Quaternion>(),new Map<string,THREE.Quaternion>()],rootOf=(part:string)=>part.startsWith('thigh_')||part.startsWith('shin_')?'thigh_'+part.slice(-1):part.startsWith('upperarm_')||part.startsWith('forearm_')?'upperarm_'+part.slice(-1):null;
 const turn=(body:number,root:string,q:THREE.Quaternion)=>{const bone=get(models[body],root),parent=bone.parent!.getWorldQuaternion(new THREE.Quaternion());bone.quaternion.copy(parent.clone().invert().multiply(q.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion())))).normalize();bone.updateWorldMatrix(false,true);};
 times.forEach((time,k)=>{
  models.forEach((m,i)=>{players[i].sample(actions[i],Math.min(time,duration(actions[i])));m.parent!.position.set(offsets[i][0],offsets[i][1],offsets[i][2]);m.parent!.updateMatrixWorld(true);});
  const first=worstOf();before.push({time,depth:first.depth,pair:first.pair});
  if(apply){const moved=[new Set<string>(),new Set<string>()];
   // what is left of earlier knocks, then this frame's: the struck limb takes its share of the deepest overlap
   knocks.forEach((map,i)=>{for(const [root,q] of map){turn(i,root,q);moved[i].add(root);}});
   if(reaction>0)for(let pass=0;pass<2;pass++){const w=worstOf(),victim=1-w.body,root=rootOf(w.part);if(w.depth<=1e-4||!root)break;const pivot=at(models[victim],root),lever=w.near.clone().sub(pivot),axis=lever.clone().cross(w.push.clone().negate()),reach=axis.length();if(reach<1e-4)break;
    const q=new THREE.Quaternion().setFromAxisAngle(axis.divideScalar(reach),Math.min(.25,reaction*w.depth/reach));turn(victim,root,q);knocks[victim].set(root,q.multiply(knocks[victim].get(root)??new THREE.Quaternion()));moved[victim].add(root);if(!pass)struck[victim]++;}
   for(let pass=0;pass<8;pass++){const w=worstOf();if(w.depth<=(pass?1e-4:-ease))break;const by=pass||w.depth>=ease?w.depth:(w.depth+ease)**2/(4*ease),bone=get(models[w.body],w.limb.root),pivot=bone.getWorldPosition(new THREE.Vector3()),lever=w.point.clone().sub(pivot),axis=lever.clone().cross(w.push),reach=axis.length();if(reach<1e-4)break;
    const parent=bone.parent!.getWorldQuaternion(new THREE.Quaternion());bone.quaternion.copy(parent.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(axis.divideScalar(reach),Math.min(.35,by/reach)).multiply(bone.getWorldQuaternion(new THREE.Quaternion()))).normalize());bone.updateWorldMatrix(false,true);moved[w.body].add(w.limb.root);}
   moved.forEach((set,i)=>{if(set.size&&first.depth>0&&first.body===i)turned[i]++;for(const root of set){const key=track(out[i],root)!.keys[k],q=get(models[i],root).quaternion.clone(),prior=k?track(out[i],root)!.keys[k-1].value:null;if(prior&&q.dot(new THREE.Quaternion().fromArray(prior))<0)q.set(-q.x,-q.y,-q.z,-q.w);key.value=q.toArray();}});}
  const last=worstOf();after.push({time,depth:last.depth,pair:last.pair});const keep=Math.exp(-(k+1<times.length?times[k+1]-time:0)/.12);knocks.forEach(map=>{for(const [root,q] of map){const left=new THREE.Quaternion().slerp(q,keep);if(2*Math.acos(Math.min(1,Math.abs(left.w)))<.002)map.delete(root);else map.set(root,left);}});
 });
 if(apply){const weights=[1,2,3,4,3,2,1],half=3;
  out.forEach((a,i)=>{for(const l of limbs){const fixed=track(a,l.root)!.keys,rawKeys=track(raw[i],l.root)!.keys;if(fixed.every((k,n)=>k.value.every((v,c)=>Math.abs(v-rawKeys[n].value[c])<1e-9)))continue;
   // the turn applied in each frame, as a rotation vector in the parent's frame
   const turns=fixed.map((k,n)=>{const d=new THREE.Quaternion().fromArray(k.value).multiply(new THREE.Quaternion().fromArray(rawKeys[n].value).invert());if(d.w<0)d.set(-d.x,-d.y,-d.z,-d.w);const angle=2*Math.acos(Math.min(1,d.w)),sine=Math.sqrt(Math.max(0,1-d.w*d.w));return sine<1e-9?new THREE.Vector3():new THREE.Vector3(d.x,d.y,d.z).multiplyScalar(angle/sine);});
   fixed.forEach((k,n)=>{const sum=new THREE.Vector3();let total=0;for(let j=-half;j<=half;j++){const m=n+j;if(m<0||m>=turns.length)continue;sum.addScaledVector(turns[m],weights[j+half]);total+=weights[j+half];}sum.divideScalar(total);const angle=sum.length(),q=(angle<1e-9?new THREE.Quaternion():new THREE.Quaternion().setFromAxisAngle(sum.clone().divideScalar(angle),angle)).multiply(new THREE.Quaternion().fromArray(rawKeys[n].value)).normalize(),prior=n?fixed[n-1].value:null;if(prior&&q.dot(new THREE.Quaternion().fromArray(prior))<0)q.set(-q.x,-q.y,-q.z,-q.w);k.value=q.toArray();});}});
  // Smoothing gives overlap back, so the two steps are repeated: correct what is left, smooth the whole turn again (always
  // against the action as it first came in). Four rounds; each leaves less.
  const mine={framesInside:before.filter(r=>r.depth>.02).length,worstMeters:Math.round(Math.max(0,...before.map(r=>r.depth))*1000)/1000,stretches:summarise(before)};
  if(rounds>1){const next=resolvePairContact(models,clips,scale,out,offsets,true,0,raw,rounds-1);return {actions:next.actions,report:{...next.report,before:mine,limbsTurnedFrames:{left:Math.max(turned[0],next.report.limbsTurnedFrames.left),right:Math.max(turned[1],next.report.limbsTurnedFrames.right)},struckFrames:{left:struck[0],right:struck[1]},reaction}};}
  // measure what is left on the smoothed actions
  const again=resolvePairContact(models,clips,scale,out,offsets,false);return {actions:out,report:{...again.report,before:(()=>{const threshold=.02,round=(x:number)=>Math.round(x*1000)/1000;return {framesInside:before.filter(r=>r.depth>threshold).length,worstMeters:round(Math.max(0,...before.map(r=>r.depth))),stretches:summarise(before)};})(),after:again.report.before,limbsTurnedFrames:{left:turned[0],right:turned[1]},struckFrames:{left:struck[0],right:struck[1]},reaction}};}
 const threshold=.02,round=(x:number)=>Math.round(x*1000)/1000,runs=(rows:typeof before,test:(d:number)=>boolean)=>rows.reduce((list:{from:number,to:number,worstMeters:number,pair:string}[],r)=>{if(!test(r.depth))return list;const prev=list.at(-1);if(prev&&r.time-prev.to<=2.5*(times[1]-times[0])&&prev.pair===r.pair){prev.to=round(r.time);prev.worstMeters=Math.max(prev.worstMeters,round(r.depth));}else list.push({from:round(r.time),to:round(r.time),worstMeters:round(r.depth),pair:r.pair});return list;},[]);
 const summary=(rows:typeof before)=>({framesInside:rows.filter(r=>r.depth>threshold).length,worstMeters:round(Math.max(0,...rows.map(r=>r.depth))),stretches:runs(rows,d=>d>threshold)});
 return {actions:out,report:{sampleRate:Math.round(1/(times[1]-times[0])),frames:times.length,thresholdMeters:threshold,before:summary(before),after:summary(after),limbsTurnedFrames:{left:turned[0],right:turned[1]},struckFrames:{left:struck[0],right:struck[1]},reaction,contacts:runs(apply?after:before,d=>d>-touch).map(({from,to,pair})=>({from,to,pair:pair.replace(' in ',' on ')}))}};
}
