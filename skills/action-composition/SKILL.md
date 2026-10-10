---
name: action-composition
description: Compose reusable Animation Studio movements into a complete 3D action with explicit connection phases through MCP, then inspect the joined motion. Use for prompt-to-action assembly and revisions.
---

# Action composition

Project: `/Users/tim/Yun/codex-3d`. Viewer: http://127.0.0.1:5173/editor/. Read `get_capabilities`, `list_movements`, each selected `get_movement`, and `get_action` before revising an existing action. The fallback `node authoring/call.mjs TOOL arguments.json` uses the same MCP service.

Translate the prompt into available source movements. Choose compatible entry/exit poses, support feet and travel. Prefer a complete authored combination when available. If the library lacks a necessary motion, identify the gap and use movement-building; do not replace missing coordination with speculative joint-angle patches.

Call `compose_action` with an action ID outside the `move-` namespace, name, expectedRevision and steps. Each step has `movementId`, its actual `revision`, `speed` (0.5–1.5) and `transition` in seconds. The first transition is 0; later transitions must be positive and at most 1 second. This initial compiler supports 1–8 movements and total duration up to 4 seconds, also subject to its 256-key sample limit.

Connections are first-class named timeline phases. The compiler samples every supported bone and root channel, blends adjacent endpoint poses, retimes movement cues and saves a baked Action v2. This is a smooth pose blend, not IK, a general planted-foot solver, automatic root-motion alignment or physical balance enforcement. Source travel and unknown support produce review warnings. If a connection looks unnatural, choose a better source or bridging movement rather than lengthening a blend indefinitely.

The recipe pins movement revisions. The baked action remains playable if a movement is revised or archived. Recompose explicitly to incorporate new movement revisions. Old action revisions remain available through `restore_revision`; reference comparison uses the previous action.

Validate the full sequence visually, including every connection, and use `get_diagnostics` near boundaries. Numerical validity does not establish natural motion. `set_preview` controls playback/camera/comparison; `archive_entry` manages reversible library cleanup. Studio exports include base movements, recipes and baked actions. The game runtime plays the baked action without an LLM; gameplay collision/controller systems remain separate.


For a reviewed grounded connection, a step may include optional `contact: "left"` or `"right"`. The compiler aligns the incoming movement's selected ball joint with the preceding endpoint and carries that offset through the incoming motion. During the blend it adjusts whole-body translation to retain that contact. It preserves source joint rotations; the other foot can reposition. This is a single-foot constraint, not two-foot IK, a balance solver, or automatic detection of when contact is appropriate. Select contact only when the incoming source supports that foot. The advancing-step study uses a left-foot connection into the right cross.

## Imported UAL2 movements

Use movement-building to sync `ual2-standard` when needed. Discover actual `move-ual2-*` IDs and revisions; imported movements are baked library records, not source clip names on the mannequin. Use `adapt_movement` for normalized trimming/retiming before composing, especially when a source exceeds the 4-second compiler limit. Retain a complete source combination when it provides better coordination than independently blended parts. Separate attack/recovery clips can be connected explicitly, as in `ual2-hook-recovery`. Source props are not included; support remains unknown until reviewed. Do not add planted-foot constraints merely because an imported clip validates.

## Connection profiles

Call `profile_movement_library` with the current `get_capabilities.projectSequence` to measure missing or stale profiles on the actual rig. It changes profile records only, leaving motion and movement revisions intact. `list_movements` exposes current profiles: entry/exit root-relative body positions, local joint quaternions, pose class, foot height/speed hints and root/body travel. `get_capabilities.movementProfiles` documents joint order, units and thresholds. Anatomical facing is not automatically inferred.

Before joining, call `find_movement_connections` with the outgoing movement ID and `sourceRevision`. Rank by pose RMS and rotation RMS, then use prompt semantics and travel to choose. A near pose match is not a physical guarantee or permission to anchor a foot. A high root gap needs deliberate travel alignment; legacy source travel does not rebase it; opt-in travel continuation requires exact configuration review. `none` support hint means no stationary foot detected; hands/body can still support a slide.

After inspecting endpoint poses visually, `review_movement_profile` can record entrySupport/exitSupport (both/left/right/none/unknown) and concise evidence notes. Identify this as LLM visual review, not physical verification. Do not mark the whole movement reviewed from endpoints alone. Movement revisions discard old profiles/reviews; archive/restore or imported projects require refreshing stale measurements. Profiles are exported for reference, but imports recompute them. Composition includes endpoint mismatch/unreviewed warnings when current profiles exist.

## Fast recipe timing revisions

For timing changes to an existing composed action, prefer `revise_action_recipe` instead of rebuilding movements or submitting full joint tracks. `list_actions` returns compact recipes and current action revisions; use it to identify zero-based step indices. The service validates every pinned source revision and rejects changed/archived sources rather than silently adopting them. No full `get_action` is necessary for a timing-only revision.

