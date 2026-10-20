// The prompts for a depth-library package (a tinted depth video with keyframes): one video prompt for a video model with the
// reference video as Video 1, and one image prompt per keyframe for regenerating it in another style. Used by the Depth library
// page (editor/depth.tsx) and by the service's cast_depth_clip, so both write the same text. A keyframe prompt names two layout
// references, the depth still and the frame of the source at that time: the video model holds the picture to the depth video's
// layout (seen in the courtyard test, 2026-10-18), so a keyframe drawn to another layout is overruled; matching it from the
// start keeps the keyframe and the video in agreement.
export type PackPeople={name:string;color:string;represents:string};
export type PackKey={layout?:Record<string,{side:string;area:number}>;time:number;shot:number;summary:string;people:{name:string;doing:string;speaking?:string;expression?:string}[]};
export type Beat={actor:string;verb:string;target?:string;contact?:string;change?:string;avoid?:string;peak?:number;start:number;end:number};
export type PackLike={beats?:Beat[];summary?:string;duration:number;people:PackPeople[];shots:{index:number;start:number;end:number;camera:string}[];audio:{start:number;end:number;who?:string;kind:string;text:string}[];keyframes:PackKey[]};
// How many beats a clip can carry (docs/DEPTH_REFERENCE_IMPROVEMENT_PLAN.md): about 1.5-2.5 s each, so a 5 s clip holds 2-3 and
// a 4 s clip 2; one beat over 4 s or more usually needs no control video (a keyframe and the prompt carry it) unless the camera
// moves, someone travels or a contact must land at a time.
export function beatRule(duration:number,beats:Beat[]){const faults:string[]=[],notes:string[]=[],max=Math.max(1,Math.floor(duration/1.5));
 if(!beats.length)faults.push('no beats');if(beats.length>max)faults.push(`${beats.length} beats in ${duration.toFixed(1)} s: at most ${max} (about 1.5-2.5 s each)`);
 beats.forEach((b,i)=>{const len=b.end-b.start;if(len<1.2-1e-6)faults.push(`beat ${i+1} lasts ${len.toFixed(2)} s: at least 1.2 s (1.5 s or more reads better)`);else if(len<1.5)notes.push(`beat ${i+1} is short (${len.toFixed(2)} s)`);
  if(i&&Math.abs(b.start-beats[i-1].end)>.05)notes.push(`a gap or overlap between beats ${i} and ${i+1}`);if(Math.abs(b.start-Math.round(b.start))>.15&&i)notes.push(`beat ${i+1} starts at ${b.start.toFixed(2)} s: whole seconds bind better to the prompt's timestamps`);});
 if(beats.length&&(beats[0].start>.05||Math.abs(beats[beats.length-1].end-duration)>.1))notes.push('the beats do not cover the whole clip');
 const oneBeat=beats.length===1&&duration>=4;if(oneBeat)notes.push('one beat over the whole clip: this may need no control video (a keyframe and the prompt can carry it) unless the camera moves, someone travels or a contact must land on time');
 return {ok:!faults.length,faults,notes,maxBeats:max,mayNotNeedControl:oneBeat};}
