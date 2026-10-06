# Movement library contract review

Reviewed on 2026-10-05. Contract evidence now covers every current active movement: 43 UAL2 Standard sources and 18 local/adapted movements. Source motion was not edited. Classification is based on sampled Front/Side renders, with revision/hash pins; it is not a claim of physical balance or naturalness certification.

All 102 detected stationary near-floor foot candidates have decisions: 96 supported source intervals and six uncertain intervals. The 27 purposeful connections have tested policies: 26 supported configurations and one needs-review configuration. No arbitrary pair is approved, and no candidate or annotation enables foot anchoring.

## Where the evidence lives

- `authoring/contracts/ual2-standard.json`: all 43 source semantics and UAL2-only relationships.
- `authoring/contracts/studio-local.json`: all 18 adapted/local semantics, separate per-movement provenance, and local/cross-catalog relationships. This is a reviewed snapshot of the current library, not a generic mutable contract registry. Newly generated movements still need curation.
- `.authoring/project.json.contracts.json`: timestamped source contact reviews and exact seam policies, with retained superseded history.
- `authoring/reviews/catalog/coverage-audit.json`: live-source audit, intervals, configuration decisions and evidence action pins. The two Slide policies refer to retained r1 history after an identical-motion r2 receipt refresh; the audit verifies the historical action hashes.
- `authoring/reviews/catalog`: source measurements, frame manifests, semantic/contact/join sheets, build results and registration scripts. Older Sword and Slide evidence remains in their original review folders.

`node authoring/reviews/catalog/audit.mjs` checks current sources, classifications, contact coverage, current policies and retained review-action evidence against the running service. It writes an audit report; it does not author motion. Capture now accepts `--follow-root` to keep traveling characters visible. Camera target/position and `root-xz` tracking are recorded per frame; world coordinates remain unchanged. Default fixed-camera behavior is preserved.

## Movement inventory

Contacts below cover only detected candidates, not every moment of the clip. Zero candidates means no stationary near-floor foot interval detected; hands, knees, body or moving foot contact can still occur. Supported foot/toe contact is not a force or stability solution.

