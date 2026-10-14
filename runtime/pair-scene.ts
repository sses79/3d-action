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
// absolute: the track's own height is the camera's (a camera solved from a known court), not read back from the performers.
export type SceneCamera={quats:number[][];positions:number[][];focal:number[];absolute?:boolean};
// A staged scene (stage_scene) has no source camera: its two actions are already in the room's coordinates, so nothing is
// re-placed. `staged` then holds each performer's height (the figure is scaled to it) and the cameras as shots: from `start`
// seconds a camera at `position` looking at `lookAt` with a 35 mm-equivalent lens. A new shot is a cut.
// lookAt is a point, or {performer, aim} to keep a performer's head or body in the middle, or {between:true} for the point
// between the two. `to` moves the camera and/or changes the lens over the shot, eased, until the next shot starts.
export type StagedShot={start:number;position:number[];lookAt:number[]|{performer:number;aim?:'head'|'body'}|{between:true};lens35:number;to?:{position?:number[];lens35?:number}};
export type PairScene={objects:SceneObject[];camera:SceneCamera;performers:{origin:number[];hipDown:number[];lock?:number[][];/* place: where the performer's root is in the room per frame, [x, lift, z]: x and z over the floor, lift above the action's own height (a jump). Given when the floor is known (a court): then the body model's own distance is not used. */place?:number[][]}[];distanceScale?:number[];props?:any[];/* extras: more people of the clip (other players), each an action with its own place per frame [x, lift, z], a colour name and, if they are not in the picture throughout, visible [from, to] seconds */extras?:{actionId:string;revision:number;name:string;color:string;place:number[][];visible?:number[]}[];staged?:{heights:number[];cameras:StagedShot[]}};
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
// Props of a pair from a video: small plain shapes with a track of where they are from each start on: in a performer's hand
// ({holder 0|1, or 2 on for the scene's extras in order, hand l|r}), at a point ({at}) or on a measured course ({path: [seconds, x, y, z] rows}); blend seconds glides in.
export function validateProps(props:any):string|null{
 if(!Array.isArray(props)||props.length>6)return 'props: up to 6';const ids=new Set<string>();
 for(const p of props){if(typeof p?.id!=='string'||!/^[a-z][a-z0-9-]{0,23}$/.test(p.id)||ids.has(p.id))return 'Each prop needs its own short lower-case id';ids.add(p.id);if(typeof p.name!=='string'||!p.name.trim()||p.name.length>60||!['box','sphere','cylinder'].includes(p.shape)||!finite(p.size,3)||p.size.some((x:number)=>x<.02||x>1.5)||typeof p.color!=='string'||(p.represents!==undefined&&(typeof p.represents!=='string'||p.represents.length>200)))return `${p.id}: {id, name, shape box|sphere|cylinder, size [width, height, depth] 0.02–1.5 m, color, represents, track}`;
  if(!Array.isArray(p.track)||!p.track.length||p.track.length>60||p.track[0].start!==0)return `${p.id}: track starts at 0 and has up to 60 parts`;let last=-1;
  for(const s of p.track){if(typeof s?.start!=='number'||!(s.start>last)||(s.blend!==undefined&&!(typeof s.blend==='number'&&s.blend>=0&&s.blend<=2)))return `${p.id}: each part of the track starts later than the one before`;last=s.start;const kinds=+(Number.isInteger(s.holder)&&s.holder>=0&&s.holder<14)+ +(s.at!==undefined)+ +(s.path!==undefined);if(kinds!==1)return `${p.id}: a part is {holder, hand}, {at} or {path}`;if(s.path!==undefined&&(!Array.isArray(s.path)||s.path.length<2||s.path.length>900||s.path.some((q:any,i:number)=>!finite(q,4)||Math.abs(q[1])>200||Math.abs(q[2])>200||Math.abs(q[3])>200||(i>0&&!(q[0]>s.path[i-1][0])))))return `${p.id}: path is [seconds, x, y, z] rows in time order`;if(s.at!==undefined&&!finite(s.at,3))return `${p.id}: at is [x, y, z]`;if(s.path===undefined&&s.at===undefined&&!['l','r'].includes(s.hand))return `${p.id}: hand is l or r`;}}
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
// Cameras of a scene with a replay (scene.replay, another camera of the same moment over [from, to] of the clip), shared by the
// action workshop and the clay view. 'replay': the replay camera over its stretch, holding its first and last view outside it.
// 'travel': the source camera; during TRAVEL.close (seconds of the clip) an eased move in along its line of sight to TRAVEL.near
// metres from the performer, turning to face them, the lens shortened by the square root of the distance ratio; it stays there,
// facing them, and then flies (place, turn and lens; at most TRAVEL.flight seconds) to land on the replay camera exactly when the
// replay's shot begins. Halfway a blend of the two turns looks past the players, so mid-flight the view is turned toward the
// performer, fully at the middle and not at all at either end. src(t) is the source camera at a time (its height included);
// performer.now is the performer's hips in the room now, performer.at(t) where they are at another time.
export type ViewCamera={x:number;y:number;z:number;quat:number[];zoom:number};
export const TRAVEL={close:[.1,.7],near:12,flight:1.2};
const qmul=(a:number[],b:number[])=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const unit=(v:number[])=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
function qslerp(a:number[],b:number[],u:number){let d=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];const c=d<0?b.map(x=>-x):b;d=Math.abs(d);if(d>.9995)return unit(a.map((x,i)=>x+(c[i]-x)*u));const t=Math.acos(d),s=Math.sin(t),wa=Math.sin((1-u)*t)/s,wb=Math.sin(u*t)/s;return a.map((x,i)=>x*wa+c[i]*wb);}
function qbasis(x:number[],y:number[],z:number[]){const [m00,m01,m02,m10,m11,m12,m20,m21,m22]=[x[0],y[0],z[0],x[1],y[1],z[1],x[2],y[2],z[2]],tr=m00+m11+m22;let q:number[];
 if(tr>0){const s=.5/Math.sqrt(tr+1);q=[(m21-m12)*s,(m02-m20)*s,(m10-m01)*s,.25/s];}else if(m00>m11&&m00>m22){const s=2*Math.sqrt(1+m00-m11-m22);q=[.25*s,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s];}else if(m11>m22){const s=2*Math.sqrt(1+m11-m00-m22);q=[(m01+m10)/s,.25*s,(m12+m21)/s,(m02-m20)/s];}else{const s=2*Math.sqrt(1+m22-m00-m11);q=[(m02+m20)/s,(m12+m21)/s,.25*s,(m10-m01)/s];}return unit(q);}
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function qlook(eye:number[],target:number[]){const z=unit(eye.map((v,i)=>v-target[i])),x=unit(cross([0,1,0],z)),y=cross(z,x);return qbasis(x,y,z);}  // a camera at eye looking at target, level
function qturn(u:number[],v:number[]){const d=u[0]*v[0]+u[1]*v[1]+u[2]*v[2];if(d<-.999999)return [0,1,0,0];return unit([...cross(u,v),1+d]);}
export function replayView(kind:'replay'|'travel',scene:PairScene,time:number,duration:number,src:(t:number)=>ViewCamera,performer:{now:number[];at:(t:number)=>number[]}):ViewCamera{
 const rp0=(scene as any).replay,span=rp0.to-rp0.from,rp=sceneCameraAt(rp0.camera,Math.min(span,Math.max(0,time-rp0.from)),span);
 if(kind==='replay')return rp;
 const ease=(x:number)=>{x=Math.min(1,Math.max(0,x));return x*x*x*(x*(6*x-15)+10);},[c0,c1]=TRAVEL.close;
 // where the camera looks while it travels: the performer's place averaged over 0.8 s, so the view pans steadily instead of
 // following every sway of the body; held still past the clip's ends
 const aim=(t:number)=>{let x=0,y=0,z=0;for(let k=-4;k<=4;k++){const p=performer.at(Math.min(duration,Math.max(0,t+k*.1)));x+=p[0];y+=p[1];z+=p[2];}return [x/9,y/9,z/9];};
 const s1=src(c1),a1=aim(c1),e1=[s1.x,s1.y,s1.z],k1=Math.min(1,TRAVEL.near/Math.max(Math.hypot(...e1.map((v,i)=>v-a1[i])),1e-6)),p1=a1.map((v,i)=>v+(e1[i]-v)*k1),z1=s1.zoom*Math.sqrt(k1);
 // a replay camera far away with a long lens (a zoom from the broadcast mount): Travel stays close and lands on the same view from
 // nearer, on the replay camera's line of sight to the performer with the lens widened to match, instead of flying back out
 const closeRp=(t:number)=>{const r=sceneCameraAt(rp0.camera,Math.min(span,Math.max(0,t-rp0.from)),span),a=aim(t),d=Math.hypot(r.x-a[0],r.y-a[1],r.z-a[2]);if(d<=1.5*TRAVEL.near)return r;const k=Math.max(TRAVEL.near*.6,d*Math.min(1,z1/r.zoom))/d;return {...r,x:a[0]+(r.x-a[0])*k,y:a[1]+(r.y-a[1])*k,z:a[2]+(r.z-a[2])*k,zoom:r.zoom*k};};
 const start=Math.max(c1,rp0.from-TRAVEL.flight),w1=ease((time-c0)/(c1-c0)),w=rp0.from>start?ease((time-start)/(rp0.from-start)):time>=rp0.from?1:0,cur=src(time);
 // the move in: from the source camera along its line of sight to p1, turning from the source camera's turn to a level look at the
 // averaged place
 const near=(t:number)=>{const c=src(t),u=ease((t-c0)/(c1-c0)),e=[c.x,c.y,c.z].map((v,i)=>v+(p1[i]-v)*u);return {e,q:qslerp(c.quat,qlook(e,aim(t)),u),c};};
 const zoomIn=(c:ViewCamera,u:number)=>Math.exp(Math.log(c.zoom)+(Math.log(z1)-Math.log(c.zoom))*u);
 if(w<=0){const n=near(time);return {x:n.e[0],y:n.e[1],z:n.e[2],quat:n.q,zoom:zoomIn(n.c,w1)};}
 if(time>=rp0.from)return closeRp(time);
 // the flight: the camera circles round the performer from where it stood to the replay camera, its bearing, distance and height
 // eased together (a gentle sine ease, so the turn is spread out), always looking at the averaged place (so the view turns one way, as fast as the circle, and keeps the performer
 // in the picture); over the last 40% it eases from that look onto the replay camera's own turn
 const n0=near(start),a0=aim(start),a=aim(time),aEnd=aim(rp0.from),v0=n0.e.map((x,i)=>x-a0[i]),rpE=closeRp(rp0.from),v1=[rpE.x-aEnd[0],rpE.y-aEnd[1],rpE.z-aEnd[2]];
 const b0=Math.atan2(v0[0],v0[2]),b1=Math.atan2(v1[0],v1[2]),db=((b1-b0+3*Math.PI)%(2*Math.PI))-Math.PI,r0=Math.hypot(v0[0],v0[2]),r1=Math.hypot(v1[0],v1[2]);
 const ws=rp0.from>start?.5-.5*Math.cos(Math.PI*Math.min(1,Math.max(0,(time-start)/(rp0.from-start)))):1,b=b0+db*ws,r=Math.exp(Math.log(Math.max(r0,.1))+(Math.log(Math.max(r1,.1))-Math.log(Math.max(r0,.1)))*w),h=v0[1]+(v1[1]-v0[1])*w,eye=[a[0]+Math.sin(b)*r,a[1]+h,a[2]+Math.cos(b)*r];
 const quat=qslerp(qlook(eye,a),closeRp(time).quat,ease((ws-.6)/.4)),zoom=Math.exp(Math.log(zoomIn(n0.c,1))+(Math.log(closeRp(time).zoom)-Math.log(zoomIn(n0.c,1)))*w);
 return {x:eye[0],y:eye[1],z:eye[2],quat,zoom};
}
// Where a performer's hips are in the room at a time from a scene's place series ([x, lift, z]), about a metre over the floor.
export function placedAt(scene:PairScene,index:number,time:number,duration:number):number[]|null{const pl=scene.performers?.[index]?.place;if(!pl)return null;const {lo,hi,u}=at(pl.length-1,time,duration),a=pl[lo],b=pl[hi];return [a[0]+(b[0]-a[0])*u,1+a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u];}
// Where a staged scene's prop is at a time. Its track says where it is from each start on: in a performer's hand or at a point
// in the room; a change with `blend` seconds glides from the one to the other, and one with `fly` seconds is a throw: an arc
// (`peak` metres above the straight line) from where the throwing hand is at the release to where the catching hand is at
// the catch. anchor(segment) gives the place a segment names with the performers as they are now; anchor(segment, t) must
// pose them at t first (the caller puts them back afterwards). The two ends of a throw are read once and kept in `flights`.
// A segment with `path` ([seconds, x, y, z] rows) is a prop loose in the room on a measured course (a ball off the hand, from a video).
export function propPlace(prop:{track:any[]},time:number,held:(segment:any,at?:number)=>number[],flights:Map<any,{from:number[];to:number[]}>):number[]{
 const anchor=(s:any,t?:number)=>{if(!s.path)return held(s,t);const P=s.path as number[][],x=t??time;let i=P.findLastIndex(q=>q[0]<=x);if(i<0)return P[0].slice(1);if(i>=P.length-1)return P[P.length-1].slice(1);const u=(x-P[i][0])/Math.max(P[i+1][0]-P[i][0],1e-6);return [1,2,3].map(c=>P[i][c]+(P[i+1][c]-P[i][c])*u);};
 const k=Math.max(0,prop.track.findLastIndex((s:any)=>s.start<=time+1e-9)),seg=prop.track[k],mix=(a:number[],b:number[],u:number)=>a.map((v,i)=>v+(b[i]-v)*u);
 if(k>0&&seg.fly>0&&time<seg.start+seg.fly){let f=flights.get(seg);if(!f){f={from:anchor(prop.track[k-1],seg.start),to:anchor(seg,seg.start+seg.fly)};flights.set(seg,f);}const u=(time-seg.start)/seg.fly,p=mix(f.from,f.to,u);p[1]+=4*seg.peak*u*(1-u);return p;}
 const at=anchor(seg);if(k>0&&seg.blend>0&&time<seg.start+seg.blend){const u=(time-seg.start)/seg.blend;return mix(anchor(prop.track[k-1]),at,u*u*(3-2*u));}
 return at;
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
// The same for someone placed by a series of [x, lift, z] alone (a scene's extras).
export function standAt(camera:SceneCamera,place:number[][],time:number,duration:number,local:number[]){return standInRoom({objects:[],camera,performers:[{origin:[0,0],hipDown:[0,0],place}]},0,time,duration,local);}
export function standInRoom(scene:PairScene,index:number,time:number,duration:number,local:number[]){
 const c=sceneCameraAt(scene.camera,time,duration),side=scene.performers[index],even=scene.distanceScale?sampleSeries(scene.distanceScale,time,duration):1,inCamera=turn(c.quat,[(side.origin[0]+local[0])*even,-sampleSeries(side.hipDown,time,duration)*even,(side.origin[1]+local[2])*c.zoom*even]),back=turn(c.quat,local);
 if(side.place){const {lo,hi,u}=at(side.place.length-1,time,duration),a=side.place[lo],b=side.place[hi],back=turn(c.quat,local);return {quat:c.quat,position:[a[0]*(1-u)+b[0]*u-back[0],local[1]+a[1]*(1-u)+b[1]*u-back[1],a[2]*(1-u)+b[2]*u-back[2]],inCameraY:0,camera:c};}
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
