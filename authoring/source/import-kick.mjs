// Offline adapter: keep target bone lengths and transfer source motion in world space.
import{readFile,writeFile}from'node:fs/promises';import * as T from'three/webgpu';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';
globalThis.ProgressEvent=class{constructor(type,init){Object.assign(this,init);this.type=type;}};
const bytes=await readFile(process.argv[2]||'editor/source/kick/human-mocap-animations.glb');const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());json.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+bytes.readUInt32LE(12)).toString('base64');json.materials=json.materials.map(()=>({}));delete json.images;delete json.textures;
const source=await new GLTFLoader().parseAsync(JSON.stringify(json),'');const tb=await readFile('editor/assets/character.glb');const target=await new GLTFLoader().parseAsync(tb.buffer.slice(tb.byteOffset,tb.byteOffset+tb.byteLength),'');
const src=source.scene,dst=target.scene;src.updateMatrixWorld(true);dst.updateMatrixWorld(true);const bones=[];dst.traverse(b=>{if(b.isBone)bones.push(b)});
const rest=bones.map(b=>({b,p:b.position.clone(),q:b.quaternion.clone(),world:b.getWorldQuaternion(new T.Quaternion()),s:src.getObjectByName(b.name==='Head'?'head':b.name)})).filter(e=>e.s);
for(const e of rest)e.sourceWorld=e.s.getWorldQuaternion(new T.Quaternion());
const clip=source.animations.find(a=>a.name==='Kick_Breach');const mix=new T.AnimationMixer(src),anim=mix.clipAction(clip);anim.play();anim.paused=true;
const scale=1.85/new T.Box3().setFromObject(dst).getSize(new T.Vector3()).y;const holder=new T.Group();holder.scale.setScalar(scale);holder.add(dst);holder.updateMatrixWorld(true);
const srcPelvisRest=src.getObjectByName('pelvis').getWorldPosition(new T.Vector3()),dstPelvisRest=dst.getObjectByName('pelvis').getWorldPosition(new T.Vector3());
const tracks=rest.map(e=>({target:e.b.name,property:'rotation',mode:'absolute',interpolation:'linear',keys:[]}));const pelvis={target:'pelvis',property:'position',mode:'absolute',interpolation:'linear',keys:[]};const measures=[];let contact;
for(let i=0;i<=110;i++){
 const time=Math.min(clip.duration,i/60);anim.time=time;mix.update(0);src.updateMatrixWorld(true);
 for(const e of rest){e.b.position.copy(e.p);e.b.quaternion.copy(e.q)}holder.updateMatrixWorld(true);
 // Only pelvis translation is transferred; all other target bone lengths stay fixed.
 const displacement=src.getObjectByName('pelvis').getWorldPosition(new T.Vector3()).sub(srcPelvisRest).multiplyScalar(scale);
 const pb=dst.getObjectByName('pelvis');pb.position.copy(pb.parent.worldToLocal(dstPelvisRest.clone().add(displacement)));holder.updateMatrixWorld(true);
 rest.forEach((e,j)=>{const q=e.s.getWorldQuaternion(new T.Quaternion()).multiply(e.sourceWorld.clone().invert()).multiply(e.world);e.b.quaternion.copy(e.b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));holder.updateMatrixWorld(true);tracks[j].keys.push({time,value:e.b.quaternion.clone().normalize().toArray()})});
 const ball=dst.getObjectByName('ball_l').getWorldPosition(new T.Vector3());if(!contact)contact=ball.clone();const correction=contact.clone().sub(ball);const world=pb.getWorldPosition(new T.Vector3()).add(correction);pb.position.copy(pb.parent.worldToLocal(world));holder.updateMatrixWorld(true);pelvis.keys.push({time,value:pb.position.toArray()});const pos=n=>dst.getObjectByName(n).getWorldPosition(new T.Vector3()).toArray();measures.push({time,l:pos('foot_l'),r:pos('foot_r')});
}
const peak=measures.reduce((a,b)=>Math.max(...[b.l[1],b.r[1]])>Math.max(a.l[1],a.r[1])?b:a);console.log('Peak',peak,'first',measures[0],'last',measures.at(-1));
const data={version:2,rig:'quaternius-ual1',id:'kick-study',name:'Authored Kick Study',phases:[{id:'prepare',name:'Prepare',intent:'Source anticipation and weight shift',duration:.5,kind:'move'},{id:'release',name:'Release',intent:'Source kick extension',duration:.3,kind:'fast'},{id:'recoil',name:'Recoil',intent:'Source knee folding and leg return',duration:.4,kind:'move'},{id:'recover',name:'Recover',intent:'Source return to stance',duration:clip.duration-1.2,kind:'move'}].map(p=>({...p,clip:'A_TPose',from:0,to:0})),tracks:[...tracks,pelvis],cues:[]};
await writeFile('runtime/kick-baseline.json',JSON.stringify(data));await writeFile('editor/source/kick/source-measurements.json',JSON.stringify(measures,null,2));await writeFile('editor/source/kick/source-clip.json',JSON.stringify(T.AnimationClip.toJSON(clip)));
