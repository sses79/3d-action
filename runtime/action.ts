export type Phase = {id:string; name:string; intent:string; duration:number; kind?:'hold'|'fast'|'move'|'neutral'; pose?:[number,number]; stretch?:[number,number]; clip:string; from:number; to:number};
import {rigManifest} from './rig';
export type Key = {time:number;value:number[]};
export type Track = {target:string;property:'rotation'|'position'|'scale';mode:'absolute'|'offset';interpolation:'linear'|'smooth'|'step';keys:Key[]};
export type Action = {version:1|2; rig:string; name:string; id?:string; root?:{peak:number;profile:string}; phases:Phase[];tracks?:Track[];cues?:{type:'impact';time:number;strength:number}[]};
export const clone = <T,>(v:T):T => JSON.parse(JSON.stringify(v));
export const jump:Action = {version:1,rig:'quaternius-ual1',id:'jump',name:'Jump',root:{peak:1.3,profile:'jump'},phases:[
 {id:'coil',name:'Coil',intent:'Gather weight before takeoff',duration:.38,clip:'Jump_Start',from:0,to:.5},
 {id:'rise',name:'Rise',intent:'Extend and release upward',duration:.28,clip:'Jump_Start',from:.5,to:1},
 {id:'hang',name:'Hang',intent:'Hold a readable pose at the apex',duration:.32,clip:'Jump_Loop',from:.2,to:.35},
 {id:'follow',name:'Follow',intent:'Carry momentum into descent',duration:.28,clip:'Jump_Loop',from:.35,to:.7},
 {id:'settle',name:'Settle',intent:'Absorb contact with the floor',duration:.25,clip:'Jump_Land',from:0,to:.35},
 {id:'recover',name:'Recover',intent:'Return the body to balance',duration:.4,clip:'Jump_Land',from:.35,to:1},
 {id:'guard',name:'Guard',intent:'Finish in a ready stance',duration:.3,clip:'Idle_Loop',from:0,to:.12}
]};
export const burst:Action={version:1,rig:'quaternius-ual1',id:'burst',name:'Burst Attack',root:{peak:1.6,profile:'burst'},phases:[
 {id:'ready',name:'Ready',intent:'Start from the character’s own guard',duration:.16,kind:'neutral',clip:'Idle_Loop',from:0,to:.05,pose:[0,0]},
 {id:'coil',name:'Coil',intent:'Hold the anticipation',duration:.55,kind:'hold',clip:'Jump_Start',from:0,to:.45,pose:[0,0]},
 {id:'launch',name:'Launch',intent:'Release in a handful of frames',duration:.1,kind:'fast',clip:'Jump_Start',from:.45,to:.8,pose:[0,.25],stretch:[1,1.1]},
 {id:'rise',name:'Rise',intent:'Ease out of the burst',duration:.28,kind:'move',clip:'Jump_Start',from:.8,to:1,pose:[.25,.55],stretch:[1.1,1]},
 {id:'hang',name:'Hang',intent:'Hang at the apex',duration:.34,kind:'hold',clip:'Jump_Loop',from:.2,to:.28,pose:[.55,.65]},
 {id:'hammer',name:'Hammer',intent:'Drive the arms down in a fast arc',duration:.13,kind:'fast',clip:'Jump_Loop',from:.28,to:.55,pose:[.65,-.65],stretch:[1,1.12]},
 {id:'impact',name:'Impact',intent:'Compress on contact; the ground answers',duration:.09,kind:'fast',clip:'Jump_Land',from:0,to:.3,pose:[-.65,-.45],stretch:[1.12,.82]},
 {id:'follow',name:'Follow',intent:'Momentum keeps going',duration:.36,kind:'move',clip:'Jump_Land',from:.3,to:.5,pose:[-.45,-.2],stretch:[.82,1]},
 {id:'settle',name:'Settle',intent:'Land in a pose and hold it',duration:.48,kind:'hold',clip:'Jump_Land',from:.5,to:.52,pose:[-.2,-.2]},
 {id:'recover',name:'Recover',intent:'Overlap on the way out',duration:.45,kind:'move',clip:'Jump_Land',from:.52,to:1,pose:[-.2,0]},
 {id:'guard',name:'Guard',intent:'Return to the ready stance',duration:.3,kind:'neutral',clip:'Idle_Loop',from:0,to:.12,pose:[0,0]}
]};
export const actionId=(a:Action)=>a.id||(a.version===1?'jump':'custom');
export const template=(a:Action)=>a.version===2?a:actionId(a)==='burst'?burst:jump;
export function phaseKind(a:Action,p:Phase){return p.kind||({coil:'hold',rise:'move',hang:'hold',follow:'move',settle:'hold',recover:'move',guard:'neutral'} as Record<string,string>)[p.id]||'neutral';}
export function impactTime(a:Action){if(a.cues?.length)return a.cues[0].time;const i=a.phases.findIndex(p=>p.id==='impact');return i<0?-1:a.phases.slice(0,i).reduce((s,p)=>s+p.duration,0);}
export function duration(a:Action){return a.phases.reduce((s,p)=>s+p.duration,0);}
export function locate(a:Action,time:number){
 let start=0;const t=Math.max(0,Math.min(duration(a),time));
 for(let i=0;i<a.phases.length;i++){const p=a.phases[i];if(t<start+p.duration||i===a.phases.length-1)return {phase:p,index:i,start,u:Math.min(1,(t-start)/p.duration)};start+=p.duration;}
 throw new Error('Empty action');
}
export function rootHeight(a:Action,time:number){
 if(a.version===2){const t=a.tracks?.find(t=>t.target==='$root'&&t.property==='position');return t?trackValue(t,time)[1]:0;}
 const {phase:p,u}=locate(a,time);
 if(actionId(a)==='burst'){const h=a.root?.peak??1.6;if(p.id==='launch')return h*.25*u*u;if(p.id==='rise')return h*(.25+.75*Math.sin(u*Math.PI/2));if(p.id==='hang')return h;if(p.id==='hammer')return h*(1-u*u);return 0;}
 const h=a.root?.peak??1.3;
 if(p.id==='rise')return h*Math.sin(u*Math.PI/2);
 if(p.id==='hang')return h+.05*Math.sin(u*Math.PI);
 if(p.id==='follow')return h*Math.cos(u*Math.PI/2);
 return 0;
}
export function validateAction(v:unknown):Action{
 if((v as Action)?.version===2)return validateAuthored(v);
 const a=v as Action;if(!a||a.version!==1||a.rig!=='quaternius-ual1'||typeof a.name!=='string'||a.name.length>64||!Array.isArray(a.phases)||(a.id!==undefined&&!['jump','burst'].includes(a.id)))throw new Error('Use an Animation Studio version 1 action.');
 const base=template(a);if(a.phases.length!==base.phases.length)throw new Error('Invalid phase count.');
 for(let i=0;i<base.phases.length;i++){const p=a.phases[i],b=base.phases[i];if(!p||p.id!==b.id||p.clip!==b.clip||p.from!==b.from||p.to!==b.to||!Number.isFinite(p.duration)||p.duration<.08||p.duration>1.5)throw new Error('Invalid phase or duration.');if(p.kind&&!['hold','fast','move','neutral'].includes(p.kind))throw new Error('Invalid phase kind');for(const [values,lo,hi] of [[p.pose,-1.5,1.5],[p.stretch,.7,1.4]] as const){if(values&&(!Array.isArray(values)||values.length!==2||values.some(x=>!Number.isFinite(x)||x<lo||x>hi)))throw new Error('Invalid pose control');}}
 if(a.root&&(!Number.isFinite(a.root.peak)||a.root.peak<0||a.root.peak>3||a.root.profile!==base.root?.profile))throw new Error('Invalid root trajectory.');
 return {...clone(base),name:a.name,...(a.root?{root:clone(a.root)}:{}),phases:base.phases.map((p,i)=>({...p,duration:a.phases[i].duration,...(a.phases[i].pose?{pose:clone(a.phases[i].pose!)}:{}),...(a.phases[i].stretch?{stretch:clone(a.phases[i].stretch!)}:{}),...(a.phases[i].kind?{kind:a.phases[i].kind}:{})}))};
}

