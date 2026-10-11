---
name: video-to-reference
description: Turn a video window with two performers into a clay reference package for a video model - two 3D figures, a simple stage of plain objects, the source camera with its zoom, a depth pass and a meta file for a prompt writer. Use when the user wants a reference video, a stage or scene for a pair, a depth pass, or reference meta from a clip of two people.
---

# Video to reference package

Run everything from the repo root. The Studio service must be running (`npm run start:authoring`, port 5174). Call operations through the `animation-studio` MCP tools, or post to the service for anything that takes minutes:

```sh
curl -s --max-time 1800 -X POST http://127.0.0.1:5174/api/tool -H 'Content-Type: application/json' -d '{"name":"TOOL","arguments":{...}}'
```

Background and every measured result: `docs/TWO_PERSON_PLAN.md`. Single-performer rules: the `video-to-action` skill.

What you get is a reference, not a measurement: motion from one camera, a hand-made stage, an assumed camera. Say so when you report.

## What this machine needs

Git carries the code only. These are not in the repo and must exist locally:

- `.authoring/vision-venv` (Python with OpenCV, ultralytics) and `.authoring/comfyui` with its own venv and the SAM 3D Body weights (see `docs/SAM3D_PLAN.md`).
- `depth_anything_3_base.safetensors` (541.5 MB, Apache 2.0) in `.authoring/comfyui/models/geometry_estimation`. Ask before downloading.
- Node 26, ffmpeg, Google Chrome, and Playwright (`PLAYWRIGHT_PACKAGE_JSON` and `CHROME_PATH` override the defaults in `authoring/render/pair-video.mjs`).
- The source video file. Live state (`.authoring/project.json`, pairs, scenes, renders) is per machine: a pair built on one computer is not on another unless `.authoring/` is copied across (index, blobs folder and sidecars together). Otherwise rebuild from the video with the steps below.

Never put video frames, renders or `.authoring/` into git.

## 1. Choose the window

One continuous shot, up to 15 s, both performers large enough to read (not a far shot), no cut inside it. Look before building:

```sh
.authoring/vision-venv/bin/python authoring/render/stage-candidates.py VIDEO .authoring/renders/stage-candidates
```

Read the contact sheets. Note the wide, clear views of the set anywhere in the video; you need them in step 4.

## 2. Build the two performers and pair them

1. `reconstruct_motion` twice on the same window, `subject: "left"` and `subject: "right"` (about a minute per second of video each; one build at a time).
2. `set_pair` with both actions.
3. `resolve_pair_contact` with `apply: true`. `spacing` 0.20 m suits dancing and clinches, 0.10 m a kick that must land; hand holds are found from the wrists. Check the report's `after.framesInside`.
4. Look at it in Studio (select either action, **Pair** on) before going on.

## 3. Track the camera

Pick 8 times spread over the window, the first at the window's start, and run:

```sh
.authoring/comfyui/.venv/bin/python authoring/render/stage-depth.py .authoring/comfyui VIDEO KEY.npz t0,t1,...,t7 392
.authoring/vision-venv/bin/python authoring/render/stage-track.py KEY.npz VIDEO WINDOW_START TRACK.json --nodal --overlay=x0,y0,x1,y1
```

- Give one `--overlay` per channel logo or caption (pixel box). Unmasked, they win as "a camera that never moves".
- `--nodal` assumes the camera stays in one place and only turns and zooms. That is right for most broadcast shots. If the camera clearly travels (parallax between near and far things), say this method does not cover it.
- Read the summary: `framesNotSolved` should be 0, `minInliers` 40 or more; `lensPx` should follow the zoom you see; `cameraPitchDown` and `cameraHeight` should be believable for the shot.
- Keep the scratch files outside git (`.authoring/renders/` or a temp folder).

## 4. Make the stage objects

The depth model flattens a set into a floor and one back surface, so objects are written by hand: named boxes, cylinders, arches and wedges (ramps, sloped walls), no detail. Worked examples: `authoring/render/scene-samba.py` (a dance set, 27 objects) and `authoring/render/scene-pit.py` (a square pit with sloped walls, 10 objects, measured by casting picture points onto the floor through the tracked camera).

1. Pull the best wide views: `stage-candidates.py VIDEO DIR 3.0,28.5,69.0`. Show the user the sheet and let them choose.
2. Read the shapes from those views (what is open, what is solid, what stands behind what).
3. Size and place from the window's first frame, with the dancers as the ruler: a floor point at picture row `r` is at distance `cameraHeight * lensPx / (r - horizonRow)`, and `horizonRow = height/2 - lensPx * tan(pitchDown)`. The first camera stands at x=0, z=0; the room has x right, y up, z toward that camera, floor at y=0.
4. Name objects for what they are (`bandstand roof`, `left stairs 2`): the names go into the meta a prompt writer reads.
5. `set_pair_scene` with `scene: {objects, camera: {quats, positions, focal}}` (the three arrays from `TRACK.json`'s `track`). Feet are locked by default; read `footLock` in the reply.

## 5. Check

1. **Against the video**: `render_pair_video` (`camera: "source"`), then put stills beside the video frames at four or five times with `authoring/render/compare-stills.py RENDER.mp4 VIDEO WINDOW_START OUT.jpg 0,1,2,3`. The stage must sit where the set sits and grow and shrink with the zoom. If it sits too high or low everywhere, the camera tilt or an object height is wrong; fix the cause, not each object.
2. **Fixed camera**: `render_pair_video` with `camera: "fixed", feet: true`, then `authoring/render/foot-slide.py FILE.feet.json`. Watch the video for drifting and compare slide figures between versions; the figure counts swivels and brushes too, so it is not an absolute error.
3. **Studio**: select either action; **Pair** and **Scene** on.

Each `set_pair_scene` raises the pair's revision; fetch it with `list_pairs` first.

## 6. Export

`export_pair_reference {pairId}` writes `.authoring/renders/<pair>-r<rev>-reference/`: `clay.mp4`, `depth.mp4`, `first-frame-clay.png`, `first-frame-depth.png` and `reference.json`. Hand `reference.json` to the prompt writer in place of written prompt text: it holds the files, the depth encoding, the named objects, the camera per second in 35 mm-equivalent terms, the first frame described on its own, a per-second timeline, and the limits.

To swap the set for another design, keep the camera and performers and call `set_pair_scene` again with different objects.

## Report

State plainly: which frames were solved, the slide before and after locking, what was checked by eye and what was not, and the limits (one camera, hand-made stage, camera assumed in one place, sliding that remains where performers hold on to each other).
