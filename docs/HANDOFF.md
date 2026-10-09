# 3D project handoff

Prepared: 3 October 2026

## Context

The user plans to start a new Codex session and project in `/Users/tim/Yun/codex-3d` after exploring https://github.com/TripoGrowthLab/awesome-astra-prompts.

Current model: GPT-6.1 Sol. No specific example or project has been selected. No project code, dependencies, or assets have been created. The user has not requested a Tripo3D integration.

Proposed starting approach: a browser experience using Three.js and procedural geometry, built and refined with Sol. This does not require Tripo3D. It is a recommendation, not a confirmed project choice.

## Repository summary

Awesome Astra Prompts is a community collection curated by TripoGrowthLab for creating 3D games, scenes, models, and interactive experiences with GPT-6 Astra.

The README inspected on 3 October 2026 reports 310 examples in 14 languages, with 12 examples linking to source code. Entries include previews, prompts, creator attribution, and original-source links.

Topics include browser games, Three.js worlds, Blender modeling, educational simulations, architecture, CAD, and animation. Examples include an interactive koi pond, reactor exhibit, anatomy explorer, and isometric fantasy scene.

Detailed prompts specify visual appearance, interactions, camera controls, performance targets, and deliverables. Some are recommended starting prompts rather than the confirmed exact inputs used for the showcased results. Treat the collection as inspiration; it does not establish that every result is reproducible from its listed prompt alone.

Content and translations live in a CMS. Node.js scripts generate catalogs and preview assets. GitHub Actions schedules synchronization twice daily with validation before publication. The repository is a curated catalog with publishing tooling; linked implementations have their own dependencies.

The MIT license covers original tooling and editorial documentation. Third-party prompts, media, code, and assets retain their own rights. Check linked licenses before reuse. This is not an official OpenAI repository.

Sources:

- README: https://github.com/TripoGrowthLab/awesome-astra-prompts#readme
- Contribution guide: https://github.com/TripoGrowthLab/awesome-astra-prompts/blob/main/CONTRIBUTING.md
- Rights: https://github.com/TripoGrowthLab/awesome-astra-prompts/blob/main/RIGHTS.md

## Can GPT-6.1 Sol do the same work?

Yes: Sol can tackle Three.js scenes, browser games, interactive simulations, and Blender scripts. OpenAI describes it as offering near-Astra performance for complex coding and professional work.

The prompts can be reused with Sol. Matching exact showcase quality or completing a project in one attempt is not guaranteed. No direct comparison on these examples was performed in this conversation.

Recommended workflow:

1. Start with Sol using high or extra-high reasoning for polished 3D work.
2. Specify visuals, controls, performance targets, and concrete deliverables.
3. Run the result, inspect screenshots and interactions, and refine it.
4. Consider Astra for particularly ambitious work or repeated implementation difficulties.

Official guidance positions Sol for complex technical work and polished deliverables, and Astra for the most demanding work. The model still needs appropriate tools and runtimes; Blender work requires Blender, for example.

Sources:

- Sol: https://developers.openai.com/api/docs/models/gpt-6.1-sol
- Model selection: https://developers.openai.com/api/docs/guides/model-selection

## Is Tripo3D required?

Not for many examples. The collection mixes code-built projects and projects using Tripo-generated assets. A link to a Tripo3D detail page does not itself imply a dependency. Inspect the prompt and linked implementation.

| Example | Tripo3D relationship |
| --- | --- |
| Isometric fantasy graphics demo | Explicitly forbids downloading assets; no Tripo requirement. |
| Pitaya Jelly | Uses WebGPU/WGSL; forbids premade models and images. |
| Super Heavy booster catch in Blender | Requests code-generated geometry without downloaded models, textures, or HDRIs. |
| Monster Block | Uses Tripo-created animated characters. |
| Battle City 3D | Has Tripo-model and code-built geometry versions. |
| AKARI / Cyclops' Island | Starts with procedural models, then upgrades through Tripo Studio; no Tripo API key is required for that Studio workflow. |

Sol plus Three.js procedural geometry can be used for the first project without Tripo. Replacing detailed Tripo characters with procedural models changes the appearance. Reusing exported assets and generating new assets are separate requirements; check the chosen example before assuming an ongoing service or API dependency.

Sources:

- Examples: https://github.com/TripoGrowthLab/awesome-astra-prompts#all-prompts
- Isometric demo: https://github.com/achimala/dream-loop

## Next session

Read this document first. Help the user choose or describe the first 3D project, then implement it in this folder. Do not assume an example has been selected or paid services/Tripo integration requested. Distinguish a procedural recreation from exact reproduction of a showcase using external assets.

Counts and model guidance reflect pages inspected on 3 October 2026. Verify again if current details matter.

## Implementation update — 3 October 2026

The user selected the Citrus Jelly direction after reviewing WebGPU examples. An original, self-contained implementation now lives in `index.html`, using native WebGPU/WGSL rendering and CPU volumetric XPBD physics. No Three.js, Blender, Tripo, downloaded assets, or paid integration is required.

Run with `python3 -m http.server 5173 --bind 127.0.0.1`, then open `http://127.0.0.1:5173`. See `README.md` for controls, implementation details, and verification commands. The HTML is the artifact to continue editing. The optics and physical readings are illustrative; physics runs on the CPU and rendering on the GPU.

The prior “no project selected” context describes the starting state and has been superseded by this update.

## Second implementation — digital watch, 3 October 2026

The user chose https://polyhaven.com/a/digital_wrist_watch (Adrian C, CC0) and authorized a functional watch demo with custom branding, live time, clickable physical buttons, time adjustment, and backlight.

The implementation is in `watch/`. Open `http://127.0.0.1:5173/watch/` locally or `https://192.168.1.38:8443/watch/` with the previously trusted preview certificate. Citrus Jelly remains at `/`.

Three.js 0.186.1 uses WebGPURenderer with WebGL2 fallback. esbuild bundles dependencies locally; run `npm run build` after changing `watch/main.js` or `watch/state.js`. `npm test` runs seven watch checks. `python3 tests/server.py` checks demo routes and source isolation.

Original glTF components were split with `watch/prepare_asset.py`. Official portable Blender 4.5.9 LTS then ran `watch/prepare_blender.py`, filled the face opening, saved a packed editable scene in `watch/source/second-watch.blend`, and exported the self-contained `watch/assets/watch.glb` (about 2.17 MB). Blender was not installed system-wide. The original `.blend` and textures are also retained. Read `docs/watch/README.md` for controls and preparation details.

The live face and button animations run in JavaScript. Branding, inscription, finish, time offset, and format persist in localStorage. Stopwatch elapsed time is monotonic and resets on reload. Physical side-button picking, WebGPU rendering, time/stopwatch controls, preference persistence, and phone viewport layout were checked in the in-app browser. The saved Blender scene was reopened and its packed textures/button objects verified. A physical iPhone run of the watch is still for the user to try.

`serve_demo.py` now explicitly permits the watch's public HTML, CSS, bundled JS, and GLB. It continues to deny source files, package files, directory traversal, and keys.

## Third project direction — animation editor, 3 October 2026

The user selected a standalone animation editor inspired by supplied Kesar animation-workbench screenshots. The immediate scope is editor design and stack selection, with a central rigged 3D model that can play and replay actions. LLM iteration should revise structured poses and named timing phases: coil, rise, hang, follow, settle, recover, and guard for the initial jump template.

Read `docs/ANIMATION_EDITOR_PLAN.md` for the proposed layout, Blender/GLB/Three.js pipeline, React/TypeScript/Vite UI, synchronized comparison, and validated LLM revision workflow. The earlier Harbor Run proposal in `docs/NEXT_PROJECT_PLAN.md` is superseded as the third project direction. Do not implement a game arena or combat system.

The `jump/` folder is only an incomplete draft with HTML, CSS, and animation helpers. It has no complete renderer entry and is not a working editor. React/Vite and an LLM service have not been added. The next implementation milestone is the approved editor design plus reliable playback of one known rig and action.

The user subsequently supplied an 11-second mobile-control gameplay video and clarified that the editor should be the first part of a future game platform. Read `docs/GAME_PLATFORM_REQUIREMENTS.md`: browser/Three.js runtime proposed, shared action schema and evaluator, Blender/GLB humanoid asset requirements, touch support, and an editor-first sequence. The original game's engine/model remain unidentified. Quaternius CC0 humanoids/animation libraries are researched candidates; their actual free archives and rigs have not been downloaded or validated. Build the editor asset/playback milestone first, not the full arena.

A later creator-description/control-scheme screenshot and 4.46-second video establish the reference's emphasis on character feel and context-dependent tap/hold actions. The requirements now distinguish timeline editing from a minimal input test area, and include branching action states, movement/input response, cue preview, and recorded scenarios for comparison. Two primary buttons plus an optional separate leap/super are evidenced; exact chord rules, team size, engine, and assets remain unknown. Do not force indefinitely held actions into fixed-duration clips.

## Third project implementation — first editor milestone

Latest authoring direction: the user wants direct LLM prompt-to-action control, with the existing page primarily serving as the viewer. Manual pose sliders are not a prerequisite. Read `docs/LLM_ACTION_AUTHORING_PLAN.md`: next broaden the fixed-template schema to editable pose tracks and arbitrary supported phase sequences, then add a local revision service/MCP bridge and supporting skill. These remain planned, not implemented.

The user authorized the first build. Animation Studio now runs at `http://127.0.0.1:5173/editor/` and `https://192.168.1.38:8443/editor/`. Read `docs/editor/README.md`. It has a React/TypeScript UI, Three.js WebGPU/WebGL2 viewport, real Quaternius CC0 skinned mannequin from the free Universal Animation Library Standard archive, jump/idle playback, cameras, scrub/replay/frame step, seven editable phase durations, A/B comparison, undo, and JSON/local saving. `runtime/action.ts` and `runtime/player.ts` hold the shared animation core. This build retains esbuild instead of introducing Vite; run `npm run build:editor`.

The asset's license/README and inspection summary are in `editor/source/`; no paid assets or Blender source were obtained. Jump clips are composed with a separate visual height curve, not physics. LLM revisions, joint pose editing, pose-speed diagnostics, and input test mode are future milestones. `/jump/` remains unused draft code.

Five editor tests, TypeScript checking, seven watch checks, and public-route/source-isolation tests pass. WebGPU, forced WebGL2, timing/reference separation, undo/replay, save/local load, and phone-sized layout were verified in the browser. Physical phone execution is unverified. `editor/preview.png` records the desktop editor. Both demo-only LAN servers were restarted with the editor's public HTML/CSS/bundle/GLB whitelist; source files remain denied.

The editor now also has a separate eleven-phase Burst Attack action, preserving Jump and its edits. Phase kinds are explicit; authored arm/torso changes and squash/stretch overlay the source clips. `runtime/effects.ts` adds deterministic impact-ring/debris preview. The graph can show measured seven-joint RMS pose speed (root translation excluded) or height. Action switching keeps independent drafts/references, and Save project serializes the library; legacy Jump JSON still imports. Capture current is a full action-data snapshot in memory, persisted only by Save project. Prompt generation/LLM calls and live gameplay input remain unimplemented. Eight editor tests pass, including override non-accumulation and pose-speed sampling. Duration editing preserves phase-relative playhead position; moving gold highlight follows playback independently of inspector selection.

