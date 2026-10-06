import * as THREE from 'three/webgpu';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {WatchState} from './state.js';
const $=id=>document.getElementById(id), canvas=$('scene');
let saved={};try{saved=JSON.parse(localStorage.getItem('second-watch')||'{}');}catch{}
const state=new WatchState(saved), brand=$('brand');brand.value=typeof saved.brand==='string'?saved.brand.slice(0,14):'SECOND';
const inscription=$('inscription');inscription.value=typeof saved.inscription==='string'?saved.inscription.slice(0,32):'MAKE EVERY SECOND YOURS';
let renderer,scene,camera,controls,model,face,faceTexture,faceContext,finish='steel',lastFace='',lastUi='',auto=false;
const buttons=[],pickTargets=[],raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function persist(){try{localStorage.setItem('second-watch',JSON.stringify({...state.snapshot(),brand:brand.value,inscription:inscription.value,finish}));}catch{}}
function action(name){
  if(name==='light')state.light();if(name==='mode')state.modeButton();if(name==='adjust')state.adjust();
  const b=buttons.find(x=>x.userData.action===name);if(b&&!reduced)b.userData.pressed=performance.now();
  lastFace='';updateUI();persist();
}
document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>action(b.dataset.action)));
$('done').onclick=()=>{state.save();persist();lastFace='';updateUI();};
$('sync').onclick=()=>{state.sync();persist();lastFace='';updateUI();};
$('format').onclick=()=>{state.format24=!state.format24;persist();lastFace='';updateUI();};
$('reset-timer').onclick=()=>{state.resetStopwatch();lastFace='';updateUI();};
for(const input of [brand,inscription])input.addEventListener('input',()=>{lastFace='';lastUi='';persist();});
document.addEventListener('keydown',e=>{if(e.target.matches('input'))return;const key=e.key.toLowerCase();if(key==='l')action('light');if(key==='m')action('mode');if(key==='a')action('adjust');if(key==='enter'&&state.edit!==null){state.save();persist();lastFace='';updateUI();}});
function strings(){
  const d=state.date(), h=d.getHours(), pad=n=>String(n).padStart(2,'0');
  if(state.mode==='stopwatch'){
    const t=Math.floor(state.stopwatch()/10);return {time:`${pad(Math.floor(t/6000)%100)}:${pad(Math.floor(t/100)%60)}.${pad(t%100)}`,small:state.started===null?'READY / PAUSED':'RUNNING',date:'ELAPSED TIME',label:'STOPWATCH'};
  }
  return {time:`${pad(state.format24?h:(h%12||12))}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,small:state.format24?'24H':h>=12?'PM':'AM',date:d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}).toUpperCase(),label:state.edit!==null?`SET ${state.field.toUpperCase()}`:'LOCAL TIME'};
}
function updateUI(){
  const s=strings(),key=JSON.stringify([s,state.lit,state.edit!==null,state.format24]);if(key===lastUi)return;lastUi=key;
  $('time-output').textContent=s.time;$('mode-label').textContent=s.label;$('date-output').textContent=s.date;
  $('done').hidden=state.edit===null;$('reset-timer').hidden=state.mode!=='stopwatch';$('sync').hidden=state.mode==='stopwatch';
  $('format').textContent=state.format24?'24-hour':'12-hour';$('format').setAttribute('aria-pressed',String(state.format24));
  document.querySelector('[data-action="light"]').setAttribute('aria-pressed',String(state.lit));
  document.querySelector('[data-action="adjust"]').lastChild.textContent=state.mode==='stopwatch'?(state.started===null?'Start':'Stop'):(state.edit!==null?'+1':'Adjust');
  $('hint').textContent=state.edit!==null?'MODE selects hours or minutes. ADJUST adds one. Done saves the time.':state.mode==='stopwatch'?'ADJUST starts or stops the timer. MODE returns to the clock.':'ADJUST sets the time. MODE opens the stopwatch. LIGHT toggles the backlight.';
  canvas.dataset.watch=JSON.stringify({mode:state.mode,editing:state.edit!==null,field:state.field,lit:state.lit,time:s.time,brand:brand.value,finish,renderer:renderer?.backend?.isWebGPUBackend?'WebGPU':'WebGL2'});
}
const digitSegments={'0':'abcdef','1':'bc','2':'abdeg','3':'abcdg','4':'bcfg','5':'acdfg','6':'acdefg','7':'abc','8':'abcdefg','9':'abcdfg'};
function segmentDigit(ctx,d,x,y,w,h){
 const t=w*.15, half=h/2;const paths={a:[[t,0],[w-t,0],[w,t],[w-t,t*2],[t,t*2],[0,t]],g:[[t,half-t],[w-t,half-t],[w,half],[w-t,half+t],[t,half+t],[0,half]],d:[[t,h-2*t],[w-t,h-2*t],[w,h-t],[w-t,h],[t,h],[0,h-t]],f:[[0,t],[t,t*2],[t,half-t],[0,half],[-t,half-t],[-t,t*2]],b:[[w,t],[w+t,t*2],[w+t,half-t],[w,half],[w-t,half-t],[w-t,t*2]],e:[[0,half],[t,half+t],[t,h-2*t],[0,h-t],[-t,h-2*t],[-t,half+t]],c:[[w,half],[w+t,half+t],[w+t,h-2*t],[w,h-t],[w-t,h-2*t],[w-t,half+t]]};
 for(const [key,points] of Object.entries(paths)){ctx.fillStyle=(digitSegments[d]||'').includes(key)?'#263524':(state.lit?'#a6d8ba':'#a3af7d');ctx.beginPath();points.forEach(([px,py],i)=>i?ctx.lineTo(x+px,y+py):ctx.moveTo(x+px,y+py));ctx.closePath();ctx.fill();}
}
function drawFace(){
 if(!faceContext)return;const s=strings(),blink=state.edit!==null&&Math.floor(performance.now()/450)%2===0;
 const key=JSON.stringify([s,brand.value,inscription.value,state.lit,blink,state.field]);if(key===lastFace)return;lastFace=key;
 const c=faceContext;c.fillStyle='#121b1a';c.fillRect(0,0,1024,960);
 c.strokeStyle='#738277';c.lineWidth=2;c.strokeRect(54,70,916,825);
 c.textAlign='center';c.fillStyle='#e1e2d5';c.font='500 68px Arial';c.fillText((brand.value.trim()||'SECOND').toUpperCase(),512,185);
 c.fillStyle='#9faea4';c.font='21px Arial';c.fillText('DIGITAL / STUDIO EDITION',512,231);
 const gradient=c.createLinearGradient(0,320,0,680);gradient.addColorStop(0,state.lit?'#bef3d7':'#b6c28f');gradient.addColorStop(1,state.lit?'#9cd9b6':'#98aa73');
 c.fillStyle='#080f0e';c.fillRect(102,301,820,408);c.fillStyle=gradient;c.fillRect(118,317,788,375);
 c.fillStyle='#30442c';c.font='24px monospace';c.textAlign='left';c.fillText(s.label,146,365);c.textAlign='right';c.fillText(s.small,877,365);
 const text=s.time.replace('.',':');let x=163;const w=69,h=150,gap=23;
 for(let i=0;i<text.length;i++){
  const ch=text[i];if(ch===':'){c.fillStyle='#263524';c.fillRect(x-2,447,8,8);c.fillRect(x-2,510,8,8);x+=28;continue;}
  const hide=blink&&((state.field==='hours'&&i<2)||(state.field==='minutes'&&i>=3&&i<=4));if(!hide)segmentDigit(c,ch,x,417,w,h);x+=w+gap;
 }
 c.textAlign='left';c.fillStyle='#3a4a31';c.font='22px monospace';c.fillText(s.date,146,649);
 c.textAlign='center';c.fillStyle='#95a89d';c.font='20px Arial';c.fillText('LIGHT  /  MODE  /  ADJUST',512,779);c.fillStyle='#e0e2d3';c.font='23px Arial';c.fillText(inscription.value.toUpperCase(),512,851);
 faceTexture.needsUpdate=true;
}
function setFinish(value){finish=value;
 const colors={steel:0xffffff,gold:0xd7b976,dark:0x56615c};
 if(model)model.traverse(o=>{if(o.isMesh&&o!==face&&o.material.userData.body)o.material.color.setHex(colors[value]||colors.steel);});
 document.querySelectorAll('[data-finish]').forEach(b=>b.classList.toggle('selected',b.dataset.finish===value));persist();lastUi='';updateUI();
}
document.querySelectorAll('[data-finish]').forEach(b=>b.onclick=()=>setFinish(b.dataset.finish));
function view(full){
 if(!camera)return;controls.target.set(0,full?-2:0,0);camera.position.set(full?3:1.3,full?3:.6,full?37:11.8);controls.minDistance=full?14:5;controls.maxDistance=full?50:22;controls.update();
 $('face-view').classList.toggle('selected',!full);$('full-view').classList.toggle('selected',full);
}
$('face-view').onclick=()=>view(false);$('full-view').onclick=()=>view(true);$('turn-view').onclick=()=>{auto=!auto;$('turn-view').classList.toggle('selected',auto);$('turn-view').setAttribute('aria-pressed',String(auto));};
function boundsFromIndices(geometry){const box=new THREE.Box3();const v=new THREE.Vector3();for(const i of geometry.index.array)box.expandByPoint(v.fromBufferAttribute(geometry.attributes.position,i));geometry.boundingBox=box;geometry.boundingSphere=box.getBoundingSphere(new THREE.Sphere());return box;}
async function init(){
 renderer=new THREE.WebGPURenderer({canvas,antialias:true,alpha:true});await renderer.init();renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(36,1,.05,100);controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.enablePan=false;controls.dampingFactor=.08;
 const env=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(env,.04).texture;scene.environmentIntensity=1.5;env.dispose();pmrem.dispose();
 scene.add(new THREE.HemisphereLight(0xffffff,0x83937a,2));const key=new THREE.DirectionalLight(0xfff5dc,3);key.position.set(-3,6,8);scene.add(key);const rim=new THREE.DirectionalLight(0xd1e1ff,2);rim.position.set(4,-1,5);scene.add(rim);
 const gltf=await new GLTFLoader().loadAsync('assets/watch.glb');model=gltf.scene;model.scale.setScalar(100);model.rotation.x=Math.PI/2;model.rotation.z=-.1;scene.add(model);
 const bodyMat=gltf.scene.getObjectByName('case')?.material?.clone() || new THREE.MeshStandardMaterial();bodyMat.userData.body=true;bodyMat.normalScale.set(.4,.4);
 model.traverse(o=>{
  if(!o.isMesh)return;o.material=bodyMat;
  if(o.name==='custom_face'){
   face=o;o.position.y=.00604;
   // Fill the original face's LCD opening using its exact outer convex outline.
   const original=o.geometry, points=[...new Set([...original.index.array].map(i=>`${original.attributes.position.getX(i)},${-original.attributes.position.getZ(i)}`))].map(p=>p.split(',').map(Number)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
   const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
   const lower=[],upper=[];for(const p of points){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(const p of [...points].reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
   const hull=[...lower.slice(0,-1),...upper.slice(0,-1)],shape=new THREE.Shape(hull.map(p=>new THREE.Vector2(...p))),g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);
   const uv=new Float32Array(g.attributes.position.count*2),p=g.attributes.position;
   for(let i=0;i<p.count;i++){uv[i*2]=(p.getX(i)+.014586148)/.029172296;uv[i*2+1]=(.013611153-p.getZ(i))/.027222306;}
   g.setAttribute('uv',new THREE.BufferAttribute(uv,2));o.geometry=g;
   const c=document.createElement('canvas');c.width=1024;c.height=960;faceContext=c.getContext('2d');faceTexture=new THREE.CanvasTexture(c);faceTexture.colorSpace=THREE.SRGBColorSpace;faceTexture.anisotropy=4;
   o.material=new THREE.MeshBasicMaterial({map:faceTexture,toneMapped:false});
  }
  if(o.name.startsWith('button_')){
   o.geometry=o.geometry.clone();const box=boundsFromIndices(o.geometry),center=box.getCenter(new THREE.Vector3());o.geometry.translate(-center.x,-center.y,-center.z);o.position.copy(center);boundsFromIndices(o.geometry);
   o.userData.action=o.name.slice(7);o.userData.rest=center.clone();o.userData.pressed=-10000;buttons.push(o);
   const hit=new THREE.Mesh(new THREE.BoxGeometry(.007,.008,.007),new THREE.MeshBasicMaterial({visible:false}));hit.position.copy(center);hit.userData.action=o.userData.action;pickTargets.push(hit);
  }
 });
 for(const hit of pickTargets)model.add(hit);
 if(!face||buttons.length!==3)throw new Error('The watch is missing its face or button parts.');
 setFinish(['steel','gold','dark'].includes(saved.finish)?saved.finish:'steel');view(false);
 const resize=()=>{const rect=canvas.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe(canvas);resize();
 const isGPU=renderer.backend.isWebGPUBackend;$('renderer').textContent=isGPU?'THREE.JS / WEBGPU':'THREE.JS / WEBGL2';$('loading').hidden=true;
 canvas.dataset.ready='true';
 let down=null;canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
 canvas.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>8){down=null;return;}down=null;
  const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(pickTargets,false);if(hits.length){
   // Ignore button regions hidden behind the body when the watch is turned over.
   const bodyHits=raycaster.intersectObject(model,true).filter(h=>h.object.isMesh&&h.object.material.visible!==false);if(!bodyHits.length||hits[0].distance<=bodyHits[0].distance+.3)action(hits[0].object.userData.action);
  }
 });
 canvas.addEventListener('pointercancel',()=>{down=null;});
 canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);canvas.style.cursor=raycaster.intersectObjects(pickTargets,false).length?'pointer':'grab';});
 renderer.setAnimationLoop(()=>{
  controls.autoRotate=auto;controls.autoRotateSpeed=.65;controls.update();
  for(const b of buttons){const age=performance.now()-b.userData.pressed,amount=age<230?Math.sin(Math.PI*age/230)*.00055:0;b.position.copy(b.userData.rest);b.position.x+=b.userData.rest.x<0?amount:-amount;}
  drawFace();updateUI();renderer.render(scene,camera);
 });
}
init().catch(error=>{console.error(error);$('loading').hidden=false;$('loading').textContent='The 3D viewer could not start. Reload in a browser with WebGPU or WebGL2.';$('renderer').textContent='Viewer unavailable';canvas.dataset.error=error.message;setInterval(updateUI,100);});
updateUI();
