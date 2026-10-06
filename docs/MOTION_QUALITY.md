# Deterministic motion inspection

`inspect_motion_quality` is a shared read-only Studio operation, available through CLI and MCP. It measures a current movement or action on the actual normalized mannequin. It does not revise motion, update the preview, persist contacts, certify naturalness or change contract review status.

## Use

Read the current revision from `list_movements`, `inspect_movement_library` or `list_actions`. Supply that value as `sourceRevision`, even when inspecting a compiled action:

```json
{
  "actionId": "sword-joined-study",
  "sourceRevision": 1,
  "start": 0.50,
  "end": 0.60
}
```

Save the arguments to a file and run:

```sh
node authoring/cli.mjs call inspect_motion_quality --args inspect.json --out quality.json
```

The same name/arguments work through MCP. Revisions and archive status are checked before sampling. Unknown top-level/threshold/contact fields, nonfinite values and invalid ranges are rejected. Maximum action duration is 30 seconds. Omit start/end to inspect the full motion; requested intervals must be at least one microsecond. Optional contact declarations are limited to 16 intervals within the full action:

```json
{
  "actionId": "move-kick",
  "sourceRevision": 1,
  "contacts": [{"foot": "left", "start": 0.5, "end": 0.9}],
  "thresholds": {"contactDriftTolerance": 0.02}
}
```

This declares caller intent for measurement, not verified support. It does not attach an anchor or change the action. A compiled recipe's explicit foot anchor adds join-only contact intent automatically. Coarse movement metadata and endpoint support reviews are never interpreted as full-duration contact declarations. Intent intervals are clipped to the requested inspection window; drift is measured from the clipped start, not from an omitted earlier part.

## Measurements and interpretation

| Output | Measurement |
| --- | --- |
| `boneLengths` | World distances between bone parent/child pivots, relative to the imported rest rig; zero-length rest links are marked unmeasurable |
| `scaleChanges` | Peak local scale deviation relative to rest, including the model root |
| `candidateContacts` | Contiguous foot-ball pivot intervals near the configured floor and below adjacent-sample speed thresholds |
| `declaredContacts` | Foot height, speed, path and maximum horizontal displacement from interval start for caller/recipe intent |
| `travel` | Separate model-root and pelvis displacement vectors and accumulated 3D path distances |
| `velocities` | Peak world linear and local angular speeds for 15 major joints, with peak timestamps |
| `seams` | Incoming/outgoing model-root velocity, pelvis velocity change, root-translation-relative joint velocity change and local angular velocity change at phase boundaries |
| `diagnostics` / `inspectionWindows` | Stable review codes, JSON-pointer subjects, time windows and measured evidence |

The root-bone→pelvis link is labelled `body-offset`; crouching changes this offset normally, so it is measured but excluded from bone-distortion flags. Other skeletal links and model/bone scales are compared with imported rest values **before any action is sampled**. A distorted first frame cannot redefine the baseline. Intentional source squash/stretch can still produce review flags.

Contact candidates use ball-joint pivots rather than sole geometry. Low height and speed do not establish physical support. A stationary hand-supported slide may have no foot candidates. Floor placement, model normalization and imported articulation affect these measurements. No anatomical facing is inferred from model +Z.

Sampling uses 60 Hz plus exact inspection/contact/phase endpoints. Seam differences use samples up to 1/60 second before and after the boundary; a short phase can put those samples in neighboring phases. Local quaternion differences use the shortest rotation and parent coordinates. Joint seam linear velocities remove model-root translation; root and pelvis evidence remain separate. Sparse sampling cannot detect every subframe discontinuity.

Phase boundaries come from the action itself. An imported whole Combo usually has one phase, so it has **no internal seam records**, even though it contains multiple strikes. Zero seam flags for that source cannot establish that it is smoother than the joined version. Peak joint speeds are still measured over its full motion.

## Configured review thresholds

All fields are optional within `thresholds`. Defaults are pilot review settings, not universal biomechanical limits.

| Field | Default | Units |
| --- | ---: | --- |
| `floorY` | 0 | normalized world meters |
| `footHeightTolerance` | 0.05 | meters from floor |
| `footSpeedTolerance` | 0.15 | m/s |
| `minContactDuration` | 0.10 | seconds |
| `contactDriftTolerance` | 0.03 | maximum horizontal meters from intent start |
| `boneLengthRelativeTolerance` | 0.02 | fraction of rest length |
| `scaleRelativeTolerance` | 0.02 | fraction of rest scale per component |
| `rootVelocityJumpTolerance` | 0.5 | m/s |
| `jointVelocityJumpTolerance` | 1 | RMS m/s across 15 joints |
| `angularVelocityJumpTolerance` | 360 | RMS degrees/s across 15 joints |

Positive bounds are enforced: height≤1m, foot speed≤10m/s, minimum contact duration≤10s, drift≤10m, relative changes≤2, root/joint velocity changes≤100m/s and angular change≤10,000°/s; floorY may be −10…10m. These input limits bound configurable measurement settings, not permitted human motion.

Diagnostic codes are `rig/bone-length`, `rig/scale`, `contact/drift`, `contact/height` and `connection/velocity-change`. Severity is `review`. Status is `review-needed` or `no-configured-flags`; physical validation always remains `not-performed`. Fast authored motion can legitimately cross a threshold. Inspect the returned windows before changing anything. No flags is not approval of anatomy, balance, contact, collision or naturalness.

## Live Regular Sword pilot

Run `node authoring/benchmarks/motion-quality.mjs` against the service. It discovers actual revisions, inspects six Regular Sword movements plus the two sword studies and current kick, writes individual reports and `authoring/benchmarks/motion-quality/summary.json`, and checks that the project sequence is unchanged. No library or action writes occur. Reports contain source revision, motion hash, UTC measurement timestamp and service/client timings; later revisions require a new inspection. Reports are local files, not persisted contract evidence.

Measured 2026-10-04: service time 14.72–40.12 ms after the first asset-loading call (68.83 ms). The joined sword study sampled 197 frames in 40.12 ms, with four seams and two configured velocity-change flags, around **0.5533 s** and **1.2067 s**. The source Combo has no recorded internal seams. The kick had one phase-boundary velocity flag near **0.740 s**. All nine originals had no configured skeletal bone-length/scale flags after separating the pelvis body offset. Those findings request inspection; no movement was repaired or approved.

Seven focused tests cover clean stationary contact candidates, legitimate pelvis displacement, first-frame shin distortion, declared sliding, root/angular seam changes, invalid input, source/compiled recipe handling, stale revisions and unchanged persistence/preview. MCP integration additionally verifies discovery, inspection results and stale errors.

Implementation: `runtime/motion-quality.ts`, service registration in `authoring/core.ts`. The existing service owns the rig cache; sampling creates a transient rig clone and holds its samples only for that call. There is no second full-project loader or new background process. Existing run logs automatically time the operation when a run is active. CLI batch plans can feed a build's actual revision into the inspection and retain `finish:false` for visual review.

Next contract work can use these reports as measured candidates for reviewed contact intervals and seam policies. Persisting those facts into contract schemas, confirming contacts and checking source-to-compiled alignment are separate work. No new IK, collision/balance solver, arbitrary-rig importer, alignment comparison or visual review persistence was added here.
