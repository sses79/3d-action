# Team sport clips: several players, a ball, a known court

Written 2026-10-13 with the user. Status: step 1 done on one wide shot (scratch scripts, not yet in `authoring/`); step 2 under way. Everything measured here is from one video (an NBA "top 10 plays" compilation, 131.8 s, 1080p, 30 fps; third-party footage, kept out of the repo).

## Goal

From a broadcast clip of a basketball play, a clay reference package like the ones for dance pairs: the key players as plain figures, the ball, a plain court, and the broadcast camera.

## What the video is

Ten plays. Each is a 2-second title card, one wide shot from the high sideline camera (3–6 s, panning and zooming from one place; players 20–30% of the frame's height, about 220–320 px; 11–28 people found per frame with referees, benches and crowd), then one to three replays (1.5–4.4 s, low or overhead cameras, players 50–90% of the frame's height and often cut by it, probably slowed down).

## Decisions (user, 2026-10-13)

1. **The wide shot is the target.** Replays come later, if at all.
2. **Key players first**: whoever holds the ball or catches it. Not all ten.
3. **The ball is required** from the start.
4. A court-detection model may be downloaded if marking the court by hand is too slow (each download still named and confirmed first).

## What is new against the dance pairs

- More than two people. Tracking, pairs, the renderer, Studio and the meta all assume exactly two performers.
- Team-mates dress alike: the look-based tracking that keeps two dancers apart cannot separate them.
- Players have to be told from referees, benches and crowd: a notion of "on the court".
- A ball followed in the video. Props exist only in staged scenes.
- Replays: another camera and another speed for the same moment.

## What is easier

The court is a known object: fixed size, painted lines, hoops at a known height. The lines in the picture give the camera and every player's place on the floor directly, without the depth model, and the stage is the same plain court for every play.

## Steps

