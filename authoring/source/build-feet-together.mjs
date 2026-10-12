// Build "feet together" as a library movement: from the standing idle, the right foot is lifted a little, brought in beside
// the left and set down; the pose is then held. node authoring/source/build-feet-together.mjs -> authoring/source/feet-together.json
// Made by rule, not captured. The right thigh is turned inward by the angle that leaves the ankles 13 cm apart (found by
// trying turns on the rig), with a small knee lift while it travels; the left leg does not move. The pelvis does not shift
// over the feet. Turning the leg inward tips the sole, so the foot is turned back by that much: the foot's own axes are
// found by nudging it about each and watching where the ball of the foot goes.
import {writeFile,rm} from 'node:fs/promises';
import {Studio} from '../core.js';
const scratch='/private/tmp/feet-together-project.json';await rm(scratch,{force:true});await rm(scratch+'.blobs',{recursive:true,force:true});const studio=new Studio(process.cwd(),scratch);
const LENGTH=1.0,base=(id,tracks)=>({version:2,rig:'quaternius-ual1',id,name:'Feet together',phases:[{id:'close',name:'Feet together',intent:'Lift the right foot a little, set it beside the left, hold',duration:LENGTH,kind:'move',clip:'Idle_Loop',from:0,to:LENGTH/2.5}],tracks,cues:[]});
const joints=async(action,time)=>{studio.state.actions[action.id]={revision:1,action,reference:action,history:[]};const d=await studio.call('get_diagnostics',{actionId:action.id,time});return Object.fromEntries(d.joints.map(j=>[j.name,j.worldPosition]));};
const quat=(axis,deg)=>{const h=deg*Math.PI/360,s=Math.sin(h);return [axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(h)];},mul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]],sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const still=k=>({time:0,value:k}),one=(bone,q)=>base('probe',[{target:bone,property:'rotation',mode:'offset',interpolation:'linear',keys:[still(q)]}]);
const rest=await joints(base('probe',[]),0),across=sub(rest.thigh_r,rest.thigh_l),wide=Math.hypot(across[0],across[2]),side=[across[0]/wide,0,across[2]/wide],forward=[across[2]/wide,0,-across[0]/wide],gap=j=>dot(sub(j.foot_r,j.foot_l),side);
// which way each joint bends (as in build-foot-stamp.mjs), and which turn of the thigh brings the right foot inward
const pick=async(bone,score)=>{let best=null;for(const axis of [[1,0,0],[0,1,0],[0,0,1]])for(const sign of [1,-1]){const a=axis.map(v=>v*sign),j=await joints(one(bone,quat(a,10)),0),s=score(j);if(!best||s>best.s)best={a,s};}return best.a;};
const flexT=await pick('thigh_r',j=>dot(sub(j.calf_r,rest.calf_r),forward)),flexS=await pick('calf_r',j=>-dot(sub(j.foot_r,rest.foot_r),forward)),flexF=await pick('foot_r',j=>sub(j.ball_r,j.foot_r)[1]-sub(rest.ball_r,rest.foot_r)[1]),inward=await pick('thigh_r',j=>gap(rest)-gap(j));
// The idle stands with the feet apart sideways and front to back, toes turned out. The right ankle is sent to 13 cm beside the left one, level
// with it front to back and at its own rest height: three turns are solved for (thigh inward, thigh forward, knee bend), each
// step by trying small changes on the rig. The inward turn found is mostly a turn of the leg about its own length, so the
// foot ends pointing forward instead of out; that is left as it is.
const want=[0,1,2].map(i=>rest.foot_l[i]+side[i]*.13);want[1]=rest.foot_r[1];
// the foot's own axes in the world (along the foot, and across it from small test turns), to turn the sole back level
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
const w1=unit(sub(rest.ball_r,rest.foot_r)),nudge=async a=>sub((await joints(one('foot_r',quat(a,2)),0)).ball_r,rest.ball_r),dx=await nudge([1,0,0]),dy=await nudge([0,1,0]),dz=await nudge([0,0,1]);studio.state.actions.probe={revision:1,action:base('probe',[]),reference:base('probe',[]),history:[]};const u1=unit((await studio.call('get_diagnostics',{actionId:'probe',time:0})).joints.find(j=>j.name==='ball_r').localPosition);
const cand=[[cross([1,0,0],u1),dx],[cross([0,1,0],u1),dy],[cross([0,0,1],u1),dz]].sort((a,b)=>Math.hypot(...b[0])-Math.hypot(...a[0]))[0],u2=unit(cand[0]),w2=unit(cand[1]),u3=cross(u1,u2),w3=cross(w1,w2),toLocal=w=>unit([0,1,2].map(i=>dot(w1,w)*u1[i]+dot(w2,w)*u2[i]+dot(w3,w)*u3[i]));
// the inward turn tips the sole about the leg's turning axis; measured once for a 10 degree turn and scaled
const tenth=await joints(one('thigh_r',quat(inward,10)),0),L0=unit(sub(rest.foot_r,rest.thigh_r)),L1=unit(sub(tenth.foot_r,tenth.thigh_r)),level=toLocal(unit(cross(L0,L1))),tipPer=Math.acos(Math.min(1,dot(L0,L1)))*18/Math.PI/10*10/10;
const pose=(inDeg,fwd,knee,liftDeg=0,toe=0)=>[{target:'thigh_r',q:mul(quat(inward,inDeg),quat(flexT,fwd+knee+liftDeg))},{target:'calf_r',q:quat(flexS,2*(knee+liftDeg))},{target:'foot_r',q:mul(quat(level,-inDeg*tipPer),quat(flexF,knee+liftDeg-fwd+toe))}];
const at=async v=>(await joints(base('probe',pose(...v).map(x=>({target:x.target,property:'rotation',mode:'offset',interpolation:'linear',keys:[still(x.q)]}))),0));
let v=[10,10,2];for(let round=0;round<12;round++){const f=sub((await at(v)).foot_r,want),J=[];for(let k=0;k<3;k++){const w=[...v];w[k]+=.5;J.push(sub((await at(w)).foot_r,want).map((x,i)=>(x-f[i])/.5));}
 // solve J^T d = -f (3x3) by Cramer's rule
 const M=[0,1,2].map(i=>[J[0][i],J[1][i],J[2][i]]),det=m=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]),D=det(M);if(Math.abs(D)<1e-12)break;const d=[0,1,2].map(k=>det(M.map((row,i)=>row.map((x,j)=>j===k?-f[i]:x)))/D);v=v.map((x,k)=>x+Math.max(-8,Math.min(8,d[k])));if(Math.hypot(...f)<5e-4)break;}
