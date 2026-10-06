import * as T from 'three/webgpu';
// Cubic Hermite positions and spherical Bezier rotations match sampled endpoint velocities.
export function hermite(a:T.Vector3,b:T.Vector3,va:T.Vector3,vb:T.Vector3,t:number,seconds:number){const t2=t*t,t3=t2*t;return a.clone().multiplyScalar(2*t3-3*t2+1).addScaledVector(va,(t3-2*t2+t)*seconds).addScaledVector(b,-2*t3+3*t2).addScaledVector(vb,(t3-t2)*seconds);}
function tangent(a:T.Quaternion,b:T.Quaternion,factor:number){const d=a.clone().invert().multiply(b).normalize();if(d.w<0)d.set(-d.x,-d.y,-d.z,-d.w);const v=new T.Vector3(d.x,d.y,d.z),length=v.length();if(length<1e-10)return new T.Quaternion();const angle=Math.atan2(length,d.w)*factor;v.multiplyScalar(Math.sin(angle)/length);return new T.Quaternion(v.x,v.y,v.z,Math.cos(angle));}
export function rotationBridge(a:T.Quaternion,b:T.Quaternion,before:T.Quaternion,after:T.Quaternion,t:number,seconds:number,fromWindow:number,toWindow:number){
 const c=a.clone().multiply(tangent(before,a,seconds/(3*fromWindow))),d=b.clone().multiply(tangent(b,after,-seconds/(3*toWindow)));
 const ab=a.clone().slerp(c,t),bc=c.clone().slerp(d,t),cd=d.clone().slerp(b,t);return ab.slerp(bc,t).slerp(bc.slerp(cd,t),t).normalize();
}