1. **Court and camera for one wide shot.** Mark the court in one frame, solve the camera from it, follow the camera through the shot on the floor's own features, and check by drawing the court's lines back over the frames. Result: a camera track and a standard court as the scene.
2. **Key players.** Choose a player by a point in a frame; follow them through the shot in floor coordinates; build their bodies (coarse); stand them on the court by their feet.
3. **The ball.** Follow it in the picture; place it as a prop: in a hand, on a pass, on a shot (the hoop's height is known).
4. **A group instead of a pair.** N figures in the renderer, the export and the meta, each its own colour; the Seedance block for N.
5. **More plays**, then replays if wanted.

## Risks

- Following one player through a crowd of others in the same kit.
- Seedance's guide says one to five subjects work best.
- The ball is small and fast, and its height above the floor cannot be read from one camera without assumptions.
- Build time grows with the number of players: about 1.5 minutes per player for a 5-second shot (coarse).

## Progress, 2026-10-13 (play 10's wide shot, 3.07–7.6 s, 137 frames)

**Step 1, court and camera: works.**
- A camera is found by laying a model of the court's painted lines (lane, free-throw circle, three-point line, restricted arc) over the dark lines in the frame and searching lens, turn and place for the best overlap. A first guess came from five line crossings marked by hand in one frame and the rim's centre; that guess alone was 20 px off, the fit brings the lines onto the paint. Camera: 37 m from the court's long axis, 0.8 m left of the centre line, 11 m up; lens about 4360 px (86 mm equivalent).
- Check: the rim, which the fit does not use, is drawn on the real rim.
- Through the shot the camera's place is held and only turn and lens are searched, each frame starting from the last: 137 frames in 11.5 s; the overlap cost stays between 1.1 and 1.7 px; the lens runs 4014–4662 px. Looked at in nine frames across the shot.
- Tried first and not enough: the camera from the floor's homography alone. With a long lens one flat floor does not pin the lens down (two estimates 4514 and 3917 px, and a court drawn far off).

**Step 2, key players: partly.**
- Everyone on the floor: the pose detector at full resolution (at 1280 px it misses the ball handler while he is tangled with his defender), each person's feet through the camera onto the floor, kept if on the court: a median of 17 people a frame. Shirt colour read between shoulders and hips separates white, blue and dark (referees) by saturation and brightness.
- Following a chosen player by a point, own follower (boxes in the picture, carried on at their own speed, own kit preferred, no detection given to two players): the defender is followed through nearly the whole shot; the ball handler is lost in his drive at 3.4–4.0 s (motion blur, the shirt reading as dark or white, a jump to a team-mate) and is right from 4.3 s on, the dunk included.
- In the air the feet are not on the floor, so the floor position from the feet is wrong during the jump (the dunker lands 3 m outside the court on the map). To do: carry the floor position through a jump and read the height from the picture.
- SAM 3 (ComfyUI's nodes, weights `sam3.1_multiplex_fp16.safetensors`, 1.75 GB, downloaded 2026-10-13 with the user's agreement): a point picks a person's outline and the video tracker carries it on. On this Mac it takes about 7 s a frame at 1280 px. A fault: started from outlines, it gives good outlines for exactly seven frames and then none, with one object or two, at half or full precision; cause not found. `authoring/render/sam3-track.py` works round it by running hops of six frames, each started from the last outlines.
- **SAM 3 in hops follows both chosen players through the whole shot** (one point each at 4.2 s; 136 frames; 19 minutes): the ball handler from his dribble at 3.07 s through the blurred drive, past his defender, up to the rim and down again, and the defender throughout, in all twelve frames looked at. One outline leaks onto other players for a moment (4.7 s, a box three times too wide); a box far larger than its neighbours in time is now dropped and bridged.
- **Bodies from those boxes.** `reconstruct_motion` takes `boxes: {file, name}` (`observe.py --boxes`): the tracker's box per frame is used as it is, and the detector runs at full size only for the joints. Coarse builds: observe 97 s (full-size detection on every frame), body 103 s each. Actions `nba10-handler` and `nba10-defender`. The body model's joints drawn over eight close-ups sit on both players: the low dribble, the drive, the hang on the rim with both arms up, the landing. Players about 200–250 px tall are enough for it.
- The root of an action may now travel 40 m (was 10): the handler's drive crosses more than 10 m, and the build was refused.
- Kept outside the repo for now: the court-fitting and people scripts (`.authoring/team/scripts/`), the tracker's result and the camera track (`.authoring/team/`). To come into `authoring/` once the remaining pieces of step 2 settle.

**Step 2 finished the same day: the two key players stand on the court** (`pair-nba-play10`, actions `nba10-handler` and `nba10-defender`, built with `boxes` from the SAM 3 result).

- `authoring/render/court-place.py CAMERA.json OUT.json handler=…/body-smoothed.npz defender=…/body-smoothed.npz` gives the camera track and each player's `[x, lift, z]` per frame; `set_pair_scene` takes them as `scene.camera` (with `absolute: true`, the camera's own height) and `place`. With `place` the body model's own distance is not used.
- On the floor: the line of sight through the lower ankle meets the floor, and the hips are where the body model has them from that ankle. The model's body is scaled to the player's size in the picture (1.09 and 1.10 here).
- In the air that reading is wrong: during the dunk the feet-only place was up to 3 m behind the basket. The span in the air is found where the floor reading moves faster than 9 m/s (5.67–7.57 s here: jump, 1.2 s hanging on the rim, drop). Inside it the place runs from take-off to landing through the frames where a wrist is at the rim (11 of 19 predicted frames), where the hips hang from the rim. Result: the ball handler is at the rim, about 1.0–1.4 m up, hand on the rim in the render; the defender stays on the floor (fastest 4.7 m/s, no span).
- I also tried reading height from body size in the picture: its noise is about 0.3 m at 40 m, too coarse for a jump, so it is not used.
- Checked on seven stills against the video, from the source camera and a fixed view: both players are where the video has them, through the drive, the dunk and the landing. Court stand-ins are plain shapes (lane slab, backboard, rim, post, arm, two seat blocks); floor lines cannot be drawn yet.
- Limits: a jump without the rim (a jump shot) only gets the straight run between take-off and landing, and a slow or short jump is not noticed (`--air=NAME:from:to` gives it by hand). Two of the ball handler's predicted poses (6.77 and 6.97 s, hanging on the rim) are wrong in the body model; the place there is carried by neighbours, the pose is not fixed. Foot sliding after locking is 2.1 m for the handler over 14.8 m of travel and 0.8 m for the defender. The court registration scripts that make CAMERA.json are still scratch code (copies in `.authoring/team/scripts/`); they move into `authoring/render/` with step 4.
- A fix on the way: a build with `boxes` was served a cached retarget without its placement; the retarget stage's key now includes whether the build is placed.

