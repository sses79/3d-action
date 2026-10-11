import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CharacterPlayer} from '../../runtime/player';
import {PairScene,SceneObject,SceneCamera,StagedShot,sceneCameraAt,sampleSeries,buildSceneObjects,standInRoom} from '../../runtime/pair-scene';
// White-model render of a pair of actions, one picture per call. Cameras:
//  source  the camera of the source video. The body model places each performer relative to that camera, and the actions keep
//          those positions, so a camera at that origin with the model's lens (focal length = the picture's diagonal in pixels)
//          sees the pair framed as the video framed the performers. Its height over our floor comes, per frame, from how far
//          below the camera's axis the model put each performer's hips against how high our character's hips are.
//  fixed   the source camera held where it was on the first frame. With a scene: a camera that stands still in the room and
//          keeps both performers in full view for the whole clip, to show how they move over the floor (sliding feet, drift).
//  orbit   a slow quarter circle round the pair at eye height, always looking at the point between them.
//  staged  (payload.staged) a scene staged from text: the actions are already in the room, each figure is scaled to its
//          performer's height, and the camera is the scene's shot for the time. 'fixed' is the still check camera as above.
type Payload={staged?:{objects:SceneObject[],heights:number[],cameras:StagedShot[]},level?:{normal:number[],height?:number},scene?:PairScene,track?:SceneCamera,stage?:{positions:number[],indices:number[],time:number,room?:boolean},actions:any[],origins:number[][],hips:number[][][],duration:number,width:number,height:number,camera:'source'|'fixed'|'orbit'};
async function init(){
 const payload:Payload=await fetch('/payload.json').then(r=>r.json()),{width,height}=payload,scene=new T.Scene();scene.background=new T.Color('#eceeef');scene.fog=new T.Fog('#eceeef',14,40);
 const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(width,height);renderer.setPixelRatio(1);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;document.body.appendChild(renderer.domElement);
 scene.add(new T.HemisphereLight(0xffffff,0xb9bec4,2.1));const sun=new T.DirectionalLight(0xffffff,2.4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.radius=6;sun.shadow.bias=-.0004;const sc=sun.shadow.camera as T.OrthographicCamera;sc.left=-4;sc.right=4;sc.top=4;sc.bottom=-4;sc.near=.5;sc.far=30;scene.add(sun,sun.target);
 const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#f1f2f2',roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
 const gltf=await new GLTFLoader().loadAsync('/character.glb'),clay=new T.MeshStandardMaterial({color:'#f4f3f0',roughness:.82,metalness:0});
 // one load of the asset per character: a skinned mesh does not survive a plain clone
 const second=payload.actions.length>1?await new GLTFLoader().loadAsync('/character.glb'):null,cast=payload.actions.map((_,i)=>({root:i?second!.scene:gltf.scene}));
 const players=cast.map(({root},i)=>{const holder=new T.Group();holder.add(root);scene.add(holder);const scale=1.85/new T.Box3().setFromObject(root).getSize(new T.Vector3()).y*((payload.staged?.heights[i]??1.85)/1.85);holder.scale.setScalar(scale);root.traverse(o=>{const m=o as T.Mesh;if(m.isMesh){m.material=clay;m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;}});const anims=i?second!.animations:gltf.animations;return {holder,root,scale,player:new CharacterPlayer(root,anims,scale)};});
 const camera=new T.PerspectiveCamera(2*Math.atan(height/(2*Math.hypot(width,height)))*180/Math.PI,width/height,.1,200);
 // Level room. The source camera is rarely level: here the floor's normal in the camera's space (from a point map of the
 // source frame, given in payload.level) says how the camera is tipped. `level` is the turn that stands that normal upright.
 // With it the world is the room: the floor is flat, the performers are turned upright by the same turn (their poses were
 // estimated in the camera's axes, so a camera pitched down made them lean), their positions on the floor are their
 // camera-space positions turned the same way, and the source camera is pitched as the real one was. Heights still come from
 // each character's own floor rule, not from the camera-space estimate.
 // Tracked camera (payload.track): the same, with the turn taken per frame from a track of the source camera through a fixed
 // room (its floor at y=0), plus where the camera stands on the floor and its lens (as a multiple of the body model's lens).
 // A longer lens than the model assumed puts the performers that much further away, so their depth is scaled by it.
 const track=payload.scene?.camera??payload.track,shift=new T.Vector3();let zoom=1,even=1;
 const trackAt=(time:number)=>{const c=sceneCameraAt(track!,time,payload.duration);level!.fromArray(c.quat);shift.set(c.x,0,c.z);zoom=c.zoom;even=payload.scene?.distanceScale?sampleSeries(payload.scene.distanceScale,time,payload.duration):1;};
 const level=track?new T.Quaternion():payload.level?new T.Quaternion().setFromUnitVectors(new T.Vector3().fromArray(payload.level.normal).normalize(),new T.Vector3(0,1,0)):null;
 const hipDown=(time:number,i:number)=>{const n=payload.hips[i].length-1,k=Math.min(n,Math.max(0,time/Math.max(payload.duration,1e-6)*n)),lo=Math.floor(k),hi=Math.min(n,lo+1),u=k-lo;return payload.hips[i][lo][1]*(1-u)+payload.hips[i][hi][1]*u;};
 let cameraHeight=0;
 const place=(time:number)=>{let sum=0;if(track)trackAt(time);players.forEach((p,i)=>{p.player.sample(payload.actions[i],Math.min(time,payload.duration));
   if(payload.scene){const local=p.root.position.clone().multiplyScalar(p.scale),s=standInRoom(payload.scene,i,time,payload.duration,local.toArray());p.holder.quaternion.fromArray(s.quat);p.holder.position.fromArray(s.position);p.holder.updateMatrixWorld(true);sum+=p.root.getObjectByName('pelvis')!.getWorldPosition(new T.Vector3()).y-s.inCameraY;}
   else if(level){const local=p.root.position.clone().multiplyScalar(p.scale),inCamera=new T.Vector3(payload.origins[i][0]+local.x,-hipDown(time,i),(payload.origins[i][1]+local.z)*zoom).multiplyScalar(even).applyQuaternion(level);p.holder.quaternion.copy(level);p.holder.position.set(inCamera.x+shift.x,local.y,inCamera.z+shift.z).sub(local.clone().applyQuaternion(level));p.holder.updateMatrixWorld(true);sum+=p.root.getObjectByName('pelvis')!.getWorldPosition(new T.Vector3()).y-inCamera.y;}
   else{p.holder.position.set(payload.origins[i][0],0,payload.origins[i][1]);p.holder.updateMatrixWorld(true);}});cameraHeight=sum/players.length;return players.map(p=>p.root.getObjectByName('pelvis')!.getWorldPosition(new T.Vector3()));};
 const heightAt=(time:number,hips:T.Vector3[])=>{if(level)return cameraHeight;const k=Math.min(payload.hips[0].length-1,Math.max(0,time/Math.max(payload.duration,1e-6)*(payload.hips[0].length-1))),lo=Math.floor(k),hi=Math.min(payload.hips[0].length-1,lo+1),u=k-lo;let sum=0;hips.forEach((h,i)=>{const down=payload.hips[i][lo][1]*(1-u)+payload.hips[i][hi][1]*u;sum+=h.y+down;});return sum/hips.length;};
 const first=place(0),height0=heightAt(0,first);
 // A scene's objects: plain clay shapes standing for the set, a shade darker than the performers so the two read apart.
 let objectGroup:T.Group|null=null;
 if(payload.staged){objectGroup=buildSceneObjects(T,payload.staged.objects,new T.MeshStandardMaterial({color:'#b9bdc1',roughness:.9}));scene.add(objectGroup!);(floor.material as T.MeshStandardMaterial).color.set('#cfd2d4');scene.fog=null;}
 if(payload.scene){const grey=new T.MeshStandardMaterial({color:'#b9bdc1',roughness:.9});objectGroup=buildSceneObjects(T,payload.scene.objects,grey);scene.add(objectGroup!);(floor.material as T.MeshStandardMaterial).color.set('#cfd2d4');scene.fog=null;}
 // A stage: a coarse mesh of the set from the source video, given in the camera's space at one moment (x right, y up, z toward
 // the camera, metres). It is stood in our scene by raising it by the camera's height at that moment, and replaces the plain floor.
 // It is only right for that moment's camera position: the source camera moves and the mesh does not follow it.
 if(payload.stage){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(payload.stage.positions,3));geo.setIndex(payload.stage.indices);geo.computeVertexNormals();const mesh=new T.Mesh(geo,new T.MeshStandardMaterial({color:'#e6e5e1',roughness:.95,side:T.DoubleSide}));mesh.receiveShadow=true;mesh.frustumCulled=false;const lift=heightAt(payload.stage.time,place(payload.stage.time));
  if(payload.stage.room){(mesh.material as T.MeshStandardMaterial).color.set('#c3c6c9');(floor.material as T.MeshStandardMaterial).color.set('#c3c6c9');mesh.castShadow=true;scene.add(mesh);scene.fog=null;} // already in the room's axes, floor at y=0
  else if(level){ // into the room: turned level, raised by the camera's height (the floor plane's own figure when given), and the
   // part of it that is floor (within 10 cm of the plane) replaced by the flat floor, which takes the shadows
   const h=payload.level!.height??lift,at=geo.getAttribute('position') as T.BufferAttribute,v=new T.Vector3(),low:boolean[]=[];for(let k=0;k<at.count;k++){v.fromBufferAttribute(at,k).applyQuaternion(level);v.y+=h;low.push(Math.abs(v.y)<.1);at.setXYZ(k,v.x,low[k]?0:v.y,v.z);}
   const keep:number[]=[],idx=payload.stage.indices;for(let k=0;k<idx.length;k+=3)if(!(low[idx[k]]&&low[idx[k+1]]&&low[idx[k+2]]))keep.push(idx[k],idx[k+1],idx[k+2]);geo.setIndex(keep);geo.computeVertexNormals();scene.add(mesh);scene.fog=null;}
  else{mesh.position.y=lift;scene.add(mesh);floor.visible=false;scene.fog=null;}}
 // the still camera for a scene: off to one side of the ground the performers cover, far enough back to hold all of it
 let still:{eye:T.Vector3,look:T.Vector3}|null=null;if((track||payload.staged)&&payload.camera==='fixed'){const box=new T.Box3();for(let k=0;k<=40;k++)for(const h of place(payload.duration*k/40))box.expandByPoint(h);const mid=box.getCenter(new T.Vector3()),reach=box.getSize(new T.Vector3()).setY(0).length()/2;still={eye:new T.Vector3(mid.x+(reach+5)*.55,1.7,mid.z+(reach+5)*.83),look:new T.Vector3(mid.x,.95,mid.z)};}
 // where the feet are in the room at a time: heel and ball of each foot, per performer (for measuring sliding)
 (window as any).feet=(time:number)=>{place(time);return players.map(p=>['foot_l','ball_l','foot_r','ball_r'].map(n=>p.root.getObjectByName(n)!.getWorldPosition(new T.Vector3()).toArray()));};
 (window as any).renderFrame=(time:number)=>{const hips=place(time),centre=hips.reduce((s,h)=>s.add(h),new T.Vector3()).divideScalar(hips.length);
  if(payload.camera==='orbit'){const angle=-Math.PI/4+Math.PI/2*time/Math.max(payload.duration,1e-6),far=5.2;camera.position.set(centre.x+Math.sin(angle)*far,1.55,centre.z+Math.cos(angle)*far);camera.lookAt(centre.x,1,centre.z);}
  else if(payload.staged&&!still){const shots=payload.staged.cameras,n=Math.max(0,shots.findLastIndex(c=>c.start<=time+1e-6)),shot=shots[n],until=shots[n+1]?.start??payload.duration,x=Math.min(1,Math.max(0,(time-shot.start)/Math.max(until-shot.start,1e-6))),u=x*x*(3-2*x),at=new T.Vector3().fromArray(shot.position),lens=shot.lens35+((shot.to?.lens35??shot.lens35)-shot.lens35)*u;if(shot.to?.position)at.lerp(new T.Vector3().fromArray(shot.to.position),u);
   const part=(i:number,aim?:string)=>players[i].root.getObjectByName(aim==='head'?'Head':'spine_02')!.getWorldPosition(new T.Vector3()),look=Array.isArray(shot.lookAt)?new T.Vector3().fromArray(shot.lookAt):'between' in shot.lookAt?part(0).add(part(1)).multiplyScalar(.5):part(shot.lookAt.performer,shot.lookAt.aim);
   camera.position.copy(at);camera.fov=2*Math.atan(Math.tan(Math.atan(18/lens))/camera.aspect)*180/Math.PI;camera.updateProjectionMatrix();camera.lookAt(look);}
  else if(still){camera.position.copy(still.eye);camera.fov=38;camera.updateProjectionMatrix();camera.lookAt(still.look);}
  else{camera.position.set(shift.x,Math.max(.15,payload.camera==='fixed'?height0:heightAt(time,hips)),shift.z);if(level)camera.quaternion.copy(level);else camera.quaternion.identity();if(track){camera.fov=2*Math.atan(height/(2*Math.hypot(width,height)*zoom))*180/Math.PI;camera.updateProjectionMatrix();}}
  camera.updateMatrixWorld(true);sun.target.position.set(centre.x,0,centre.z);sun.position.set(centre.x+3.5,7,centre.z+4.5);sun.target.updateMatrixWorld();
  renderer.render(scene,camera);renderer.getContext().finish();return renderer.domElement.toDataURL('image/png');};
 // Depth pass: every surface drawn by how far it is from the camera, as inverse distance (white at `near`, black at `far` and
 // beyond, linear in 1/distance between), the form depth-guided video models are fed.
 const depthMaterial=new T.ShaderMaterial({uniforms:{near:{value:1.5},far:{value:40}},vertexShader:'#include <common>\n#include <skinning_pars_vertex>\nvarying float vZ;\nvoid main(){\n#include <skinbase_vertex>\n#include <begin_vertex>\n#include <skinning_vertex>\n#include <project_vertex>\nvZ=-mvPosition.z;}',fragmentShader:'uniform float near;uniform float far;varying float vZ;\nvoid main(){float d=clamp((1.0/vZ-1.0/far)/(1.0/near-1.0/far),0.0,1.0);gl_FragColor=vec4(vec3(d),1.0);}'}),clayBackground=scene.background;
 (window as any).setPass=(pass:string,near=1.5,far=40)=>{depthMaterial.uniforms.near.value=near;depthMaterial.uniforms.far.value=far;scene.overrideMaterial=pass==='depth'?depthMaterial:null;scene.background=pass==='depth'?new T.Color(0,0,0):clayBackground;renderer.toneMapping=pass==='depth'?T.NoToneMapping:T.ACESFilmicToneMapping;};
 // What the picture holds at a time, for a reference description: the camera, and for each performer and scene object its box
 // in the picture (0-1 from the left and from the top, clipped to the frame) and its distance. Boxes are of the whole shape:
 // what stands in front of what is not worked out.
 (window as any).describe=(time:number)=>{(window as any).renderFrame(time);const r=(x:number,d=3)=>Math.round(x*10**d)/10**d,eye=camera.position,forward=camera.getWorldDirection(new T.Vector3()),v=new T.Vector3();
  const boxOf=(points:T.Vector3[])=>{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,front=0;for(const p of points){if(v.copy(p).sub(eye).dot(forward)<.05)continue;front++;v.copy(p).project(camera);x0=Math.min(x0,(v.x+1)/2);x1=Math.max(x1,(v.x+1)/2);y0=Math.min(y0,(1-v.y)/2);y1=Math.max(y1,(1-v.y)/2);}if(!front)return null;const full=[x0,y0,x1,y1],clip=[Math.max(0,x0),Math.max(0,y0),Math.min(1,x1),Math.min(1,y1)];if(clip[2]<=clip[0]||clip[3]<=clip[1])return null;return {box:clip.map(x=>r(x)),whole:front===points.length&&full.every((x,i)=>Math.abs(x-clip[i])<1e-9)};};
  const performers=players.map(p=>{const bones:T.Vector3[]=[];p.root.traverse(o=>{if((o as T.Bone).isBone)bones.push(o.getWorldPosition(new T.Vector3()));});const head=p.root.getObjectByName('Head')!.getWorldPosition(new T.Vector3());bones.push(head.clone().add(new T.Vector3(0,.14,0)));const hip=p.root.getObjectByName('pelvis')!.getWorldPosition(new T.Vector3()),across=p.root.getObjectByName('thigh_r')!.getWorldPosition(new T.Vector3()).sub(p.root.getObjectByName('thigh_l')!.getWorldPosition(new T.Vector3())),facing=new T.Vector3(0,1,0).cross(across).setY(0).normalize(),toCamera=eye.clone().sub(hip).setY(0).normalize();
   return {...(boxOf(bones)??{box:null,whole:false}),hip:hip.toArray().map(x=>r(x)),distance:r(hip.distanceTo(eye),2),turnedFromCamera:r(Math.atan2(facing.x*toCamera.z-facing.z*toCamera.x,facing.dot(toCamera))*180/Math.PI,0)};});
  const objects=(objectGroup?.children??[]).map(o=>{const b=new T.Box3().setFromObject(o),corners=[0,1,2,3,4,5,6,7].map(k=>new T.Vector3(k&1?b.max.x:b.min.x,k&2?b.max.y:b.min.y,k&4?b.max.z:b.min.z)),seen=boxOf(corners);return {name:o.name,inFrame:!!seen,box:seen?.box??null,whole:seen?.whole??false,distance:r(b.getCenter(new T.Vector3()).distanceTo(eye),2)};});
  return {time:r(time),camera:{position:eye.toArray().map(x=>r(x)),fovVertical:r(camera.fov,2),fovHorizontal:r(2*Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect)*180/Math.PI,2),pitchDown:r(-Math.asin(forward.y)*180/Math.PI,1),yawRight:r(Math.atan2(forward.x,-forward.z)*180/Math.PI,1),lensRatio:r(zoom)},performers,objects};};
 (window as any).renderReady=true;
}
init().catch(e=>(window as any).renderError=String(e?.message||e));
