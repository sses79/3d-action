# Third project: Animation Studio

> Historical plan or milestone report. Some features described as future work are now implemented. See [Current state](CURRENT_STATE.md) for the current codebase.

Design proposal · 3 October 2026

Updated scope: the editor is the first part of a future mobile-compatible game platform. Read `docs/GAME_PLATFORM_REQUIREMENTS.md` for shared runtime, model, action, and mobile requirements. Implement the editor first; retain its focused workspace rather than building the game arena now.

## Purpose

Build a browser animation editor for a rigged 3D character. Play an action, inspect its timing, ask an LLM to revise it, and compare the result with the saved version. Start with a jump. Later, use the same editor for a punch, roll, gesture, or other action.

Its animation data and evaluator must also be usable by the future game runtime, without importing editor UI code.

The newer character-feel reference adds a second mode: a small input test area alongside timeline playback. Read the character-feel update in `docs/GAME_PLATFORM_REQUIREMENTS.md` for tap/hold/release states, movement response, cue timing, and recorded input scenarios. The first editor milestone remains model playback; input tests follow the shared action core.

The first milestone is the editor design and reliable 3D playback. A game arena, combat logic, and game controls are outside this project.

The supplied Kesar screenshots are visual references. They show a central preview, camera controls, A/B comparison, named timing phases, playback controls, and motion graphs. The original implementation's technology is unknown. This proposal uses our existing Blender and Three.js pipeline.

### Video reference observations

The supplied local video, `ssstwitter.com_1791038579496.mp4`, is about 43 seconds long. Sampled frames across the video show the same action from orbit, top, side, and front views; switching between the new action and two versions together; and colored ghost poses when the Onion option is selected. The current phase has a short intent caption, such as “Hold the anticipation” or “Hang at the apex.” The highlighted phase and graph playhead follow playback.

The video also exposes short **launch** and **impact** beats between longer phases. Support optional named beats and event markers, in addition to the seven initial phase names. These can later trigger effect previews without becoming game logic.

The visible workflow is playback and inspection. The video does not establish how poses are authored, how an LLM edits them, or whether timeline boundaries are draggable. Those are features proposed for our editor. Model format, rig implementation, renderer, and the meaning of the numbered presets cannot be determined from the video.

Use the reference's phase intent caption in our viewport, and allow the asset/LLM panels to collapse so the preview and timeline can occupy most of the workspace.

## Editor design

Use a dark navy workspace with warm gold for selected controls, blue for holds, and muted neutral colors for panels. Keep text readable and controls compact. Begin with a clean 3D view; pixel rendering and motion effects can be added later.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ ANIMATION STUDIO   Character / Jump    Revision 03    Save · Export      │
├──────────────┬─────────────────────────────────────┬────────────────────┤
│ ASSETS       │ Current · Reference · Both          │ INSPECTOR          │
│ Character    │ Front · Side · Top · Orbit          │ Selected phase     │
│ Rig          ├─────────────────────────────────────┤ Hang               │
│              │                                     │ Duration / easing  │
│ ACTIONS      │          CENTRAL 3D PREVIEW         │ Pose targets       │
│ Jump         │                                     │                    │
│ + New action │     One model, or two synchronized  │ LLM ITERATION      │
│              │     models for A/B comparison       │ “Hold the apex     │
│ REVISIONS    │                                     │ longer; make the   │
│ Original     │                                     │ landing softer.”   │
│ Revision 02  ├─────────────────────────────────────┤                    │
│ Revision 03  │ Replay · Play/Pause · Step · Speed  │ Proposed changes   │
├──────────────┴─────────────────────────────────────┴────────────────────┤
│ PHASES    Coil │ Rise │ Hang │ Follow │ Settle │ Recover │ Guard        │
│ TRACKS    Root height · Body · Arms · Legs     ◀ playhead ▶             │
│ GRAPH     Pose speed / root trajectory                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Center:** the character on a floor grid, with lighting and a readable shadow. Orbit the camera without changing the animation. Provide front, side, and top views.
- **Transport:** play, pause, replay from the start, loop, scrub, frame step, and slow motion. Show frame number and time. Playback speed must not change the saved action's timing.
- **Comparison:** current, reference, or both. Both models use the same playhead. Store the reference as an independent snapshot.
- **Bottom:** named phases with draggable boundaries, a playhead, pose markers, and selectable curves. Selecting a phase opens its settings in the inspector.
- **Right:** phase timing, pose settings, and the LLM request/revision panel. Show what the proposed revision changes before applying it.
- **Left:** character assets, actions, and revision history. Keep the first version small: one character and one jump action.

