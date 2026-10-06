# Video/motion review bundle v1

Phase2 delivers a portable, versioned review snapshot for the stabilized side-kick fixture. It packages files and validates them; it does not rerun reconstruction, modify Studio, approve contacts, or implement the synchronized viewer.

## Files and meanings

[Current bundle](../authoring/reviews/video/kick-reference/bundle/bundle.json) pins six relative-path artifacts by SHA256 and byte size:

| File | Meaning |
|---|---|
| reference.json | Original source hash/window, trim hash, person-selection/mirroring uncertainty, 67 actual COCO17 observations and source-relative phase labels |
| motion.json | 70 resampled H36M17 root-relative 3D estimates, explicit axes/units, image-pelvis trajectory, backend and fitting assumptions |
| reference.mp4 | Portable silent trim, 11.45–13.75s of the original recording |
| action.json | Actual saved stabilized Action v2 snapshot, not the offline candidate's older ID |
| quality.json | Revision/motion-hash-pinned diagnostics; three remaining review windows |
| raw-estimate.json | Previous estimates, prepared/unfiltered data and pilot provenance retained for audit |

The original recording is identified by its recorded hash, not copied into the bundle. Raw provenance can contain original workstation paths; consumers use packaged observations/motion/video rather than following those paths. `draft-unreviewed` and `unconfirmed` are the only acceptance/contact statuses in this v1 contract. Anatomical labels are estimated; mirroring remains unknown. Normalized estimated 3D coordinates must not be treated as metric world positions.

[Reference schema](../authoring/reconstruction/schemas/reference.schema.json), [motion schema](../authoring/reconstruction/schemas/motion.schema.json), [bundle schema](../authoring/reconstruction/schemas/bundle.schema.json) use JSON Schema2020-12. Dependency-free [shared validation](../authoring/reconstruction/contracts.mjs) additionally checks finite numbers, exact joint order/dimensions, confidence range, chronological/bounded timestamps, contiguous phase coverage, source/video agreement, safe filenames and sync endpoints. File inspection verifies all checksums, action revision/id/rig/hash evidence, phase duration, and standardized/raw estimate agreement. It is not a full replacement for existing Action v2 authoring validation. The saved snapshot can become stale after Studio edits; check the live revision before revising it.

## Time mapping

Store explicit piecewise-linear anchors linking **action time**, **original source time**, and **trim video time**. Current mapping is:

- action0 ↔ source11.45 ↔ video0
- action2.3 ↔ source13.75 ↔ video2.3

Thus action1.4 ↔ source12.85 ↔ video1.4. Shared `sourceTimeAt` supports intermediate anchors and rejects action times outside the window. Source timestamps remain intact; estimated uniform samples remain clearly distinct from observed variable-rate frames. Retimed actions need new anchors and fresh evidence; the current fixture packager does not perform retiming.

## CLI and LLM access

```sh
npm run reconstruction:bundle -- build-pilot
npm run reconstruction:bundle -- inspect authoring/reviews/video/kick-reference/bundle/bundle.json
npm run reconstruction:bundle -- schemas authoring/reconstruction/schemas
npm run test:reconstruction-bundle
```

`inspect` gives a compact summary with source counts, action pin, unknowns, review windows and stage keys. The LLM can read this through the CLI, then inspect the explicitly linked artifacts when needed. `build-pilot` is intentionally specific to the existing stable fixture; optional output path packages a new copy. It uses retained receipt/evidence, not live project loading or writes. Read-only inspection does not fetch the server.

Stage fingerprints distinguish observation selection/inference inputs, 3D estimation, fitting and retargeting. Canonical sorted-object serialization removes object-property-order effects. Keys include relevant source/model/code/configuration/data inputs; retarget includes target asset hash and root pixel-scale assumption. Timing measurements and output destination are excluded. Different upstream content invalidates downstream fingerprints. This adds deterministic identities, **not an automatic cache store or stage executor**; those remain Phase4. Reproduction requires the pinned local pilot dependencies described in the benchmark.

## Validation and next milestone

Five new tests cover source/action offsets and nonlinear anchors, malformed skeleton/units/confidence/timing, false approval/path escapes, file tampering and deterministic repeated packaging. Together with five retarget/fitting tests, ten pass. Current bundle inspection succeeds with67observed/70estimatedframes and three review windows. Motion quality remains unchanged by packaging.

Next is Phase3: load this bundle in Studio, show video beside the character with shared seek/play/pause/replay/loop, and retain free camera control. Aligned shadow overlay requires an explicit camera alignment assumption; camera calibration is not supplied by this bundle.


## Studio review mode

Click **Video review** in the existing /editor/ page. It opens the pinned stabilized side kick beside the trim, with existing replay/play/pause/loop/frame steps, speed and timeline controls. Review-window buttons seek both previews. Orbit/Front/Side/Top remain available; the camera follows root travel to keep the character visible. Source video is a slave of the action clock, with paused precision seeks and drift correction during playback; browser decode can introduce small playback differences, so this is not frame-perfect genlock. Switching actions closes review. A mismatched saved/live revision refuses opening; revise/rebuild the bundle before using changed timing.

The service exposes four fixed read-only /api/video-review artifacts (validated bundle/reference/action/video) with byte-range support for the video. Browser verifies reference/action checksums before loading. No new MCP operation or project motion write was added. Tested paused1.47s aligns both previews, original source12.92s; play drift~8ms in sampled check; loop wrap and1/60s frame stepping observed. Three sync unit tests and nine editor tests pass. Initial fixture only; calibrated overlay/other-video picker not implemented.
