import {readFile,writeFile} from 'node:fs/promises';
import {Studio} from '../core.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
const archived=JSON.parse(await readFile(root+'/.authoring/removed-actions/pouch-coil-launch.json','utf8'));
const versions=[...archived.history,{revision:archived.revision,action:archived.action}];
const studio=new Studio(root);const sub=(a,b)=>a.map((x,i)=>x-b[i]);const len=a=>Math.hypot(...a);
const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,a.reduce((s,x,i)=>s+x*b[i],0)/(len(a)*len(b)))))*180/Math.PI;
const report=[];
for(let i=0;i<versions.length;i++){
 const {revision,action}=versions[i];await writeFile(root+`/authoring/history/step-punch-high-kick/revision-${revision}.json`,JSON.stringify({action},null,2));
 const prev=versions[i-1]?.action;const trackID=t=>`${t.target}:${t.property}`;
 const diffs=prev? action.tracks.filter(t=>JSON.stringify(t)!==JSON.stringify(prev.tracks.find(p=>trackID(p)===trackID(t)))).map(trackID):[];
 studio.state.actions[action.id]={revision,action,reference:action,history:[]};
 const measurements=[];
 if(revision>=3)for(const time of [1.33,1.42,1.48,1.68]){
  const d=await studio.call('get_diagnostics',{actionId:action.id,time});const j=Object.fromEntries(d.joints.map(n=>[n.name,n.worldPosition]));
  const thigh=sub(j.calf_l,j.thigh_l),shin=sub(j.foot_l,j.calf_l),toe=sub(j.ball_l,j.foot_l);
  measurements.push({time,kneeBendDeg:+angle(thigh,shin).toFixed(2),toeToShinDeg:+angle(shin,toe).toFixed(2),leftAnkleHeightM:+j.foot_l[1].toFixed(3),headBehindPelvisM:+(j.pelvis[2]-j.Head[2]).toFixed(3)});
 }
 report.push({revision,name:action.name,duration:action.phases.reduce((s,p)=>s+p.duration,0),trackCount:action.tracks.length,changedTracks:diffs,measurements});
}
await writeFile(root+'/authoring/history/step-punch-high-kick/audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.map(r=>({...r,changedTracks:r.changedTracks.length})),null,2));
