import React,{useEffect,useRef,useState} from 'react';
import {reviewTime,videoCorrection,ReviewSync} from '../runtime/review-sync';
export function ReviewVideo({url,sync,label,state,onError}:{url:string;sync:ReviewSync;label:string;state:React.MutableRefObject<{time:number;playing:boolean;speed:number}>;onError:(s:string)=>void}){
 const video=useRef<HTMLVideoElement>(null);const [ready,setReady]=useState(false);
 useEffect(()=>{let frame:number,disposed=false,playPending=false;const v=video.current!;let lastPlaying=false;
 function tick(){if(disposed)return;const s=state.current,m=reviewTime(sync,s.time);v.dataset.targetTime=m.videoTime.toFixed(4);v.dataset.sourceTime=m.sourceTime.toFixed(4);
  if(v.readyState>=1){if(videoCorrection(v.currentTime,m.videoTime,s.playing,v.seeking))v.currentTime=m.videoTime;
   v.playbackRate=Math.max(.0625,Math.min(16,s.speed*m.rate));
   if(!s.playing){v.pause();lastPlaying=false;}else if(v.paused&&!playPending&&(!lastPlaying||!v.ended)){playPending=true;v.play().then(()=>{lastPlaying=true;}).catch(()=>{onError('Reference video could not play. Press Play to retry.');lastPlaying=true;}).finally(()=>{playPending=false;});}
  }frame=requestAnimationFrame(tick);
 }frame=requestAnimationFrame(tick);return()=>{disposed=true;cancelAnimationFrame(frame);v.pause();};},[url,sync]);
 return <section className="review-video"><div className="review-label">SOURCE VIDEO <span>{label}</span></div><video ref={video} src={url} muted playsInline preload="auto" onLoadedData={()=>setReady(true)} onError={()=>onError('Could not load the reference video.')} aria-label="Synchronized reference video"/>{!ready&&<span className="review-loading">Loading reference…</span>}<small>Shared transport below · 2D observations / estimated 3D</small></section>;
}