## LLM authoring bridge implemented

`docs/authoring/README.md` describes the working local service on 127.0.0.1:5174, MCP stdio adapter, installed animation-authoring skill and twelve tools. Version-2 custom actions support arbitrary valid phase sequences and all 65 rig joints via keyframed rotation/position/scale, root tracks, source clips and impact cues. The existing page connects on loopback; tool revisions update it without rebuilding. Version-1 Jump/Burst remain compatible. MCP is registered globally as animation-studio; an existing Codex conversation may need refresh to load its tools, with `authoring/call.mjs` available as a same-protocol fallback. No model-provider API/chat panel was added. The generated LLM Hammer Study baseline and revision were submitted via MCP; browser comparison visibly shows new arm poses. Nine editor and four authoring tests pass. Service state is in `.authoring/project.json`; tools save automatically, with undo history. Existing browser localStorage saves are separate and can be imported through Load saved on the original port.

## Pouch–Coil–Launch action

User supplied a right-foot step/right-hand check, clockwise hip coil, and left rear-leg kick. Authored `pouch-coil-launch` via the MCP bridge, with an assumed roundhouse-style kick, 8 phases (three primary beats plus readiness/follow/recovery), 2.85 s duration, 17 tracks and 99 keys/track over held A_TPose. Details and assumptions are in `docs/authoring/actions/POUCH_COIL_LAUNCH.md`; reproducible generator and action submission JSON are beside it. Right-lead/left-rear arrangement preserved; conventional stance name corrected rather than swapping limbs. Revision 2 raises the checking hand to face height. Actual-rig diagnostics verified right-hand and kicking/supporting ankle positions; original Jump/Burst unchanged.


## Revised combination action — Step → Punch → High Kick

The user superseded the prior Pouch/Coil/Launch description. The same `pouch-coil-launch` action is now named **Step → Punch → High Kick**, saved at revision 4. It lasts 2.45 s and advances the root 0.26 m: Ready, Step, Right Punch, Hip Turn, Chamber, High Kick, Follow, Recoil, Recover, Guard. Closed fist shapes reuse the asset’s Punch_Jab finger rotations; 47 tracks independently pose the body and hands. At 1.42 s, the left ankle is approximately 1.52 m high and the right supporting ankle remains at 0.105 m. MCP validation/diagnostics and browser punch/kick/replay checks passed. Read `docs/authoring/actions/STEP_PUNCH_HIGH_KICK.md`; generator and submission JSON sit beside it. Reference currently holds intermediate revision 3; older revisions remain in history. No runtime or game-engine code changed.


Kick correction: Step → Punch → High Kick is now revision 5. The leg straightens by 1.37 s, remains straight through Follow until 1.54 s, and folds during Recoil. Airborne toes point along the shin; grounded foot rotations are retained outside extension. Diagnostics at 1.42 s: knee deviation 1.25°, toe deviation 0°, left ankle height 1.533 m. Browser High Kick/Follow/Recoil checks passed; reference holds revision 4.


Balance correction: action revision 6 extends the knee fully by 1.32 s, distributes a modest backward lean over the lower/upper spine through High Kick and Follow, and returns the torso upright by Recoil midpoint (1.68 s). MCP diagnostics and browser checks passed; reference now holds revision 5.


The user abandoned Step → Punch → High Kick and requested removal. Removed `pouch-coil-launch` from the live/saved action library and selected Jump. A recoverable record remains in `.authoring/removed-actions/pouch-coil-launch.json`; old authoring scripts/docs are historical and must not be resubmitted unless requested.


## Authoring audit and direction — 4 October 2026

Both local servers were stopped and were restarted on 5173 (serve_demo.py) and 5174 (authoring/server.mjs); HTTP checks returned 200. Browser automation blocked page access this session, so no fresh render check. The removed combination remains removed. Its full archive contains all six revisions; extracted exact action snapshots and reconstructed geometric audit are under `authoring/history/step-punch-high-kick/`. `authoring/history/audit-removed-action.mjs` reproduces the audit without submitting anything to the live library. Read `docs/ANIMATION_AUTHORING_REVIEW.md` for the revision-by-revision explanation, verification shortcomings, and proposed prompt-first workflow with a semantic plan/rig-aware compiler plus optional phase controls. The new architecture/controls are proposals, not implemented. The user wants an action tool rather than repeating Blender.

## 2026-10-04 — authored kick baseline experiment

Added `kick-study` using Mesh2Motion CC0 `Kick_Breach`, adapted offline to the existing Quaternius rig. The abandoned combination remains removed. Viewer has bounded height offset and release-speed controls; new MCP `revise_kick` compiles from an immutable baseline and keeps it as comparison reference. Save/Undo/import retain parameters. See `docs/KICK_STUDY.md` for source, limitations and reproduction. All 21 tests and TS checks pass. Local viewer 5173; authoring service 5174. The repository animation-authoring skill is updated; the separately installed global skill was not changed.

## 2026-10-04 — movement library and action composition

Studio sidebar now separates Movements from Actions. Four seed records: kick guard, adapted forward kick, source right cross and source walk cycle (last two contact-unverified). Added six MCP tools for library read/build/register, composition and reversible archive (19 tools total). `guard-kick-guard` is the first composed action with explicit join phases and a saved revision-pinned recipe. `runtime/movements.ts` bakes real-rig motion and pose-blend connections; no IK/contact/root alignment solver. Base edits do not mutate baked actions. Installed movement-building/action-composition skills and updated animation-authoring in both repo and `/Users/tim/.codex/skills`. See MOVEMENT_LIBRARY.md. All 23 tests and TS checks pass. Large-library exports tolerate browser storage quota and imports allow up to 64 MB. Service remains on 5174; viewer on 5173.

## 2026-10-04 — distinct-source step/punch connection

New move-step-forward (0.667 s, ~0.53 m travel) prepared from Walk_Loop across its cycle boundary. Source Punch_Cross reviewed and split into Load/Punch/Follow/Recover without joint changes (move-punch r2). New step-punch-study r2 joins these with a 0.3 s left-foot connection; optional recipe step contact left/right aligns the incoming motion and anchors one ball joint through whole-body translation. Rear foot unconstrained; no IK/balance/collision solver. Loop off; final actor position stays forward. Added regression for phase-sum endpoint roundoff. All 25 tests and TS pass. See docs/STEP_PUNCH_STUDY.md; skill updated locally and installed. Viewer/server remain 5173/5174.

## 2026-10-04 — UAL2 Standard movement sync

Imported all 43 clips from the free Quaternius UAL2 Standard GLB (CC0), adapted to current mannequin with target bone lengths retained. Source/license/hash retained in editor/source/ual2; offline importer authoring/source/import-ual2.mjs generates runtime/ual2-library.json. New sync_movement_library adds missing records without overwriting edits or archives; adapt_movement trims/retimes all tracks, phases and cues with source/destination revision checks. 21 MCP tools total. Studio adds search and collapsible UAL2 group; lightweight catalog state sends full tracks only for selected entry. Full exports remain complete; imports bounded at 128 MB and offline summary export blocked. Live examples: move-hook-quick variant and ual2-hook-recovery composed action. Installed movement-building/action-composition skills updated. All 27 tests and editor TS pass. See UAL2_LIBRARY.md. Contact/props/physical balance are not automatically solved; free Standard is 43 clips, not the entire advertised 130+ product. Viewer 5173; service 5174.

## 2026-10-04 — movement selection performance fix

User reported slow selection after UAL2 import. Measured set_preview at ~1975 ms because every click synchronously serialized the 161 MB project. Preview controls now persist atomically in .authoring/project.json.preview.json; reload uses the newer sequence and later full writes supersede old sidecars. Warm service selection measured 17–89 ms. /api/state?since=sequence returns 204 for unchanged state, removing repeated multi-MB transfers/parses. Browser requests immediate refresh after tool calls. Render loop compares action identities instead of serializing tracks every frame; pose-speed graphs calculate in yielding chunks and cache per action object. Track evaluation uses binary search and player node lookup is cached. 12 authoring + 9 editor tests and TS pass; browser checks verify long Sword Heavy Combo switching/replay. Existing motion/library data unchanged. Service restarted 5174, viewer reloaded 5173.

## 2026-10-04 — prompt-to-action escape slide

Created escape-slide r1 via MCP from UAL2 Slide_Start, trimmed Slide_Loop, Slide_Exit and a held source-exit standing pose. Four reusable move-escape-slide-* variants retain source joint motion and add +Z travel to 1.9 m. Action lasts 2.144 s with explicit joins; entry/glide fast, exit controlled, standing hold. Loop off, Side camera. Actual-rig diagnostics and browser glide/standing/replay checks performed. See docs/authoring/actions/ESCAPE_SLIDE.md and escape-slide-recipe.json. No game threat/controller logic or verified contact solver; originals preserved.

Escape slide correction after visual inspection: original UAL2 Slide_Exit ends in a running stride, not neutral standing. Revised move-escape-slide-standing r2 to hold UAL1 Idle_Loop at +Z 1.9 m, then recomposed escape-slide r2 with a 0.3 s standing connection and 0.35 s hold. Final duration 2.434 s, reference r1 retained. Final endpoint and browser standing pose checked.

## 2026-10-04 — movement endpoint profiles

New runtime/movement-profile.ts measures entry/exit body pose, stationary-foot hints and separate root/body travel on actual normalized rig. Profiled all 53 active movements through MCP; motion and movement revisions unchanged. Added profile_movement_library, find_movement_connections and review_movement_profile (24 tools). Revision-bound profiles/reviews invalidate on movement edit or archive revision; exports include them, imports recompute rather than trust caches. Studio movement inspector displays current endpoint/support/travel profile. Composer emits mismatch/unreviewed endpoint warnings when profiles exist. Slide_Start exit ranks Slide_Exit/Slide_Loop near; unrelated LayToIdle needs transition. Hints are heuristic, not physical contact/balance verification or semantic action matching. Skills updated in repo and installed copies. 13 authoring +9 editor tests and TS pass. See MOVEMENT_PROFILES.md.

## 2026-10-04 — prompt-to-action block/counter

Created block-counter r1 (Block → Counter → Recover), 1.706 s in place, via MCP. Four move-counter-* variants preserve native UAL1 Idle/Punch_Cross poses and source strike coordination. Raised high boxing guard held 0.28 s, counter source trimmed 18%–100% at 1.25×, recovered guard held 0.25 s; explicit joins. Sword_Block inspected/rejected as low weapon parry. Guard-to-counter profile match near; ready-to-guard deliberately needs transition inspection. Actual-rig hold/strike/end diagnostics and browser inspection/replay checked. No collision/block gameplay logic. See docs/authoring/actions/BLOCK_COUNTER.md and block-counter-recipe.json.

