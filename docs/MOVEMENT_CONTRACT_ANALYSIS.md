# UAL2 combos and a standard movement contract

> Historical plan or milestone report. Some features described as future work are now implemented. See [Current state](CURRENT_STATE.md) for the current codebase.

This is the historical proposal. Schemas/manifests/inspect/build and the Regular Sword pilot are now implemented in [MOVEMENT_CONTRACTS.md](MOVEMENT_CONTRACTS.md); deterministic inspection is available in [MOTION_QUALITY.md](MOTION_QUALITY.md). Proposed features below should not all be read as current gaps.

Investigation: 2026-10-04. Read-only analysis of the retained UAL2 Standard GLB, importer, current movement profiles, compositor and `/Users/tim/Yun/ag-chart/gen-chart`. No motion, schema, library classification or compiler behavior was changed.

## What the UAL2 combos contain

The retained Standard GLB has 43 independent animation clips. Sword_Regular_Combo (3.000 s) and Sword_Heavy_Combo (4.333 s) each contain 195 animation channels (position, rotation and scale for the 65 joints). Their animation objects contain channels, name and samplers; no assembly recipe or authoring extras is retained. Our importer processes each clip independently and bakes it into a library movement. These records have no compose_action recipe and no references to other library records.

Therefore a source combo is a complete authored sequence, not a Studio action assembled from smaller movements. The exporter does not preserve enough information to know whether the original artist used separate actions, NLA strips, copied keys or another Blender technique. Do not assert a Blender assembly method from the GLB.

Source-local rotation comparison (13 body joints, uniform source samples at 30 Hz, combo offset search at 60 Hz, no retiming) finds:

| Individual source | Duration | Closest offset in Regular Combo | Rotation RMS |
| --- | ---: | ---: | ---: |
| Sword_Regular_A | 0.433 s | 0.000 s | 0.108° |
| Sword_Regular_B | 0.533 s | 0.467 s | 1.118° |
| Sword_Regular_C | 2.000 s | 0.950 s | 16.075° |

This is strong evidence that A and B share motion sections with Regular Combo; C is a less exact match under this fixed-duration search. It is not proof of exact concatenation. The separately exported C ends at guard and spans two seconds; it should not be classified as only a short strike. A+B+C source durations sum to 2.967 s, close to the 3.000 s combo, but duration similarity alone does not establish an exact recipe.

On the current adapted rig, revision-1 endpoint profiles give:

| Boundary | 15-joint position RMS | Local rotation RMS |
| --- | ---: | ---: |
| Regular A exit → Regular B entry | 0.0511 m | 5.77° |
| Regular B exit → Regular C entry | 0.0496 m | 5.72° |
| Regular A exit → A Recovery entry | 0.0002 m | 0.06° |
| Regular B exit → B Recovery entry | approximately 0 m | 0.13° |

These measurements support distinct continuation and recovery paths: A→B→C versus A→A Recovery→guard, and B→B Recovery→guard. They are endpoint heuristics, not a guarantee of trajectory, angular velocity, facing, contact or physical balance. Properties named pose classes are coarse: "upright" does not mean "ready guard".

Use a complete source combo as an atomic sequence when it already meets the prompt. Splitting it and rejoining it can lose the authored timing/overlap. The heavy combo exceeds the current 4-second composition limit; it is already viewable as a movement, but cannot be composed at its original duration under that limit. Trim/retime deliberately or explicitly extend the compiler limit later.

Reproduce the raw rotation analysis with `python3 authoring/source/analyse-ual2-combos.py`. Its report is `authoring/benchmarks/ual2-combo-analysis.json`; the script also writes a temporary result. Native source and adapted-rig endpoint comparisons use different representations and are labelled separately above.

## What to learn from gen-chart

The relevant reference is its architecture, not chart-specific instructions:

- The LLM writes a small typed JSON specification of intent and data. The renderer owns numerical execution and layout.
- Family schemas are versionable contracts with unknown fields rejected. Data integrity, semantics and composition are separate check layers.
- inspect-data returns measured profiles plus a ready-to-edit draft rather than repeatedly asking the LLM to reread raw data.
- deliver validates and produces the candidate through one operation; accepted outputs commit atomically, and failures preserve the previous artifact.
- Diagnostics carry stable code, subject JSON pointer, measured evidence and supportedFixes. The repair loop changes only the diagnosed subject, with a bounded stopping condition.
- Receipts distinguish accepted compilation from optional visual evidence. A check must not claim more than it measures.

Relevant files: gen-chart/SKILL.md, schemas/README.md, schemas/common.schema.json, renderers/shared/diagnostics.mjs, references/delivery-contract.md and bin/gen-chart.mjs in the ag-chart repository. That repository was inspected only; no changes were made there.

Animation Studio already has structured Action v2 tracks, source metadata, revision-pinned recipes and measured connection profiles. Creating another JSON container alone will not repair motion. The missing layer is structured semantics and contracts for how sources can be used and connected, plus deterministic build diagnostics.

## Proposed layers (not implemented)

### 1. Source clip record

Keep asset path/hash, library/edition/license, source clip name, original duration, source/target rig, adapter version and native sampling information. Source records remain immutable. Heavy/Regular Combo retain their complete source motion.

