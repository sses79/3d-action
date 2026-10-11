// A pair's scene: a room the two performers stand in, made of a floor (y=0) and a few plain objects standing for the set of the
// source video, plus the source camera's path through that room. Axes: x right and z toward the camera as the first frame saw
// them, y up, metres. The objects carry no detail on purpose: they are a clay reference, named so a prompt can describe them.
//  objects   box: size [width, height, depth]; cylinder: size [width, height, depth] of its bounding box (an ellipse when width
//            and depth differ), standing upright. arch: half an oval ring standing on the floor, facing along z: size [width,
//            height, depth] outside, rim the width of its band (default an eighth of the width).
//            position is the centre of the bounding box; rotationY turns it about the vertical, in degrees.
//  camera    per frame over the action's duration: quats turn the camera's axes (x right, y up, z toward the viewer) into the
//            room's, positions are where the camera is, focal is its lens as a multiple of the body model's assumed lens.
//  performers  per side, where the body model put the hips in the camera's space: origin [x, -depth] on the first frame and
//            hipDown, how far below the camera's axis the hips are on every frame.
// The performers' poses and positions were estimated in the camera's axes with the model's lens. In the room each is turned by
// the camera's turn for that frame, moved to where the camera is, and pushed away by the lens ratio (a longer lens than the
// model assumed means the performer is that much further off). Height stays the character's own, from its floor rule.
export type SceneObject={name:string;shape:'box'|'cylinder'|'arch';position:number[];size:number[];rotationY?:number;rim?:number};
export type SceneCamera={quats:number[][];positions:number[][];focal:number[]};
export type PairScene={objects:SceneObject[];camera:SceneCamera;performers:{origin:number[];hipDown:number[]}[];distanceScale?:number[]};
// Distance from one camera is the noisiest thing the body model gives, and it shows as feet sliding toward and away from the
// camera. distanceScale evens it out: per frame, the factor that takes the pair's mean distance from the camera (model depth
// times lens ratio) to its average over about a second. One factor for both performers, so what lies between them is kept.
export function distanceScale(depths:number[][][],camera:SceneCamera,half=15){
 const n=depths[0].length,m=camera.focal.length-1,raw=Array.from({length:n},(_,k)=>{const f=camera.focal[Math.round(k/Math.max(n-1,1)*m)];return depths.reduce((s,h)=>s+Math.hypot(h[k][0],h[k][2]*f),0)/depths.length;});
 return raw.map((v,k)=>{let sum=0,weight=0;for(let j=-half;j<=half;j++){const w=half+1-Math.abs(j);sum+=w*raw[Math.min(n-1,Math.max(0,k+j))];weight+=w;}return Math.round(sum/weight/v*1e4)/1e4;});
}
const finite=(v:any,n:number)=>Array.isArray(v)&&v.length===n&&v.every(x=>typeof x==='number'&&Number.isFinite(x));
export function validateScene(scene:any):string|null{
 if(!scene||!Array.isArray(scene.objects)||scene.objects.length>64)return 'A scene needs up to 64 objects';
 const names=new Set<string>();for(const o of scene.objects){if(typeof o?.name!=='string'||!/^[a-z0-9][a-z0-9 -]{0,39}$/.test(o.name)||names.has(o.name))return 'Each object needs its own short lower-case name';names.add(o.name);if(!['box','cylinder','arch'].includes(o.shape))return `${o.name}: shape is box, cylinder or arch`;if(o.rim!==undefined&&!(o.shape==='arch'&&typeof o.rim==='number'&&o.rim>0&&o.rim<Math.min(o.size?.[0]/2,o.size?.[1])))return `${o.name}: rim is the band width of an arch, less than its half width and its height`;if(!finite(o.position,3)||o.position.some((x:number)=>Math.abs(x)>200))return `${o.name}: position is [x, y, z] in metres`;if(!finite(o.size,3)||o.size.some((x:number)=>x<=0||x>200))return `${o.name}: size is [width, height, depth] in metres`;if(o.rotationY!==undefined&&!(typeof o.rotationY==='number'&&Math.abs(o.rotationY)<=360))return `${o.name}: rotationY is in degrees`;}
 const c=scene.camera;if(!c||!Array.isArray(c.quats)||c.quats.length<2||c.quats.length>2000||!Array.isArray(c.positions)||!Array.isArray(c.focal)||c.positions.length!==c.quats.length||c.focal.length!==c.quats.length)return 'A scene needs a camera track: quats, positions and focal of one length';
 if(!c.quats.every((q:any)=>finite(q,4)&&Math.abs(Math.hypot(...q)-1)<1e-3)||!c.positions.every((p:any)=>finite(p,3))||!c.focal.every((f:any)=>typeof f==='number'&&f>.2&&f<8))return 'Camera track values are out of range';
 return null;
}
const at=(n:number,time:number,duration:number)=>{const k=Math.min(n,Math.max(0,time/Math.max(duration,1e-6)*n)),lo=Math.floor(k),hi=Math.min(n,lo+1);return {lo,hi,u:k-lo};};
export function sampleSeries(list:number[],time:number,duration:number){const {lo,hi,u}=at(list.length-1,time,duration);return list[lo]*(1-u)+list[hi]*u;}
// The camera at a time: its turn (quaternion x, y, z, w), where it stands on the floor, and its lens ratio.
export function sceneCameraAt(camera:SceneCamera,time:number,duration:number){
 const {lo,hi,u}=at(camera.quats.length-1,time,duration),a=camera.quats[lo],b=camera.quats[hi],sign=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]<0?-1:1,q=a.map((v,i)=>v*(1-u)+sign*b[i]*u),len=Math.hypot(...q)||1,p=camera.positions[lo],r=camera.positions[hi];
 return {quat:q.map(v=>v/len),x:p[0]*(1-u)+r[0]*u,y:p[1]*(1-u)+r[1]*u,z:p[2]*(1-u)+r[2]*u,zoom:camera.focal[lo]*(1-u)+camera.focal[hi]*u};
}
// The objects as meshes, with whichever build of three the caller uses.
export function buildSceneObjects(T:any,objects:SceneObject[],material:any){
 const group=new T.Group();for(const o of objects){let geometry:any;
  if(o.shape==='arch'){const a=o.size[0]/2,b=o.size[1],rim=o.rim??o.size[0]/8,shape=new T.Shape();shape.moveTo(-a,0);shape.absellipse(0,0,a,b,Math.PI,0,true);shape.lineTo(a-rim,0);shape.absellipse(0,0,a-rim,b-rim,0,Math.PI,false);shape.closePath();geometry=new T.ExtrudeGeometry(shape,{depth:o.size[2],bevelEnabled:false,curveSegments:32});geometry.translate(0,-b/2,-o.size[2]/2);}
  else geometry=o.shape==='box'?new T.BoxGeometry(1,1,1):new T.CylinderGeometry(.5,.5,1,40);
  const mesh=new T.Mesh(geometry,material);mesh.name=o.name;if(o.shape!=='arch')mesh.scale.set(o.size[0],o.size[1],o.size[2]);mesh.position.set(o.position[0],o.position[1],o.position[2]);mesh.rotation.y=(o.rotationY??0)*Math.PI/180;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
 return group;
}
