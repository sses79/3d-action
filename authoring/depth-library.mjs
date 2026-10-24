// The depth shot library for the service (docs/DEPTH_LIBRARY_PLAN.md, step 4): reading sources and clips under
// .authoring/depth-library, ranking clips for a scene beat, storing descriptions, and running ingest, build and fix as jobs.
// The heavy work is the Python scripts in authoring/render; this module only starts them and reads what they write.
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {JobStore,withLock} from './jobs.mjs';

export const depthLabels={
 camera:['still','pan','push in','pull out','follow','track round','handheld','low angle','high angle','cut sequence'],
 action:['walk','enter','exit','approach','turn away','sit','stand up','grab','strike','fall','lift','hand over','embrace','crowd moves','fight','talk','look','kneel','run'],
 people:['1','2','3-5','crowd'],
 size:['close','medium','wide'],
 setting:['interior','exterior','hall','courtyard','chamber','stairs','street','field','sept','throne room'],
 light:['day','night','candle','dark','bright'],
 mood:['tense','grief','menace','calm','violent','tender','formal'],
 content:['shows a killing','blood','none of concern'],
};
const allLabels=new Set(Object.values(depthLabels).flat());
const ID=/^[a-z0-9][a-z0-9-]{0,63}$/;
// fixes to a built clip: per shot renames ({"2": {"E": "A", "G": "-"}}) and boxes drawn by hand
// ([{name: "B", shot: "28", keys: [{time, box: [x0, y0, x1, y1] as fractions, or null for out of view}]}])
export function checkFixes(shots,boxes){const name=x=>typeof x==='string'&&/^[A-Z]$/.test(x),frac=v=>Number.isFinite(v)&&v>=-.05&&v<=1.05;
 if(!shots||typeof shots!=='object'||Array.isArray(shots)||!Object.entries(shots).every(([k,m])=>/^\d{1,4}$/.test(k)&&m&&typeof m==='object'&&Object.entries(m).every(([a,b])=>name(a)&&(name(b)||b==='-'))))throw Error('shots: {"2": {"E": "A", "G": "-"}}');
 if(!Array.isArray(boxes)||boxes.length>40||!boxes.every(e=>e&&name(e.name)&&/^\d{1,4}$/.test(String(e.shot))&&Array.isArray(e.keys)&&e.keys.length>=1&&e.keys.length<=60&&e.keys.every(q=>Number.isFinite(q.time)&&q.time>=0&&(q.box===null||Array.isArray(q.box)&&q.box.length===4&&q.box.every(frac)&&q.box[2]>q.box[0]&&q.box[3]>q.box[1]))))throw Error('boxes: [{name: "B", shot: "28", keys: [{time: 1.2, box: [x0, y0, x1, y1]}]}], box as fractions of the picture');}
// The star standard for a built package as a control signal (docs/DEPTH_LIBRARY_PLAN.md, "Star standard"). A person's rating
// wins; otherwise the machine suggests 1-4 from the keyframe check and the motion: faults (a main person missing, two colours on
// one person, a colour with nobody behind it) cost stars; notes (an untinted extra, a head a little short, a box drawn by hand)
// do not: both 5-star references have them and generated well. Only a person gives 5.
export const starStandard={5:'Reference: judged excellent by a person, best after a generation that followed it (cuts, positions, movement); strong motion or a complex moving camera',4:'Strong: no faults at the keyframes, clear camera or body motion; not yet proven in a generation',3:'Usable: one fault away from the main action, or little motion (a still camera with people placed), or not checked',2:'Weak: faults on the main people; fix before use',1:'Not usable: identities wrong across cuts, depth broken, or content that cannot be used'};
const FAULT=/^(missing|unexpected|two colours|wrong hand colour)/;  // 'missing subject' (the largest person untinted) is a fault too
export function suggestStars(check,why){const notes=[];if(!check)return {stars:3,suggested:true,why:['not checked']};
 const all=check.keyframes.flatMap(k=>k.issues.map(i=>`${k.time} s: ${i}`)),faults=all.filter(i=>FAULT.test(i.replace(/^[\d.]+ s: /,'')));let stars=faults.length===0?4:faults.length===1?3:2;
 if(faults.length)notes.push(`${faults.length} fault(s): `+faults.slice(0,3).join('; '));if(all.length>faults.length)notes.push(`${all.length-faults.length} note(s) (untinted extras, short heads, hand boxes) do not count`);
 const moving=(why??[]).some(w=>/camera moves|someone moves|bridged/.test(w));if(why&&!moving&&stars>3){stars=3;notes.push('little motion: a still camera with people placed');}
 return {stars,suggested:true,why:notes.length?notes:['no faults at the keyframes']};}
