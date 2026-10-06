# `reconstruct_motion`: video window to draft action

Status: 6 October 2026. Phase 4 of [NEW_PLAN.md](NEW_PLAN.md). One service operation, available through MCP and the CLI, turns a window of a local video into an estimated Action v2 draft on the current rig. It replaces the clip-specific pilot scripts for new work; the pilot evidence under `authoring/reviews/video/kick-reference/` is unchanged.

The output is always `estimated-draft-unreviewed`. It is never an approved movement, and nothing here confirms contact, balance or naturalness.

## Request

```sh
npm run start:authoring
node authoring/cli.mjs call reconstruct_motion --args authoring/examples/reconstruct-motion.json
```

| Field | Default | Meaning |
| --- | --- | --- |
| `video` | required | Local file path, absolute or relative to the repository root |
| `start`, `end` | required | Window in source seconds, 0.5–8 s long |
| `detector` | `yolo26s` | `yolo26s` or `yolo26n` 2D pose model |
| `fit` | `stable` | `stable`, `fitted` or `none` (lift only) |
| `straightKneePrior` | `false` | Side-view assumption: a confidently straight 2D knee is treated as straight in 3D. Leave off for other camera angles |
| `phases` | one phase | `[{name, end, kind?}]`, ends in clip seconds; the last must equal the window length |
| `actionId`, `name` | `video-reconstruction-draft` | Identity of the baked draft |
| `commit`, `expectedRevision` | `false` | Save the draft in Studio (revision 0 for a new action) and add a motion-quality check |
| `force` | `false` | Ignore cached stages |

## Stages and cache

| Stage | Implementation | Rerun when these change |
| --- | --- | --- |
| observe | `authoring/reconstruction/observe.py` | video content, window, detector model, script, Python lock file |
| lift | `lift.py` (MotionBERT Lite) | observe result, checkpoint, vendored source commit, script |
| fit | `fit.py` | lift result, `fit`, `straightKneePrior`, script |
| retarget | `retarget.ts`, in the service | motion result, character asset, `actionId`, `name`, `phases`, script |

Each stage writes to `.authoring/reconstruction-cache/<stage>-<key>/` with a `stage.json` recording its inputs and duration. A stage is published by renaming a temporary folder, so a failed stage leaves no entry. `authoring/reconstruction/pipeline.mjs` holds the orchestration; nothing evicts old cache entries yet.

## Measured on the side-kick fixture

Original recording, 11.45–13.75 s, `stable` fit with the straight-knee prior, one run on this machine (CPU, two Torch threads):

| | Seconds |
| --- | ---: |
| observe (67 frames, includes Python imports and model load) | 12.2 |
| lift | 2.0 |
| fit | 2.7 |
| retarget | 0.03 |
| Total, nothing cached | 17.1 |
| Identical repeat | 0.02 |
| Change fit mode or prior | fit and retarget only |
| Change phases, id or name | retarget only |

The result is bit-identical to the pilot: the 67 observed keypoint sets, the lifted and stabilized 3D positions and all 66 baked tracks have a maximum difference of 0 against `pose-small/`, `reconstruction-stable/motion-ir.json` and `reconstruction-stable/action.json`.

A second window of the same recording (16.5–21.5 s, 151 samples, no prior) completed in 23 s and produced a rough draft. It was not reviewed against the video in detail, so it shows the operation is no longer tied to the fixture, not that the result is good.

## Summary returned

About 3 KB: stage keys, cached flags and timings; observation counts with clip times where the subject was not selected, where body landmarks fell below 0.5 confidence, and where the subject's box touches the frame edge; sample count and bridged frames; fit residuals; the action's phases and track count; paths to the pose report, motion estimate and action; and the standing limits. With `commit:true` it adds the saved revision and the motion-quality status and inspection windows.

## Limits

- Each uncached run starts new Python processes, so imports and model load are paid every time; there is no resident model.
- Subject selection is tallest-first then box overlap. It is not identity tracking and there is no way to pick another person yet.
- Root travel is approximate image-X only. Depth, twist, foot orientation, mirroring and world scale remain estimates.
- Windows are capped at 8 s (MotionBERT accepts 243 frames; baked tracks allow 256 keys).
- The stage scripts changed, so the pilot bundle's stage fingerprints were regenerated; its data files are unchanged.
