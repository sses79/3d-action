// The depth shot library for the service (docs/DEPTH_LIBRARY_PLAN.md, step 4): reading sources and clips under
// .authoring/depth-library, ranking clips for a scene beat, storing descriptions, and running ingest, build and fix as jobs.
// The heavy work is the Python scripts in authoring/render; this module only starts them and reads what they write.
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';

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
// ([{name: "B", shot: "28", keys: [{time, box: [x0, y0, x1, y1] as fractions}]}])
export function checkFixes(shots,boxes){const name=x=>typeof x==='string'&&/^[A-Z]$/.test(x),frac=v=>Number.isFinite(v)&&v>=-.05&&v<=1.05;
 if(!shots||typeof shots!=='object'||Array.isArray(shots)||!Object.entries(shots).every(([k,m])=>/^\d{1,4}$/.test(k)&&m&&typeof m==='object'&&Object.entries(m).every(([a,b])=>name(a)&&(name(b)||b==='-'))))throw Error('shots: {"2": {"E": "A", "G": "-"}}');
 if(!Array.isArray(boxes)||boxes.length>40||!boxes.every(e=>e&&name(e.name)&&/^\d{1,4}$/.test(String(e.shot))&&Array.isArray(e.keys)&&e.keys.length>=1&&e.keys.length<=60&&e.keys.every(q=>Number.isFinite(q.time)&&q.time>=0&&Array.isArray(q.box)&&q.box.length===4&&q.box.every(frac)&&q.box[2]>q.box[0]&&q.box[3]>q.box[1])))throw Error('boxes: [{name: "B", shot: "28", keys: [{time: 1.2, box: [x0, y0, x1, y1]}]}], box as fractions of the picture');}