export class DepthLibrary{
 constructor(root){this.root=root;this.base=resolve(root,'.authoring/depth-library');this.packs=resolve(root,'.authoring/video-clay');this.store=JobStore.at(process.env.STUDIO_JOBS_DIR||resolve(root,'.authoring/jobs'));this.py=resolve(root,'.authoring/vision-venv/bin/python');}
 // the package's beats and one-line summary (docs/DEPTH_REFERENCE_IMPROVEMENT_PLAN.md, "Beats first"): stored in the package and
 // in its spec (so a repack keeps them), checked against the beat rule
 _setBeats({package:id,summary,beats},rule){if(typeof id!=='string'||!ID.test(id))throw Error('package: a package ID');const f=resolve(this.packs,id,'package.json');if(!existsSync(f))throw Error('No such package: '+id);
  if(typeof summary!=='string'||summary.length<5||summary.length>300)throw Error('summary: one line, the beats in order ("A grabs B, locks B\'s throat, lifts B into the air")');
  if(!Array.isArray(beats)||!beats.length||beats.length>8)throw Error('beats: 1-8 of {actor, verb, target?, contact?, change?, start, end}');
  const P=JSON.parse(readFileSync(f,'utf8')),names=P.people.map(p=>p.name);
  const clean=beats.map((b,i)=>{if(!b||typeof b.actor!=='string'||typeof b.verb!=='string'||!Number.isFinite(b.start)||!Number.isFinite(b.end)||b.end<=b.start)throw Error(`beat ${i+1}: actor, verb, start and end (seconds, end after start)`);if(b.start<-.01||b.end>P.duration+.05)throw Error(`beat ${i+1}: inside 0-${P.duration} s`);
   for(const k of ['actor','target'])if(b[k]!==undefined&&!names.includes(b[k]))throw Error(`beat ${i+1}: ${k} must be one of the package's people (${names.join(', ')})`);
   const o={actor:b.actor,verb:String(b.verb).slice(0,120),start:+(+b.start).toFixed(3),end:+(+b.end).toFixed(3)};if(b.peak!==undefined){if(!Number.isFinite(b.peak)||b.peak<b.start||b.peak>b.end)throw Error(`beat ${i+1}: peak inside the beat`);o.peak=+(+b.peak).toFixed(3);}for(const k of ['target','contact','change','avoid'])if(b[k])o[k]=String(b[k]).slice(0,200);return o;}).sort((a,b)=>a.start-b.start);
  const check=rule(P.duration,clean);P.summary=summary;P.beats=clean;P.beatCheck=check;writeFileSync(f,JSON.stringify(P,null,1));
  for(const spec of [resolve(this.packs,id+'-spec.json'),...this.sources().map(S=>resolve(this.base,S.id,id+'.spec.json'))])if(existsSync(spec)){const sp=JSON.parse(readFileSync(spec,'utf8'));sp.summary=summary;sp.beats=clean;writeFileSync(spec,JSON.stringify(sp,null,1));}
  return {package:id,summary,beats:clean,check};}
 // the cast and style a package's prompts use by default (the page and cast_depth_clip without a cast): kept when a take made from them worked
 _setCast(id,cast,style){const f=resolve(this.packs,id,'package.json');if(!existsSync(f))throw Error('No such package: '+id);const P=JSON.parse(readFileSync(f,'utf8'));
  P.cast={...(P.cast??{}),...cast};if(typeof style==='string'&&style.trim())P.style=style.trim();writeFileSync(f,JSON.stringify(P,null,1));
  for(const spec of [resolve(this.packs,id+'-spec.json'),...this.sources().map(S=>resolve(this.base,S.id,id+'.spec.json'))])if(existsSync(spec)){const sp=JSON.parse(readFileSync(spec,'utf8'));sp.cast=P.cast;sp.style=P.style;writeFileSync(spec,JSON.stringify(sp,null,1));}
  return {cast:P.cast,style:P.style??''};}
 // where a package stands: current (the one to use), replaced (by another), stopped (given up), test; one line why
 statusFile(){return resolve(this.base,'package-status.json');}
 statuses(){try{return JSON.parse(readFileSync(this.statusFile(),'utf8'));}catch{return {};}}
 statusOf(id){return this.statuses()[id]??null;}
 setStatus({package:id,status,note,replacedBy}){if(typeof id!=='string'||!ID.test(id)||!this.pack(id))throw Error('package: a built package');if(!['current','replaced','stopped','test'].includes(status))throw Error('status: current, replaced, stopped or test');
  if(replacedBy!==undefined&&(status!=='replaced'||!this.pack(replacedBy)))throw Error('replacedBy: the built package that replaces it (with status replaced)');if(note!==undefined&&(typeof note!=='string'||note.length>300))throw Error('note: one line, up to 300 characters');
  const all=this.statuses();all[id]={status,...(note?{note}:{}),...(replacedBy?{replacedBy}:{}),at:new Date().toISOString()};writeFileSync(this.statusFile(),JSON.stringify(all,null,1));return {package:id,...all[id]};}
 // the results generated from a package and reviewed against it (review_depth_result), newest first
 reviews(id){const d=resolve(this.packs,id,'reviews');if(!existsSync(d))return [];return readdirSync(d).filter(l=>/^[a-z0-9][a-z0-9-]{0,39}$/.test(l)&&existsSync(resolve(d,l,'review.json'))).map(l=>({label:l,...JSON.parse(readFileSync(resolve(d,l,'review.json'),'utf8'))})).sort((a,b)=>String(b.reviewed).localeCompare(String(a.reviewed)));}
 // the cut planner (depth-plan-cut.py): beats with the source span showing each, and a whole-second duration -> a new package
 _planCut(args){const {id,name,from,duration,summary,beats,dry=false}=args;if(typeof id!=='string'||!ID.test(id)||id.length>48)throw Error('id: a new package ID');if(!this.pack(from))throw Error('from: a built package to cut from');if(!Number.isInteger(duration)||duration<2||duration>15)throw Error('duration: whole seconds, 2-15');
  if(!Array.isArray(beats)||!beats.length||beats.some(b=>!b||typeof b.actor!=='string'||typeof b.verb!=='string'||!Number.isFinite(b.from)||!Number.isFinite(b.to)||b.to<=b.from))throw Error('beats: [{actor, verb, target?, contact?, change?, from, to}] with from/to the source span in the package');
  const f=resolve(this.base,`plan-${id}.json`);writeFileSync(f,JSON.stringify({id,name:name??id,from,duration,summary:summary??'',beats}));
  return new Promise((done,fail)=>execFile(this.py,['authoring/render/depth-plan-cut.py',f,...(dry?['--dry']:[])],{cwd:this.root,timeout:300000},(e,so,se)=>{if(e)return fail(Error((se||e.message).slice(-1500)));const i=so.indexOf('{\n');let plan=null;try{plan=JSON.parse(so.slice(i,so.lastIndexOf('\n}')+2));}catch{}done({package:dry?null:id,dry,plan,page:dry?null:'http://127.0.0.1:5174/editor/depth.html?package='+id});}));}
 // the keyframe picker (depth-pick-keys.py): one keyframe per beat at the moment it reads best, written into the package
 _pickKeys({package:id,dry=false}){if(typeof id!=='string'||!ID.test(id)||!this.pack(id))throw Error('package: a built package');
  return new Promise((done,fail)=>execFile(this.py,['authoring/render/depth-pick-keys.py',id,...(dry?['--dry']:[])],{cwd:this.root,timeout:300000},(e,so,se)=>{if(e)return fail(Error((se||e.message).slice(-1500)));let r=null;try{r=JSON.parse(so.slice(so.indexOf('{'),so.lastIndexOf('}')+1));}catch{}done({...r,dry});}));}
 // hand marks for a keyframe's contact card, placed by hand (the detector misses armour and arms from below); remakes the cards
 _setMarks({package:id,keyframe,marks}){const P=this.pack(id);if(!P)throw Error('package: a built package');const k=P.keyframes[keyframe-1];if(!k)throw Error(`keyframe: 1-${P.keyframes.length}`);
  const names=P.people.map(p=>p.name),fr=v=>Array.isArray(v)&&v.length===2&&v.every(x=>Number.isFinite(x)&&x>=0&&x<=1);
  if(!Array.isArray(marks)||marks.length>8||!marks.every(m=>m&&names.includes(m.owner)&&names.includes(m.target)&&['left','right'].includes(m.hand)&&typeof m.part==='string'&&m.part.length<=40&&fr(m.from)&&fr(m.to)))throw Error(`marks: [{owner, hand: left|right, target, part ("throat"), from: [x, y], to: [x, y]}] with owner and target from ${names.join(', ')}, points as fractions of the picture`);
  const f=resolve(this.packs,id,'package.json');k.marks=marks.map(m=>({owner:m.owner,hand:m.hand,target:m.target,part:m.part,from:m.from.map(x=>+x.toFixed(4)),to:m.to.map(x=>+x.toFixed(4))}));writeFileSync(f,JSON.stringify(P,null,1));
  const spec=resolve(this.packs,id+'-spec.json');if(existsSync(spec)){const sp=JSON.parse(readFileSync(spec,'utf8'));const a=sp.keyframes?.find(x=>Math.abs(x.time-k.time)<.01);if(a){a.marks=k.marks;writeFileSync(spec,JSON.stringify(sp,null,1));}}
  return new Promise((done,fail)=>execFile(this.py,['authoring/render/depth-contact-card.py',id],{cwd:this.root,timeout:300000},(e,so,se)=>{if(e)return fail(Error((se||e.message).slice(-1500)));let r=null;try{r=JSON.parse(so.slice(so.indexOf('['),so.lastIndexOf(']')+1));}catch{}done({package:id,keyframe,marks:k.marks,cards:r});}));}
 // a generated result against its package (depth-review-result.py): length, cuts, motion per beat, a sheet at each keyframe
 reviewResult({package:id,video,label,verdict,note}){if(verdict!==undefined&&!['used','good','retake','rejected'].includes(verdict))throw Error('verdict: used, good, retake or rejected');if(note!==undefined&&(typeof note!=='string'||note.length>600))throw Error('note: up to 600 characters');if(!this.pack(id))throw Error('package: a built package');if(typeof video!=='string'||!existsSync(video))throw Error('video: the generated result, a local file');if(label!==undefined&&!/^[a-z0-9][a-z0-9-]{0,39}$/.test(label))throw Error('label: lower-case letters, digits and dashes');
  return new Promise((done,fail)=>execFile(this.py,['authoring/render/depth-review-result.py',id,video,...(label?['--label',label]:[])],{cwd:this.root,timeout:300000},(e,so,se)=>{if(e)return fail(Error((se||e.message).slice(-1500)));let r;try{r=JSON.parse(so.slice(so.indexOf('{'),so.lastIndexOf('}')+1));}catch{return fail(Error('no report'));}if(verdict||note){Object.assign(r,verdict?{verdict}:{},note?{note}:{});const f=resolve(this.packs,id,'reviews',r.label??label??'',  'review.json');if(existsSync(f)){const j=JSON.parse(readFileSync(f,'utf8'));Object.assign(j,verdict?{verdict}:{},note?{note}:{});writeFileSync(f,JSON.stringify(j,null,1));}}done(r);}));}
 ratingsFile(){return resolve(this.base,'ratings.json');}
 ratings(){try{return JSON.parse(readFileSync(this.ratingsFile(),'utf8'));}catch{return {};}}
 stars(pkgId,why){const r=this.ratings()[pkgId];if(r)return {...r,suggested:false};return suggestStars(this.check(pkgId),why);}
 rate({package:id,stars,why,proven,by}){if(typeof id!=='string'||!ID.test(id)||!existsSync(resolve(this.packs,id,'package.json')))throw Error('package: a built package ID (a clip ID once built, or a package built by hand)');if(!Number.isInteger(stars)||stars<1||stars>5)throw Error('stars: 1-5 ('+Object.entries(starStandard).map(([k,v])=>k+' = '+v).join('; ')+')');if(typeof why!=='string'||why.length<5||why.length>800)throw Error('why: what the rating rests on (5-800 characters)');
  const all=this.ratings();all[id]={stars,why,proven:proven??null,by:by??'a person',at:new Date().toISOString()};writeFileSync(this.ratingsFile(),JSON.stringify(all,null,1));return {package:id,...all[id]};}
 packsOf(S){if(!existsSync(this.packs))return [];return readdirSync(this.packs).filter(d=>ID.test(d)).map(d=>{const P=this.pack(d);return P&&(P.derivedFrom?.sourceVideo??P.sourceVideo)===S.fileName?{id:d,start:P.start,end:P.start+P.duration,name:P.name}:null;}).filter(Boolean);}
 sources(){if(!existsSync(this.base))return [];return readdirSync(this.base).filter(d=>ID.test(d)&&existsSync(resolve(this.base,d,'source.json'))).map(d=>JSON.parse(readFileSync(resolve(this.base,d,'source.json'),'utf8')));}
 save(S){writeFileSync(resolve(this.base,S.id,'source.json'),JSON.stringify(S,null,1));}
 locate(clip){if(typeof clip!=='string'||!ID.test(clip))throw Error('clip: a library clip ID such as got-standoff-023');for(const S of this.sources()){const C=S.clips.find(c=>c.id===clip);if(C)return {S,C};}throw Error('No such clip: '+clip);}
 pack(id){const f=resolve(this.packs,id,'package.json');return existsSync(f)?JSON.parse(readFileSync(f,'utf8')):null;}
 controlOf(C){if(C.kind!=='control')return 'off';if(C.controlOverride)return C.controlOverride.control;return C.needsControl===false?'off':'on';}
 setControl({clip,control,why,by}){const {S,C}=this.locate(clip);if(C.kind!=='control')throw Error('A still shot has no control video to switch');if(!['on','off','measured'].includes(control))throw Error('control: on, off, or measured (drop the override)');if(control!=='measured'&&(typeof why!=='string'||why.length<5))throw Error('why: what the decision rests on');
  if(control==='measured')delete C.controlOverride;else C.controlOverride={control,why,by:by??'a person',at:new Date().toISOString()};this.save(S);return {clip:C.id,control:this.controlOf(C),measured:C.needsControl===false?'off':'on',override:C.controlOverride??null};}
 summary(S,C){const shots=S.shots.filter(s=>C.shots.includes(s.index)),d=C.description,refs=this.packsOf(S).filter(p=>p.id!==C.package&&Math.min(p.end,C.end)-Math.max(p.start,C.start)>=.5*Math.min(C.seconds,p.end-p.start)).map(p=>({package:p.id,name:p.name,start:p.start,end:p.end,...this.stars(p.id,C.why)}));const own=C.package?this.stars(C.package,C.why):null,best=[own&&{package:C.package,...own},...refs].filter(Boolean).sort((a,b)=>b.stars-a.stars)[0]??null;return {needsControl:this.controlOf(C)==='on',controlWhy:C.controlOverride?`${C.controlOverride.control} by ${C.controlOverride.by}: ${C.controlOverride.why}`:C.kind==='control'?(C.needsControl===false?'measured: the camera and people move too little to need control':'measured: '+(C.measuredWhy??C.why).join(', ')):'still shot',stars:best?.stars??null,starsSuggested:best?.suggested??null,bestPackage:best?.package??null,ownStars:own,referencePackages:refs,clip:C.id,source:S.id,sourceName:S.name,kind:C.kind,start:C.start,end:C.end,seconds:C.seconds,shots:C.shots.length,control:C.kind==='control',measured:C.why,speech:shots.some(s=>s.speechWindows.length),built:!!C.package,described:!!d,summary:d?.summary??null,labels:d?.labels??[],people:d?.people??null};}
 list(f={}){const out=[];for(const S of this.sources()){if(f.source&&S.id!==f.source)continue;for(const C of S.clips){if(f.kind&&C.kind!==f.kind)continue;if(f.built!==undefined&&!!C.package!==f.built)continue;if(f.described!==undefined&&!!C.description!==f.described)continue;if(f.labels?.length&&!f.labels.every(l=>C.description?.labels?.includes(l)))continue;out.push(this.summary(S,C));}}return out;}
 check(id){const f=resolve(this.packs,id,'check.json');return existsSync(f)?JSON.parse(readFileSync(f,'utf8')):null;}
 get(clip){const {S,C}=this.locate(clip);const shots=S.shots.filter(s=>C.shots.includes(s.index)).map(({thumb,...s})=>({...s,thumb:`/api/depth-library-file?source=${S.id}&file=${thumb}`}));const P=C.package?this.pack(C.package):null;
  return {...this.summary(S,C),description:C.description??null,shotsMeasured:shots,sourceFile:S.fileName,build:C.built??null,fixed:C.fixed??null,package:P?{id:C.package,revision:this.rev(C.package),people:P.people,keyframes:P.keyframes.map(k=>({time:k.time,shot:k.shot,summary:k.summary,people:k.people})),files:this.files(C.package,P),check:this.check(C.package)}:null,page:`http://127.0.0.1:5174/editor/depth.html?source=${S.id}&clip=${C.id}`};}
 files(id,P){const dir=resolve(this.packs,id),url=f=>`http://127.0.0.1:5174/api/video-clay-file?id=${id}&file=${f}`;return {folder:dir,referenceVideo:P.depth?{path:resolve(dir,P.depth),url:url(P.depth)}:P.clay?{path:resolve(dir,P.clay),url:url(P.clay)}:null,keyframes:P.keyframes.map((k,i)=>({index:i+1,time:k.time,composition:{path:resolve(dir,k.depthStill??k.clayStill),url:url(k.depthStill??k.clayStill)},source:{path:resolve(dir,k.sourceStill),note:'a frame of the original footage: a layout reference for generating this keyframe (room, framing, camera angle, light); replace every person, take no likeness; not for the video model'}}))};}
 // a beat's words against a clip's labels (three points each), its summary and keyframe text (one point a word), the people
 // count and the length; clips not yet described are left out unless asked for (descriptions come from Claude in a session)
 find({beat,labels=[],people,maxSeconds,control='any',includeUndescribed=false,limit=8,minStars}){
  if(typeof beat!=='string'||!beat.trim())throw Error('beat: the scene beat in words');const stop=new Set('a an the and or of to in on at by with his her their its is are was he she they it as from into for this that then who'.split(' '));
  const words=[...new Set(beat.toLowerCase().match(/[a-z]+/g)??[])].filter(w=>w.length>2&&!stop.has(w)),stem=w=>w.replace(/(ing|ed|es|s)$/,'');const out=[];
  for(const S of this.sources())for(const C of S.clips){
   if(!C.description&&!includeUndescribed)continue;const eff=this.controlOf(C);if(control==='on'&&eff!=='on'||control==='off'&&eff!=='off')continue;if(maxSeconds&&C.seconds>maxSeconds+1e-6)continue;
   const d=C.description??{},text=[d.summary??'',...(d.keyframes??[]).map(k=>k.summary),...Object.values(d.people??{}),C.why.join(' ')].join(' ').toLowerCase(),tw=new Set((text.match(/[a-z]+/g)??[]).map(stem)),lab=d.labels??[];
   const why=[];let score=0;for(const l of labels)if(lab.includes(l)){score+=3;why.push('label '+l);}
   for(const l of lab)if(!labels.includes(l)&&l.split(' ').every(p=>words.map(stem).includes(stem(p)))){score+=2;why.push('beat says '+l);}
   const hit=words.filter(w=>tw.has(stem(w)));score+=hit.length;if(hit.length)why.push('words: '+hit.join(', '));
   if(people){const n=d.peopleCount??null;if(n!==null&&Math.abs(n-people)<=0)score+=2;}
   const sm=this.summary(S,C);if(minStars&&!(sm.stars>=minStars))continue;if(score>0){if(sm.stars){score+=(sm.stars-3)*.5;why.push(`${sm.stars} stars${sm.starsSuggested?' (suggested)':''}${sm.bestPackage&&sm.bestPackage!==C.package?' via '+sm.bestPackage:''}`);}out.push({...sm,score:Math.round(score*10)/10,why});}}
  return out.sort((a,b)=>b.score-a.score||a.seconds-b.seconds).slice(0,limit);}
 _describe(args){const {S,C}=this.locate(args.clip);if(typeof args.summary!=='string'||args.summary.length<10||args.summary.length>1200)throw Error('summary: two or three sentences (10-1200 characters)');
  const labels=args.labels??[];if(!Array.isArray(labels)||!labels.length||labels.some(l=>!allLabels.has(l)))throw Error('labels: one or more of '+JSON.stringify(depthLabels));
  const d={summary:args.summary,labels,people:args.people??{},peopleCount:args.peopleCount??null,shots:args.shots??{},keyframes:args.keyframes??[],by:args.by??'Claude in a session',at:new Date().toISOString()};C.description=d;C.described=true;this.save(S);
  let repacked=false;if(C.package){const spec=resolve(this.base,S.id,C.id+'.spec.json');if(existsSync(spec)){const P=JSON.parse(readFileSync(spec,'utf8'));
   P.scene=null;P.people=P.people.map(p=>({...p,represents:d.people[p.name]??p.represents}));P.shots=P.shots.map(s=>({...s,camera:d.shots[s.index]??s.camera}));
   P.keyframes=P.keyframes.map(k=>{const w=d.keyframes.find(x=>Math.abs(x.time-k.time)<.05);return w?{...k,summary:w.summary??k.summary,people:k.people.map(p=>({...p,doing:w.people?.[p.name]??p.doing}))}:k;});
   P.notes=[...(P.notes??[]).filter(n=>!n.startsWith('Described:')),'Described: '+d.summary];writeFileSync(spec,JSON.stringify(P,null,1));
   return new Promise((done,fail)=>execFile(this.py,['authoring/render/video-clay-pack.py',spec],{cwd:this.root,timeout:120000},e=>e?fail(e):done({clip:C.id,described:true,repacked:true})));}}
  return {clip:C.id,described:true,repacked};}
 // long work runs in the service's job queue (jobs.mjs): kept on disk, one at a time, its log's last lines and its result readable by ID
 job(kind,argv,meta={},onDone){const j=this.store.enqueue(kind,meta,(j,log)=>new Promise((ok,fail)=>{const p=spawn(this.py,argv,{cwd:this.root});const add=b=>log(b.toString());p.stdout.on('data',add);p.stderr.on('data',add);
  p.on('close',code=>{if(code!==0)return fail(Error(String(j.log).slice(-1500)));let r=null;try{r=JSON.parse(String(j.log).trim().split('\n').filter(l=>l.startsWith('{')).pop());}catch{}Promise.resolve(onDone?.(r)).then(x=>ok(x??r),fail);});}));return {job:j.id,status:j.status};}
 ingest({video,id,name}){if(typeof video!=='string'||!existsSync(video))throw Error('video: a readable local video file');if(typeof id!=='string'||!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))throw Error('id: lower-case letters, digits and dashes');return this.job('ingest',['authoring/render/depth-ingest.py',video,'--id',id,...(name?['--name',String(name).slice(0,120)]:[])]);}
 build({clip,video}){const {S,C}=this.locate(clip);if(C.kind!=='control')throw Error('A still shot has no depth to build');const pid=C.package??C.id;if(arguments[0].expectedRevision!==undefined)this.checkRev(pid,arguments[0].expectedRevision);const job=this.job('build',['authoring/render/depth-build.py',S.id,C.id,...(video?['--video',video]:[])],{package:pid},r=>({...r,revision:this.bump(pid)}));return {...job,revision:this.rev(pid)};}
 _fix({clip,shots={},boxes=[]}){const {S,C}=this.locate(clip);if(!C.package)throw Error('Build the clip first');checkFixes(shots,boxes);
  writeFileSync(resolve(this.base,S.id,C.id+'.fixes.json'),JSON.stringify({shots,boxes}));return new Promise((done,fail)=>execFile(this.py,['authoring/render/depth-fix.py',S.id,C.id],{cwd:this.root,timeout:300000},(e,so,se)=>e?fail(Error((se||e.message).slice(-1500))):done(JSON.parse(so.trim().split('\n').pop()))));}
 jobStatus(id){return this.store.status(id);}
 // revisions of packages (docs/DEPTH_SERVICE_PLAN.md, step 1): every write through the service adds one; a write given
 // expectedRevision refuses a package that has moved on, so two agents cannot overwrite each other's work; writes to one package
 // also take its lock (jobs.mjs withLock), across the service's processes
 revFile(){return resolve(this.base,'package-revisions.json');}
 revs(){try{return JSON.parse(readFileSync(this.revFile(),'utf8'));}catch{return {};}}
 rev(id){return this.revs()[id]??(this.pack(id)?1:0);}
 bump(id){const all=this.revs();all[id]=(all[id]??(this.pack(id)?1:0))+1;writeFileSync(this.revFile(),JSON.stringify(all,null,1));return all[id];}
 checkRev(id,expected){if(expected===undefined)return;if(!Number.isInteger(expected))throw Error('expectedRevision: an integer, the revision you read');const now=this.rev(id);if(now!==expected)throw Error(`stale: package ${id} is at revision ${now}, not ${expected}; read it again (get_depth_clip or the page) and redo the change`);}
 async write(id,expected,fn){if(typeof id!=='string'||!ID.test(id))throw Error('package: a package ID');return withLock(resolve(this.packs,id),async()=>{this.checkRev(id,expected);const r=await fn();const n=this.bump(id);return r&&typeof r==='object'&&!Array.isArray(r)?{...r,revision:n}:{result:r,revision:n};});}
 setBeats(args,rule){return this.write(args.package,args.expectedRevision,()=>this._setBeats(args,rule));}
 setCast(id,cast,style,expected){return this.write(id,expected,()=>this._setCast(id,cast,style));}
 planCut(args){if(args.dry)return this._planCut(args);return this.write(args.id,undefined,()=>this._planCut(args));}
 pickKeys(args){if(args.dry)return this._pickKeys(args);return this.write(args.package,args.expectedRevision,()=>this._pickKeys(args));}
 setMarks(args){return this.write(args.package,args.expectedRevision,()=>this._setMarks(args));}
 describe(args){const {C}=this.locate(args.clip);if(!C.package)return this._describe(args);return this.write(C.package,args.expectedRevision,()=>this._describe(args));}
 fix(args){const {C}=this.locate(args.clip);if(!C.package)throw Error('Build the clip first');return this.write(C.package,args.expectedRevision,()=>this._fix(args));}
}
