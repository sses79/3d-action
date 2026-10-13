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

**Next**: step 3, the ball.