**Step 3, the ball, built the same day** (`pair-nba-play10` r3 carries it as a prop).

- Finding it: `authoring/render/sam3-find.py` asks SAM 3's detector for "basketball" in a 420 px crop around the ball handler's box, frame by frame (in the whole 1080p frame the ball is too small for the model). Every second frame, 68 frames, about 7 s each, 8 minutes. It answered in all 68; 35 pass the filter in `court-ball.py` (ball-sized for that distance, round, not white or grey). Without the filter a wristband, a hand and a shoe were taken for the ball, and before 0.9 s the ball is hidden by the body.
- In a hand or loose: `authoring/render/court-ball.py CAMERA.json PLACE.json SIGHTINGS.json OUT.json` (`court-place.py` now also writes hips and wrists in court metres). The ball is in a hand while its sighting is within 1.6 ball widths of that wrist in the picture; over the held sightings the median is 0.81 widths. Result: in the ball handler's right hand from the start to 3.4 s (6.47 s of the video), then loose.
- Loose: a thrown ball's course (gravity, bounce off the floor) from the wrist that let go, fitted to the sightings. After the dunk it leaves at the rim (12.77, 3.12 m up, 0.0 across; the rim is at 12.75, 3.05, 0), drops, bounces and rises: 14 sightings, 18 px mean and 33 px worst from the fitted course (a ball is about 26 px wide). Checked on eight stills against the video.
- Scene: `set_pair_scene` takes `props` for a video pair, with track parts `{holder, hand}`, `{at}` or `{path}`; the Clay view, the editor, the frame notes and the `seedance` block carry them. The editor drew a loose prop in the wrong place for a pair with a far camera; fixed.
- Limits: two dribbles (0.8–1.03 s and 2.07–2.24 s) were not followed by the fit (133 and 73 px off) and are left in the hand, listed as `bouncesLeftInHand`. With one camera a loose ball's distance comes only from the fit. The net does not slow the ball. A ball that leaves the crop around the followed player (a long pass) is not seen; a pass between the two players is written but untested. The hand is one hand, never both.

**Step 4, built the same day: seven of the ten players, and the court camera script in the repo** (`pair-nba-play10` r5).

- Others in a scene: `set_pair_scene` takes `extras`, each `{actionId, revision, place, color, name, visible}`. They are drawn by the Clay view (page, renders, export) in their own colour, listed in the `seedance` block (`others`, one mapping sentence per colour) and in the Clay page's legend. They are not part of the pair: no contact, hand holds, foot locking, framing checks or per-frame notes. The pair stays the two key players.
- Who: the five people whose floor tracks from step 2's first attempt (detector at 1920 px, feet on the floor, nearest neighbour on the court) run through at least 84% of the window and stay on one person on a seven-frame sheet each: four in white (30, 13, 21, 8) in gray and one in blue in purple, hidden after 4.07 s when he leaves the picture. The other three players come and go in shorter pieces and are left out; the referees too.
- Cost: each body build about 3.5 minutes on this Mac (observe 95 s, body model 100 s), 17 minutes for the five; placing all seven takes seconds.
- Checked on five stills against the video from the source camera: all seven are where the video has them. Number 8's jump to contest the dunk was not noticed by the speed test (it was given by hand: `--air=white8:5.75:6.75`) and reads only 0.24 m high.
- `authoring/render/court-camera.py VIDEO START END OUT.json --at=SECONDS --points=POINTS.json` replaces the scratch scripts: a first guess from a handful of hand-made marks, a free fit of one frame from eight starts that trade lens against distance, the whole window followed from the best three and the best kept, then turn and lens per frame. 37 s for this window. From six marks rounded to a pixel it puts the camera at (0.23, −36.44, 10.79), 1.2 m from the fit in use (−0.76, −37.04, 11.02), with a mean line distance of 1.53 px against 1.30. The scene still uses the earlier fit.
- The editor draws the others too (same day): each a mannequin in its colour, stood by the same rule as the Clay view. Seen at two moments in a headless browser.
- `authoring/render/court-people.py VIDEO CAMERA.json OUT.json` is the floor tracker in the repo: it writes the form `reconstruct_motion`'s `boxes` takes and a sheet with one row a person. On play 10 it gives the same tracks as the scratch run, in 71 s.
- Still open: no court lines on the floor; the others have no foot locking or notes.

