// Prepare one advancing left step from the existing coordinated walk cycle.
import {writeFile} from 'node:fs/promises';
import {Studio} from '../core.js';
const studio=new Studio(process.cwd(),'/private/tmp/step-inspection-project.json');
const action={version:2,rig:'quaternius-ual1',id:'move-step-forward',name:'Advancing left step',phases:[{id:'stride',name:'Left step',intent:'Swing the left leg forward from the source walk cycle',duration:1.3333333333333333*.4,kind:'move',clip:'Walk_Loop',from:.6,to:1},{id:'plant',name:'Plant',intent:'Place the left foot and transfer support',duration:1.3333333333333333*.1,kind:'move',clip:'Walk_Loop',from:0,to:.1}],tracks:[],cues:[]};
studio.state.actions[action.id]={revision:1,action,reference:action,history:[]};
const track={target:'$root',property:'position',mode:'absolute',interpolation:'linear',keys:[]};let anchor,settled;let maximum=0;
for(let i=0;i<=40;i++){const time=i/60;const d=await studio.call('get_diagnostics',{actionId:action.id,time});const foot=d.joints.find(j=>j.name==='ball_r').worldPosition;if(!anchor)anchor=foot;const z=time<=action.phases[0].duration?anchor[2]-foot[2]:settled;settled=z;track.keys.push({time,value:[0,0,z]});maximum=Math.max(maximum,z);}
action.tracks=[track];
const metadata={source:'Quaternius UAL1 Walk_Loop · CC0 · cycle 0.6–1.0 then 0.0–0.1',support:'unknown',travel:'source',notes:'Left advancing step. Root travels approximately '+maximum.toFixed(2)+' m; right toe horizontal drift is compensated during stride, left foot lands at the end. No collision/controller movement.'};
await writeFile('authoring/source/step-forward.json',JSON.stringify({action,metadata,expectedRevision:0},null,2));console.log('Prepared step, travel',maximum);