One call takes `actionId`, `expectedRevision`, and `changes`: each change has `step` plus either absolute movement `duration` in seconds or `speed` (0.5–1.5), and/or incoming `transition` in seconds. Duration excludes connections and resolves to a source playback speed within 0.5–1.5; longer variations need movement-building. First transition is 0; later transitions must be >0 and <=1. Duplicate indices, speed plus duration, stale revisions, no-op changes or over-limit compositions fail without altering the action. Step speed retimes the whole movement, including its recovery, not an individual joint or subphase.

The tool preserves source movements, records the previous action as comparison reference, saves a pinned recipe and baked motion, and seeks preview to the changed step plus adjoining connections. Optional `playing` defaults false. Its response gives changes, old/new inspection ranges, elapsed service time and viewer URL. Replay/compare that region; a whole-action final check is still appropriate after source replacement or contact changes. Pose/clip selection changes still use `compose_action` and movement-building.

## Prompt-to-action tracking

For a new prompt-to-action request or revision, call `begin_action_run` with the user's prompt before source discovery or authoring. Retain its run ID. One active run is shared by the local service; if a run is already active, inspect it before resuming or closing it. Subsequent MCP calls are automatically logged with UTC start/finish times, service durations and failures; internal nested calls count once.

Use `append_action_run_event` with that run ID, a phase (selection/preparation/inspection/revision or another concise name) and evidence notes for LLM decisions and browser checks. Record notes as the work happens; do not reconstruct historical timestamps. Finish with `finish_action_run` and completed/failed/cancelled status, a final note and the resulting action ID when applicable. `list_action_runs` and `get_action_run` retrieve stored logs. Studio's Run logs panel shows them. Logs start at the begin call, so they do not include earlier LLM thinking or transport time; service duration is distinct from total elapsed time.

## CLI batching and scripting

The direct CLI is `node authoring/cli.mjs` (or `npm run studio --`), backed by the same running Studio service; MCP remains supported. Use `call TOOL --args file.json` for an individual operation and `batch plan.json --out report.json` for deterministic stages. `tools` discovers schemas. Normal output omits large tracks/joint arrays; `--full` is required for full pose data or exact motion comparisons.

A plan contains the original `prompt`, optional destination `actionId`, `finish:false` for visual review, and sequential `steps` with tool `name`, `arguments`, and unique `as` alias. Use `{"$ref":"alias.revision"}` or another returned field to pass actual revisions between dependent steps. Gather the relevant source information first, then execute a prepared stage in one batch instead of taking an LLM turn for each deterministic call. The sample plan is `/Users/tim/Yun/codex-3d/authoring/plans/block-counter.json`; choose a new destination or read its current revision before reuse.

Batch automatically opens a tracking run. Do not begin another run before it. With `finish:false`, the report returns the open run ID for browser inspection: append checkpoints and finish the run through CLI `call` or MCP afterwards. Script-only batches finish automatically unless disabled, and that completion is not a claim of visual validation. On failure execution stops, the run is closed as failed, and earlier writes remain saved; this client batch is not an atomic transaction or a single-save compiler. The error report identifies completed steps. Never retry the entire batch blindly after partial writes; fetch current revisions and prepare the remaining work. CLI commands do not independently load/write the animation project.

## Semantic contracts (first implementation)

Prefer `inspect_movement_library` to discover compact source semantics, motion hashes, candidate continuation/recovery contracts and draft specs. Whole combos are source sequences; reuse them when they satisfy the prompt. For the Regular Sword family, A→B→C continues attacking while A→A Rec and B→B Rec recover. Contract evidence is endpoint measurement, with visual review pending; it does not authorize foot anchoring or certify physical balance.

Use `build_action_spec` with the schema from capabilities: `commit:false` checks without writing, then `commit:true` compiles and saves once. Pin actual movement revisions and destination expectedRevision. Repair the precise diagnostic subject; changed source hashes invalidate candidate contracts. This path supports whole clips and positive pose or opt-in velocity-aware blends. For other pairs, use explicit compose_action or prepare/curate sources rather than inventing contract IDs.

Receipts report source hashes, spec hash, output duration and step/join inspection ranges. Inspect those ranges and recovery in the viewer, append evidence to the tracking run, and finish the run. Receipts remain visually pending; do not claim validation from compilation. Details and the supported JSON shape: [MOVEMENT_CONTRACTS.md](/Users/tim/Yun/codex-3d/docs/MOVEMENT_CONTRACTS.md).

When two sources appear to contain the same motion, `find_common_motion` can quickly locate candidate shared windows with revision/hash pins. Use full-body results plus purpose, travel and visual inspection to decide whether to reuse an existing primitive or extract one via movement-building. Similarity never creates a connection contract automatically. See [COMMON_MOTION.md](/Users/tim/Yun/codex-3d/docs/COMMON_MOTION.md).


## Deterministic motion inspection

Use `inspect_motion_quality` with `actionId` (movement or action ID), its actual `sourceRevision`, and optional `start`/`end` seconds. It is read-only and returns revision/hash-bound bone/scale changes, candidate foot-contact intervals, root/pelvis travel and seam velocity evidence. Optional `contacts` declare foot/start/end intent; recipe anchors contribute join-only intent automatically. Coarse movement support metadata does not establish contact throughout a clip.

