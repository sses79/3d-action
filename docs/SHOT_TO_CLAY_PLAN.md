# Shots to clay video: a scene told in cuts (plan, 2026-10-15)

## Goal

Turn a scene cut from many shots, mostly waist-up and closer (a dialogue or a standoff), into a clay reference video for a video model: each shot drawn from its own source camera, the people keeping one place in one room across every cut. Upper bodies come from the video; below the waist each person is a tapered column on the floor, so no leg motion is invented. Test clip: a standoff between six named characters (a Game of Thrones scene, 0–28 s of a 119 s clip kept outside the repo).

## Decisions (user, 2026-10-15)

1. First target: the standoff, 0–28 s (eight shots, before the fight).
2. Lower body: a plain tapered column.
3. Characters are named: Cersei, the Mountain (in full armour), Qyburn, Lancel (carved forehead), a militant with a chain and flail (shot 3), and the other militants as extras.

## What the video gives

| Shot | Time (s) | Setup | Camera | Who | Framing |
|---|---|---|---|---|---|
| 1 | 0.00–2.84 | 1 | moves with Cersei walking out | Cersei from behind; militants and Lancel ahead | head, then full |
| 2 | 2.84–6.77 | 2 | over a militant's shoulder | Cersei walks in; the Mountain, then Qyburn, behind | knees up |
| 3 | 6.77–8.91 | 3 | close | the militant with the flail | chest up |
| 4 | 8.91–12.91 | 4 | over Cersei's shoulder | Lancel and the militants in a line | full, far |
| 5 | 12.91–17.62 | 2 | as shot 2 | Qyburn, the Mountain, Cersei | knees up |
| 6 | 17.62–20.15 | 5 | over Cersei's shoulder, closer | Lancel with militants either side | waist up |
| 7 | 20.15–25.03 | 6 | over a militant's shoulder, close | the Mountain and Cersei | waist up |
| 8 | 25.03–28.13 | 5 | as shot 6, close | Lancel | chest up |

Two sides of one axis: setups 2 and 6 look from the militants at Cersei's group; setups 1, 4 and 5 look from Cersei's side at the militants (3 too).

## Steps

1. **Shots and setups** (built: `authoring/render/shots.py VIDEO START END OUT.json`). Cuts by colour and brightness change against the change around it (a fixed threshold missed cuts in this dark footage); setups by matching the set behind the people (ORB, homography, 40 or more inliers). On the standoff it finds eight shots and joins 2 with 5 (247 inliers) and 6 with 8 (70); by eye 7 is the same side as 2 and 5 but much closer, kept apart. Result in `.authoring/shots/got-standoff-shots.json`.
2. **People per shot** (done 2026-10-15, results below): detect and follow each visible person through the shot (`sam3-track.py` from a point, or the detector where it holds); name them on a sheet; build upper bodies with `reconstruct_motion boxes` (waist-up builds were tested on 2026-10-12: trunk, head and arms near the full-view build, legs invented). A head-only person gets a place and a head turn, no build.
3. **One room** (first version done 2026-10-15, results below): a floor plan with one place per character. Wide shots with several people (1, 2, 4, 5) set the layout; each close shot gets a camera placed so its visible people land where the picture has them, on the floor, at their height; the shot and its reverse face each other across the same two people. Corrected by hand on the Clay page's floor plan (dragging people and cameras).
4. **Draw** (first version done 2026-10-15, results below): a new "shots" scene, the people as plain-shape upper bodies on tapered columns, cut by cut from each shot's camera, on the Clay page and in the export (the `seedance` block names each character by colour).
5. **More of the clip**: the fight (77–92 s), the walk away.

## Risks

- Dark footage and black robes: the detector and tracker lose people; expect hand fixes of who is who.
- The Mountain's armour and helmet: the body model is weakest on hidden body shape.
- Joining shots is the new and uncertain part; with no shared floor in the close shots, places come from layout guesses checked against the wide shots.
- A person who walks in a close shot only slides (no steps).

## Step 2 result, 2026-10-15

