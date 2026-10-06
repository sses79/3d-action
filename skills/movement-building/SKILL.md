---
name: movement-building
description: Build, inspect and register reusable natural 3D base movements in the local Animation Studio library through MCP. Use for source-clip preparation and movement revisions, rather than joining a full action.
---

# Base movement building

Project: `/Users/tim/Yun/codex-3d`. Viewer: http://127.0.0.1:5173/editor/. Service: `npm run start:authoring`. Discover `get_capabilities`, `list_movements` and the selected `get_movement` before edits. If MCP is not loaded, `node authoring/call.mjs TOOL arguments.json` invokes the same service.

Prefer a coordinated source animation to freehand joint reconstruction. `build_movement` supports a discovered `clip` with normalized `from`/`to` and optional duration, or a complete version-2 `sourceActionId`. These sources are mutually exclusive. Copying an action retains its full baked motion. Changing a clip segment duration retimes that source segment. For registered movements, use `adapt_movement` to trim normalized `from`/`to` and retime with `speed` (0.5–1.5); it changes joint tracks, phase/source timing and cues together. Read the source revision, supply `sourceRevision`, and use a separate destination ID with `expectedRevision: 0` for a variant. No automatic root rebasing or new coordination is generated.

Use `movementId` starting with `move-`, a concise name, metadata and `expectedRevision`. Revision 0 creates a new movement; revisions require the value just read. Metadata has `source`, `support` (`both`, `left`, `right`, `unknown`), `travel` (`in-place`, `source`) and `notes`. Support is a coarse review hint for the motion, not a measured phase-by-phase contact contract. Mark uncertain support `unknown`; do not claim verified contacts from a valid JSON result alone.

For the implemented kick family, use `revise_kick` for bounded height/release adjustments, then copy the resulting `kick-study` into a separately named movement through `build_movement`. `register_movement` stores a full supported Action v2 and metadata when another implemented adapter has already prepared the motion. No arbitrary-rig importer, general retargeter or IK solver exists.

Inspect start, peak and recovery with `get_diagnostics`; replay the movement in the browser. Check floor contact, knee folding, balance and loop/end behavior. Preserve source/license details in metadata and retained source assets. Use `archive_entry` for reversible library cleanup. Writes persist in the studio, and exported projects include movement records. Revising a base movement does not silently change already compiled actions.

## UAL2 source library

`get_capabilities.sourceLibraries` exposes `ual2-standard`: 43 clips from the free Quaternius Universal Animation Library 2 Standard GLB, CC0. Call `sync_movement_library` with `library: "ual2-standard"` and the latest `get_capabilities.projectSequence` as `expectedSequence`. Sync adds missing records only, preserving edited and archived records. The complete 130+ library and Blender source editions are not included.

Imported IDs start with `move-ual2-`; use `list_movements` to find the exact ID, then `get_movement`. These are already adapted to the current mannequin and use absolute baked tracks. Do not request them as embedded `clip` names: the mannequin still contains UAL1 clips. Props and measured foot contacts are not supplied. Retained source motion can be stylized or very fast; inspect start, peak and recovery before treating it as a natural-motion baseline. Review support/travel metadata before choosing a contact constraint.

Studio search/grouping manages the library; MCP performs sync and adaptations. Ask for a prompt revision, create a new variant, preview and compare it, then compose reviewed variants through action-composition. Details: `UAL2_LIBRARY.md` in the project.

## Connection profiles

Call `profile_movement_library` with the current `get_capabilities.projectSequence` to measure missing or stale profiles on the actual rig. It changes profile records only, leaving motion and movement revisions intact. `list_movements` exposes current profiles: entry/exit root-relative body positions, local joint quaternions, pose class, foot height/speed hints and root/body travel. `get_capabilities.movementProfiles` documents joint order, units and thresholds. Anatomical facing is not automatically inferred.

Before joining, call `find_movement_connections` with the outgoing movement ID and `sourceRevision`. Rank by pose RMS and rotation RMS, then use prompt semantics and travel to choose. A near pose match is not a physical guarantee or permission to anchor a foot. A high root gap needs deliberate travel alignment; legacy source travel does not rebase it; opt-in travel continuation requires exact configuration review. `none` support hint means no stationary foot detected; hands/body can still support a slide.

After inspecting endpoint poses visually, `review_movement_profile` can record entrySupport/exitSupport (both/left/right/none/unknown) and concise evidence notes. Identify this as LLM visual review, not physical verification. Do not mark the whole movement reviewed from endpoints alone. Movement revisions discard old profiles/reviews; archive/restore or imported projects require refreshing stale measurements. Profiles are exported for reference, but imports recompute them. Composition includes endpoint mismatch/unreviewed warnings when current profiles exist.