## 2026-10-04 — single-call recipe timing revisions

Added revise_action_recipe (25 tools): zero-based step duration/speed/transition patches, pinned-source/action stale checks, complete recompile/reference/history preservation, and preview seek to affected section plus adjacent joins. Source movements unchanged. list_actions now includes compact recipes to avoid loading baked tracks for timing-only edits. Composition persists final action+recipe once. Action-composition skill updated locally/installed. Demo block-counter-timing-demo r2 increases hold .28→.4 s and counter speed1.2, elapsed service985ms; original block-counter untouched. 14 authoring tests and TS pass; first test attempt hit native Node assertion, complete rerun succeeded. See RECIPE_REVISIONS.md. Duration bounded by speed .5–1.5; no subphase edits or bounded-region looping added.


## Knockback recovery prompt-to-action (2026-10-04)

Added `knockback-recovery` r3 (2.26 s): standing chest recoil → backward catch step → balanced high guard. Four new source variants, step pinned at r2. Coordinated UAL1 sources, explicit backward travel and right/left foot-aligned joins. UAL2 full knockdown rejected. Viewer inspected and boundary diagnostics checked; no runtime code changed. See `docs/authoring/actions/KNOCKBACK_RECOVERY.md` and recipe JSON. Preview `editor/knockback-recovery-preview.png`.

## Prompt-to-action timestamp logs (2026-10-04)

Added independent persistent run storage (`project.json.runs.json`) and five MCP tools: begin_action_run, append_action_run_event, finish_action_run, list_action_runs, get_action_run. Active-run authoring calls automatically capture UTC start/end, service elapsed duration, errors and output revisions; nested internal operations count once. LLM notes cover decisions/browser checks. Studio header Run logs opens a live read-only timeline. Logging does not rewrite or poll the full animation project. Installed authoring/composition/movement skills now begin and finish tracking runs. See docs/ACTION_RUN_LOGS.md for timing boundaries, restart behavior and storage limits. Older Knockback work has no invented retrospective timestamps.

Validation: 18 authoring tests, 9 editor tests and editor TypeScript pass. Final logging precision changes pass the 4 focused run-log tests. Live MCP verification run completed; Run logs shows UTC steps, successes/failures and millisecond service totals after reload. Screenshot: editor/run-log-preview.png. First sandboxed authoring run hit the previously observed Node native async assertion; the full loopback-enabled rerun passed. Skill metadata/workflow manually checked because the bundled skill validator lacks PyYAML.

## Direct CLI and scripted action comparison (2026-10-04)

Added `authoring/cli.mjs`, npm studio command, JSON batch plans with dependent result references, compact output, full/raw mode, file/stdin inputs, fail-fast partial-write reports and finish:false visual-review mode. Uses the existing service; MCP remains unchanged/available. Run logs distinguish CLI transport. Sample authoring/plans/block-counter.json. All skills gain CLI stage guidance. Six complete scripted action runs (11 operations each plus tracking) compare direct CLI and persistent MCP; baked motion hashes match. Timings ~1.6–2.6 s; no proven transport speed advantage, benefits primarily fewer agent/tool exchanges. First MCP compile cold-loads rig. See docs/CLI_AUTHORING.md and authoring/benchmarks/action-runs-2026-10-04.json. Benchmark copies will be archived after viewer check; originals preserved.

CLI validation: 5 CLI tests, 18 authoring tests and editor TypeScript pass. Six live scripted builds hash-identical through CLI/MCP; CLI-built counter checked in viewer. Benchmark copies archived at r4, original Knockback preview restored. Original actions unchanged.

## 2026-10-04 — semantic movement contracts and Regular Sword pilot

Implemented `authoring/contracts.mjs`, compact `authoring/contracts/ual2-standard.json` (43 sources, no tracks), strict JSON schemas for source/movement/connection/catalog/action-spec/receipt, and shared `inspect_movement_library` / `build_action_spec` tools (32 total). Six Regular Sword clips have candidate semantics; other detailed semantics remain unknown. Four source-hash-pinned candidate links distinguish A→B/B→C continuation from A→A Rec/B→B Rec recovery. Current manifests expose revision-bound profiles and explicit missing support intervals/facing/seam velocity. Edited imported motions become unclassified; changed source hashes reject curated links.

build_action_spec commit:false validates without writes, commit:true compiles through existing pose-blend-v1 and persists action+recipe+semanticSpec+receipt once. Receipts include sources/hashes, duration and join/step inspection ranges. Diagnostics identify code/subject/evidence; CLI returns nonzero/stops batches, MCP marks errors, run logger records failed checks. Specs/receipts retain in undo history/export; imported receipts are discarded for local regeneration. Existing timing revisions invalidate current semantic receipt. No new IK/contact solver, windows/overlaps, props or arbitrary retargeting; total4s,1–8steps,.5–1.5× remain.

Viewer now shows movement role/family/purpose/equipment and continuation/recovery candidates, plus semantic action receipt summary. Repo and installed action-composition/movement-building skills updated. See docs/MOVEMENT_CONTRACTS.md and prior MOVEMENT_CONTRACT_ANALYSIS.md. Skill validator unavailable because PyYAML absent; metadata/references checked manually.

Two new comparison actions: sword-source-study r1 (3s complete authored combo) and sword-joined-study r1 (3.2067s A→.12s blend→B→.12s blend→C). Original motion/library actions preserved. authoring/benchmarks/compare-sword-contracts.mjs reproduces via CLI; sword-contract-builds.json records first pair: 2661.5ms source build incl cold rig load,1378.59ms joined build; not a transport/performance winner claim. Run f8b96ec7-996f-448d-875d-2e91abecdff9 closed completed with limited visual evidence. Browser checked both connection midpoint poses, recovery poses, replay and inspector. Candidates/receipts remain pending formal visual/physical validation. Screenshot editor/movement-contract-preview.png. Viewer left on joined study; service restarted latest core on5174 (exec session41694),5173 remains running.

Validation: 4 contract tests +18 authoring +5 CLI +9 editor tests pass (36). Additional focused MCP test verifies structured spec errors; editor TypeScript and both builds pass. No further tests required absent changes.

## 2026-10-04 — common movement window discovery

Added read-only `find_common_motion` (33 MCP tools, also CLI) with revision-checked active movement pairs. runtime/common-motion.ts samples 15 major body joints at30Hz, searches contiguous same-speed diagonal matches by pelvis-relative position and local quaternion RMS, reports source seconds/from-to, root AND pelvis displacement, motion excursion, hashes and errors. Stationary/near-stationary runs excluded unless includeHolds; upper/lower body subsets explicitly remain partial evidence. Limits:30s per source,1–10results,minDuration.1–10s,.001–.25m,.1–45deg,defaults.2s/.06m/12deg/5results. Cache holds six hash-keyed signatures, refreshes LRU before sampling second source; no project writes. Sampling avoids duplicate float-roundoff endpoints; off-grid tail under33ms is omitted. No retiming/mirroring/yaw alignment/contact guarantees; no automatic base extraction or contract creation.

Live results: Regular A0–.433333 maps Combo0–.433333 (positionRMS.01313m/rotation1.35deg); B0–.533333 maps Combo.466667–1.0 (positionRMS.01498m/rotation1.70deg). Latest first client times139.12/7.74ms (firstcoldrig), cached2.24/1.49ms; benchmark evidence authoring/benchmarks/common-motion.json, reproducible common-motion.mjs. No sources/actions/preview changed. Read COMMON_MOTION.md. Repo+installed movement-building/action-composition skills route candidate extraction through adapt_movement only after full-body visual/travel review.

Validation:4 new numerical/live-rig tests covering offsets/travel, held-vs-moving exclusion, partialbody, cache/revisions/read-only and LRU eviction;8 contract/common tests,23 authoring/CLI regression tests,editor TypeScript pass. Focused MCP end-to-end test confirms tool discovery and actual matching. Service finalupdated on5174,execsession58715; viewer remains available on5173.


## 2026-10-04 — YOLO26 rendered-action pilot

Added optional CLI capture/check scripts in authoring/vision, npm vision:capture / vision:check / test:vision. Read-only action copies, shared CharacterPlayer, front/side software-WebGL capture, 12 camera-projected rig landmarks; 34 normal +2 transient shin-length controls, no Studio preview/library mutation. Isolated .authoring/vision-venv (1.1GB disk), official yolo26n-pose.pt cached locally, CPU2threads, no background service; VoiceHelper remains running. Model/dependency hashes/versions and source revisions recorded.

Repeat36-frame capture5.068s; Python imports/load/warmup/predict/annotation measured5.781s total, mean repeated prediction66.24ms/frame. All frames detected one person,10–12 confident body landmarks.30 normal agreements,4 normal disagreements,2 flawed disagreements under exploratory8% body-height threshold. Crucially distorted front kick scores BETTER than original (12.7% vs25.6%): left/right ambiguity and pivot/surface differences make this unsuitable as automatic naturalness validation. Exact rig control detects1.8× shin length. Existing cached3D common-motion matching1.49–2.24ms/pair serves a different task and stays preferred for discovery. No video matcher, physical solver or newMCPgate.

See docs/VISION_POSE_EXPERIMENT.md and authoring/vision/results/pose-report.json plus kick-control-comparison.png; first-run reports preserved.4 metric tests and strict rendererTypeScript pass, capture ran twice, annotated controls visually inspected. Next recommended deterministic3D support/contact/seam checks, YOLO only optional visual-review signal.


## 2026-10-04 — deterministic motion-quality inspection

Added read-only inspect_motion_quality to shared CLI/MCP (34 tools), actionId+sourceRevision with optional start/end, declared contact intervals and bounded thresholds. runtime/motion-quality.ts samples actual normalized rig at60Hz plus exact endpoints, compares skeletal lengths/scales against imported rest, reports candidate foot intervals and declared intent drift/height, root/pelvis travel separately,15-joint peaks and finite-difference phase seam velocity changes with diagnostic review windows. Root-bone→pelvis is measured body-offset, excluded from anatomy flags after live pilot found normal crouch false alarms. No flags never certifies naturalness; no inferred facing/confirmed support/IK/balance. Recipe anchors add join-only intent; metadata support never becomes full-clip contact. No project or preview writes.

Nine live reports in authoring/benchmarks/motion-quality: six Regular Sword sources, both studies, kick. Firstservice68.83ms, subsequent14.72–40.12ms. Joined197frames40.12ms flags two seam windows~.5533/1.2067s; kick one~.740s. Whole source Combo has no internal phase seams, so cannot compare seamflag counts as a quality score. Projectsequence231 unchanged. CLI window example saved cli-window.json; actualCLI and MCP integration verified. Sourceactions untouched. Read MOTION_QUALITY.md. Contract docs distinguish historical proposal/current operations. Repo+installed three Animation Studio skills updated and allthree pass skillvalidator using isolated Pythonvenv.

