import {readFile,writeFile} from 'node:fs/promises';
const inv=JSON.parse(await readFile('authoring/reviews/catalog/local-inventory.json'));
const semantics={
'guard':['kick','Upright arms-down hold used as kick entry/exit; despite its name, this is not a defensive guard','primitive'],
'kick':['kick','Coordinated forward kick with chamber, extension and recovery to upright arms-down stance','source-sequence'],
'punch':['unarmed-melee','Right cross from raised-arm guard with retraction to guard','source-sequence'],
'walk':['locomotion','Walk cycle in place; controller supplies directional travel','loop'],
'step-forward':['locomotion','Advancing walk segment with 0.53 m forward root travel; internal velocity seam needs review','primitive'],
'hook-quick':['unarmed-melee','Shortened fast hook that ends in low follow-through; requires separate recovery','primitive'],
'escape-slide-start':['escape-slide','Enter a low seated slide from running stride with forward root travel','primitive'],
'escape-slide-loop':['escape-slide','Short slide sustain with forward root travel; body/hand support unverified','loop'],
'escape-slide-exit':['escape-slide','Rise from slide into running stride with forward root travel; not standing finish','recovery'],
'escape-slide-standing':['escape-slide','Stationary upright arms-down finish at retained world position','primitive'],
'counter-ready':['block-counter','Stationary upright arms-down entry hold','primitive'],
'counter-guard':['block-counter','Hold raised-arm defensive stance; this segment holds rather than raises the arms','primitive'],
'counter-right-cross':['block-counter','Quick right cross followed by retraction toward guard','source-sequence'],
'counter-finish':['block-counter','Hold recovered raised-arm guard','primitive'],
'knockback-standing':['standing-hit-recovery','Lean back from chest hit while root retreats 0.50 m; stays upright','primitive'],
'knockback-step':['standing-hit-recovery','Walk-based catch step with backward root travel; step is adapted, not physically solved','primitive'],
'knockback-guard':['standing-hit-recovery','Hold raised-arm guard at retained world position','primitive'],
'knockback-ready':['standing-hit-recovery','Stationary upright arms-down entry hold','primitive']
};
const movements=inv.items.map(m=>{const [family,purpose,role]=semantics[m.id.slice(5)];return {id:m.id,clip:m.name,duration:m.duration,roles:[role],semantics:{family,purpose,equipment:'none',review:'candidate'},motionHash:m.motionHash,provenance:{library:'studio-local',sourceDescription:m.metadata.source,notes:m.metadata.notes,targetRig:'quaternius-ual1',reviewedRevision:m.revision}};});
await writeFile('authoring/contracts/studio-local.json',JSON.stringify({schemaVersion:1,movements,connections:[]},null,2)+'\n');
await writeFile('authoring/reviews/catalog/local-semantic-review.json',JSON.stringify({reviewedAt:new Date().toISOString(),reviewer:'llm-visual',scope:'Seven sampled source poses per Front/Side; source classification, not physical validation',sources:inv.items.map(m=>({id:m.id,revision:m.revision,motionHash:m.motionHash,artifact:'authoring/reviews/catalog/sheets/'+m.id+'.png'}))},null,2)+'\n');
