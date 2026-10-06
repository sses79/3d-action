import {request} from '../cli-lib.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.STUDIO_URL||'http://127.0.0.1:5174',out='authoring/benchmarks/motion-quality';await mkdir(out,{recursive:true});
const {result:library}=await request(base,'inspect_movement_library',{query:'sword-regular',limit:50});
const {result:actions}=await request(base,'list_actions',{});
const selected=[...library.items.map(m=>({id:m.id,revision:m.revision})),...actions.filter(a=>['sword-source-study','sword-joined-study','kick-study'].includes(a.id)).map(a=>({id:a.id,revision:a.revision}))];
const before=await request(base,'get_capabilities',{}),results=[];
for(const entry of selected){const args={actionId:entry.id,sourceRevision:entry.revision},file=out+'/'+entry.id+'.json';const reply=await request(base,'inspect_motion_quality',args);await writeFile(file,JSON.stringify(reply,null,2)+'\n');results.push({id:entry.id,revision:entry.revision,report:file,serviceMs:reply.result.elapsedMs,clientMs:reply.clientElapsedMs,sampledFrames:reply.result.sampledFrames,candidateContacts:reply.result.candidateContacts.length,seams:reply.result.seams.length,flags:reply.result.diagnostics.reduce((counts,f)=>(counts[f.code]=(counts[f.code]||0)+1,counts),{}),rootTravel:reply.result.travel.root,pelvisTravel:reply.result.travel.pelvis});}
const after=await request(base,'get_capabilities',{});if(before.result.projectSequence!==after.result.projectSequence)throw Error('Project sequence changed during read-only pilot');
const summary={at:new Date().toISOString(),projectSequence:after.result.projectSequence,results};await writeFile(out+'/summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
