import {Action} from './action';
// Other bodies for the same skeleton. The Studio mannequin and these share 65 joints, name for name, so every movement and
// action plays on them. What differs is the body's own proportions: the library's clips and baked tracks carry the mannequin's
// bone offsets, so on another body only the rotations are applied (plus the pelvis' position, which carries height), and the
// figure is then raised or lowered so its feet meet the floor.
export const characterFiles:Record<string,string|null>={mannequin:null,'superhero-female':'superhero-female.glb','superhero-male':'superhero-male.glb'};
const keeps=(track:string)=>track.endsWith('.quaternion')||track.startsWith('pelvis.')||!track.includes('.');
export function ownShapeClips(T:any,clips:any[]){return clips.map(c=>new T.AnimationClip(c.name,c.duration,c.tracks.filter((t:any)=>keeps(t.name))));}
const cache=new WeakMap<Action,Action>();
export function ownShapeAction(a:Action):Action{let b=cache.get(a);if(!b){b={...a,tracks:(a.tracks??[]).filter(t=>t.property==='rotation'||t.target==='$root'||t.target==='pelvis')};cache.set(a,b);}return b;}
// How high the ball of the foot sits over the sole, from the body's rest pose (call before posing; the model must be in the scene graph with its final scale).
export function ballHeight(T:any,root:any){root.updateMatrixWorld(true);const low=new T.Box3().setFromObject(root).min.y;return Math.min(...['ball_l','ball_r'].map(n=>root.getObjectByName(n).getWorldPosition(new T.Vector3()).y))-low;}
// How far to raise the figure so that, over the action, the lowest the balls of its feet come is their rest height over the floor.
export function floorLift(T:any,root:any,sample:(time:number)=>void,duration:number,rest:number){let low=Infinity;for(let k=0;k<=24;k++){sample(duration*k/24);root.updateMatrixWorld(true);for(const n of ['ball_l','ball_r'])low=Math.min(low,root.getObjectByName(n).getWorldPosition(new T.Vector3()).y);}return rest-low;}
// A body with a different skeleton follows the mannequin instead of sharing its joints. `map` pairs the mannequin's joints with
// the other body's, parent before child. Once, the other body's rest pose is brought to the mannequin's (each mapped joint is
// turned so that it points at its next mapped joint the way the mannequin's does: an A-pose becomes a T-pose). Then on every
// frame each mapped joint takes the turn its mannequin joint has made from rest, in world axes, and the hips are put where
// the mannequin's are (height scaled by the two rest hip heights). Joints with no partner (twist, face, toes) stay at rest.
// Character Creator's standard export skeleton (bones prefixed e.g. EM3D_Base_ or CC_Base_):
const side=(s:string,S:string)=>[['clavicle_'+s,S+'_Clavicle'],['upperarm_'+s,S+'_Upperarm'],['lowerarm_'+s,S+'_Forearm'],['hand_'+s,S+'_Hand'],...['thumb','index','middle','ring','pinky'].flatMap((f,k)=>[1,2,3].map(j=>[`${f}_0${j}_${s}`,`${S}_${['Thumb','Index','Mid','Ring','Pinky'][k]}${j}`])),['thigh_'+s,S+'_Thigh'],['calf_'+s,S+'_Calf'],['foot_'+s,S+'_Foot'],['ball_'+s,S+'_ToeBase']];
export const characterCreatorMap:string[][]=[['pelvis','Hip'],['spine_01','Waist'],['spine_02','Spine01'],['spine_03','Spine02'],['neck_01','NeckTwist01'],['Head','Head'],...side('l','L'),...side('r','R')];
export function follow(T:any,source:any,target:any,map:string[][],prefix=''){
 const find=(root:any,name:string)=>{let hit:any=null;root.traverse((o:any)=>{if(!hit&&o.isBone&&o.name===name)hit=o;});return hit;},pairs=map.map(([a,b])=>({s:find(source,a),t:find(target,prefix+b)})).filter(p=>p.s&&p.t),wq=(o:any)=>o.getWorldQuaternion(new T.Quaternion()),wp=(o:any)=>o.getWorldPosition(new T.Vector3());
 source.updateMatrixWorld(true);target.updateMatrixWorld(true);
 // rest alignment: point each mapped joint at its first mapped descendant as the mannequin's does
 const childOf=(p:any)=>pairs.find(c=>{let o=c.t.parent;while(o&&o!==p.t)o=o.parent;return o===p.t&&c!==p;});
 for(const p of pairs){const c=childOf(p);if(!c||p===pairs[0])continue;const now=wp(c.t).sub(wp(p.t)).normalize(),want=wp(c.s).sub(wp(p.s)).normalize(),R=new T.Quaternion().setFromUnitVectors(now,want),parent=wq(p.t.parent);p.t.quaternion.premultiply(parent.clone().invert().multiply(R).multiply(parent));p.t.updateMatrixWorld(true);}
 const rest=pairs.map(p=>({s:wq(p.s).invert(),t:wq(p.t)})),hipS=wp(pairs[0].s).y,hipT=wp(pairs[0].t).y,hipLocal=pairs[0].t.position.clone();
 return {pairs:pairs.length,hipRatio:hipT/hipS,update(){source.updateMatrixWorld(true);
   // hips: where the mannequin's are over the floor, height in proportion; set in the target's parent space
   const at=wp(pairs[0].s);at.y*=hipT/hipS;pairs[0].t.parent.updateWorldMatrix(true,false);pairs[0].t.position.copy(pairs[0].t.parent.worldToLocal(at));void hipLocal;
   pairs.forEach((p,i)=>{const world=wq(p.s).multiply(rest[i].s).multiply(rest[i].t);p.t.parent.updateWorldMatrix(true,false);p.t.quaternion.copy(wq(p.t.parent).invert().multiply(world));p.t.updateMatrix();});target.updateMatrixWorld(true);}};
}
