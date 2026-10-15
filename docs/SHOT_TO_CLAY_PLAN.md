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
3. **One room**: a floor plan with one place per character. Wide shots with several people (1, 2, 4, 5) set the layout; each close shot gets a camera placed so its visible people land where the picture has them, on the floor, at their height; the shot and its reverse face each other across the same two people. Corrected by hand on the Clay page's floor plan (dragging people and cameras).
4. **Draw**: a new "shots" scene, the people as plain-shape upper bodies on tapered columns, cut by cut from each shot's camera, on the Clay page and in the export (the `seedance` block names each character by colour).
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