// last, the toes are raised or lowered until the ball of the foot is back at its own rest height
let tl=-20,th=20;for(let n=0;n<16;n++){const mid=(tl+th)/2;if((await at([...v,0,mid])).ball_r[1]<rest.ball_r[1])tl=mid;else th=mid;}const toes=(tl+th)/2;
const [angle,swing,bend]=v,ease=x=>x<=0?0:x>=1?1:x*x*(3-2*x),lift=t=>10*Math.sin(Math.PI*Math.min(1,Math.max(0,(t-.1)/.55)))**2,close=t=>ease((t-.15)/.45);
const times=[];for(let k=0;k<=Math.round(LENGTH*60);k++)times.push(k/60);const track=(target,f)=>({target,property:'rotation',mode:'offset',interpolation:'linear',keys:times.map(time=>({time,value:f(time)}))});
const frames=times.map(t=>pose(angle*close(t),swing*close(t),bend*close(t),lift(t),toes*close(t))),action=base('move-feet-together',[0,1,2].map(k=>({target:frames[0][k].target,property:'rotation',mode:'offset',interpolation:'linear',keys:times.map((time,n)=>({time,value:frames[n][k].q}))})));
let peak=0,left=0;for(const t of times){const j=await joints(action,t),b=await joints(base('probe',[]),t);peak=Math.max(peak,j.ball_r[1]-b.ball_r[1]);left=Math.max(left,Math.hypot(...sub(j.foot_l,b.foot_l)));}const last=await joints(action,LENGTH),flat=(a,b)=>Math.hypot(dot(sub(a,b),side),dot(sub(a,b),forward)),turned=Math.acos(Math.min(1,dot(unit(sub(last.ball_r,last.foot_r)),w1)))*180/Math.PI;
const metadata={source:'Made by rule on Quaternius UAL1 Idle_Loop · CC0 (authoring/source/build-feet-together.mjs)',support:'left',travel:'in-place',notes:`Right foot lifted ${peak.toFixed(2)} m and set beside the left by 0.6 s, then held; ankles ${flat(last.foot_r,last.foot_l).toFixed(2)} m apart at the end (${flat(rest.foot_r,rest.foot_l).toFixed(2)} m before). One leg only: no weight shift. Not reviewed.`};
await writeFile('authoring/source/feet-together.json',JSON.stringify({action,metadata,expectedRevision:0},null,1));console.log(JSON.stringify({turnsDegrees:{inward:+angle.toFixed(1),forward:+swing.toFixed(1),knee:+bend.toFixed(1),toes:+toes.toFixed(1)},anklesApartBefore:+flat(rest.foot_r,rest.foot_l).toFixed(3),anklesApartAfter:+flat(last.foot_r,last.foot_l).toFixed(3),missMeters:+Math.hypot(...sub(last.foot_r,want)).toFixed(4),peakLiftMeters:+peak.toFixed(3),leftFootMoved:+left.toFixed(4),ankleHeightChange:+(last.foot_r[1]-rest.foot_r[1]).toFixed(3),ballHeightChange:+(last.ball_r[1]-rest.ball_r[1]).toFixed(3),footDirectionChangeDegrees:+turned.toFixed(1)}));
await rm(scratch,{force:true});await rm(scratch+'.blobs',{recursive:true,force:true});
