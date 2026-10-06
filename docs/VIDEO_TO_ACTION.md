# Human video to Animation Studio action: investigation and pilot specification

Investigated 5 October 2026. This proposes a reference-video workflow; no video has been supplied, no action generated and no raw-video ingestion feature implemented in this investigation. Scope is human movement only, excluding scenery, props, effects and combat outcomes.

## Finding

Two viable analysis paths can converge on the same structured movement brief and existing action-spec compiler:

1. **Visual-only:** video → timestamped key frames → LLM motion description → library mapping → typed action spec → compiled 3D preview.
2. **Pose-assisted:** the same video/frames → YOLO26 pose tracks and overlays → LLM motion description with additional evidence → the same mapping/compiler/review.

Use visual-only first to establish an independent baseline, then add pose evidence. The expected benefit is more precise timing, limb trajectories and identification of uncertain observations. Neither path is automatic motion capture or exact 3D reconstruction. The goal is a library-supported semantic recreation, with fidelity gaps stated explicitly.

## Existing implementation versus required additions

| Available now | Required for this experiment |
| --- | --- |
| `ffmpeg` and `ffprobe` on this Mac | Video metadata/hash, exact decoded timestamps and extraction manifest |
| Cached `yolo26n-pose.pt`, isolated Python environment, pose inference/annotation code | Raw-video person selection/tracking; timestamps and confidence-aware trajectory records |
| Actual-rig capture, frame sheets, camera and source/output pins | Key-event selection and original-video reference sheets |
| Semantic source manifests, profiles, contracts, typed compiler, CLI/MCP, Studio preview and logs | Reference brief linking observations to source choices and explicit unsupported requirements |
| Deterministic 3D motion and seam checks | Video-to-render review using comparable camera/time alignment, with uncertainty retained |

`authoring/vision/check_pose.py` currently compares predictions to known projected rig landmarks from `frames.json`. An ordinary video lacks those points, source-action pins and control measurements. Its overlap selector and agreement metric cannot be reused unchanged as raw-video ground truth. Reuse model loading/inference and annotation utilities; keep raw-video observation separate from rig validation.

## Golden example video specification

Recommended first action: **one right-leg forward kick, recoil, then return to the same comfortable upright stance**, at ordinary speed. Keep it controlled and uncomplicated rather than choosing a spinning or acrobatic technique. Our existing `move-kick` is a coordinated forward kick with recovery; semantic compatibility can be assessed before any manual joint revision. Its source stance has arms down, so footage with a boxing guard may require a declared upper-body fidelity gap or a better source.

| Item | Preferred | Minimum / avoid |
| --- | --- | --- |
| Human subject | One person; entire body visible, including both hands and feet | No overlapping opponent or crowd |
| Action | One complete movement with clear preparation, extension, recoil and recovery | Avoid punch-plus-kick combinations for the first pilot |
| Length | 5–8 seconds, including roughly one second of stillness before and after | Active segment preferably 1.5–3.5 s; longer references may exceed current composition limits |
| Format | Original MP4/MOV, 1080p, 60 fps | 720p/30 fps can work; avoid screen recordings/recompressed social clips when an original exists |
| Camera | Fixed, approximately waist/chest height, front-oblique 30–45°; visibly separates limbs and kick path | No cuts, pans, zoom, shake or perspective changes |
| Framing | Person fills about 60–80% of frame height with room for full extension/travel | Never crop the raised foot, hands or head |
| Image quality | Good light, short exposure, distinct clothing/background | No heavy motion blur, baggy clothing hiding joints or filters |
| Ground | Flat visible floor, both feet visible at entry/exit | No obstacles or support hidden behind furniture |
| Playback | Normal-speed source with known mirroring state | No speed ramps; a slow-motion copy is supplemental, not the timing reference |
| Supplement | Optional fixed side-view of the same action | A separate repetition is not synchronized multi-view reconstruction |

Accompany the file with: approximate action start/end, intended limb, whether the image is mirrored, normal/slow playback, desired fidelity (close recreation or game-style interpretation), and permission to use it for the experiment. Missing facts can stay unknown. Anatomical right/left is the performer's side, not screen-right/screen-left; do not infer it solely from the image position.

Later examples, in order: squat-and-stand; sidestep-and-stop; a simple block-and-release; single punch-and-recovery; then a multi-movement combination. Do not use the currently unresolved guard-to-cross pair as the first golden reference.

