---
name: animation-authoring
description: Create and iterate on rigged 3D character actions in the local Animation Studio through MCP tools, using its browser viewer for playback and comparison.
---

# Animation authoring

Use the `animation-studio` MCP tools to turn the user's action description into structured motion. The project is `/Users/tim/Yun/codex-3d`; its viewer is http://127.0.0.1:5174/editor/. If the service is unavailable, run `npm run start:authoring` in the project. The browser uses the same runtime as the diagnostic tools. If this conversation has not loaded the newly registered MCP server yet, `node authoring/call.mjs TOOL arguments.json` in the project invokes the same MCP protocol; omit the file for tools with no arguments. This is a terminal fallback, not a separate authoring implementation.

Read `get_capabilities` to discover the actual rig, coordinate conventions, source clips and complete action schema. Do not invent bones, controls, source clips or effect types. The current platform exposes all 65 joint rotation/position/scale channels, root tracks, phase sequences, impact cues and preview controls. It does not provide IK, arbitrary-rig import, physics, mesh editing or automatic video understanding.

Read `list_actions` and `get_action` when revising. Use `create_action` for a new action ID, or `revise_action` with the revision ID just read. On a stale revision error, reread and reconcile with the user's requested change; do not retry blindly. Writes persist automatically. `export_project` returns portable project data; the GLB remains a separate dependency.

Compose movement from available source clips with independent authored tracks. For an original pose sequence, sample `A_TPose` and supply absolute local rotations for the relevant bones. Quaternions are normalized [x,y,z,w]; interpolation uses shortest-path slerp. Offset rotations post-multiply the sampled clip rotation, so local axes depend on that rig's rest orientation. Read rest transforms and use `get_diagnostics` at key timestamps to inspect actual results. Do not assume left/right joints share identical local axes.

Name phases for their intent rather than forcing every action into the Jump template. Use durations to create readable anticipation, fast release, apex/pose holds, follow-through and recovery as appropriate. A complete action may include arm asymmetry, torso counterrotation, limb overlap, root travel and cue timing. Keep contact and final guard poses continuous where the requested motion requires them. Numerical validity alone does not establish animation quality.

Tracks use absolute seconds within the action. When changing phase durations, deliberately retime affected track keys and cues too; they do not automatically follow phase boundaries. Root position uses runtime meters with Y up. Joint positions use GLB asset units. Prefer rotation tracks for skeletal posing; joint translation changes bone lengths. Root movement is authored preview motion, not collision or game-controller physics. Do not add duplicate displacement from both a source clip and root track.

Run `validate_action` before submitting a complex new action. Use `set_preview` to select it, choose a suitable camera, replay, or seek to a key pose. `get_diagnostics` reports seven-joint RMS pose speed with root translation excluded, height and sampled transforms. Inspect the live browser when computer-use tools are available. Compare the previous/current revision, and make targeted corrections if the prompt's intent is not visible. Keep tool edits as reversible revisions; the viewer's Undo restores prior action data.

Use `capture_reference` only when a new comparison baseline is useful or requested. Report the authored action, major pose/timing decisions, viewer URL and any requested feature outside the manifest. Do not claim a model-provider chat panel exists; the LLM runs in the calling conversation.

## Authored kick study

For a forward kick, prefer `revise_kick` over freehand joint authoring. It compiles from the immutable Mesh2Motion CC0 `Kick_Breach` baseline, adapted offline to the supported mannequin. Read `get_action` for `kick-study`, then pass `expectedRevision`, `heightDeg` (-8 to 8) and `releaseSpeed` (0.75 to 1.25). Use revision 0 only when creating it. Height changes the right thigh direction with a small torso compensation; it retains source knee folding, target bone lengths and left-foot contact. Speed changes the release phase only and retimes all tracks. The reference is reset to the original on every semantic revision, while previous variants remain in history. This is a bounded forward kick experiment, not a head-height kick, IK, physical balance guarantee or general retargeter. `Save project` includes baked joint movement and parameters; runtime playback needs no LLM.

## Library workflows

For reusable base movement preparation, use the `movement-building` skill. For joining library movements, use `action-composition`; connections are explicit phases baked into the action. Discover the actual tools in `get_capabilities`. The studio sidebar separates Movements and Actions, and it owns library persistence, source metadata, recipes and reversible archives. Generic `revise_action` cannot revise a movement record; use `register_movement` instead.

## Prompt-to-action tracking

