// Transient timing comparison: uses production compiler/inspector; never saves a Studio action.
import * as T from 'three/webgpu';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneRig} from 'three/addons/utils/SkeletonUtils.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {composeMovements} from '../../../runtime/movements';
import {CharacterPlayer} from '../../../runtime/player';
import {inspectMotionQuality} from '../../../runtime/motion-quality';
const dir='authoring/reviews/sword-completion',input=JSON.parse(readFileSync(dir+'/inputs.json','utf8'));
const bytes=readFileSync('editor/assets/character.glb'),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
function rig(){const model=cloneRig(gltf.scene),holder=new T.Group();holder.add(model);const scale=1.85/new T.Box3().setFromObject(model).getSize(new T.Vector3()).y;holder.scale.setScalar(scale);return {model,scale};}
const results=[];
for(const [from,to] of [['a','b'],['b','c'],['a','a-rec'],['b','b-rec']])for(const transition of [1/60,1/30,.06,.12,.2]){
 const steps=[from,to].map((s,i)=>({action:input.sources['move-ual2-sword-regular-'+s].action,speed:1,transition:i?transition:0}));
 const {model,scale}=rig(),began=performance.now(),action=composeMovements(model,gltf.animations,scale,'transient-sweep','Transient timing sweep',steps);
 const r=rig(),report=inspectMotionQuality(new CharacterPlayer(r.model,gltf.animations,r.scale),action);
 results.push({from,to,transition,elapsedMs:performance.now()-began,seams:report.seams,diagnostics:report.diagnostics,thresholds:report.thresholds});
}
writeFileSync(dir+'/timing-sweep.json',JSON.stringify({at:new Date().toISOString(),sourcePins:input.library.items.map((m:any)=>({id:m.id,revision:m.revision,motionHash:m.motionHash})),speeds:[1,1],anchor:'none',productionCompiler:'pose-blend-v1',transient:true,results},null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({pair:r.from+'→'+r.to,transition:r.transition,velocityJumps:r.seams.map(s=>+s.jointVelocityJumpRmsMetersPerSecond.toFixed(4)),flags:r.diagnostics.map(d=>d.code)}))));
