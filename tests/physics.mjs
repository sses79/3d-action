import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Exercise the actual embedded solver without a browser or GPU.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.split('<script type="module">')[1].split('</script>')[0];
const math = script.slice(script.indexOf('const clamp='), script.indexOf('function multiply'));
const physics = script.slice(script.indexOf('const R='), script.indexOf('function toast'));
const context = vm.createContext({ Math, Float32Array, Float64Array, Uint32Array, Map, Array, Number,
  matchMedia: () => ({ matches: false }), toast: () => {} });
vm.runInContext(math + physics + `
  globalThis.testState = () => ({
    count, tets: tetList.length, triangles: surface.length/3,
    ratio: totalVolume/restVolume, energy: kinetic, recoveries, time:simTime,
    finite: p.every(Number.isFinite),
    minY: Math.min(...Array.from({length:count},(_,i)=>p[i*3+1])),
    inverted: tetList.filter((t,i)=>volumeAt(p,...t)<-tetRest[i]*.1).length
  });
  globalThis.advance = n => { for(let i=0;i<n;i++)step(STEP); };
  globalThis.settings = (f,d) => {firmness=f;damping=d;};
  globalThis.restore = () => {p.set(initial);vel.fill(0);drag=null;};
  globalThis.dragCorner = () => {
    const id = rings[Z][L][A], k=id*3, restHit=Array.from(initial.slice(k,k+3)), hit=Array.from(p.slice(k,k+3)), nodes=[];
    for(let i=0;i<count;i++){
      const d=Math.hypot(initial[i*3]-restHit[0],initial[i*3+1]-restHit[1],initial[i*3+2]-restHit[2]);
      if(d<.48)nodes.push([i,Math.pow(1-d/.48,1.2),V.sub(Array.from(p.slice(i*3,i*3+3)),hit)]);
    }
    drag={restHit,nodes,target:[hit[0]-.7,hit[1]+.6,hit[2]+.35]};
  };
  globalThis.release = () => {drag=null;};
  globalThis.nudgeTest = () => {for(let i=0;i<count;i++){vel[i*3]+=1.1;vel[i*3+1]+=1.5;vel[i*3+2]-=.5;}};
  globalThis.manifold = () => {
    const m=new Map();
    for(let f=0;f<surface.length;f+=3)for(let j=0;j<3;j++){
      const a=surface[f+j],b=surface[f+(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(',');
      m.set(key,(m.get(key)||0)+1);
    }
    return [...m.values()].every(n=>n===2);
  };
`, context);
assert.equal(context.manifold(), true, 'the surface must be watertight with no internal faces');
const results=[];
function check(label) {
  const s=context.testState();
  assert(s.finite, `${label}: finite positions`);
  assert.equal(s.inverted,0,`${label}: no inverted tetrahedra`);
  assert(s.minY>=.0649,`${label}: floor collision`);
  assert(s.ratio>.92 && s.ratio<1.08,`${label}: volume within 8%`);
  if(label.startsWith('nudge'))assert(s.energy<1e-5,`${label}: motion settles instead of freezing`);
  results.push({label,...s});
}
context.advance(240);check('settle');
for(const [f,d] of [[0,0],[.45,.35],[1,1]]) {
  context.restore();context.settings(f,d);context.advance(120);
  for(let j=0;j<3;j++){
    context.dragCorner();context.advance(45);check(`drag ${f}/${d} #${j+1}`);
    context.release();context.advance(90);check(`release ${f}/${d} #${j+1}`);
  }
  context.nudgeTest();context.advance(360);check(`nudge settles ${f}/${d}`);
}
console.log(JSON.stringify({passed:true,results},null,2));