## Step 5, a second play (play 9, 13.68–17.48 s, another arena), 2026-10-13

What carried over and what did not, with the repo's scripts only:
- Camera: `court-camera.py` from four hand marks on the lane's corners. This court has a painted lane with a coloured border, not dark lines on a pale floor; the fit still lands on the arc, the circle, the lane's edges and the rim (looked at on three enlarged frames), with a mean line distance of 3.6 px against play 10's 1.3 because the border is a wide band. 9 s.
- People: the floor tracker gave four clean players (three defenders and one attacker) through the whole window, and again lost the ball handler, as on play 10: a driving, blurred player needs `sam3-track.py`. It also kept three people seated at the side and three referees; seated people are now dropped by their height in the picture (half a standing person's at that distance). One track swapped from a player in white to one in navy at a crossing: the sheet shows it, and that track is not used.
- Handler: `sam3-track.py` from one point followed him through all 114 frames (drive, jump, hang on the rim, landing); 24 minutes with body builds running beside it.
- Placing: the speed test missed this dunk (he rises toward the basket across the picture, not away from the camera). `court-place.py` now also counts a hand at the rim while the feet read more than a metre from under it, from 0.4 s before to 0.5 s after: off the floor 15.18–17.28 s, 15 frames hung on the rim, 1.28 m up. Play 10's result did not change.
- Scene: `pair-nba-play9` (handler and the defender he beats, plus two defenders and one attacker as others). On four stills against the video the five are where the video has them and the handler hangs on the rim.
- Not right: the ball. 28 sightings pass the filter, but the track puts it loose for a second and then in the defender's hand (189 px off the sightings); it is not in the scene. At the start the handler and his defender are tangled and both builds took the same detection for the first frames. The other five players and the replays are not done.
- Cost of this play with the repo's scripts: camera 9 s, floor tracker 70 s, handler tracking 24 min, five bodies about 25 min (slower with the tracker running beside them), ball search 6 min.

## Turnaround, 2026-10-13

A play took about an hour of machine time. Three changes, each measured:
- `sam3-track.py --every=3` follows every third frame and moves the box evenly between (the body build reads every third frame anyway). Play 10, two players, whole shot: 7.4 minutes against 19. Its outlines differ from the full run's (whole body against mostly the shirt, median overlap 0.3 and 0.56), but on eight frames both are on the ball handler.
- Each outline's box is now taken from its largest patch and the patches that reach into it. Before, stray patches made a box many times too large in some frames (3 of 8 looked at, and in the stored full run too); on the stretch that had them, all 22 followed frames are now person-sized (57–139 px wide, 145–235 tall).
- The full-size detection of each frame is kept (`.authoring/reconstruction-cache/detections-…`) and shared: `court-people.py` writes it, and every player's observe stage reads it. The observe stage also stops reading the file at the window's end and steps over the frames before it without unpacking them. Play 9: observe 79 s for the first player and 20 s for the next, against 95–150 s each before; a player's build 111 s against about 200.
- Check of the quicker track: play 10's ball handler tracked on every third frame over the whole shot (136 of 136 frames, 7.2 minutes; the time goes with the frames, not with how many people are followed), built without saving and placed. Against the placement in use: 0.08 m apart on the floor at the median, 0.3 m at the 90th percentile, 0.63 m at worst; height in the jump within 0.28 m; the same span in the air and 12 frames on the rim against 11.
- Not changed: the body model, about 90 s a player and now the largest part. `mini4.local` runs it about twice as fast but the pipeline cannot send a build there yet. The ball search is still 7 s a frame; every third frame is enough for `court-ball.py`.
- Expected for a play like play 9 now: camera 9 s, people 70 s, handler 4–5 min, five bodies 9 min, ball 4–5 min: about 20 minutes.

## Two players in one place at the start of play 9 (reported by the user, 2026-10-13)

For the first 0.3 s the defender is hidden behind the ball handler and the detector finds one person for the two. The floor tracker, which does not follow the handler, gave that detection to the defender: same box, same pose, same place (0.01 m apart at the start, 0.67 m at 0.3 s). `court-people.py --not=SAM.json` now leaves out every detection that overlaps (over 0.5) a person followed by `sam3-track.py`. The defender's track then starts at 0.07 s on his own detection; rebuilt and placed, the two are 1.1–1.5 m apart through the first second, and on five stills against the video the defender stands behind the handler and then falls, as in the video (`pair-nba-play9` r4).

## A player in two pieces (number 25 of play 9, asked for by the user, 2026-10-13)

The floor tracker had him as two tracks, 0–2.24 s and 2.47–3.8 s, split by the scramble under the basket, so neither passed `--least`. `--least=0.15` lists such pieces; a sheet showed both are him, the first drifting onto others after 1.5 s. Joined by hand (first piece to frame 45, second from frame 74: 78 of 115 frames) into one boxes file. The build refused it (under 80% of frames), so a frame for which a given track has no box now counts as hidden, like a pair's hidden performer; at least half the frames must still have a box. Built in 103 s, placed, and added to `pair-nba-play9` (r6) as a sixth figure; on five stills he is where the video has him at the start and the end. Through the 28 frames without a box his pose and place are carried across, not seen. Joining pieces is by hand.

## Play 9's ball (2026-10-13)

What was wrong: after the dunk one sighting lay beside a bystander's wrist, so the ball was put in his hand to the end of the clip and the loose course was bent to reach it (189 px off). Two changes in `court-ball.py`: a stretch in a player's hands needs three sightings at their wrist, otherwise it is a loose ball; and the fit caps each sighting's error at three ball widths, so one wrong sighting does not pull the course. Result (`pair-nba-play9` r8): in the handler's right hand, then his left from 1.5 s, loose from 2.1 s leaving at the rim (12.72, 3.04 m up, −0.12 across); five sightings, median 19.5 px off, one stray at 295 px. On eight stills: right through the dribble, the lift and the dunk; after it the ball falls about where the video has it for 0.7 s, then the course is extrapolation and flies off past the baseline while the video's ball stays low near the players. The dribble's bounces are not shown (the ball stays at the hand). Between 2.0 and 2.6 s the detector takes the rim and net for the ball; the size test drops those. Play 10's track is unchanged in the scene.

## One player from two cameras: play 10's first replay (asked for by the user, 2026-10-13)

The first replay (7.67–9.34 s of the video) is a low camera behind the baseline on the same drive and take-off. Built as its own action, `nba10-replay-handler` (window 7.70–9.30 s): `sam3-track.py --every=3` followed the ball handler through all 48 frames in 3 minutes, the build took 116 s. A second player's track was only his shirt and was not built.

`authoring/render/compare-views.py` against the wide shot's build of the same player:
- Clock: the replay starts at 4.96 s of the wide shot and runs at 0.68 of its speed, so its 1.57 s cover 4.96–6.03 s (the drive along the baseline to the rise at the rim).
- Poses: 13 joints are 9.9 cm apart on average after the best turn and size (worst frame 15.5 cm); the median over all clocks tried is 24.2 cm and the best clock more than half a second away 18.4 cm. Furthest apart: left knee 14 cm, wrists 11–13 cm, ankles 11 cm; shoulders and hips 4–6 cm.
- Camera check: turned into the court's axes through the wide shot's camera, the replay camera looks up the court from behind the baseline and pans evenly from (−0.93, −0.34, 0.09) to (−0.76, 0.57, 0.33), rising toward the rim, with a roll of −2.8° (spread 3.2°). That is a level camera panning, which the two builds would not give if they disagreed in depth.
- Seven matched moments were looked at side by side (replay frame, wide frame, the two skeletons overlaid): each pair is the same moment of the play.
- Not done: the replay has no court camera, so its build has no place on the court; the second replay (under the basket, the player cut by the frame) is not built.

## The replay as a scene of its own (asked for by the user, 2026-10-13)

`pair-nba-play10-replay` (7.70–9.30 s): the ball handler, number 21 and the defender (number 1), on the court, seen from the replay's camera.
- The replay shows no court lines, so its camera cannot be fitted to them. It is solved from the comparison instead: the pose match gives the camera's turn in the court's axes at every frame, the wide shot gives where the handler's hips are at the matched moments, and the body model gives where they are in the replay camera up to one unknown, how depth scales with the lens. A camera that stands still then has one place and one depth scale that fit all 17 frames: (16.49, −2.53, 0.42), which is 2.2 m behind the baseline and 0.42 m off the floor, with a lens of 1860 px (depth scale 0.86). It puts the handler back within 0.42 m on average (0.81 m at worst); solved frame by frame the place scatters by 0.2–0.4 m.
- Others: with the camera 0.42 m up, feet on the floor cannot give a place (a degree of tilt moves the floor point by metres), so every player is placed by the body model's depth with that one scale. Boxes came from the detector joined by overlap, with the handler's detections kept out; a sheet showed number 1 in frames 13–32 and number 21 in two pieces (0–15 and 27–42), joined by hand. A given track may now be seen in as little as 30% of the frames (it was 50%).
- Against the wide shot at the matched moments: the handler 0.29 m apart on the floor at the median (0.78 m worst; his place helped solve the camera, so this is not independent), the defender 0.49 m (1.0 m worst) and number 21 1.18 m (1.59 m worst), both independent. Hip heights agree within 0.09–0.24 m.
- Render from the solved camera beside the replay, six moments: the three figures are where the replay has them in the picture, in the same poses, and the rim comes into view at the end where the replay shows it.
- Not right: only the handler's height off the floor is used (the others read 0.4–0.5 m up while standing, which is the estimate's noise, and are set on the floor); the player who jumps to contest at the rim was not picked up; no ball; the scratch steps (camera solve, placing, joining pieces) are in `.authoring/team/scripts/`, not the repo; the second replay (under the basket) is not built.

