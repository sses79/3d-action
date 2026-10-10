# New plan: fast video to reusable 3D actions

Started5 October2026. Build on Animation Studio's existing rig/player, Action v2, movement registry, review contracts, CLI/MCP and skills. Each phase has a reviewable result; inference confidence is not physical approval.

## Phase1 — bounded reconstruction benchmark (recognizable fitted draft; acceptance still open)

Result: [benchmark report](VIDEO_RECONSTRUCTION_BENCHMARK.md). Three detector trials completed. Warm 3D inference ~0.22 s and retarget/bake ~17 ms on the small-model path; the lateral extension fails visually. Follow-up verified limb mappings and added observation-constrained fitting. A side-view straight-knee prior recovers recognizable lateral extension (fit0.524s, retarget20ms), but five velocity flags and visible directional instability remain. Stability follow-up reduces depth variation ~90% and root variation ~82%; flags5→3. Support-foot drift remains unconfirmed and maximum displacement worsens. No approved movement yet. Next is Phase2 reference/estimated-motion contracts, then Phase3 synchronized review to guide contact/root corrections. An independent backend is still untested.

Input: supplied lateral snap-kick recording,11.45–13.75s, cached67YOLO frames. Obtain a pinned pretrained temporal3D model, adapt COCO17 to its skeleton convention, estimate3D motion and retarget to the current mannequin without changing bone lengths. Measure cold setup/download, imports/load, warm inference, coordinate preparation, retarget, bake and capture separately. Inspect chamber, lateral extension, recoil and return from multiple cameras.

Deliverables: estimated motion IR with timestamps/provenance, baked Action v2 draft, capture evidence, benchmark report and reproducible commands. Success is a recognizable first draft, not exact mocap. If the source/model is inaccessible or the result fails visually, retain the evidence and explicitly report the limiting stage; do not label a failed draft reviewed movement.

## Phase2 — reference and motion IR contracts (implemented for pilot)

Version reference IR (source hash/window/timestamps/person/mirroring, 2D tracks/confidence, semantic phases) separately from estimated motion IR (3D joints, axes/scale, backend/config/checkpoint, uncertainty/root trajectory). Preserve raw and prepared data. Add schema validation and deterministic cache keys; don't inject coordinates into the strict semantic action spec.

Delivered: [bundle v1](VIDEO_MOTION_BUNDLE.md), separate reference/motion JSON Schemas and semantic validation, pinned video/action/quality/raw evidence, deterministic stage fingerprints and CLI inspection. Ten reconstruction/bundle tests pass. Packaging is pilot-specific; automatic caching/executor remains Phase4.

## Phase3 — synchronized Studio review (side-by-side implemented)

Show reference video beside generated character with a shared timeline, play/pause/replay/loop/frame stepping. Map video/action time through explicit anchors. Free camera in comparison mode; aligned camera in shadow-overlay mode. Expose uncertain/review windows and source provenance.

Delivered: existing Studio Video review mode, validated pinned side-kick snapshot, shared video/character transport, time-anchor seeking, loop/replay/frame-step/speed and free camera with root following. Browser seek/play/loop/step checks pass; three sync tests and nine editor regressions pass. Arbitrary bundle selection, calibrated shadow overlay and automatic remapping after timing edits remain future work.

## Phase4 — reusable reconstruction tools (implemented)

Delivered 6 October 2026: [`reconstruct_motion`](RECONSTRUCT_MOTION.md), one service operation shared by MCP and CLI, with separately cached observe/lift/fit/retarget stages and a compact summary. It reproduces the pilot bit-for-bit (17.1 s uncached, 0.02 s repeated). Not done: resident models, cache eviction, choosing a person other than the tallest.

One CLI reconstruct operation orchestrates deterministic stages; MCP calls the same implementation. Cache 2D inference,3D inference and retarget separately. Reuse estimates for timing edits; rerun retarget when the character changes. Log actual stage timestamps and cold/warm measurements. Model residency must fit available memory.

Deliverable: repeat the same clip without redundant inference and produce a compact summary for the LLM.

## Phase5 — LLM interpretation and revision (first version delivered)

Delivered 6 October 2026: `skills/video-to-action/SKILL.md`, `inspect_video`, `compare_video_action` and bounded `corrections` on `reconstruct_motion`; see [RECONSTRUCT_MOTION.md](RECONSTRUCT_MOTION.md). Trialled on a second take of the flying-kick recording with tools only. Still to prove on a new performer, camera angle and movement type.

Skills let the LLM select person/window, label intent/phases, choose supported sources or reconstructed motion, and request bounded corrections. The tools perform numerical reconstruction/baking. Review only affected windows after a bounded change, followed by full-motion travel/recovery checks.

Deliverable: prompt+video to recognizable action without frame-by-frame LLM angle patches.

## Phase6 — library and game reuse (first movement registered and composed, 2026-10-09)

Status: `move-video-hook-kick` (copied from `sam3d-trick-01-hook-kick` revision 15, the SAM 3D Body rotation build) is in the library with provenance in its metadata, and is used in the composed action `guard-video-hook-kick-guard` (revision 2: Kick guard, 0.3 s join, the hook kick, 0.35 s join, Kick guard; velocity-matched joins, travel continued). Evidence: the motion check reports no configured flags on the four joins (joint velocity jumps 0.21–0.34 m/s; pose-only joins gave 1.29 m/s at the kick's start, which was flagged); five low-resolution Studio stills show standing, the join, the wind-up, the high kick and the return. User after playback, same day: "looks great" (recorded on the action, set to acceptable). That meets this phase's deliverable for one movement. 2026-10-10: three more registered (`move-video-tornado-kick`, `move-video-cheat-720`, `move-video-cheat-360-crescent`) and two chains composed, `video-hook-into-tornado` (r2, joins 0.3 s) and `video-hook-into-cheat-720` (r3, join 0.5 s into the Cheat 720): no configured flags, though the join into Cheat 720 is at 0.98 m/s against a limit of 1 and 0.3–0.4 s joins were flagged there (that clip starts mid-step). Composer fix found by the chains: `travel: continue` carried the height difference between one movement's end and the next one's start, so the chains ended 10–27 cm above the floor; continuation is now along the floor only (`runtime/movements.ts`). The 4 s composer limit holds a chain to two tricks plus a short stand. Not reviewed by the user. Not done: endpoint support review (`review_movement_profile`) and contact intervals (the motion check finds no stationary foot in the kick, so support is `unknown`); the endpoint match is far (0.33–0.37 m pose RMS, 50–62° rotation), so the joins are long blends, not natural steps; game-runtime use.

Register accepted reconstructed base movements with provenance and bounded contact/support evidence. Curate entry/exit and exact connections; compose with existing movements. Game runtime consumes baked actions and owns controller travel/collision/hit rules. Expand fixtures beyond the side kick after the first backend's quality/speed is known.

Deliverable: an accepted video-derived movement used in a new composed action, with current revision/hash/configuration review pins.

## Current boundaries

Single-camera depth, axial twist, foot orientation and world scale are estimated. Generic retargeting and root/contact recovery require explicit implementation. The unresolved detector knee at13.017s is a mandatory inspection window. Resolve or retain uncertainty about mirroring. Preserve existing source motion, actions and unrelated services.