Final 38 tests pass (seven focused numerical/live-rig plus authoring/CLI/contracts/common-motion regressions); original suitecount assertion updated33→34 and MCP test now exercises inspection/stale rejection. TypeScript/build pass. Finalservice on5174 execsession27292; viewer5173 unchanged.

## 2026-10-04 — persisted contact reviews and seam policies

Added shared CLI/MCP review_movement_contacts, review_connection_policy and get_contract_reviews (37 tools). Reviews live in the small atomic project.json.contracts.json sidecar, with bounded superseded history, expected review revisions, timestamps, source revision/hash pins, measured settings/metrics, visual notes and artifacts. Contact reviews become stale after source edits; seam policies require both current sources. Export/import preserves evidence without rebinding source revisions. No main motion project rewrite for review registration.

Actual Regular Sword pilot: both feet visually supported in A Recovery r1 .75–.96s and source Combo r1 2.85–3.00s. Source-only sampled front/side evidence; remaining intervals unknown and physical balance unverified. A→B and B→C policies at .12s blend,1×→1×,anchor none are explicitly needs-review because outgoing velocity-change flags remain. Neither seam approved. Exact captured pins verified before registration. See docs/CONTRACT_REVIEWS.md and authoring/reviews/sword/{registered-reviews.json,frames/frames.json,frames/contact-review.png,frames/seam-review.png}.

Semantic builds map supported contact times through playback speed and incoming blends into source-only receipt intervals. Exact seam configurations/decisions appear in receipts: rejected policies block; supported policies require matching timing/speeds; needs-review remains a warning. No automatic anchoring or whole-action contact certification. Existing compiled receipts are unchanged. Read-only live dry runs in authoring/reviews/sword/build-checks.json confirm source study receives two contact intervals and joined study two matching needs-review policies without committing or changing motion revisions.

Studio movement inspector displays contact evidence and seam decisions; action receipt summary shows propagated evidence. Three repo and installed Animation Studio skills updated and validated. New schema/storage/live-rig tests cover independent persistence, retiming, stale pins, unsafe approval rejection, policy enforcement, history and import validation. Full relevant regression passed51 tests; final focused contract suite8 and MCP integration1 pass; editor TypeScript and both builds pass. Final local authoring service5174 execsession14240; viewer5173 remains running. No source/action motion changed.

## 2026-10-04 — completed bounded Sword review and prompt test

All six Regular Sword r1 sources remeasured and sampled visually in Front/Side; all ten measured contact candidates inspected at start/mid/end. Persisted eight supported source-only intervals and two uncertain braced left-foot intervals across A Recovery,C,Combo. A/B/B Recovery have no stationary candidates at current settings; unrecorded time remains unknown. No physical contact/balance or sword prop validation. Source movements unchanged. See docs/SWORD_PILOT.md and authoring/reviews/sword-completion.

20 transient pair builds use production compiler and inspector at 1/60,1/30,.06,.12,.2s with1× speeds,no anchors, no Studio writes. A→B .06s improves max RMS boundary jump to .617m/s (no configured flags), versus1.002 at .12. B→C remains flagged at every duration; A→A Rec remains marginally flagged (~1.009); B→B Rec has no flags. Separate saved comparison actions sword-a-recovery-review,sword-b-recovery-review,sword-tight-join-review r1. Front/Side join sheets reviewed. Current policies A→B .06 supported(reviewr2),B→B Rec .12 supported(r1);B→C .12 needs-review(r2),A→A Rec .12 needs-review(r1). Supported means bounded sampled visual/configured numerical review, not production/physical certification. Old .12 A→B decision remains in history; typed recompile must adopt .06 or obtain new timing review. Original studies/receipts unchanged.

Tracked review run956b69dd-8727-453a-9bf5-f2170e5ed67b completed9m14s,7.17s recordedservice; includes library preparation/experiments. Independent prompt test59e32fd1-78ac-46c8-9be1-bd343fc9f7c8 completed178.99s inclLLMreview. Prompt “Perform two linked sword attacks, then smoothly recover to standing.” compiled sword-two-hit-recover r1 (name Sword · Two attacks → Recover),2.18s A→B→B Rec with bothsupportedconfigs,onebuild,no retries/sourceedits;zero fullactionconfiguredflags. Automatedstage4.46s inclcompile/persist4.27s;30framecapture5.38s. Nine wholeaction progressionframes per camera reviewed, exact seam source/config evidence prior reviewed, browser replay verified standing finish. Sampled review logged separately; savedreceipt stillwholeactionvisualpending. Currentpreview thisactionSidecamera1×pausednearfinish; inapp tab3 markeddeliverable. Service5174 session14240 remains;5173viewer running.

Docs docs/CONTRACT_REVIEWS.md marks initialpilot historical; docs/MOVEMENT_CONTRACTS.md updatescurrentpolicy/exampletiming. docs/SWORD_PILOT.md records exactintervals,seamsweep,timingbreakdown,reproduction andlimitations. Four pilot scripts node--checkpass; focusedcontract/review8tests pass. No runtime/API/UI code changes this turn; no need rerun unchangedfull51testregression. Next expand appropriateexistinglocomotionfamily aftersourceinventory: currentUAL2has SlideStart/Loop/Exit and specializedwalks, lacks genericrun/start/stopset. UnresolvedSwordjoins likely need velocity-awarebridge/overlap experiment rather thanfurtherduration-onlysweeps. No newtransportor tool required.

## 2026-10-04 — second semantic family: locomotion Slide

Expanded existing UAL2 catalog semantics to SlideStart/Loop/Exit (locomotion-slide), retaining original r1 tracks/hashes. Detailed semantics now9/43 movements; candidate connection catalog6 total. New slide-start-to-loop and slide-loop-to-exit hashes pinned; each endpoint match~.00227m/2.656deg. Sources are in place (rootzero;pelvis lowers/rises~.789m); controller supplies worldtravel. Exit is running stride, notstandingguard. Footcandidatesnone, low-poseballheights~.10–.11m; body/hand support notcovered by current foot-only tools. No contactapprovals/anchors invented.

Created slide-contract-study (name Slide · Enter → Sustain → Exit),3.4533s,Start→.06sjoin→2sLoop→.06sjoin→Exit at1×. Bothjoin windows andfullactionzero configuredflags;Front/Side start/mid/end joins andnine whole-sourceframes per camera sampledreviewed. Persisted both exact no-anchor .06s/1× seam policies supported r1; immutablecataloglinks remaincandidates. Initialactionr1 thenreceipt-refresh recompile r2 withidenticalmotionhash, so r1captures show currentmotion. Bothpolicies inr2receipt;wholeactionreviewpending withsamplednotes inrunlog. Viewerreplay reachedrunningstrideExit;tab3 markeddeliverable. Alloldactions/sources preserved.

Artifacts authoring/reviews/slide/{inputs.json,source-sheet.png,frames/frames.json,build.json,join-sheet.png,joined-frames/frames.json,registered.json,run.json};pilot scriptsprepare/curate/build/register. docs/SLIDE_CONTRACTS.md explains semantics/travel/support/recipe/reviewlimitations. docs/MOVEMENT_CONTRACTS.md updatedfamilycount. Repo+installedmovement-building/action-composition skills updated via skill-creator guidance andvalidatorspass. No new tool/schema/runtime/UI feature;same37MCPoperations andCLI.

Run9608949a-49ed-47de-bd2a-e2069e29529d completed13m43.58s preparation/review,6.65sservice; initialbuild2.85sclient. This is familycuration,notwarm prompt-onlyspeedbenchmark. Service reloaded catalogon5174 execsession4000;5173viewer unchanged. Focusedcontract/review9tests pass (newSlide case coversdiscovery/compile/wrongpair/stalehash/nofabricatedcontacts). Testinitiallymutatedcacheobjectinplace; correctedfixturetoreplace actionobjectasactualservice does. Bothskillsvalidated;fourpilotsyntaxchecks pass;authoringbuildpasses. SandboxedfocusedMCPtestNode26nativeasyncassertcrashedbeforetestexecution; retry with local socket permissions passed the focused MCP integration test. Next controllertravel pluscompatible sourceforrunning/standingexit;body/handcontactinspection separatecapabilitygap.

## 2026-10-05 — full active library contract coverage

Completed sampled-review classification for all 61 active base movements: all43 UAL2 Standard sources plus18 local/adapted movements. Separate authoring/contracts/studio-local.json preserves per-movement source descriptions instead of attributing UAL1/Mesh2Motion/local variants to the UAL2 GLB. Shared manifest/typed-spec discovery resolves both catalogs and cross-catalog relationships; existing motion unchanged. Local source schema is validated separately with strict provenance. New sources still need curation; this is a pinned reviewed snapshot, not a generic mutable contract registry.

Source inspection: all61 revision/hash pins verified, 60 Hz quality reports retained. Added34 UAL2 semantic reviews and18local reviews with seven progression poses in Front/Side. Every remaining measured foot candidate captured at exact start/middle/end in both views, checked and registered through shared review API: added69 UAL2 intervals (65supported/4uncertain) plus23local supported intervals. Current totals102 reviewed candidates,96supported/6uncertain. Uncovered intervals remain unknown. Candidate-free sources do not imply no contact; body/hand/knee support and prop interactions remain unverified. Local advancing step retains internal velocity-change flag. Name caveats: local move-guard is arms-down stance, not defensive guard; UAL2 Knockback ends lying down; LayToIdle gets up; SlideExit ends running.

Added21 purposeful pairs and separate compiled contract-* review actions. All five boundary frames per Front/Side reviewed, exact policies saved:9supported/12needs-review new joins. Current totals27curated connections,13supported/14needs-review. Existing Sword/Slide policies preserved. Supported additions: Hook→Rec,NinjaStart→Hold,ZombieIdle↔Scratch,RailIdle↔Call (explicit1.5x),KickEntry/Return,CounterCross→Finish at .06blend. Needs-review configurations retain measured velocity flags; no fabricated physical approval or automatic foot anchors. Cross-catalog QuickHook→UAL2HookRec is reviewed needs-review. Review actions retained as evidence; receipts not silently rewritten after policies registered.

Capture added opt-in --follow-root (world XZ target, recorded camera metadata; defaultfixed unchanged) after traveling local clips left fixed side camera. Recaptured local clips with full poses visible; no motion/world-coordinate changes. Evidence in authoring/reviews/catalog including inventory/local-inventory, allsource reports, semantic-review/local-semantic-review, frame manifests/sheets, built/registered pairs and contact reviews. coverage-audit.json confirms current all61classifications, all102 candidate decisions, all27 policies with valid sources/evidence; failures[]. Slide policies point to retainedr1 history after identical-motionr2 refresh, audit verifies historical hashes rather than rebinding. Reproduce read-only motion/source audit with node authoring/reviews/catalog/audit.mjs (writes report only).

