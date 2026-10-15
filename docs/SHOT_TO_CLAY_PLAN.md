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
2. **People per shot**: detect and follow each visible person through the shot (`sam3-track.py` from a point, or the detector where it holds); name them on a sheet; build upper bodies with `reconstruct_motion boxes` (waist-up builds were tested on 2026-10-12: trunk, head and arms near the full-view build, legs invented). A head-only person gets a place and a head turn, no build.
3. **One room**: a floor plan with one place per character. Wide shots with several people (1, 2, 4, 5) set the layout; each close shot gets a camera placed so its visible people land where the picture has them, on the floor, at their height; the shot and its reverse face each other across the same two people. Corrected by hand on the Clay page's floor plan (dragging people and cameras).
4. **Draw**: a new "shots" scene, the people as plain-shape upper bodies on tapered columns, cut by cut from each shot's camera, on the Clay page and in the export (the `seedance` block names each character by colour).
5. **More of the clip**: the fight (77–92 s), the walk away.

## Risks

- Dark footage and black robes: the detector and tracker lose people; expect hand fixes of who is who.
- The Mountain's armour and helmet: the body model is weakest on hidden body shape.
- Joining shots is the new and uncertain part; with no shared floor in the close shots, places come from layout guesses checked against the wide shots.
- A person who walks in a close shot only slides (no steps).