## A Replay camera on the wide shot's scene (asked for by the user, 2026-10-13)

`set_pair_scene` takes `replay: {camera, from, to}`: another camera of the same moment and the stretch of the pair's clock it covers. The action workshop then offers a Replay camera beside Source (and `set_preview` takes `camera: "Replay"`); before and after its stretch it holds its first and last view. `pair-nba-play10` (r6) carries the solved replay camera over 1.89–2.96 s of its clock. Seen through it at four moments beside the replay's own frames (headless browser): the wide shot's seven players and ball line up with the replay, the handler driving past number 21 with the defender behind, the gather, and the rise to the rim with the contesting player beside him and the rim overhead. This is the wide shot's 3D scene seen from a camera it was not built from. The Clay page and exports do not have this camera yet.

## A Travel camera (asked for by the user, 2026-10-14)

Beside Source and Replay in the action workshop (and `set_preview camera: "Travel"`): the source camera until 1.2 s before the replay's stretch, then an eased flight (place, turn and lens, smootherstep) that lands on the replay camera exactly when the replay's own shot begins (1.89 s of play 10's clock, the replay's first frame), and the replay camera from then on. A plain blend of the two turns looked past the players halfway (the camera flies 36 m, from 40 m out to 4 m), so mid-flight the view is turned toward the selected performer, fully at the middle and not at all at either end. Checked at six moments in a headless browser: the players stay in view through the flight and the last picture is the replay's opening view. Editor only; the Clay page and exports do not have it.