## Prompt-to-action tracking

For a new prompt-to-action request or revision, call `begin_action_run` with the user's prompt before source discovery or authoring. Retain its run ID. One active run is shared by the local service; if a run is already active, inspect it before resuming or closing it. Subsequent MCP calls are automatically logged with UTC start/finish times, service durations and failures; internal nested calls count once.

Use `append_action_run_event` with that run ID, a phase (selection/preparation/inspection/revision or another concise name) and evidence notes for LLM decisions and browser checks. Record notes as the work happens; do not reconstruct historical timestamps. Finish with `finish_action_run` and completed/failed/cancelled status, a final note and the resulting action ID when applicable. `list_action_runs` and `get_action_run` retrieve stored logs. Studio's Run logs panel shows them. Logs start at the begin call, so they do not include earlier LLM thinking or transport time; service duration is distinct from total elapsed time.

## CLI batching and scripting

The direct CLI is `node authoring/cli.mjs` (or `npm run studio --`), backed by the same running Studio service; MCP remains supported. Use `call TOOL --args file.json` for an individual operation and `batch plan.json --out report.json` for deterministic stages. `tools` discovers schemas. Normal output omits large tracks/joint arrays; `--full` is required for full pose data or exact motion comparisons.

A plan contains the original `prompt`, optional destination `actionId`, `finish:false` for visual review, and sequential `steps` with tool `name`, `arguments`, and unique `as` alias. Use `{"$ref":"alias.revision"}` or another returned field to pass actual revisions between dependent steps. Gather the relevant source information first, then execute a prepared stage in one batch instead of taking an LLM turn for each deterministic call. The sample plan is `/Users/tim/Yun/codex-3d/authoring/plans/block-counter.json`; choose a new destination or read its current revision before reuse.

Batch automatically opens a tracking run. Do not begin another run before it. With `finish:false`, the report returns the open run ID for browser inspection: append checkpoints and finish the run through CLI `call` or MCP afterwards. Script-only batches finish automatically unless disabled, and that completion is not a claim of visual validation. On failure execution stops, the run is closed as failed, and earlier writes remain saved; this client batch is not an atomic transaction or a single-save compiler. The error report identifies completed steps. Never retry the entire batch blindly after partial writes; fetch current revisions and prepare the remaining work. CLI commands do not independently load/write the animation project.

## Source manifests and connection candidates

`inspect_movement_library` returns compact provenance, roles, semantic family/purpose/equipment, motion hashes and revision-bound endpoint profiles. UAL2 complete combos are source sequences; recovery and loop clips have separate roles. All 43 UAL2 sources and 18 current local/adapted movements have candidate semantics. Local contracts retain separate per-movement provenance. Read [LIBRARY_CONTRACT_REVIEW.md](/Users/tim/Yun/codex-3d/docs/LIBRARY_CONTRACT_REVIEW.md) for coverage and tested join configurations. A changed original becomes unclassified until recuration, and connection candidates reject changed hashes. Do not equate zero root displacement with no pelvis travel, stationary-foot hints with verified contacts, or upright pose class with guard. Use the deterministic inspection and persisted review tools below for bounded contact/seam evidence; arbitrary retargeting remains unavailable. Read [MOVEMENT_CONTRACTS.md](/Users/tim/Yun/codex-3d/docs/MOVEMENT_CONTRACTS.md) before extending the contract catalog.

## Discover shared motion windows

Use `find_common_motion` with two actual movement IDs/revisions to identify candidate shared bases before creating more variants. Default full-body matching excludes stationary holds and returns seconds, normalized from/to ranges, errors and separate root/pelvis travel. Compare purpose/equipment and inspect both windows before extracting one through adapt_movement. Upper/lower matches are partial-body evidence, not extractable whole-body shared bases. Fixed-speed matching does not support retiming/mirroring/facing alignment; an empty result is not proof of no relationship. Details: [COMMON_MOTION.md](/Users/tim/Yun/codex-3d/docs/COMMON_MOTION.md).


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

Velocity mode uses endpoint position velocities and quaternion tangents; scale still uses eased interpolation. Travel continuation translates incoming root motion and carries the offset through subsequent steps; it does not rotate facing, perform IK or establish support. Preserve complete source coordination where possible. Inspect both boundaries and whole-action travel; retiming or mode changes require fresh evidence. The guard-to-cross join remains needs-review, and the advancing-step source retains an internal flag. See [VELOCITY_CONNECTIONS.md](/Users/tim/Yun/codex-3d/docs/VELOCITY_CONNECTIONS.md).