For a new prompt-to-action request or revision, call `begin_action_run` with the user's prompt before source discovery or authoring. Retain its run ID. One active run is shared by the local service; if a run is already active, inspect it before resuming or closing it. Subsequent MCP calls are automatically logged with UTC start/finish times, service durations and failures; internal nested calls count once.

Use `append_action_run_event` with that run ID, a phase (selection/preparation/inspection/revision or another concise name) and evidence notes for LLM decisions and browser checks. Record notes as the work happens; do not reconstruct historical timestamps. Finish with `finish_action_run` and completed/failed/cancelled status, a final note and the resulting action ID when applicable. `list_action_runs` and `get_action_run` retrieve stored logs. Studio's Run logs panel shows them. Logs start at the begin call, so they do not include earlier LLM thinking or transport time; service duration is distinct from total elapsed time.

## CLI batching and scripting

The direct CLI is `node authoring/cli.mjs` (or `npm run studio --`), backed by the same running Studio service; MCP remains supported. Use `call TOOL --args file.json` for an individual operation and `batch plan.json --out report.json` for deterministic stages. `tools` discovers schemas. Normal output omits large tracks/joint arrays; `--full` is required for full pose data or exact motion comparisons.

A plan contains the original `prompt`, optional destination `actionId`, `finish:false` for visual review, and sequential `steps` with tool `name`, `arguments`, and unique `as` alias. Use `{"$ref":"alias.revision"}` or another returned field to pass actual revisions between dependent steps. Gather the relevant source information first, then execute a prepared stage in one batch instead of taking an LLM turn for each deterministic call. The sample plan is `/Users/tim/Yun/codex-3d/authoring/plans/block-counter.json`; choose a new destination or read its current revision before reuse.

Batch automatically opens a tracking run. Do not begin another run before it. With `finish:false`, the report returns the open run ID for browser inspection: append checkpoints and finish the run through CLI `call` or MCP afterwards. Script-only batches finish automatically unless disabled, and that completion is not a claim of visual validation. On failure execution stops, the run is closed as failed, and earlier writes remain saved; this client batch is not an atomic transaction or a single-save compiler. The error report identifies completed steps. Never retry the entire batch blindly after partial writes; fetch current revisions and prepare the remaining work. CLI commands do not independently load/write the animation project.


## Deterministic motion inspection

Use `inspect_motion_quality` with `actionId` (movement or action ID), its actual `sourceRevision`, and optional `start`/`end` seconds. It is read-only and returns revision/hash-bound bone/scale changes, candidate foot-contact intervals, root/pelvis travel and seam velocity evidence. Optional `contacts` declare foot/start/end intent; recipe anchors contribute join-only intent automatically. Coarse movement support metadata does not establish contact throughout a clip.

Inspect the returned `inspectionWindows` in Studio before revising motion. Threshold flags request review; intentional squash/stretch or fast motion may trigger them. Candidate contacts are not confirmed support, and no flags never establishes naturalness or balance. Save reports with CLI `--out`, and record visual decisions in the existing run log. See [MOTION_QUALITY.md](/Users/tim/Yun/codex-3d/docs/MOTION_QUALITY.md) for inputs, thresholds and sampling limits.


## Persisted contract review evidence

After inspecting exact revision/hash-pinned source frames, use `review_movement_contacts` to store bounded intervals with supported/uncertain/rejected decisions. Supported requires measured height/speed/drift bounds; uncovered time remains unknown. Do not label an interval reviewed from numerical candidates alone. For curated pairs, `review_connection_policy` records an existing compiled join's exact speeds/blend and supported/needs-review/rejected decision; supported is rejected when configured flags remain. Read `get_contract_reviews` for expectedReviewRevision before replacing a record, including stale records.

New typed builds map supported source intervals into receipts with source-only review scope and apply exact tested seam policies. Source revision/hash changes invalidate applicability. Needs-review never means approved, and annotations never enable anchoring. Keep whole-action inspection separate, especially after retiming. Evidence/storage/API details: [CONTRACT_REVIEWS.md](/Users/tim/Yun/codex-3d/docs/CONTRACT_REVIEWS.md).

## Video reference

`reconstruct_motion` estimates a draft action from a 0.5–8 second window of a local video; repeats and fit/phase changes reuse cached stages. Read [RECONSTRUCT_MOTION.md](/Users/tim/Yun/codex-3d/docs/RECONSTRUCT_MOTION.md) before using it. Enable `straightKneePrior` only for a side view. Treat the result as an unreviewed estimate: check the returned weak-observation times and quality windows against the video, and do not register it as a movement without review.
