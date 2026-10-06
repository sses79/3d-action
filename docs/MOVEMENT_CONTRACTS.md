# Semantic movement contracts — first implementation

The LLM chooses coordinated source motions through a small typed specification. Studio owns source resolution, revision checks, pose-blend compilation, persistence and playback. Both CLI and MCP expose the same operations; the browser remains the library and inspection surface.

## Available operations

- `get_contract_reviews`, `review_movement_contacts`, `review_connection_policy`: retrieve and record revision/hash-pinned visual contact intervals and exact inspected seam configurations. Supported, uncertain/needs-review and rejected decisions remain distinct. See [CONTRACT_REVIEWS.md](CONTRACT_REVIEWS.md).

- `inspect_motion_quality({actionId, sourceRevision, start?, end?, contacts?, thresholds?})`: read-only rig inspection of a movement or compiled action. Returns bone/scale changes, candidate foot intervals, declared-contact drift, root/pelvis travel, phase seam velocities and review timestamps. No contact certification or contract writes. See [MOTION_QUALITY.md](MOTION_QUALITY.md).

- `inspect_movement_library({query, limit})`: returns compact manifests, provenance, motion hashes, current profiles, candidate connections and one-step draft specs. No project write. Search matches IDs, names, roles and semantics. Limit 1–50 (default 12).
- `build_action_spec({spec, expectedRevision, commit})`: `commit:false` checks schema, active sources, revisions, contract hashes and duration without compiling or writing. `commit:true` compiles a valid candidate and saves once. Structured errors identify a JSON-pointer subject and evidence; failed checks preserve the previous action. CLI returns nonzero and stops batches on invalid specs; MCP marks the structured result as an error. Logs record failed checks as failures.

Spec schema: `authoring/schemas/action-spec.schema.json`. The other schemas describe source records, compact source manifests, connection candidates, the bundled catalog and build receipts. Unknown specification fields are rejected. These schemas are deliberately narrower than Action v2: existing joint authoring remains available through its existing tools.

## Library structure

`authoring/contracts/ual2-standard.json` contains 43 compact source records with source GLB SHA256, adapter path, source/target rig, source duration, adapted motion hash and role. It contains no joint-key payloads. Existing motion data is referenced by movement ID and remains unchanged. Studio derives current manifests without rewriting the project.

Combo clips are `source-sequence`; `*_Rec` clips are `recovery`; `*_Loop` clips are `loop`; remaining clips are provisionally `primitive`. Roles are initial catalog organization, not claims of independently usable attack segments. Detailed family/purpose/equipment semantics are sampled-review curated for all 43 UAL2 clips. A separate `authoring/contracts/studio-local.json` classifies all 18 current local/adapted movements with per-movement source descriptions; it does not reuse the UAL2 GLB provenance for them. Slide sources form an in-place locomotion family, with a running-stride exit and unverified body/hand support. See [SLIDE_CONTRACTS.md](SLIDE_CONTRACTS.md). Semantics remain candidates, with sampled visual evidence rather than physical certification. The complete coverage audit and current join decisions are in [LIBRARY_CONTRACT_REVIEW.md](LIBRARY_CONTRACT_REVIEW.md).

A changed original loses its source semantics/roles until recuration (`unclassified`), while provenance still reports that the current motion no longer matches its imported hash. Revisions are pinned in each spec; curated connection source hashes must also match. Profiles require the current source revision. Distances use normalized meters, timings seconds, and joint rotations local xyzw quaternions. Model +Z is not inferred anatomical facing.

## Regular Sword connection candidates

| Contract | Purpose | Endpoint position RMS | Rotation RMS |
| --- | --- | ---: | ---: |
| regular-a-to-b | Continue attack | 0.0511 m | 5.77° |
| regular-b-to-c | Continue attack | 0.0496 m | 5.72° |
| regular-a-to-a-rec | Recover after A | 0.0002 m | 0.06° |
| regular-b-to-b-rec | Recover after B | approximately 0 m | 0.13° |

