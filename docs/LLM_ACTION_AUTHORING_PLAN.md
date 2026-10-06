# LLM action authoring with a browser preview

> Historical plan or milestone report. Some features described as future work are now implemented. See [Current state](CURRENT_STATE.md) for the current codebase.

## Direction agreed on 3 October 2026

Describe an action to an LLM and iterate through prompts. The existing editor page is primarily a viewer: play, replay, scrub, compare, inspect phases and diagnostics, and save revisions. Manual pose sliders are not a prerequisite. Timing remains editable action data even if the page does not expose a duration control.

The supplied reference screenshots establish playback controls, phase captions, comparison and diagnostic overlays. They do not establish manual duration editing or reveal the reference's authoring backend. This plan describes our implementation, not that backend.

## Current limits

`runtime/action.ts` validates only the fixed Jump and Burst Attack phase sequences. Clip names and source ranges are fixed. Burst has a scalar arm-swing overlay with coupled torso lean, stretch endpoints, and a preset height profile. These controls cannot express an arbitrary new action or independent limb poses. There is no MCP authoring server or prompt endpoint yet.

## Next milestone

Build a general action-data contract and a local authoring bridge before manual pose UI. Preserve existing projects through migration and keep the known rig as the first target.

1. Expose the rig manifest: joints, semantic controls, coordinate conventions, units, source clips and permitted values.
2. Support new actions and phase sequences, keyframed local joint rotations, independent pose controls, interpolation, root trajectory tracks and effect cues. Full authoring control means control over the implemented schema; unsupported operations remain explicit.
3. Evaluate data deterministically in the shared runtime. Keep authored displacement separate from game-controller movement so a later game does not apply both.
4. Add a local service that validates and stores revisions. The viewer loads updates and retains the prior reference. Revisions appear without manual file import or rebuilding the bundle.
5. Expose the service through MCP tools. Add a skill explaining the workflow, animation principles and rig conventions once the tools exist. The skill provides guidance; MCP provides callable operations.

## Proposed tools

These names are design proposals, not implemented tools.

| Tool | Purpose |
| --- | --- |
| `get_rig_manifest` | Discover rig controls, clips, units and limits |
| `get_action` | Read action data and revision ID |
| `create_action` | Submit a complete action with phases and pose tracks |
| `revise_action` | Apply changes against an expected revision ID |
| `set_preview` | Select action, camera, playhead and playback mode |
| `get_diagnostics` | Return sampled pose speed, root trajectory and validation findings |
| `save_revision` | Persist a requested checkpoint |

Invalid input or stale revisions leave the project unchanged. Successful edits record revisions and preserve undo history. Keep the service local and outside public LAN demo routes. Accept action data, not executable code.

## Prompt-to-preview loop

User: “Create a heavy forward hammer strike. Hold the crouch, launch quickly, pause at the apex, then slam down and recover slowly.”

The LLM discovers the rig, authors the action, submits it, and selects it in the viewer. The user watches and requests “Raise the left arm higher and shorten the descent.” The LLM reads the current revision and updates tracks and timings. Routine edits can appear directly without an approval dialog; comparison, undo and saved checkpoints remain available.

The LLM can initially run in this Codex conversation through the authoring bridge. An embedded chat panel and separate model-provider endpoint are optional later features.

## Acceptance

- A new action with a different phase sequence can be authored through tools and appears in the existing page.
- Independent arm, torso and leg edits visibly change playback beyond retiming existing clips.
- Timing and pose edits preserve deterministic scrubbing and reference comparison.
- Reload restores saved revisions; invalid and stale updates do not alter state.
- Existing Jump and Burst projects retain data and behavior after migration.
- Unsupported controls are reported honestly; the present two presets are not unrestricted motion generation.

## Implemented milestone

The local authoring bridge, general version-2 tracks, twelve MCP tools and supporting skill are implemented. Read `docs/authoring/README.md` for the actual tool names, startup, persistence and limits. `get_capabilities` combines rig discovery and action-schema discovery. The LLM runs in the calling conversation and the existing page receives revisions live. New engine/asset capabilities and animation-quality refinements remain future work.
