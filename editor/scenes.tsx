// Scenes page for viewers (docs/OWNED_SCENE_PLAN.md, part 1b): each scene performed as a text of ours, as perform.py made it:
// the captioned video, its card, cast (a body per role, performed again on request), lines (click to jump), keyframes and set.
// Only our own renders: the depth library, its source footage and depth stay on the producers' page (depth.html).
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';

const bridgeUrl=location.port==='5174'?'':'http://127.0.0.1:5174';
type Play={id:string;name:string;play:string;card:string|null;roles:Record<string,{name:string;character:string;seat:string|null}>;lines:{who:string;from:number;to:number;text:string}[];shots:{seconds:number;note:string}[];set:string[];seconds:number;made:any;job:{id:string;status:string;step:string|null;error?:string;finishedAt:string|null}|null};
const file=(id:string,f:string,v='')=>bridgeUrl+'/api/play-file?id='+encodeURIComponent(id)+'&file='+f+(v?'&v='+encodeURIComponent(v):'');
const nice=(s:string)=>s.replace(/-/g,' ');

function App(){
 const [plays,setPlays]=useState<Play[]|null>(null),[chars,setChars]=useState<string[]>([]),[err,setErr]=useState(''),[open,setOpen]=useState<string|null>(new URLSearchParams(location.search).get('scene'));
 const load=()=>fetch(bridgeUrl+'/api/plays').then(r=>r.json()).then(d=>{setPlays(d.plays);setChars(d.characters);return d.plays as Play[];}).catch(e=>{setErr('The service is not answering ('+e.message+').');return [] as Play[];});
 useEffect(()=>{load();},[]);
 const go=(id:string|null)=>{setOpen(id);history.replaceState(null,'',id?'?scene='+encodeURIComponent(id):location.pathname);};
 const p=plays?.find(x=>x.id===open);
 return <><header><div className="brand"><div className="brand-icon">◈</div><div><strong>SCENES</strong><small>Performed scenes: a shape of a scene, played as our own text</small></div></div></header>
  {err&&<div className="sc-error">{err}</div>}
  {!p?<div className="sc-grid">{plays?.map(x=><button key={x.id} className="sc-card" onClick={()=>go(x.id)}>
    {x.made?<img src={file(x.id,'key-1.jpg',x.made.at)} alt=""/>:<div className="sc-none">not performed yet</div>}
    <strong>{x.name}</strong><small>{x.seconds.toFixed(1)} s · {Object.values(x.roles).map(r=>r.name).join(', ')}</small></button>)}
    {plays&&!plays.length&&<p className="sc-help">No scenes yet.</p>}</div>
  :<Scene p={p} chars={chars} onBack={()=>go(null)} reload={load}/>}</>;
}

function Scene({p,chars,onBack,reload}:{p:Play;chars:string[];onBack:()=>void;reload:()=>Promise<Play[]>}){
 const video=useRef<HTMLVideoElement>(null),[time,setTime]=useState(0),[cast,setCast]=useState<Record<string,string>>({}),[err,setErr]=useState('');
 useEffect(()=>{setCast(Object.fromEntries(Object.entries(p.roles).map(([k,r])=>[k,r.character])));},[p.id,p.made?.at]);
 const live=!!p.job&&['queued','running'].includes(p.job.status);
 useEffect(()=>{if(!live)return;const t=setTimeout(()=>{reload();},4000);return ()=>clearTimeout(t);},[p,live]);
 const seek=(t:number)=>{const v=video.current;if(v){v.currentTime=t;v.play().catch(()=>{});}};
 const changed=Object.entries(cast).some(([k,c])=>c!==p.roles[k]?.character);
 const perform=async()=>{setErr('');const r=await fetch(bridgeUrl+'/api/plays/perform?id='+encodeURIComponent(p.id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cast})});const d=await r.json();if(d.error)setErr(d.error);reload();};
 const v=p.made?.at??'';
 return <div className="sc-layout"><main>
   <div className="sc-bar"><button onClick={onBack}>← Scenes</button><strong>{p.name}</strong><span>{p.seconds.toFixed(1)} s</span></div>
   {p.made?<video ref={video} className="sc-video" src={file(p.id,'captioned.mp4',v)} controls playsInline onTimeUpdate={e=>setTime((e.target as HTMLVideoElement).currentTime)}/>:<div className="sc-none big">Not performed yet.</div>}
   <h3>Lines</h3><ol className="sc-lines">{p.lines.map((l,i)=><li key={i} className={time>=l.from&&time<l.to?'now':''} onClick={()=>seek(l.from)}><b>{l.who}</b> {l.text}<small>{l.from.toFixed(1)} s</small></li>)}</ol>
   {p.made&&<><h3>Keyframes</h3><div className="sc-keys">{p.lines.map((l,i)=><figure key={i} onClick={()=>seek((l.from+l.to)/2)}><img src={file(p.id,`key-${i+1}.jpg`,v)} alt=""/><figcaption><b>{l.who}</b> {l.text}</figcaption></figure>)}</div></>}
  </main>
  <aside>
   <h2>THE SCENE</h2><p className="sc-help">{p.play}</p>{p.card&&<p className="sc-cardtext">{p.card}</p>}
   <h2>CAST</h2><div className="sc-cast">{Object.entries(p.roles).map(([k,r])=><label key={k}><span>{r.name}{r.seat?<small> · seated</small>:null}</span><select value={cast[k]??'mannequin'} disabled={live} onChange={e=>setCast({...cast,[k]:e.target.value})}><option value="mannequin">mannequin</option>{chars.map(c=><option key={c} value={c}>{nice(c)}</option>)}</select></label>)}</div>
   <button className="primary" disabled={live} onClick={perform}>{live?(p.job!.status==='queued'?'Queued…':'Performing…'):changed?'Perform with this cast':'Perform again'}</button>
   {live&&<p className="sc-help">About a minute.</p>}{p.job?.status==='failed'&&<p className="sc-error">Last performance failed: {String(p.job.error??'').slice(-200)}</p>}{err&&<p className="sc-error">{err}</p>}
   <h2>SHOTS</h2><ol className="sc-shots">{p.shots.map((s,i)=><li key={i}>{s.seconds.toFixed(1)} s · {s.note}</li>)}</ol>
   {p.set.length>0&&<><h2>SET</h2><p className="sc-help">{[...new Set(p.set)].map(nice).join(', ')}</p></>}
  </aside></div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
