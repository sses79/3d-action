// Depth shot library page (docs/DEPTH_LIBRARY_PLAN.md): the sources taken in by authoring/render/depth-ingest.py, every shot
// with whether it needs a control video, the clips proposed from them, and the packages already built from the same video
// (a tinted depth video with keyframes, cast and prompts). Needs the authoring service.
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {packPrompts,keyframeHandover} from '../runtime/depth-prompts';

const bridgeUrl=location.port==='5174'?'':'http://127.0.0.1:5174';
const hex:Record<string,string>={blue:'#4a86d8',orange:'#ee8a3a',green:'#4fae5a',pink:'#f07fb0',purple:'#8d6fd1',yellow:'#e8c53a',red:'#d9534a',gray:'#8e949c'};
const starText=(n?:number|null,sug?:boolean|null)=>n?'★'.repeat(n)+'☆'.repeat(5-n)+(sug?' suggested':''):'';
const sec=(x:number)=>x.toFixed(1)+' s',clock=(x:number)=>`${Math.floor(x/60)}:${(x%60).toFixed(1).padStart(4,'0')}`;
const CLIP=['#e8c53a','#4fae5a','#4a86d8','#d9534a','#8d6fd1','#ee8a3a','#3fb5b0','#f07fb0'];
type Shot={index:number;start:number;end:number;seconds:number;camera:number;move:number;people:number;size:number;speech:number;control:'on'|'off';why:string[];thumb:string;speechWindows:number[][];bridged?:boolean};
type Stars={stars:number;suggested:boolean;why:string|string[];by?:string;proven?:any};
type Clip={needsControlNow?:boolean;controlWhy?:string;controlOverride?:{control:string;why:string;by:string};stars?:number|null;starsSuggested?:boolean|null;bestPackage?:string|null;id:string;kind:'control'|'still';shots:number[];start:number;end:number;seconds:number;why:string[];status:string;described:boolean;package?:string;built?:{seconds:Record<string,number>;people:Record<string,string>};fixed?:{people:string[]}};
type PkStatus={status:'current'|'replaced'|'stopped'|'test';note?:string;replacedBy?:string;at?:string};
type PackRef={stars?:Stars;id:string;name:string;start:number;end:number;keyframes:number;depth:boolean;thumb?:string;scene:string|null;summary?:string|null;status?:PkStatus|null;results?:number;used?:number};
const STATUS_ORDER={current:0,test:1,undefined:2,replaced:3,stopped:4} as Record<string,number>;
const statusText=(st?:PkStatus|null)=>!st?'':st.status==='replaced'?`replaced${st.replacedBy?' by '+st.replacedBy:''}`:st.status;
type Source={id:string;name:string;fileName:string;duration:number;fps:number;size:number[];ingested:string;shots:Shot[];clips:Clip[];packages:PackRef[];seconds:Record<string,number>;speechFound:boolean};
const thumb=(s:string,f:string)=>bridgeUrl+'/api/depth-library-file?source='+encodeURIComponent(s)+'&file='+encodeURIComponent(f);
const packFile=(id:string,f:string)=>bridgeUrl+'/api/video-clay-file?id='+encodeURIComponent(id)+'&file='+encodeURIComponent(f);
const TAGS:[string,(c:Clip,sh:Shot[])=>boolean][]=[['camera moves',c=>c.why.includes('camera moves')],['someone moves',c=>c.why.includes('someone moves')],['people in a wide shot',c=>c.why.some(w=>/people in a wide shot/.test(w))],['bridged sequence',c=>c.why.some(w=>w.startsWith('bridged'))],['speech',(c,sh)=>sh.some(s=>s.speechWindows.length>0)],['several shots',c=>c.shots.length>1]];

