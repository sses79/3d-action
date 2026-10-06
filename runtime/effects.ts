import * as THREE from 'three/webgpu';
import {Action,impactTime,trackValue} from './action';
// Preview-only effects are reconstructed from time, so scrubbing has no side effects.
export class ImpactPreview {
 group=new THREE.Group(); ring:THREE.Mesh; rocks:THREE.Mesh[]=[];
 constructor(scene:THREE.Scene){
  this.ring=new THREE.Mesh(new THREE.TorusGeometry(1,.025,6,48),new THREE.MeshBasicMaterial({color:0xe8ba65,transparent:true,opacity:.7}));this.ring.rotation.x=-Math.PI/2;this.ring.position.y=.035;this.group.add(this.ring);
  for(let i=0;i<18;i++){const rock=new THREE.Mesh(new THREE.IcosahedronGeometry(.09+(i%3)*.025,0),new THREE.MeshStandardMaterial({color:0x9b8670,roughness:1}));rock.castShadow=true;this.rocks.push(rock);this.group.add(rock);}scene.add(this.group);
 }
 sample(a:Action,time:number,x:number,visible:boolean){
  const cue=a.cues?.filter(c=>c.time<=time&&time-c.time<1.4).at(-1),start=a.version===2?(cue?.time??-1):impactTime(a),age=time-start;const root=a.tracks?.find(t=>t.target==='$root'&&t.property==='position'),point=root?trackValue(root,Math.max(0,start)):[0,0,0];this.group.position.set(x+point[0],0,point[2]);this.group.scale.setScalar(cue?.strength??1);this.group.visible=visible&&start>=0&&age>=0&&age<1.4;if(!this.group.visible)return;
  this.ring.scale.setScalar(.3+Math.min(age,1)*2);(this.ring.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.7*(1-age));
  this.rocks.forEach((r,i)=>{const angle=i*2.39996,speed=.8+(i%4)*.18,t=Math.min(age,1.2);r.position.set(Math.cos(angle)*(.25+speed*t),Math.max(.05,(1.7+(i%3)*.25)*t-3*t*t),Math.sin(angle)*(.25+speed*t));r.rotation.set(t*(i%3+1),angle,t*2);r.scale.setScalar(Math.min(1,age*25)*Math.min(1,(1.4-age)*4));});
 }
}
