---
name: scene-to-reference
description: Turn a written story scene (characters, a place, timed beats, dialogue) into a clay reference package for a video model - two figures acting the beats in a room of plain objects, cameras with cuts, a depth pass and a meta file for a prompt writer. Use when the user gives a scene text or script and wants blocking, a staged scene, or a reference video without a source video.
---

# Scene text to reference package

Run from the repo root. The Studio service must be running (`npm run start:authoring`, port 5174). Use the `animation-studio` MCP tools, or for calls that take minutes:

```sh
curl -s --max-time 1800 -X POST http://127.0.0.1:5174/api/tool -H 'Content-Type: application/json' -d @request.json
```

Plan, limits and what was measured: `docs/SCENE_TO_REFERENCE_PLAN.md`. Worked example: `authoring/scenes/very-grown-up.json`. For a clip of real people instead of a text, use `video-to-reference`.

You read the scene and write the blocking; the tools do the motion. The result is a stand-in for a video model to follow, not acting: library movements joined by pose blends, no balance, no faces.

## Rules for reading the scene

- **Take from the text**: who is present, ages and heights, who speaks when, the timed beats, the actions it names, what the place must allow.
- **Decide yourself, and say so**: where each stands, the room's objects and sizes, which library movement stands in for each beat, where the head points, the cameras if no shot plan is given.
- **Do not add** actions, props or characters the text does not have. If the text says a character stays in place, they stay.
- **Name what is missing.** If a beat needs a movement the library does not have, use the nearest one, put the gap in that part's `name`, and report it. Do not hide it.
- If a shot plan exists (for example from `director-advisor`), use its shots. If not, make your own and say they are yours.

## 1. Find the movements

`list_movements` (or `inspect_movement_library`). Useful for scenes: `move-idle`, `move-idle-talking`, `move-ual2-idle-foldarms-loop`, `move-ual2-idle-no-loop` (a "no"), `move-ual2-yes`, `move-walk`, `move-walk-formal`, `move-ual1-sitting-enter` / `-sitting-idle-loop` / `-sitting-talking-loop` / `-sitting-exit`, `move-ual1-interact`, `move-ual1-pickup-table`, `move-ual1-push-loop`, `move-ual1-jog-fwd-loop`, `move-foot-stamp` and `move-feet-together` (made by rule; register them from `authoring/source/foot-stamp.json` and `feet-together.json` with `register_movement` if this machine does not have them).

Most are unreviewed source clips. `stage_scene` returns `movementsNotReviewed`; pass that on.

## 2. Write the blocking spec

One JSON for `stage_scene`:

- **`objects`**: the room as boxes, cylinders, arches and wedges, each named for what it is. Floor is y=0; x right, z toward the viewer of the plan; metres. Leave the routes the text asks for clear: nothing checks collisions.
- **`marks`**: named floor points `[x, z]`. A mark may not share a name with a performer.
- **`performers`** (exactly two): `id`, `actionId`, `name`, `height`, optional `character`, `start` (a mark), `facing` (a mark or the other performer), `parts`, optional `looks`.
  - **`character`**: leave it out. The mannequin (a neutral jointed figure) is the standard stand-in for every character; the user chose it over the other bodies on 2026-10-11. `superhero-female` and `superhero-male` (unclothed adult base bodies, drawn as clay) exist and work, for use only when the user asks. A body registered on this machine with `register_character` (`list_characters` shows them; such files are local and not in the repo) can be named the same way. Use the adult bodies for adult characters only. A child or teenager stays on the mannequin, scaled by `height`: there is no free body with a child's proportions, and an adult body scaled down is not a stand-in for a child.
  - **`parts`** play one after another: `{movementId, name, duration, speed, walkTo, face}`. The movement loops to fill `duration`. With `walkTo` (a mark) the performer walks there in a straight line; otherwise they stay and may turn to `face` a mark or the other performer. Put the beat's time and line in `name`: it shows on Studio's timeline.
  - **`looks`**: `{start, end, at}` turns the head toward a mark on the floor, the other performer (followed as they move) or a point `[x, y, z]`. Looking straight down at one's own feet reads as a deep bow; aim a metre ahead on the floor instead.