Inspect the returned `inspectionWindows` in Studio before revising motion. Threshold flags request review; intentional squash/stretch or fast motion may trigger them. Candidate contacts are not confirmed support, and no flags never establishes naturalness or balance. Save reports with CLI `--out`, and record visual decisions in the existing run log. See [MOTION_QUALITY.md](/Users/tim/Yun/codex-3d/docs/MOTION_QUALITY.md) for inputs, thresholds and sampling limits.


## Persisted contract review evidence

After inspecting exact revision/hash-pinned source frames, use `review_movement_contacts` to store bounded intervals with supported/uncertain/rejected decisions. Supported requires measured height/speed/drift bounds; uncovered time remains unknown. Do not label an interval reviewed from numerical candidates alone. For curated pairs, `review_connection_policy` records an existing compiled join's exact speeds/blend and supported/needs-review/rejected decision; supported is rejected when configured flags remain. Read `get_contract_reviews` for expectedReviewRevision before replacing a record, including stale records.

New typed builds map supported source intervals into receipts with source-only review scope and apply exact tested seam policies. Source revision/hash changes invalidate applicability. Needs-review never means approved, and annotations never enable anchoring. Keep whole-action inspection separate, especially after retiming. Evidence/storage/API details: [CONTRACT_REVIEWS.md](/Users/tim/Yun/codex-3d/docs/CONTRACT_REVIEWS.md).


## Locomotion Slide contracts

Discover `locomotion-slide` through `inspect_movement_library`: UAL2 Slide Start→Loop→Exit has reviewed no-anchor 0.06-second joins at 1×→1×. Fetch current policies rather than assuming these values remain applicable. Sources are in place; a controller must supply world travel. Exit ends in running stride, not standing guard. No foot contacts are approved; body/hand support is outside the current foot-only inspector. Do not anchor feet or promise a standing finish from this family. Whole source loop is two seconds; trimming requires a separate adapted movement and renewed review. See [SLIDE_CONTRACTS.md](/Users/tim/Yun/codex-3d/docs/SLIDE_CONTRACTS.md) for evidence and supported recipe.


## Reviewed catalog selection

Use current manifests and seam policies rather than names alone: local `move-guard` is an arms-down kick stance, not a defensive guard; UAL2 Knockback ends lying down and LayToIdle is its get-up; Slide Exit ends in running stride. Rail, shield, sword, carrying and work clips need props absent from the mannequin. Root-zero clips can still have pelvis travel; local escape/standing-hit variants retain explicit root travel.

The current audit covers 61 movement classifications, 102 measured candidate-foot decisions and 27 purposeful joins, including cross-catalog quick-hook recovery. Thirteen configurations are supported; fourteen remain needs-review. Fetch exact speeds and blend duration before reuse (rail joins were tested at 1.5×). A no-candidate result means no stationary near-floor foot interval was detected, not that a clip is airborne or has no body/hand support. Contact evidence is source-only; it does not approve the join. Local advancing step also retains an internal velocity flag. Prefer a supported coordinated source/connection or explicitly review the indicated gap; do not generate physical approval from coverage counts.

## Velocity and travel connections

Read the current connection policy before reuse. `build_action_spec` supports `connection.blend: "velocity"` and `connection.travel: "continue"`; `compose_action` uses the same fields on the incoming step. Defaults remain `pose` and `source`. Copy duration, both speeds, blend and travel exactly from the supported policy; approval for the legacy pose mode does not approve velocity mode. These options cannot be combined with contact anchoring.

Velocity mode uses endpoint position velocities and quaternion tangents; scale still uses eased interpolation. Travel continuation translates incoming root motion and carries the offset through subsequent steps; it does not rotate facing, perform IK or establish support. Preserve complete source coordination where possible. Inspect both boundaries and whole-action travel; retiming or mode changes require fresh evidence. The guard-to-cross join remains needs-review, and the advancing-step source retains an internal flag. See [VELOCITY_CONNECTIONS.md](/Users/tim/Yun/codex-3d/docs/VELOCITY_CONNECTIONS.md). `compose_action` steps also take `facing: "continue"`: the incoming movement is turned about the vertical so its hips at entry point the way the previous movement's hips point at exit, and its travel turns with it. Use it for video-derived movements, which face wherever the camera saw the performer; it cannot be combined with `contact`. Travel continuation runs along the floor only; root height always comes from the movement itself. Pass the same `facing: "continue"` to `find_movement_connections` to rank entries as they would be joined; `turnDegrees` in each result is the turn applied. `facing: "travel"` instead lines up directions of movement: the incoming movement is turned so the way it travels is the way the previous movement was going (hip facing stands in for a movement that covers under 0.2 m). Use it for an approach followed by an attack; the user's rule (2026-10-10) is that the walk direction should usually match the attack direction. The join then has to turn the body by whatever angle the clip's first pose makes with its own travel, which can be large.