export function packPrompts(pkg:PackLike,cast:Record<string,string>,style:string,useDepth:boolean){
const person=(n:string)=>pkg.people.find(p=>p.name===n)!,as=(n:string)=>cast[n]?.trim()||person(n).represents,fig=(n:string)=>useDepth?`the ${person(n).color}-tinted person`:`the ${person(n).color} figure`;
  const ks=pkg.keyframes,end=Math.round(pkg.duration),groups:{from:number;to:number;keys:typeof ks}[]=[];
  ks.forEach((k,i)=>{const from=Math.floor(k.time),to=i+1<ks.length?Math.max(from+1,Math.floor(ks[i+1].time)):Math.max(from+1,end),g=groups[groups.length-1];if(g&&g.to>from){g.keys.push(k);g.to=Math.max(g.to,to);}else groups.push({from,to,keys:[k]});});
  const who=(n?:string)=>!n?'':pkg.people.some(p=>p.name===n)?fig(n):n;
  const named=(x:string)=>pkg.people.reduce((t,p)=>p.name.length>1?t.replace(new RegExp(`\\b${p.name}\\b`,'gi'),fig(p.name)):t.replace(new RegExp(`\\b${p.name}\\b`,'g'),fig(p.name)),x);  // a person's name in the contact or change text is said as they appear in the reference
  const beatText=(b:Beat)=>`${who(b.actor)} ${b.verb}${b.target?' '+who(b.target):''}${b.contact?`; contact: ${named(b.contact)}`:''}${b.change?`; ${named(b.change)}`:''}`;
  const beatLines=()=>pkg.beats!.map((b,i)=>{const cut=pkg.shots.filter(s=>s.start>b.start+.05&&s.start<b.end-.05).map(s=>`cut to shot ${pkg.shots.indexOf(s)+1} (${s.camera})`);const a=Math.round(b.start),z=Math.max(a+1,Math.round(b.end));return `${a}-${z}s, beat ${i+1}: ${beatText(b)}${cut.length?` [${cut.join('; ')}]`:''}.`.replace(/^(.*?beat \d+: )the/,(_,p)=>p+'The');});
  const beatAt=(t:number)=>{const i=pkg.beats?.findIndex(b=>b.start-1e-3<=t&&t<b.end+1e-3)??-1;return i<0?'':`Beat ${i+1} of ${pkg.beats!.length}: ${beatText(pkg.beats![i])}. `;};
  const line=(k:PackKey)=>`${k.summary} ${k.people.map(p=>`${fig(p.name)} ${p.doing}${p.expression&&!/not visible/.test(p.expression)?`, ${p.expression}`:''}${p.speaking?`, says: ${p.speaking}`:''}`).join('; ')}.`;
  const videoPrompt=[useDepth?`Reference video 1 is a depth map of the scene (white is near, black is far) with each person tinted one colour. Follow its camera, cuts, shot sizes, the layout of the room and where each person stands and moves; the tints only say who is who. Take no colours, greyness or lighting from it.`:`Reference video 1 is a coarse clay-model video. Follow its camera, cuts, shot sizes and where each figure stands and moves; take nothing of its look or lighting.`,
   ...pkg.people.filter(p=>ks.some(k=>k.people.some(q=>q.name===p.name))).map(p=>`${fig(p.name)[0].toUpperCase()+fig(p.name).slice(1)} is ${as(p.name)}.`),
   style.trim()?`Style: ${style.trim()}.`:'',
   ...(pkg.beats?.length?[pkg.summary?`The action, in ${pkg.beats.length} beat${pkg.beats.length>1?'s':''}: ${pkg.summary}.`:'',...beatLines()]:groups.map((g,gi)=>{const seen=new Set(groups.slice(0,gi).flatMap(x=>x.keys.map(k=>k.shot))),sh=[...new Set(g.keys.map(k=>k.shot))].filter(n=>!seen.has(n)).map(n=>pkg.shots.find(s=>s.index===n)!);return `${g.from}-${g.to}s${sh.length?` (${sh.map(s=>`${gi>0?'cut to ':''}shot ${pkg.shots.indexOf(s)+1}: ${s.camera}`).join('; then ')})`:''}: ${g.keys.map(line).join(' ')}`.replace(/(\. )([a-z])/g,(_,p,c)=>p+c.toUpperCase());})),
   ...pkg.audio.filter(a=>a.kind==='speech').map(a=>`From ${Math.floor(a.start)}s ${fig(a.who!)} speaks.`),
   `${end} seconds, 16:9.`].filter(Boolean).join('\n');
  const images=ks.map((k,i)=>{const s=pkg.shots.find(x=>x.index===k.shot)!;return `Keyframe ${i+1}, ${k.time} s, shot ${pkg.shots.indexOf(s)+1} (${s.camera}). ${beatAt(k.time)}${useDepth?`References: Image 1 is the depth still key-${i+1}-depth.jpg (white is near): keep exactly where each person stands, how near they are and the camera's framing. Image 2 is the source frame key-${i+1}-source.jpg: keep its room layout, architecture (walls, windows, arches, columns, doors, stairs), camera angle and light direction, because the reference video will hold the picture to that layout. Replace every person with the cast below and redraw everything${style.trim()?` as ${style.trim()}`:' in the scene\'s style'}; take no face, hair, costume or likeness from the source frame.`:`Use the clay still key-${i+1}-clay.jpg only for the camera angle, framing and where each figure stands.${style.trim()?` Draw it as ${style.trim()}.`:''}`} ${k.summary} ${k.people.map(p=>`${as(p.name)} (${fig(p.name)}): ${p.doing}${p.expression?`; face: ${p.expression}`:''}${p.speaking?`; speaking: ${p.speaking}`:''}`).join('. ')}.`;});
  return {videoPrompt,images};
}

