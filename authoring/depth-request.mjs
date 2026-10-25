// One call from footage to a depth package (docs/DEPTH_SERVICE_PLAN.md, step 2): make_depth_reference runs the library's steps in
// order as a job, records each step's outcome in .authoring/depth-library/requests/<id>.json, and stops with needs_input when a
// person must decide (a fault in the check, who plays whom, a hand the detector cannot see). The caller answers with the existing
// tools (fix_depth_clip, set_contact_marks, set_depth_beats) or with answers, then calls make_depth_reference {request} to carry on:
// finished steps are not run again. The drafts a person used to write in a session (description, who plays whom, beats) come from a
// vision model (authoring/render/depth-draft.py) and are stored with its name.
import {readFileSync,writeFileSync,existsSync,mkdirSync,createReadStream,renameSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {depthLabels} from './depth-library.mjs';
const FAULT=/^(missing|unexpected|two colours|wrong hand colour)/;
const STEPS=['source','window','build','check-build','describe','cast','beats','lead','cut','keys','contact','check-final','handover'];
const page=(src,id)=>`http://127.0.0.1:5174/editor/depth.html?source=${src}&package=${id}`;
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,28)||'video';
export class DepthRequests{
 // lib: the DepthLibrary; cast(args): cast_depth_clip through the service (the hand-over is written in TypeScript)
 constructor(lib,cast){this.lib=lib;this.castTool=cast;this.dir=resolve(lib.base,'requests');}
 file(id){return resolve(this.dir,id+'.json');}
 read(id){if(typeof id!=='string'||!/^req-[a-z0-9]{4,40}$/.test(id))throw Error('request: a request ID (req-…)');if(!existsSync(this.file(id)))throw Error('No such request: '+id);return JSON.parse(readFileSync(this.file(id),'utf8'));}
 save(R){mkdirSync(this.dir,{recursive:true});R.updatedAt=new Date().toISOString();const t=this.file(R.id)+'.tmp';writeFileSync(t,JSON.stringify(R,null,1));renameSync(t,this.file(R.id));return R;}
 // start a request, or carry one on (request) with answers, or redo from a step (redo)
 start(a){let R;
  if(a.request){R=this.read(a.request);if(a.answers!==undefined){if(!a.answers||typeof a.answers!=='object'||Array.isArray(a.answers))throw Error('answers: an object, e.g. {"cast": {"Macbeth": "A"}, "check-build": "accept"}');R.answers={...R.answers,...a.answers};}
   if(a.redo!==undefined){const i=STEPS.indexOf(a.redo);if(i<0)throw Error('redo: one of '+STEPS.join(', '));for(const s of STEPS.slice(i))delete R.steps[s];}}
  else{const req=['video','scene','cast','duration'];for(const k of req)if(a[k]===undefined)throw Error(`${k}: needed to start a request (${req.join(', ')}; or request to carry one on)`);
   if(typeof a.video!=='string'||!existsSync(a.video))throw Error('video: a readable local video file');if(typeof a.scene!=='string'||a.scene.length<5||a.scene.length>2000)throw Error('scene: one or a few lines of what happens');
   if(!a.cast||typeof a.cast!=='object'||!Object.keys(a.cast).length||Object.keys(a.cast).length>6||Object.values(a.cast).some(v=>typeof v!=='string'||v.length>600))throw Error('cast: {character: description} for the scene\'s people (up to 6; descriptions up to 600 characters)');
   if(!Number.isInteger(a.duration)||a.duration<2||a.duration>15)throw Error('duration: the take\'s length in whole seconds, 2-15');
   if(a.window!==undefined&&!(a.window&&Number.isFinite(a.window.start)&&Number.isFinite(a.window.end)&&a.window.end>a.window.start))throw Error('window: {start, end} in seconds of the video');
   if(a.beats!==undefined&&(!Array.isArray(a.beats)||!a.beats.length||a.beats.some(b=>!b||typeof b.actor!=='string'||typeof b.verb!=='string')))throw Error('beats: [{actor, verb, target?, contact?, change?, from?, to?}] with actor/target from the cast');
   if(a.id!==undefined&&(typeof a.id!=='string'||!/^[a-z0-9][a-z0-9-]{2,47}$/.test(a.id)||this.lib.pack(a.id)))throw Error('id: a new package ID (lower case, digits, dashes; not one already built)');
   if(a.lead!==undefined&&!(a.lead&&typeof a.lead.image==='string'&&existsSync(a.lead.image)&&(a.lead.seconds===undefined||(a.lead.seconds>=.2&&a.lead.seconds<=1.5))&&(a.lead.boxes===undefined||(a.lead.boxes&&typeof a.lead.boxes==='object'))))throw Error('lead: {image (the previous take\'s last frame, a local file), seconds? (0.2-1.5, default 0.5), boxes? {character: [[x0, y0, x1, y1], ...] as fractions}}');
   R={id:'req-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),createdAt:new Date().toISOString(),args:{video:a.video,window:a.window??null,scene:a.scene,cast:a.cast,style:a.style??'',duration:a.duration,beats:a.beats??null,people:a.people??null,id:a.id??null,lead:a.lead??null,deliverTo:a.deliverTo??null},steps:{},answers:{},status:'queued'};}
  R.status='queued';this.save(R);
  const job=this.lib.store.enqueue('depth-request',{request:R.id},(j,log,step)=>this.run(R.id,log,step));
  R.job=job.id;this.save(R);return {request:R.id,job:job.id,status:job.status,file:this.file(R.id),note:'Poll get_depth_job; when it says needs_input, answer and call make_depth_reference {request} again.'};}
 async run(id,log,step){const R=this.read(id);R.status='running';this.save(R);
  try{for(const s of STEPS){if(R.steps[s]?.done)continue;step(s);log(`· ${s}\n`);const out=await this[s.replace(/-(.)/g,(_,c)=>c.toUpperCase())](R,log);
    if(out?.ask){R.status='needs_input';R.questions=out.ask;this.save(R);return {needsInput:true,request:R.id,step:s,questions:out.ask};}
    R.steps[s]={done:true,at:new Date().toISOString(),...out};R.questions=[];this.save(R);}
   R.status='done';this.save(R);const H=R.steps.handover;return {request:R.id,package:H.package,page:H.page,revision:H.revision,handover:H.handover};}
  catch(e){R.status='failed';R.error=String(e?.message??e).slice(-1500);this.save(R);throw e;}}
 py(args,log,timeout=1800000){return new Promise((ok,fail)=>{const p=spawn(this.lib.py,args,{cwd:this.lib.root});let out='',err='';const t=setTimeout(()=>p.kill('SIGTERM'),timeout);
  p.stdout.on('data',b=>{out+=b;log?.(b.toString());});p.stderr.on('data',b=>{err+=b;log?.(b.toString());});p.on('close',code=>{clearTimeout(t);code===0?ok(out):fail(Error(`${basename(args[0])}: ${(err||out).slice(-1200)}`));});});}
 json(out,open='{'){const i=out.lastIndexOf('\n'+open)>=0?out.lastIndexOf('\n'+open)+1:out.indexOf(open);try{return JSON.parse(out.slice(i).trim());}catch{const j=out.indexOf(open);return JSON.parse(out.slice(j,out.lastIndexOf(open==='{'?'}':']')+1));}}
 src(R){return this.lib.sources().find(S=>S.id===R.steps.source.source);}
 // 1. the source: one already ingested with the same SHA-256, or ingested now
 async source(R,log){const sha=await new Promise((ok,fail)=>{const h=createHash('sha256');createReadStream(R.args.video).on('data',d=>h.update(d)).on('end',()=>ok(h.digest('hex'))).on('error',fail);});
  const S=this.lib.sources().find(s=>s.sha256===sha);if(S)return {source:S.id,reused:true};
  let id='src-'+slug(basename(R.args.video).replace(/\.[^.]+$/,''));for(let n=2;this.lib.sources().some(s=>s.id===id);n++)id=id.replace(/-\d+$/,'')+'-'+n;
  await this.py(['authoring/render/depth-ingest.py',R.args.video,'--id',id,'--name',basename(R.args.video).slice(0,120)],log);return {source:id,ingested:true};}
 // 2. the window: the caller's, the whole video when it is short, or a question; a clip of the source for exactly that span
 async window(R){const S=this.src(R);let w=R.answers.window??R.args.window;
  if(!w){if(S.duration<=15.5)w={start:0,end:S.duration};else return {ask:[{id:'window',question:`The video is ${S.duration.toFixed(1)} s; which part (up to 15 s) holds the action?`,answer:'answers {"window": {"start": s, "end": s}}',suggestions:S.clips.filter(c=>c.kind==='control').slice(0,12).map(c=>({start:c.start,end:c.end,why:c.why,summary:c.description?.summary??null}))}]};}
  if(!(w.start>=0&&w.end<=S.duration+.05&&w.end-w.start>=1&&w.end-w.start<=15.05))return {ask:[{id:'window',question:`The window ${w.start}-${w.end} s does not fit: inside 0-${S.duration.toFixed(1)} s, 1-15 s long.`,answer:'answers {"window": {"start": s, "end": s}}'}]};
  if(R.answers.build!=='fresh'){const cover=this.lib.packsOf(S).map(p=>({...p,P:this.lib.pack(p.id)})).filter(p=>p.P&&!p.P.derivedFrom&&p.P.depth&&p.start<=w.start+.05&&p.end>=w.end-.05).map(p=>({...p,stars:this.lib.stars(p.id,null)?.stars??0,rated:!this.lib.stars(p.id,null)?.suggested})).sort((a,b)=>(b.rated-a.rated)||(b.stars-a.stars)||((a.end-a.start)-(b.end-b.start)));
   if(cover.length)return {package:cover[0].id,offset:+(w.start-cover[0].start).toFixed(3),start:w.start,end:w.end,covered:true,stars:cover[0].stars};}  // a built package of this source covering the window (fixed by hand, rated): cut from it, as the V.8 lift was made
  let C=S.clips.find(c=>c.kind==='control'&&Math.abs(c.start-w.start)<.1&&Math.abs(c.end-w.end)<.1);
  if(!C){let n=1;while(S.clips.some(c=>c.id===`${S.id}-req${n}`))n++;C={id:`${S.id}-req${n}`,kind:'control',shots:S.shots.filter(s=>s.end>w.start+.05&&s.start<w.end-.05).map(s=>s.index),start:+w.start.toFixed(3),end:+w.end.toFixed(3),seconds:+(w.end-w.start).toFixed(3),why:['asked for by a request ('+R.id+')'],status:'proposed',described:false};S.clips.push(C);this.lib.save(S);}
  return {clip:C.id,start:C.start,end:C.end};}
 // 3. the build: depth, people per shot, tint, keyframes (depth-build.py), unless the clip is built already
 async build(R,log){if(R.steps.window.covered)return {package:R.steps.window.package,offset:R.steps.window.offset,reused:true,covering:true};const {S,C}=this.lib.locate(R.steps.window.clip);if(C.package&&this.lib.pack(C.package))return {package:C.package,reused:true};
  await this.py(['authoring/render/depth-build.py',S.id,C.id,...(R.args.people?['--people',String(R.args.people)]:[])],log);const C2=this.lib.locate(C.id).C;if(!C2.package)throw Error('the build made no package');this.lib.bump(C2.package);return {package:C2.package};}
 // 4 and 11. the check (depth-check.py): faults stop the request until fixed or accepted
 async check(R,log,phase){const S=this.src(R),pk=phase==='build'?R.steps.build.package:R.steps.cut.package;
  if(phase==='build'&&R.steps.window.covered)return {skipped:'a built package covering the window: checked at the end, on the cut'};
  await this.py(['authoring/render/depth-check.py',S.id,phase==='build'?R.steps.window.clip:'package:'+pk],log,600000);const c=this.lib.check(pk);
  const faults=(c?.keyframes??[]).flatMap(k=>k.issues.filter(i=>FAULT.test(i)).map(i=>`${k.time} s: ${i}`)),notes=(c?.keyframes??[]).flatMap(k=>k.issues.filter(i=>!FAULT.test(i)).map(i=>`${k.time} s: ${i}`));
  if(faults.length&&R.answers['check-'+phase]!=='accept')return {ask:[{id:'check-'+phase,question:`The check found ${faults.length} fault(s) in the tinted depth.`,faults,page:page(S.id,pk),sheet:resolve(this.lib.packs,pk,'check.jpg'),answer:phase==='build'?`fix people with fix_depth_clip {clip: "${R.steps.window.clip}"} or on the page, then carry on; or answers {"check-build": "accept"}`:`fix with set_contact_marks or set_depth_beats, then carry on; or answers {"check-final": "accept"}`}]};
  return {faults,notes};}
 checkBuild(R,log){return this.check(R,log,'build');}
 checkFinal(R,log){return this.check(R,log,'final');}
 stills(pk){const P=this.lib.pack(pk),d=resolve(this.lib.packs,pk);return P.keyframes.map(k=>({time:k.time,source:resolve(d,k.sourceStill),depth:resolve(d,k.depthStill)}));}
 async draft(mode,R,input,log){const d=resolve(this.dir,R.id);mkdirSync(d,{recursive:true});const i=resolve(d,mode+'-in.json'),o=resolve(d,mode+'-out.json');writeFileSync(i,JSON.stringify(input,null,1));
  await this.py(['authoring/render/depth-draft.py',mode,i,o],log,600000);return JSON.parse(readFileSync(o,'utf8'));}
 // 5. the description (a draft by the model unless the clip is described already)
 async describe(R,log){if(R.steps.window.covered)return {reused:true,by:'the covering package'};const {C}=this.lib.locate(R.steps.window.clip);if(C.described&&C.description)return {by:C.description.by,reused:true};const pk=R.steps.build.package,P=this.lib.pack(pk);
  const d=await this.draft('describe',R,{people:P.people.map(p=>({name:p.name,color:p.color})),shots:P.shots,keyframes:this.stills(pk),labels:depthLabels},log);
  await this.lib.describe({clip:C.id,summary:d.summary.slice(0,1200),labels:d.labels,people:d.people,peopleCount:d.peopleCount,shots:d.shots,keyframes:d.keyframes,by:d.by});return {by:d.by,summary:d.summary};}
 // 6. who plays whom: the caller's answer, the package's own names, or the model's draft when it is sure
 async cast(R,log){const pk=R.steps.build.package,P=this.lib.pack(pk),names=P.people.map(p=>p.name),chars=Object.keys(R.args.cast);
  let map=R.answers.cast??(chars.every(c=>names.includes(c))?Object.fromEntries(chars.map(c=>[c,c])):null),draft=null;
  if(!map){const C=R.steps.window.covered?null:this.lib.locate(R.steps.window.clip).C;draft=await this.draft('cast',R,{people:P.people.map(p=>({name:p.name,color:p.color})),described:C?.description?.people??Object.fromEntries(P.people.map(p=>[p.name,p.represents])),scene:R.args.scene,cast:R.args.cast,keyframes:this.stills(pk)},log);
   const used=Object.values(draft.cast).filter(v=>v!=='none');if(draft.confidence==='high'&&new Set(used).size===used.length&&used.length===Math.min(chars.length,names.length))map=draft.cast;}
  const bad=map&&Object.entries(map).find(([c,p])=>!chars.includes(c)||(p!=='none'&&!names.includes(p)));
  if(!map||bad)return {ask:[{id:'cast',question:'Who plays whom? '+P.people.map(p=>`${p.name} (${p.color}): ${p.represents}`).join('; '),characters:chars,draft:draft&&{cast:draft.cast,confidence:draft.confidence,why:draft.why},page:page(this.src(R).id,pk),answer:'answers {"cast": {"'+chars[0]+'": "'+names[0]+'", ...}} (a tinted name, or "none")'}]};
  const castOf={},cast={};for(const [c,p] of Object.entries(map))if(p!=='none'){castOf[p]=c;const d=R.args.cast[c];cast[p]=d.toLowerCase().startsWith(c.toLowerCase())?d:`${c}: ${d}`;}
  return {castOf,cast,by:R.answers.cast?'the caller':draft?draft.by:'names'};}
 // 7. the beats, in seconds of the built clip: the caller's (characters mapped to tinted names) or the model's draft
 async beats(R,log){const pk=R.steps.build.package,P0=this.lib.pack(pk),off=R.steps.build.offset??0,wl=R.steps.window.end-R.steps.window.start,P={...P0,duration:R.steps.window.covered?wl:P0.duration,shots:R.steps.window.covered?P0.shots.filter(x=>x.end>off+.05&&x.start<off+wl-.05).map(x=>({...x,start:+Math.max(0,x.start-off).toFixed(3),end:+Math.min(wl,x.end-off).toFixed(3)})):P0.shots},{castOf}=R.steps.cast,toName=Object.fromEntries(Object.entries(castOf).map(([p,c])=>[c,p])),max=Math.max(1,Math.floor(R.args.duration/1.5)),aim=Math.max(1,Math.floor(R.args.duration/2));  // the rule allows a beat a 1.5 s; the planner gives whole seconds, so drafts aim at 2 s or more a beat
  const given=(R.answers.beats??R.args.beats)?.map(b=>({...b,actor:toName[b.actor]??b.actor,target:b.target===undefined?undefined:toName[b.target]??b.target}));
  let summary=R.answers.summary??null,beats=null,by='the caller';
  if(given&&given.every(b=>Number.isFinite(b.from)&&Number.isFinite(b.to)))beats=given;
  else{const C=R.steps.window.covered?null:this.lib.locate(R.steps.window.clip).C;const d=await this.draft('beats',R,{scene:R.args.scene,summary:C?.description?.summary??P0.summary??(P0.notes??[]).find(n=>n.startsWith('Described:'))?.slice(11)??'',shots:P.shots,people:P.people.map(p=>({name:p.name,color:p.color})),castOf,seconds:P.duration,duration:R.args.duration,maxBeats:aim,given:given??null,keyframes:this.stills(pk)},log);beats=d.beats;summary??=d.summary;by=d.by;}
  const names=P.people.map(p=>p.name),bad=[],low=t=>typeof t==='string'?t.trim().replace(/[.\s]+$/,'').replace(/^(They|He|She|It|The|His|Her|Their|Both)\b/,w=>w.toLowerCase()):t;  // the model's contact and change are joined into sentences
  beats=beats.map(b=>({...b,contact:low(b.contact),change:low(b.change),from:Math.max(0,+b.from),to:Math.min(P.duration,+b.to)})).sort((a,b)=>a.from-b.from);
  beats.forEach((b,i)=>{if(!names.includes(b.actor)||(b.target&&!names.includes(b.target)))bad.push(`beat ${i+1}: actor and target must be tinted people (${names.join(', ')})`);if(!(b.to>b.from))bad.push(`beat ${i+1}: to after from`);});
  if(beats.length>max)bad.push(`${beats.length} beats for ${R.args.duration} s: at most ${max}`);
  if(bad.length)return {ask:[{id:'beats',question:'The beats do not fit.',problems:bad,draft:beats,answer:'answers {"beats": [{actor, verb, target, contact, change, from, to}]} (characters or tinted names; seconds of the clip)'}]};
  summary??=R.args.scene.slice(0,280);return {summary:summary.slice(0,300),beats,by};}
 // 7b. a lead (step 2e): the take continues a previous one, opening on its last frame held a moment; the frame's tinted depth
 // (depth-lead.py), people from the caller's boxes or the detector when it leaves no doubt, else a question with what it found
 async lead(R,log){const L=R.args.lead;if(!L)return {none:true};const pk=R.steps.build.package,P=this.lib.pack(pk),{castOf}=R.steps.cast,toName=Object.fromEntries(Object.entries(castOf).map(([p,c])=>[c,p]));
  const given=R.answers.lead??L.boxes??{},boxes=Object.fromEntries(Object.entries(given).map(([k,v])=>[toName[k]??k,v])),people=P.people.filter(p=>castOf[p.name]||boxes[p.name]).map(p=>({name:p.name,color:p.color,...(boxes[p.name]?{boxes:boxes[p.name]}:{})}));
  const d=resolve(this.dir,R.id);mkdirSync(d,{recursive:true});const pj=resolve(d,'lead-people.json'),out=resolve(d,'lead-depth.png');writeFileSync(pj,JSON.stringify(people));
  const r=await new Promise((ok,fail)=>{const p=spawn(this.lib.py,['authoring/render/depth-lead.py',L.image,out,'--people',pj],{cwd:this.lib.root});let so='',se='';p.stdout.on('data',b=>so+=b);p.stderr.on('data',b=>{se+=b;log(b.toString());});p.on('close',c=>c===0||c===3?ok({code:c,out:so}):fail(Error('depth-lead.py: '+(se||so).slice(-1200))));});
  const j=this.json(r.out);if(r.code===3)return {ask:[{id:'lead',question:`The lead image needs a box for each person: the detector found ${j.detected.length} where the scene has ${people.length} (${people.map(p=>`${castOf[p.name]??p.name} (${p.color})`).join(', ')}).`,detected:j.detected,image:L.image,answer:'answers {"lead": {"'+(castOf[people[0]?.name]??'Name')+'": [[x0, y0, x1, y1], ...], ...}} as fractions of the picture; several boxes for one person (an arm reaching in) are fine'}]};
  return {image:L.image,depth:out,seconds:L.seconds??.5,shares:j.people,boxes:j.boxes};}
 // 8. the request's own package, cut from the clip's to the take's length (the cut planner: beats on whole seconds, 1.0-1.2x)
 async cut(R){const pk=R.steps.build.package,P=this.lib.pack(pk),D=R.args.duration,{summary,beats}=R.steps.beats,off=R.steps.build.offset??0,wl=R.steps.window.covered?R.steps.window.end-R.steps.window.start:P.duration;
  if(wl<(D-(R.args.lead?(R.args.lead.seconds??.5):0))*.85-.05)return {ask:[{id:'window-short',question:`The window is ${wl.toFixed(1)} s for a ${D} s take: it would play slower than 0.85x.`,answer:'redo from "window" with a longer window (answers {"window": …}, redo: "window") or start again with a shorter duration'}]};
  let id=R.ownPackage??R.args.id??`${pk.slice(0,36)}-${D}s`;if(!R.ownPackage)for(let n=2;this.lib.pack(id);n++)id=(R.args.id??`${pk.slice(0,36)}-${D}s`)+'-'+n;R.ownPackage=id;this.save(R);  // the request's own package: a redo remakes it
  const Ld=R.steps.lead?.none?null:R.steps.lead,r=await this.lib.planCut({id,name:`${P.name??pk} · ${D} s (${R.id})`,from:pk,duration:D,summary,...(Ld?{lead:{seconds:Ld.seconds,image:Ld.image,depth:Ld.depth}}:{}),beats:beats.map(b=>({actor:b.actor,verb:String(b.verb).slice(0,120),...(b.target?{target:b.target}:{}),...(b.contact?{contact:b.contact}:{}),...(b.change?{change:b.change}:{}),from:+(b.from+off).toFixed(3),to:+(b.to+off).toFixed(3),...(Number.isFinite(b.peak)?{peak:+(b.peak+off).toFixed(3)}:{})}))});
  if(!this.lib.pack(id))throw Error('the cut planner made no package');const warn=r.plan?.warnings??[],short=warn.filter(w=>/gets 1 s|too slow/.test(w));
  if(short.length&&R.answers.cut!=='accept')return {ask:[{id:'cut',question:`At ${D} s some beats would not read: too short, or slower than 0.85x.`,problems:short,beats:beats.map(b=>`${b.actor} ${b.verb} ${b.target??''} (${b.from}-${b.to} s)`),answer:'fewer beats: answers {"beats": [...]} with redo: "beats"; or a longer duration (start again); or answers {"cut": "accept"}'}]};
  return {package:id,warnings:warn};}
 // 9. keyframes: one per shot opening and late beat peaks (depth-pick-keys.py), with the contact cards
 async keys(R){const r=await this.lib.pickKeys({package:R.steps.cut.package});return {keyframes:r.keyframes,warnings:r.warnings??[]};}
 // 10. contacts the detector cannot see: a keyframe whose beat has a contact, with a beat person in the shot and no hand on its card
 async contact(R,log){const pk=R.steps.cut.package,P=this.lib.pack(pk),rep=this.json(await this.py(['authoring/render/depth-contact-card.py',pk],log,600000),'[');
  const beatAt=t=>(P.beats??[]).find(b=>b.start-1e-3<=t&&t<b.end+1e-3),want=[];
  rep.forEach((c,i)=>{const k=P.keyframes[i],b=beatAt(k.time);if(!b?.contact||c.hands.length||R.answers.contact==='skip'||R.answers['contact-'+(i+1)]==='skip')return;const L=k.layout??{};if(!(L[b.actor]||L[b.target]))return;
   want.push({keyframe:i+1,time:k.time,shot:P.shots.find(s=>s.index===k.shot)?.camera??'',contact:b.contact,card:resolve(this.lib.packs,pk,k.contactStill??`key-${i+1}-contact.jpg`),source:resolve(this.lib.packs,pk,k.sourceStill)});});
  if(want.length)return {ask:[{id:'contact',question:`${want.length} keyframe(s) need the hands marked: the detector sees no hand on the contact the beat names.`,keyframes:want,page:page(this.src(R).id,pk),answer:`mark them with set_contact_marks {package: "${pk}", keyframe, marks: [{owner, hand, target, part, from: [x, y], to: [x, y]}]} (fractions of the picture) or "Mark a hand" on the page, then carry on; or answers {"contact-N": "skip"} / {"contact": "skip"}`}]};
  return {marked:rep.filter(c=>c.hands.length).map(c=>c.keyframe)};}
 // 12. the hand-over: prompts, keyframe references and the video settings (cast_depth_clip), with the caller's cast and style
 async handover(R){const pk=R.steps.cut.package,h=await this.castTool({clip:pk,cast:R.steps.cast.cast,style:R.args.style,scene:R.args.scene});
  return {package:pk,page:page(this.src(R).id,pk),revision:this.lib.rev(pk),handover:{videoGeneration:h.videoGeneration,keyframeGeneration:h.keyframeGeneration,generateKeyframesInOrder:h.generateKeyframesInOrder,stars:h.stars,check:h.check,files:h.files}};}
}