function Library(){
 const q=new URLSearchParams(location.search);
 const [lib,setLib]=useState<{sources:Source[];unlinked:PackRef[]}|null>(null),[error,setError]=useState(''),[srcId,setSrcId]=useState(q.get('source')||''),[pkg,setPkg]=useState(q.get('package')||''),[open,setOpen]=useState(q.get('clip')||'');
 const [show,setShow]=useState({control:true,still:false,built:true}),[tags,setTags]=useState<string[]>([]),[text,setText]=useState('');
 // a package opened directly (an old Clay page link) selects its own source
 const [loads,setLoads]=useState(0),reload=()=>setLoads(n=>n+1);
 useEffect(()=>{fetch(bridgeUrl+'/api/depth-library').then(r=>r.json()).then(d=>{setLib(d);if(!d.sources.length)setError('Nothing ingested yet: run authoring/render/depth-ingest.py VIDEO --id NAME.');const owner=d.sources.find((s:Source)=>s.packages.some(p=>p.id===q.get('package')))?.id;setSrcId(v=>owner??(d.sources.some((s:Source)=>s.id===v)?v:d.sources[0]?.id||''));}).catch(e=>setError('The authoring service is not answering ('+e.message+'). Start it with npm run start:authoring and open this page from it.'));},[loads]);
 useEffect(()=>{const u=new URLSearchParams();if(srcId)u.set('source',srcId);if(pkg)u.set('package',pkg);if(open)u.set('clip',open);history.replaceState(null,'','?'+u.toString());},[srcId,pkg,open]);
 const src=lib?.sources.find(s=>s.id===srcId),shotOf=(n:number)=>src!.shots.find(s=>s.index===n)!;
 const colourOf=useMemo(()=>{const m=new Map<number,string>();src?.clips.filter(c=>c.kind==='control').forEach((c,i)=>c.shots.forEach(n=>m.set(n,CLIP[i%CLIP.length])));return m;},[src]);
 const clips=useMemo(()=>!src?[]:src.clips.filter(c=>show[c.kind]&&tags.every(t=>TAGS.find(x=>x[0]===t)![1](c,c.shots.map(shotOf)))&&(!text.trim()||(c.id+' '+c.why.join(' ')).toLowerCase().includes(text.trim().toLowerCase()))),[src,show,tags,text]);
 if(pkg)return <><Head/><PackageView id={pkg} onBack={()=>setPkg('')}/></>;
 const oc=src?.clips.find(c=>c.id===open);
 return <><Head/>
  {error&&<div className="clay-error"><span>{error}</span></div>}
  <div className="dl-layout"><aside className="dl-side">
   <h2>SOURCES</h2>
   {lib?.sources.map(s=><button key={s.id} className={'dl-src'+(s.id===srcId?' now':'')} onClick={()=>{setSrcId(s.id);setOpen('');}}><strong>{s.name}</strong><small>{clock(s.duration)} · {s.shots.length} shots · {s.clips.filter(c=>c.kind==='control').length} depth clips · {s.packages.length} built</small></button>)}
   <hr/><h2>SHOW</h2>
   {([['control','Depth clips (control on)'],['still','Still shots (no control)'],['built','Built packages']] as const).map(([k,l])=><label key={k} className="dl-check"><input type="checkbox" checked={show[k]} onChange={e=>setShow({...show,[k]:e.target.checked})}/>{l}</label>)}
   <h2>MEASURED</h2>
   {TAGS.map(([t])=><label key={t} className="dl-check"><input type="checkbox" checked={tags.includes(t)} onChange={e=>setTags(e.target.checked?[...tags,t]:tags.filter(x=>x!==t))}/>{t}</label>)}
   <input className="dl-search" placeholder="Search id or reason" value={text} onChange={e=>setText(e.target.value)}/>
   <p className="vc-help">Labels and summaries come when a clip is described (by Claude in a session). Until then a clip shows what was measured: camera and people movement, people in a wide shot, speech.</p>
  </aside>
  <main className="dl-main">{src&&<>
   <div className="dl-srchead"><div><h1>{src.name}</h1><small>{src.fileName} · {clock(src.duration)} · {src.size[0]}×{src.size[1]} · {src.fps} fps · ingested {src.ingested.replace('T',' ')} in {Math.round(src.seconds.total)} s{src.speechFound?'':' · no speech found'}</small></div>
    <div className="dl-counts"><b>{src.shots.length}</b> shots <b>{src.shots.filter(s=>s.control==='on').length}</b> need control <b>{src.clips.filter(c=>c.kind==='control').length}</b> depth clips <b>{src.packages.length}</b> built</div></div>
   <div className="dl-strip">{src.shots.map(s=><button key={s.index} title={`shot ${s.index}, ${sec(s.start)}-${sec(s.end)}: ${s.why.join(', ')}`} style={{borderColor:colourOf.get(s.index)??'#2a3240'}} className={colourOf.has(s.index)?'on':''} onClick={()=>setOpen(src.clips.find(c=>c.shots.includes(s.index))?.id??'')}><img src={thumb(src.id,s.thumb)} alt="" loading="lazy"/><span>{s.index}{s.bridged?' ·b':''}</span></button>)}</div>
   <p className="vc-help dl-legend">Each colour is a proposed depth clip; grey shots need no control. "b" is a slow shot bridged into a sequence.</p>
   {show.built&&src.packages.some(p=>!src.clips.some(c=>c.package===p.id))&&<><h2 className="dl-h">BUILT BY HAND</h2><div className="dl-cards">{src.packages.filter(p=>!src.clips.some(c=>c.package===p.id)).sort((a,b)=>(STATUS_ORDER[String(a.status?.status)]??2)-(STATUS_ORDER[String(b.status?.status)]??2)).map(p=><button key={p.id} className={'dl-card built'+(p.status&&['replaced','stopped'].includes(p.status.status)?' dim':'')} onClick={()=>setPkg(p.id)}>
    {p.thumb&&<img src={packFile(p.id,p.thumb)} alt=""/>}<div><strong>{p.name}</strong><small>{clock(p.start)}–{clock(p.end)} · {sec(p.end-p.start)} · {p.keyframes} keyframes · {p.depth?'tinted depth':'clay'}</small>{p.stars&&<span className={'dl-stars'+(p.stars.suggested?' sug':'')}>{starText(p.stars.stars,p.stars.suggested)}</span>}{p.status&&<span className={'dl-status '+p.status.status} title={p.status.note??''}>{statusText(p.status)}</span>}{!!p.results&&<span className="dl-results">{p.results} result{p.results>1?'s':''} reviewed{p.used?` · ${p.used} used`:''}</span>}{(p.scene??p.summary)&&<p>{(p.scene??p.summary)!.slice(0,160)}{(p.scene??p.summary)!.length>160?'…':''}</p>}<em>open</em></div></button>)}</div></>}
   <h2 className="dl-h">CLIPS <small>{clips.length} shown</small></h2>
   <div className="dl-cards">{clips.map(c=>{const sh=c.shots.map(shotOf);return <button key={c.id} className={'dl-card'+(c.id===open?' now':'')+(c.kind==='still'?' still':'')+(c.kind==='control'&&c.needsControlNow===false?' nocontrol':'')} onClick={()=>c.package?setPkg(c.package):setOpen(c.id===open?'':c.id)} style={c.kind==='control'?{borderLeftColor:colourOf.get(c.shots[0])}:undefined}>
    <div className="dl-mosaic">{sh.slice(0,3).map(s=><img key={s.index} src={thumb(src.id,s.thumb)} alt="" loading="lazy"/>)}</div>
    <div><strong>{c.id.replace(src.id+'-','')} · {c.kind==='control'?'depth clip':'still shot'}</strong><small>{clock(c.start)}–{clock(c.end)} · {sec(c.seconds)} · {c.shots.length} shot{c.shots.length>1?'s':''}{sh.some(s=>s.speechWindows.length)?' · speech':''}</small>
     <div className="dl-tags">{c.kind==='control'&&c.needsControlNow===false?<span className="off">control not needed{c.controlOverride?' (by '+c.controlOverride.by+')':' (measured)'}</span>:(c.kind==='control'?c.why:['no control: keyframes and text']).map(w=><span key={w}>{w}</span>)}</div>
     {c.stars&&<span className={'dl-stars'+(c.starsSuggested?' sug':'')} title={c.bestPackage&&c.bestPackage!==c.package?'best package: '+c.bestPackage:''}>{starText(c.stars,c.starsSuggested)}{c.bestPackage&&c.bestPackage!==c.package?' · via '+c.bestPackage:''}</span>}
     <em>{c.kind==='control'?(c.package?`built in ${Math.round(c.built?.seconds.total??0)} s · ${c.fixed?.people.length??Object.keys(c.built?.people??{}).length} people${c.fixed?' (fixed)':''} · open`:'proposed · not built'):'still'} · {c.described?'described':'not described'}</em></div></button>;})}</div>
  </>}</main>
  {oc&&src&&<aside className="dl-detail"><div className="dl-detail-head"><strong>{oc.id}</strong><button onClick={()=>setOpen('')}>×</button></div>
   <p className="vc-help">{oc.kind==='control'?'A depth clip, not built yet: Build makes its depth, finds and names the people, tints and packages it (about 2 minutes for 5-15 s).':'A still shot: no control video; it will carry keyframes and text once described.'} {clock(oc.start)}–{clock(oc.end)}, {sec(oc.seconds)}.</p>
   {oc.kind==='control'&&<ControlSwitch clip={oc} onDone={reload}/>}
   {oc.kind==='control'&&!oc.package&&oc.needsControlNow!==false&&<BuildButton clip={oc.id} onDone={reload}/>}
   {oc.shots.map(shotOf).map(s=><div key={s.index} className="dl-shot"><img src={thumb(src.id,s.thumb)} alt=""/><div><strong>Shot {s.index} · {sec(s.start)}–{sec(s.end)} · {s.control==='on'?'control on':s.bridged?'bridged':'off'}</strong>
    <small>camera {s.camera.toFixed(2)} widths/s · move {s.move.toFixed(2)} heights/s · {s.people} people · tallest {Math.round(s.size*100)}% of height{s.speechWindows.length?` · speech ${s.speechWindows.map(w=>`${sec(w[0])}–${sec(w[1])}`).join(', ')}`:''}</small><small>{s.why.join(', ')}</small></div></div>)}
  </aside>}
  </div></>;
}
// Builds a proposed clip as a service job (build_depth_clip) and follows it until done.
async function tool(name:string,args:any){const r=await fetch(bridgeUrl+'/api/tool',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,arguments:args})}),d=await r.json();if(!r.ok||d.error)throw Error(d.error||'The service refused the request');return d.result;}
function BuildButton({clip,onDone}:{clip:string;onDone:()=>void}){
 const [state,setState]=useState(''),[busy,setBusy]=useState(false);
 const go=async()=>{setBusy(true);setState('Starting…');try{const {job}=await tool('build_depth_clip',{clip}),t0=Date.now();for(;;){await new Promise(r=>setTimeout(r,3000));const j=await tool('get_depth_job',{job});if(j.status==='running'){setState(`Building… ${Math.round((Date.now()-t0)/1000)} s`);continue;}if(j.status==='done'){setState(`Built in ${Math.round(j.result?.seconds?.total??0)} s`);onDone();}else setState('Failed: '+(j.error||'').slice(-300));break;}}catch(e:any){setState(e.message);}setBusy(false);};
 return <div className="dl-build"><button className="primary" disabled={busy} onClick={go}>{busy?'Building…':'Build this clip'}</button>{state&&<span>{state}</span>}</div>;
}
// Whether this clip needs a control video: the measured verdict, which a person can override (set_depth_clip_control).
function ControlSwitch({clip,onDone}:{clip:Clip;onDone:()=>void}){
 const [why,setWhy]=useState(''),[note,setNote]=useState('');const on=clip.needsControlNow!==false;
 const set=(control:string)=>tool('set_depth_clip_control',{clip:clip.id,control,why:why||'set on the depth page',by:'Tim (on the depth page)'}).then(()=>{setNote('');onDone();}).catch(e=>setNote(e.message));
 return <div className="dl-ctl"><p className="vc-help"><b>{on?'Needs a control video':'Control not needed'}</b> · {clip.controlWhy}</p>
  <input className="dl-search" placeholder="Why (optional)" value={why} onChange={e=>setWhy(e.target.value)}/>
  <div className="group"><button onClick={()=>set(on?'off':'on')}>{on?'Mark: control not needed':'Mark: needs control'}</button>{clip.controlOverride&&<button onClick={()=>set('measured')}>Back to measured</button>}</div>{note&&<p className="vc-help">{note}</p>}</div>;
}
function Head(){return <header><div className="brand"><div className="brand-icon">◈</div><div><strong>ANIMATION STUDIO</strong><small>Depth library / reference clips from source videos</small></div></div><div className="header-actions"><a className="link" href="clay.html">Clay reference</a><a className="link" href="./">Action workshop</a></div></header>;}