Evidence comes from adapted-rig revision-1 endpoints. The catalog links remain candidate source relationships. Current no-anchor 1×→1× policies support A→B at 0.06 s and B→B Rec at 0.12 s under sampled visual and configured numerical review. The earlier pose/source B→C and A→A Rec configurations at 0.12 s were needs-review; the newer velocity/source configurations at the same timing are now supported (see the update below). Older policy evidence remains in history. See [SWORD_PILOT.md](SWORD_PILOT.md). No automatic foot anchoring is enabled by this semantic contract path. Use the complete source combo whenever it matches the prompt; the separately exported C already includes recovery.

Example spec:

```json
{
  "schemaVersion": 1,
  "rig": "quaternius-ual1",
  "id": "sword-joined-study",
  "name": "Sword · Joined A → B → C",
  "intent": "Continue the Regular Sword attack chain and finish its authored recovery.",
  "steps": [
    {"movementId": "move-ual2-sword-regular-a", "revision": 1, "speed": 1},
    {"movementId": "move-ual2-sword-regular-b", "revision": 1, "speed": 1,
     "connection": {"contractId": "regular-a-to-b", "duration": 0.06}},
    {"movementId": "move-ual2-sword-regular-c", "revision": 1, "speed": 1,
     "connection": {"contractId": "regular-b-to-c", "duration": 0.12}}
  ]
}
```

Put `{spec, expectedRevision, commit}` in a JSON file and call:

```sh
node authoring/cli.mjs call build_action_spec --args build.json --out receipt.json
```

For new actions use expectedRevision 0. For revisions fetch `list_actions`; its compact results include the saved semanticSpec and buildReceipt. Validate against current sources first, repair only the diagnosed fields, then compile. The receipt records spec hash, actual source revisions/hashes, compiler, output duration, per-step/join inspection ranges and explicit pending visual review. Semantic specs/receipts persist in the project and undo history; exports include them. Imports keep runtime motion/recipes but discard supplied semantic receipts, which must be regenerated against local sources. Existing recipe timing tools invalidate the current semantic receipt rather than presenting it as current; its prior version remains in history.

## Comparison studies

`authoring/benchmarks/compare-sword-contracts.mjs` creates two separately named actions through the live service and leaves a tracking run open for inspection:

- `sword-source-study`: the complete authored combo, 3.000 s.
- `sword-joined-study`: A → 0.12 s blend → B → 0.12 s blend → C, 3.207 s.

First recorded live client build times: 2.662 s for the source study and 1.379 s for the joined study. The first build includes cold rig loading. This single pair does not establish a performance winner or measure complete LLM planning time. Both paths make one project save per successful build and have no source-preparation writes. Detailed receipts: `authoring/benchmarks/sword-contract-builds.json`.

## Boundaries and next work

This first spec supports whole movement windows, 0.5–1.5× speed, 1–8 steps, positive incoming blends up to one second, and four seconds total. Arbitrary pairs require a curated contract or use the older explicit compose_action workflow with its warnings. Whole heavy combo at 4.333 s needs deliberate retiming under this limit.

Candidate foot intervals and measured seam velocities are now available through `inspect_motion_quality`; bounded LLM visual contact intervals and exact seam decisions are now persisted separately and copied into new build receipts. Physical support confirmation and automatic contact enforcement remain unimplemented. Anatomical facing, collision, props, IK, balance and arbitrary-rig retargeting remain unimplemented. Existing endpoint profiles expose root and body travel separately. Numeric acceptance never certifies natural motion. Visual inspection should prioritize each connection and the final recovery; retain complete authored motion as the quality baseline.

## Velocity-aware connection update (2026-10-05)

Optional `connection.blend: "velocity"` preserves sampled endpoint velocities; `connection.travel: "continue"` carries world-root translation through a join. Default pose/source behavior stays compatible. New modes produce `pose-blend-v2` recipes and receipts. Exact review policies include both modes, so prior pose policies cannot approve them. Current audit: 26 supported curated configurations, one needs-review; the Regular Sword B→C and A→A Rec joins now have supported velocity/source configurations at 0.12 s and 1×. The example above uses legacy defaults; fetch the current policy to select the improved modes. See [VELOCITY_CONNECTIONS.md](VELOCITY_CONNECTIONS.md) for configuration details and limitations.
