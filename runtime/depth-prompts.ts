// The prompts for a depth-library package (a tinted depth video with keyframes): one video prompt for a video model with the
// reference video as Video 1, and one image prompt per keyframe for regenerating it in another style. Used by the Depth library
// page (editor/depth.tsx) and by the service's cast_depth_clip, so both write the same text. A keyframe prompt names two layout
// references, the depth still and the frame of the source at that time: the video model holds the picture to the depth video's
// layout (seen in the courtyard test, 2026-10-18), so a keyframe drawn to another layout is overruled; matching it from the
// start keeps the keyframe and the video in agreement.
export type PackPeople={name:string;color:string;represents:string};
export type PackKey={time:number;shot:number;summary:string;people:{name:string;doing:string;speaking?:string;expression?:string}[]};
export type PackLike={duration:number;people:PackPeople[];shots:{index:number;start:number;end:number;camera:string}[];audio:{start:number;end:number;who?:string;kind:string;text:string}[];keyframes:PackKey[]};
export function packPrompts(pkg:PackLike,cast:Record<string,string>,style:string,useDepth:boolean){
const person=(n:string)=>pkg.people.find(p=>p.name===n)!,as=(n:string)=>cast[n]?.trim()||person(n).represents,fig=(n:string)=>useDepth?`the ${person(n).color}-tinted person`:`the ${person(n).color} figure`;
  const ks=pkg.keyframes,end=Math.round(pkg.duration),groups:{from:number;to:number;keys:typeof ks}[]=[];
  ks.forEach((k,i)=>{const from=Math.floor(k.time),to=i+1<ks.length?Math.max(from+1,Math.floor(ks[i+1].time)):Math.max(from+1,end),g=groups[groups.length-1];if(g&&g.to>from){g.keys.push(k);g.to=Math.max(g.to,to);}else groups.push({from,to,keys:[k]});});
  const line=(k:PackKey)=>`${k.summary} ${k.people.map(p=>`${fig(p.name)} ${p.doing}${p.expression&&!/not visible/.test(p.expression)?`, ${p.expression}`:''}${p.speaking?`, says: ${p.speaking}`:''}`).join('; ')}.`;
  const videoPrompt=[useDepth?`Reference video 1 is a depth map of the scene (white is near, black is far) with each person tinted one colour. Follow its camera, cuts, shot sizes, the layout of the room and where each person stands and moves; the tints only say who is who. Take no colours, greyness or lighting from it.`:`Reference video 1 is a coarse clay-model video. Follow its camera, cuts, shot sizes and where each figure stands and moves; take nothing of its look or lighting.`,
   ...pkg.people.filter(p=>ks.some(k=>k.people.some(q=>q.name===p.name))).map(p=>`${fig(p.name)[0].toUpperCase()+fig(p.name).slice(1)} is ${as(p.name)}.`),
   style.trim()?`Style: ${style.trim()}.`:'',
   ...groups.map((g,gi)=>{const seen=new Set(groups.slice(0,gi).flatMap(x=>x.keys.map(k=>k.shot))),sh=[...new Set(g.keys.map(k=>k.shot))].filter(n=>!seen.has(n)).map(n=>pkg.shots.find(s=>s.index===n)!);return `${g.from}-${g.to}s${sh.length?` (${sh.map(s=>`${gi>0?'cut to ':''}shot ${pkg.shots.indexOf(s)+1}: ${s.camera}`).join('; then ')})`:''}: ${g.keys.map(line).join(' ')}`.replace(/(\. )([a-z])/g,(_,p,c)=>p+c.toUpperCase());}),
   ...pkg.audio.filter(a=>a.kind==='speech').map(a=>`From ${Math.floor(a.start)}s ${fig(a.who!)} speaks.`),
   `${end} seconds, 16:9.`].filter(Boolean).join('\n');
  const images=ks.map((k,i)=>{const s=pkg.shots.find(x=>x.index===k.shot)!;return `Keyframe ${i+1}, ${k.time} s, shot ${pkg.shots.indexOf(s)+1} (${s.camera}). ${useDepth?`References: Image 1 is the depth still key-${i+1}-depth.jpg (white is near): keep exactly where each person stands, how near they are and the camera's framing. Image 2 is the source frame key-${i+1}-source.jpg: keep its room layout, architecture (walls, windows, arches, columns, doors, stairs), camera angle and light direction, because the reference video will hold the picture to that layout. Replace every person with the cast below and redraw everything${style.trim()?` as ${style.trim()}`:' in the scene\'s style'}; take no face, hair, costume or likeness from the source frame.`:`Use the clay still key-${i+1}-clay.jpg only for the camera angle, framing and where each figure stands.${style.trim()?` Draw it as ${style.trim()}.`:''}`} ${k.summary} ${k.people.map(p=>`${as(p.name)} (${fig(p.name)}): ${p.doing}${p.expression?`; face: ${p.expression}`:''}${p.speaking?`; speaking: ${p.speaking}`:''}`).join('. ')}.`;});
  return {videoPrompt,images};
}