On a phone, retain the preview and transport. Put assets and the inspector in tabs or drawers. Desktop is the primary editing layout.

## Proposed stack

| Part | Choice | Purpose |
| --- | --- | --- |
| Editor UI | React + TypeScript | Panels, selections, timeline controls, and typed animation data |
| Development/build | Vite | Separate editor entry and local development |
| 3D rendering | Three.js `WebGPURenderer` | Reuse the watch demo's renderer approach, including WebGL2 fallback |
| Asset import | Three.js `GLTFLoader` | Load a rigged GLB and its animation clips |
| Playback | `AnimationMixer` / `AnimationClip` | Play clips and seek to a specified time |
| Asset authoring | Blender | Build or prepare the mesh, skeleton, weights, and source poses; export GLB |
| Timeline/graphs | HTML controls + SVG | Editable phase boundaries, key markers, and readable curves |
| Project storage | Versioned JSON + IndexedDB | Save actions, revisions, asset references, and editor settings locally |
| LLM integration | Server endpoint, added later | Send structured animation data and return validated revision proposals |

These are proposed additions. The current workspace has Three.js and esbuild for the watch demo; React and Vite have not been added. Keep the watch build working when introducing the editor's separate entry.

Use Three.js directly inside a React-owned viewport component. The render loop should read animation state without rerendering the React UI every frame. A rendering wrapper is optional and unnecessary for the first version.

## Blender → GLB → editor

1. Select or create one simple rigged character with clear limbs and a usable license. The watch is not a suitable skeletal animation asset.
2. In Blender, check scale, rest pose, skeleton hierarchy, bone names, weights, and ground contact. Keep the editable `.blend` source.
3. Create a small set of source poses and a baseline jump. Bake any Blender constraints needed for exported animation.
4. Export the mesh, skeleton, materials, and baseline clip as GLB.
5. Load the GLB in Three.js. Map its bone names to editor controls such as pelvis, torso, upper arm, forearm, thigh, and shin.
6. Compile editable pose and timing data into animation tracks. Keep root movement separate from local joint rotation.

The first version supports one known rig. Importing arbitrary characters and retargeting actions are later features. Blender constraints are not automatically an interactive browser rig.

## Authoring direction update — 3 October 2026

The user now prioritizes direct prompt-to-action authoring through MCP tools and a supporting skill. Use the existing page for viewing and comparison; manual pose controls are not the next prerequisite. Read `docs/LLM_ACTION_AUTHORING_PLAN.md` for the revised next milestone. This update supersedes the manual-controls-first sequence below.

## Named phases and the LLM

For the jump, begin with **coil, rise, hang, follow, settle, recover, and guard**. These names are an action template. Other actions can define different phases.

| Phase | Initial intent |
| --- | --- |
| Coil | Lower the body and prepare for takeoff |
| Rise | Extend the legs and move upward |
| Hang | Hold a readable pose near the apex |
| Follow | Move into descent and prepare for contact |
| Settle | Absorb the landing |
| Recover | Return to balance |
| Guard | Hold the final ready pose |

Store each phase's stable ID, name, duration, intent, pose references, and transition settings. Derive phase boundaries from durations. Store poses as local joint rotations and root transforms, with a separate rig mapping. Use quaternion rotations in generated animation tracks.