docs/LIBRARY_CONTRACT_REVIEW.md contains full movement/policy tables, selection workflow and limitations; docs/MOVEMENT_CONTRACTS.md and repo+installed movement-building/action-composition skills updated/validated. Regression41 Node authoring/MCP/CLI/contracts/reviews/motion-quality tests pass;4Python vision tests pass; actualroot-followcaptures exercise render feature; authoringbuildpass. Two new contract tests cover allUAL2semantics, local provenance validation, local typed composition, cross-catalog discovery and stale source hashes. Service reloaded port5174 execsession86112; viewer5173 retained. Next motion work is velocity-aware joins and travel continuity for14 reviewed flagged configurations, plus internal advancing-step seam; coverage completion does not certify all motion production-ready.

## 2026-10-05 — velocity and travel continuity

Implemented opt-in velocity-aware connection and root travel continuation in runtime/connection.ts and runtime/movements.ts, exposed through existing compose_action/build_action_spec, recipe v2, receipt/config schemas and exact mode-aware policy matching. Legacy defaults/actions unchanged; source tracks unchanged. Velocity/travel modes reject contact anchors. Source quaternion tangents and speed-corrected position velocities are baked at 60Hz; root continuation carries constant translation offsets, not facing or IK.

Measured all14 formerly flagged joins, refined durations where needed, captured334 Front/Side frames and reviewed progression plus both boundaries. Registered13supported configurations and1needs-review (counter-guard-to-cross, .5s still incoming right-hand/forearm velocity flag). Current coverage audit:61classified sources,102reviewed foot candidates,27policies:26supported/1needs-review, failures[]. Advancing-step internal flag remains. Artifacts authoring/reviews/velocity/{results,policies,capture,run-id}.json plus frames and sheets. Review approval is bounded/configuration-specific, not physical validation.

Encountered JavaScript string limit at510MB pretty project JSON; atomic persistence now compactJSON, same data/history about208MB. Failed save was not blindly retried: service reloaded persisted revision and refinement resumed. Whole-project growth remains future storage work. Refinement attempts file contains retained trials only.

44Node tests passed including3new connection tests; authoring/editor builds pass. docs/LIBRARY_CONTRACT_REVIEW.md regenerated from audited policies; docs/VELOCITY_CONNECTIONS.md describes exact settings, math, limits and evidence. docs/MOVEMENT_CONTRACTS.md and composition/building skills updated. Service5174 runs execsession37593; viewer5173 retained. Next targeted motion work: counter cross source/transition, advancing-step internal boundary; storage partitioning separately.

## 2026-10-05 — documentation organization and current architecture

