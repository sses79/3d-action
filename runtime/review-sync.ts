export type ReviewSync={actionDuration:number;sourceWindow:number[];anchors:{actionTime:number;sourceTime:number;videoTime:number}[]};
export function reviewTime(sync:ReviewSync,time:number){
 const t=Math.max(0,Math.min(sync.actionDuration,time)),a=sync.anchors;
 for(let i=1;i<a.length;i++)if(t<=a[i].actionTime){const p=a[i-1],q=a[i],u=(t-p.actionTime)/(q.actionTime-p.actionTime);return {videoTime:p.videoTime+u*(q.videoTime-p.videoTime),sourceTime:p.sourceTime+u*(q.sourceTime-p.sourceTime),rate:(q.videoTime-p.videoTime)/(q.actionTime-p.actionTime)};}
 throw Error('Invalid review time mapping');
}
export function videoCorrection(current:number,target:number,playing:boolean,seeking:boolean){return !seeking&&Math.abs(current-target)>(playing?.08:.002);}
