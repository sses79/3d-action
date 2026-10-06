from pathlib import Path
import json
r=Path('authoring/reviews/catalog');a=json.loads((r/'coverage-audit.json').read_text());t=a['totals']
s='''# Movement library contract review

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
'''
for m in a['movements']:
 cs=m['reviewedIntervals'];support=sum(c['decision']=='supported' for c in cs);unc=sum(c['decision']=='uncertain' for c in cs)
 s+=f"| `{m['id']}` r{m['revision']} | {m['family']} / {', '.join(m['roles'])} | {support} supported, {unc} uncertain"+(' (no candidates)' if not cs else '')+f" | {', '.join(m['motionFlagCodes']) or 'none configured'} |\n"
s+='''
## Tested connections

Policies use positive pose or velocity-aware blends without anchoring. Supported applies only to the recorded speeds, duration, blend mode and travel mode. Retiming or adapting a source requires renewed review. Newly compiled receipts include applicable contact intervals and seam policies; existing review-action receipts are historical and are not silently rewritten after review registration. Whole-action inspection remains separate.

| Contract | Blend seconds | Outgoing → incoming speed | Blend / travel | Decision |
| --- | ---: | --- | --- | --- |
'''
for c in a['seams']:
 cfg=c['configuration'];s+=f"| `{c['id']}` | {cfg['duration']:g} | {cfg['fromSpeed']:g}× → {cfg['toSpeed']:g}× | {cfg.get('blend','pose')} / {cfg.get('travel','source')} | {c['decision']} |\n"
s+='''
## Selection rules for the LLM

1. Discover manifests by semantic family/purpose and read actual source revisions. Search supports 50 results per request; narrow by family when inspecting this 61-movement library.
2. Prefer coordinated complete source sequences when they match the requested action. Heavy Sword Combo is a 4.333-second source sequence, not a recipe of exported primitives. The four-second composition limit requires an explicit supported retime/variant before using it as a whole action.
3. For composition, select a purposeful connection and its current policy. Reuse supported configurations exactly; a near endpoint or needs-review policy is not approval. Rail joins were tested at 1.5× solely to fit the four-second compiler limit.
4. Compile through `build_action_spec` and inspect the changed seam and resulting whole action. CLI and MCP share the same implementation; no new transport or tool is needed.

Naming and integration distinctions: local Kick guard has arms down; UAL2 Hit Knockback ends lying down; LayToIdle gets up; UAL2 Slide Exit returns to running stride. Local counter guard/finish are holds, so raising/lowering the arms occurs in a connection. Props are absent for shield, sword, rail, lantern, phone, carrying and work gestures. UAL2 roots are stationary despite body movement; local escape and standing-hit variants retain explicit world travel.

## Remaining motion work

One reviewed configuration (counter-guard-to-cross) retains a boundary velocity flag. Thirteen formerly flagged joins were improved with opt-in velocity-aware blending and explicit travel continuation; see VELOCITY_CONNECTIONS.md and authoring/reviews/velocity. The local advancing step has an internal velocity flag as well. These are recorded limitations, not missing review decisions. They must be resolved or deliberately evaluated before production use. Matching a pose and adding duration does not preserve outgoing/incoming velocity; the new compiler modes preserve sampled endpoint velocities and can continue root travel, but still require configuration-specific inspection. Body/hand/knee support, collision, load-bearing balance and arbitrary rig retargeting are still outside this implementation.

Validation: 44 Node regression tests covering authoring, MCP, CLI, contracts/reviews and motion quality passed; four Python vision tests passed. Actual captures exercise optional camera tracking. Skill validators passed for movement-building and action-composition.
'''
Path('docs/LIBRARY_CONTRACT_REVIEW.md').write_text(s)
