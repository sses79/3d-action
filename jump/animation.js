export const CHANNELS={height:[0,2.5],crouch:[0,1],arms:[-90,180],tuck:[0,1],lean:[-35,35],stretch:[.7,1.3]};
const base={height:0,crouch:0,arms:12,tuck:0,lean:0,stretch:1};
const key=(id,name,t,v)=>({id,name,t,...base,...v});
export function preset(name='expressive'){
 const clip={version:1,name:'Expressive jump',duration:1.6,interpolation:'smooth',keys:[
  key('idle','Ready',0,{}),key('load','Anticipation',.16,{crouch:.8,arms:-35,lean:20,stretch:.93}),
  key('push','Takeoff',.26,{height:.15,arms:145,tuck:.12,lean:-4,stretch:1.13}),
  key('rise','Rise',.39,{height:1.05,arms:170,tuck:.62,lean:-8,stretch:1.04}),
  key('apex','Apex',.50,{height:1.4,arms:130,tuck:.8,lean:-8}),
  key('fall','Descent',.66,{height:.72,arms:55,tuck:.32,lean:9}),
  key('land','Landing',.78,{crouch:.88,arms:30,lean:18,stretch:.88}),
  key('settle','Recovery',.90,{crouch:.16,arms:17,lean:3}),key('end','Ready',1,{})]};
 if(name==='simple'){clip.name='Simple jump';clip.keys.forEach(k=>{k.crouch*=.25;k.arms=12;k.tuck*=.08;k.lean=0;k.stretch=1;k.height*=.78;});}
 if(name==='floaty'){clip.name='Floaty jump';clip.duration=2.4;clip.keys.find(k=>k.id==='rise').t=.38;clip.keys.find(k=>k.id==='apex').t=.56;clip.keys.find(k=>k.id==='fall').t=.74;clip.keys.find(k=>k.id==='land').t=.86;clip.keys.find(k=>k.id==='settle').t=.94;clip.keys.forEach(k=>k.height*=1.25);}
 if(name==='snappy'){clip.name='Snappy jump';clip.duration=1.1;clip.keys.find(k=>k.id==='load').t=.10;clip.keys.find(k=>k.id==='push').t=.19;clip.keys.find(k=>k.id==='rise').t=.32;clip.keys.find(k=>k.id==='apex').t=.43;clip.keys.find(k=>k.id==='fall').t=.59;clip.keys.find(k=>k.id==='land').t=.72;}
 return clip;
}
export function validateClip(value){
 if(!value||typeof value!=='object'||value.version!==1)throw new Error('Use a Jump Lab version 1 clip.');
 if(!Number.isFinite(value.duration)||value.duration<.6||value.duration>4)throw new Error('Duration must be between 0.6 and 4 seconds.');
 if(!['smooth','linear','hold'].includes(value.interpolation))throw new Error('Unknown interpolation mode.');
 if(!Array.isArray(value.keys)||value.keys.length<2||value.keys.length>64)throw new Error('A clip needs 2–64 pose keys.');
 const ids=new Set();const keys=value.keys.map(k=>{
  if(!k||typeof k.id!=='string'||k.id.length>64||!k.id||ids.has(k.id))throw new Error('Each pose needs a unique ID.');ids.add(k.id);
  if(!Number.isFinite(k.t)||k.t<0||k.t>1)throw new Error('Invalid key time.');
  const result={id:k.id,name:typeof k.name==='string'?k.name.slice(0,40):'Pose',t:k.t};
  for(const [c,[lo,hi]] of Object.entries(CHANNELS)){if(!Number.isFinite(k[c])||k[c]<lo||k[c]>hi)throw new Error(`Invalid ${c} value.`);result[c]=k[c];}return result;
 }).sort((a,b)=>a.t-b.t);
 if(keys[0].t!==0||keys.at(-1).t!==1)throw new Error('Keep the first key at 0 and the last key at the end.');
 for(let i=1;i<keys.length;i++)if(keys[i].t-keys[i-1].t<.005)throw new Error('Pose keys are too close together.');
 return {version:1,name:typeof value.name==='string'?value.name.slice(0,64):'Jump',duration:value.duration,interpolation:value.interpolation,keys};
}
export const clone=value=>JSON.parse(JSON.stringify(value));
// Shape-preserving cubic Hermite interpolation: extrema remain at their keys.
function tangent(keys,i,c){
 const n=keys.length;const sec=j=>(keys[j+1][c]-keys[j][c])/(keys[j+1].t-keys[j].t);
 if(i===0)return sec(0);if(i===n-1)return sec(n-2);
 const a=sec(i-1),b=sec(i);if(a*b<=0)return 0;
 const h0=keys[i].t-keys[i-1].t,h1=keys[i+1].t-keys[i].t,w1=2*h1+h0,w2=h1+2*h0;return (w1+w2)/(w1/a+w2/b);
}
export function sample(clip,seconds){
 const t=Math.max(0,Math.min(1,seconds/clip.duration)),keys=clip.keys;let i=0;while(i<keys.length-2&&keys[i+1].t<=t)i++;
 const a=keys[i],b=keys[i+1],h=b.t-a.t,u=(t-a.t)/h;const result={};
 for(const [c,[lo,hi]] of Object.entries(CHANNELS)){
  let v=a[c]+(b[c]-a[c])*u;
  if(clip.interpolation==='hold')v=t===b.t?b[c]:a[c];
  if(clip.interpolation==='smooth'){
   v=(2*u**3-3*u**2+1)*a[c]+(u**3-2*u**2+u)*h*tangent(keys,i,c)+(-2*u**3+3*u**2)*b[c]+(u**3-u**2)*h*tangent(keys,i+1,c);
   v=Math.max(Math.min(a[c],b[c]),Math.min(Math.max(a[c],b[c]),v));
  }
  result[c]=Math.max(lo,Math.min(hi,v));
 }
 return result;
}
export function solveLeg(crouch,tuck){
 const l=.44,y=-.84+.30*crouch+.32*tuck,z=-.10*crouch+.18*tuck;
 const d=Math.min(l*2-.0001,Math.max(.1,Math.hypot(y,z))),bend=2*Math.acos(d/(2*l));
 return {hip:Math.atan2(-z,-y)-bend/2,knee:bend,ankleY:y,ankleZ:z};
}
export function moveKey(clip,id,time,height){
 const i=clip.keys.findIndex(k=>k.id===id);if(i<0)return;const k=clip.keys[i];
 if(i>0&&i<clip.keys.length-1)k.t=Math.max(clip.keys[i-1].t+.005,Math.min(clip.keys[i+1].t-.005,time));
 if(Number.isFinite(height))k.height=Math.max(0,Math.min(2.5,height));
}
export function addKey(clip,seconds){
 const t=Math.max(.005,Math.min(.995,seconds/clip.duration));
 if(clip.keys.length>=64||clip.keys.some(k=>Math.abs(k.t-t)<.005))return null;
 const id='pose-'+Math.random().toString(36).slice(2,10);clip.keys.push({id,name:'New pose',t,...sample(clip,seconds)});clip.keys.sort((a,b)=>a.t-b.t);return id;
}
export function decodeProject(value){
 if(!value||value.app!=='jump-lab'||value.version!==1)throw new Error('This is not a Jump Lab project.');
 return {clip:validateClip(value.clip),reference:validateClip(value.reference)};
}
export function encodeProject(clip,reference){return {app:'jump-lab',version:1,clip:validateClip(clip),reference:validateClip(reference)};}
export class History {
 constructor(limit=60){this.past=[];this.future=[];this.limit=limit;}
 record(value){this.past.push(clone(value));if(this.past.length>this.limit)this.past.shift();this.future=[];}
 undo(value){if(!this.past.length)return null;this.future.push(clone(value));return this.past.pop();}
 redo(value){if(!this.future.length)return null;this.past.push(clone(value));return this.future.pop();}
}