Changed the same day at the user's request (the broadcast camera is 40 m away): from 0.1 to 0.7 s of the clip the camera moves in along its line of sight to 12 m from the selected performer, turning to face them, with its lens shortened by the square root of the distance ratio (so the players grow without filling the frame); from 0.7 s it stays at that place, still facing them; the flight to the replay camera then runs from 0.7 s and lands at 1.89 s as before. Checked at eight moments in a headless browser (`CLOSE`, `NEAR` and `TRAVEL` in `editor/main.tsx`).

## Replay and Travel on the Clay page, in renders and exports (2026-10-14)

The camera rule moved out of the editor into `runtime/pair-scene.ts` (`replayView`, `TRAVEL`, `placedAt`), used by the action workshop and by `authoring/render/clay-view.ts`, so the views cannot drift apart. The Clay page shows Source / Replay / Travel when a pair's scene has a replay; `render_pair_video` and `export_pair_reference` take `camera: "replay"` or `"travel"` (export folder `-reference-travel`, and `reference.json`'s camera block gets a `path` sentence saying what the camera does). On the Clay page and in renders the camera aims at the left performer (the editor aims at the selected one). Checked: the editor's Travel pictures are pixel-identical before and after the move (eight moments); at 0.05, 0.7, 1.3 and 1.89 s the editor, the Clay page and a travel render show the same framing; a travel export of `pair-nba-play10` was written.