// A built package: the tinted depth video of a source clip (depth-tint.py; the clay of depth-clay.py when a package has no depth) with
// its keyframes (video-clay-pack.py): a still of the source and of the reference video at each one, and who is there, what they do, say and show. The cast and style typed here (kept in this browser)
// turn it into a video prompt and one image prompt per keyframe for another scene.
type Pack={summary?:string;beats?:{actor:string;verb:string;target?:string;contact?:string;change?:string;start:number;end:number}[];beatCheck?:{ok:boolean;faults:string[];notes:string[];maxBeats:number};library?:{source:string;clip:string;perShot?:Record<string,string[]>;fixes?:{shots?:Record<string,Record<string,string>>;boxes?:HandBox[]}};id:string;name:string;sourceVideo:string;clay:string|null;cast?:Record<string,string>;style?:string;scene?:string;depth?:string|null;start:number;duration:number;size:number[];fps:number;people:{name:string;color:string;represents:string}[];shots:{index:number;start:number;end:number;camera:string}[];audio:{start:number;end:number;who?:string;kind:string;text:string}[];keyframes:{time:number;shot:number;summary:string;clayStill:string|null;sourceStill:string;depthStill?:string;people:{name:string;doing:string;speaking?:string;expression?:string}[]}[];notes?:string[]};
function PackageView({id,onBack}:{id:string;onBack:()=>void}){
 const [list,setList]=useState<Pack[]>([]),[error,setError]=useState(''),[time,setTime]=useState(0),[copied,setCopied]=useState(''),[stamp,setStamp]=useState(0);
 const [cast,setCast]=useState<Record<string,string>>({}),[style,setStyle]=useState(''),video=useRef<HTMLVideoElement>(null);
 const [hand,setHand]=useState<HandBox[]>([]),[draw,setDraw]=useState('');
 const [marking,setMarking]=useState<{k:number;owner:string;hand:string;target:string;part:string;from?:number[]}|null>(null),[markBusy,setMarkBusy]=useState(false);
 const pickPoint=(i:number,pt:number[])=>{if(!marking||marking.k!==i||!pkg)return;if(!marking.from){setMarking({...marking,from:pt});return;}
  const old=((pkg.keyframes[i] as any).marks??[]) as any[],m={owner:marking.owner,hand:marking.hand,target:marking.target,part:marking.part,from:marking.from,to:pt};setMarking(null);setMarkBusy(true);
  fetch(bridgeUrl+'/api/tool',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'set_contact_marks',arguments:{package:pkg.id,keyframe:i+1,marks:[...old.filter(o=>!(o.owner===m.owner&&o.hand===m.hand)),m]}})}).then(r=>r.json()).then(()=>{setMarkBusy(false);setStamp(Date.now());}).catch(()=>setMarkBusy(false));};
 useEffect(()=>{fetch(bridgeUrl+'/api/video-clay').then(r=>r.json()).then((l:Pack[])=>{setList(l);if(!l.some(p=>p.id===id))setError('No package '+id);}).catch(e=>setError('The authoring service is not answering ('+e.message+').'));},[id,stamp]);
 const store='video-clay-cast:'+id;
 const pk0=list.find(p=>p.id===id);  // a package may suggest a cast and style; what is typed here (kept in this browser) wins
 useEffect(()=>{try{const s=JSON.parse(localStorage.getItem(store)||'{}');setCast(s.cast||pk0?.cast||{});setStyle(s.style??pk0?.style??'');}catch{setCast(pk0?.cast||{});setStyle(pk0?.style||'');}},[store,pk0]);
 const keep=(c:Record<string,string>,s:string)=>{setCast(c);setStyle(s);try{localStorage.setItem(store,JSON.stringify({cast:c,style:s}));}catch{}};
 const pkg=list.find(p=>p.id===id),useDepth=!!pkg?.depth,  // the tinted depth is the reference video (it won the A/B on Seedance 2.5, 2026-10-18); a package without one shows its clay
 file=(f:string)=>bridgeUrl+'/api/video-clay-file?id='+encodeURIComponent(id)+'&file='+encodeURIComponent(f)+(stamp?'&v='+stamp:'');
 const seek=(t:number)=>{const v=video.current;if(v){v.pause();v.currentTime=t;}setTime(t);};
 useEffect(()=>{setHand(structuredClone(pkg?.library?.fixes?.boxes??[]));setDraw('');},[pkg]);
 const [extras,setExtras]=useState<{status:PkStatus|null;reviews:any[]}|null>(null);
 useEffect(()=>{setExtras(null);fetch(bridgeUrl+'/api/depth-package-extras?id='+encodeURIComponent(id)).then(r=>r.ok?r.json():null).then(setExtras).catch(()=>{});},[id,stamp]);
 const lead=(pkg as any)?.derivedFrom?.lead?.seconds??0;
 const [check,setCheck]=useState<{ok:boolean;keyframes:{time:number;ok:boolean;issues:string[]}[]}|null>(null);
 useEffect(()=>{setCheck(null);if(!pkg?.library)return;fetch(file('check.json')).then(r=>r.ok?r.json():null).then(setCheck).catch(()=>{});},[pkg,stamp]);
 const copy=(k:string,text:string)=>{navigator.clipboard.writeText(text).then(()=>{setCopied(k);setTimeout(()=>setCopied(''),1500);});};
 const texts=useMemo(()=>{if(!pkg)return null;const p=packPrompts(pkg,cast,style,useDepth);if(pkg.beats?.length&&useDepth){const h=keyframeHandover(pkg as any,cast,style,{depth:i=>`key-${i}-depth.jpg`,source:i=>`key-${i}-source.jpg`,contact:i=>(pkg.keyframes[i-1] as any)?.contactStill??null});return {...p,images:h.map(e=>e.prompt),refs:h.map(e=>e.references)};}return {...p,refs:null as any};},[pkg,cast,style,useDepth]);  // with beats: the hand-over template (previous keyframe, contact, sides)
 const pos=(t:number)=>pkg?`${t/pkg.duration*100}%`:'0',wide=(a:number,b:number)=>pkg?`${(b-a)/pkg.duration*100}%`:'0',hereKey=pkg?Math.max(0,pkg.keyframes.findLastIndex(k=>k.time<=time+1e-3)):0;
 return <><div className="dl-bar"><button onClick={onBack}>← Library</button><strong>{pkg?.name??id}</strong><span>built package</span>{extras?.status&&<span className={'dl-status '+extras.status.status} title={extras.status.note??''}>{statusText(extras.status)}{extras.status.note?': '+extras.status.note:''}</span>}{pkg?.summary&&<span className="dl-summary">{pkg.summary}</span>}{check&&<span className={'dl-check-sum'+(check.ok?' ok':'')}>{check.ok?'✓ check passed at every keyframe':`⚠ check: ${check.keyframes.reduce((n,k)=>n+k.issues.length,0)} issue(s) at the keyframes`}</span>}{check&&<a className="link" href={file('check.jpg')} target="_blank" rel="noreferrer">check sheet</a>}</div>
  {error&&<div className="clay-error"><span>{error}</span></div>}
  {pkg&&<div className="clay-layout"><main>
   <div className="clay-stage"><div className="clay-canvas dl-videowrap"><video ref={video} className="vc-video" src={file((useDepth?pkg.depth:pkg.clay)!)} controls playsInline onTimeUpdate={e=>setTime((e.target as HTMLVideoElement).currentTime)}/>{pkg.library&&<DrawLayer pkg={pkg} time={time} hand={hand} setHand={setHand} draw={draw} onStart={()=>video.current?.pause()}/>}</div></div>
   <div className="timeline"><div className="clay-rows">
    {pkg.beats?.length?<div className="clay-row"><label>Beats</label>{pkg.beats.map((b,i)=><button key={i} className={'beat'+(time>=b.start&&time<b.end?' now':'')} style={{left:pos(b.start),width:wide(b.start,b.end)}} title={[b.contact&&'contact: '+b.contact,b.change].filter(Boolean).join(' · ')} onClick={()=>seek(b.start+.02)}>{i+1}. {b.actor} {b.verb}{b.target?' '+b.target:''}</button>)}</div>:null}
    <div className="clay-row"><label>Shots</label>{pkg.shots.map(s=><button key={s.index} className={'shot'+(time>=s.start&&time<s.end?' now':'')} style={{left:pos(s.start),width:wide(s.start,s.end)}} title={s.camera} onClick={()=>seek(s.start+.02)}>Shot {s.index}</button>)}</div>
    <div className="clay-row"><label>Keyframes</label>{pkg.keyframes.map((k,i)=><button key={i} className={'range vc-key'+(i===hereKey?' now':'')} style={{left:`calc(${pos(k.time)} - 11px)`,width:'22px'}} title={k.summary} onClick={()=>seek(k.time)}>{i+1}</button>)}</div>
    <div className="clay-row"><label>Sound</label>{pkg.audio.map((a,i)=><button key={i} className={a.kind==='speech'?'beat':'range'} style={{left:pos(a.start),width:wide(a.start,Math.min(a.end,pkg.duration))}} title={a.text} onClick={()=>seek(a.start)}>{a.kind==='speech'?`${a.who} speaks`:a.text}</button>)}</div>
   </div></div>
   <div className="vc-keys">{pkg.keyframes.map((k,i)=><section key={i} className={'vc-card'+(i===hereKey?' now':'')}>
    <div className="vc-head"><button onClick={()=>seek(k.time)}>{i+1} · {k.time.toFixed(2)} s · shot {k.shot}</button><span>{pkg.shots.find(s=>s.index===k.shot)?.camera}</span></div>
    <div className={'vc-stills'+((k as any).contactStill?' three':'')}><figure><MarkableImg src={file(k.sourceStill)} marking={marking?.k===i} onPick={pt=>pickPoint(i,pt)}/><figcaption>source{marking?.k===i?` · click ${marking.from?'what the hand touches':'the hand'}`:''}</figcaption></figure><figure><img src={file((useDepth&&k.depthStill?k.depthStill:k.clayStill)!)} alt=""/><figcaption>{useDepth?'tinted depth':'clay'}</figcaption></figure>{(k as any).contactStill&&<figure><img src={file((k as any).contactStill)} alt=""/><figcaption>contact card</figcaption></figure>}</div>
    {pkg.library||pkg.beats?<MarkBar pkg={pkg} k={i} marking={marking} setMarking={setMarking} busy={markBusy}/>:null}
    {check&&(()=>{const c=check.keyframes.find(x=>Math.abs(x.time-k.time)<.01);return c&&<div className={'dl-check-k'+(c.ok?' ok':'')}>{c.ok?'✓ Colours and shapes checked':c.issues.map((x,j)=><div key={j}>⚠ {x}</div>)}</div>;})()}
    <p className="vc-sum">{k.summary}</p>
    {(()=>{const says=k.people.some(p=>p.speaking),face=k.people.some(p=>p.expression);return <table className="vc-people"><thead><tr><th>Who</th><th>Doing</th>{says&&<th>Says</th>}{face&&<th>Face</th>}</tr></thead><tbody>{k.people.map(p=>{const c=pkg.people.find(q=>q.name===p.name)!;return <tr key={p.name}><td><i style={{background:hex[c.color]??c.color}}/>{p.name}{cast[p.name]?.trim()?<small> → {cast[p.name]}</small>:null}</td><td>{p.doing}</td>{says&&<td>{p.speaking||'—'}</td>}{face&&<td>{p.expression||'—'}</td>}</tr>;})}</tbody></table>;})()}
    {texts?.refs&&<ol className="dl-refs">{texts.refs[i].map((r:any)=><li key={r.image}><b>Image {r.image}</b> {r.role}</li>)}</ol>}
    {texts&&<div className="clay-copy"><div className="clay-copy-head"><strong>Image prompt for this keyframe (with its depth still and source frame as layout references)</strong><button onClick={()=>copy('k'+i,texts.images[i])}>{copied==='k'+i?'Copied':'Copy'}</button></div></div>}
   </section>)}</div>
  </main>
  <aside className="right">
   <h2>YOUR SCENE</h2>
   {pkg.scene&&<p className="vc-scene">{pkg.scene}</p>}
   <p className="vc-help">Who each figure becomes in your scene and the look to draw it in. Left empty, the prompts describe the people of the source clip.</p>
   <div className="vc-cast">{pkg.people.map(p=><label key={p.name}><span><i style={{background:hex[p.color]??p.color}}/>{p.name} · {p.color}</span><input value={cast[p.name]??''} placeholder={p.represents} onChange={e=>keep({...cast,[p.name]:e.target.value},style)}/></label>)}
    <label><span>Style</span><input value={style} placeholder="e.g. soft 2D digital painting, warm candlelight" onChange={e=>keep(cast,e.target.value)}/></label></div>
   <hr/><h2>FOR THE PROMPT</h2>
   {texts&&<div className="clay-copy"><div><div className="clay-copy-head"><strong>Video prompt ({useDepth?'tinted depth':'clay video'} as reference video 1)</strong><button onClick={()=>copy('video',texts.videoPrompt)}>{copied==='video'?'Copied':'Copy'}</button></div><p>{texts.videoPrompt}</p></div>
    <small>Whole-second times are for Seedance 2.5; 2.0 follows only the shot order. Upload the {useDepth?'tinted depth video':'clay video'}{lead?', the first-frame image (the previous take\'s last frame) as the first frame,':''} and your character images; for each keyframe{lead?' after the first':''}, generate the image from its depth still and source frame (layout only: replace every person) with the image prompt, then add the keyframes. The source frames never go to the video model.</small></div>}
   <hr/><h2>BEATS</h2>{pkg.beats?.length?<div className="vc-help">{pkg.summary}<br/>{pkg.beats.length} beat{pkg.beats.length>1?'s':''} in {pkg.duration.toFixed(1)} s (at most {pkg.beatCheck?.maxBeats})
    {pkg.beatCheck?.faults.map((f,i)=><div key={i} className="dl-check-k">⚠ {f}</div>)}{pkg.beatCheck?.notes.map((f,i)=><div key={'n'+i}>· {f}</div>)}</div>:<p className="vc-help">No beats yet: the action this clip stands for ("A grabs B, locks B's throat, lifts B into the air"), set with set_depth_beats. The prompts are written from them.</p>}
   <hr/><h2>RESULTS</h2>{extras?.reviews.length?extras.reviews.map(r=><Result key={r.label} id={pkg.id} r={r}/>):<p className="vc-help">No result reviewed yet. When a take comes back, review it against this package (review_depth_result, with a verdict: used, good, retake or rejected); it shows here with its sheet.</p>}
   <hr/><h2>STARS</h2><RateBox id={pkg.id}/>
   {pkg.library?.perShot&&<><hr/><h2>PEOPLE</h2><PeopleFix pkg={pkg} hand={hand} setHand={setHand} draw={draw} setDraw={setDraw} time={time} onDone={()=>setStamp(Date.now())}/></>}
   <hr/><h2>PACKAGE</h2>
   <p className="vc-help">.authoring/video-clay/{pkg.id}/ · {[pkg.depth,pkg.clay].filter(Boolean).join(', ')} ({pkg.size[0]}×{pkg.size[1]}, {pkg.duration.toFixed(2)} s, {pkg.fps} fps) and a source{pkg.clay?', clay':''} and depth still per keyframe. From {pkg.sourceVideo}, {pkg.start}–{(pkg.start+pkg.duration).toFixed(2)} s.</p>
   {pkg.notes?.map((n,i)=><p key={i} className="vc-help">{n}</p>)}
  </aside></div>}</>;
}
// Fixes by hand for an automatically built clip, shot by shot: who each person found is (joins people across cuts, splits a name
// given to two people), or drop; the service tints again from the saved depth.
function PeopleFix({pkg,onDone,hand,setHand,draw,setDraw,time}:{pkg:Pack;onDone:()=>void;hand:HandBox[];setHand:(h:HandBox[])=>void;draw:string;setDraw:(d:string)=>void;time:number}){
 const lib=pkg.library!,per=lib.perShot!,letters='ABCDEFGH'.split('');
 const [fix,setFix]=useState<Record<string,Record<string,string>>>(lib.fixes?.shots??{}),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[pick,setPick]=useState('A');
 const colour=(n:string)=>pkg.people.find(p=>p.name===n)?.color;
 const set=(shot:string,n:string,v:string)=>{const f=structuredClone(fix);f[shot]={...(f[shot]??{})};if(v===n)delete f[shot][n];else f[shot][n]=v;setFix(f);};
 const apply=()=>{setBusy(true);setNote('');fetch(bridgeUrl+'/api/depth-library/fix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:lib.source,clip:lib.clip,shots:fix,boxes:hand})}).then(r=>r.json()).then(d=>{setBusy(false);if(d.error)setNote(d.error);else{setNote(`Tinted again in ${d.seconds} s.`);onDone();}}).catch(e=>{setBusy(false);setNote(e.message);});};
 return <div className="dl-fix"><p className="vc-help">Found and named automatically, shot by shot. In each shot say who each person is (the same letter across cuts is the same person), or drop them; the tint is made again from the saved depth.</p>
  <table className="vc-people"><thead><tr><th>Shot</th><th>Found as</th><th>Is</th></tr></thead><tbody>{Object.entries(per).flatMap(([shot,ns])=>ns.map(n=><tr key={shot+n}><td>{shot}</td><td><i style={{background:hex[colour(fix[shot]?.[n]??n)??colour(n)??'gray']}}/>{n}</td>
   <td><select value={fix[shot]?.[n]??n} onChange={e=>set(shot,n,e.target.value)}>{letters.map(m=><option key={m} value={m}>{m}</option>)}<option value="-">drop</option></select></td></tr>))}</tbody></table>
  <h3 className="dl-sub">Boxes by hand</h3>
  <p className="vc-help">For someone the detector misses (armour, someone lying down): choose a letter, press Draw, pause on a frame and drag over the person. Draw again at other times in the same shot to follow them; the box is blended between your keys and held before the first and after the last. Boxes are tinted first and in front.</p>
  <div className="dl-drawbar"><select value={pick} onChange={e=>setPick(e.target.value)}>{letters.map(m=><option key={m} value={m}>{m}</option>)}</select><button className={draw?'primary':''} onClick={()=>setDraw(draw?'':pick)}>{draw?`Drawing ${draw}: drag on the picture · stop`:'Draw a box'}</button></div>
  {hand.length>0&&<table className="vc-people"><thead><tr><th>Who</th><th>Shot</th><th>Keys</th><th></th></tr></thead><tbody>{hand.map((e,i)=><tr key={i}><td><i style={{background:hex[colour(e.name)??'gray']}}/>{e.name}</td><td>{e.shot}</td><td>{e.keys.map(k=>k.time.toFixed(2)+' s').join(', ')}</td><td><button onClick={()=>setHand(hand.filter((_,j)=>j!==i))}>Remove</button></td></tr>)}</tbody></table>}
  <button className="primary" disabled={busy} onClick={apply}>{busy?'Tinting…':'Apply and tint again'}</button>{note&&<p className="vc-help">{note}</p>}</div>;
}
// A box drawn by hand for one person in one shot: keys at clip times, boxes as fractions of the picture.
type HandBox={name:string;shot:string;keys:{time:number;box:number[]|null}[]};
const shotAt=(pkg:Pack,t:number)=>pkg.shots.find(s=>s.start<=t+1e-3&&t<s.end-1e-3)??pkg.shots[pkg.shots.length-1];
function boxAt(pkg:Pack,e:HandBox,t:number){const sh=pkg.shots.find(s=>String(s.index)===String(e.shot));if(!sh||!(sh.start<=t+1e-3&&t<sh.end))return null;const ks=[...e.keys].sort((a,b)=>a.time-b.time);let j=ks.findLastIndex(k=>k.time<=t);if(j<0)j=0;const a=ks[j];if(!a.box)return null;let b=ks[Math.min(j+1,ks.length-1)];if(!b.box)b=a;const u=b.time>a.time?Math.min(1,Math.max(0,(t-a.time)/(b.time-a.time))):0;const bb=b.box!;return a.box.map((v,i)=>v+(bb[i]-v)*u);}
// Over the video: the hand boxes at this moment, and, while drawing, a drag makes or replaces a key at this time.
function DrawLayer({pkg,time,hand,setHand,draw,onStart}:{pkg:Pack;time:number;hand:HandBox[];setHand:(h:HandBox[])=>void;draw:string;onStart:()=>void}){
 const [drag,setDrag]=useState<number[]|null>(null),ref=useRef<SVGSVGElement>(null);
 const at=(e:React.PointerEvent)=>{const r=ref.current!.getBoundingClientRect();return [Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))];};
 const up=()=>{if(!drag)return;const [x0,y0,x1,y1]=drag,box=[Math.min(x0,x1),Math.min(y0,y1),Math.max(x0,x1),Math.max(y0,y1)].map(v=>Math.round(v*1000)/1000);setDrag(null);if(box[2]-box[0]<.01||box[3]-box[1]<.01)return;
  const shot=String(shotAt(pkg,time).index),next=structuredClone(hand);let e=next.find(x=>x.name===draw&&x.shot===shot);if(!e){e={name:draw,shot,keys:[]};next.push(e);}e.keys=[...e.keys.filter(k=>Math.abs(k.time-time)>.02),{time:Math.round(time*1000)/1000,box}].sort((a,b)=>a.time-b.time);setHand(next);};
 const colour=(n:string)=>hex[pkg.people.find(p=>p.name===n)?.color??'']??'#e8c53a';
 return <svg ref={ref} className={'dl-draw'+(draw?' on':'')} viewBox="0 0 1 1" preserveAspectRatio="none" onPointerDown={e=>{if(!draw)return;onStart();(e.target as Element).setPointerCapture?.(e.pointerId);const p=at(e);setDrag([...p,...p]);}} onPointerMove={e=>{if(drag)setDrag([drag[0],drag[1],...at(e)]);}} onPointerUp={up}>
  {hand.map((e,i)=>{const b=boxAt(pkg,e,time);return b&&<g key={i}><rect x={b[0]} y={b[1]} width={b[2]-b[0]} height={b[3]-b[1]} fill="none" stroke={colour(e.name)} strokeWidth={.004} vectorEffect="non-scaling-stroke" style={{strokeWidth:2}}/><text x={b[0]+.005} y={b[1]+.04} fontSize={.035} fill={colour(e.name)}>{e.name}{e.keys.some(k=>Math.abs(k.time-time)<.02)?' ◆':''}</text></g>;})}
  {drag&&<rect x={Math.min(drag[0],drag[2])} y={Math.min(drag[1],drag[3])} width={Math.abs(drag[2]-drag[0])} height={Math.abs(drag[3]-drag[1])} fill="rgba(232,197,58,.15)" stroke="#e8c53a" vectorEffect="non-scaling-stroke" style={{strokeWidth:2}}/>}
 </svg>;
}
// The package's stars as a control signal: a person's rating, or the machine's suggestion until one is given.
// A take generated from the package and reviewed against it (review_depth_result): the verdict, the measures, the video and the sheet.
function Result({id,r}:{id:string;r:any}){const f=(x:string)=>bridgeUrl+'/api/video-clay-review-file?id='+encodeURIComponent(id)+'&label='+encodeURIComponent(r.label)+'&file='+x;
 return <div className="dl-result"><div className="dl-result-head"><strong>{r.label}</strong>{r.verdict&&<span className={'dl-verdict '+r.verdict}>{r.verdict}</span>}<small>{String(r.reviewed??'').replace('T',' ')}</small></div>
  {r.video&&<video src={f('result.mp4')} controls preload="metadata"/>}
  <div className="vc-help">{r.length.result} s for a {r.length.guide} s guide · cuts {r.cuts.matched.length}/{r.cuts.guide.length} matched{r.cuts.matched.length?` (${r.cuts.matched.map((m:any)=>`${m.guide}→${m.result} s`).join(', ')})`:''}{r.cuts.missing.length?` · missing ${r.cuts.missing.join(', ')} s`:''}{r.cuts.extra.length?` · extra ${r.cuts.extra.join(', ')} s`:''}</div>
  <div className="vc-help">{r.motion.map((m:any)=><div key={m.beat}>beat {m.beat} ({m.what}): movement {m.ratio??'–'} of the source's{m.flag?` ⚠ ${m.flag}`:''}</div>)}</div>
  {r.flags.length?<div className="vc-help">{r.flags.map((x:string,i:number)=><div key={i} className="dl-check-k">⚠ {x}</div>)}</div>:<div className="vc-help">No flags.</div>}
  {r.note&&<p className="vc-help">{r.note}</p>}
  <a className="link" href={f('sheet.jpg')} target="_blank" rel="noreferrer">sheet: source, depth and result at each keyframe</a></div>;}
function RateBox({id}:{id:string}){
 const [cur,setCur]=useState<Stars|null>(null),[std,setStd]=useState<Record<string,string>>({}),[pick,setPick]=useState(0),[why,setWhy]=useState(''),[note,setNote]=useState('');
 const load=()=>fetch(bridgeUrl+'/api/depth-library').then(r=>r.json()).then(d=>{setStd(d.starStandard??{});const all=[...d.sources.flatMap((s:any)=>s.packages),...d.unlinked];setCur(all.find((p:any)=>p.id===id)?.stars??null);});
 useEffect(()=>{load();},[id]);
 const save=()=>tool('rate_depth_package',{package:id,stars:pick,why,by:'Tim (on the depth page)'}).then(()=>{setNote('Saved.');setPick(0);setWhy('');load();}).catch(e=>setNote(e.message));
 return <div className="dl-rate">{cur&&<p className="vc-help"><span className={'dl-stars big'+(cur.suggested?' sug':'')}>{starText(cur.stars,cur.suggested)}</span><br/>{cur.suggested?'Suggested by the check: ':`Rated by ${cur.by}: `}{Array.isArray(cur.why)?cur.why.join(' · '):cur.why}</p>}
  <div className="dl-starpick">{[1,2,3,4,5].map(n=><button key={n} className={n<=pick?'on':''} title={std[n]} onClick={()=>setPick(n)}>★</button>)}</div>
  {pick>0&&<><p className="vc-help">{pick}: {std[pick]}</p><input className="dl-search" placeholder="What it rests on (a generation, what you saw)" value={why} onChange={e=>setWhy(e.target.value)}/><button className="primary" disabled={why.trim().length<5} onClick={save}>Rate {pick} star{pick>1?'s':''}</button></>}
  {note&&<p className="vc-help">{note}</p>}</div>;
}
// The source still as a target for two clicks (a hand, then what it touches), as fractions of the picture.
function MarkableImg({src,marking,onPick}:{src:string;marking:boolean;onPick:(pt:number[])=>void}){
 return <img src={src} alt="" className={marking?'dl-markable':''} onClick={e=>{if(!marking)return;const r=(e.target as HTMLImageElement).getBoundingClientRect();onPick([+((e.clientX-r.left)/r.width).toFixed(4),+((e.clientY-r.top)/r.height).toFixed(4)]);}}/>;
}
// Marks whose hand is on what at a keyframe (set_contact_marks), for its contact card: choose, then click the source still twice.
function MarkBar({pkg,k,marking,setMarking,busy}:{pkg:Pack;k:number;marking:any;setMarking:(m:any)=>void;busy:boolean}){
 const names=pkg.people.map(p=>p.name),[owner,setOwner]=useState(names[1]??names[0]),[hnd,setHnd]=useState('right'),[target,setTarget]=useState(names[0]),[part,setPart]=useState('throat');
 const marks=((pkg.keyframes[k] as any).marks??[]) as any[];const on=marking?.k===k;
 return <div className="dl-markbar">{marks.map((m,j)=><span key={j}>{m.owner}'s {m.hand} hand → {m.target}'s {m.part}</span>)}
  <select value={owner} onChange={e=>setOwner(e.target.value)}>{names.map(n=><option key={n}>{n}</option>)}</select><select value={hnd} onChange={e=>setHnd(e.target.value)}><option>right</option><option>left</option></select><span>hand on</span><select value={target} onChange={e=>setTarget(e.target.value)}>{names.map(n=><option key={n}>{n}</option>)}</select><input value={part} onChange={e=>setPart(e.target.value)} placeholder="throat"/>
  <button className={on?'primary':''} disabled={busy} onClick={()=>setMarking(on?null:{k,owner,hand:hnd,target,part})}>{busy?'Making the card…':on?(marking.from?'Now click what it touches · cancel':'Click the hand on the source · cancel'):'Mark a hand'}</button></div>;
}
createRoot(document.getElementById('root')!).render(<Library/>);
