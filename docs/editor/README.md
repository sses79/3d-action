# Animation Studio · first milestone

> Historical plan or milestone report. Some features described as future work are now implemented. See [Current state](../CURRENT_STATE.md) for the current codebase.

Documentation location: `docs/editor/README.md`. Commands run from the repository root; original component-relative code and asset paths below refer to `editor/`.

## Burst Attack update

Jump remains available with its original seven phases. Burst Attack adds Ready, Coil, Launch, Rise, Hang, Hammer, Impact, Follow, Settle, Recover, and Guard. Select it in the action menu. Each action retains its own edited data and comparison reference when switching; Save project now exports the action library as well as the active pair. Legacy single-Jump projects still load.

Burst Attack uses authored arm-direction and torso offsets over the existing skeletal clips, with extension/compression at launch and impact. It is an original prototype inspired by the supplied phase captions, not the reference character's original animation. Smear ribbons, ground cracks, and pose-control UI are not yet implemented. Its impact ring/debris preview is rebuilt from absolute time, so scrubbing or replaying does not accumulate spawned objects.

The graph selector offers root height or measured pose speed. Pose speed is RMS displacement per second across head, hands, feet, pelvis, and upper spine, sampled at 60 Hz in normalized runtime meters. Global root translation is excluded; skeletal deformation and squash/stretch are included. The current/reference curves use the same scale, displayed above the graph. This is our defined diagnostic, not a confirmed reproduction of the reference video's unknown calculation.

Capture current copies the full active Action data into that action's reference: phase timings, source-clip segments, pose/stretch controls, and root trajectory parameters. It does not capture a screenshot, export the GLB, or save to disk by itself. Save project persists the action/reference library to localStorage and JSON. Actions depend on the included GLB and shared evaluator; the JSON is not a standalone animation asset.

Movement currently means authored vertical root motion, plus local skeletal motion. Joystick-controlled horizontal movement, collision, knockback, and world interaction remain game-controller responsibilities. Prompt-to-action generation is not connected yet; the present presets are authored and retimed by the user.

Eight editor tests now also cover Burst Attack validation, non-accumulating pose overrides, and measured pose curves. Browser checks verified the Burst action, impact preview, action-switch preservation, and timing edits. The implementation details below describe the original milestone where noted.

Open http://127.0.0.1:5173/editor/ on this Mac. Secure LAN preview: https://192.168.1.38:8443/editor/ with the previously trusted local certificate.

## Implemented

- Dark editor workspace with a real skinned humanoid GLB in the center.
- Jump and idle/guard playback; replay, pause, loop, slow motion, exact-time scrub, and 60 fps frame stepping.
- Orbit, front, side, and top cameras, plus a floor-grid toggle.
- Seven named jump phases and editable durations. Selecting a phase seeks to its midpoint.
- Independent current/reference skeletons and synchronized comparison. Capture current replaces the baseline explicitly.
- Undo for timing changes, reset, JSON export/import, and explicit local save/load.
- Root-height graph. This is not a pose-speed diagnostic.
- Shared action schema and absolute-time player in `../runtime/`, ready to be used by a later game client.

The initial jump combines segments from Quaternius Jump_Start, Jump_Loop, Jump_Land, and Idle_Loop clips. A separate authored height curve moves the preview upward and downward; it is not a physical jump simulation. The source motion and transition segments are a baseline for future refinement.

React and TypeScript implement the UI; Three.js WebGPURenderer renders the scene with WebGL2 fallback. This milestone reuses esbuild and the existing Python demo server, rather than adding a second Vite server. No Blender conversion was necessary because the free archive supplied GLB directly. A prepared editable Blender source is a later asset milestone.

## Controls

Space toggles play/pause. R replays from the beginning. Left/right arrows step one frame when focus is outside an input. Drag the preview to orbit; scroll to zoom. To compare a timing change, select Hang, change its duration, select Compare, and Replay. Comparison uses absolute seconds, and the shorter action holds its end pose.

Save project writes a localStorage snapshot and downloads a JSON file. Load saved reads that snapshot. Import opens a JSON project from disk; it does not import arbitrary models. Actions are validated against the supported rig and seven-phase contract before replacing state.

## Asset

The included GLB is the non-root-motion **Universal Animation Library Standard** mannequin by Quaternius. Downloaded from https://quaternius.itch.io/universal-animation-library using its free Standard tier on 3 October 2026. The archive's included CC0 license is preserved in `source/ASSET_LICENSE.txt`; its README is also preserved. Asset: 13,744 triangles, 65 joints, 43 embedded clips, no textures, 7,618,436 bytes. The runtime applies gold/blue materials for comparison.

The mannequin is the first testing character, not a recreation of Kesar. No paid Source tier was downloaded. The earlier `jump/` files remain an unused preliminary draft; `/editor/` is the implemented project.

## Build and verification

```sh
npm run build:editor
npx tsc -p editor/tsconfig.json
npm run test:editor
python3 tests/server.py
```

The editor's bundle is `app.js`; edit `main.tsx` and rebuild. The existing `npm run build` remains the watch build. For a fresh local demo-only server, run `python3 serve_demo.py --host 127.0.0.1 --port 5173` after stopping any server already using that address.

Five editor checks cover timing boundaries, root continuity, action validation, real-rig deterministic seeking, and skeleton independence. Browser checks covered WebGPU and forced WebGL2 rendering, timing edits/reference preservation, undo, replay, JSON export/local loading, and a phone-sized layout without horizontal overflow. Existing seven watch tests and public-route/source-isolation checks pass. A physical phone run of this editor has not been verified.

## Next milestones

Pose/control editing, validated LLM proposals, pose-speed diagnostics, held-action state machines, and the character input test area are not implemented yet. There is no LLM endpoint or API key in this build. The shared player currently supports the selected Quaternius rig and clip set; arbitrary-rig retargeting is not implemented.

## LLM authoring update

The page now connects to a local MCP authoring service. Custom version-2 actions support all rig-joint rotation/position/scale tracks, root movement, arbitrary supported phases and impact cues. Tool edits persist automatically and update the viewer; local/manual playback remains available offline. See `../authoring/README.md` for the tools, installed skill, schema and startup. There is no embedded LLM chat or model-provider endpoint. Nine editor tests and four authoring tests pass.