export class DepthLibrary{
 constructor(root){this.root=root;this.base=resolve(root,'.authoring/depth-library');this.packs=resolve(root,'.authoring/video-clay');this.jobs=new Map();this.py=resolve(root,'.authoring/vision-venv/bin/python');}
 sources(){if(!existsSync(this.base))return [];return readdirSync(this.base).filter(d=>ID.test(d)&&existsSync(resolve(this.base,d,'source.json'))).map(d=>JSON.parse(readFileSync(resolve(this.base,d,'source.json'),'utf8')));}
 save(S){writeFileSync(resolve(this.base,S.id,'source.json'),JSON.stringify(S,null,1));}
 locate(clip){if(typeof clip!=='string'||!ID.test(clip))throw Error('clip: a library clip ID such as got-standoff-023');for(const S of this.sources()){const C=S.clips.find(c=>c.id===clip);if(C)return {S,C};}throw Error('No such clip: '+clip);}
 pack(id){const f=resolve(this.packs,id,'package.json');return existsSync(f)?JSON.parse(readFileSync(f,'utf8')):null;}
 summary(S,C){const shots=S.shots.filter(s=>C.shots.includes(s.index)),d=C.description;return {clip:C.id,source:S.id,sourceName:S.name,kind:C.kind,start:C.start,end:C.end,seconds:C.seconds,shots:C.shots.length,control:C.kind==='control',measured:C.why,speech:shots.some(s=>s.speechWindows.length),built:!!C.package,described:!!d,summary:d?.summary??null,labels:d?.labels??[],people:d?.people??null};}
 list(f={}){const out=[];for(const S of this.sources()){if(f.source&&S.id!==f.source)continue;for(const C of S.clips){if(f.kind&&C.kind!==f.kind)continue;if(f.built!==undefined&&!!C.package!==f.built)continue;if(f.described!==undefined&&!!C.description!==f.described)continue;if(f.labels?.length&&!f.labels.every(l=>C.description?.labels?.includes(l)))continue;out.push(this.summary(S,C));}}return out;}
 get(clip){const {S,C}=this.locate(clip);const shots=S.shots.filter(s=>C.shots.includes(s.index)).map(({thumb,...s})=>({...s,thumb:`/api/depth-library-file?source=${S.id}&file=${thumb}`}));const P=C.package?this.pack(C.package):null;
  return {...this.summary(S,C),description:C.description??null,shotsMeasured:shots,sourceFile:S.fileName,build:C.built??null,fixed:C.fixed??null,package:P?{id:C.package,people:P.people,keyframes:P.keyframes.map(k=>({time:k.time,shot:k.shot,summary:k.summary,people:k.people})),files:this.files(C.package,P)}:null,page:`http://127.0.0.1:5174/editor/depth.html?source=${S.id}&clip=${C.id}`};}
 files(id,P){const dir=resolve(this.packs,id),url=f=>`http://127.0.0.1:5174/api/video-clay-file?id=${id}&file=${f}`;return {folder:dir,referenceVideo:P.depth?{path:resolve(dir,P.depth),url:url(P.depth)}:P.clay?{path:resolve(dir,P.clay),url:url(P.clay)}:null,keyframes:P.keyframes.map((k,i)=>({index:i+1,time:k.time,composition:{path:resolve(dir,k.depthStill??k.clayStill),url:url(k.depthStill??k.clayStill)},source:{path:resolve(dir,k.sourceStill),note:'a frame of the original footage: for checking only, not for upload'}}))};}
 // a beat's words against a clip's labels (three points each), its summary and keyframe text (one point a word), the people
 // count and the length; clips not yet described are left out unless asked for (descriptions come from Claude in a session)
 find({beat,labels=[],people,maxSeconds,control='any',includeUndescribed=false,limit=8}){
  if(typeof beat!=='string'||!beat.trim())throw Error('beat: the scene beat in words');const stop=new Set('a an the and or of to in on at by with his her their its is are was he she they it as from into for this that then who'.split(' '));
  const words=[...new Set(beat.toLowerCase().match(/[a-z]+/g)??[])].filter(w=>w.length>2&&!stop.has(w)),stem=w=>w.replace(/(ing|ed|es|s)$/,'');const out=[];
  for(const S of this.sources())for(const C of S.clips){
   if(!C.description&&!includeUndescribed)continue;if(control==='on'&&C.kind!=='control'||control==='off'&&C.kind!=='still')continue;if(maxSeconds&&C.seconds>maxSeconds+1e-6)continue;
   const d=C.description??{},text=[d.summary??'',...(d.keyframes??[]).map(k=>k.summary),...Object.values(d.people??{}),C.why.join(' ')].join(' ').toLowerCase(),tw=new Set((text.match(/[a-z]+/g)??[]).map(stem)),lab=d.labels??[];
   const why=[];let score=0;for(const l of labels)if(lab.includes(l)){score+=3;why.push('label '+l);}
   for(const l of lab)if(!labels.includes(l)&&l.split(' ').every(p=>words.map(stem).includes(stem(p)))){score+=2;why.push('beat says '+l);}
   const hit=words.filter(w=>tw.has(stem(w)));score+=hit.length;if(hit.length)why.push('words: '+hit.join(', '));
   if(people){const n=d.peopleCount??null;if(n!==null&&Math.abs(n-people)<=0)score+=2;}
   if(score>0)out.push({...this.summary(S,C),score,why});}
  return out.sort((a,b)=>b.score-a.score||a.seconds-b.seconds).slice(0,limit);}
 describe(args){const {S,C}=this.locate(args.clip);if(typeof args.summary!=='string'||args.summary.length<10||args.summary.length>1200)throw Error('summary: two or three sentences (10-1200 characters)');
  const labels=args.labels??[];if(!Array.isArray(labels)||!labels.length||labels.some(l=>!allLabels.has(l)))throw Error('labels: one or more of '+JSON.stringify(depthLabels));
  const d={summary:args.summary,labels,people:args.people??{},peopleCount:args.peopleCount??null,shots:args.shots??{},keyframes:args.keyframes??[],by:args.by??'Claude in a session',at:new Date().toISOString()};C.description=d;C.described=true;this.save(S);
  let repacked=false;if(C.package){const spec=resolve(this.base,S.id,C.id+'.spec.json');if(existsSync(spec)){const P=JSON.parse(readFileSync(spec,'utf8'));
   P.scene=null;P.people=P.people.map(p=>({...p,represents:d.people[p.name]??p.represents}));P.shots=P.shots.map(s=>({...s,camera:d.shots[s.index]??s.camera}));
   P.keyframes=P.keyframes.map(k=>{const w=d.keyframes.find(x=>Math.abs(x.time-k.time)<.05);return w?{...k,summary:w.summary??k.summary,people:k.people.map(p=>({...p,doing:w.people?.[p.name]??p.doing}))}:k;});
   P.notes=[...(P.notes??[]).filter(n=>!n.startsWith('Described:')),'Described: '+d.summary];writeFileSync(spec,JSON.stringify(P,null,1));
   return new Promise((done,fail)=>execFile(this.py,['authoring/render/video-clay-pack.py',spec],{cwd:this.root,timeout:120000},e=>e?fail(e):done({clip:C.id,described:true,repacked:true})));}}
  return {clip:C.id,described:true,repacked};}
 job(kind,argv,onDone){const id=kind+'-'+Date.now().toString(36);const j={id,kind,status:'running',startedAt:new Date().toISOString(),log:'',result:null,error:null};this.jobs.set(id,j);
  const p=spawn(this.py,argv,{cwd:this.root});const add=b=>{j.log=(j.log+b.toString()).slice(-4000);};p.stdout.on('data',add);p.stderr.on('data',add);
  p.on('close',code=>{j.finishedAt=new Date().toISOString();if(code===0){j.status='done';try{j.result=JSON.parse(j.log.trim().split('\n').filter(l=>l.startsWith('{')).pop());}catch{}onDone?.(j);}else{j.status='failed';j.error=j.log.slice(-1500);}});
  return {job:id,status:'running'};}
 ingest({video,id,name}){if(typeof video!=='string'||!existsSync(video))throw Error('video: a readable local video file');if(typeof id!=='string'||!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))throw Error('id: lower-case letters, digits and dashes');return this.job('ingest',['authoring/render/depth-ingest.py',video,'--id',id,...(name?['--name',String(name).slice(0,120)]:[])]);}
 build({clip,video}){const {S,C}=this.locate(clip);if(C.kind!=='control')throw Error('A still shot has no depth to build');return this.job('build',['authoring/render/depth-build.py',S.id,C.id,...(video?['--video',video]:[])]);}
 fix({clip,shots={},boxes=[]}){const {S,C}=this.locate(clip);if(!C.package)throw Error('Build the clip first');checkFixes(shots,boxes);
  writeFileSync(resolve(this.base,S.id,C.id+'.fixes.json'),JSON.stringify({shots,boxes}));return new Promise((done,fail)=>execFile(this.py,['authoring/render/depth-fix.py',S.id,C.id],{cwd:this.root,timeout:300000},(e,so,se)=>e?fail(Error((se||e.message).slice(-1500))):done(JSON.parse(so.trim().split('\n').pop()))));}
 jobStatus(id){const j=this.jobs.get(id);if(!j)throw Error('No such job (jobs are kept until the service restarts)');return {...j,log:j.status==='running'?j.log.slice(-600):undefined};}
}