## Path A: video and key frames

1. Hash and probe the source: dimensions, duration, frame timestamps, nominal/average frame rate, orientation and supplied mirroring information. Decode actual presentation timestamps, especially for variable-frame-rate video; frame index divided by nominal fps is not universally valid.
2. Preserve the full reference and select a bounded action interval. Initial overview samples are for finding events; refine around rapid extension/recoil at the source frame rate.
3. Export approximately 8–12 key frames and a labeled contact sheet: entry, preparation, maximum chamber, extension onset, maximum extension, recoil onset, re-chamber, touchdown/return, and final stance as observable. Event names are action-specific; do not force jump phases onto every action.
4. Inspect frame sequences and nearby frames, not isolated stills. Record phase time ranges, limb order, torso behavior, apparent travel, entry/exit and possible contact. Separate visible facts from inferred mechanics and hidden/unknown components.
5. Produce a readable motion description plus action brief. Each substantial observation references a timestamp/frame. Uncertain support or rotation stays uncertain; a visible stationary foot is not proof of load-bearing contact.

A contact sheet is a review aid, not evidence that all intermediate motion is smooth. Sampling can miss fast events.

## Path B: YOLO26 pose assistance

Run on the same bounded interval with preserved source timestamps. Start with cached nano weights and the existing CPU/thread configuration; measure cold import/model/warmup separately from inference. Sample 15–30 fps for slower phases and native-rate frames around fast events. Do not invent extra temporal resolution by duplicating or interpolating frames. Adjust density after inspection rather than treating this rate as a validated universal rule.

