// Clay reference page: plays a pair's scene through its own cameras exactly as an export draws it (the same view code,
// authoring/render/clay-view.ts), checks it against what Seedance 2.5's prompt guide asks of a 3D clay-model reference, and
// exports the package. Needs the authoring service: everything comes from export_pair_reference (viewOnly for the live view).
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {init as initClayView} from '../authoring/render/clay-view';

const bridgeUrl=location.port==='5174'?'':'http://127.0.0.1:5174';
async function tool(name:string,args:any){const r=await fetch(bridgeUrl+'/api/tool',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,arguments:args})}),d=await r.json();if(!r.ok||d.error)throw Error(d.error||'The service refused the request');return d.result;}
type Figure='primitives'|'mannequin';
type View={pairId:string;name:string;revision:number;staged:boolean;durationSeconds:number;figure:Figure;colors:string[];ids:string[];represents:(string|null)[];shots:{index:number;name:string|null;startSeconds:number;lens35:number;moving:boolean}[];beats:{start:number;end:number;text:string;speaker?:string;line?:string}[];props:{id:string;name:string;shape:string;color:string;track:{start:number;holder:number|null;fly?:number}[]}[];handovers:any[];seedance:any;payload:any};
type Check={label:string;state:'ok'|'warn'|'fail'|'wait';detail:string};
type Framing={samples:number;problems:string[];top:number;bottom:number;hidden:number;propsOut:string[]}|null;
const whole=(x:number)=>Math.abs(x-Math.round(x))<1e-6,pct=(x:number)=>(x*100).toFixed(1)+'%',sec=(x:number)=>(Math.round(x*100)/100)+' s';
const hex:Record<string,string>={blue:'#4a86d8',orange:'#ee8a3a',green:'#4fae5a',pink:'#f07fb0',purple:'#8d6fd1',yellow:'#e8c53a',red:'#d9534a',gray:'#8e949c'};

