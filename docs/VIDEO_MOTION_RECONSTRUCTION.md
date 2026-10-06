# Fast video-to-motion reconstruction plan

5 October 2026. Proposed extension after the reference-kick pilot; no lifting model installed or reconstruction backend benchmarked yet. The objective is a quick first 3D draft from video, including motions absent from the existing library.

## Revised pipeline

```text
Video crop + actual timestamps
  → YOLO26 person/2D keypoints
  → confidence-aware temporal preparation and keypoint-format adapter
  → learned temporal 3D pose or human-motion reconstruction
  → estimated 3D motion IR
  → constrained retarget to the supported character rig
  → baked Action v2 + preparation/review metadata
  → synchronized video/3D review
  → register approved reusable movement and compose later actions
```

LLM responsibilities: choose interval/person, describe intent/phases, inspect uncertainty, request bounded reruns and curate the result. Numerical model inference, coordinate conversion, retargeting and baking belong in deterministic tools. A prose prompt is useful semantic context; it is not an obligatory lossy intermediate between reconstructed motion and animation tracks.

## Two backend candidates

**First bounded candidate: YOLO → temporal 3D-pose estimator such as MotionBERT → rig retargeting.** Its official interface uses Human3.6M17 joints; standard inference examples first extract AlphaPose/Halpe data. YOLO's COCO17 order is different despite the same count. Implement an explicit adapter, marking estimated pelvis/spine/neck/head landmarks and their uncertainty; preserve confidence and match training normalization. It produces estimated 3D joint positions, which still need a rig-specific rotation/retarget stage. Local runtime speed and quality on the side kick are unmeasured. [Official MotionBERT repository](https://github.com/Walter0807/MotionBERT), [inference](https://github.com/Walter0807/MotionBERT/blob/main/docs/inference.md), [input conversion](https://github.com/Walter0807/MotionBERT/blob/main/lib/data/dataset_wild.py).

**Alternative: video-based human-motion recovery such as WHAM or GVHMR → body-model motion → rig retargeting.** These aim to recover more complete articulated motion and world-grounded trajectories. They have their own image/features/pose preprocessing, pretrained assets and body-model dependencies; they are not interchangeable functions accepting arbitrary YOLO arrays. Evaluate runtime/device and model-asset requirements before selecting one. A direct recovery model may use its native detector; YOLO can remain an evidence/checking stage rather than being forced into every backend. [Official WHAM](https://github.com/yohanshin/WHAM), [official GVHMR](https://github.com/zju3dv/GVHMR).

This comparison is about speed to an acceptable full character draft, including adapter/retarget/review costs, not neural inference latency alone. A smaller model is not automatically the fastest route if it creates more repair work.

## Retargeting essentials

- Document camera/model coordinate axes, scale and source/target rest poses.
- Preserve target bone lengths and map source landmark segments to the correct bones.
- Estimate local rotations through a rig adapter with temporal continuity and joint limits. Joint positions alone leave axial twist ambiguous; use body orientation/limb-plane estimates and priors, retaining uncertainty.
- Treat root-relative skeleton motion separately from world travel. Initial lifted output may not provide a trustworthy metric trajectory. Do not invent meters from screen displacement.
- Foot/toe orientation and load-bearing contact need additional estimation. Apply support correction only when justified; avoid freezing a foot through the wrong interval.
- Bake source motion directly into supported Action v2 tracks; do not recreate a lateral kick through a forward-kick source substitution.

The existing `register_movement` accepts supported baked action data. It can store an estimated video-derived source with honest provenance. Existing semantic contracts, quality inspection and review APIs remain useful after registration. A recovered skeleton is not yet an approved connection or contact policy.

## IR and operations

Maintain two linked artifacts:

1. **Reference IR:** original timestamps, person, camera/mirroring observations, raw 2D landmarks/confidence, phases, event anchors and evidence hashes.
2. **Estimated motion IR:** backend/checkpoint/config pins, named 3D joints, coordinate/scale conventions, estimated root trajectory, uncertainty and source timestamp mapping. Retarget output records target rig and baked local rotations separately.

Do not extend the strict typed action spec with detector coordinates. Tools consume these IR artifacts and emit validated motion. The LLM uses compact manifests and summaries, fetching detailed frames/tracks only for flagged windows.

Proposed first CLI operation: `video-motion reconstruct`, with input file, time window, person selection, backend and output directory. It should orchestrate the stages and return artifact paths, stage timings and flagged inspection windows. Later add MCP access to the same implementation; avoid duplicating reconstruction logic across transports.

## Making the process quick

Cache by video hash/window, detector and lifting checkpoint/configuration, target-rig hash and retarget settings. A timing/phase-label edit should not rerun pose inference. A rig change should reuse the estimated motion and rerun retargeting. Preserve raw and prepared tracks so smoothing changes rerun only dependent stages.

For short clips use one prepared batch, limited frame windows and focused visual review. Load models once for an active batch; a persistent worker is optional and must fit available memory. Existing unrelated services remain untouched. Log cold startup, preparation, inference, retarget, bake, review and total elapsed separately. No end-to-end latency target is claimed before measuring.

Our reference pilot's67 YOLO predictions took2.684s; full Python process including imports/decode/annotations took11.306s. The approximately12-minute tracked analysis included manual extraction decisions, inspection, source-gap investigation and documentation. These are different scopes. Automating those deterministic stages is the immediate speed opportunity; YOLO inference alone was not the dominant total workflow.

## Acceptance on the supplied side-kick fixture

Recover one full lateral snap-kick draft from11.45–13.75s. Review it synchronized to the reference and from front/side/orbit. Verify correct lateral movement, chamber/extension/recoil order, gathering/reset travel handling, stable bone lengths, joint continuity and visible stance/torso coordination. Retain the detector's wrong knee at13.017s as a challenging evidence window. Resolve or explicitly mark mirrored anatomical side.

Compare cold/warm total stage times, numeric flags, visual deviations and revision count. A draft need not be exact motion capture, but it must visibly express the requested side kick before library registration. If a backend fails this fixture, record the failure and evaluate the alternative; do not repeatedly ask the LLM to patch joint angles frame by frame.


Update: the [first 3D benchmark](VIDEO_RECONSTRUCTION_BENCHMARK.md) now has a saved experimental draft and measurements. Its lateral extension failed; no faithful movement has been approved.
