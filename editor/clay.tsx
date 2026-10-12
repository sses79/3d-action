// Clay reference page: plays a pair's scene through its own cameras exactly as an export draws it (the same view code,
// authoring/render/clay-view.ts), checks it against what Seedance 2.5's prompt guide asks of a 3D clay-model reference, and
// exports the package. Needs the authoring service: everything comes from export_pair_reference (viewOnly for the live view).
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {init as initClayView} from '../authoring/render/clay-view';

const bridgeUrl=location.port==='5174'?'':'http://127.0.0.1:5174';
async function tool(name:string,args:any){const r=await fetch(bridgeUrl+'/api/tool',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,arguments:args})}),d=await r.json();if(!r.ok||d.error)throw Error(d.error||'The service refused the request');return d.result;}
type Figure='primitives'|'mannequin';
type View={pairId:string;name:string;revision:number;staged:boolean;durationSeconds:number;figure:Figure;colors:string[];ids:string[];represents:(string|null)[];shots:{index:number;name:string|null;startSeconds:number;lens35:number;moving:boolean}[];beats:{start:number;end:number;text:string;speaker?:string;line?:string}[];props:{id:string;name:string;shape:string;color:string;track:{start:number;holder:number|null;fly?:number}[]}[];handovers:any[];spec:any|null;seedance:any;payload:any};
type Check={label:string;state:'ok'|'warn'|'fail'|'wait';detail:string};
type Framing={samples:number;problems:string[];top:number;bottom:number;hidden:number;propsOut:string[]}|null;
const whole=(x:number)=>Math.abs(x-Math.round(x))<1e-6,pct=(x:number)=>(x*100).toFixed(1)+'%',sec=(x:number)=>(Math.round(x*100)/100)+' s';
const hex:Record<string,string>={blue:'#4a86d8',orange:'#ee8a3a',green:'#4fae5a',pink:'#f07fb0',purple:'#8d6fd1',yellow:'#e8c53a',red:'#d9534a',gray:'#8e949c'};