Default YOLO26 pose produces 17 COCO landmarks with image coordinates and optional confidence, including shoulders, elbows, wrists, hips, knees and ankles. It does not provide toes, heel/sole contact, detailed hand/finger articulation, pelvis/spine bones or 3D joint rotations. [Official pose output and index map](https://docs.ultralytics.com/tasks/pose/).

Track or explicitly select the same person throughout. Tracking supports pose models; persistent track IDs are useful associations, not identity or correctness guarantees. [Official tracking documentation](https://docs.ultralytics.com/modes/track/).

Store raw keypoints, bounding boxes, confidence, track assignment and missing detections. Derived evidence can include wrist/ankle paths, projected knee/elbow angles, apparent hip-height changes and event candidates from image motion. These remain screen-space measurements: pixel speed is not meters/second, projected angle is not anatomical 3D angle, and camera motion can look like body travel. For normalized trajectories, use a documented fixed reference scale rather than a changing bounding box that adds artificial motion.

Retain raw data alongside any smoothing, recording filter parameters. Do not interpolate across long occlusions or silently swap left/right labels to improve agreement. Highlight low confidence, implausible label jumps and visually ambiguous crossings. Confidence is model confidence, not calibrated certainty about biomechanics.

Give the LLM a compact event summary and selected overlays, with detailed keypoints available on demand. Avoid sending every raw coordinate in the primary prompt. Pose-assisted changes to Path A's description should cite the extra evidence or explain an unresolved disagreement.

Our prior rendered-kick experiment detected people reliably but the visibly distorted front kick scored better than the original against predicted landmarks. That local result is why YOLO remains supplemental evidence, not an approval gate. See [the experiment report](VISION_POSE_EXPERIMENT.md).

## Intermediate brief and contract mapping

A reference brief is a proposed observation artifact, **not a new field set accepted by `action-spec.schema.json`**. Keep it outside the typed spec. Proposed brief content:

| Field | Content |
| --- | --- |
| Source | File/hash, actual timestamps, crop interval, dimensions/fps, camera and mirroring facts |
| Subject | Selected person/track and anatomical left/right certainty |
| Intent | One concise action goal and desired recreation fidelity |
| Entry / exit | Observed stance/limb arrangement; separate candidate library pose match |
| Phases | Event name, start/end time, screenshots and description of visible body/limb sequence |
| Support / travel | Apparent contacts, confidence/unknowns, image trajectory; metric travel unknown without calibration |
| Observations | Visual-only or detector-assisted provenance; frame-linked uncertainty |
| Mapping | Candidate movement IDs/revisions, coverage, mismatches and missing source requirements |
| Review | Key requirements preserved, accepted approximations and unresolved evidence |

Use neutral biomechanical descriptions. For example: “Right knee lifts, lower leg extends forward, leg recoils, right foot returns to the floor; torso shifts slightly backward during extension and returns upright.” This does not prescribe guessed quaternion values or claim an exact knee angle from one view.

Convert the brief through current discovery and contracts:

1. Query `inspect_movement_library` and read relevant movements, source revisions/hashes, endpoint profiles and policies. Never turn a caption into an invented clip or contract ID.
2. Prefer a complete coordinated source when it covers the observed sequence. Add explicit holds/connections only when compatible. Do not break a good kick into independently guessed limb poses just to match phase names.
3. Report mismatches: wrong limb, incompatible stance, turning absent, unsupported contact or missing root travel. If important motion is missing, route to movement-building rather than silently describing a recreation the sources cannot perform.
4. Emit the existing strict typed spec: `schemaVersion`, `rig`, `id`, `name`, `intent`, `steps`. Each step pins `movementId`, `revision`, `speed`; incoming curated connection uses `contractId`, `duration`, and optional `blend`/`travel`. Reference observations and screenshots remain external evidence, not extra schema properties.
5. Check with `build_action_spec(commit:false)`; commit only after actual source/configuration resolution. Sources speed 0.5–1.5×, up to eight steps and four seconds of compiled motion. Whole-source retiming changes all its phases; independent phase timing may require a supported adapted variant. Video timing is a target, not a promise of exact reconstruction.
6. Inspect the baked result, numeric checks and corresponding frames. Video observations never automatically create supported contact/seam policies. New source/configuration approvals follow existing review rules.

A first semantic prompt can be: “Create one controlled right-leg forward kick from an upright stance. Lift into chamber, extend forward, recoil before lowering the foot, and recover to the initial stance. Preserve coordinated source motion. Match the supplied phase timings where supported; report any stance, limb, travel or timing mismatch. Use current movement revisions and reviewed connections. Do not invent unsupported joint poses.” Replace this with observations from the actual clip; it is not a claim about a video we have not seen.

## Pilot outputs and comparison

Suggested evidence folder: `authoring/reviews/video/<reference-id>/` (not created yet). Keep source references and hashes, `video-manifest.json`, key frames/contact sheet, Path A brief/prompt, Path B raw tracks/overlays/brief/prompt, a mapping/gap report, validated specs, build receipts and output capture manifests. Run logs should cover probe, extraction, visual analysis, inference, mapping, compilation, review and revision, with real timestamps.

Freeze the visual-only result before adding YOLO evidence. Hold the reference interval and supported library constant; compile to separately named actions only when the briefs produce materially different specifications. If both paths select the same source/settings, record that rather than manufacturing a comparison.

Evaluate: correct limb and phase order; entry/exit correspondence; event timing errors; accepted motion/travel gaps; detector landmark coverage/identity failures; compiler/numeric diagnostics; visually reviewed output; total/service/inference time and number of revisions. No arbitrary pixel-error cutoff should declare successful 3D reconstruction. A second non-synchronized camera is supplemental evidence only.

The first clip becomes a reviewed golden fixture only after its key events, identity/mirroring and expected semantic mapping are checked. Preserve uncertainties in the fixture; it is not perfect 3D ground truth. Later regression can detect extraction/mapping changes without treating every visual difference as a failure.

## Recommendation

Begin with a clear forward kick. Produce Path A's frames and brief first, then YOLO-assisted evidence for the same interval. Use the existing coordinated kick as the source-selection baseline. Build new CLI/MCP ingestion wrappers only after this example establishes useful artifacts and timings; the current contract compiler does not need a new schema merely to receive a better prompt.

## First supplied clip

The first real recording has now been analyzed through both paths. See [the lateral snap-kick pilot](VIDEO_KICK_REFERENCE.md) for screenshots, pose evidence, prompts and source-fit findings. Essential lateral-kick motion is absent from the current library, so the faithful-action stage requires a coordinated source rather than a forward-kick substitution.

## Reconstruction extension

The library-assisted path above is no longer the only proposed generation route. [VIDEO_MOTION_RECONSTRUCTION.md](VIDEO_MOTION_RECONSTRUCTION.md) adds temporal3D estimation and rig retargeting to generate new base motion directly from video when the library lacks it. This backend is proposed and unbenchmarked; YOLO observations remain2D, while learned reconstruction provides estimated3D motion.
