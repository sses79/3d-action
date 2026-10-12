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
// Flat colours for the clay figures, so a prompt can name each one ("the blue model"). Names are what the meta records.
export const figureColors:Record<string,string>={blue:'#4a86d8',orange:'#ee8a3a',green:'#4fae5a',pink:'#f07fb0',purple:'#8d6fd1',yellow:'#e8c53a',red:'#d9534a',gray:'#8e949c'};
// A figure of plain shapes on the mannequin's joints: capsules for trunk and limbs, spheres for head and hands. For a coarse
// clay reference (Seedance 2.5's guide prefers "simple geometric primitives" for people). Call with the mannequin at rest,
// scaled and in the scene; its own meshes are hidden and the shapes ride on its joints. k scales the thickness (height/1.85).
export function primitiveFigure(T:any,root:any,material:any,k=1){
 root.updateMatrixWorld(true);const made:any[]=[],B=(n:string)=>root.getObjectByName(n),wp=(n:string)=>B(n).getWorldPosition(new T.Vector3()),up=new T.Vector3(0,1,0);
 const put=(bone:string,mesh:any,part:string)=>{mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.userData.part=part;B(bone).attach(mesh);made.push(mesh);};
 const seg=(a:string,b:string,r:number,part='body',past=0)=>{const P=wp(a),Q=wp(b);if(part==='foot')Q.y=Math.max(Q.y,r*k);/* the sole rests on the floor */const d=Q.sub(P),len=d.length();d.normalize();const L=len+past*k,m=new T.Mesh(new T.CapsuleGeometry(r*k,L,4,12),material);m.position.copy(P).addScaledVector(d,L/2);m.quaternion.setFromUnitVectors(up,d);put(a,m,part);};
 const ball=(a:string,from:string,r:number,out:number,part:string)=>{const P=wp(a),d=part==='head'?up.clone():P.clone().sub(wp(from)).normalize(),m=new T.Mesh(new T.SphereGeometry(r*k,16,12),material);m.position.copy(P).addScaledVector(d,out*k);put(a,m,part);};
 root.traverse((o:any)=>{if(o.isSkinnedMesh)o.visible=false;});
 seg('pelvis','spine_02',.13);seg('spine_02','neck_01',.14);seg('neck_01','Head',.05);ball('Head','neck_01',.115,.1,'head');
 for(const s of ['l','r']){seg('clavicle_'+s,'upperarm_'+s,.055);seg('upperarm_'+s,'lowerarm_'+s,.05);seg('lowerarm_'+s,'hand_'+s,.04);ball('hand_'+s,'lowerarm_'+s,.05,.06,'body');seg('thigh_'+s,'calf_'+s,.075);seg('calf_'+s,'foot_'+s,.055);seg('foot_'+s,'ball_'+s,.045,'foot',.05);}
 return made;
}
export function follow(T:any,source:any,target:any,map:string[][],prefix=''){
 const find=(root:any,name:string)=>{let hit:any=null;root.traverse((o:any)=>{if(!hit&&o.isBone&&o.name===name)hit=o;});return hit;},pairs=map.map(([a,b])=>({s:find(source,a),t:find(target,prefix+b)})).filter(p=>p.s&&p.t),wq=(o:any)=>o.getWorldQuaternion(new T.Quaternion()),wp=(o:any)=>o.getWorldPosition(new T.Vector3());
 source.updateMatrixWorld(true);target.updateMatrixWorld(true);
 // rest alignment: point each mapped joint at its first mapped descendant as the mannequin's does
 const childOf=(p:any)=>pairs.find(c=>{let o=c.t.parent;while(o&&o!==p.t)o=o.parent;return o===p.t&&c!==p;});
 // Feet are left as they are: both bodies stand flat at rest, but ankle and toe joints sit differently in each foot, and
 // pointing one foot's joints like the other's stood this body on tiptoe.
 for(const p of pairs){const c=childOf(p);if(!c||p===pairs[0]||/^(foot|ball)_/.test(p.s.name))continue;const now=wp(c.t).sub(wp(p.t)).normalize(),want=wp(c.s).sub(wp(p.s)).normalize(),R=new T.Quaternion().setFromUnitVectors(now,want),parent=wq(p.t.parent);p.t.quaternion.premultiply(parent.clone().invert().multiply(R).multiply(parent));p.t.updateMatrixWorld(true);}
 const rest=pairs.map(p=>({s:wq(p.s).invert(),t:wq(p.t)})),hipS=wp(pairs[0].s).y,hipT=wp(pairs[0].t).y,hipLocal=pairs[0].t.position.clone();
 return {pairs:pairs.length,hipRatio:hipT/hipS,update(){source.updateMatrixWorld(true);
   // hips: where the mannequin's are over the floor, height in proportion; set in the target's parent space
   const at=wp(pairs[0].s);at.y*=hipT/hipS;pairs[0].t.parent.updateWorldMatrix(true,false);pairs[0].t.position.copy(pairs[0].t.parent.worldToLocal(at));void hipLocal;
   pairs.forEach((p,i)=>{const world=wq(p.s).multiply(rest[i].s).multiply(rest[i].t);p.t.parent.updateWorldMatrix(true,false);p.t.quaternion.copy(wq(p.t.parent).invert().multiply(world));p.t.updateMatrix();});target.updateMatrixWorld(true);}};
}
// A registered body of another skeleton (register_character): where its bones are named, which small inner meshes to hide,
// and which meshes are card hair. prepareFollower dresses a loaded one for clay: one material, hidden parts, and the hair
// cards replaced by one smooth volume fixed to the head (the cards' points, in the head's own space, each add a small blob to
// a field; the surface where the field is strong enough is drawn with marching cubes). The surface is built once and copied
// into a plain mesh: the MarchingCubes object itself takes seconds per frame in three's WebGPU renderer and stalled Studio
// (2026-10-11). The face shapes (121 on the body) are dropped: they cost 0.4 GB and do nothing for a clay figure. Convex shells of point groups looked
// like broken rock and fitted ellipsoids like scales. Returns the toe joints and how high they sit at rest: the file's own
// floor is y=0, so that is their height over the sole. Call with the body in its rest pose, already scaled and in the scene.
export type FollowerSpec={prefix:string;hide?:string[];hair?:string[]};
export function prepareFollower(T:any,MarchingCubes:any,body:any,spec:FollowerSpec,material:()=>any,hairMaterial:()=>any){
 body.traverse((o:any)=>{if(o.isMesh){o.geometry.morphAttributes={};o.morphTargetInfluences=undefined;o.morphTargetDictionary=undefined;o.material=material();o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;if(spec.hide?.some(h=>o.name.includes(h)))o.visible=false;}});
 if(spec.hair?.length){const head=body.getObjectByName(spec.prefix+'Head');body.updateMatrixWorld(true);const pts:any[]=[];
  body.traverse((m:any)=>{if(!m.isMesh||!spec.hair!.some(h=>m.name.includes(h)))return;m.visible=false;const at=m.geometry.getAttribute('position'),step=Math.max(1,Math.floor(at.count/1500));for(let k=0;k<at.count;k+=step){const v=new T.Vector3();if(m.isSkinnedMesh)m.getVertexPosition(k,v);else v.fromBufferAttribute(at,k);pts.push(head.worldToLocal(v.applyMatrix4(m.matrixWorld)));}});
  if(pts.length&&head){const box=new T.Box3().setFromPoints(pts),size=box.getSize(new T.Vector3()),side=Math.max(size.x,size.y,size.z)*1.3,mid=box.getCenter(new T.Vector3()),field=new MarchingCubes(64,hairMaterial(),false,false,200000);field.isolation=80;field.reset();const reach=.022,strength=92*reach*reach;for(const q of pts)field.addBall((q.x-mid.x)/side+.5,(q.y-mid.y)/side+.5,(q.z-mid.z)/side+.5,strength,12);field.update();const g=new T.BufferGeometry();for(const n of ['position','normal'])g.setAttribute(n,new T.BufferAttribute(field.geometry.getAttribute(n).array.slice(0,field.count*3),3));field.geometry.dispose();const plain=new T.Mesh(g,field.material);plain.position.copy(mid);plain.scale.setScalar(side/2);plain.castShadow=true;plain.receiveShadow=true;plain.frustumCulled=false;plain.name='hair';head.add(plain);}}
 body.updateMatrixWorld(true);const toes=[spec.prefix+'L_ToeBase',spec.prefix+'R_ToeBase'].map(n=>body.getObjectByName(n)).filter(Boolean);return {toes,rest:Math.min(...toes.map((o:any)=>o.getWorldPosition(new T.Vector3()).y))};
}