- **Following people.** SAM 3 from a point found nothing on dark robes (0 pixels for Qyburn, Cersei, Lancel's back), and from a box still nothing for Qyburn and Lancel; on the flail militant's close-up a point caught his chain. The pose detector's boxes, joined frame to frame by overlap from a named box at the shot's middle (`.authoring/shots/got/follow.py`, scratch), held every person in shots 2–8: people barely move in a standoff. The detector misses the Mountain's armour in shots 5 and 7 and half of shot 2; SAM 3 from a box follows him cleanly there (`sam3-track.py` now takes box seeds, name:time:x0:y0:x1:y1). All tracks checked on a sheet of five frames per shot.
- **Builds.** 15 upper bodies (`got-s<shot>-<name>`): Cersei (shots 2, 4, 5, 7), the Mountain (2, 5, 7), Qyburn (2, 5), Lancel (4, 6, 8), the flail militant (3, 4, 6). About 2 minutes each when run alone. On the middle frame of each, the skeleton sits on the right person. In close shots (3, 7, 8) only the shoulders and head are in the picture; the arms are the body model's guess.
- **Not built.** The four background militants in shot 4 and the two beside Lancel in shots 6 and 8 (they stand still, far or at the edge: a column with a still upper body will do); the people seen from behind over a shoulder (Lancel in 2, 5, 7; Cersei in 6, 8): they are placed, not posed; shot 1 (a moving camera following Cersei out).
- **Time.** About 70 minutes of machine time, half of it lost: two tracking runs that failed (a shell quirk passed all the seed points as one; a bug in the new box seeds), and SAM 3 and the body model run side by side on the one Mac GPU, each at half speed. Done cleanly, one after another: tracking the Mountain about 10 minutes a shot, the 15 builds about 30 minutes.

## Step 3 result, 2026-10-15

- **What each shot says.** For each named person, the pose detector's joints (nose, shoulders, hips, ankles) over the settled last 40% of the shot, or the box for someone seen from behind over a shoulder (`.authoring/shots/got/observations.json`).
- **A solve of everything at once failed.** Places of all characters and all seven cameras (place, height, turn, tilt, lens) fitted to the joints together put the militants on Cersei's side and turned cameras sideways, 50–170 px off. Each shot shows one to four people, too few to fix its camera alone; and size in the picture gives distance divided by the lens, which differs a lot between a wide shot and a close-up.
- **What worked: join the shots' own layouts.** Each shot alone gives its people's places in its camera's frame (sideways from the picture, distance from the nose-to-hip size at known heights) up to its lens. Each layout is fitted onto one shared floor plan by a turn, a shift and a scale (the lens), together, with what is known of how such a scene is shot: the cameras roughly along the line between the two groups (within about 30°), normal dialogue lenses, the militants in front of Cersei's group a few metres off, people in a line about a metre apart. Then each camera's height, tilt and lens are fitted to its picture with the places fixed. Scratch scripts in `.authoring/shots/got/` (`obs.py`, `join.py`, `cams.py`, `overlay.py`); plan in `.authoring/shots/got/plan.json`.
- **Result.** Cersei at the centre, the Mountain 1.4 m behind her and Qyburn beside her; Lancel 2.4 m in front of her, the flail militant at his side, the other militants in rows behind. The cameras of shots 2, 5 and 7 stand behind Lancel facing Cersei's group; 6 and 8 near Cersei facing the militants; shot 4 is a long lens from far behind Cersei's group. One background militant in shot 4 fitted nowhere and was dropped.
- **Checked** by drawing each person's place back onto each shot as a column: in shots 2, 4, 5, 6 and 7 every column stands on its person; in shot 8 (Lancel's close-up) the column is a face-width off; the shot-4 militants are off by a little. The places are a believable reading, not a measurement: the distance between the two groups in particular comes from the assumptions as much as from the pictures. Step 4 needs the Clay page's floor plan to move people and cameras by hand.

## Step 4 result, 2026-10-15

- **`set_shots_scene`** (service): a scene told in cuts. `figures` (the first two are the pair): name, colour, height, place [x, z], and `segments` [{from, to, actionId, revision}], each a build of that character in one shot. `cameras`: one per shot {start, position, yaw, pitch up, focal}, cut at each start. Stored as a pair record with `shots: true`; the cameras are also written as a per-frame camera track (held between cuts) so the Clay view's source camera plays them unchanged. `render_pair_video` draws such a scene with plain shapes.
- **Clay view**: each figure plays its build for the shot on screen and holds the nearest build's pose between its shots, turned and placed as in that build's shot (its root pinned to its place, so nobody drifts); scaled to its height; below the hips a tapered column on the floor and the leg shapes hidden. Characters with no build (three militants) stand in the flail militant's first pose.
- **The standoff** (`shots-got-standoff`, shots 2–8, 25.3 s; shot 1, the camera following Cersei out, left out): eight figures, Cersei pink, Lancel blue, the Mountain orange, Qyburn purple, the flail militant green, three militants grey. Scene made by `.authoring/shots/got/scene.py` from the plan, the shot list and the builds.
- **Cameras refitted**: a camera over someone's shoulder now stands about a metre behind that person (it had drifted 2 m back and let others into the picture), and Cersei's shoulder at the left edge of shot 6 is an observation. A sign error in the cameras' tilt (they looked down at legs) was fixed.
- **Checked** on a frame of each shot beside the video, and on the Clay page in a headless browser: shots 4, 6 and 7 frame the same people in the same places as the video; shots 2 and 5 have the right three (Qyburn, the Mountain, Cersei, with Lancel's shoulder at the right) but the flail militant's arm comes into the left edge and the camera sits lower than the video's; shot 8 frames Lancel too low; shot 3 shows the flail militant's head from a little behind.
- **Not done**: moving people and cameras by hand on the Clay page's floor plan (the next step, and the way to fix shots 2, 5 and 8); the Clay page's checklist treats the scene as one continuous camera and the export's notes do not yet list the shots; the action workshop does not show shots scenes; shot 1; the scripts in `.authoring/shots/got/` are scratch and specific to this clip.

## Hand editing on the Clay page, 2026-10-15

A shots scene opens on the Clay page with its own edit panel: a floor plan from above with every character (drag to move, to 5 cm) and every shot's camera (drag to move; drag the square at the end of its sight line to turn it; its field of view drawn from its lens; a camera more than 3 m beyond the people is drawn dashed at the plan's edge), and a table per shot (turn, height, tilt up, lens in 35 mm terms). The shot on screen is highlighted in both; clicking a row goes to its shot; the label on the picture names the shot and lens. Apply saves a new revision through `set_shots_scene`, which keeps each camera's `name` (the video's shot numbers). Turning or moving a camera turns the people it filmed with it, so their poses keep facing it; moving a character moves them in every shot.
- Checked in a headless browser: the panel opens, the table edits and a dragged character are saved by Apply as a new revision, and the picture follows.
- First corrections made with it (`shots-got-standoff` r6): the cameras of shots 2 and 5 raised to eye height (1.6 m) and levelled, shot 8 levelled. On a frame of each shot beside the video every shot now shows its people in the video's order and places; shot 3 still sees the flail militant's head from a little behind, and figures are fuller-bodied than the actors (plain shapes at the mannequin's build).
- A debug hook `shotFigures(time)` on the page gives each figure's hips and extent in the room.
- Not yet: changing a shot's start, adding or removing a shot or a character on the page; a live picture while dragging (it updates on Apply).

