# Reference-video pilot: lateral snap kick

5 October 2026. Analyzed the user-provided `Screen Recording 2026-10-05 at 17.23.25.mov`. The original file remains unchanged. This pilot completed both reference-analysis paths and a contract dry run; it did not commit an incompatible 3D recreation.

## Selected segment and screenshots

The 23.416667-second screen recording is 1478×820. Its nominal stream rate is 60 fps, average about31.77 fps; 744 decoded frames have actual timestamps. The embedded player clock is not used as our time base. Overview/dense samples revealed repeated kicks and initial player pauses. Selected **11.45–13.75 seconds**, one complete lateral snap-kick cycle with a clear entry and return.

[Play the 2.3-second extracted segment](../authoring/reviews/video/kick-reference/reference-trim.mp4). The trim is re-encoded without audio; analysis timestamps refer to original recording frames, not the re-encoded frame index.

![Original reference keyframes, chronological; fixed crop for readability](../authoring/reviews/video/kick-reference/keyframes-original.jpg)

Individual full-frame screenshots, original frame indices/timestamps and the displayed crop coordinates are in `authoring/reviews/video/kick-reference/keyframes.json`. Full overview/progression sheets are retained alongside them.

## Human movement description

Start in a wide upright stance with bent arms and hands raised. Gather/cross-step sideways toward screen-left, narrowing the feet and moving the body in that direction. Shift onto the leg that stays down. Raise the kicking thigh with the knee flexed, snap the lower leg outward/up, and lean the torso away from the kick. Re-flex the kicking knee before lowering the foot. Widen the stance again and return the torso upright, retaining raised hands.

The caption labels the movement “Side Snap Kick”; the lateral trajectory is visible independently of that caption. The kicking leg appears anatomical right if the recording is unmirrored. Mirroring is unconfirmed, so anatomical side remains provisional. Apparent single-foot support does not establish pressure/load, heel/toe pivot or balance. Gathering travel is visible but its distance in meters is unknown.

| Phase | Recording seconds | Seconds within extracted segment |
| --- | --- | --- |
| Ready | 11.45–11.70 | 0.00–0.25 |
| Gather/cross-step | 11.70–12.50 | 0.25–1.05 |
| Chamber | 12.50–12.78 | 1.05–1.33 |
| Lateral snap | 12.78–12.92 | 1.33–1.47 |
| Recoil | 12.92–13.15 | 1.47–1.70 |
| Return | 13.15–13.40 | 1.70–1.95 |
| Ready hold | 13.40–13.75 | 1.95–2.30 |

These are bounded visual event estimates, not ground-truth biomechanical phase boundaries. The frozen visual-only brief used quarter-second samples; the reviewed brief refined timing with denser originals and overlays. Improvements cannot be credited to YOLO alone because frame density also changed.

## YOLO26-assisted result

Cached `yolo26n-pose.pt` ran locally on CPU with two threads. Sampled67 unique actual frames nearest a30Hz target grid. The foreground subject was selected initially by tallest detection and subsequently by bounding-box overlap; no missing selections occurred. All12 shoulder/elbow/wrist/hip/knee/ankle landmarks exceeded0.5 confidence in every sampled frame. The mirrors did not produce additional person detections in this selected interval.

![Pose overlays on the same selected frames](../authoring/reviews/video/kick-reference/keyframes-pose.jpg)

The trajectory helps trace gathering, rising thigh and outward/retracting ankle motion. However, detector confidence did not ensure correct anatomy. Its maximum projected right-knee angle was179.57° at13.016667s, with minimum contributing landmark confidence0.796. The original frame visibly shows recoil with a flexed knee. That event candidate was rejected after inspection; the clearest visible extension is approximately12.85–12.883s. Raw estimates and the visual rejection are retained in `pose-summary.json`.

| Measured process stage | Seconds |
| --- | ---: |
| Dependency imports | 1.600 |
| Cached model load | 0.092 |
| Warmup | 1.429 |
| Predictions for67 frames | 2.684 |
| Total Python process, including decode/annotation/writes | 11.306 |

These figures measure one local inference run, not complete LLM planning/review or action-generation speed. YOLO gives image-space evidence only; neither knee angle, foot orientation, contact pressure nor 3D rig rotations are recovered reliably from this run. No naturalness approval or automatic reference-to-rig similarity score was issued.

## Contract mapping and result

The current61-movement library has one coordinated kick source: `move-kick` r1, a forward kick with recoil/recovery. It preserves natural coordination but differs from this reference in direction, raised-hand stance, gathering step and travel. `move-guard` is an arms-down stance, so it cannot supply the video's ready posture merely because of its name.

A deliberately labeled one-step **forward-kick diagnostic baseline** passes `build_action_spec(commit:false)` with actual r1 source pins. That proves schema/compiler compatibility only. It is not a validated side-kick recreation and was not saved as an action. No invented side-kick movement/contract ID or guessed joint-angle repair was submitted.

Next authoring input is a **coordinated lateral snap-kick source** with gathering step, raised-hand stance, recoil and return. Resolve the reference/source anatomical side, then adapt to the supported rig, inspect/register it through movement-building, and compile through the existing action contract workflow. If the source already covers the complete cycle, prefer one movement rather than splitting its coordinated limbs into synthetic subposes.

## Prompts and evidence

- [Frozen visual-only prompt](../authoring/reviews/video/kick-reference/prompt-visual.txt)
- [Reviewed pose-assisted prompt](../authoring/reviews/video/kick-reference/prompt-pose-assisted.txt)
- [Source-fit and required movement report](../authoring/reviews/video/kick-reference/source-fit.json)
- [Schema-valid comparison spec](../authoring/reviews/video/kick-reference/baseline-spec.json) and [dry-run result](../authoring/reviews/video/kick-reference/baseline-validation.json)

All evidence lives in `authoring/reviews/video/kick-reference/`: source SHA256 and exact extraction timestamps, frozen/refined briefs, keyframes/overlays, raw detector data, model hash/version/timings, source discovery snapshots and tracked run. Prototype scripts in that folder are specific to this clip, not a production ingestion API. Original video parsing/extraction preceded the Studio run; tracking does not reconstruct those earlier timestamps.

This is a useful golden **analysis example**, including a detector failure. It is not yet a golden reference-to-3D success fixture because the essential lateral-kick source is missing. Next milestone is source availability, followed by compile-and-review of a faithful action, rather than regenerating prompts repeatedly against an incompatible forward kick.


Update: the [first 3D benchmark](VIDEO_RECONSTRUCTION_BENCHMARK.md) now has a saved experimental draft and measurements. Its lateral extension failed; no faithful movement has been approved.
