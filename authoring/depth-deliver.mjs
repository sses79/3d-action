// Delivery of a depth package to a project folder (docs/DEPTH_SERVICE_PLAN.md, step 3), in the form that worked for the V.8 lift:
// the package's files under references/package-vN/, TASK-vN.md (keyframe images to make, in order, each with its references and
// prompt; one at a time, each approved before the next), upload-steps-vN.md, generation-prompt-vN.txt in the fight test's format
// ([STYLE] [ANCHORS] [SHOTS] [SOUND] [LIMITS], @Video1 / @ImageN) and handover-vN.json. A second delivery to the same folder writes
// -v2 files beside the first and says what changed (delivery.json keeps each version's files and hashes). Source frames are copied
// for the keyframe step only, and the upload steps say they never go to the video model.
import {readFileSync,writeFileSync,existsSync,mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import {resolve,relative,basename,isAbsolute,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex').slice(0,16);
const lines=a=>a.filter(x=>x!==null&&x!==undefined&&x!==false).join('\n');
export async function deliver({lib,castFn:castTool,pkg:id,to,cast,style='',scene='',sheets={},sound,rights,people:peopleCount}){
 const P=lib.pack(id);if(!P)throw Error('package: a built package');if(typeof to!=='string'||!isAbsolute(to))throw Error('to: an absolute folder path (the project folder to deliver into)');
 if(!cast||typeof cast!=='object'||!Object.keys(cast).length)throw Error('cast: {person in the package (its tinted name): "Name: description"}');
 const unknown=Object.keys(cast).filter(n=>!P.people.some(p=>p.name===n));if(unknown.length)throw Error('cast: unknown people '+unknown.join(', ')+'; this package has '+P.people.map(p=>`${p.name} (${p.color})`).join(', '));
 if(sheets&&(typeof sheets!=='object'||Object.values(sheets).some(f=>typeof f!=='string')))throw Error('sheets: {character name: path to their sheet} (absolute, or relative to the folder)');
 mkdirSync(to,{recursive:true});const man=resolve(to,'delivery.json'),M=existsSync(man)?JSON.parse(readFileSync(man,'utf8')):{versions:[]},v=M.versions.length+1,V=`-v${v}`;
 const src=resolve(lib.packs,id),pkgDir=resolve(to,'references',`package${V}`);mkdirSync(pkgDir,{recursive:true});
 const files=['package.json',P.depth,'check.jpg','check.json',...P.keyframes.flatMap(k=>[k.depthStill,k.sourceStill,k.contactStill])].filter(f=>f&&existsSync(resolve(src,f)));for(const f of files)copyFileSync(resolve(src,f),resolve(pkgDir,f));
 const lead=P.derivedFrom?.lead;if(lead?.image&&existsSync(lead.image))copyFileSync(lead.image,resolve(pkgDir,'first-frame'+(lead.image.match(/\.[a-z]+$/i)?.[0]??'.png')));
 const firstFrame=lead?.image?`references/package${V}/first-frame${lead.image.match(/\.[a-z]+$/i)?.[0]??'.png'}`:null;
 const h=await castTool({clip:id,cast,style,scene});writeFileSync(resolve(to,`handover${V}.json`),JSON.stringify(h,null,1));
 const rel=f=>{const r=relative(to,f);return (r.match(/\.\.\//g)??[]).length>2?f:r;},  // outside the project tree: the absolute path
 inPkg=f=>`references/package${V}/${basename(f)}`;
 const name=n=>(cast[n]??'').split(/[:,(]/)[0].trim()||n,said=x=>P.people.reduce((t,p)=>t.replace(new RegExp(`\\bthe ${p.color} figure\\b`,'gi'),name(p.name)).replace(new RegExp(`\\b${p.name}\\b`,p.name.length>1?'gi':'g'),name(p.name)),String(x??''));
 const sheetPath=f=>isAbsolute(f)?rel(f):f,sheetList=Object.entries(sheets??{}).map(([n,f])=>({name:n,path:sheetPath(f)}));
 const K=h.keyframeGeneration??[],made=K.filter(k=>!k.given),keyId=k=>`K${k.index}`,keyFile=k=>`references/keyframes/${keyId(k)}-v1.png`;
 // TASK: keyframe images, in order
 const refLine=(r,k)=>{const f=String(r.file??'');if(/keyframe-\d+\.png \(yours\)/.test(f)){const p=K.find(x=>x.index===k.previous?.index);return `\`${p?.given?firstFrame:keyFile(p)}\` (${p?.given?'the first frame, given':`the approved ${keyId(p)}`}): ${r.role.replace(/^keyframe \d+[^:]*: /,'')}`;}
  if(f==='yours')return sheetList.length?sheetList.map(s=>`\`${s.path}\` (${s.name}'s sheet)`).join(', '):'your character sheets';if(isAbsolute(f)&&existsSync(f))return `\`${basename(f).startsWith('key-')?inPkg(f):firstFrame&&f===lead?.image?firstFrame:rel(f)}\`: ${r.role}`;return `${f}: ${r.role}`;};
 const changes=(()=>{const last=M.versions[M.versions.length-1];if(!last)return null;const ch=[];if(last.package!==id)ch.push(`package ${last.package} → ${id}`);if(last.revision!==lib.rev(id))ch.push(`revision ${last.revision} → ${lib.rev(id)}`);
  for(const f of files){const a=last.files?.[f],b=sha(resolve(src,f));if(a!==b)ch.push(a?`${f} changed`:`${f} added`);}for(const f of Object.keys(last.files??{}))if(!files.includes(f))ch.push(`${f} removed`);
  const lp=last.prompts??{};K.forEach(k=>{if(lp[k.index]!==undefined&&lp[k.index]!==sha256s(k.prompt))ch.push(`${keyId(k)} prompt changed`);});return ch.length?ch:['nothing in the package changed'];})();
 const task=lines([`# Keyframe images — ${P.name??id} (v${v})`,'',
  `For the image generator. Delivered by the codex-3d depth service on ${new Date().toISOString().slice(0,10)} from the package \`${id}\` (revision ${lib.rev(id)}). Files are in \`references/package${V}/\`.`,
  changes?`\nChanges since v${v-1}: ${changes.join('; ')}.`:null,rights?`\nRights: ${rights}.`:null,'',
  '## How to work: one image at a time','',`1. Make ${made[0]?keyId(made[0]):'the first keyframe'} only, save it, and stop for review.`,'2. Only an approved image becomes the continuity reference for the next keyframe. A rejected image is never a reference.','3. Then the next, in the order below.','',
  '## Rules for every image','','1. 16:9, the same crop and camera as the keyframe\'s depth still. Do not widen the shot.','2. Who is where comes from the depth still; who touches what from the contact card first, then the source frame.',
  '3. Every visible hand must connect plausibly to its owner\'s arm; preserve the reference crop and natural occlusion; do not reveal off-screen arms or bodies to prove ownership.','4. A shot that shows one person shows only that person: the action continues off-screen.',
  '5. The source frame is a layout reference only: take no face, hair, costume or likeness from it, and none of its props or actions that the beat does not name. Faces and costumes come from the sheets.','6. Each image shows its own moment only.',style?`7. Style: ${style}.`:null,'',
  sheetList.length?'## Character sheets\n\n'+sheetList.map(s=>`- ${s.name}: \`${s.path}\``).join('\n')+'\n':null,
  '## Keyframes','',...K.flatMap(k=>k.given?[`### ${keyId(k)} — ${k.time} s: given`,'',`The first frame: \`${firstFrame}\` (the previous take's last frame). Nothing to make.`,'']:[
   `### ${keyId(k)} — ${k.time} s`,'',k.beat?`Beat ${k.beat.n} of ${k.beat.of}: ${said(`${k.beat.actor} ${k.beat.verb} ${k.beat.target??''}`).trim()}${k.beat.contact?`; contact: ${said(k.beat.contact)}`:''}.`:'','','References, in this order:','',...k.references.map((r,i)=>`${i+1}. ${refLine(r,k)}`),'','Prompt:','','```text',k.prompt,'```','',`Save as \`${keyFile(k)}\`.`,'']),
  '## When done (each image)','','Save the one image, list the file and anything you could not follow, and stop for review. Do not start the video.']);
 writeFileSync(resolve(to,`TASK${V}.md`),task+'\n');
 // upload steps and the generation prompt
 const images=[...sheetList.map(s=>({what:`${s.name}'s sheet`,file:s.path})),...(firstFrame?[{what:'the first frame (the previous take\'s last frame)',file:firstFrame,first:true}]:[]),...made.map(k=>({what:`${keyId(k)}, ${k.time} s`,file:keyFile(k),key:k}))];
 const at=x=>`@Image${images.indexOf(x)+1}`,D=Math.round(P.duration);
 const upload=lines([`# Upload steps — ${P.name??id} (v${v})`,'',`Settings: **${D} s**, 16:9, reference-video mode, ${sound?'sound as the prompt says':'sound effects on, no speech or music'}.`,'','| Order | Mention | File |','| --- | --- | --- |',`| 1 | \`@Video1\` | \`references/package${V}/${P.depth}\` |`,
  ...images.map((x,i)=>`| ${i+2} | \`@Image${i+1}\` | \`${x.file}\`: ${x.what} |`),'',firstFrame?'If the generator has a first-frame slot, put the first frame there as well.\n':null,
  `Paste [generation-prompt${V}.txt](generation-prompt${V}.txt). If the generator labels uploads differently, change only the labels.`,'',
  `Do **not** upload any \`key-N-source.jpg\`, \`key-N-depth.jpg\`, \`key-N-contact.jpg\`, \`check.jpg\` or \`package.json\`: the source frames are layout references for the keyframe step only, never for the video model.`,'',
  `When the take comes back, review it against the package: \`review_depth_result {package: "${id}", video, verdict}\`.`]);
 writeFileSync(resolve(to,`upload-steps${V}.md`),upload+'\n');
 const tint=P.people.filter(p=>cast[p.name]).map(p=>{const s=sheetList.find(s=>s.name.toLowerCase()===name(p.name).toLowerCase());return `${p.color}=${name(p.name)}${s?' '+at(images.find(x=>x.file===s.path)):''}`;}).join(',');
 const beatAt=t=>(P.beats??[]).find(b=>b.start-1e-3<=t&&t<b.end+1e-3),fmt=x=>+x.toFixed(2);
 const cap=x=>x.charAt(0).toUpperCase()+x.slice(1);
 const shotLines=P.shots.map((s,i)=>{const b=beatAt((s.start+s.end)/2),first=i===0&&firstFrame&&P.shots[0].end<=(lead?.seconds??0)+.01;if(first)return `${fmt(s.start)}-${fmt(s.end)}s: As ${at(images.find(x=>x.first))}, held.`;
  return `${fmt(s.start)}-${fmt(s.end)}s: ${cap(said(s.camera).replace(/\s*\(.*\)\s*$/,''))}.${b?' '+cap(said(`${b.actor} ${b.verb} ${b.target??''}`).trim())+(b.contact?`; contact: ${said(b.contact)}`:'')+(b.change?`; ${said(b.change)}`:'')+'.':''}`.replace(/\.\./g,'.');});
 const n=P.people.filter(p=>cast[p.name]).length;
 const prompt=lines(['[STYLE]',`${D}s,16:9${style?','+style:''}.`,'[ANCHORS]',`@Video1 is a depth map giving camera,cuts,positions,movement only. Tints only say who is who:${tint}. No reference colours or flat shapes.`,
  firstFrame?`${at(images.find(x=>x.first))} is the first frame: start exactly on it.`:null,made.length?`Keyframes:${made.map(k=>`${fmt(k.time)}s ${at(images.find(x=>x.key===k))}`).join(',')}. Video=camera/timing;keyframes give poses and contact.`:null,
  '[SHOTS] hard cuts as in the video',...shotLines,'[SOUND]',sound||'Natural sound effects only. No speech or music.','[LIMITS]',`${n===1?'One person':`${peopleCount??n} people`} only. No mannequins,tint-coloured costumes,depth shading,halos,captions or extra cuts.`]);
 writeFileSync(resolve(to,`generation-prompt${V}.txt`),prompt+'\n');
 const out={version:v,at:new Date().toISOString(),package:id,revision:lib.rev(id),folder:to,files:Object.fromEntries(files.map(f=>[f,sha(resolve(src,f))])),prompts:Object.fromEntries(K.map(k=>[k.index,sha256s(k.prompt)])),
  written:[`TASK${V}.md`,`upload-steps${V}.md`,`generation-prompt${V}.txt`,`handover${V}.json`,`references/package${V}/`],changes};
 M.versions.push(out);writeFileSync(man,JSON.stringify(M,null,1));lib.recordDelivery?.(id,out);  // the library keeps where each package went
 return {...out,keyframesToMake:made.map(k=>({id:keyId(k),time:k.time,save:keyFile(k)})),task:resolve(to,`TASK${V}.md`),upload:resolve(to,`upload-steps${V}.md`),prompt:resolve(to,`generation-prompt${V}.txt`)};}
const sha256s=s=>createHash('sha256').update(String(s)).digest('hex').slice(0,16);
