// MCP stdio adapter. The local service owns persistence and browser updates.
import {createInterface} from 'node:readline';
const base=process.env.STUDIO_URL||'http://127.0.0.1:5174';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Use a loopback Studio URL');
async function request(path,body){const r=await fetch(base+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await r.json();if(!r.ok)throw Error(data.error||'Studio unavailable');return data;}
let initialized=false;
async function handle(m){
 if(m.jsonrpc!=='2.0')return {jsonrpc:'2.0',id:m.id??null,error:{code:-32600,message:'Invalid request'}};
 if(m.id===undefined){if(m.method==='notifications/initialized')initialized=true;return;}
 try{
  let result;
  if(m.method==='initialize'){const version=['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(m.params?.protocolVersion)?m.params.protocolVersion:'2025-06-18';result={protocolVersion:version,capabilities:{tools:{}},serverInfo:{name:'animation-studio',version:'0.1.0'},instructions:'For prompt-to-action work, call begin_action_run first. MCP calls are then timed automatically. Use append_action_run_event for LLM decisions and browser checks, and finish_action_run at completion or failure. Read get_capabilities before authoring. Viewer updates live; writes persist with revision history.'};}
  else if(m.method==='ping')result={};
  else if(!initialized)throw Error('Initialize the MCP session first');
  else if(m.method==='tools/list')result={tools:await request('/api/tools')};
  else if(m.method==='tools/call'){try{const {result:data}=await request('/api/tool',{name:m.params.name,arguments:m.params.arguments||{}});result={content:[{type:'text',text:JSON.stringify(data)}],isError:data?.valid===false};}catch(e){result={content:[{type:'text',text:e.message}],isError:true};}}
  else return {jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Method not found'}};
  return {jsonrpc:'2.0',id:m.id,result};
 }catch(e){return {jsonrpc:'2.0',id:m.id,error:{code:-32603,message:e.message}};}
}
let chain=Promise.resolve();createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{chain=chain.then(async()=>{try{const answer=await handle(JSON.parse(line));if(answer)process.stdout.write(JSON.stringify(answer)+'\n');}catch(e){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');}});});
