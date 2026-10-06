# Velocity-aware movement connections

The compiler now has opt-in velocity-aware blending and root travel continuation. Of the 14 previously flagged joins, 13 now clear configured motion flags at their reviewed settings. Front/Side progression and boundary frame sequences were reviewed. The live audit reports 26 supported curated configurations and one needs-review configuration. Existing source tracks and existing action motion remain unchanged.

## Selecting a connection

Fetch `get_contract_reviews` and current movement manifests. Copy the exact supported configuration into the incoming step of a typed action spec:

```json
{"movementId":"move-ual2-sword-regular-c","revision":1,"speed":1,
 "connection":{"contractId":"regular-b-to-c","duration":0.12,
               "blend":"velocity","travel":"source"}}
```

Use actual current source revisions and the destination's expected revision. `compose_action` instead accepts `transition`, `blend` and `travel` directly on the incoming step. The first step has no connection. These modes are not exposed as manual pose controls; MCP and CLI share the compiler, and Studio plays the baked result.

Default `blend: pose` / `travel: source` preserves legacy behavior. Recipes/receipts with new modes use `pose-blend-v2`. Old pose approvals cannot approve a velocity or travel configuration. Timing revisions preserve selected modes, but their changed settings need renewed review.

## What changes in the motion

- Position connections use cubic Hermite interpolation with speed-corrected sampled endpoint velocities.
- Rotation connections use spherical Bezier interpolation with quaternion endpoint tangents. Quaternion signs are normalized for the shortest representation.
- Scale uses eased interpolation; it is not velocity matched.
- `travel: continue` offsets the incoming root to connect travel and advances through the blend using the average endpoint root velocity. The constant offset carries forward through later steps. It does not rotate facing or alter source joint coordination.

Contact anchoring cannot be combined with either new mode. This is not IK, a foot-lock or balance solver. Tangents can overshoot; each source/configuration needs measurement and inspection. Local travel remains subject to the game controller's integration policy.

## Reviewed configurations

All entries below use 1× source speed, velocity mode and no anchor. Supported means clear configured seam checks plus bounded sampled visual review, not physical certification.

| Contract | Duration s | Travel | Decision |
| --- | ---: | --- | --- |
| `regular-b-to-c` | 0.12 | source | supported |
| `regular-a-to-a-rec` | 0.12 | source | supported |
| `knockback-to-getup` | 0.12 | source | supported |
| `ninja-hold-to-land` | 0.2 | source | supported |
| `shield-hold-to-break` | 0.12 | source | supported |
| `quick-hook-recovery` | 0.06 | source | supported |
| `escape-start-to-loop` | 0.06 | continue | supported |
| `escape-loop-to-exit` | 0.06 | continue | supported |
| `escape-exit-to-standing` | 0.2 | continue | supported |
| `counter-ready-to-guard` | 0.2 | source | supported |
| `counter-guard-to-cross` | 0.5 | source | needs-review |
| `standing-hit-entry` | 0.12 | continue | supported |
| `standing-hit-to-step` | 0.12 | continue | supported |
| `standing-step-to-guard` | 0.2 | continue | supported |

The remaining guard-to-cross join is flagged at the incoming punch boundary: joint velocity change RMS 1.863 m/s, angular velocity change RMS 559.28°/s, with the right hand/forearm as peak joints at the tested 0.5 s duration. Duration trials did not clear it. Select a better source onset or inspect a tailored transition before approving this pair. The advancing-step source also retains its previously recorded internal velocity flag; improved joins do not repair that source.

## Evidence and verification

`authoring/reviews/velocity/results.json` contains source/spec/output pins and quality reports; `policies.json` records exact registered configurations. Front/Side sheets and `frames/frames.json` retain capture times, cameras, revisions and hashes. Prior policy evidence remains in review history. `authoring/reviews/catalog/coverage-audit.json` verifies all 61 source pins, 102 contact decisions and 27 current seam policies with no audit failures.

Run tracking starts at the measurement/authoring stage, after initial compiler editing. Later inspection events are server-timestamped; they do not reconstruct earlier timestamps. Refinement resumed after a storage failure; `attempts.json` contains only retained trials, while action history retains earlier revisions. Do not treat it as an exhaustive timing benchmark.

Validation: 44 Node tests passed across connection math, authoring/MCP, CLI, contracts/reviews and quality inspection. Synthetic tests cover endpoint velocities, quaternion sign equivalence, cumulative travel, source preservation, v2 export/import and rejection of conflicting anchors/old policy modes. Authoring and editor bundles build successfully. Actual captured results provide bounded visual evidence; body/hand support, collision and force balance remain unverified.

## Storage fix encountered during review

Pretty-printed project JSON reached about 510 MB and exceeded JavaScript's string serialization limit during the next save. Atomic saves now use compact JSON, retaining the same data and history at about 208 MB. This removes whitespace overhead; it does not solve unbounded whole-project/history growth. Partitioned storage is a separate future task.