// The floor from above: x to the right, z down the page toward the viewer of the plan, metres. Marks, camera positions and a
// camera's own look-at point can be dragged (to the nearest 5 cm); nothing changes in the scene until Apply stages it again.
function Plan({spec,colors,onChange}:{spec:any;colors:string[];onChange:(next:any)=>void}){
 const svg=useRef<SVGSVGElement>(null),drag=useRef<{kind:'mark'|'cam'|'look';key:string|number}|null>(null);
 const startOf=(id:string)=>spec.marks[spec.performers.find((p:any)=>p.id===id)?.start]??[0,0],aimOf=(c:any):number[]=>Array.isArray(c.lookAt)?[c.lookAt[0],c.lookAt[2]]:c.lookAt==='both'?[(startOf(spec.performers[0].id)[0]+startOf(spec.performers[1].id)[0])/2,(startOf(spec.performers[0].id)[1]+startOf(spec.performers[1].id)[1])/2]:spec.performers.some((p:any)=>p.id===c.lookAt)?startOf(c.lookAt):spec.marks[c.lookAt]??[0,0];
 // the plan is fitted to the marks and cameras, with a metre around them; walls further out are cut off
 const xs:number[]=[],zs:number[]=[];for(const m of Object.values(spec.marks) as number[][]){xs.push(m[0]);zs.push(m[1]);}for(const c of spec.cameras){xs.push(c.position[0]);zs.push(c.position[2]);}
 const x0=Math.min(...xs)-1,x1=Math.max(...xs)+1,z0=Math.min(...zs)-1,z1=Math.max(...zs)+.6,snap=(v:number)=>Math.round(v*20)/20;
 const at=(e:React.PointerEvent)=>{const p=svg.current!.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(svg.current!.getScreenCTM()!.inverse());return [snap(q.x),snap(q.y)];};
 const move=(e:React.PointerEvent)=>{const d=drag.current;if(!d)return;const [x,z]=at(e),next=structuredClone(spec);if(d.kind==='mark')next.marks[d.key]=[x,z];else if(d.kind==='cam')next.cameras[d.key as number].position=[x,next.cameras[d.key as number].position[1],z];else next.cameras[d.key as number].lookAt=[x,next.cameras[d.key as number].lookAt[1],z];onChange(next);};
 const grab=(kind:'mark'|'cam'|'look',key:string|number)=>(e:React.PointerEvent)=>{drag.current={kind,key};svg.current!.setPointerCapture(e.pointerId);e.preventDefault();};
 return <svg ref={svg} className="clay-plan" viewBox={`${x0} ${z0} ${x1-x0} ${z1-z0}`} style={{aspectRatio:`${x1-x0}/${z1-z0}`}} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} role="img" aria-label="Floor plan">
  {spec.objects.map((o:any,i:number)=><g key={i} transform={`translate(${o.position[0]} ${o.position[2]}) rotate(${-(o.rotationY??0)})`}><rect x={-o.size[0]/2} y={-o.size[2]/2} width={o.size[0]} height={o.size[2]} className="obj"/><title>{o.name}</title></g>)}
  {spec.cameras.map((c:any,i:number)=>{const a=aimOf(c);return <g key={'c'+i}><line x1={c.position[0]} y1={c.position[2]} x2={a[0]} y2={a[1]} className="sight"/>{Array.isArray(c.lookAt)&&<rect x={a[0]-.07} y={a[1]-.07} width={.14} height={.14} className="look" onPointerDown={grab('look',i)}><title>Shot {i+1} looks here (drag)</title></rect>}<circle cx={c.position[0]} cy={c.position[2]} r={.16} className="cam" onPointerDown={grab('cam',i)}><title>Camera of shot {i+1} (drag)</title></circle><text x={c.position[0]} y={c.position[2]+.055} className="camn">{i+1}</text></g>;})}
  {Object.entries(spec.marks as Record<string,number[]>).map(([name,m])=>{const who=spec.performers.findIndex((p:any)=>p.start===name);return <g key={name}><circle cx={m[0]} cy={m[1]} r={who>=0?.2:.09} className="mark" style={who>=0?{fill:hex[colors[who]]}:undefined} onPointerDown={grab('mark',name)}><title>{name} (drag)</title></circle><text x={m[0]} y={m[1]-(who>=0?.27:.15)} className="lbl">{who>=0?spec.performers[who].id:name}</text></g>;})}
 </svg>;
}
function App(){
 const [pairs,setPairs]=useState<any[]>([]),[pairId,setPairId]=useState(new URLSearchParams(location.search).get('pair')||''),[figure,setFigure]=useState<Figure>('primitives');
 const [view,setView]=useState<View|null>(null),[status,setStatus]=useState('Connecting to the service'),[error,setError]=useState(''),[time,setTime]=useState(0),[playing,setPlaying]=useState(false);
 const [draft,setDraft]=useState<any>(null),[reload,setReload]=useState(0),[applying,setApplying]=useState(false),[notice,setNotice]=useState('');
 const [framing,setFraming]=useState<Framing>(null),[depth,setDepth]=useState(false),[exporting,setExporting]=useState(false),[exported,setExported]=useState<any>(null),[copied,setCopied]=useState('');
 const mount=useRef<HTMLDivElement>(null),clay=useRef<Awaited<ReturnType<typeof initClayView>>|null>(null),clock=useRef(0),playRef=useRef(false);playRef.current=playing;
 const total=view?.durationSeconds??0,frames=Math.round(total*30),lastTime=Math.max(0,(frames-1)/30);

 useEffect(()=>{tool('list_pairs',{}).then((list:any[])=>{const usable=list.filter(p=>p.scene&&p.current);setPairs(usable);if(!usable.length)setStatus('No pair has a scene yet');else setPairId(id=>usable.some(p=>p.pairId===id)?id:(usable.find(p=>p.staged)??usable[0]).pairId);}).catch(e=>setError('The authoring service is not answering ('+e.message+'). Start it with npm run start:authoring and open this page from it.'));},[]);

 // load the pair: what an export would draw, then the same view code draws it here
 useEffect(()=>{if(!pairId)return;let gone=false;setView(null);setFraming(null);setExported(null);setPlaying(false);clock.current=0;setTime(0);setStatus('Loading the scene');
  tool('export_pair_reference',{pairId,viewOnly:true,figure}).then(async(v:View)=>{if(gone)return;clay.current?.dispose();clay.current=null;
   const made=await initClayView({payload:v.payload,mount:mount.current!,urls:{character:bridgeUrl+'/editor/assets/character.glb',characters:f=>bridgeUrl+'/editor/assets/characters/'+f,follower:id=>bridgeUrl+'/api/character-file?id='+encodeURIComponent(id)}});
   if(gone){made.dispose();return;}clay.current=made;made.draw(clock.current);setView(v);setDraft(v.spec?structuredClone(v.spec):null);setStatus('');
  }).catch(e=>{if(!gone)setError(e.message);});
  return()=>{gone=true;};},[pairId,figure,reload]);
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
   // the measuring draws other moments on the same canvas: put the current one back before the browser paints
   clay.current.draw(clock.current);if(k<times.length)setTimeout(step,0);else{setFraming({samples:times.length,problems,top,bottom,hidden,propsOut});}};
  const start=setTimeout(step,300);return()=>{gone=true;clearTimeout(start);};},[view]);

 const checks:Check[]=useMemo(()=>{if(!view)return [];const offCuts=view.shots.filter(s=>!whole(s.startSeconds)),offBeats=view.beats.filter(b=>!whole(b.start)||!whole(b.end)),unnamed=view.ids.filter((_,i)=>!view.represents[i]);
  return [
   {label:'Length within 30 seconds',state:total<=30?'ok':'fail',detail:`${sec(total)}, ${frames} frames at 30 per second`},
   {label:'Each figure has its own colour',state:view.colors[0]!==view.colors[1]?'ok':'fail',detail:view.ids.map((d,i)=>`${d}: ${view.colors[i]}`).join(', ')},
   {label:'Each figure says who it stands for',state:unnamed.length?'warn':'ok',detail:unnamed.length?(view.staged?`Not set for ${unnamed.join(', ')}: add represents to the performer`:'A video pair records no characters: name them in the prompt'):view.ids.map((d,i)=>`${d}: ${String(view.represents[i]).split(/[;.]/)[0]}`).join(' · ')},
   {label:'Cuts fall on whole seconds',state:offCuts.length?'fail':'ok',detail:view.shots.length>1?(offCuts.length?`Shot ${offCuts.map(s=>`${s.index} starts at ${sec(s.startSeconds)}`).join(', ')}`:`Cuts at ${view.shots.slice(1).map(s=>sec(s.startSeconds)).join(', ')}`):view.staged?'One shot, no cuts':'One continuous camera from the source video'},
   {label:'Beats fall on whole seconds',state:offBeats.length?'warn':'ok',detail:!view.beats.length?'No beats recorded':offBeats.length?`${offBeats.length} of ${view.beats.length} start or end between seconds. The timeline for the prompt groups them into whole seconds; the clay video carries the exact timing.`:`All ${view.beats.length} beats`},
   {label:'Heads and feet in frame in every shot',state:!framing?'wait':framing.problems.length?(view.staged?'fail':'warn'):'ok',detail:!framing?'Measuring the posed figures…':framing.problems.length?`${framing.problems.length} of ${framing.samples} moments checked have a problem${view.staged?'':'. The camera is the source video\'s, so this is how the video framed them'}`:`${framing.samples} moments checked. Least room above a head ${pct(framing.top)}, below the feet ${pct(framing.bottom)} of the picture's height`},
   ...(view.handovers.length?[{label:'Hands reach every time a prop changes hands or place',state:view.handovers.every(h=>h.reached)?'ok' as const:'fail' as const,detail:view.handovers.map(h=>`${h.prop}: ${h.kind==='throw'?`thrown by ${h.from} at ${sec(h.releasedAtSeconds)}, caught by ${h.to} at ${sec(h.changesHandsAtSeconds)}`:h.kind==='putDown'?`put down by ${h.by} at ${sec(h.changesHandsAtSeconds)}${h.on?` on the ${h.on}`:''}`:h.kind==='pickUp'?`picked up by ${h.by} at ${sec(h.changesHandsAtSeconds)}`:`${h.from} to ${h.to} at ${sec(h.changesHandsAtSeconds)}`}, standing ${h.standingApartMeters??h.standingAwayMeters} m ${h.standingApartMeters!==undefined?'apart':'away'}${h.reached?'':`; hands short by ${Object.entries(h.handsShortByMeters).map(([k,v])=>`${k} ${Math.round((v as number)*100)} cm`).join(', ')}: stand them closer`}`).join(' · ')}]:[]),
   ...(view.props.length?[{label:'Props in frame',state:!framing?'wait' as const:framing.propsOut.length?'warn' as const:'ok' as const,detail:!framing?'Measuring…':framing.propsOut.length?`Out of frame at ${framing.propsOut.slice(0,6).join(', ')}`:'Every prop is in the picture at every moment checked'}]:[]),
   {label:'Figures stay visible',state:!framing?'wait':framing.hidden<.6?'warn':'ok',detail:!framing?'Measuring…':`At worst ${pct(framing.hidden)} of a figure's outline is unhidden`},
   {label:'No overlays in the picture',state:'ok',detail:'The export draws no path lines, axes or camera markers'}];},[view,framing,total,frames]);

 const shotNow=view?1+Math.max(0,view.shots.findLastIndex(s=>s.startSeconds<=time+1e-6)):1,beatNow=view?.beats.filter(b=>time>=b.start-1e-6&&time<b.end)??[];
 const copy=(key:string,text:string)=>{navigator.clipboard?.writeText(text).then(()=>{setCopied(key);setTimeout(()=>setCopied(''),1500);}).catch(()=>setError('The browser did not allow copying'));};
 const runExport=()=>{if(!view)return;setExporting(true);setExported(null);setPlaying(false);tool('export_pair_reference',{pairId:view.pairId,figure,depth}).then(r=>setExported(r)).catch(e=>setError(e.message)).finally(()=>setExporting(false));};
 // editing: a copy of the scene as it was asked for; Apply stages it again under the next revision
 const dirty=!!(view?.spec&&draft&&JSON.stringify(draft)!==JSON.stringify(view.spec)),patch=(f:(d:any)=>void)=>setDraft((d:any)=>{const next=structuredClone(d);f(next);return next;});
 const lookKind=(c:any)=>Array.isArray(c.lookAt)?'point':c.lookAt,offGrid=draft?{cuts:draft.cameras.some((c:any)=>!whole(c.start)),beats:(draft.beats??[]).some((b:any)=>!whole(b.start)||!whole(b.end))}:{cuts:false,beats:false};
 const snapBeats=()=>patch(d=>{let prev=0;const end=Math.max(1,Math.floor(total));d.beats=(d.beats??[]).map((b:any)=>{let s=Math.max(prev,Math.round(b.start)),e=Math.round(b.end);if(e<=s)e=s+1;if(e>end){e=end;s=Math.min(s,e-1);}prev=e;return {...b,start:s,end:e};}).filter((b:any,i:number,all:any[])=>b.end>b.start&&(!i||b.start>=all[i-1].end));});
 const snapCuts=()=>patch(d=>{d.cameras.forEach((c:any,i:number)=>{c.start=i?Math.max(d.cameras[i-1].start+1,Math.round(c.start)):0;});});
 const apply=()=>{if(!view||!draft)return;setApplying(true);setNotice('');setPlaying(false);tool('stage_scene',{...draft,expectedRevision:view.revision}).then(r=>{setNotice(`Staged as revision ${r.revision}${r.handoverWarning?'. '+r.handoverWarning:''}`);setReload(n=>n+1);}).catch(e=>setError(e.message)).finally(()=>setApplying(false));};
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
    {view&&<div className="clay-edit"><div className="timeline-head"><span>EDIT THE SCENE</span><span>{!view.staged?'a pair from a video has no marks or authored cameras to edit':!draft?'staged before editing was built: stage it once more to edit here':dirty?'changed, not staged yet':'drag a mark, a camera or a look-at point'}</span></div>
     {view.staged&&draft&&<><div className="clay-edit-grid"><Plan spec={draft} colors={view.colors} onChange={setDraft}/>
      <div className="clay-shots"><table><thead><tr><th>Shot</th><th>Starts (s)</th><th>Lens (mm)</th><th>Height (m)</th><th>Looks at</th><th>At height (m)</th></tr></thead><tbody>{draft.cameras.map((c:any,i:number)=><tr key={i}>
        <td>{i+1}</td><td><input type="number" step={1} min={0} disabled={!i} value={c.start} onChange={e=>patch(d=>{d.cameras[i].start=+e.target.value;})}/></td>
        <td><input type="number" step={1} min={12} max={300} value={c.lens35} onChange={e=>patch(d=>{d.cameras[i].lens35=+e.target.value;})}/></td>
        <td><input type="number" step={.05} min={.1} max={6} value={c.position[1]} onChange={e=>patch(d=>{d.cameras[i].position[1]=+e.target.value;})}/></td>
        <td><select value={lookKind(c)} onChange={e=>patch(d=>{const v=e.target.value,cam=d.cameras[i];if(v==='point'){const m=d.performers.map((p:any)=>d.marks[p.start]);cam.lookAt=[(m[0][0]+m[1][0])/2,1,(m[0][1]+m[1][1])/2];delete cam.aim;}else cam.lookAt=v;})}><option value="point">a point (drag it)</option><option value="both">between the two</option>{draft.performers.map((p:any)=><option key={p.id} value={p.id}>{p.id}</option>)}{Object.keys(draft.marks).filter(m=>!draft.performers.some((p:any)=>p.id===m)).map(m=><option key={m} value={m}>mark: {m}</option>)}</select></td>
        <td>{Array.isArray(c.lookAt)?<input type="number" step={.05} min={0} max={4} value={c.lookAt[1]} onChange={e=>patch(d=>{d.cameras[i].lookAt[1]=+e.target.value;})}/>:'—'}</td></tr>)}</tbody></table>
       <div className="group"><button disabled={!offGrid.cuts} onClick={snapCuts}>Snap cuts to whole seconds</button><button disabled={!offGrid.beats} onClick={snapBeats}>Snap beats to whole seconds</button></div>
       <div className="group"><button className="primary" disabled={!dirty||applying} onClick={apply}>{applying?'Staging…':'Apply: stage again'}</button><button disabled={!dirty||applying} onClick={()=>setDraft(structuredClone(view.spec))}>Discard changes</button></div>
       <p>{notice||'Marks move where people stand, walk to and look. Nothing changes in the picture until Apply, which stages the scene again as a new revision. A camera that moves during its shot keeps its end point.'}</p></div></div></>}</div>}
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