export function trackValue(track:Track,time:number):number[]{
 const keys=track.keys;if(time<=keys[0].time)return keys[0].value.slice();
 if(time>=keys.at(-1)!.time)return keys.at(-1)!.value.slice();
 let lo=1,hi=keys.length-1;while(lo<hi){const mid=(lo+hi)>>>1;if(keys[mid].time>time)hi=mid;else lo=mid+1;}const i=lo;
 const a=keys[i-1],b=keys[i];let u=(time-a.time)/(b.time-a.time);
 if(track.interpolation==='step')u=0;else if(track.interpolation==='smooth')u=u*u*(3-2*u);
 if(track.property==='rotation'){
  let dot=a.value.reduce((s,x,j)=>s+x*b.value[j],0),sign=dot<0?-1:1;dot=Math.min(1,Math.abs(dot));
  const angle=Math.acos(dot),sin=Math.sin(angle),x=sin<1e-6?1-u:Math.sin((1-u)*angle)/sin,y=sin<1e-6?u:Math.sin(u*angle)/sin;
  const value=a.value.map((v,j)=>v*x+b.value[j]*y*sign),len=Math.hypot(...value);return value.map(v=>v/len);
 }
 return a.value.map((v,j)=>v+(b.value[j]-v)*u);
}
function validateAuthored(v:unknown):Action{
 const a=v as Action;const fail=(s:string):never=>{throw new Error(s);};
 const obj=(o:unknown,allowed:string[])=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!allowed.includes(k)))fail('Unknown or invalid action field');};
 obj(a,['version','rig','name','id','phases','tracks','cues']);
 if(a.rig!=='quaternius-ual1'||typeof a.name!=='string'||!a.name.trim()||a.name.length>64||typeof a.id!=='string'||!/^[-a-z0-9]{1,48}$/.test(a.id)||['jump','burst'].includes(a.id))fail('Invalid authored action identity');
 if(!Array.isArray(a.phases)||a.phases.length<1||a.phases.length>32)fail('Use 1–32 phases');
 const ids=new Set();for(const p of a.phases){obj(p,['id','name','intent','duration','kind','clip','from','to']);if(typeof p.id!=='string'||!/^[-a-z0-9]{1,48}$/.test(p.id)||ids.has(p.id))fail('Duplicate or invalid phase ID');ids.add(p.id);if(typeof p.name!=='string'||!p.name||p.name.length>64||typeof p.intent!=='string'||p.intent.length>300||!Number.isFinite(p.duration)||p.duration<.016||p.duration>10||!['hold','fast','move','neutral'].includes(p.kind||'neutral')||!rigManifest.clips.includes(p.clip as never)||!Number.isFinite(p.from)||!Number.isFinite(p.to)||p.from<0||p.to>1||p.to<0||p.from>1)fail('Invalid phase/source segment');}
 const end=duration(a);if(end>30)fail('Action exceeds 30 seconds');
 if(!Array.isArray(a.tracks)||a.tracks.length>198)fail('Invalid track count');const channels=new Set();
 for(const t of a.tracks!){obj(t,['target','property','mode','interpolation','keys']);if((t.target!=='$root'&&!rigManifest.bones.some(b=>b.name===t.target))||!['rotation','position','scale'].includes(t.property)||!['absolute','offset'].includes(t.mode)||!['linear','smooth','step'].includes(t.interpolation))fail('Unknown track control');if(t.target==='$root'&&t.mode!=='absolute')fail('Root tracks must use absolute mode');const channel=t.target+':'+t.property;if(channels.has(channel))fail('Duplicate track channel');channels.add(channel);
  if(!Array.isArray(t.keys)||t.keys.length<1||t.keys.length>256)fail('Use 1–256 keys per track');let previous=-1;
  for(const k of t.keys){obj(k,['time','value']);if(!Number.isFinite(k.time)||k.time<0||k.time>end||k.time<=previous||!Array.isArray(k.value)||k.value.length!==(t.property==='rotation'?4:3)||k.value.some(x=>!Number.isFinite(x)))fail('Invalid or unordered keyframe');previous=k.time;if(t.property==='rotation'&&Math.abs(Math.hypot(...k.value)-1)>.001)fail('Rotation quaternion must be normalized');if(t.property==='scale'&&k.value.some(x=>x<.1||x>3))fail('Scale outside 0.1–3');if(t.property==='position'&&k.value.some(x=>Math.abs(x)>(t.target==='$root'?10:200)))fail('Position outside supported bounds');}
 }
 if(a.cues!==undefined){if(!Array.isArray(a.cues)||a.cues.length>16)fail('Invalid cues');for(const c of a.cues){obj(c,['type','time','strength']);if(c.type!=='impact'||!Number.isFinite(c.time)||c.time<0||c.time>end||!Number.isFinite(c.strength)||c.strength<.1||c.strength>3)fail('Invalid impact cue');}}
 return clone(a);
}