### 2. Movement manifest

A small searchable record references the motion payload instead of embedding its keys. Distinguish `primitive`, `source-sequence`, `recovery` and `loop` as roles rather than calling every imported clip a base primitive. Some clips have more than one role or authored segment; metadata must reflect inspected behavior.

Store semantic family/purpose, equipment requirements, attack/body side, pose family, endpoint contract references, available source windows, support intervals, facing/body/root travel and permitted adaptations. Use explicit unknown values and confidence/evidence; do not guess stance or planted feet from a clip name. Support intervals need measurement or review beyond the two current endpoints.

Separate:

- Authored semantics: purpose, equipment, phase names, continuation/recovery relationships.
- Engine measurements: endpoint positions/quaternions, foot heights/speeds, root/body displacement, directional velocity around boundaries, motion hash.
- Review evidence: inspected windows, reviewer, timestamp and relevant source revision/hash.

Adopt normalized meters, seconds and local joint quaternions as canonical contract units. Define a consistent facing convention and distinguish model +Z from measured anatomical facing. A source rootDelta of zero does not mean no body motion: the imported animations retain pelvis motion. Preserve both measures.

### 3. Connection contracts

Record from/to movement IDs and revision/hash pins, purpose (`continue`, `recover`, `return-to-guard`), allowed entry/exit windows and policies for travel alignment, facing, contact and blending. Record evidence/status independently from a recommended policy. Compatibility invalidates when either source changes.

For Regular A, the continuation can target Regular B while the recovery can target A Recovery. Avoid inserting a full recovery to guard between attacks merely because recovery is available. Store these family relationships as curated candidates, not unquestioned facts inferred from names.

Extend checks beyond static endpoints to root displacement introduced by alignment, joint/angular velocity at seams and foot travel around transitions. A contact alignment can keep a toe fixed while moving the torso unexpectedly, as the knockback experiment demonstrated.

The current composer requires a positive added connection phase between movements. Continuous source sequences and overlapping transitions need a deliberate future compiler policy; they are not supported simply by putting transition 0 or an overlap field into today's recipe.

### 4. Semantic action spec

The LLM selects sources/windows, sequence, timing, travel intent and connection policy. The compiler resolves source data and creates the motion. Named coil/rise/hang/etc. phases are semantic annotations or validated windows; they are not the smallest reusable building blocks. Preserve coordinated movements inside those phases.

Illustrative future shape (not a currently accepted schema):

```json
{
  "schemaVersion": 1,
  "id": "sword-chain-study",
  "rig": "quaternius-ual1",
  "intent": "Continue the sword attack chain and finish in guard",
  "steps": [
    { "movement": "move-ual2-sword-regular-a", "revision": 1 },
    { "movement": "move-ual2-sword-regular-b", "revision": 1,
      "connection": { "purpose": "continue", "contractId": "regular-a-to-b" } },
    { "movement": "move-ual2-sword-regular-c", "revision": 1,
      "connection": { "purpose": "continue", "contractId": "regular-b-to-c" } }
  ]
}
```

Contract IDs above are proposed names, not existing reviewed records. When the entire authored combo fits, a one-step source-sequence spec is preferable.

### 5. Build receipt and viewer

A proposed inspect-library command returns a filtered shortlist, contract evidence and a draft action spec. A proposed build command validates shape/provenance/semantics/connections, compiles a candidate and returns compact diagnostics plus inspection timestamps. These are future stage-level commands; today's CLI exposes call and batch.

Example diagnostic: `connection/torso-displacement`, subject `/steps/1/connection`, evidence including measured displacement and the configured bound, supportedFixes limited to implemented choices such as selecting another source window or removing an unsuitable anchor. Use configured bounds, not invented universal physical thresholds. Do not label the action natural merely because no numeric error fired.

Commit sources/recipe/baked action once after checks rather than repeatedly rewriting the project. Studio remains the library/preview surface; skill and CLI/MCP are interchangeable authoring interfaces. Motion payloads should be kept separately from manifests and history references to avoid copying tracks into every catalog/record.

## Suggested implementation order

1. Define common/source/movement/connection/action-spec/receipt schemas and unit/version conventions. Keep Action v2 as the compiled runtime format; preserve existing actions.
2. Populate a compact manifest for all 43 UAL2 clips from source facts and current profiles. Explicitly mark unreviewed semantics/contacts and classify whole combos as source sequences.
3. Curate one small family first: Regular A/B/C, A/B Recovery, Regular Combo. Inspect and register continuation/recovery contracts. Use complete source combo as baseline.
4. Add inspect-library and build-spec stage operations with stable diagnostics; connect CLI and MCP to the same implementation. Reuse the timestamp logger for selections, corrections, saves and visual inspection.
5. Compare both paths for the same prompt: reuse complete combo versus assemble from permitted parts. Compare motion quality, source/repair count, client elapsed and project writes, not just transport speed.

Standardization can make choosing and joining supported motion more reliable. It cannot manufacture a missing stagger clip, supply an absent weapon, perform arbitrary-rig retargeting or provide an IK/balance solver.