| Movement | Family / role | Contact decisions | Motion flags |
| --- | --- | --- | --- |
| `move-guard` r1 | kick / primitive | 2 supported, 0 uncertain | none configured |
| `move-kick` r1 | kick / source-sequence | 1 supported, 0 uncertain | none configured |
| `move-punch` r2 | unarmed-melee / source-sequence | 4 supported, 0 uncertain | none configured |
| `move-walk` r3 | locomotion / loop | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-step-forward` r1 | locomotion / primitive | 1 supported, 0 uncertain | connection/velocity-change |
| `move-ual2-a-tpose` r1 | rig-reference / primitive | 2 supported, 0 uncertain | none configured |
| `move-ual2-chest-open` r1 | object-interaction / primitive | 2 supported, 0 uncertain | none configured |
| `move-ual2-climbup-1m` r1 | obstacle-traversal / primitive | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-ual2-consume` r1 | object-interaction / primitive | 2 supported, 0 uncertain | none configured |
| `move-ual2-farm-harvest` r1 | farming / primitive | 2 supported, 0 uncertain | none configured |
| `move-ual2-farm-plantseed` r1 | farming / primitive | 5 supported, 0 uncertain | none configured |
| `move-ual2-farm-watering` r1 | farming / primitive | 2 supported, 0 uncertain | none configured |
| `move-ual2-hit-knockback` r1 | hit-recovery / primitive | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-ual2-idle-foldarms-loop` r1 | social-idle / loop | 5 supported, 0 uncertain | none configured |
| `move-ual2-idle-lantern-loop` r1 | equipment-idle / loop | 2 supported, 0 uncertain | none configured |
| `move-ual2-idle-no-loop` r1 | social-idle / loop | 2 supported, 0 uncertain | none configured |
| `move-ual2-idle-rail-call` r1 | environment-idle / primitive | 2 supported, 0 uncertain | none configured |
| `move-ual2-idle-rail-loop` r1 | environment-idle / loop | 2 supported, 0 uncertain | none configured |
| `move-ual2-idle-shield-break` r1 | shield / recovery | 2 supported, 0 uncertain | none configured |
| `move-ual2-idle-shield-loop` r1 | shield / loop | 2 supported, 0 uncertain | none configured |
| `move-ual2-idle-talkingphone-loop` r1 | equipment-idle / loop | 2 supported, 0 uncertain | none configured |
| `move-ual2-laytoidle` r1 | hit-recovery / recovery | 3 supported, 1 uncertain | none configured |
| `move-ual2-melee-hook` r1 | unarmed-melee / primitive | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-ual2-melee-hook-rec` r1 | unarmed-melee / recovery | 1 supported, 0 uncertain | none configured |
| `move-ual2-ninjajump-idle-loop` r1 | ninja-jump / loop | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-ual2-ninjajump-land` r1 | ninja-jump / recovery | 2 supported, 0 uncertain | none configured |
| `move-ual2-ninjajump-start` r1 | ninja-jump / primitive | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-ual2-overhandthrow` r1 | projectile / source-sequence | 3 supported, 0 uncertain | none configured |
| `move-ual2-shield-dash` r1 | shield / source-sequence | 3 supported, 0 uncertain | none configured |
| `move-ual2-shield-oneshot` r1 | shield / source-sequence | 2 supported, 0 uncertain | none configured |
| `move-ual2-slide-exit` r1 | locomotion-slide / recovery | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-ual2-slide-loop` r1 | locomotion-slide / loop | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-ual2-slide-start` r1 | locomotion-slide / primitive | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-ual2-sword-block` r1 | sword-defense / source-sequence | 2 supported, 0 uncertain | none configured |
| `move-ual2-sword-dash` r1 | sword-attack / source-sequence | 3 supported, 1 uncertain | none configured |
| `move-ual2-sword-heavy-combo` r1 | sword-heavy / source-sequence | 2 supported, 2 uncertain | none configured |
| `move-ual2-sword-regular-a` r1 | sword-regular / primitive | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-ual2-sword-regular-a-rec` r1 | sword-regular / recovery | 2 supported, 0 uncertain | none configured |
| `move-ual2-sword-regular-b` r1 | sword-regular / primitive | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-ual2-sword-regular-b-rec` r1 | sword-regular / recovery | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-ual2-sword-regular-c` r1 | sword-regular / primitive | 2 supported, 1 uncertain | none configured |
| `move-ual2-sword-regular-combo` r1 | sword-regular / source-sequence | 4 supported, 1 uncertain | none configured |
| `move-ual2-treechopping-loop` r1 | work / loop | 2 supported, 0 uncertain | none configured |
| `move-ual2-walk-carry-loop` r1 | locomotion-carry / loop | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-ual2-yes` r1 | social-gesture / source-sequence | 2 supported, 0 uncertain | none configured |
| `move-ual2-zombie-idle-loop` r1 | zombie / loop | 2 supported, 0 uncertain | none configured |
| `move-ual2-zombie-scratch` r1 | zombie / source-sequence | 4 supported, 0 uncertain | none configured |
| `move-ual2-zombie-walk-fwd-loop` r1 | zombie / loop | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-hook-quick` r1 | unarmed-melee / primitive | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-escape-slide-start` r2 | escape-slide / primitive | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-escape-slide-loop` r2 | escape-slide / loop | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-escape-slide-exit` r2 | escape-slide / recovery | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-escape-slide-standing` r2 | escape-slide / primitive | 2 supported, 0 uncertain | none configured |
| `move-counter-ready` r1 | block-counter / primitive | 2 supported, 0 uncertain | none configured |
| `move-counter-guard` r1 | block-counter / primitive | 2 supported, 0 uncertain | none configured |
| `move-counter-right-cross` r1 | block-counter / source-sequence | 3 supported, 0 uncertain | none configured |
| `move-counter-finish` r1 | block-counter / primitive | 2 supported, 0 uncertain | none configured |
| `move-knockback-standing` r1 | standing-hit-recovery / primitive | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-knockback-step` r2 | standing-hit-recovery / primitive | 0 supported, 0 uncertain (no candidates) | none configured |
| `move-knockback-guard` r1 | standing-hit-recovery / primitive | 2 supported, 0 uncertain | none configured |
| `move-knockback-ready` r1 | standing-hit-recovery / primitive | 2 supported, 0 uncertain | none configured |

## Tested connections

Policies use positive pose or velocity-aware blends without anchoring. Supported applies only to the recorded speeds, duration, blend mode and travel mode. Retiming or adapting a source requires renewed review. Newly compiled receipts include applicable contact intervals and seam policies; existing review-action receipts are historical and are not silently rewritten after review registration. Whole-action inspection remains separate.

| Contract | Blend seconds | Outgoing → incoming speed | Blend / travel | Decision |
| --- | ---: | --- | --- | --- |
| `regular-a-to-b` | 0.06 | 1× → 1× | pose / source | supported |
| `regular-b-to-c` | 0.12 | 1× → 1× | velocity / source | supported |
| `regular-a-to-a-rec` | 0.12 | 1× → 1× | velocity / source | supported |
| `regular-b-to-b-rec` | 0.12 | 1× → 1× | pose / source | supported |
| `slide-start-to-loop` | 0.06 | 1× → 1× | pose / source | supported |
| `slide-loop-to-exit` | 0.06 | 1× → 1× | pose / source | supported |
| `knockback-to-getup` | 0.12 | 1× → 1× | velocity / source | supported |
| `hook-to-recovery` | 0.06 | 1× → 1× | pose / source | supported |
| `ninja-start-to-hold` | 0.06 | 1× → 1× | pose / source | supported |
| `ninja-hold-to-land` | 0.2 | 1× → 1× | velocity / source | supported |
| `shield-hold-to-break` | 0.12 | 1× → 1× | velocity / source | supported |
| `zombie-idle-to-scratch` | 0.06 | 1× → 1× | pose / source | supported |
| `zombie-scratch-to-idle` | 0.06 | 1× → 1× | pose / source | supported |
| `rail-idle-to-call` | 0.06 | 1.5× → 1.5× | pose / source | supported |
| `rail-call-to-idle` | 0.06 | 1.5× → 1.5× | pose / source | supported |
| `kick-entry` | 0.06 | 1× → 1× | pose / source | supported |
| `kick-return` | 0.06 | 1× → 1× | pose / source | supported |
| `quick-hook-recovery` | 0.06 | 1× → 1× | velocity / source | supported |
| `escape-start-to-loop` | 0.06 | 1× → 1× | velocity / continue | supported |
| `escape-loop-to-exit` | 0.06 | 1× → 1× | velocity / continue | supported |
| `escape-exit-to-standing` | 0.2 | 1× → 1× | velocity / continue | supported |
| `counter-ready-to-guard` | 0.2 | 1× → 1× | velocity / source | supported |
| `counter-guard-to-cross` | 0.5 | 1× → 1× | velocity / source | needs-review |
| `counter-cross-to-finish` | 0.06 | 1× → 1× | pose / source | supported |
| `standing-hit-entry` | 0.12 | 1× → 1× | velocity / continue | supported |
| `standing-hit-to-step` | 0.12 | 1× → 1× | velocity / continue | supported |
| `standing-step-to-guard` | 0.2 | 1× → 1× | velocity / continue | supported |

## Selection rules for the LLM

1. Discover manifests by semantic family/purpose and read actual source revisions. Search supports 50 results per request; narrow by family when inspecting this 61-movement library.
2. Prefer coordinated complete source sequences when they match the requested action. Heavy Sword Combo is a 4.333-second source sequence, not a recipe of exported primitives. The four-second composition limit requires an explicit supported retime/variant before using it as a whole action.
3. For composition, select a purposeful connection and its current policy. Reuse supported configurations exactly; a near endpoint or needs-review policy is not approval. Rail joins were tested at 1.5× solely to fit the four-second compiler limit.
4. Compile through `build_action_spec` and inspect the changed seam and resulting whole action. CLI and MCP share the same implementation; no new transport or tool is needed.

Naming and integration distinctions: local Kick guard has arms down; UAL2 Hit Knockback ends lying down; LayToIdle gets up; UAL2 Slide Exit returns to running stride. Local counter guard/finish are holds, so raising/lowering the arms occurs in a connection. Props are absent for shield, sword, rail, lantern, phone, carrying and work gestures. UAL2 roots are stationary despite body movement; local escape and standing-hit variants retain explicit world travel.

## Remaining motion work

One reviewed configuration (counter-guard-to-cross) retains a boundary velocity flag. Thirteen formerly flagged joins were improved with opt-in velocity-aware blending and explicit travel continuation; see VELOCITY_CONNECTIONS.md and authoring/reviews/velocity. The local advancing step has an internal velocity flag as well. These are recorded limitations, not missing review decisions. They must be resolved or deliberately evaluated before production use. Matching a pose and adding duration does not preserve outgoing/incoming velocity; the new compiler modes preserve sampled endpoint velocities and can continue root travel, but still require configuration-specific inspection. Body/hand/knee support, collision, load-bearing balance and arbitrary rig retargeting are still outside this implementation.

Validation: 44 Node regression tests covering authoring, MCP, CLI, contracts/reviews and motion quality passed; four Python vision tests passed. Actual captures exercise optional camera tracking. Skill validators passed for movement-building and action-composition.
