// Read-only real-rig comparison. Requires the synced UAL2 library and running service.
import {request,output} from '../cli-lib.mjs';
const base=process.env.STUDIO_URL||'http://127.0.0.1:5174';
const {result:library}=await request(base,'inspect_movement_library',{query:'sword-regular',limit:20});
const revision=id=>library.items.find(m=>m.id===id).revision;
const results=[];
for(const suffix of ['a','b']){const movementA='move-ual2-sword-regular-'+suffix,movementB='move-ual2-sword-regular-combo',args={movementA,revisionA:revision(movementA),movementB,revisionB:revision(movementB)};const first=await request(base,'find_common_motion',args),warm=await request(base,'find_common_motion',args);results.push({arguments:args,firstClientMs:first.clientElapsedMs,warmClientMs:warm.clientElapsedMs,result:warm.result});}
await output({at:new Date().toISOString(),results},'authoring/benchmarks/common-motion.json',true);
console.log(JSON.stringify(results.map(r=>({source:r.arguments.movementA,firstClientMs:r.firstClientMs,warmClientMs:r.warmClientMs,match:r.result.matches[0]}))));
