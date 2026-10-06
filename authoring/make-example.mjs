// Build a reproducible authoring example using actual clip-space bone transforms.
import {readFile,writeFile} from 'node:fs/promises';
import * as THREE from 'three/webgpu';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {build} from 'esbuild';
const out=await build({entryPoints:['runtime/player.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {CharacterPlayer}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const ab=await build({entryPoints:['runtime/action.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {burst}=await import('data:text/javascript;base64,'+Buffer.from(ab.outputFiles[0].text).toString('base64'));
const bytes=await readFile('editor/assets/character.glb'),g=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const a={version:2,rig:'quaternius-ual1',id:'llm-hammer-study',name:'LLM Hammer Study',phases:burst.phases.map(({pose,stretch,...p})=>p),tracks:[{target:'$root',property:'position',mode:'absolute',interpolation:'smooth',keys:[[0,[0,0,0]],[.71,[0,0,0]],[.81,[0,.4,.15]],[1.09,[0,1.5,.4]],[1.43,[0,1.5,.65]],[1.56,[0,0,.9]],[3.24,[0,0,.9]]].map(([time,value])=>({time,value}))}],cues:[{type:'impact',time:1.56,strength:1.1}]};
await writeFile('authoring/example-baseline.json',JSON.stringify({action:a},null,2));
const holder=new THREE.Group();holder.add(g.scene);const scale=1.85/new THREE.Box3().setFromObject(g.scene).getSize(new THREE.Vector3()).y;holder.scale.setScalar(scale);const player=new CharacterPlayer(g.scene,g.animations,scale);
for(const [name,side]of [['upperarm_l',1],['upperarm_r',-1]]){
 const keys=[];for(const [time,amount]of [[0,0],[.71,0],[.81,.3],[1.09,.9],[1.43,1],[1.56,-.75],[1.65,-.5],[2.01,-.2],[2.49,-.2],[2.94,0],[3.24,0]]){
  player.sample(a,time);const bone=g.scene.getObjectByName(name),child=bone.children.find(n=>n.isBone);const q=bone.quaternion.clone();if(amount){const targetDirection=new THREE.Vector3(side*.28,amount>0?1:-1,.18).normalize().applyQuaternion(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert());const target=new THREE.Quaternion().setFromUnitVectors(child.position.clone().normalize(),targetDirection);q.slerp(target,Math.abs(amount));}keys.push({time,value:q.normalize().toArray()});
 }
 a.tracks.push({target:name,property:'rotation',mode:'absolute',interpolation:'smooth',keys});
}
const offset=(target,axis,values)=>({target,property:'rotation',mode:'offset',interpolation:'smooth',keys:values.map(([time,angle])=>({time,value:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis),angle).toArray()}))});
a.tracks.push(offset('spine_03',[1,0,0],[[0,0],[.71,-.12],[1.09,-.2],[1.43,-.22],[1.56,.25],[2.01,.1],[2.94,0],[3.24,0]]),offset('lowerarm_l',[1,0,0],[[0,0],[1.09,.15],[1.43,.2],[1.56,0],[3.24,0]]),offset('lowerarm_r',[1,0,0],[[0,0],[1.09,-.08],[1.43,-.12],[1.56,0],[3.24,0]]));
a.tracks.push({target:'$root',property:'scale',mode:'absolute',interpolation:'smooth',keys:[[0,[1,1,1]],[.71,[1,1,1]],[.81,[.96,1.1,.96]],[1.09,[1,1,1]],[1.43,[1,1,1]],[1.53,[.96,1.12,.96]],[1.6,[1.08,.84,1.08]],[2.01,[1,1,1]],[3.24,[1,1,1]]].map(([time,value])=>({time,value}))});
await writeFile('authoring/example-revision.json',JSON.stringify({action:a,expectedRevision:1},null,2));
