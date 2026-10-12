// A pair's scene: a room the two performers stand in, made of a floor (y=0) and a few plain objects standing for the set of the
// source video, plus the source camera's path through that room. Axes: x right and z toward the camera as the first frame saw
// them, y up, metres. The objects carry no detail on purpose: they are a clay reference, named so a prompt can describe them.
//  objects   box: size [width, height, depth]; cylinder: size [width, height, depth] of its bounding box (an ellipse when width
//            and depth differ), standing upright. arch: half an oval ring standing on the floor, facing along z: size [width,
//            height, depth] outside, rim the width of its band (default an eighth of the width).
//            wedge: a ramp or sloped wall, a box cut corner to corner: full height along its back edge (-z side), down to
//            nothing at its front edge (+z side), running the width along x.
//            position is the centre of the bounding box; rotationY turns it about the vertical, in degrees.
//  camera    per frame over the action's duration: quats turn the camera's axes (x right, y up, z toward the viewer) into the
//            room's, positions are where the camera is, focal is its lens as a multiple of the body model's assumed lens.
//  performers  per side, where the body model put the hips in the camera's space: origin [x, -depth] on the first frame and
//            hipDown, how far below the camera's axis the hips are on every frame.
// The performers' poses and positions were estimated in the camera's axes with the model's lens. In the room each is turned by
// the camera's turn for that frame, moved to where the camera is, and pushed away by the lens ratio (a longer lens than the
// model assumed means the performer is that much further off). Height stays the character's own, from its floor rule.
export type SceneObject={name:string;shape:'box'|'cylinder'|'arch'|'wedge';position:number[];size:number[];rotationY?:number;rim?:number};
export type SceneCamera={quats:number[][];positions:number[][];focal:number[]};
// A staged scene (stage_scene) has no source camera: its two actions are already in the room's coordinates, so nothing is
// re-placed. `staged` then holds each performer's height (the figure is scaled to it) and the cameras as shots: from `start`
// seconds a camera at `position` looking at `lookAt` with a 35 mm-equivalent lens. A new shot is a cut.
// lookAt is a point, or {performer, aim} to keep a performer's head or body in the middle, or {between:true} for the point
// between the two. `to` moves the camera and/or changes the lens over the shot, eased, until the next shot starts.
export type StagedShot={start:number;position:number[];lookAt:number[]|{performer:number;aim?:'head'|'body'}|{between:true};lens35:number;to?:{position?:number[];lens35?:number}};
export type PairScene={objects:SceneObject[];camera:SceneCamera;performers:{origin:number[];hipDown:number[];lock?:number[][]}[];distanceScale?:number[];staged?:{heights:number[];cameras:StagedShot[]}};
// Distance from one camera is the noisiest thing the body model gives, and it shows as feet sliding toward and away from the
// camera. distanceScale evens it out: per frame, the factor that takes the pair's mean distance from the camera (model depth
// times lens ratio) to its average over about a second. One factor for both performers, so what lies between them is kept.
export function distanceScale(depths:number[][][],camera:SceneCamera,half=15){
 const n=depths[0].length,m=camera.focal.length-1,raw=Array.from({length:n},(_,k)=>{const f=camera.focal[Math.round(k/Math.max(n-1,1)*m)];return depths.reduce((s,h)=>s+Math.hypot(h[k][0],h[k][2]*f),0)/depths.length;});
 return raw.map((v,k)=>{let sum=0,weight=0;for(let j=-half;j<=half;j++){const w=half+1-Math.abs(j);sum+=w*raw[Math.min(n-1,Math.max(0,k+j))];weight+=w;}return Math.round(sum/weight/v*1e4)/1e4;});
}
const finite=(v:any,n:number)=>Array.isArray(v)&&v.length===n&&v.every(x=>typeof x==='number'&&Number.isFinite(x));
export function validateObjects(objects:any):string|null{
 if(!Array.isArray(objects)||objects.length>64)return 'A scene needs up to 64 objects';
  const names=new Set<string>();for(const o of objects){if(typeof o?.name!=='string'||!/^[a-z0-9][a-z0-9 -]{0,39}$/.test(o.name)||names.has(o.name))return 'Each object needs its own short lower-case name';names.add(o.name);if(!['box','cylinder','arch','wedge'].includes(o.shape))return `${o.name}: shape is box, cylinder, arch or wedge`;if(o.rim!==undefined&&!(o.shape==='arch'&&typeof o.rim==='number'&&o.rim>0&&o.rim<Math.min(o.size?.[0]/2,o.size?.[1])))return `${o.name}: rim is the band width of an arch, less than its half width and its height`;if(!finite(o.position,3)||o.position.some((x:number)=>Math.abs(x)>200))return `${o.name}: position is [x, y, z] in metres`;if(!finite(o.size,3)||o.size.some((x:number)=>x<=0||x>200))return `${o.name}: size is [width, height, depth] in metres`;if(o.rotationY!==undefined&&!(typeof o.rotationY==='number'&&Math.abs(o.rotationY)<=360))return `${o.name}: rotationY is in degrees`;}
 return null;
}
export function validateScene(scene:any):string|null{
 if(!scene)return 'A scene needs up to 64 objects';const problem=validateObjects(scene.objects);if(problem)return problem;
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
  else if(o.shape==='wedge'){const [w,h,d]=o.size,shape=new T.Shape();shape.moveTo(-d/2,0);shape.lineTo(d/2,0);shape.lineTo(d/2,h);shape.closePath();geometry=new T.ExtrudeGeometry(shape,{depth:w,bevelEnabled:false});geometry.translate(0,-h/2,-w/2);geometry.rotateY(Math.PI/2);}
  else geometry=o.shape==='box'?new T.BoxGeometry(1,1,1):new T.CylinderGeometry(.5,.5,1,40);
  const mesh=new T.Mesh(geometry,material);mesh.name=o.name;if(o.shape!=='arch'&&o.shape!=='wedge')mesh.scale.set(o.size[0],o.size[1],o.size[2]);mesh.position.set(o.position[0],o.position[1],o.position[2]);mesh.rotation.y=(o.rotationY??0)*Math.PI/180;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
 return group;
}