function App(){
 const [pairs,setPairs]=useState<any[]>([]),[pairId,setPairId]=useState(new URLSearchParams(location.search).get('pair')||''),[figure,setFigure]=useState<Figure>('primitives');
 const [view,setView]=useState<View|null>(null),[status,setStatus]=useState('Connecting to the service'),[error,setError]=useState(''),[time,setTime]=useState(0),[playing,setPlaying]=useState(false);
 const [framing,setFraming]=useState<Framing>(null),[depth,setDepth]=useState(false),[exporting,setExporting]=useState(false),[exported,setExported]=useState<any>(null),[copied,setCopied]=useState('');
 const mount=useRef<HTMLDivElement>(null),clay=useRef<Awaited<ReturnType<typeof initClayView>>|null>(null),clock=useRef(0),playRef=useRef(false);playRef.current=playing;
 const total=view?.durationSeconds??0,frames=Math.round(total*30),lastTime=Math.max(0,(frames-1)/30);

 useEffect(()=>{tool('list_pairs',{}).then((list:any[])=>{const usable=list.filter(p=>p.scene&&p.current);setPairs(usable);if(!usable.length)setStatus('No pair has a scene yet');else setPairId(id=>usable.some(p=>p.pairId===id)?id:(usable.find(p=>p.staged)??usable[0]).pairId);}).catch(e=>setError('The authoring service is not answering ('+e.message+'). Start it with npm run start:authoring and open this page from it.'));},[]);

 // load the pair: what an export would draw, then the same view code draws it here
 useEffect(()=>{if(!pairId)return;let gone=false;setView(null);setFraming(null);setExported(null);setPlaying(false);clock.current=0;setTime(0);setStatus('Loading the scene');
  tool('export_pair_reference',{pairId,viewOnly:true,figure}).then(async(v:View)=>{if(gone)return;clay.current?.dispose();clay.current=null;
   const made=await initClayView({payload:v.payload,mount:mount.current!,urls:{character:bridgeUrl+'/editor/assets/character.glb',characters:f=>bridgeUrl+'/editor/assets/characters/'+f,follower:id=>bridgeUrl+'/api/character-file?id='+encodeURIComponent(id)}});
   if(gone){made.dispose();return;}clay.current=made;made.draw(0);setView(v);setStatus('');
  }).catch(e=>{if(!gone)setError(e.message);});
  return()=>{gone=true;};},[pairId,figure]);
 useEffect(()=>()=>{clay.current?.dispose();},[]);

 // playback on the export's own frame times
 useEffect(()=>{if(!view)return;let raf=0,last=performance.now(),shown=-1;const tick=(now:number)=>{const dt=(now-last)/1000;last=now;if(playRef.current){clock.current+=dt;if(clock.current>lastTime)clock.current=0;const f=Math.round(clock.current*30);if(f!==shown){shown=f;clay.current?.draw(f/30);setTime(f/30);}}raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);},[view,lastTime]);
 const seek=(t:number)=>{const f=Math.max(0,Math.min(frames-1,Math.round(t*30)));clock.current=f/30;clay.current?.draw(f/30);setTime(f/30);};

 // framing: the posed figures measured in every shot, twice a second and on each shot's first and last frame
 useEffect(()=>{if(!view)return;let gone=false;const cuts=view.shots.length?view.shots.map(s=>s.startSeconds):[0],at=new Set<number>();cuts.forEach((c,i)=>{const end=(i+1<cuts.length?cuts[i+1]:total)-1/30;for(let t=c;t<end;t+=.5)at.add(Math.round(t*1000)/1000);at.add(Math.round(end*1000)/1000);});
  const times=[...at].sort((a,b)=>a-b),problems:string[]=[],propsOut:string[]=[];let top=1,bottom=1,hidden=1,k=0;
  const step=()=>{if(gone||!clay.current)return;const until=performance.now()+25;while(k<times.length&&performance.now()<until){const t=times[k++],row=clay.current.describe(t),shot=1+Math.max(0,cuts.findLastIndex(c=>c<=t+1e-6));
     (row.props??[]).forEach((p:any)=>{if(!p.inFrame)propsOut.push(`${sec(t)} (${p.id})`);});
     row.performers.forEach((p:any,i:number)=>{const who=view.ids[i];if(!p.box){problems.push(`Shot ${shot}, ${sec(t)}: ${who} is out of frame`);return;}if(p.head&&p.head.croppedBy.length)problems.push(`Shot ${shot}, ${sec(t)}: ${who}'s head is cut by the ${p.head.croppedBy.join(' and ')} edge`);if(p.feet&&p.feet.croppedBy.length)problems.push(`Shot ${shot}, ${sec(t)}: ${who}'s feet are cut by the ${p.feet.croppedBy.join(' and ')} edge`);
      if(p.head)top=Math.min(top,p.head.projectedBox[1]);if(p.feet)bottom=Math.min(bottom,1-p.feet.projectedBox[3]);if(typeof p.visibleFraction==='number')hidden=Math.min(hidden,p.visibleFraction);});}
   if(k<times.length)setTimeout(step,0);else{clay.current.draw(clock.current);setFraming({samples:times.length,problems,top,bottom,hidden,propsOut});}};
  const start=setTimeout(step,300);return()=>{gone=true;clearTimeout(start);};},[view]);

 const checks:Check[]=useMemo(()=>{if(!view)return [];const offCuts=view.shots.filter(s=>!whole(s.startSeconds)),offBeats=view.beats.filter(b=>!whole(b.start)||!whole(b.end)),unnamed=view.ids.filter((_,i)=>!view.represents[i]);
  return [
   {label:'Length within 30 seconds',state:total<=30?'ok':'fail',detail:`${sec(total)}, ${frames} frames at 30 per second`},
   {label:'Each figure has its own colour',state:view.colors[0]!==view.colors[1]?'ok':'fail',detail:view.ids.map((d,i)=>`${d}: ${view.colors[i]}`).join(', ')},
   {label:'Each figure says who it stands for',state:unnamed.length?'warn':'ok',detail:unnamed.length?(view.staged?`Not set for ${unnamed.join(', ')}: add represents to the performer`:'A video pair records no characters: name them in the prompt'):view.ids.map((d,i)=>`${d}: ${String(view.represents[i]).split(/[;.]/)[0]}`).join(' · ')},
   {label:'Cuts fall on whole seconds',state:offCuts.length?'fail':'ok',detail:view.shots.length>1?(offCuts.length?`Shot ${offCuts.map(s=>`${s.index} starts at ${sec(s.startSeconds)}`).join(', ')}`:`Cuts at ${view.shots.slice(1).map(s=>sec(s.startSeconds)).join(', ')}`):view.staged?'One shot, no cuts':'One continuous camera from the source video'},
   {label:'Beats fall on whole seconds',state:offBeats.length?'warn':'ok',detail:!view.beats.length?'No beats recorded':offBeats.length?`${offBeats.length} of ${view.beats.length} start or end between seconds. The timeline for the prompt groups them into whole seconds; the clay video carries the exact timing.`:`All ${view.beats.length} beats`},
   {label:'Heads and feet in frame in every shot',state:!framing?'wait':framing.problems.length?(view.staged?'fail':'warn'):'ok',detail:!framing?'Measuring the posed figures…':framing.problems.length?`${framing.problems.length} of ${framing.samples} moments checked have a problem${view.staged?'':'. The camera is the source video\'s, so this is how the video framed them'}`:`${framing.samples} moments checked. Least room above a head ${pct(framing.top)}, below the feet ${pct(framing.bottom)} of the picture's height`},
   ...(view.handovers.length?[{label:'Hands reach in every hand-over and throw',state:view.handovers.every(h=>h.reached)?'ok' as const:'fail' as const,detail:view.handovers.map(h=>`${h.prop}: ${h.kind==='throw'?`thrown by ${h.from} at ${sec(h.releasedAtSeconds)}, caught by ${h.to} at ${sec(h.changesHandsAtSeconds)}`:`${h.from} to ${h.to} at ${sec(h.changesHandsAtSeconds)}`}, standing ${h.standingApartMeters} m apart${h.reached?'':`; hands short by ${Object.entries(h.handsShortByMeters).map(([k,v])=>`${k} ${Math.round((v as number)*100)} cm`).join(', ')}: stand them closer`}`).join(' · ')}]:[]),
   ...(view.props.length?[{label:'Props in frame',state:!framing?'wait' as const:framing.propsOut.length?'warn' as const:'ok' as const,detail:!framing?'Measuring…':framing.propsOut.length?`Out of frame at ${framing.propsOut.slice(0,6).join(', ')}`:'Every prop is in the picture at every moment checked'}]:[]),
   {label:'Figures stay visible',state:!framing?'wait':framing.hidden<.6?'warn':'ok',detail:!framing?'Measuring…':`At worst ${pct(framing.hidden)} of a figure's outline is unhidden`},
   {label:'No overlays in the picture',state:'ok',detail:'The export draws no path lines, axes or camera markers'}];},[view,framing,total,frames]);

 const shotNow=view?1+Math.max(0,view.shots.findLastIndex(s=>s.startSeconds<=time+1e-6)):1,beatNow=view?.beats.filter(b=>time>=b.start-1e-6&&time<b.end)??[];
 const copy=(key:string,text:string)=>{navigator.clipboard?.writeText(text).then(()=>{setCopied(key);setTimeout(()=>setCopied(''),1500);}).catch(()=>setError('The browser did not allow copying'));};
 const runExport=()=>{if(!view)return;setExporting(true);setExported(null);setPlaying(false);tool('export_pair_reference',{pairId:view.pairId,figure,depth}).then(r=>setExported(r)).catch(e=>setError(e.message)).finally(()=>setExporting(false));};
 const left=(t:number)=>total?`${t/total*100}%`:'0',wide=(a:number,b:number)=>total?`${Math.max(.4,(b-a)/total*100)}%`:'0';

 return <><header><div className="brand"><div className="brand-icon">◈</div><div><strong>ANIMATION STUDIO</strong><small>Clay reference / what the video model receives</small></div></div><div className="header-actions"><select aria-label="Scene" value={pairId} onChange={e=>setPairId(e.target.value)}>{pairs.map(p=><option key={p.pairId} value={p.pairId}>{p.name}{p.staged?'':' (from video)'}</option>)}</select><a className="link" href="./">Action workshop</a></div></header>
  {error&&<div className="clay-error" role="alert">{error} <button onClick={()=>setError('')}>Dismiss</button></div>}
  <div className="clay-layout"><main>
    <div className="clay-stage"><div className="clay-canvas" ref={mount}/>{status&&<div className="loading">{status}</div>}
     {view&&<div className="clay-tags"><span>{view.shots[shotNow-1]?.name||`Shot ${shotNow}`}{view.shots[shotNow-1]?` · ${view.shots[shotNow-1].lens35} mm`:''}</span>{view.ids.map((d,i)=><span key={d}><i style={{background:hex[view.colors[i]]}}/>{d} · {view.colors[i]}</span>)}{view.props.map(p=><span key={p.id}><i style={{background:hex[p.color],borderRadius:2}}/>{p.name} · {p.color} {p.shape}</span>)}</div>}</div>
    <div className="transport"><div className="group"><button className="primary" disabled={!view} onClick={()=>setPlaying(p=>!p)}>{playing?'Pause':'Play'}</button><button disabled={!view} onClick={()=>seek(time-1/30)}>‹ frame</button><button disabled={!view} onClick={()=>seek(time+1/30)}>frame ›</button></div><div className="group"><button className={figure==='primitives'?'active':''} onClick={()=>setFigure('primitives')}>Plain shapes</button><button className={figure==='mannequin'?'active':''} onClick={()=>setFigure('mannequin')}>Mannequin</button></div><span className="time">frame {Math.round(time*30)} / {Math.max(0,frames-1)} · {time.toFixed(2)} / {total.toFixed(2)} s</span></div>
    {view&&<div className="timeline"><div className="timeline-head"><span>WHOLE-SECOND TIMELINE</span><span>{view.staged?'staged from a written scene':'from a source video'} · revision {view.revision}</span></div>
     <input className="scrub" type="range" aria-label="Time" min={0} max={Math.max(0,frames-1)} step={1} value={Math.round(time*30)} onChange={e=>{setPlaying(false);seek(+e.target.value/30);}}/>
     <div className="clay-rows">
      <div className="clay-row ticks">{Array.from({length:Math.floor(total)+1},(_,s)=><i key={s} style={{left:left(s)}}>{s}</i>)}<b style={{left:left(time)}}/></div>
      <div className="clay-row"><label>Shots</label>{(view.shots.length?view.shots:[{index:1,name:null,startSeconds:0,lens35:0,moving:false}]).map((s,i,all)=>{const end=all[i+1]?.startSeconds??total;return <button key={s.index} className={'shot'+(whole(s.startSeconds)?'':' off')+(shotNow===s.index?' now':'')} style={{left:left(s.startSeconds),width:wide(s.startSeconds,end)}} title={`Shot ${s.index}: ${sec(s.startSeconds)} to ${sec(end)}`} onClick={()=>seek(s.startSeconds)}>{s.name||`Shot ${s.index}`}{s.moving?' · moving':''}</button>;})}</div>
      {view.beats.length>0&&<div className="clay-row"><label>Beats</label>{view.beats.map((b,i)=><button key={i} className={'beat'+(whole(b.start)&&whole(b.end)?'':' off')+(beatNow.includes(b)?' now':'')} style={{left:left(b.start),width:wide(b.start,b.end)}} title={`${sec(b.start)} to ${sec(b.end)}${b.speaker?` · ${b.speaker}`:''}: ${b.text}${b.line?` “${b.line}”`:''}`} onClick={()=>seek(b.start)}>{b.speaker?b.speaker+': ':''}{b.text}</button>)}</div>}
      {view.props.map(p=><div className="clay-row" key={p.id}><label>{p.name}</label>{p.track.map((t,i)=>{const end=p.track[i+1]?.start??total;return <button key={i} className="range" style={{left:left(t.start),width:wide(t.start,end),borderBottom:`3px solid ${t.holder===null||t.holder===undefined?'#8e949c':hex[view.colors[t.holder]]}`}} title={`${sec(t.start)} to ${sec(end)}`} onClick={()=>seek(t.start)}>{t.holder===null||t.holder===undefined?'resting':`${t.fly?'thrown to':'held by'} ${view.ids[t.holder]}`}</button>;})}</div>)}
      {view.seedance.timeline&&<div className="clay-row"><label>For the prompt</label>{view.seedance.timeline.map((g:any,i:number)=><button key={i} className={'range'+(time>=g.fromSeconds&&time<g.toSeconds?' now':'')} style={{left:left(g.fromSeconds),width:wide(g.fromSeconds,g.toSeconds)}} title={g.beats.map((b:any)=>b.text).join(' / ')||'Nothing recorded'} onClick={()=>seek(g.fromSeconds)}>{g.fromSeconds}–{g.toSeconds} s{g.cutAtStart?' · cut':''}</button>)}</div>}
     </div>
     <p className="clay-now">{beatNow.length?beatNow.map(b=>`${b.speaker?b.speaker+': ':''}${b.text}${b.line?` “${b.line}”`:''}`).join(' · '):view.beats.length?'No beat at this time':'This pair has no written beats.'}</p>
     <p className="clay-legend"><i className="off"/> starts or ends between whole seconds</p></div>}
   </main>
   <aside className="right">
    <h2>SEEDANCE 2.5 REQUIREMENTS</h2>
    <ul className="clay-checks">{checks.map(c=><li key={c.label} className={c.state}><b>{c.state==='ok'?'✓':c.state==='fail'?'✕':c.state==='warn'?'!':'…'}</b><div><strong>{c.label}</strong><small>{c.detail}</small></div></li>)}</ul>
    {framing&&framing.problems.length>0&&<details className="clay-problems" open><summary>{framing.problems.length} framing problem{framing.problems.length>1?'s':''}</summary><ul>{framing.problems.slice(0,40).map((p,i)=><li key={i}><button onClick={()=>{setPlaying(false);seek(parseFloat(p.split(', ')[1]));}}>{p}</button></li>)}</ul></details>}
    <hr/><h2>FOR THE PROMPT</h2>
    {view&&<div className="clay-copy">{[['scope','What to take from the clay video',view.seedance.referenceScope.sentence],['mapping','Who each model is',view.seedance.mapping.join('\n')],['output','Output',`${view.seedance.output.durationSeconds} seconds, ${view.seedance.output.aspectRatio}. ${view.seedance.output.note}`]].map(([key,title,text])=><div key={key}><div className="clay-copy-head"><strong>{title}</strong><button onClick={()=>copy(key,text)}>{copied===key?'Copied':'Copy'}</button></div><p>{text}</p></div>)}<small>“[Image N]” is a placeholder: the prompt writer puts in each character image’s number.</small></div>}
    <hr/><h2>EXPORT</h2>
    <label className="clay-option"><input type="checkbox" checked={depth} onChange={e=>setDepth(e.target.checked)}/> Also a depth pass (twice the time; Seedance has no depth input)</label>
    <button className="primary clay-export" disabled={!view||exporting} onClick={runExport}>{exporting?'Rendering… about half a minute per ten seconds':`Export package · ${figure==='primitives'?'plain shapes':'mannequin'}`}</button>
    {exported&&<div className="note"><strong>Written</strong><br/>{exported.folder}<br/>{exported.frames} frames · {Object.values(exported.files).flat().join(', ')}, reference.json · {exported.seconds} s to render</div>}
    <p className="clay-foot">Guide: <a href="https://docs.byteplus.com/en/docs/modelark/seedance-2-5-prompt-guide" target="_blank" rel="noreferrer">Seedance 2.5 prompt guide</a>. The checks cover what the guide asks of the clay video; whether a generation follows it is not something this page can tell.</p>
   </aside></div></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
