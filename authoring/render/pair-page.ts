import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CharacterPlayer} from '../../runtime/player';
// White-model render of a pair of actions, one picture per call. Cameras:
//  source  the camera of the source video. The body model places each performer relative to that camera, and the actions keep
//          those positions, so a camera at that origin with the model's lens (focal length = the picture's diagonal in pixels)
//          sees the pair framed as the video framed the performers. Its height over our floor comes, per frame, from how far
//          below the camera's axis the model put each performer's hips against how high our character's hips are.
//  fixed   the source camera held where it was on the first frame.
//  orbit   a slow quarter circle round the pair at eye height, always looking at the point between them.
type Payload={level?:{normal:number[],height?:number},stage?:{positions:number[],indices:number[],time:number},actions:any[],origins:number[][],hips:number[][][],duration:number,width:number,height:number,camera:'source'|'fixed'|'orbit'};
async function init(){
 const payload:Payload=await fetch('/payload.json').then(r=>r.json()),{width,height}=payload,scene=new T.Scene();scene.background=new T.Color('#eceeef');scene.fog=new T.Fog('#eceeef',14,40);
 const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(width,height);renderer.setPixelRatio(1);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;document.body.appendChild(renderer.domElement);
 scene.add(new T.HemisphereLight(0xffffff,0xb9bec4,2.1));const sun=new T.DirectionalLight(0xffffff,2.4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.radius=6;sun.shadow.bias=-.0004;const sc=sun.shadow.camera as T.OrthographicCamera;sc.left=-4;sc.right=4;sc.top=4;sc.bottom=-4;sc.near=.5;sc.far=30;scene.add(sun,sun.target);
 const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#f1f2f2',roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
 const gltf=await new GLTFLoader().loadAsync('/character.glb'),clay=new T.MeshStandardMaterial({color:'#f4f3f0',roughness:.82,metalness:0});
 // one load of the asset per character: a skinned mesh does not survive a plain clone
 const second=payload.actions.length>1?await new GLTFLoader().loadAsync('/character.glb'):null,cast=payload.actions.map((_,i)=>({root:i?second!.scene:gltf.scene}));
 const players=cast.map(({root},i)=>{const holder=new T.Group();holder.add(root);scene.add(holder);const scale=1.85/new T.Box3().setFromObject(root).getSize(new T.Vector3()).y;holder.scale.setScalar(scale);root.traverse(o=>{const m=o as T.Mesh;if(m.isMesh){m.material=clay;m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;}});const anims=i?second!.animations:gltf.animations;return {holder,root,scale,player:new CharacterPlayer(root,anims,scale)};});
 const camera=new T.PerspectiveCamera(2*Math.atan(height/(2*Math.hypot(width,height)))*180/Math.PI,width/height,.1,200);
 // Level room. The source camera is rarely level: here the floor's normal in the camera's space (from a point map of the
 // source frame, given in payload.level) says how the camera is tipped. `level` is the turn that stands that normal upright.
 // With it the world is the room: the floor is flat, the performers are turned upright by the same turn (their poses were
 // estimated in the camera's axes, so a camera pitched down made them lean), their positions on the floor are their
 // camera-space positions turned the same way, and the source camera is pitched as the real one was. Heights still come from
 // each character's own floor rule, not from the camera-space estimate.
 const level=payload.level?new T.Quaternion().setFromUnitVectors(new T.Vector3().fromArray(payload.level.normal).normalize(),new T.Vector3(0,1,0)):null;
 const hipDown=(time:number,i:number)=>{const n=payload.hips[i].length-1,k=Math.min(n,Math.max(0,time/Math.max(payload.duration,1e-6)*n)),lo=Math.floor(k),hi=Math.min(n,lo+1),u=k-lo;return payload.hips[i][lo][1]*(1-u)+payload.hips[i][hi][1]*u;};
 let cameraHeight=0;
 const place=(time:number)=>{let sum=0;players.forEach((p,i)=>{p.player.sample(payload.actions[i],Math.min(time,payload.duration));
   if(level){const local=p.root.position.clone().multiplyScalar(p.scale),inCamera=new T.Vector3(payload.origins[i][0]+local.x,-hipDown(time,i),payload.origins[i][1]+local.z).applyQuaternion(level);p.holder.quaternion.copy(level);p.holder.position.set(inCamera.x,local.y,inCamera.z).sub(local.clone().applyQuaternion(level));p.holder.updateMatrixWorld(true);sum+=p.root.getObjectByName('pelvis')!.getWorldPosition(new T.Vector3()).y-inCamera.y;}
   else{p.holder.position.set(payload.origins[i][0],0,payload.origins[i][1]);p.holder.updateMatrixWorld(true);}});cameraHeight=sum/players.length;return players.map(p=>p.root.getObjectByName('pelvis')!.getWorldPosition(new T.Vector3()));};
 const heightAt=(time:number,hips:T.Vector3[])=>{if(level)return cameraHeight;const k=Math.min(payload.hips[0].length-1,Math.max(0,time/Math.max(payload.duration,1e-6)*(payload.hips[0].length-1))),lo=Math.floor(k),hi=Math.min(payload.hips[0].length-1,lo+1),u=k-lo;let sum=0;hips.forEach((h,i)=>{const down=payload.hips[i][lo][1]*(1-u)+payload.hips[i][hi][1]*u;sum+=h.y+down;});return sum/hips.length;};
 const first=place(0),height0=heightAt(0,first);
 // A stage: a coarse mesh of the set from the source video, given in the camera's space at one moment (x right, y up, z toward
 // the camera, metres). It is stood in our scene by raising it by the camera's height at that moment, and replaces the plain floor.
 // It is only right for that moment's camera position: the source camera moves and the mesh does not follow it.
 if(payload.stage){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(payload.stage.positions,3));geo.setIndex(payload.stage.indices);geo.computeVertexNormals();const mesh=new T.Mesh(geo,new T.MeshStandardMaterial({color:'#e6e5e1',roughness:.95,side:T.DoubleSide}));mesh.receiveShadow=true;mesh.frustumCulled=false;const lift=heightAt(payload.stage.time,place(payload.stage.time));
  if(level){ // into the room: turned level, raised by the camera's height (the floor plane's own figure when given), and the
   // part of it that is floor (within 10 cm of the plane) replaced by the flat floor, which takes the shadows
   const h=payload.level!.height??lift,at=geo.getAttribute('position') as T.BufferAttribute,v=new T.Vector3(),low:boolean[]=[];for(let k=0;k<at.count;k++){v.fromBufferAttribute(at,k).applyQuaternion(level);v.y+=h;low.push(Math.abs(v.y)<.1);at.setXYZ(k,v.x,low[k]?0:v.y,v.z);}
   const keep:number[]=[],idx=payload.stage.indices;for(let k=0;k<idx.length;k+=3)if(!(low[idx[k]]&&low[idx[k+1]]&&low[idx[k+2]]))keep.push(idx[k],idx[k+1],idx[k+2]);geo.setIndex(keep);geo.computeVertexNormals();scene.add(mesh);scene.fog=null;}
  else{mesh.position.y=lift;scene.add(mesh);floor.visible=false;scene.fog=null;}}
 (window as any).renderFrame=(time:number)=>{const hips=place(time),centre=hips.reduce((s,h)=>s.add(h),new T.Vector3()).divideScalar(hips.length);
  if(payload.camera==='orbit'){const angle=-Math.PI/4+Math.PI/2*time/Math.max(payload.duration,1e-6),far=5.2;camera.position.set(centre.x+Math.sin(angle)*far,1.55,centre.z+Math.cos(angle)*far);camera.lookAt(centre.x,1,centre.z);}
  else{camera.position.set(0,Math.max(.15,payload.camera==='fixed'?height0:heightAt(time,hips)),0);if(level)camera.quaternion.copy(level);else camera.quaternion.identity();}
  camera.updateMatrixWorld(true);sun.target.position.set(centre.x,0,centre.z);sun.position.set(centre.x+3.5,7,centre.z+4.5);sun.target.updateMatrixWorld();
  renderer.render(scene,camera);renderer.getContext().finish();return renderer.domElement.toDataURL('image/png');};
 (window as any).renderReady=true;
}
init().catch(e=>(window as any).renderError=String(e?.message||e));
