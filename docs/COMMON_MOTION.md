# Find common motion between two movements

`find_common_motion` is a read-only CLI/MCP operation. It searches for contiguous similar sections on the current mannequin and returns both source windows, normalized extraction ranges, pose errors, root/pelvis displacement and revision/hash pins. It neither changes the project nor creates a movement automatically.

```json
{
  "movementA": "move-ual2-sword-regular-a",
  "revisionA": 1,
  "movementB": "move-ual2-sword-regular-combo",
  "revisionB": 1,
  "bodyPart": "full",
  "minDuration": 0.2
}
```

Save arguments as `compare.json`, then run:

```sh
node authoring/cli.mjs call find_common_motion --args compare.json --out matches.json
```

Fetch actual revisions from `inspect_movement_library`. Archived, non-movement or stale sources are rejected. MCP exposes the same schema and implementation. `get_capabilities.semanticAuthoring.tools` lists the operation.

## What counts as common

The runtime samples each source at 30 Hz. It compares 15 major body joints: pelvis, upper spine, head, both upper/lower arms and hands, and both thighs/calves/feet. World positions are relative to the pelvis in normalized meters; local quaternion error uses shortest-path angular distance. Finger motion and joint scale are outside the comparison.

A contiguous run must pass both position and rotation RMS thresholds at every sampled frame. Matches are ranked by duration, then measured error; largely overlapping matches are suppressed. Default minimum duration is 0.2 s, position tolerance 0.06 m, rotation tolerance 12°, maximum five results. Endpoint precision is approximately one sample interval (33 ms). A final off-grid fraction shorter than one interval is not searched.

Stationary/near-stationary runs are excluded by default: both matched windows must exhibit at least 0.025 m positional excursion or 5° angular excursion from their starting pose. `includeHolds:true` returns these as `shared-hold`. A common guard pose can be useful, but is distinct from discovering a shared moving segment.

`bodyPart` accepts `full`, `upper` (pelvis, spine, head, arms/hands) or `lower` (pelvis, legs/feet). Upper/lower matches describe a body-region similarity. They are not permission to extract a whole-body movement; simultaneous motion in the other region can differ.

Root and pelvis displacement are reported for each window, independently of the similarity gate. Identical pelvis-relative poses can have different travel. Check this before treating a section as a common gameplay primitive.

## Performance and limits

Sources are bounded to 30 seconds; the service caches up to six signatures by immutable motion hash (roughly a few MB). Edited motions get different hashes and are sampled again. Cache hits do not read or rewrite the large project file. Comparison searches same-speed frame diagonals; there is no dynamic time warping, mirroring, facing alignment or automatic retargeting. Longer clips cost more pairwise frame comparisons; short sword clips do not establish a universal latency guarantee.

Live recorded adapted-rig results:

| Source | Matching Combo window | Position RMS | Rotation RMS |
| --- | --- | ---: | ---: |
| Regular A, 0–0.433 s | 0–0.433 s | 0.0131 m | 1.35° |
| Regular B, 0–0.533 s | 0.467–1.000 s | 0.0150 m | 1.70° |

Final recorded live comparison measurements were 139/8 ms; cached repeats 2.2/1.5 ms. The first call includes cold rig loading. These include loopback client elapsed, not LLM reasoning or visual inspection. Reproduce with `node authoring/benchmarks/common-motion.mjs`; the latest measurements and source hashes are in `authoring/benchmarks/common-motion.json`. These adapted-rig metrics differ from the original GLB rotation-only analysis.

## Turn a candidate into a shared base

1. Inspect the returned windows in the viewer, including entry/exit poses, travel and movement purpose.
2. For a full-body candidate, use existing `adapt_movement` with one source's pinned revision and returned `from`/`to`, speed 1, and a new movement ID. This preserves coordinated source channels; it does not average the two clips.
3. Inspect/profile the extracted movement and document provenance. Record semantic usage and compatible connections deliberately. The initial contract catalog is curated source data; extraction does not automatically add a trusted contract.
4. Reference that movement from future recipes. Existing baked actions keep their original copies until explicitly rebuilt.

Similarity means a candidate shared section, not proof that the source artist reused the same asset or that the motion is physically valid. Source equipment, contact, seam velocity and coordinated timing still matter. If no match is found, report that result under these thresholds; do not conclude that no reusable relationship exists under retiming or mirroring.