- **`cameras`**: shots `{start, name, position, lookAt, aim, lens35, to}`. A new shot is a cut. `lookAt` is a point, a mark, a performer (`aim` head or body) or `"both"`. `to: {position, lens35}` moves the camera or zooms over the shot. If an action must be seen (a foot stamp), give it a shot that holds the whole body: a close-up on the face cannot show it.
- **`color`** on a performer (`blue`, `orange`, `green`, `pink`, `purple`, `yellow`, `red`, `gray`; blue and orange by default): the flat colour of its clay figure, so the prompt can say "replace the blue model with…". Seedance 2.5's guide maps characters to clay models by colour.
- **`represents`** on a performer (who the figure stands for) and **`notes`** on the scene (staging choices, changes from an earlier revision) go into the meta.
- **`beats`**: `{start, end, text, speaker, line}` copied from the scene. They go into the meta for the prompt writer and do not change the motion.

Make the parts' durations add up to the scene's length for both performers. A walk plays whole cycles, so its real length can differ slightly from the one asked; the reply gives the real times, the cycles and the stride scale. Keep the stride scale between about 0.8 and 1.2 by moving the mark or changing the duration.

## 3. Stage and check

1. `stage_scene` with `expectedRevision` from `list_pairs` (0 for a new scene). Read `blocking` in the reply.
2. `render_pair_video` with `camera: "source"` plays the shots; `camera: "fixed", feet: true` gives a still wide view and a foot file for `authoring/render/foot-slide.py`.
3. Look at stills at each beat and each cut. Check: do they face and look where the text says, is each named action in frame in its shot, does anyone pass through an object or the other performer, does the walk end where it should.
4. In Studio, select either action with **Pair** and **Scene** on.

Change the spec and stage again; each call raises the revision.

Framing is checked from the posed figure, not guessed: after staging, the export's meta gives each performer per shot and per second a `projectedBox` (may run past the frame), `croppedBy` (frame edges that cut it), separate `head` and `feet` bounds, and `visibleFraction` (measured from pixels: how much of the in-frame silhouette is not hidden). A head counts as in frame only when no edge cuts it. Aim for about 5% of the picture's height free above the tallest head and below the lowest foot, through the whole shot, and re-aim the camera until the meta says so.

A join blends for 0.3 s, which swallows the start of a quick action: start a stamp or a step about 0.3 s before it must be seen. A look that should hold to the end of the scene needs an `end` past the scene's length, or the head eases back up in the last frames.

## 4. Export

A staged scene exports exactly duration x 30 frames (frame n at n/30 s, none at the end time). `export_pair_reference {pairId}` (the scene's ID) writes `.authoring/renders/<scene>-r<rev>-reference/`: `clay.mp4`, the first frame of every shot, and `reference.json` (`depth: true` adds `depth.mp4` and depth stills; off by default, since it doubles the time and Seedance 2.5 has no depth input). `reference.json` comes with the room's objects, the staging (marks, each performer's parts and looks, the beats and lines), the shot list (lens, framing, who is where in the first frame of each shot) and a per-second timeline. `figure: "primitives"` draws the performers as plain capsules and spheres instead of the mannequin (the guide prefers "simple geometric primitives"; which works better is not tested) and writes to a folder ending `-primitives`. Its `seedance` block follows Seedance 2.5's prompt guide for a 3D clay-model reference: which coloured model stands for whom, the sentence saying what to take from the clay video (camera, cuts, positions, motion; not its look or lighting), the mapping sentences, a timeline in whole seconds (the model only responds to integer-second timestamps; each beat's exact time is kept beside it), a composition still per shot for making styled keyframes, and the output length and aspect ratio. Hand `reference.json` to the prompt writer.

## Report

Say what came from the text, what you chose, which beats have only a stand-in movement, which movements are unreviewed, and what you checked by eye. Limits to state: two performers only; straight-line walks; turning on the spot swivels the feet; a child is the adult figure scaled; no faces or hands in detail; nothing avoids obstacles.