Example of a proposed revision contract:

```json
{
  "schemaVersion": 1,
  "baseRevisionId": "jump-r03",
  "summary": "Longer apex hold and softer landing",
  "changes": [
    { "type": "setPhaseDuration", "phaseId": "hang", "seconds": 0.3 },
    { "type": "setPhaseDuration", "phaseId": "settle", "seconds": 0.24 },
    { "type": "setControlValue", "poseId": "landing", "control": "crouch", "value": 0.65 }
  ]
}
```

Control names and permitted values must come from the selected rig's declared control schema. This example is a proposed data format, not an existing API.

The iteration loop:

1. Select a phase or action and enter a request, such as “Hold the apex longer and reduce the arm swing.”
2. Send the current revision, rig/control schema, phase intent, and requested change to the LLM. Add selected frames or diagnostic measurements later if useful.
3. Receive a structured proposal. Reject unknown controls, invalid values, stale revision IDs, and unsupported operations.
4. Build a candidate revision without modifying the reference. Display changed timing and pose values.
5. Replay the candidate alongside the reference. Accept it as a new revision, adjust it manually, or discard it.

The browser evaluates the animation deterministically. The LLM proposes edits between replays; it does not drive the character frame by frame or execute generated code. Undo/redo and revision snapshots apply to both manual and LLM edits.

## Playback and diagnostics

Use one authoritative playhead in seconds. Each character's mixer samples the matching time. Scrubbing and replay must produce the same pose at the same timestamp. Recompute clips when animation data changes, rather than accumulating transforms during playback.

Distinguish two diagnostics:

- **Root trajectory:** the character's position or height over time.
- **Pose speed:** the displacement of selected joints over time, divided by the sample interval. Define the included joints and coordinate space so comparisons are meaningful.

The reference's pose-speed graph cannot be replaced by a height curve. Offer both as selectable views. Later overlays can show ghost poses, motion arcs, and foot-contact markers. Defer smears and pixel effects until the basic motion is easy to inspect.

## Build order and acceptance

### 1. Design and playback shell

Build the proposed layout with one rigged GLB and one baseline action. Implement play/pause, replay, loop, scrub, frame step, and camera presets. Acceptance: the model remains central and usable, and replay/scrubbing restores the correct pose.

### 2. Editable phases and comparison

Add phase duration editing, selected pose controls, synchronized A/B playback, undo/redo, and local project save/load. Acceptance: a longer hang is visible in playback and survives export/import without changing the saved reference.

### 3. Structured revision workflow

First support importing a revision proposal as JSON. Then connect an LLM through a server endpoint, keeping credentials on the server. Acceptance: a valid proposal becomes a previewable candidate; invalid or stale proposals leave the project unchanged.

### 4. Motion inspection and more actions

Add pose-speed graphs, root curves, ghost poses, and action templates. Test with a second action on the same rig. Add further rigs only after establishing a retargeting strategy.

Verification should cover deterministic seeking, duration changes, reference independence, save/load, undo/redo, and revision validation. Inspect the actual 3D playback and responsive layout in a browser.

## Current status

This document defines the third project. `docs/NEXT_PROJECT_PLAN.md` contains the earlier Harbor Run game proposal and is no longer the selected direction for project three.

The existing `jump/` folder is an incomplete preliminary draft. It contains HTML, CSS, and jump-specific sampling helpers, but no complete renderer entry. It is not a working editor and does not yet implement this design. No LLM service or provider has been selected.

## Checked technical references

- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html): loads the scene and embedded animation clips.
- [Three.js AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html): clip playback, time scaling, and seeking.
- [Three.js AnimationClip](https://threejs.org/docs/pages/AnimationClip.html): reusable collections of animation tracks.
- [Three.js KeyframeTrack](https://threejs.org/docs/pages/KeyframeTrack.html): timed animated property values.
- Local completed asset pipeline: `docs/watch/IMPLEMENTATION_SUMMARY.md`.
