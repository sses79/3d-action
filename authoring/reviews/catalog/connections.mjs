import {readFile,writeFile} from 'node:fs/promises';
const dir='authoring/reviews/catalog',inv=JSON.parse(await readFile(dir+'/inventory.json')),local=JSON.parse(await readFile(dir+'/local-inventory.json')),all=[...inv.items,...local.items],catalogPath='authoring/contracts/ual2-standard.json',localPath='authoring/contracts/studio-local.json',catalog=JSON.parse(await readFile(catalogPath)),lc=JSON.parse(await readFile(localPath));
const rows=[
['knockback-to-getup','move-ual2-hit-knockback','move-ual2-laytoidle','recover',1],
['hook-to-recovery','move-ual2-melee-hook','move-ual2-melee-hook-rec','recover',1],
['ninja-start-to-hold','move-ual2-ninjajump-start','move-ual2-ninjajump-idle-loop','continue',1],
['ninja-hold-to-land','move-ual2-ninjajump-idle-loop','move-ual2-ninjajump-land','recover',1],
['shield-hold-to-break','move-ual2-idle-shield-loop','move-ual2-idle-shield-break','continue',1],
['zombie-idle-to-scratch','move-ual2-zombie-idle-loop','move-ual2-zombie-scratch','continue',1],
['zombie-scratch-to-idle','move-ual2-zombie-scratch','move-ual2-zombie-idle-loop','recover',1],
['rail-idle-to-call','move-ual2-idle-rail-loop','move-ual2-idle-rail-call','continue',1.5],
['rail-call-to-idle','move-ual2-idle-rail-call','move-ual2-idle-rail-loop','recover',1.5],
['kick-entry','move-guard','move-kick','continue',1],
['kick-return','move-kick','move-guard','recover',1],
['quick-hook-recovery','move-hook-quick','move-ual2-melee-hook-rec','recover',1],
['escape-start-to-loop','move-escape-slide-start','move-escape-slide-loop','continue',1],
['escape-loop-to-exit','move-escape-slide-loop','move-escape-slide-exit','recover',1],
['escape-exit-to-standing','move-escape-slide-exit','move-escape-slide-standing','recover',1],
['counter-ready-to-guard','move-counter-ready','move-counter-guard','continue',1],
['counter-guard-to-cross','move-counter-guard','move-counter-right-cross','continue',1],
['counter-cross-to-finish','move-counter-right-cross','move-counter-finish','recover',1],
['standing-hit-entry','move-knockback-ready','move-knockback-standing','continue',1],
['standing-hit-to-step','move-knockback-standing','move-knockback-step','recover',1],
['standing-step-to-guard','move-knockback-step','move-knockback-guard','recover',1]
];
for(const [id,from,to,purpose] of rows){const a=all.find(m=>m.id===from),b=all.find(m=>m.id===to),x=a.profile.exit,y=b.profile.entry;const pos=Math.sqrt(x.positions.reduce((n,p,i)=>n+p.reduce((n,v,k)=>n+(v-y.positions[i][k])**2,0),0)/x.positions.length),rot=Math.sqrt(x.rotations.reduce((n,q,i)=>{const dot=Math.min(1,Math.abs(q.reduce((n,v,k)=>n+v*y.rotations[i][k],0)));return n+(2*Math.acos(dot))**2;},0)/x.rotations.length)*180/Math.PI;const c={id,from,to,fromHash:a.motionHash,toHash:b.motionHash,purpose,policy:'positive-pose-blend-no-anchor',review:'candidate',evidence:{representation:'Revision-pinned normalized rig endpoints and sampled source review in authoring/reviews/catalog; source-only semantic selection, compiled seam review pending',positionRmsMeters:pos,rotationRmsDegrees:rot,visualReview:'pending',trajectoryValidation:'not-performed'}};const list=from.startsWith('move-ual2-')&&to.startsWith('move-ual2-')?catalog.connections:lc.connections;const i=list.findIndex(c=>c.id===id);if(i<0)list.push(c);else list[i]=c;}
await writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n');await writeFile(localPath,JSON.stringify(lc,null,2)+'\n');await writeFile(dir+'/pair-plans.json',JSON.stringify(rows.map(([id,from,to,purpose,speed])=>({id,from,to,purpose,speed,transition:.06})),null,2)+'\n');console.log('Prepared '+rows.length+' purposeful candidate pairs');