export const turn=(q:number[],v:number[])=>{const [x,y,z,w]=q,cx=y*v[2]-z*v[1],cy=z*v[0]-x*v[2],cz=x*v[1]-y*v[0];return [v[0]+2*(w*cx+y*cz-z*cy),v[1]+2*(w*cy+z*cx-x*cz),v[2]+2*(w*cz+x*cy-y*cx)];};
// Where a performer's holder goes in the room at a time. local is the character's root position in its own action (metres).
// Returns the holder's turn and position, and inCameraY (the hips' height in the turned camera frame, for the camera's height).
// A point of the character at p in its action then lies at turn(quat, p) + position.
export function standInRoom(scene:PairScene,index:number,time:number,duration:number,local:number[]){
 const c=sceneCameraAt(scene.camera,time,duration),side=scene.performers[index],even=scene.distanceScale?sampleSeries(scene.distanceScale,time,duration):1,inCamera=turn(c.quat,[(side.origin[0]+local[0])*even,-sampleSeries(side.hipDown,time,duration)*even,(side.origin[1]+local[2])*c.zoom*even]),back=turn(c.quat,local);
 let lx=0,lz=0;if(side.lock){const {lo,hi,u}=at(side.lock.length-1,time,duration);lx=side.lock[lo][0]*(1-u)+side.lock[hi][0]*u;lz=side.lock[lo][1]*(1-u)+side.lock[hi][1]*u;}
 return {quat:c.quat,position:[inCamera[0]+c.x+lx-back[0],local[1]-back[1],inCamera[2]+c.z+lz-back[2]],inCameraY:inCamera[1],camera:c};
}
// Foot sliding: how far the stillest floor-level point of a performer moves over the floor, summed over the clip.
// points[frame] = [heel left, ball left, heel right, ball right], each [x, y, z] in the room. A point is at floor level
// within 3 cm of its own lowest level. A dancer's foot also brushes and swivels on purpose: a figure for comparing, not an error.
const levels=(points:number[][][])=>[0,1,2,3].map(k=>{const ys=points.map(f=>f[k][1]).sort((a,b)=>a-b);return ys[Math.floor(ys.length*.05)];});
export function footSlide(points:number[][][]){const lv=levels(points);let total=0;for(let f=1;f<points.length;f++){let best=Infinity;for(let k=0;k<4;k++)if(points[f][k][1]<lv[k]+.03&&points[f-1][k][1]<lv[k]+.03)best=Math.min(best,Math.hypot(points[f][k][0]-points[f-1][k][0],points[f][k][2]-points[f-1][k][2]));if(best<Infinity)total+=best;}return Math.round(total*100)/100;}
// Foot locking. Walk through the clip keeping one support point: the heel or ball of a foot that is at floor level (for at
// least minFrames). While it stays down, the performer is shifted over the floor so that point does not move; when support
// passes to another point, that one is held where it then is, so nothing jumps. Holding every plant this way lets the
// performer wander from where the picture put them, so the slow part of the shift (over about `drift` seconds) is taken out
// again: what remains keeps feet still through a step and gives way over several steps.
// Returns the shift [dx, dz] per frame, and what it does to the slide.
// The shift that holds every plant, before its slow part is taken out: where the planted feet say the performer should be,
// against where the picture put them.
export function plantShift(points:number[][][],minFrames=4){
 const n=points.length,lv=levels(points),low=(f:number,k:number)=>points[f][k][1]-lv[k],down=[0,1,2,3].map(k=>points.map((_,f)=>low(f,k)<.03));
 for(const d of down){let start=-1;for(let f=0;f<=n;f++){if(f<n&&d[f]){if(start<0)start=f;}else if(start>=0){if(f-start<minFrames)for(let j=start;j<f;j++)d[j]=false;start=-1;}}}
 const shift:number[][]=[];let support=-1,anchor=[0,0],dx=0,dz=0,plants=0;
 for(let f=0;f<n;f++){
  if(support>=0&&!down[support][f])support=-1;
  if(support<0){let best=-1;for(let k=0;k<4;k++)if(down[k][f]&&(best<0||low(f,k)<low(f,best)))best=k;if(best>=0){support=best;anchor=[points[f][best][0]+dx,points[f][best][2]+dz];plants++;}}
  if(support>=0){dx=anchor[0]-points[f][support][0];dz=anchor[1]-points[f][support][2];}
  shift.push([dx,dz]);
 }
 return {shift,plants};
}
export function footLock(points:number[][][],fps:number,drift=1.5,minFrames=4){
 const n=points.length,{shift,plants}=plantShift(points,minFrames);
 const half=Math.max(1,Math.round(drift*fps/2)),out=shift.map((v,f)=>{let sx=0,sz=0,w=0;for(let j=-half;j<=half;j++){const g=shift[Math.min(n-1,Math.max(0,f+j))],k=half+1-Math.abs(j);sx+=k*g[0];sz+=k*g[1];w+=k;}return [Math.round((v[0]-sx/w)*1e4)/1e4,Math.round((v[1]-sz/w)*1e4)/1e4];});
 const moved=points.map((fr,f)=>fr.map(p=>[p[0]+out[f][0],p[1],p[2]+out[f][1]]));
 return {shift:out,raw:shift,plants,slideBeforeMeters:footSlide(points),slideAfterMeters:footSlide(moved),largestShiftMeters:Math.round(Math.max(...out.map(v=>Math.hypot(v[0],v[1])))*1000)/1000};
}
// Slower sliding, taken out for both performers together. The lock above lets go of anything slower than its `drift` seconds, so
// that neither performer wanders from where the picture put them. With a camera that travels, its place between key views is
// a guess, and that guess being off moves both performers over the floor together, slowly. The part of each performer's
// plant shift between `drift` and `long` seconds, averaged over the two, is that: adding it to both holds their feet
// stiller and cannot move them apart, since both get the same. raw: footLock().raw of each. Returns [dx, dz] per frame.
export function togetherShift(a:number[][],b:number[][],fps:number,drift:number,long:number){
 const n=Math.min(a.length,b.length),slow=(s:number[][],seconds:number)=>{const half=Math.max(1,Math.round(seconds*fps/2));return s.slice(0,n).map((_,f)=>{let x=0,z=0,w=0;for(let j=-half;j<=half;j++){const g=s[Math.min(n-1,Math.max(0,f+j))],k=half+1-Math.abs(j);x+=k*g[0];z+=k*g[1];w+=k;}return [x/w,z/w];});};
 const sa=slow(a,drift),la=slow(a,long),sb=slow(b,drift),lb=slow(b,long);return sa.map((v,f)=>[Math.round((v[0]-la[f][0]+sb[f][0]-lb[f][0])/2*1e4)/1e4,Math.round((v[1]-la[f][1]+sb[f][1]-lb[f][1])/2*1e4)/1e4]);
}
// Two performers who are holding on to each other must not be shifted apart. link[frame] is 1 while they are joined (hands
// within reach of each other), 0 while they are apart. Where joined, both get the mean of their two shifts; in between it blends.
export function sharedLock(a:number[][],b:number[][],link:number[]){
 const n=a.length,soft=link.map((_,f)=>{let s=0,w=0;for(let j=-6;j<=6;j++){const k=7-Math.abs(j);s+=k*link[Math.min(n-1,Math.max(0,f+j))];w+=k;}return s/w;}),r=(x:number)=>Math.round(x*1e4)/1e4;
 return [a.map((v,f)=>v.map((x,i)=>r((x+b[f][i])/2+(1-soft[f])*(x-b[f][i])/2))),b.map((v,f)=>v.map((x,i)=>r((x+a[f][i])/2+(1-soft[f])*(x-a[f][i])/2)))];
}