## Dribbles: a hand down means a bouncing ball (asked for by the user, 2026-10-14)

`court-ball.py`: while the hand that has the ball is at the hips or lower (wrist height at or under the hip joint's, from `court-place.py`'s court block), the ball is not in it but bouncing. Each such stretch becomes one bounce: the ball leaves the hand as it goes down, meets the floor under the hand at the stretch's lowest point and comes back up into it, down at an even speed and up slowing into the hand, 0.35–0.6 s from hand to hand, with a 0.06 s glide out of and back into the hand. Listed under `dribbles`.
- Play 9 (`pair-nba-play9` r10): bounces with floor at 0.60 s and 1.30 s. The sightings had the ball near the floor at 0.6 s, so the first agrees with the picture.
- Play 10 (`pair-nba-play10` r7): bounces with floor at 1.50 s and 2.00 s; a sighting had it low at the knee at 2.07 s.
- Looked at on eight stills beside the video: the ball on the floor at each bounce, rising back to the hand after.
- Not right: a dribble whose low hand the body model does not see (blur, every third frame) is missed; play 10's handler dribbles more often in the drive than the two bounces found, and the three loose sightings at 0.8–1.03 s are still left in the hand. The bounce point is under the hand, not where the ball was seen.

Play 10's first second had no bounce (reported by the user, 2026-10-14): in the blurred drive the body model, read every third frame, never puts the hand below the hip. A second rule: a player who moves over the floor faster than 1.5 m/s holding the ball, with no bounce found, is dribbling; bounces come every 0.5 s (`--dribble`), 0.4 s from hand to floor to hand and a tenth of a second in the hand, their timing chosen among every frame's offset to fit the sightings in that stretch (a sighting's error capped at three ball widths), and they stop half a second before the ball leaves for good or the player leaves the floor. Play 10 (`pair-nba-play10` r8) now bounces with the floor at 0.30 and 0.80 s (timed against 5 sightings) and then at 1.50 and 2.00 s (hand down); play 9 is unchanged (its handler moves slower than 1.5 m/s where no bounce was found). On eight stills of the first 1.1 s beside the video: the ball is on the floor at 0.3 and 0.8 s and rising toward the hand at 0.93 s, where the video has it low beside the knee.

## Play 8 (Madison Square Garden, 23.95–28.70 s), 2026-10-14

`pair-nba-play8` r2: number 35 in white (drives from the top and lays it up) and the red defender who picks him up, plus three white teammates (purple) and a second red defender (gray, until 2.4 s), and the ball. Machine time about 25 minutes.
- Camera: four hand marks on the lane; `court-camera.py` 34 s. The lane is blue with white edges, which the dark-line finder only half sees: mean line distance 4.8 px against 1.3 on play 10, but the model's lines sit on the lane, circle and arc in four enlarged frames. The difference jump at 26.93 s is not a cut (the same camera on both sides); the real cut is at 28.73 s.
- People: `court-people.py` in 70 s gave six clean players through most of the shot and two referees and a standing coach, left out. Number 35 was followed by the floor tracker this time (no `sam3-track.py` needed). The two red defenders' tracks drift onto other red players after 3.1 s and 2.4 s and were cut there by hand. Six builds took 13 minutes.
- Ball: in the first 0.8 s SAM 3 took the Knicks logo at centre court for the basketball (17 ball widths, dropped by size) and missed the ball. A ball partly hidden by a hand looked too small and was dropped; `court-ball.py` now keeps a sighting from half a ball's width up to one and a half, not long and thin (play 10's track is unchanged by this; play 9's loose stretch fits worse with the extra sightings and its scene keeps the earlier track). A loose start with under three sightings that ends in a player's hands is now given to those hands. With `--reach=2.0` (this court's wrists sit further from the ball in the picture): in number 35's hands from the start, bounces at 0.1 s (hand down), 1.6 and 2.1 s (moving), released at 3.3 s toward the rim (3 sightings, 40 px median).
- Checked on eight stills beside the video: the players are where the video has them, number 35 drives into the lane and lays it up with the ball over his head at 2.9–3.3 s, the ball at the rim at 3.8 s and on the floor beside the basket at 4.5 s.
- Not right: number 35's layup jump is not found (neither the speed test nor the hand at the rim fires: he goes up across the picture and lays the ball in rather than hanging), so he stays on the floor; three red defenders and the player who falls at the end are missing; the bounce at 2.1 s may be his gather.

Play 8's open items, worked through the same day (`pair-nba-play8` r4):
- Layup jump: `court-place.py` also counts a bump of the floor reading away from the camera (over 0.3 m against the readings 0.4 s either side, two or more in a row). Number 35 is now off the floor 26.73–27.86 s of the video, 0.31 m up. Play 9 and 10's handlers are unchanged; a few others get short spans with no lift (0.00–0.06 m), which do nothing.
- Gather: with the jump found, the moving-dribble rule stops half a second before it, so the bounce at 2.1 s is gone; the ball is in number 35's hands from 1.77 s to the release at 3.3 s.
- Missing players: `--least=0.15` listed the short pieces; a sheet showed which belong together. Joined by hand into red 26 (two pieces), red 34 (three pieces), red 24 (from 2.3 s) and white 14 (from 3.17 s, the player at the end), and number 35 continued to the end (his track had stopped at 4.1 s). Number 35 and his defender rebuilt; six builds 11 minutes. The scene now has all ten players: number 35 and his defender as the pair, four whites in purple and four reds in gray.
- Checked on eight stills beside the video: the ten are where the video has them; number 35 goes up with the ball over his head at 2.9–3.2 s.
- Still by hand: picking and joining track pieces; the cut points of drifting tracks.

Kit colours (asked for by the user, 2026-10-14): `set_pair_scene` takes `colors` (the two performers' colour names; default blue and orange), and extras may share a performer's colour (teammates in one kit), only not the ball's. New colour names `white` and `crimson` (`runtime/characters.ts`; plain `red` came out close to orange under the clay lighting). Play 8 (`pair-nba-play8` r8): number 35 orange, the white team white, the red team crimson. A white figure did not show on the pale floor, so the clay view's floor goes mid grey when any figure is white (a scene's own floor colour had been overriding it at first). Looked at on four stills. The action workshop keeps its own two tones for the pair. Changed the same day at the user's request: play 8 uses team colours only (number 35 white like his team, his defender crimson like theirs; `pair-nba-play8` r10). The prompt sentences then tell a performer apart from teammates in the same colour by the ball ("the white model holding the green sphere at the start") or by the performer next to them ("the crimson model closest to the white model holding the green sphere at the start"), and call the rest "the other white models" and "the other crimson models".

## Play 1 (Miami, 117.9–121.9 s), 2026-10-14

`pair-nba-play1` r3: number 7 in white (takes the pass from number 10, drives the baseline and dunks) and number 21 in navy who contests, plus three whites and three navy players as others, and the ball. Team colours (white, and a new `navy`). About 40 minutes of machine time.
- The wide shot pans from centre court (116.65 s) to the basket; the lane is only in view from about 118 s, so the window starts there. Camera from four hand marks, 27 s; mean line distance 5.9 px (the painted lane again), lines on the lane and arc in four frames.
- The pan breaks the floor tracker's people into short pieces (46 tracks for about 12 people). Number 7 and number 21 were followed by `sam3-track.py --every=3` from one point each (all 120 frames, 6.5 minutes). Six others taken from floor tracks cut by hand where they drift (a sheet showed which stretches stay on one person).
- Number 7's jump is found (off the floor 119.72–120.72 s, 0.98 m up, 3 frames with a hand at the rim).
- Ball: the defender's hands overlap number 7's in the picture and he was taken for the holder; `court-ball.py --holders=` now names who may hold the ball. With `--holders=white10,handler,navy41 --reach=2.0`: loose (the pass, 8 sightings) to 1.5 s, in number 7's hands to the dunk, through the rim, picked up by navy 41 at 3.0 s. A scene's extras may now hold the ball (`holder` 2 on, in the extras' order), in the clay view and the editor.
- Checked on eight stills beside the video: players where the video has them, number 7 at the rim with the ball at 2.1 s, navy 41 with the ball at 3.2–3.8 s. Not right: the pass at the start is a fitted course, not seen well (the ball search looks round number 7, and number 10 is outside that crop at first); four of the ten players are missing.

