// Small MCP client for terminal-based authoring and integration diagnostics.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const [name,file]=process.argv.slice(2);if(!name)throw Error('Usage: node authoring/call.mjs TOOL [arguments.json]');
const args=file?JSON.parse(await readFile(file,'utf8')):{};
const child=spawn(process.execPath,[fileURLToPath(new URL('./mcp.mjs',import.meta.url))],{stdio:['pipe','pipe','inherit']});
const waiters=new Map();let next=0;
createInterface({input:child.stdout}).on('line',line=>{const message=JSON.parse(line);waiters.get(message.id)?.(message);waiters.delete(message.id);});
function send(method,params){const id=++next;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('MCP request timed out')),15000);waiters.set(id,m=>{clearTimeout(timer);resolve(m);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
try{await send('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'studio-terminal',version:'1'}});child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');const reply=await send('tools/call',{name,arguments:args});if(reply.error)throw Error(reply.error.message);for(const c of reply.result.content||[])if(c.type==='text')console.log(c.text);if(reply.result.isError)process.exitCode=1;}finally{child.kill();}
