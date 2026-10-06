# Block → Counter → Recover

Documentation location: `docs/authoring/actions/BLOCK_COUNTER.md`. Commands run from the repository root; original component-relative code and asset paths below refer to `authoring/actions/`.

Prompt: “Raise a defensive block, hold briefly, then release into a counterattack and recover.”

Interpretation: an unarmed high boxing guard followed by a right cross, in place. No shield or weapon is assumed. The UAL2 Sword_Block was inspected but rejected because its low weapon-parry pose did not match the requested raised defense. The action uses the source Punch_Cross's own raised guard, coordinated strike and recovery instead of freehand joint-angle patches.

Created `block-counter` r1 through MCP. Recipe pins four reusable movements at revision 1: move-counter-ready, move-counter-guard, move-counter-right-cross and move-counter-finish. The existing movements and actions remain unchanged.

| Beat | Duration |
|---|---:|
| Ready, neutral upright stance | 0.160 s |
| Raise block, explicit connection into high guard | 0.240 s |
| Block Hold, source Punch_Cross at 18% | 0.280 s |
| Release connection | 0.040 s |
| Punch | 0.176 s |
| Follow | 0.200 s |
| Recover | 0.280 s |
| Connection into recovered guard | 0.080 s |
| Recovered Guard, source Punch_Cross endpoint | 0.250 s |

Total 1.706 s. Counter movement trims the original Right Cross from 18% to 100% and plays at 1.25×, retaining source joint coordination. Initial/final holds use native UAL1 source poses. No authored model-root travel is added.

New movements were profiled before composition. Defensive high guard → Quick right counter gives a near endpoint match (approximately zero position/rotation RMS). The neutral-ready → boxing-guard transition intentionally changes stance, approximately 0.25 m pose RMS and 44° local rotation RMS, and receives an inspection warning rather than being labelled a perfect match. No foot-anchoring constraint is guessed automatically.

Actual-rig diagnostics at hold, counter peak and final guard return 65 finite joint transforms and finite pose-speed curves. Ball joints are about 0.013–0.015 m above floor at those samples. Browser inspection confirms raised defensive hands and the right counterpunch; replay checks recovery. This is a visual animation preview, without hit-blocking logic, enemy reaction or collision damage.

Exact request: `block-counter-recipe.json`. For revisions, read current action and source movement revisions first; this record already exists and cannot be recreated with expectedRevision 0. Ask for changes to hold duration, release speed or chosen attack; recompose from the source variants.
