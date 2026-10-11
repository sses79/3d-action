import {Action} from './action';
// Other bodies for the same skeleton. The Studio mannequin and these share 65 joints, name for name, so every movement and
// action plays on them. What differs is the body's own proportions: the library's clips and baked tracks carry the mannequin's
// bone offsets, so on another body only the rotations are applied (plus the pelvis' position, which carries height), and the
// figure is then raised or lowered so its feet meet the floor.
export const characterFiles:Record<string,string|null>={mannequin:null,'superhero-female':'superhero-female.glb','superhero-male':'superhero-male.glb'};
const keeps=(track:string)=>track.endsWith('.quaternion')||track.startsWith('pelvis.')||!track.includes('.');
export function ownShapeClips(T:any,clips:any[]){return clips.map(c=>new T.AnimationClip(c.name,c.duration,c.tracks.filter((t:any)=>keeps(t.name))));}
const cache=new WeakMap<Action,Action>();
export function ownShapeAction(a:Action):Action{let b=cache.get(a);if(!b){b={...a,tracks:(a.tracks??[]).filter(t=>t.property==='rotation'||t.target==='$root'||t.target==='pelvis')};cache.set(a,b);}return b;}
// How high the ball of the foot sits over the sole, from the body's rest pose (call before posing; the model must be in the scene graph with its final scale).
export function ballHeight(T:any,root:any){root.updateMatrixWorld(true);const low=new T.Box3().setFromObject(root).min.y;return Math.min(...['ball_l','ball_r'].map(n=>root.getObjectByName(n).getWorldPosition(new T.Vector3()).y))-low;}
// How far to raise the figure so that, over the action, the lowest the balls of its feet come is their rest height over the floor.
export function floorLift(T:any,root:any,sample:(time:number)=>void,duration:number,rest:number){let low=Infinity;for(let k=0;k<=24;k++){sample(duration*k/24);root.updateMatrixWorld(true);for(const n of ['ball_l','ball_r'])low=Math.min(low,root.getObjectByName(n).getWorldPosition(new T.Vector3()).y);}return rest-low;}