Moved35 project documents into docs/, preserving component/action/source-attribution subpaths; kept root README and executable skills/*/SKILL.md entry points in place. Added docs/CITRUS_JELLY.md for original root demo details and docs/CURRENT_STATE.md for current features,37operation inventory, source/library/spec/compiler/player/review/run-log flow, persistent file ownership and limits. README now explains all three demos, startup/code layout and links every documentation page. Historical plans/editor milestones explicitly point to current state; authoring README rewritten around current service rather than stale21/24tool counts. docs/document-locations.json records migration.

Repaired local and absolute documentation links including repository skills; report generator writes docs/LIBRARY_CONTRACT_REVIEW.md. Original source code/assets, source license text files, runtime state and evidence artifacts remain at their existing paths. Executable skills remain operational entry points and are not moved into docs/. Current state remains61movements/102reviewed candidates/27curated policies (26supported/1needs-review); no new motion change. Verified all local Markdown link targets and README indexing.

## 2026-10-05 — reference video to action investigation

Investigated visual-only and YOLO26-assisted human-video analysis against actual current action spec/vision code and official Ultralytics pose/tracking documentation. docs/VIDEO_TO_ACTION.md records input specification, event screenshots/brief artifacts, timestamps/mirroring/confidence/unknowns, exact library-contract mapping, prototype gaps and golden-fixture comparison plan. Current check_pose.py requires projected rig ground truth; cannot ingest raw video unchanged. ffmpeg/ffprobe available, cached pose model/environment already exist. No video supplied, pipeline wrapper implemented or action generated in this investigation. Recommended first reference single right forward kick, full body, static front-oblique camera,5–8s with entry/exit stillness,1080p60fps preferred; optional side view is not synchronized3D reconstruction.

Visual-only baseline should be frozen before YOLO additions. Observed phases/2D angles/support hints remain evidence, not compiler schema extensions, quaternion reconstruction or contact approval. Existing source selection plus actual revision/hash/configuration validation still required; four-second/eight-step composition and whole-source speed limits matter. README/current-state guide link the investigation.

## 2026-10-05 — first actual human-video pilot

Analyzed user Desktop screen recording23.416667s,1478x820,744actualframes/variable-rate. First overview extraction before tracking run, then trackedrun fbaa2585-32fd-46fa-974c-7625b2a3f6ae. Selected11.45–13.75s lateral snap-kick cycle; original untouched and re-encoded2.3s silent trim retained. Exact ffprobe timestamps matched decoded frame indices; original/overlay chronological keyframes and dense sheets retained. Frozen visual-only brief precedes YOLO; refined pose-assisted prompt uses denser frames and visually rejects detector peak, so no claim detectoraloneimprovedtiming.

YOLO26n CPU2threads processed67unique timestampedframes,foregroundselectedinitialtallestthenIoU, no missingselections/all12bodylandmarksabove.5. Predictions2.684s,Pythonwall11.306s. Model/versions/sourcehash/rawdataretained. False179.57deg knee at13.017s (.796 minimum confidence) duringvisibleflexedrecoil rejected; truevisibleextension~12.85–12.883s. Contactpressure,3Dangles,footorientation/mirroring unknown.

Currentlibrarykicksource move-kickr1 isforward/armsdown,notlateralsnap/raisedhands/gatheringtravel. baseline-spec dryrunvalid commitfalse only; no incompatible actioncommitted andviewer unchanged. source-fit.json requestscoordinatedsidekicksourcebeforefaithful actionbuild. docs/VIDEO_KICK_REFERENCE.md andREADMEindexed givekeyframes,prompts,sourcegap,evidencefolder authoring/reviews/video/kick-reference. Scriptsareclipspecificpilot,notgenericingestionAPI. Completedanalysisrun doesnotimplyfaithful3Dgeneration.


## 2026-10-05 — bounded 3D estimation and retargeting benchmark

Added docs/NEW_PLAN.md and VIDEO_RECONSTRUCTION_BENCHMARK.md. MotionBERT Lite official source/checkpoint cached under .authoring; no new Python packages. Three detector trials (full nano, crop nano, full small), 70 estimated frames, Quaternius direction retarget/bake, offline captures and actual-rig diagnostics retained. Small warm 3D median .217s; retarget17ms; 18 captures4.812s including browser startup. Draft video-side-kick-draft r1 saved/selected, explicitly labelled extension failed; no approved movement registered. Chamber/return recognizable but near-straight lateral extension absent in both filtered/raw-input 3D estimates. Rig check0 bone-length changes/3 motion flags. Three reconstruction tests pass. Scripts bounded to2.3s fixture; generic IR validation, ingestion orchestration, synced video viewer and reliable contact/root recovery remain future work. Next quality gate: verify input conventions and compare another backend or observation-constrained fitting. Tracking run4b6cc564-ca47-431f-b966-19e2eb054607.


## 2026-10-05 — observation-constrained side-kick fitting

Run320d7307-08ae-4927-9773-2c79468fec89. Verified official limb/flip indices and crop equation; axial synthesis/confidence/resampling remain approximations. Added bounded authoring/reconstruction/fit.py: orthographic weighted observations, depth prior, soft segment lengths/temporal regularizer. Unconstrained fit retained79.6degree knee; side-view near-straight-knee observation prior reaches179.9degrees and recognizable lateral extension. It is an explicit ambiguity assumption, not new3D ground truth/generalIK. Fit400steps0.524s (3.001s process), retarget19.7ms. Saved separate video-side-kick-fitted r1 and selectedFront1.4s; previous failed draft kept. Full70timestamps/two-camera captures, extension sheet and preview.mp4 retained under reconstruction-fitted. Actual-rig five velocity flags; not approved movement. Four reconstruction tests pass. Next: temporally consistent outlier/depth/root handling without erasing snap timing, then synced video/character review. NEW_PLAN and benchmark report updated.


## 2026-10-05 — temporal stability follow-up

Run a04d0295-76c5-4200-8edc-58f207b1d1b3. fit.py --stable: stronger depth acceleration, continuous straight-knee observation weight, conservative isolated excursion rule (none rejected here), root-only5sample binomial. Saved separate video-side-kick-stable r1 selectedFront1.4s. Original time grid/peak12.85s unchanged; normalized depth variation90%lower, image-rootvariation82%lower. Fit.570s/retarget20ms,5tests pass.70frames×2angles captures retained. Actualrig no bone changes and flags5→3 around1.33/1.47/1.7. Hypothetical left support1.05–1.7 has maxdrift.270→.345m (worse), path/speed lower; no contact approval/IK. Evidence under reconstruction-stable, report/NEW_PLAN updated. NextPhase2 explicitreference/motionbundle andPhase3sharedvideo/playerreview; foot/root correction requires reviewed support/camera assumptions.


## 2026-10-05 — reference/motion bundle v1

Phase2 implemented for stable side-kick fixture: authoring/reconstruction/contracts.mjs (JSON Schema definitions, strict structural/semantic checks, canonical digest and piecewise time mapping), bundle.mjs (pilot packager/read-only inspector), schemas/*.schema.json. Portable bundle under authoring/reviews/video/kick-reference/bundle contains67COCOobservations/70H36Mestimates/trim video/actual savedaction/quality/rawIR. SHA/bytes verify allfiles; source/time/actionrevision/hash/rig/rawestimate crosschecks. Contacts unconfirmed/mirroring unknown, onlydraftstatus. Stage fingerprints includecode/model/input/rig root-scale dependencies; no automaticcacheexecutor yet. CLI npm run reconstruction:bundle -- inspect bundle/bundle.json; build-pilot uses retained receipt, no liveprojectread/write. Five newbundle tests plusfive existingreconstructiontests pass. docs/VIDEO_MOTION_BUNDLE.md andNEW_PLAN/README updated. NextPhase3 synchronized video+characterreview usingexplicit timeanchors; no new motion/approved movement/MCP operation this milestone.


## 2026-10-05 — synchronized Studio video review

Added existing-page Video review button, ReviewVideo.tsx slave media player, runtime/review-sync.ts time mapping/drift rule, server fixed read-only video-review routes with ranges and bundle validation. Opens pinned stable action only if live revision matches; reference/action checksum verified. Shared timeline/replay/loop/speed/frame steps, three flagged windowbuttons, existingcameras with rootfollow/zoomout. No new action/MCP operation. Browser checkedseek1.47 both/video/source12.92, playbacknearclock, loopwrap, step1.3467.3sync tests/9editorregressionspass; buildpasses. Screenshot review-studio.jpg. Demo5173+service5174 were notrunning initially; restoredboth (VoiceHelperuntouched). UInewmode sessionlocal; closeviaVideo review/switchaction. Future: arbitrarybundlepicker, timingeditremap and calibratedshadowoverlay.


## 2026-10-06 — Claude takeover, git and partitioned project storage

Claude (Opus 5.5) now leads the project. Added `CLAUDE.md`, `.mcp.json` (animation-studio MCP for Claude) and `.claude/skills` → `skills/`. The folder is a git repository published at https://github.com/sses79/3d-action (public). `.gitignore` excludes `.authoring/`, generated bundles, the local CA certificate and all video/image files under `authoring/reviews/video/` (third-party tutorial footage); a fresh clone therefore lacks the live library and fails the reconstruction-bundle tests and Video review mode.

Project storage is partitioned. `authoring/project-store.mjs` writes `.authoring/project.json` as a ~0.5 MB index and stores each unique action body (current, reference, history) once in `.authoring/project.json.blobs/<sha256>.json`. `Studio.persist()` and the constructor use it; in-memory state, exports/imports and all 37 operations are unchanged. Blobs are checksum-verified on load, a missing or corrupt blob throws rather than being treated as an absent project, and unreferenced blobs are deleted only after the new index is written. Legacy monolith files still load and are copied to `project.json.legacy.json` on the first save.

The live project was migrated: 119 entries, 153 blobs, 117 MB on disk (was 221 MB), largest file 3.7 MB; reloaded state is identical to the legacy file. Measured on this machine: unchanged save 0.76 s (legacy stringify+write 1.08 s); load ~2.1 s either way. Each save still serializes every action to hash it; an identity cache would remove that but needs proof that stored actions are never mutated in place. The 221 MB `project.json.legacy.json` backup is retained until the user approves deleting it. `authoring/reviews/catalog/audit.mjs` now reads history through the store and still reports failures [].

81 Node tests pass (four new in `tests/project-store.test.mjs`); authoring build passes; live service smoke-checked through the CLI and then stopped. Neither server is left running.


## 2026-10-06 — Phase 4: reconstruct_motion

Added `reconstruct_motion` (38 operations) with orchestration in `authoring/reconstruction/pipeline.mjs` and a generalized `observe.py`. `lift.py`, `fit.py` and `retarget.ts` lost their fixture constants (70 samples, 12.85 s peak, 2.3 s window, fixed phases) behind backward-compatible options; `fit.py --no-straight-knee-prior` makes the side-view assumption optional and the operation defaults it off. Stages cache separately under `.authoring/reconstruction-cache/`. See `docs/RECONSTRUCT_MOTION.md`.

Verified against the original recording: keypoints, lifted and stabilized positions and all 66 tracks differ from the pilot by exactly 0. Uncached 17.1 s (observe 12.2), repeat 0.02 s; fit changes rerun fit+retarget, phase changes retarget only. Ran through the live service and CLI on a second window (16.5–21.5 s, 23 s) without committing; that draft was not reviewed in detail. The live library was not modified (sequence 428). Because stage scripts changed, `bundle/bundle.json` stage fingerprints were regenerated with `build-pilot`; data files are unchanged.

84 Node tests pass (three new in `tests/reconstruction-pipeline.test.mjs`, using fake stage runners); editor TypeScript passes. Open: resident Python models, cache eviction, subject choice, and Phase 5 skills. Installed Codex skill copies under `~/.codex/skills` were not updated. Neither server is running.


## 2026-10-06 — side-kick review: leg repair and knee prior

User reported a knee problem and an unnatural end to the kick in the reconstructed side kick. Frame comparison showed the detector merging the blurred kicking leg onto the standing leg in four frames, and the straight-knee prior locking the standing knee at 180° (or, disabled, letting it fold to ~110°). `lift.py` now bridges merged-leg frames; `fit.py` straightens only a raised leg and keeps a planted knee above 160°. Details and numbers are in `docs/RECONSTRUCT_MOTION.md`. Saved `video-side-kick-v2` r1 in the live library (earlier drafts untouched) and selected it in the viewer. Thresholds were set on this single clip. The pilot bundle's original stage fingerprints were restored; its test now asserts repeatable packaging rather than equality with current code. 84 Node tests pass. Authoring service left running on 5174 for review.


## 2026-10-06 — side-kick height and lean

User asked for kick height and lean fixes on `video-side-kick-v2`. Causes measured at the peak: the torso retarget frame squared the spine to the shoulder line (rig lean 35° against 48° estimated), and the ankle keypoint slid up the blurred shin, which the fit read as a leg pointing toward the camera. Added `torsoFrame` (operation path only) and straight-leg reach restoration in `lift.py`; see `docs/RECONSTRUCT_MOTION.md`. Saved `video-side-kick-v3` r1 and selected it; v2 and earlier drafts untouched. 85 Node tests pass. Service running on 5174.


## 2026-10-06 — legs crossing through each other in Gather

User reported the knees passing through each other from about 0.53 to 0.74 s and back at 0.94 s. Rig measurement confirmed it (legs within 0.6 cm from 0.60–0.93 s, knee depth order flipping at 0.63 and 0.90 s). Added a leg non-penetration term to `fit.py`; see `docs/RECONSTRUCT_MOTION.md`. Saved `video-side-kick-v4` r1 (minimum leg distance 11.3 cm, no flips) and selected it at 0.7 s, Front camera. 85 Node tests pass. Service running on 5174.


## 2026-10-06 — left-leg wobble in the ready hold

User reported a left-leg wobble at 1.98–2.00 s. Cause: the planted-knee floor in `fit.py` was gated by 2D straightness and toggled for single frames near its threshold. It now follows the observed 2D angle below 160° with no gate; see `docs/RECONSTRUCT_MOTION.md`. Saved `video-side-kick-v5` r1 (left knee jerk at 1.97 s 5.4 → 0.8 cm/frame² on the rig) and selected it at 1.97 s. 85 Node tests pass. Service running on 5174.


## 2026-10-06 — second clip: flying side kick

User supplied `~/Desktop/Screen Recording 2026-10-06 at 12.06.46.mov` and said only one take of the repeated jump kick is needed. Used 33.85–36.0 s. Added `airborne` to `reconstruct_motion` (ankle-height-based root lift in `retarget.ts`, `lowestAnkleImageY` emitted by `lift.py`); see `docs/RECONSTRUCT_MOTION.md`. Saved `video-flying-side-kick` r1 with five phases and selected it. Depth direction of the kicking leg is unresolved. 86 Node tests pass. Service running on 5174. The new video and frames derived from it are not in the repository.


## 2026-10-06 — Video review follows the selected action

User reported that Video review did not show the source for the flying side kick and that every action made from a video should. The button was hard-wired to the pinned side-kick bundle. Added `pair.videoSource`, `link_video_source` (39 operations), automatic linking on `reconstruct_motion` commit, `/api/video-source` streaming in `server.mjs`, and a review mode in `editor/main.tsx` derived from the selected action. Linked all eight `video-*` actions. Checked in the in-app browser: flying kick at 1.9 s shows the source at 35.75 s; switching to `video-side-kick-v5` keeps review on and shows 12.85 s with its three review buttons. 86 Node tests pass; editor TypeScript and build pass. Service running on 5174.


## 2026-10-06 — flying kick leg level

User asked for the flying kick leg to be horizontal like the clip and for a better lower leg. Cause and changes are in `docs/RECONSTRUCT_MOTION.md` (segment-length slack and wider straightening ramp for a raised leg, airborne-aware raised test). Saved `video-flying-side-kick-v2` r1 and `video-side-kick-v6` r1; earlier versions untouched; both linked to their source videos automatically. It is unclear whether "lower leg" meant the kicking leg's shin (now straight) or the tucked leg (unchanged); asked the user. 86 Node tests pass. Service running on 5174.


## 2026-10-06 — trunk yaw and head direction

User reported the upper body turning left after 1.74 s in the flying kick, where the clip holds a side-on trunk with the head facing the kick. Fit now holds trunk depth to the smoothed lift and uses a stronger depth prior; `lift.py` emits `faceDirection`; `retarget.ts` drives the Head bone from it. Details in `docs/RECONSTRUCT_MOTION.md`. Saved `video-flying-side-kick-v3` r1 and `video-side-kick-v7` r1, both auto-linked to their videos. 86 Node tests pass. Service running on 5174.


## 2026-10-06 — Phase 5 first version

Added `skills/video-to-action/SKILL.md`, `inspect_video`, `compare_video_action` (41 operations), `authoring/reconstruction/sheets.py`, and bounded `corrections` (a cached `correct` stage in `pipeline.mjs`). The capture camera for follow-root renders stands back 8 m at 1.4 m height so jumps stay in frame. Trial run 85993fdf on take 22.75–26.05 s of the flying-kick recording: see `docs/RECONSTRUCT_MOTION.md`. Found and fixed variable-frame-rate timestamp errors in the contact sheet. Saved `video-flying-kick-landing-v2` (selected) and `-v3` (correction demo); archived the mistimed `video-flying-kick-landing`. Review sheets are written to `.authoring/review-sheets/` (untracked). `compare_video_action` depends on Playwright from the Codex runtime folder and local Chrome, as `capture-draft.mjs` already did. 87 Node tests pass. Service running on 5174.


## 2026-10-06 — clip 3 (triple spinning kick)

User supplied `~/Desktop/Screen Recording 2026-10-06 at 15.03.36.mov`. Followed the `video-to-action` skill (run 120af2fd). Added leg-swap repair and a confident-miss rule to `lift.py` (`swappedLegObservations` in the summary) and wrapped comparison sheets into blocks. Saved `video-triple-kick` (v1) and `video-triple-kick-v2` (selected). v2 has kicks 2 and 3 right; kick 1 is missing and the first turn reverses, both detector limits on 18 fps blurred footage; see `docs/RECONSTRUCT_MOTION.md`. Other clips' repairs are unchanged by the new rules. 87 Node tests pass. Service running on 5174.


## 2026-10-06 — clip 3 from the original video

User supplied the original 720p 30 fps file (`~/Downloads/YTDown.com_YouTube_Media_XL9dbg6xQrM_..._720p.mp4`) and said the triple kick is its second combo. Run ef369e51, window 38.85–41.70 s, saved `video-triple-kick-v3` (selected). Kicks 2 and 3 are recognisable; kick 1 is still missing because the footage itself blurs the leg and both cached detectors miss it at 640 and 1280 px. This corrects the earlier claim that frame rate was the cause. No code changed in this step. Service running on 5174.


## 2026-10-06 — tricking basics video: catalogue and pilot

User supplied `~/Downloads/YTDown.com_YouTube_Media_ls9JjJzKFZo_60-Tricking-Basics-...720p.mp4` and suggested cutting it into clips for the library. Wrote `authoring/reviews/video/tricking-basics/catalog.json` (59 clips, names, windows, guessed upright/inverted groups) and added `sourceSpeed` to `reconstruct_motion` (action shortened to real time; `compare_video_action` and Video review map back to footage time). Piloted four clips at an assumed 0.4 speed (run 78495786): results in `docs/RECONSTRUCT_MOTION.md`. Saved drafts `trick-01-hook-kick`, `trick-04-cartwheel`, `trick-16-tornado-kick`; frontflip failed. Asked the user about the speed factor and whether to batch the upright subset. 87 Node tests pass. Service running on 5174.


## 2026-10-06 — tricking basics: batch of 20 upright clips

Footage speed estimated at 0.5 from free fall. `observe.py` now tracks the performer as the longest overlap-linked chain of boxes (fixes wrong-figure selection during crossfades; earlier clips reproduce exactly). All 20 upright clips reconstructed as `trick-NN-…` drafts; grades and notes in `authoring/reviews/video/tricking-basics/batch-upright.json`, review strips beside it (local only). Four good, three fair, eight partial, three poor, two misgrouped. Common failure: high near-vertical kicks are not reproduced. `trick-27-j-step-swing-540` is selected. 87 Node tests pass. Service running on 5174.


## 2026-10-06 — high kicks: arc bridging

User reported Pop 360 (crescent) missing its high kick (0.68–0.89 s). `lift.py` now detects a lost leg by an impossible one-frame jump as well as by merging, keeps it lost until two good frames, and bridges lost runs along an arc about the hip that avoids the other leg (`legArcBridges`). Pop 360 now matches on a dense sheet. Reran the 20 clips: 9 good, 5 fair, 3 partial, 1 poor, 2 not upright; grades in `batch-upright.json`. `trick-18-pop-360-crescent` r3 selected at 0.76 s. 87 Node tests pass. Service running on 5174.


## 2026-10-06 — spins: limb twist and front-of-trunk rule

User reported on Pop 360 (crescent) that the lower body did not turn with the upper body from 0.22 s and that the kicking leg passed behind the body at 0.8 s, and asked for a rule that a high spinning kick passes in front. `retarget.ts` now carries each limb with its parent's rotation before swinging it onto its direction; `fit.py` keeps a bridged leg on the chest side of the pelvis. See `docs/RECONSTRUCT_MOTION.md`. Reran the 20 tricking clips (new revisions); grades unchanged, two slightly worse at one pose. `trick-18-pop-360-crescent` r5 selected at 0.22 s. 87 Node tests pass. Service running on 5174.


## 2026-10-06 — leg identity across overlapped frames

User reported J-step swing 540 swapping the swinging right leg to the support leg after 0.56 s. The leg-swap repair in `lift.py` was comparing against frames where the detector had both legs overlapped; it now judges identity only between frames with the legs apart. Also: long-way arcs only for swings over 90°, and the lost-leg jump limit scales with `sourceSpeed` (lift stage now receives `--speed`). `trick-27-j-step-swing-540` r5 selected; `video-triple-kick-v4` saved. Batch of 20 rerun started afterwards. 87 Node tests pass. Service running on 5174.


## 2026-10-06 — smooth swings; Hook kick high kick

User reported J-step swing 540 dipping between 0.58 and 0.74 s and asked for a smoothness rule, then the remaining high-kick misses. `lift.py`: reversal rule, lost while overlapped or a stub (60% length), 20-frame runs, straight-line bridge for foreshortened legs. `trick-27-j-step-swing-540` r8 and `trick-01-hook-kick` r8 saved and checked on sheets. Tornado kick, Feilong and Backside 900 second kicks still missed. Batch rerun started afterwards. 87 Node tests pass.


## 2026-10-06 — lost leg chosen by where it reappears

User asked for the Tornado kick, Feilong and Backside 900 high kicks. Added a pre-pass in `lift.py` that, for an unbroken overlapped stretch, marks as lost the leg that reappears far away (details in `docs/RECONSTRUCT_MOTION.md`), switched the straight-line test to image leg length and narrowed the long-way test. Tornado kick r10 and Feilong fixed on sheets; `video-triple-kick-v4` r4 keeps kicks 2 and 3; Backside 900 still wrong. Batch rerun started afterwards. 87 Node tests pass. Pushed through a8b5fea before this work.


## 2026-10-07 — limb roll continuity

User reported Cheat 720 legs appearing to swap at 0.82 s. Positions were right; the kicking leg's roll flipped ~160° in 0.04 s when it pointed straight up (opposite its rest direction). `retarget.ts` now carries each limb's orientation frame to frame and eases roll back toward the rest-anchored value. `trick-34-cheat-720` r10 selected at 0.75 s; Pop 360 (crescent) rebuilt. Batch rerun started afterwards. 87 Node tests pass.


## 2026-10-07 — Cheat 720: legs exchanged in depth, knees backward

User sent Studio screenshots (0.54–0.66 s) and said the legs look swapped at 0.54 and wrong at 0.57. Rig measurement: right foot on the far side at 0.54, knees bent backward at 0.61–0.70. Added knee-direction and own-side terms to `fit.py` (see `docs/RECONSTRUCT_MOTION.md`). `trick-34-cheat-720` r13 selected at 0.54 s. Batch rerun started afterwards. 87 Node tests pass.


## 2026-10-07 — turn continuity; Backside 900

User sent Studio screenshots of Backside 900 (0.54 right, 0.60 upper body wrong, 0.63 legs wrong) and asked that body and legs turn the same way smoothly. `fit.py`: `keep_turning` rebuilds shoulder and hip depth from image width with turn continuity (fit stage now receives `--speed`). `lift.py`: relabel legs before an overlapped stretch when the reappearing leg was the other one. `trick-35-backside-900` r13 selected at 0.6 s; turn is 810° and the high kick goes over the top. Karate clearance fell to 6.0 cm at one frame. Batch rerun started afterwards. 87 Node tests pass. Pushed through 2dcde05 before this work.


## 2026-10-07 — vision decisions stage

User reported Cheat 360 crescent wrong from 0.55 s (right leg up instead of left at 0.58) and asked for a vision-model decision check via OpenRouter with the voice-helper key. Added `authoring/reconstruction/decide.py` and the `decisions` option (stage `decide`, model `openai/gpt-6-luna`; the id the user named does not exist). Facing answers penalize turn candidates in `fit.py`; raised-leg answers only veto swap repairs in `lift.py`. See `docs/RECONSTRUCT_MOTION.md`. The service was started with `OPENROUTER_ENV_FILE=/Users/tim/Yun/voice-helper/.env.local`; the key itself was never printed or copied. `trick-19-cheat-360-crescent` r12 (selected at 0.55 s) and `trick-03-outside-crescent-kick` r12 rebuilt with decisions; the other clips were not. 87 Node tests pass.


## 2026-10-07 — batch with vision decisions

Reran the 20 tricking clips with `decisions: true` ($0.14, 514 frames). First veto version regressed Pop 360 (crescent); narrowed to confident detections and adjacent frames, then reran (answers cached). Final: four clips changed (3, 19, 36, 37); grades 12 good, 5 fair, 0 partial, 1 poor, 2 not upright. Service is running with `OPENROUTER_ENV_FILE` set. Pushed through 42d41f8 before this.


## 2026-10-07 — rule log and batch tool

User asked for a recorded report after each rule change and rerun, to learn which rules help. Added `docs/RULE_LOG.md` (21 rules, scoreboard of 12 runs, lessons), `authoring/reconstruction/batch.py` (tracked replacement for the scratch batch script; writes `runs.json` and prints a per-clip comparison) and `authoring/reviews/video/tricking-basics/runs.json` (12 runs rebuilt from session logs; dates approximate). The `video-to-action` skill has a rule-change protocol. `batch.py run` was smoke-tested on two clips against a scratch copy of the history (no change reported, as expected); it has not yet recorded a real run.


## 2026-10-07 — Cheat 360 crescent bisect; R22, R23; run 13

User asked why rules made Cheat 360 crescent worse and whether and how to roll back. Bisected with ten git worktrees (removed afterwards): no earlier version had the whole kick. Added R22 (relabel after a pinned overlap) and R23 (bridge keeps rotation direction) in `lift.py`; first real `batch.py run` recorded run 13 with decisions on. Grades 13 good, 4 fair, 1 poor, 2 not upright. `docs/RULE_LOG.md` has the entries and a rolling-back section. Session restarted mid-task: scratch helpers were lost and the shell defaulted to Node 18, which cannot load the project (use `/Users/tim/.nvm/versions/node/v26.7.0/bin`). Service running on 5174 under Node 26 with `OPENROUTER_ENV_FILE` set.


## 2026-10-07 — R24, R25; runs 14 and 15

User reviewed Cheat 360 crescent at 0.72–0.97 s: legs should keep their shape and only rotate. R24 (bridged leg keeps its shape) and R25 (short exchanged island after an overlap relabelled, final pass only) in `lift.py`. Run 14 broke (Cheat) 540 kick through an in-loop copy of R25; removed; run 15 is the current state. `batch.py compare --runs A,B` now compares exactly those two runs. Grades 13 good, 4 fair, 1 poor, 2 not upright. Open: right leg at 0.97 s of Cheat 360 crescent. Service running on 5174 (Node 26, OpenRouter key file set).


## 2026-10-07 — R26 second look on turned frames; run 16

User asked to fix the right leg at 0.97 s of Cheat 360 crescent. The detector draws both legs on one limb from 0.89 to 1.09 s; turning the frame lets it find the other leg. New `authoring/reconstruction/reobserve.py`; `lift.py` uses the looks for how far round a wide bridge is (shape still from R24) and writes `reobservedLegFrames`; `fit.py` switches the front-of-trunk term off on those frames; `pipeline.mjs` passes `--video` and `--model` to lift and reports `estimate.reobservedLegFrames`. Run 16: grades unchanged (13 good, 4 fair, 1 poor, 2 not upright); three other clips' fit error fell. Still open on that clip: the leg is bent and short from 0.89 to 1.04 s. The service must be restarted after editing `pipeline.mjs` (a first batch attempt ran on the old pipeline and was stopped before it recorded anything; it left one extra revision on the first clips). 87 Node tests pass.


## 2026-10-07 — R27 knee hinge and joint ranges; run 17

User asked for a knee-rotation rule and for normal joint ranges from the internet. Ranges and sources are in `docs/RULE_LOG.md` R27. `retarget.ts`: calf swings only from the thigh, thigh rolled so the knee bend is pure; report gains `jointRanges`. `fit.py`: knees and elbows fold at most 150 degrees. `pipeline.mjs`: `action.jointRangesBeyondNormal`. `batch.py` rows gain `beyondNormalRange` from the next run on. Run 17: no change in repairs or fit error; knee twist at most 1 degree; grades carried over (13 good, 4 fair, 1 poor, 2 not upright), only three clips re-read. Hip rows flag nearly every clip, so they are informational. 87 Node tests pass.


## 2026-10-07 — Leg through the trunk on Cheat 360 crescent: diagnosed, not fixed; runs 18–20

User saw the right leg pass through the body from 0.89 to 1.04 s and asked whether it is a hip issue. It is: the thigh rises behind the back and crosses the spine. The fitted pelvis faces the opposite way from the starting estimate over those frames while R18's side and knee-direction references come from the starting estimate. Five fit-side attempts were rejected (details in `docs/RULE_LOG.md` after R27); `fit.py` is unchanged from commit adfe5f9 and run 20 equals run 17. Next: settle the pelvis facing for those frames before touching the leg.


## 2026-10-07 — R28 chest-and-face decisions, R29 mirrored limb depth; runs 21 and 22

User suggested asking the vision model for face and chest; `decide.py` now does, and `fit.py` uses face agreement, drops opposite neighbouring answers and steadies the hip turn. It did not settle the facing on Cheat 360 crescent. The leg-through-trunk fault was R19 rewriting hip and shoulder depth without the limbs; `fit.py` `keep_turning` now mirrors limb depth in those frames (R29) and the right thigh stays clear of the trunk. Grades carried over; ten clips touched by R29 were not re-read. 87 Node tests pass.


## 2026-10-08 — R30 solid body parts; runs 23 and 24

User asked for a rule that body parts cannot be inside or pass through each other. `fit.py` `body_gaps` tests rods at the character's proportions (rig lengths hard-coded from `rigProportions`) and separates in depth only; `retarget.ts` measures the same on the rig and reports `bodyPartsInside` and `rigProportions`; `pipeline.mjs` and `batch.py` pass it on. Cheat 360 crescent 16 frames inside → 1; 21 frames across the 20 clips. Only that clip was re-read; grades carried over. 87 Node tests pass.


## 2026-10-08 — R31 no unnecessary depth movement; R30 revised; run 25

User saw the Hook kick leg fold into the body at 0.60 s (run 24). Cause was R30 moving the hip joint and stretching the thigh to make room. `fit.py`: `detour` (R31), `proportion`, R30 restricted to limb joints and no knee-trunk test; `retarget.ts` measure matches. Hook kick stable 0.57-0.65 s. Only Hook kick and Cheat 360 crescent were re-read; grades carried over. 87 Node tests pass.


## 2026-10-08 — R30 third revision; run 26

User flagged Hook kick 0.59 s, Tornado kick 0.83 s and the five frames on Cheat 360 crescent. Knee is tested against a slimmer trunk again and "inside" is a depth shortfall with a side (`fit.py` `body_gaps`/`inside`; `retarget.ts` measure matches). Hook kick fixed (0 frames). Tornado kick and Cheat 360 crescent not fixed: remaining frames are limbs changing side between frames. A one-side-per-stretch attempt was removed. 87 Node tests pass.


## 2026-10-08 — R32 crossing rule across time; runs 27 and 28

`retarget.ts` counts crossings on the rig; `fit.py` `choose_sides` keeps one side per stretch of overlap. Crossings 47 to 9 across the 20 clips; frames inside 38 to 46; fit error worse on 9 clips. Tornado kick 0.81 s still not fixed. Grades carried over without re-judging. 87 Node tests pass.


## 2026-10-08 — R33 straight leg through a wide bridged swing; run 29

User confirmed Cheat 720 and Pop 360 (crescent) look better after R32, so it stays. Tornado kick 0.81 s: the trunk lean is real; the fault was the bridge easing a bent entry shape evenly. `lift.py` now takes the straighter of the entry and exit shapes for the middle of a bridge wider than a quarter turn. Tornado kick and the Cheat 360 crescent right leg are straight. Frames inside 46 to 55, crossings 9. Second looks now record `reach` and `bendDegrees` (noisy; not used). 87 Node tests pass.


## 2026-10-08 — R34 reachable side against the trunk; run 30

Elbows stuck inside the trunk came from R32 assigning a folding arm the back side. `fit.py` `choose_sides` now takes the side of the limb's own shoulder or hip, leaning to the chest, for trunk and head. Frames inside 55 to 34, crossings 9 to 4, no fit-error regressions. Judged on measures only. 87 Node tests pass.


## 2026-10-08 — R35 margin in the fit; run 31

Wrists the fit believed clear were 2-5 cm inside the rig's trunk (model within centimetres of the rig, not exact). `fit.py` `inside` now asks 3 cm more room. Frames inside 34 to 18, crossings 4 to 0, no fit-error change. Remaining frames are one-frame overlaps where R30 and R31 conflict. Judged on measures only. 87 Node tests pass.


## 2026-10-08 — Last 18 frames: not fixed; runs 32-34

Tried making room early around overlaps (all overlaps, then only brief ones) and a heavier R30 weight; all made the totals worse and were removed. `fit.py` is unchanged from aa2b1a4 and the last run equals run 31 (18 frames inside, 0 crossings). Next idea: a targeted pass after the fit on the limb and frames the rig measure names.


## 2026-10-08 — Line drawn

Docs brought level with the code: Open section of `docs/RULE_LOG.md` rewritten as the current state, skill and `CURRENT_STATE.md` mention the rig measures, `CLAUDE.md` notes the service restart and batch time. Reconstruction work pauses here at 35 rules, run 34. Next topic: evaluating SAM 3D Body and related models as a replacement or cross-check for the lift and fit stages.


## 2026-10-08 — SAM 3D Body trial on this Mac (ComfyUI repack)

Research summary and trial. ComfyUI (commit 58b176f) cloned to untracked `.authoring/comfyui` with its own venv; weights `sam_3d_body_dinov3_bf16.safetensors` (2.83 GB) from `Comfy-Org/sam-3d-body` in `models/detection/`. The built-in nodes run headless on the M1 GPU at 1.8-3.8 s a frame (body only), after one workaround in our script for a float64 step MPS lacks. Scripts: `authoring/reconstruction/trials/sam3d_comfy.py` (frames + our person boxes -> npz of 70 keypoints, 127 joints with rotations) and `sam3d_to_h36m.py` (-> our 17 joints). New trial option `externalJoints` on `reconstruct_motion` swaps those joints in for the lift; fit and retarget run as usual.

Two clips, built straight from SAM 3D Body with no fit (`trial-sam3d-19-none`, `trial-sam3d-1-none` in the live project; `-stable` variants ran our fit on top): it sees both legs through the stretch where YOLO26 loses one (Cheat 360 crescent 0.82-1.12 s), so no bridge is needed. Cheat 360 crescent: 0 frames inside, 0 crossings without any depth rule (ours after 35 rules: 4 and 0). Hook kick: 5 frames (wrist 3 cm), 1 crossing; kicking leg long and visible in the front view through 0.55-0.65 s. Our fit on top made Cheat 360 crescent worse (6 inside, 2 crossings) and Hook kick better (0, 0). Seen but not checked: side views lean far back, possibly camera pitch; kicking knee bent at 1.04-1.10 s on Cheat 360 crescent where the video is straight; per-frame jitter not measured. Not yet used: joint rotations, hands, feet, smoothing node, BVH export.


## 2026-10-08 — All 20 clips from SAM 3D Body; run 35

User preferred the no-fit SAM 3D Body builds. `batch.py --external DIR` builds each clip from external joints into `sam3d-<slug>`; `.authoring/sam3d-trial/` holds the npz and joint files for the 20 clips (untracked). Run 35: 5 frames inside and 1 crossing across the set, against 18 and 0 for the rules. Hand-on-floor clips pose correctly but sink through the floor. Open: user review of the set, jitter, lean, floor placement for hands, and whether to make this the default lifter and use its rotations.


## 2026-10-08 — R36 floor under feet, hands or head; runs 36 and 37

`retarget.ts` floors on the lowest of feet, hands and head; `lift.py` emits `lowestSupportImageY` (ankles or clear wrists) and `core.ts` passes it for the jump height. Scoot and Palm kick in the SAM 3D Body set now stand on the hand. Both sets rebuilt; measures and jump heights unchanged. 87 Node tests pass.


## 2026-10-08 — Inverted clips trial; run 38

Cartwheel, Aerial and Backflip (overtuck) built from SAM 3D Body joints follow the video on the review sheets, including inverted phases. Jump heights are not credible for inverted or tucked bodies (1.17, 1.35, 2.01 m): the estimate needs the body's height, not the lowest ankle or wrist. `.authoring/sam3d-trial/` has their joint files.


## 2026-10-08 — R37 height and travel from SAM 3D Body keypoints; runs 39 and 40

`sam3d_to_h36m.py` emits `lowestBodyImageY` and `imagePelvis`; the `external` stage uses them and marks `lowestSupportSource: body`; `retarget.ts` then lifts without the 20-40 cm fade and floors on more joints. Cheat 360 crescent's vertical jolt at 0.61-0.65 s is gone in the `sam3d-` action (max frame step 0.66 to 0.06 m). Cartwheel no longer jumps. Sweeps still step where support changes. 87 Node tests pass.


## 2026-10-08 — Mac mini runner; all 39 inverted clips; run 41

`mini4.local` (user tim, key login from this Mac) runs SAM 3D Body in `~/Yun/sam3d-runner`: `run_queue.sh` processes `poses/clipN.json` into `out/clipN.npz` and logs to `queue.log`. About twice this Mac's speed. All 59 catalog clips now have `sam3d-<slug>` actions (20 upright from run 39, 39 inverted from run 41). `lift.py` crash on a leg lost before first seen is fixed. Open: user review of the inverted set, jump heights for tucked bodies, a build path that does not need our lift at all.


## 2026-10-09 — Plan step 1 done: source body; run 42

`authoring/reconstruction/body.py` (ComfyUI venv) replaces the trial scripts; `pipeline.mjs` branches on `request.source`; `batch.py --source body` builds into `sam3d-<slug>`. Environment keys: `comfy`, `bodyPython`, `bodyWeights`, `bodyReuse` (`.authoring/sam3d-trial`, raw results reused when frames match). All 59 clips build without the lift. Default is still `rules`; step 2 flips it and adds the fallback, smoothing and the mini as a runner. The mini still has the old trial script.


## 2026-10-09 — Plan step 2: body source is the default; run 43

`reconstruct_motion` defaults to `source: auto` (body when installed, rules otherwise or on failure, reported in `summary.source`); `smooth` default 1 via ComfyUI's Smooth node; `action.jitter` in the rig report. `batch.py` defaults to the body source over all catalog clips into `sam3d-<slug>`; `--source rules` builds the 20 upright clips into the plain slugs. 88 Node tests. Three clips (19, 1, 43) have fuller raw results with MHR parameters, run on the mini with the same `body.py`. Open: single-frame pose jumps in twisting clips (jitter up to 60 mm), MoGe field of view, the mini as a configured runner.


## 2026-10-09 — Step 2 closed; MoGe field of view not adopted

MoGe gives 36-40 degrees vertical; with it Predict changes distance (5.2-5.7 m to 3.6-4.2 m) but trunk lean by at most 2.3 degrees on three clips. Not wired in. Details in `docs/SAM3D_PLAN.md`. Next: step 3 (rotations), and the single-frame pose jumps in twisting clips.


## 2026-10-09 — R38 single-frame jumps; run 44

`body.py` replaces one- or two-frame runs whose root turn or keypoints jump out and back, before smoothing; counts in `estimate.despiked` and the batch log. Worst jitter 60 to 29 mm. Longer wrong stretches in four twisting clips remain (Sideswipe, B-twist round, Raiz, Scoot full). 88 Node tests pass.
