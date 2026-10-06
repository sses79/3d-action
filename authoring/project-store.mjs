// Partitioned project storage. project.json is a small index; every action body (current, reference, history)
// is an immutable content-addressed file in project.json.blobs/. Saves write only new blobs plus the index.
import {readFileSync,writeFileSync,mkdirSync,renameSync,readdirSync,unlinkSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
export const STORAGE=2;
const sha=text=>createHash('sha256').update(text).digest('hex');
const atomic=(path,text)=>{const tmp=`${path}.${process.pid}.tmp`;writeFileSync(tmp,text);renameSync(tmp,path);};
const blobDir=path=>path+'.blobs';
const isRef=v=>v&&typeof v==='object'&&typeof v.$blob==='string'&&Object.keys(v).length===1;

// Returns {state,legacy}. A missing file throws ENOENT, as readFileSync does.
export function loadProject(path){
 const index=JSON.parse(readFileSync(path,'utf8'));
 if(index.storage===undefined)return {state:index,legacy:true};
 if(index.storage!==STORAGE)throw Error(`Unsupported project storage version ${index.storage}`);
 const dir=blobDir(path),texts=new Map();
 // Each reference is parsed separately, so action/reference/history never share one in-memory object.
 const body=ref=>{if(!isRef(ref)||!/^[0-9a-f]{64}$/.test(ref.$blob))throw Error('Invalid project blob reference');let text=texts.get(ref.$blob);if(text===undefined){try{text=readFileSync(join(dir,ref.$blob+'.json'),'utf8');}catch(e){throw Error(`Project blob ${ref.$blob} is unreadable: ${e.code||e.message}`);}if(sha(text)!==ref.$blob)throw Error(`Project blob ${ref.$blob} failed its checksum`);texts.set(ref.$blob,text);}return JSON.parse(text);};
 const {storage,...state}=index;
 for(const pair of Object.values(state.actions)){pair.action=body(pair.action);pair.reference=body(pair.reference);for(const h of pair.history)h.action=body(h.action);}
 return {state,legacy:false};
}

// known: Set of blob hashes already on disk (owned by the caller across saves). legacy: project.json is still a monolith.
export function saveProject(path,state,known=new Set(),legacy=false){
 const dir=blobDir(path),used=new Set();mkdirSync(dir,{recursive:true});
 if(!known.size)for(const f of readdirSync(dir))if(/^[0-9a-f]{64}\.json$/.test(f))known.add(f.slice(0,64));
 const ref=action=>{const text=JSON.stringify(action),hash=sha(text);if(!known.has(hash)){atomic(join(dir,hash+'.json'),text);known.add(hash);}used.add(hash);return {$blob:hash};};
 const actions={};
 for(const [id,pair] of Object.entries(state.actions))actions[id]={...pair,action:ref(pair.action),reference:ref(pair.reference),history:pair.history.map(h=>({...h,action:ref(h.action)}))};
 if(legacy&&existsSync(path)&&!existsSync(path+'.legacy.json'))copyFileSync(path,path+'.legacy.json');
 mkdirSync(dirname(path),{recursive:true});atomic(path,JSON.stringify({storage:STORAGE,...state,actions}));
 // Only after the index no longer points at them are unreferenced blobs removed.
 for(const hash of [...known])if(!used.has(hash)){try{unlinkSync(join(dir,hash+'.json'));}catch(e){if(e.code!=='ENOENT')throw e;}known.delete(hash);}
 return {blobs:used.size};
}
