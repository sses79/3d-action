import {Action,clone,duration,trackValue,validateAction} from './action';
export function adaptMovement(source:Action,id:string,name:string,from:number,to:number,speed:number):Action{
 if(source.version!==2||!Number.isFinite(from)||!Number.isFinite(to)||from<0||to>1||to<=from||!Number.isFinite(speed)||speed<.5||speed>1.5)throw Error('Use an increasing 0–1 range and speed 0.5–1.5');
 const start=duration(source)*from,end=duration(source)*to;const a=clone(source);a.id=id;a.name=name;a.phases=[];let offset=0;
 for(const p of source.phases){const lo=Math.max(start,offset),hi=Math.min(end,offset+p.duration);if(hi>lo+1e-9){a.phases.push({...p,duration:(hi-lo)/speed,from:p.from+(p.to-p.from)*(lo-offset)/p.duration,to:p.from+(p.to-p.from)*(hi-offset)/p.duration});}offset+=p.duration;}
 const total=duration(a);const warp=(t:number)=>Math.max(0,Math.min(total,(t-start)/speed));a.tracks=source.tracks!.map(t=>({...t,keys:[{time:0,value:trackValue(t,start)},...t.keys.filter(k=>k.time>start+1e-9&&k.time<end-1e-9).map(k=>({time:warp(k.time),value:k.value})),{time:total,value:trackValue(t,end)}]}));a.cues=(source.cues||[]).filter(c=>c.time>=start&&c.time<=end).map(c=>({...c,time:warp(c.time)}));return validateAction(a);
}
