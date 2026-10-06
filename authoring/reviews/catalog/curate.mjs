import {readFile,writeFile} from 'node:fs/promises';
const rows=[
['a-tpose','rig-reference','Static T-pose for rig reference; not a gameplay guard','none'],
['chest-open','object-interaction','Bend forward and reach toward a low container, then return upright','container; absent in mannequin preview'],
['climbup-1m','obstacle-traversal','Running climb/vault gesture in place; controller must supply obstacle alignment and world trajectory','obstacle; absent in mannequin preview'],
['consume','object-interaction','Raise hand toward head in a consuming gesture and return','consumable; absent in mannequin preview'],
['farm-harvest','farming','Bend deeply and gather near the ground, then stand','harvest target; absent in mannequin preview'],
['farm-plantseed','farming','Lower into a crouch/kneel and reach toward the ground, then stand','seed and ground target; absent in mannequin preview'],
['farm-watering','farming','Hold and tilt arms in a watering gesture while standing','watering can and target; absent in mannequin preview'],
['hit-knockback','hit-recovery','React to a hit, fall backward and end lying down; does not regain guard','none'],
['idle-foldarms-loop','social-idle','Standing folded-arm hold with small body shifts','none','loop'],
['idle-lantern-loop','equipment-idle','Standing hold with one arm extended for a lantern','lantern; absent in mannequin preview','loop'],
['idle-no-loop','social-idle','Standing idle with small head and body shifts; source name does not establish a refusal gesture','none','loop'],
['idle-rail-call','environment-idle','Lean forward with arms near a rail and make a calling gesture','rail; absent in mannequin preview'],
['idle-rail-loop','environment-idle','Lean forward with forearms positioned near a rail','rail; absent in mannequin preview','loop'],
['idle-shield-break','shield','Recoil from a shield-holding stance and return to the holding stance','shield; absent in mannequin preview','recovery'],
['idle-shield-loop','shield','Standing shield-holding stance with small body shifts','shield; absent in mannequin preview','loop'],
['idle-talkingphone-loop','equipment-idle','Hold a hand to the head while gesturing with the other arm','phone; absent in mannequin preview','loop'],
['laytoidle','hit-recovery','Rise from lying through seated and crouched support to upright standing','none','recovery'],
['melee-hook','unarmed-melee','Wind up and swing a hook with whole-body rotation; ends in low follow-through','none'],
['melee-hook-rec','unarmed-melee','Recover from low hook follow-through to raised-arm guard','none','recovery'],
['ninjajump-idle-loop','ninja-jump','Maintain tucked airborne pose; controller supplies world flight','none','loop'],
['ninjajump-land','ninja-jump','Lower from tucked airborne pose into landing crouch and return upright','none','recovery'],
['ninjajump-start','ninja-jump','Push from crouch into tucked airborne pose; root remains in place','none'],
['overhandthrow','projectile','Wind up an overhand throw, follow through and recover upright; no projectile is supplied','throwable; absent in mannequin preview','source-sequence'],
['shield-dash','shield','Lunging shield gesture and recovery in place; controller supplies world dash','shield; absent in mannequin preview','source-sequence'],
['shield-oneshot','shield','Raise shielding arm briefly and lower to standing','shield; absent in mannequin preview','source-sequence'],
['sword-block','sword-defense','Lower into a defensive sword stance and recover upright','sword; absent in mannequin preview','source-sequence'],
['sword-dash','sword-attack','Wind up, lunge and swing, then recover upright in place; controller supplies world dash','sword; absent in mannequin preview','source-sequence'],
['sword-heavy-combo','sword-heavy','Complete multi-swing heavy sword sequence with body turns and recovery; not movement references','sword; absent in mannequin preview','source-sequence'],
['treechopping-loop','work','Repeat a raised-arm chopping swing','axe and tree target; absent in mannequin preview','loop'],
['walk-carry-loop','locomotion-carry','Walk in place while holding arms around a carried load; controller supplies world travel','carried load; absent in mannequin preview','loop'],
['yes','social-gesture','Raise one hand in an affirmative gesture and return upright','none','source-sequence'],
['zombie-idle-loop','zombie','Hunched standing idle with small shifts','none','loop'],
['zombie-scratch','zombie','Wind up and swipe a hand, lean into follow-through, then return to hunched idle','none','source-sequence'],
['zombie-walk-fwd-loop','zombie','Hunched forward walking cycle in place; controller supplies world travel','none','loop']
];
const path='authoring/contracts/ual2-standard.json',catalog=JSON.parse(await readFile(path)),inventory=JSON.parse(await readFile('authoring/reviews/catalog/inventory.json'));
for(const [id,family,purpose,equipment,role='primitive'] of rows){const m=catalog.movements.find(x=>x.id==='move-ual2-'+id),e=inventory.items.find(x=>x.id===m.id);if(!m||m.motionHash!==e.motionHash)throw Error('Stale '+id);m.roles=[role];m.semantics={family,purpose,equipment,review:'candidate'};}
await writeFile(path,JSON.stringify(catalog,null,2)+'\n');
await writeFile('authoring/reviews/catalog/semantic-review.json',JSON.stringify({reviewedAt:new Date().toISOString(),reviewer:'llm-visual',scope:'Seven evenly spaced source poses in Front and Side; classification only, not physical validation or seam approval',sources:rows.map(([id])=>{const m=inventory.items.find(x=>x.id==='move-ual2-'+id);return {id:m.id,revision:m.revision,motionHash:m.motionHash,artifact:'authoring/reviews/catalog/sheets/'+m.id+'.png'};})},null,2)+'\n');
console.log(JSON.stringify({curated:rows.length,total:catalog.movements.length,unknown:catalog.movements.filter(m=>m.semantics.family==='unknown').length}));