// The hand-over to keyframe generation (docs/DEPTH_REFERENCE_IMPROVEMENT_PLAN.md, "The keyframe image prompt"): per keyframe, in order,
// its beat, the contact, where each person is, what changed since the previous keyframe (which is passed as an image: keyframes are
// generated in order, each from the last approved one), the references in their order and the prompt. Image numbers count the
// references as listed; the character sheets come last.
export function keyframeHandover(pkg:PackLike,cast:Record<string,string>,style:string,files:{depth:(i:number)=>string;source:(i:number)=>string;contact?:(i:number)=>string|null}){
 const name=(n:string)=>cast[n]?.trim()?cast[n].trim().split(/[:,(]/)[0].trim():(pkg.people.find(p=>p.name===n)?.represents??n);
 const said=(x:string)=>pkg.people.reduce((t,p)=>t.replace(new RegExp(`\\b${p.name}\\b`,p.name.length>1?'gi':'g'),name(p.name)),x);
 const cutBetween=(a:number,b:number)=>pkg.shots.some(s=>s.start>a+1e-3&&s.start<=b);
 const beatOf=(t:number)=>{const i=pkg.beats?.findIndex(b=>b.start-1e-3<=t&&t<b.end+1e-3)??-1;return i<0?null:{i,b:pkg.beats![i]};};
 const size=(k:PackKey)=>{const a=Math.max(0,...Object.values(k.layout??{}).map(x=>x.area));return a>.45?'tight: the people fill most of the frame':a>.15?'medium: the people fill a good part of the frame':'wide: the people are small in the frame';};
 return pkg.keyframes.map((k,i)=>{const bb=beatOf(k.time),prev=i?pkg.keyframes[i-1]:null,pb=prev?beatOf(prev.time):null,contact=files.contact?.(i+1)??null;
  const refs=[{role:'depth still: framing, where each person stands and how near (white is near; the tints only say who is who)',file:files.depth(i+1)},{role:'source frame: room, architecture, camera angle, light, and who touches what; replace every person, take no likeness',file:files.source(i+1)},...(contact?[{role:'contact card: whose hand is on what',file:contact}]:[]),...(prev?[{role:`keyframe ${i} as generated and approved: continuity (the same people, sides, arms and what is held)`,file:`keyframe-${i}.png (yours)`}]:[]),{role:'character sheets',file:'yours'}];
  const sides=Object.entries(k.layout??{}).map(([n,l])=>`${name(n)} at screen ${l.side}`).join(', ');
  const people=bb?[bb.b.actor,...(bb.b.target?[bb.b.target]:[])]:Object.keys(k.layout??{});
  const lines=[`Keyframe ${i+1} of ${pkg.keyframes.length}, at ${k.time} s.`,
   bb?`Beat ${bb.i+1} of ${pkg.beats!.length}: ${said(`${bb.b.actor} ${bb.b.verb}${bb.b.target?' '+bb.b.target:''}`)}${bb.b.change?`; ${said(bb.b.change)}`:''}.`:'The opening frame.',
   bb?.b.contact?`Contact: ${said(bb.b.contact)}.`:'',
   sides?`${sides[0].toUpperCase()+sides.slice(1)}.`:'',
   ...people.filter((n,j,a)=>a.indexOf(n)===j&&!(k.layout??{})[n]).map(n=>`${name(n)} is not coloured in the depth still here: take where he is and what he touches from the source frame.`),
   people.length>1?`Exactly two arms per person; every hand is joined to a visible arm of its owner.`:'',
   prev?(pb&&bb&&pb.i!==bb.i?`Since keyframe ${i}: the next beat has begun.`:`Since keyframe ${i}: the same beat, a moment later${bb?.b.change?` (${said(bb.b.change)})`:''}.`)+(cutBetween(prev.time,k.time)?` There is a cut since keyframe ${i}: Image ${refs.findIndex(r=>r.role.startsWith('keyframe'))+1} is keyframe ${i}; keep the same people, costumes, arms and what is held, not its framing.`:` Image ${refs.findIndex(r=>r.role.startsWith('keyframe'))+1} is keyframe ${i}: keep the same people, sides, arms and what is held.`):'',
   `Image 1 is the depth still: keep its framing, positions and nearness exactly. Image 2 is the source frame: keep its room, architecture, camera angle and light, and read from it who touches what.${contact?' Image 3 is the contact card: follow its hands.':''} The character sheets give the faces and costumes.`,
   `Do not copy from the source frame: any face, costume or likeness, or props and actions that are not in this beat${bb?.b.avoid?` (${said(bb.b.avoid)})`:''}.`,
   `Crop: the same as the depth still, ${size(k)}.`,
   ...people.filter((n,j,a)=>a.indexOf(n)===j).map(n=>{const c=cast[n]?.trim();if(!c)return '';const d=c.toLowerCase().startsWith(name(n).toLowerCase()+':')?c.slice(name(n).length+1).trim():c;return `${name(n)}: ${d}.`;}),
   style.trim()?`Draw it as ${style.trim()}.`:''].filter(Boolean);
  return {index:i+1,time:k.time,beat:bb?{n:bb.i+1,of:pkg.beats!.length,...bb.b}:null,layout:k.layout??null,previous:prev?{index:i,time:prev.time}:null,references:refs.map((r,j)=>({image:j+1,...r})),prompt:lines.join(' ')};});
}

