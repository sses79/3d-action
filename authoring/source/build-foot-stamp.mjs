// Build a foot stamp as a library movement: the standing idle with the right knee lifted and the foot driven down.
// node authoring/source/build-foot-stamp.mjs   -> authoring/source/foot-stamp.json (register it with register_movement)
// Made by rule, not captured: thigh, shin and foot of one leg are turned on top of the idle so the foot rises about 15 cm under
// the hip and comes down in a tenth of a second, with a small rebound. Which way each joint bends is found by trying each axis
// on the rig. The rest of the body does not react (no weight shift, no arms), so it reads as a stamp, not as acting.
import {writeFile,rm} from 'node:fs/promises';
import {Studio} from '../core.js';
const scratch='/private/tmp/foot-stamp-project.json';await rm(scratch,{force:true});await rm(scratch+'.blobs',{recursive:true,force:true});const studio=new Studio(process.cwd(),scratch);
const base=(id,tracks,duration=1.2)=>({version:2,rig:'quaternius-ual1',id,name:'Foot stamp',phases:[{id:'stamp',name:'Stamp',intent:'Lift the right knee and drive the foot down',duration,kind:'move',clip:'Idle_Loop',from:0,to:duration/2.5}],tracks,cues:[]});
const joints=async(action,time)=>{studio.state.actions[action.id]={revision:1,action,reference:action,history:[]};const d=await studio.call('get_diagnostics',{actionId:action.id,time});return Object.fromEntries(d.joints.map(j=>[j.name,j.worldPosition]));};
const quat=(axis,deg)=>{const h=deg*Math.PI/360,s=Math.sin(h);return [axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(h)];},sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const rest=await joints(base('probe',[]),0),across=sub(rest.thigh_r,rest.thigh_l),forward=[across[2],0,-across[0]].map(v=>v/Math.hypot(across[0],across[2]));  // up x (right - left)
const pick=async(bone,child,score)=>{let best=null;for(const axis of [[1,0,0],[0,1,0],[0,0,1]])for(const sign of [1,-1]){const a=axis.map(v=>v*sign),j=await joints(base('probe',[{target:bone,property:'rotation',mode:'offset',interpolation:'linear',keys:[{time:0,value:quat(a,10)}]}]),0),s=score(sub(j[child],rest[child]),j);if(!best||s>best.s)best={a,s};}return best.a;};
const thigh=await pick('thigh_r','calf_r',d=>dot(d,forward)),shin=await pick('calf_r','foot_r',d=>-dot(d,forward)),foot=await pick('foot_r','ball_r',(d,j)=>sub(j.ball_r,j.foot_r)[1]-sub(rest.ball_r,rest.foot_r)[1]);
// knee angle over time: up over 0.33 s, down in 0.1 s, a 4 degree rebound, still by 0.62 s
const ease=x=>x*x*(3-2*x),angle=t=>t<.33?34*ease(t/.33):t<.43?34*(1-((t-.33)/.1)**2):t<.5?4*Math.sin(Math.PI*(t-.43)/.14):t<.57?4*Math.sin(Math.PI*(t-.43)/.14):0;
const times=[];for(let k=0;k<=72;k++)times.push(k/60);const track=(target,axis,gain)=>({target,property:'rotation',mode:'offset',interpolation:'linear',keys:times.map(time=>({time,value:quat(axis,gain*angle(time))}))});
const action=base('move-foot-stamp',[track('thigh_r',thigh,1),track('calf_r',shin,2),track('foot_r',foot,1)]);
let peak=0,end=0;for(const t of times){const j=await joints(action,t);peak=Math.max(peak,j.ball_r[1]-rest.ball_r[1]);if(t===1.2)end=Math.hypot(...sub(j.ball_r,(await joints(base('probe',[]),1.2)).ball_r));}
const metadata={source:'Made by rule on Quaternius UAL1 Idle_Loop · CC0 (authoring/source/build-foot-stamp.mjs)',support:'left',travel:'in-place',notes:`Right foot lifted ${peak.toFixed(2)} m and driven down at 0.43 s. One leg only: no weight shift or arm reaction. Not reviewed.`};
await writeFile('authoring/source/foot-stamp.json',JSON.stringify({action,metadata,expectedRevision:0},null,1));console.log(JSON.stringify({axes:{thigh,shin,foot},forward:forward.map(v=>Math.round(v*100)/100),peakLiftMeters:Math.round(peak*1000)/1000,endOffsetMeters:Math.round(end*1000)/1000}));
await rm(scratch,{force:true});await rm(scratch+'.blobs',{recursive:true,force:true});
