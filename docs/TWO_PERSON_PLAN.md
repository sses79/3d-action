# Two performers in one video — plan

Written 2026-10-10, after the line drawn at the end of Phase 6's first round (four video movements registered, four composed chains, facing options in the composer). The user asked whether a video with two characters can be handled and asked for a search of what exists before planning. Rule carried over from `SAM3D_PLAN.md`: use what is already installed or published before writing our own.

Nothing in this plan is built into the pipeline yet. A first experiment was run on 2026-10-10 with scratch scripts; see the next section.

## First experiment (2026-10-10)

Clip: 1.70 s (51 frames at 29.97 per second) cut from a fight highlight video the user supplied, 54.65–56.35 s: two fighters, one low kick that lands on the other's leg, a crowd behind, no referee in shot. The camera pans and zooms during it, which the plan had hoped to avoid. The cut is in untracked `.authoring/two-person/kc-kick.mp4`; no footage or frames are in this repository.

- **Identities (BoT-SORT in Ultralytics, YOLO26s pose, 960 px):** both fighters keep one identity each for all 51 frames, through the kick where their boxes overlap. The two largest tracks by box area are the fighters; spectators are far smaller. Checked on a sheet of 12 frames with the boxes drawn.
- **Bodies (`SAM3DBody_Predict` with two boxes per frame):** two bodies in every frame; 191 s for 102 bodies on this Mac (1.87 s each). Drawn over 12 frames, each skeleton follows its own fighter, the kicking leg included.
- **Shared space (`pred_cam_t`):** the distance between the two along the floor goes from 1.36 m to 0.94 m at the kick and back to 1.34 m. At frame 35, the kick, one fighter's ankle is 0.12 m from the other's shin in camera space, which is two limbs touching. So the per-person camera positions are consistent enough between the two bodies to show the contact.
- **Not checked:** depth between the two (it swings from -0.40 m to +1.07 m over the clip, some of which may be the zooming camera and not the fighters); anything in motion; our character, since no action was built; clips where the two cross over or clinch; the referee as a third person.
- **Side effect:** Ultralytics installed the `lap` package (0.5.13) into `.authoring/vision-venv` by itself the first time tracking ran.

**Step 1 built the same day.** `observe.py --subject left|right` follows one of the two largest identities from BoT-SORT (named by where they stand at the start; 960 px input); `reconstruct_motion` takes `subject`; the summary reports the other performer (`observations.otherPerformer`: frames missing, frames where the two boxes overlap). Raw-result reuse is off for these windows, because it matches by frame numbers, which the two performers share. Built from the kick clip, straight from the source video: `pair-kc-kick-left` (white trousers, the one kicked) and `pair-kc-kick-right` (black trousers, the kicker), 1.70 s each, both on rotations, 0 frames with a part inside another, jitter 5.4 and 8.2 mm, no frames missing, boxes overlapping in 11 frames (1.11–1.44 s). Review sheets read for both, eight poses each: the right fighter's action shows the guard, the step in and the low kick at 1.21 s; the left fighter's shows the guard, the reaction with an arm thrown up and the fall starting at 1.70 s. Each follows its own performer. Not judged in motion. Each action stands at its own origin; nothing places the two together yet (step 2). Known nuisance: one build takes longer than the command-line client waits, so the client reports a timeout while the service finishes and saves the action.

**Step 2 built the same day.** `body.py` writes `cameraHip`: the hip centre in the camera's space (keypoints plus `pred_cam_t`; they project onto the model's own 2D keypoints with 0.0 px error on the 102 bodies of the experiment). For a build with `subject`, the retarget takes sideways and depth travel of the root from it, from that performer's own first frame, and records the first-frame position (`action.scene` in the summary, `build.scene` on the entry). Solo builds are unchanged. New operations `set_pair` and `list_pairs`: a pair names two actions from the same video window and stores the right performer's offset from the left one at the first frame; neither action is changed. Pair `pair-kc-kick` (both actions at revision 2): the right fighter starts 1.29 m to the side and 0.40 m nearer the camera. Measured from the two saved actions plus that offset: the distance between the characters is 1.35 m at the start, 0.86 m at 1.10 s (the kick) and 1.37 m at the end. Projected back through the model's lens, the gap between the two hip centres in the picture is within 2.4 px on average and 7.2 px at worst of the body model's own 2D hips over the 51 frames (the gap is about 343 px), so the saved pair keeps what the model saw. That comparison is against the model's 2D reading, which was looked at drawn on 12 frames, not against a hand measurement. Not checked: whether the two characters face each other as the fighters do (both take their orientation from the same camera frame, so they should); the depth travel each action now has (1.37 m for the left fighter, 0.59 m for the right), part of which is the camera zooming; anything in motion, since Studio cannot show two characters yet (step 3).

**Step 3 built the same day.** Studio (`editor/main.tsx`): when the selected action is one side of a current pair, the other side's action is fetched and played by the viewer's first character (blue, normally the reference) at the pair's offset, on the same clock; a Pair button in the view bar turns it off and on. It also shows during Video review, so the source frame, the selected performer and the partner are on screen together. Seen in the browser on `pair-kc-kick-right` at 1.10 s, front view: the two characters stand facing each other, the kicker's leg is at the other's leg, and the video frame beside them shows the same moment with the same left and right. That is two stills; playback has not been judged. Not built: notes that name the other performer; a pair entry of its own in the sidebar (a pair is reached through either of its actions); the pair in Compare or Reference view.

**Step 4, first part, built the same day** after the user's review of the pair in Studio ("looks great", with a screenshot in which the kicker's foot was inside the other fighter's leg). `runtime/pair-contact.ts` and the operation `resolve_pair_contact`: limb points of each performer (knee, shin, ankle, toes, elbow, forearm, wrist, palm) are tested against rods along the other's body (trunk, neck, thighs, shins, upper arms, forearms; the retarget's radii), both placed by the pair record. Without `apply` it only measures. With `apply`, the limb that is inside gives way: it turns at the hip or shoulder by the smallest angle that brings the point to the surface, starting 4 cm before the touch, as R40 does within one body. The choice left open in this plan was made this way: the attacker's limb stops on the body; the body that is hit is not moved. Changed actions get a new revision with their scene placement and video link carried over, and the pair is re-pinned. On `pair-kc-kick`: before, 2 frames inside (1.13–1.17 s), the kicker's ankle 8.9 cm into the other fighter's shin; after, 0 frames; the kicker's leg was turned in 3 frames; `pair-kc-kick-right` is now revision 3, the left action unchanged, the pair revision 2. Contacts recorded on the pair: the kicker's ankle and toes on the other's shin from 1.10 to 1.17 s. Seen once in Studio at 1.15 s, small: the foot is at the shin. Not done: a reaction in the body that is hit; contact drawn or cued in Studio; anything across bodies during a rebuild (rebuilding either action leaves the pair stale: record it and resolve it again); the same rule's cost in smoothness was not measured for the pair.

**Step 4, reaction, built the same day** at the user's request. `resolve_pair_contact` takes `reaction` (0–1, default 0): the limb that is struck takes that share of the overlap. It is turned at its own hip or shoulder so the place that was hit moves away along the line of the strike, and the turn dies away with a time constant of 0.12 s. The attacker's limb then gives way for what is left, as before. The operation now always starts from the two actions as reconstructed (the latest revision with a scene placement and no pair contact applied), so it can be run again with another setting. On `pair-kc-kick` with `reaction: 0.5`: the kicked fighter's right leg is turned at the hip by 1.1° at 1.10 s, 7.2° and 7.5° at the two frames of the hit, then 5.7°, 4.3°, 3.3° and so on, under 1° by 1.43 s; nothing else in his action changes. Overlap after: 0 frames, 1 mm at worst. Left action revision 3, right action revision 4, pair revision 3; no configured flags on the left action. Limits: only a struck arm or leg reacts, a hit on the trunk, neck or head moves nothing; the reaction is a turn of one joint, the rest of the body does not sway, step or lose balance; the share and the decay time are chosen values, not measured from anything; not seen in a still or in playback.

## Clinch clip and SAM 3.1 (2026-10-10)

Second clip from the same video, 26.15–29.95 s (114 frames; untracked `.authoring/two-person/kc-clinch.mp4`): the fighters square up, one punches, they clinch and turn round each other, so they swap sides and one hides the other.

- **BoT-SORT on it:** both identities hold through the punch and into the clinch (to about frame 65), then the fighter who goes behind is lost; from about frame 70 only one identity remains, and a new identity number appears later. So step 1 as built does not cover a clinch.
- **SAM 3.1 video tracking** (`sam3.1_multiplex_fp16.safetensors`, 1.75 GB, downloaded with the user's approval into `.authoring/comfyui/models/checkpoints`; `SAM3_Detect` on the first frame from the two fighters' boxes, then `SAM3_VideoTrack`): it runs on this Mac, on the GPU and on the CPU, so the reports that it cannot run on Apple Silicon do not hold for ComfyUI's port. Two problems. It is slow: 9.5–10 s per frame, 19 minutes for the 114 frames. And it does not work here: the first-frame masks are good (two clean masks of about 50,000 and 66,000 pixels) and stay good for 7 frames, then every mask is empty for the rest of the clip. Same result in four runs: GPU with starting masks, CPU with starting masks, GPU with starting masks plus the text prompt "person", GPU with the text prompt alone (four objects found, all gone at frame 7). Seven frames is the tracker's memory length, so this looks like a fault in how the tracker carries on past its first memory window in our ComfyUI checkout (commit 58b176f), or in how these scripts drive it. Cause not found.
- **Removed the same day at the user's request:** the SAM 3.1 weights file is deleted from `.authoring/comfyui/models/checkpoints`. Nothing in the pipeline uses SAM 3.
- **Not tried:** a newer ComfyUI checkout (it would also change the SAM 3D Body code our mapping was checked against); the mini; Meta's own SAM 3 code.

## The clinch, second attempt (2026-10-10)

The user agreed to drop the reaction (the pair `pair-kc-kick` is resolved again with `reaction: 0`: pair revision 4, left action 4, right action 5) and asked for the clinch.

- **What was actually failing.** The detector sees both fighters in nearly every frame of the clinch. The tracker dropped the hidden fighter's identity at frame 69 and gave him a new one from frame 74.
- **Fix in `observe.py` (with `subject`), by what the performers wear.** Leg colour per identity: the median of pixels along hip to knee of the detected pose (the lower middle of the box where the pose has no confident hips and knees). *Stitching:* another identity of comparable size, seen for three frames or more, that only exists while one performer is missing becomes that performer if its colour is nearer his. A spectator or referee exists while both performers do, so is never taken. *Swaps:* where both have a box and for three frames or more each box's colour fits the other performer better by a clear margin, the boxes are exchanged. The report lists `stitchedIdentities`, `swappedFrames` and `legColours`.
- **On the clinch clip** (26.15–29.95 s, 115 frames): two pieces stitched onto the hidden fighter; he is missing for 4 frames (70–73), bridged; no swaps. Boxes drawn on 29 frames: each colour of box stays on its fighter through the clinch and ends on the correct side after they turn round each other.
- **Actions** `pair-kc-clinch-left` and `pair-kc-clinch-right` (3.8 s, rotations, 0 frames inside within each body, jitter 5.7 and 3.8 mm). Review sheets read, eight poses each: the left fighter stands, punches, leans into the clinch, and ends reaching on the right; the right fighter guards, ducks under the punch, bends into the clinch, is pushed upright, turns his back to the camera and ends standing. Each follows its own performer in the frames where he can be seen; where one is hidden behind the other the pose cannot be checked against the picture.
- **Pair `pair-kc-clinch`:** the distance between the hips goes from 1.36 m to about 0.5–0.7 m in the clinch and 0.93 m at the end; the sideways offset changes sign (1.15 m to -0.93 m) as they swap sides, with up to 0.5 m between them in depth at the crossover. Three stills in Studio (1.63, 2.71, 3.80 s) show the clinch, one fighter in front of the other, and the two apart on swapped sides.
- **Contact in a clinch.** Before any correction, 72 of 115 frames have a limb of one inside the other's body, up to 13.4 cm: arms round a trunk, knees against thighs. Correcting each frame alone cleared all but 4 frames but made the arms jerk (up to 77° in one frame; the change of turn between frames went from about 2° to 6° on average). `resolve_pair_contact` now smooths its corrections over seven frames and repeats correct-then-smooth twelve times. Result: 24 frames left inside, 9.7 cm at worst, and the arms and legs are as smooth as before any correction (largest turn in one frame 22°, mean change 1–2.4°). So in a clinch the rule removes two thirds of the overlapping frames without adding jerk; it does not remove all of it. Pair revision 5, both actions revision 5.
- **Final try at the user's request ("good enough already"), same day.** After the twelve rounds, one more pass frame by frame that is not smoothed but is small: each limb may turn at most about 8.5° more. Clinch pair: 11 frames left inside (from 24; 72 before any correction), 6.7 cm at worst, each a single frame or two (elbow or forearm in the trunk, knee in a thigh). Cost: the largest turn of an upper arm in one frame is 28° (22° before the pass) and the mean change of turn between frames 1.8–2.9° (1.6–2.4°). Pair revision 6, both actions revision 6. Kick pair rerun with the same rule: 2 frames inside before, 0 after (4 mm at worst); pair revision 6, right action revision 7, left action unchanged at 4. The user's verdict on the clinch before this pass: very good results; the two are wrestling and very close.
- **Limits.** The colour cue here is white trousers against black; two performers dressed alike would not be told apart. Boxes are not masks: inside the tightest part of the clinch the body model may read parts of the wrong person. Neither pair has been looked at in motion since the final pass.

## Step 5, first part, and a third clip (2026-10-10)

- **Paired library movements.** Operation `register_pair_movements`: the two actions of a current pair are copied into the library as two movements (through `build_movement`, each with its source, its partner and the partner's starting offset in the metadata), and the pair record keeps the link (`pairs[id].movements`). Studio shows either movement with its partner the same way it shows a paired action. Done for the kick pair: `move-pair-low-kick` (the kicker) and `move-pair-low-kick-taken` (the one kicked), pair revision 7. Seen once in Studio at 1.13 s: the movement plays with its partner in blue. Not built: composing a pair. The composer handles one character; a paired movement composed into an action does not bring its partner along, and nothing places a second character at the `facing: target` opponent.
- **Third clip, asked for by the user as 1:39 to 1:43.** Built as 99.77–103.60 s (the shot starts at 99.73 s; the end was taken 0.6 s past 1:43 so that the last kick finishes; the shot itself runs to 104.6 s). Two other fighters: one in black trousers throwing a low kick, a high kick at about 2.2 s and another kick at about 3.3 s, the other in white trousers guarding. `pair-kc-139-left` and `pair-kc-139-right`, 3.83 s, no frames missing for either, boxes overlapping in 81 of 116 frames; jitter 10.0 mm (left, with one hand jump of 12 cm at 2.80 s) and 4.1 mm (right). Review sheets read, eight poses each: the left fighter's action shows the guard, the low kick, the high kick and the later kick; the right fighter's shows the guard held and the lean back at the end. Pair `pair-kc-139`: 16 frames with a limb inside the other fighter before the contact rule (11.7 cm at worst), 1 after (2.6 cm); pair revision 2, both actions revision 2. Contacts recorded include the kicker's shin on the other's upper arm at 2.20 s. Not looked at in Studio.

## Step 5, second part: composing with a partner (2026-10-10)

- **What it does.** `compose_action` takes `partner: {actionId, pairId}`. When a step is a movement registered as half of a pair, the other half is built as a second action: it waits in its first pose until that step starts, plays in step with it at the same speed, turned and shifted exactly as the composer placed that step, standing where the pair recorded it, then holds its last pose. The two actions are recorded as a pair, so Studio shows them together. The lead's recipe remembers the partner, so changing a join or a speed (the Phase duration slider, `revise_action_recipe`) rebuilds the partner too. Only the first such step gets its partner.
- **Aim.** A step that is half of a pair and uses `facing: target` is now aimed by where its partner stood in the recording, not by the head. The head rule put the opponent beside the walker on the first try (stills showed the lead walking toward the camera with the partner standing to its side); the kicker in this clip starts side-on, with the head not turned to the opponent.
- **Built.** `walk-low-kick-duo` (Walk cycle, 0.3 s join, `move-pair-low-kick` with `facing: target`, 0.3 s join, Counter ready; 3.79 s) with partner `walk-low-kick-duo-partner` (waits 1.63 s, plays `move-pair-low-kick-taken`, holds 0.46 s), pair `pair-walk-low-kick`. Joins 0.21–0.28 m/s, no configured flags. Stills in Studio: during the walk the partner stands directly in front of the walker, facing him; later the two are engaged at kicking distance.
- **Limits.** The partner is frozen while it waits and after it finishes (a held pose, not a stance that breathes or shifts). The contact rule is not run on a composed pair (`resolve_pair_contact` needs reconstructed actions). The walk is on the spot, so the lead does not close distance before the kick: the partner simply stands at kicking range from the start. One partner step per action. No test covers this path yet.

## Distance between the two, and a spacing setting (2026-10-10)

The user did not think composing with a partner was needed (it stays as an option; no more work on it) and asked how the distance between the two fighters in the 1:39 pair is calculated, saying a little more distance would make it perfect.

- **How it is calculated.** For each fighter the body model gives the hip centre in the camera's space, in metres. Each action's travel is that hip track from its own first frame, and the pair stores the offset between the two first frames. Nothing is scaled. The fighters as the model measured them are almost our character's size (thigh plus shin 0.82 m against our 0.84 m; forearm 0.25 m against 0.28 m), so size is not the reason they read as close. Our character is thicker in the trunk and limbs than the people filmed, and the depth between two people is a single-camera guess.
- **Setting.** `resolve_pair_contact` takes `spacing` (-0.3 to 0.5 m): that much extra distance along the line between the hips in every frame, half to each fighter, applied to the reconstructed actions before contact is measured. It is kept on the pair and reused by later calls.
- **On `pair-kc-139`,** frames with a limb inside the other fighter before the contact rule: 16 with no spacing, 11 with 0.10 m, 9 with 0.15 m, 8 with 0.20 m. The user tried 0.10, 0.15 and 0.20 m and kept 0.20 m (0 frames inside after the contact rule; the three kicks still land, the last about one frame later than at 0.15 m). The clinch pair was then set to 0.20 m as well: 56 frames inside before the contact rule instead of 72, 7 after instead of 11, 5.9 cm at worst. The kick pair was tried at 0.20 m, where the low kick no longer touches the leg at all (its only contact was one foot 8.9 cm into one shin), and set to 0.10 m: nothing inside, ankle then toes on the shin at 1.13–1.17 s. So the right spacing depends on the pair; there is no single value.

## Dancing, and longer actions (2026-10-10)

The user supplied a second video (a televised samba, third-party footage, kept out of the repository) and asked for clips of the two people dancing, with actions extended to 15 seconds; then, while the first build ran, for 10 seconds and no stretch where the dancers are far away.

- **Longer actions.** A reconstruction window may be up to 15 s (was 8), a track up to 512 keys (was 256), a phase up to 16 s (was 10). `body.py` feeds the model 64 pictures at a time. The body stage's time limit grows with the window. The composer's own 4 s limit is unchanged.
- **The clip.** The broadcast cuts every 2–8 s; the one long shot with both dancers in view is 68.1–82.6 s. Within it the dancers' height in the picture is under 320 px for the first two seconds and the last two (the woman is not detected at all for the first 1.2 s), so the window is 70.7–80.7 s: 317 px at the smallest, mostly 450–590 px. The camera cranes in during it.
- **Tracking.** Both dancers keep one identity each for all 241 frames, hand hold and turns included (drawn on 35 frames of the longer shot). No stitching or swaps. They are dressed alike in light blue, so the colour repairs would not have helped had the tracker failed.
- **Actions.** `pair-samba-left` (the woman) and `pair-samba-right` (the man), 10.0 s, 301 samples, rotations, 0 frames inside within each body, jitter 6.2 and 5.3 mm. The woman's box touches the frame edge in 18 frames (5.46–8.05 s), where her legs are partly out of shot. Review sheets read, twelve poses each: hand on hip and behind the head, arms out, hands up, the raised arm, the hand hold; each follows its own dancer. Both actions travel 4.4–4.9 m toward the camera: that is the crane moving in, read as the dancers approaching.
- **Pair `pair-samba`.** Frames with a limb inside the other dancer before the contact rule: 16 with no spacing, 6 with 0.10 m, 5 with 0.20 m. Resolved with 0.10 m; result in the handoff entry.
- **What went wrong on the way, three times.** The pipeline's 5-minute stage limit killed the body stage; with `source: auto` the pipeline then fell back to the rules path, whose error hid the cause; and the fix (a longer limit in `pipeline.mjs`) did nothing until `core.js` was rebuilt, because the service runs the bundle. The command-line client's own timeout made the build script misread all of it.

## Hand holds (2026-10-10)

The user's screenshots of the dance pair showed the two characters' arms reaching past each other where the dancers hold hands, and from above looking as if the bodies overlapped; the user asked for 20 cm of spacing and for the hand hold to be looked into, "position as well".

- **Position.** Hip to hip the pair was about right: 1.01, 0.85 and 0.93 m at 6.37, 7.00 and 7.38 s (with the 10 cm of spacing then applied), against about 0.9, 0.75 and 0.85 m read off the picture. What looked like overlapping bodies was the arms: each character keeps the model's arm angles on our proportions and nothing knew the hands were joined.
- **Detecting a hold.** `body.py` now writes the wrists in camera space (`cameraWrists`), kept on the entry as `build.scene.wrists`. The model places a wrist well in the picture and poorly in depth: held hands here are 6–20 cm apart in the picture plane and up to 35 cm apart in depth, and hands held by the fingers leave the wrists 15–20 cm apart. A first rule on 3D distance (13 cm) found the hold only from 7.0 s; the double hold at 6.4 s was missed. The rule kept: wrists within 19 cm in the picture plane (staying within 24 cm) and within 40 cm in depth for at least 0.2 s; of two overlapping holds that share a hand, the nearer one wins.
- **Making the hands meet** (`holdHands` in `runtime/pair-contact.ts`, run last in `resolve_pair_contact`; `hands: false` turns it off). Both arms of a hold are bent or straightened at shoulder and elbow (two-bone reach, elbow kept on its side) until the wrists meet half way between where they were, as far apart as the model shows them in the picture (7–20 cm). The weight ramps over five frames at each end. Arms in a hold are left out of the overlap test, which had been pushing joined hands apart.
- **On `pair-samba`** with spacing 0.20 m: holds found at 6.30–8.30 s (her left hand, his right) with the other pair of hands joining at 6.60–7.00 and 7.83–8.40 s, and three short ones (8.47–8.63, 8.97–9.20, 9.43–9.70 s) that were not checked against the video. 0 frames with a limb inside the other dancer before or after. Pair revision 5, both actions revision 5. Stills in Studio at 6.5 and 7.0 s: the hands meet between the two bodies and the arms no longer cross.
- **Limits.** Wrists are brought together, not fingers; the hands are not oriented to grip. A hold is found from the model's reading, so a missed or invented hold is possible (the three short ones are candidates). The reach is not smoothed beyond its ramp. Older pairs have no wrists recorded and are unaffected.

## White-model video with the source camera (2026-10-10)

The user asked for a 10 s white-model video and, before export, a cinema-level camera; of four options (match the source shot, author a camera in Studio with a timeline such as Theatre.js, generate one with a model such as DanceCamera3D or DIRECTOR, export to Blender or Unreal) the user chose the first, white clay, 1280x720 at 30 frames per second.

- **Operation `render_pair_video`** (`authoring/render/pair-page.ts`, `pair-video.mjs`): draws the pair in headless Chrome with software WebGL (white clay characters, pale floor, one soft shadow) and encodes an MP4 with ffmpeg under `.authoring/renders`. Cameras: `source`, `fixed`, `orbit`.
- **The source camera.** Our scene for a pair is the camera space of the source window, so the camera sits at its origin, unrotated, with the body model's lens (focal length = the picture's diagonal in pixels, 27.6° vertical at 720p). Each character stands at its first-frame hip position plus its own root travel. The camera's height over our floor is worked out per frame: how far below the camera's axis the model put each performer's hips, added to how high our character's hips are, averaged over the two. The hips' camera-space track is kept on new builds (`build.scene.hips`) and read back from the body stage's cache for older ones.
- **On `pair-samba`** (revision 5): 301 frames, 10.03 s, 2.0 MB, rendered in 24 s. Ten frames, one per second, laid beside the source frames at the same times: the two characters sit where the dancers sit in the picture and are the same size, through the crane move in and the pull back, and the hand hold at 6–8 s is in place. Checked on those ten stills; the video was not watched in motion by me.
- **Limits.** The lens is assumed, so the broadcast's zoom reads as the camera travelling; the camera never turns, because our scene takes the camera's axes as the world's (a tilted camera shows up as leaning characters and a floor that is not quite where the real one was). `fixed` and `orbit` exist and were not rendered. One character model for both performers.

## Stage from the video: first look with MoGe (2026-10-11)

The user wants the clay video to include the stage and floor of the source, built coarsely from the video's own geometry with the performers removed, as a reference for generated video. Plan agreed in conversation: a one-frame look with MoGe (already downloaded), then a multi-view model for the camera path and a fused stage.

- **MoGe on one frame** (70.7 s, the first of the dance window; `MoGeInference` through ComfyUI's nodes with our assumed lens passed in as `fov_x` 47.1°; 18 s on this Mac): a full point map. Its depth at the two dancers' hips is 8.62 and 8.41 m against the body model's 7.58 and 7.14 m, a ratio of 0.879 and 0.849, so one scale (0.864) brings the stage into the dancers' space. A plane fitted to the lower part of the picture is flat to 5.6 cm and puts the camera 1.88 m above the floor (1.62 m after scaling), pitched down 3.2°. That pitch is information we have not had: our scene takes the camera's axes as the world's.
- **Coarse stage.** Depth under the dancers' boxes filled by inpainting, sampled every 4 pixels (57,600 vertices, 106,502 triangles after dropping those across depth jumps of more than 12%), scaled, and stood in the scene at the camera's height for that moment. `authoring/render/pair-page.ts` takes an optional `stage` mesh and then hides the plain floor.
- **What the stills show** (`.authoring/renders/stage-look-moge-70.7.jpg`, untracked): from the source camera at that moment the clay stage lines up with the picture (arches, steps, the raised platform) and the two characters stand in it. Behind each dancer the filled-in patch is a ridged rectangle. From the side it is a relief, not a room: ragged edges and a rough, slightly tilted floor.
- **Limits of this look.** One frame, so it is right only for that camera position; the source camera then moves and the mesh does not. The scripts were scratch (session scratchpad), not pipeline code.
- **Level room, built the same day at the user's request** (`payload.level` in `authoring/render/pair-page.ts`: the floor's normal in the camera's space, and the camera's height). The turn that stands that normal upright is applied to the performers (position on the floor and their upright), to the stage mesh, and to the source camera, which is now pitched as the real one was (3.2° here) instead of the characters leaning. Stage vertices within 10 cm of the floor plane are replaced by the flat floor, which takes the shadows. Stills (`.authoring/renders/stage-look-level-70.7.jpg`): from the source camera the floor in front is clean and flat with the two shadows on it and the stage still lines up with the picture; from the side the foreground is clean, the far floor and steps are still ragged, and the ridged rectangles behind the dancers are unchanged. The pitch is from one frame and held constant; the camera's height over time still comes from the hips. Driven from scratch payloads; `render_pair_video` does not pass `level` or `stage` yet.
- **Next, not started:** flatten the floor to the fitted plane; fill behind the dancers from other frames; camera poses and a fused cloud from several frames. ComfyUI's checkout already has Depth Anything 3 nodes (`comfy_extras/nodes_depth_anything_3.py`), so that is the first multi-view model to try; its weights are not downloaded.

This is one easy case. It says step 1 and the start of step 2 are as reachable as hoped; it says nothing yet about occlusion.

## Goal

From one clip with two people, get two actions on one timeline, standing in one shared space at the distance and facing the video shows, playable together in Studio beside the source. Contact between the two (a hit that lands, bodies that do not pass through each other) comes after that works.

## Where we start

Checked in the code on 2026-10-10:

- `authoring/reconstruction/observe.py` detects every person in every frame and already builds one track per person, linking boxes frame to frame by overlap (IoU 0.2, up to 6 frames apart). It then keeps the longest track and discards the rest.
- `SAM3DBody_Predict` takes a list of boxes per frame and returns one body per box. `body.py` passes one box and reads `people[0]`.
- Each body comes with `pred_cam_t`, its position relative to the camera. We store it in `body-raw.npz` and do not use it.
- Ultralytics 8.4.173 in `.authoring/vision-venv` ships tracker configurations, BoT-SORT among them.
- `.authoring/comfyui` (commit 58b176f) has the `SAM3_VideoTrack` node, and `SAM3DBody_Predict` accepts its `track_data`. The SAM 3.1 weights are not downloaded.
- Root travel of a video action comes from the hip centre in the picture, sideways to the camera only; travel toward or away from the camera is not estimated.
- The action format, the retarget, the Studio viewer and the composer each hold one character.

## What exists elsewhere, and the decision

From the search of 2026-10-10. I read search summaries and ComfyUI's tutorial page, not the repositories; Mac support, licences and maintenance are unverified unless stated.

| Need | Candidate | Decision |
|---|---|---|
| Two bodies per frame | `SAM3DBody_Predict`, already installed | Use. ComfyUI's documentation says it returns one or more people per frame when given boxes or tracks. |
| Identities across frames | BoT-SORT in Ultralytics (already installed): motion plus appearance matching | Try first. No download; a change inside `observe.py`. |
| Identities across frames | `SAM3_VideoTrack` with SAM 3.1 (1.75 GB): tracks with masks; the route ComfyUI's tutorial uses for multi-person clips | Tried 2026-10-10 and dropped for now: about 10 s per frame here and every track lost after 7 frames (see "Clinch clip and SAM 3.1"). Weights removed. |
| Both people in one world | Human3R: one model for all people, the scene and the camera | Not now. Needs an NVIDIA GPU, uses the SMPL-X body (a different body model from the one our rotation mapping is built on), licensed for non-commercial research. |
| Both people in one world | `pred_cam_t` from SAM 3D Body | Use. It is the same model we already map to our character. |
| Close contact | BUDDI: a learned prior for two people in close interaction, used to correct two estimates | Later, and only if our own rule is not enough. SMPL-X, non-commercial. |
| Close contact | PromptHMR with its interaction switch; two 2024–2025 papers on closely interacting people from one video | Not now. SMPL-X; public code not confirmed for the two papers. |
| Close contact | Our solid-parts rule (R30, R40), extended from one body to two | Use first. |

## Steps

### Step 1 — two tracks, two actions

- `observe.py` keeps the two main tracks instead of one, each with its own boxes, and names them by where they stand at the start (left and right in the picture). BoT-SORT replaces or backs up the overlap linking.
- `body.py` runs once per track on that track's boxes. Running the two separately keeps the second look (R39), despike (R38) and smoothing per person; one call with two boxes per frame is a later saving.
- `reconstruct_motion` gains a way to say which performer (`subject: left | right`, default the current single choice), and builds one action per call. The pair shares the clip window, so the two actions have the same length and timeline.
- The summary reports how many frames each track is missing and where the two boxes overlap, since those are the frames to distrust.

Done when a short two-person clip gives two actions that each follow their own performer through the whole window, with no swap of identities, checked on review sheets.

### Step 2 — one shared space

- Put both roots in one frame from `pred_cam_t`: sideways and vertical position as now, plus the distance between the two along the camera's line of sight, which solo actions do not have.
- Keep the floor rule as it is (lowest point of each body on the floor) and check that the two floors agree; if they do not, that measures how wrong the depth guess is.
- Store the pair as a record: the two action ids and revisions, and each one's placement. An action stays usable on its own.
- Measure against the video: the distance between the two hip centres in the picture, frame by frame, against the same distance in our scene seen from the camera.

Done when that distance follows the video within a stated error and the two characters face each other when the performers do.

### Step 3 — two characters in Studio

- The viewer loads a second character and plays a pair on one clock, with each character's placement applied.
- Video review shows the pair beside the source clip.
- Confidence levels and notes stay per action; a note can name the other performer.

Done when the user can review a pair the way a solo action is reviewed now. Stop here for the user's verdict before step 4.

### Step 4 — contact between the two

- Extend the measure "frames with a part inside another" to parts of the other body, and report crossings between bodies.
- Extend R40 to the other body: a hand, foot or shin that lands inside the opponent is brought to the surface. Which body gives way is a choice to make with the user (the attacker's limb stops, or the one hit moves).
- Mark frames where a limb of one reaches the surface of the other as hits, for cues.
- Only if this proves too weak: try BUDDI as a prior on the pair, on a machine and under a licence that allow it.

No "done" line yet; it depends on what step 3 shows.

### Step 5 — library use

- Register a pair as two linked movements (an attack and its reaction).
- The composer's `facing: target` rule already assumes one opponent in front; a second character would stand where that target is.

## Risks and unknowns

- **Identity swaps** when the two cross or one hides the other. BoT-SORT's appearance matching is weakest when the two look alike (same clothes).
- **Occlusion.** A half-hidden body is read worse. Expect more wrong frames than in solo clips; masks from SAM 3.1 are the known help.
- **Depth.** The distance between two people along the line of sight is a single-camera guess in every method that takes one video.
- **Time.** Two people cost twice the model time per clip (about 1.8 s per frame per person on this Mac, half that on `mini4.local`).
- **SAM 3.1 on Apple Silicon** is unconfirmed.
- **Licences.** Human3R, BUDDI and PromptHMR depend on SMPL-X, which is licensed for non-commercial research. SAM 3D Body's weights are under Meta's SAM License, as before.

## Needed from the user

- A two-person clip: 2–4 s, fixed camera, both people fully in frame. The project has no such footage.
- What kind of scene it is. Sparring with contact needs step 4; two people moving side by side does not.

## Not in this plan

- More than two people.
- Moving cameras.
- A different body model.
- Changes to solo reconstruction.

## Sources

- ComfyUI SAM 3D Body tutorial: https://docs.comfy.org/tutorials/utility/sam3d-body
- `SAM3DBody_Predict` node: https://docs.comfy.org/built-in-nodes/SAM3DBody_Predict.md
- ComfyUI SAM 3 video segmentation tutorial: https://docs.comfy.org/tutorials/utility/video-segment-sam3
- Ultralytics on ByteTrack and BoT-SORT: https://academy.ultralytics.com/courses/yolo-in-production/tracking-with-bytetrack-and-botsort
- Human3R: https://www.alphaxiv.org/resources/2510.06219
- ROMP, BEV, TRACE: https://www.github.com/Arthur151/ROMP
- BUDDI (Generative Proxemics, CVPR 2024): https://openaccess.thecvf.com/content/CVPR2024/html/Muller_Generative_Proxemics_A_Prior_for_3D_Social_Interaction_from_Images_CVPR_2024_paper.html
- PromptHMR: https://arxiv.org/html/2504.06397v2
- Close human interaction from one video: https://arxiv.org/pdf/2507.02565 and https://arxiv.org/html/2404.11291v1
- SAM 3 on Apple Silicon, conflicting reports: https://huggingface.co/facebook/sam3/discussions/11 and https://codersera.com/blog/how-to-run-sam-3-locally-2026/amp/

### Stage from several frames: Depth Anything 3 Base, first check (2026-10-11)

Weights `depth_anything_3_base.safetensors` (541.5 MB, Apache 2.0) in `.authoring/comfyui/models/geometry_estimation`; run headless through `LoadDA3Model(name,'fp32')` and `DA3Inference(..., 'multiview')`. Scratch only, nothing in the pipeline yet.

- The default dtype gives all-NaN output on MPS; `fp32` works.
- The returned intrinsics are at the model's working resolution (392×224 for a 1280×720 frame at 392), not the frame's. Scale them before unprojecting.
- 8 frames over 70.7–80.7 s at 392: usable. After applying each view's own focal length the depth-to-body-model scale is 11.5 with 7% spread over views, all eight floors lie on one plane with 17 cm rms, camera height 1.2–1.7 m (MoGe on one frame: 1.62 m), pitch 0.5–11° down. `cam_dec` and `ray_pose` agree to about 10%.
- 16 frames at 504: both pose methods return unusable cameras (zero or >130° fields of view, centres 1e5 units away). Cause not found; depth maps still look valid.
- Weak point: the per-view field of view swings from 23° to 78° on a shot that does not zoom that much, and the camera path (2.9 m) does not match the dancers' 4.9 m approach in the body model, which assumes one fixed lens. Depth divided by focal length is the reliable quantity; the split between zoom and dolly is not.

### Fixed stage with a tracked camera and lens, first version (2026-10-11)

Scripts (first version, run by hand, not behind an operation): `authoring/render/stage-depth.py` (Depth Anything 3 on a few frames, run with ComfyUI's Python) and `authoring/render/stage-track.py` (run from the repo root with the vision Python: `stage-track.py key.npz video.mp4 <start> out.json`). The output's `track` and `stage` go into the renderer payload; `pair-page.ts` then moves the source camera through a fixed room and changes its lens per frame.

What was learned on the samba clip (70.7–80.7 s):

- The clip is one shot with a strong zoom (lens 1390 px wide → 3030 px close → 800 px wide, on a 1280-wide picture) and a moving camera. The body model assumes one lens (1469 px), so the "4.9 m approach" of the dancers was mostly the zoom. Depth Anything 3's per-view lens agrees with the lens found independently from the stage points (789 against 795 px, 1612 against 1628 px), so those figures are real, not noise as first assumed.
- Method: 8 key views with depth, one scale for all (11.3, from the dancers' hips after correcting each view for its lens). SIFT points of the key views form a map; every video frame is placed against the map with its lens solved too. 186 of 241 frames have 80 or more map points and are placed outright. Two stretches are not (0.45–0.91 s and 7.63–9.55 s, fast zoom and blur): there the lens and the camera's turn are carried frame to frame from the background's motion and the end error (48% lens, 20° turn on the long one) is spread over the stretch. Those two stretches are the weak part; the stage visibly slides there.
- The floor from the five key views that join well is flat to 2.8 cm. Camera height over it 0.7–2.0 m.
- Dancers in a room: their depth is multiplied by lens/model lens, the camera stands where the track says, its height still comes from the dancers' own floor rule.
- Stage mesh: the first key view as a 10 px grid, the dancers' boxes filled row by row from the set either side, surface smoothed; other views only add what the first does not see. Views 4, 6 and 7 did not join well enough and are left out, so the set ends at the sides of the first view. The result is a soft backdrop with the floor, not a model of the set.
- Output: `.authoring/renders/pair-samba-r5-stage.mp4` (1280×720, 30 fps, 34 s to render); stills against the video in `.authoring/renders/stage-track-compare.jpg`.

Open: key views inside the two weak stretches (placed by depth, not by map points); joining the wide end view so the set has sides; a cleaner set (planes for floor, steps, back wall) if the soft backdrop is not enough for the AIGC reference; wiring into `render_pair_video`.

### Pair scene: floor, plain stage objects and a camera that turns and zooms (2026-10-11)

Asked for by the user: the stage as simple clay objects (no detail; an AIGC prompt describes them and a reference image replaces them), shown in Studio and in the video. This replaces the fused depth mesh above as the way to show the set.

- **Data** (`runtime/pair-scene.ts`): a pair may carry `scene = {objects, camera, performers}`. Objects are named boxes and cylinders in a room (x right, z toward the first camera, y up, floor at y=0). `camera` is the source camera per frame (turn, place, lens ratio). `performers` holds each side's first-frame hip and per-frame hip drop, copied from the builds.
- **Operation `set_pair_scene`** (50 operations) stores or removes it; `render_pair_video` draws it when present (`scene: false` leaves it out; file name ends `-scene`). Studio: a **Scene** button beside **Pair** stands both performers in the room with the objects; the room is shifted so the selected performer starts at the centre.
- **Objects are made by hand**, not measured. Depth Anything 3 flattens the set into a floor and one back surface (everything at 12–13.7 m), so it cannot give object shapes. `authoring/render/scene-samba.py` writes the 16 objects for the samba clip (three front steps, platform, bandstand drum, four stair blocks each side, two seating blocks, back wall), sized from the first frame's picture geometry and checked by rendering against five video stills.
- **Camera: turn and zoom only** (`stage-track.py --nodal --overlay=x0,y0,x1,y1`). With real objects at their own depths, the earlier track (solved against the flattened depth) made the set shrink and grow wrongly: it had traded zoom for camera travel. The new solve keeps the camera at one place and finds turn and lens for each frame against a reference frame (two-point RANSAC on directions, then a fit; the reference moves on when fewer than 40 points agree). No depth is used. All 241 frames solved, 13 reference changes, median 155 points, minimum 40. Lens 1424 → 3433 → 1035 px.
- Channel logos must be masked (`--overlay`): they sit still on the screen and otherwise win as "a camera that never moves". That had also been inflating the key-view joins before.
- The floor's tilt still comes from the five depth key views (pitch 5.1° at the start). From the first view alone it came out at -1.1°, from MoGe 3.2°: the tilt is uncertain by a few degrees, and it sets how high the set sits in the picture.
- Result: `.authoring/renders/pair-samba-r6-source-scene.mp4`; pair `pair-samba` is at revision 6 with the scene.

Limits: a real jib move is not represented (the camera is assumed to stay in one place); object sizes are a reading of the picture; the room's scale hangs on the dancers' body-model depth and the first view's lens (1391 px, from the depth model).

### Stage rebuilt from wide views elsewhere in the video; arch shape; camera tilt corrected (2026-10-11)

- The set is the same through the routine, so the objects were re-read from three wide views outside the clip (3.30 s, 28.43 s, 69.30 s; candidates in `.authoring/renders/stage-candidates/`). They show what the clip's own frames hide: the bandstand is a low oval wall with a thin roof on posts, stairs climb round both its sides to a rear gallery, and three arches of growing size stand behind it.
- New shape `arch` (half an oval ring, `rim` its band width). The samba scene now has 27 objects (`authoring/render/scene-samba.py`): three front steps, platform, bandstand wall, roof and four posts, five stair blocks each side, seating and balcony each side, rear gallery, three arches, back screen. Pair `pair-samba` r7; video `.authoring/renders/pair-samba-r7-source-scene.mp4`.
- **Camera tilt corrected.** The wide views fix the bandstand roof at about 2.4 m. Against the dancers' height that puts the clip's camera about 1.1 m over the floor looking 1° up, not 1.8 m looking 5° down as the previous section assumed. The floor read from the first depth view alone had said this (-1.1°, 0.99 m) and is now what `--nodal` uses. The earlier objects only matched the stills because they were too low and too near, which cancelled the wrong tilt. Bandstand centre is now 15.5 m from the camera (was 12.8 m).
- The wide views were read by eye; no camera was solved for them. The check is still the clip's own stills (`stage-candidates/scene-check.jpg`).

### Fixed-camera check: foot sliding (2026-10-11)

`render_pair_video` with `camera: fixed` on a pair with a scene now gives a still camera in the room holding both performers in full view; `feet: true` writes heel and ball positions per frame, and `authoring/render/foot-slide.py` sums how far the stillest floor-level point of each performer moves (a point is "planted" within 3 cm of its own lowest level).

Samba pair, 10 s:

| | left | right |
|---|---|---|
| Slide as first placed in the room | 10.1 m | 9.8 m |
| Of that, toward or away from the camera | 8.8 m | 9.1 m |
| With the pair's distance evened (now stored) | 8.1 m | 7.9 m |
| Distance held constant (best this can reach) | 7.4 m | 6.8 m |
| Old camera-space pair view, no scene | 12.4 m | 12.4 m |

- At large scale the placement holds: the dancers stay 5.0–7.3 m from the camera and 0.7–1.7 m apart, while the body model alone had them come from 7.6 m to 2.75 m (that was the zoom).
- The slide is mostly along the line to the camera: single-camera distance noise, about 4.6 cm rms per frame at the hips. Steady-camera seconds 2–4 slide 0.2–0.4 m per second; the zoom stretches 5–9 slide 1–2 m per second.
- **Distance evening** (`distanceScale` in the scene, computed by `set_pair_scene`): one factor per frame for both performers that takes the pair's mean distance to its average over about a second. One factor for both, so the gap between them and the hand holds are kept. Evening each performer separately would reach 7.0 m but moves them up to 10 cm against each other.
- The measure overstates sliding for a fast samba: feet brush and swivel at floor level on purpose, and with the distance held constant 7 m remains, part real travel (they run hand in hand in the last 3 s), part pose noise. It is a figure for comparing runs, not an absolute.
- Not done: locking a planted foot to the floor (contact detection and a root correction). That is the step that would remove sliding rather than reduce it.

Pair `pair-samba` r8. Videos `.authoring/renders/pair-samba-r8-fixed-scene.mp4` and `pair-samba-r8-source-scene.mp4`.

### Foot locking in the room (2026-10-11)

`set_pair_scene` now locks feet by default (`footLock: false` to skip, `footLockDrift` seconds, default 1.5). Code: `footLock`, `sharedLock`, `footSlide`, `standInRoom` in `runtime/pair-scene.ts`; the service follows each performer's heels, balls of the feet, hands and hips through the clip with the character rig, in the room.

- **Rule.** One support point at a time: a heel or ball within 3 cm of its own lowest level for at least 4 frames. While it stays down the performer is shifted over the floor so the point does not move; when support passes to another point, that one is held where it then is. The slow part of the shift (a 1.5 s average) is removed again so the performer does not wander from where the picture put them. Stored per frame as `performers[i].lock` and applied by the renderer and Studio through `standInRoom`.
- **Joined performers share the shift.** Locking each alone moved the two up to 36 cm against each other (median 11 cm), which would part held hands and could push bodies together. So while any hand of one is within 30 cm of a hand of the other, or their hips are within 0.9 m (fading out by 1.3 m), both take the mean of their two shifts. 110 of 301 frames are joined on the samba pair.
- **Samba pair, slide over 10 s** (left, right): placed in the room 10.1, 9.8 m → distance evened 8.1, 7.9 m → locked alone 4.4, 3.4 m → locked with the shared rule (stored) 5.6, 4.9 m. Largest shift of a performer 26 cm. In seconds 0–5 the slide is now 0.03–0.4 m per second; in seconds 5–10, where they hold hands, turn and run, 0.3–1.75 m per second.
- A longer drift window holds feet stiller and lets the performers wander further: 3 s gives 4.9, 4.4 m with shifts up to 37 cm.
- Limits: the lock moves the whole performer, it does not bend a leg, so of two joined dancers at most the mean is held; a foot brushing the floor on purpose counts as planted; the measure counts swivels and brushes as slide.

Pair `pair-samba` r15. Videos `.authoring/renders/pair-samba-r15-fixed-scene.mp4` and `pair-samba-r15-source-scene.mp4`.

### Reference package for a video model (2026-10-11)

Operation `export_pair_reference {pairId}` (51 operations) writes `.authoring/renders/<pair>-r<rev>-reference/`:

- `clay.mp4` — white-model video from the source camera with the scene.
- `depth.mp4` — the same frames as inverse distance from the camera (white near, black far; the near and far distances are in the meta; near is set at 0.6 of the nearest the performers come so they keep contrast).
- `first-frame-clay.png`, `first-frame-depth.png`.
- `reference.json` — the meta meant for a prompt-writer skill, in place of hand-written prompt text: files, depth encoding, conventions, the room's named objects with sizes and positions, a camera summary in 35 mm-equivalent focal lengths, the first frame on its own (framing, camera, each performer's box, distance, room position and which way they are turned, each object's box), a per-second timeline of the same, and the limits.

Renderer support: `pair-video.mjs --depth`, `--still`, `--describe`; `pair-page.ts` `setPass` (depth shader that follows the skinned figures) and `describe`.

Boxes are of whole shapes and do not allow for what stands in front of what. Samba pair: 40 mm at the start, 97 mm at 7 s, 29 mm at the end; first frame "full body with room around", both performers three-quarter turned toward picture left.

### Second scene: the fight pit at 1:39 (2026-10-11)

The `video-to-reference` steps run on `pair-kc-139` (99.77-103.6 s), as the first use of the skill on another clip.

- Camera: 8 depth key views, `stage-track.py --nodal`, no overlays in this shot. All 116 frames solved (1 reference change, median 79 points, minimum 43). Lens 1598 → 1770 px, pitch 14° down, height 2.33 m, floor flat to 1.8 cm.
- New shape `wedge` (a box cut corner to corner) for the sloped walls. `authoring/render/scene-pit.py` writes 10 objects: four walls, four ledges, spectator blocks behind two. The far corner and both wall directions come from casting first-frame picture points onto the floor through the tracked camera; the two walls came out 95° apart, taken as square. Wall height 1.3 m at about 41° from where the top corner sits in the picture. Assumed: the pit is 6.5 m square, ledge depth, the two near walls.
- Check against five video stills (`.authoring/renders/pair-kc-139-source-check.jpg`, made with the new `authoring/render/compare-stills.py`): floor edge, both walls and the corner sit where the video has them throughout.
- Foot locking: slide 1.55, 1.25 m → 0.64, 0.55 m over 3.8 s; largest shift 9 cm; 51 of 116 frames joined.
- The fixed camera lands outside the pit behind the right wall, which covers part of the floor: its placement does not know about walls.
- Package: `.authoring/renders/pair-kc-139-r6-reference/` (45 mm equivalent at the start, 50 mm from 1 s).

### Depth straight from the video: Video Depth Anything Small, first try (2026-10-11)

Question from the user: if the depth video is what the video model needs, can it come from the original video without building 3D. Research found it can (Video Depth Anything, DepthCrafter, FlashDepth), and that a published ComfyUI workflow ("Depth Dancer") feeds per-frame depth of a source clip plus one reference image to Seedance 2.0.

- Installed: code in `.authoring/video-depth-anything` (github.com/DepthAnything/Video-Depth-Anything, commit 4f5ae23, Apache-2.0) and `checkpoints/video_depth_anything_vits.pth` (116 MB, Small, Apache-2.0). Base and Large are CC-BY-NC-4.0 and were not fetched.
- Driver: `authoring/render/video-depth.py VIDEO START END OUT.mp4`. Runs in the vision venv with nothing installed: einops and tqdm are borrowed from ComfyUI's venv, easydict is stood in for, xformers is optional. Full precision on MPS.
- Samba window, 241 frames at 1280×720: valid output, **29 minutes** on this Mac's GPU. Depth of still pixels changes 0.3% of the range from frame to frame.
- Against the depth from our 3D scene (`.authoring/renders/direct-depth/samba-compare.mp4`, `.jpg`): the direct depth has the dancers exactly as filmed, with skirt, hair and true outlines, and a clean floor; the stage behind them is almost black, so the set barely registers. Ours shows the stage clearly and the dancers as plain figures in poses that are close but estimated.
- So the two carry different things: direct depth is the performers and the floor; the 3D scene is the layout, the camera, the meta, and the freedom to change the set. Not tried: either one in a generation; the Large model; a faster machine.

## A coarse build for clay references, timed on the samba pair (2026-10-12)

Clay references now use plain-shape figures, so the question was whether the video path can be quicker. Measured on the samba window (70.7–80.7 s, two dancers, this Mac):

| Step | Full build | Coarse build |
|---|---|---|
| Observe (2D boxes and pose), both dancers | 46 + 44 s | the same (was cached in this run) |
| Body model, both dancers | 466 + 462 s (every frame, with the second look) | 186 + 174 s (every third frame, no second look) |
| Contact, spacing and hand holds | not timed when it was built | 27 s |
| Scene (given objects and camera) with foot lock | 4 s | 4 s |
| Export, plain shapes, no depth | 33 s | 31 s |
| Total of the measured steps | about 18 min (taking 27 s for contact) | about 8.5 min |

- **`coarse: true` on `reconstruct_motion`** (source body only): `body.py --every 3` runs the model on every third observed frame, always with the last, and skips the second look; the smoothing window is shortened to match; the existing resampling to 30 Hz fills in between. The body stage is 2.6 times quicker, not 3: loading the model and the per-run overhead do not shrink.
- **How different the motion is** (`pair-samba-coarse` against `pair-samba` r15, heel and ball positions from the fixed-camera render, after removing the constant offset between the two builds): median 2.6 and 2.7 cm for the two dancers, 95th percentile 12.8 and 9.9 cm, worst 29 cm at 7.93 s and 22 cm at 6.97 s. Foot speed: mean 1.07 against 1.17 m/s and 1.06 against 1.12; peak 8.4 against 8.7 and 8.1 against 9.6. Foot slide after the lock: 5.41 and 4.87 m against 5.61 and 4.94. Part of the position difference is the contact stage, which the first comparison did not run on the coarse pair.
- **The contact stage is worth keeping.** Without it the coarse pair's hands missed each other in the hold at 7.9 s (seen in a still). With it (27 s) the same five hand-hold stretches are found as far as compared and the hands meet. So the saving is in the body model only; skipping contact would save half a minute and lose the holds.
- **Looked at**: three moments side by side (2.0, 5.0, 7.9 s) and the hold again after the contact stage: the poses agree to the eye at clay level. Side by side: `.authoring/renders/pair-samba-full-vs-coarse.mp4` (full left, coarse right). Coarse package: `.authoring/renders/pair-samba-coarse-r4-reference/`.
- Not measured: the camera track and the hand-made stage objects, which this option does not touch and which are the larger manual cost; a clip with faster motion than a samba (a kick's fastest frames fall between the ones looked at); `--every 2` or `4`; mini4, where the model runs about twice as fast.
- Side effects: `body.py` changed, so every body-stage cache key changed: the next rebuild of any clip runs the model again. `pair-samba-r15-reference` was exported again in this comparison and now holds plain-shape figures without depth (the mannequin-with-depth copy is on mini4).

## Does the source need the whole body in frame? A waist-up test (2026-10-12)

Every clip built so far showed full bodies. Test: the samba window re-framed as a waist-up shot (each frame cropped to a 16:9 window from above the heads to just below the hips, smoothed over time like a camera, scaled to 1280x720; a scratch file, not in the repo), built with `coarse: true` for both dancers and compared with the coarse build of the full view, which shows the same motion.

- **It builds.** Both dancers were found and built without refusal (the limit is a subject in at least 80% of frames). Observe 38 and 37 s, body 166 and 168 s.
- **Joint angles against the full-view build** (median / 90th percentile, degrees; left dancer, right dancer). For scale, the coarse build against the every-frame build of the same view gives trunk 0.5/1.2, head 1.1/3, upper arms 4/11–12, forearms 3/10–13, legs 1.3–2.1/4–7, pelvis 1.1/2.9.

| Part | Left | Right |
|---|---|---|
| Trunk | 1.5 / 3.4 | 1.2 / 3.0 |
| Neck and head | 3.1 / 6.1 | 2.7 / 5.3 |
| Upper arms | 6.1 / 17.8 | 5.5 / 16.0 |
| Forearms | 4.6 / 22.2 | 3.4 / 22.5 |
| Whole-body turn (pelvis) | 8.5 / 17.5 | 9.2 / 18.9 |
| Thighs | 19.2 / 30.7 | 13.8 / 21.9 |
| Shins | 9.8 / 25.1 | 7.6 / 21.8 |
| Feet | 18.5 / 32.4 | 12.8 / 28.6 |

- **Reading.** What the camera sees comes out close to the full-view build: trunk and head within a few degrees, arms a little worse than the build-to-build noise. What it does not see is invented: the legs are 14–19 degrees off at the median, and at 5 s, where both dancers lift a knee in the full view, the waist-up build has them standing on two feet (seen in stills from an orbit). The turn of the whole body is also less sure (about 9 degrees against 1).
- **For a clay reference from the source camera this is fine**: the clay shot is waist-up too, and stills at 1, 5 and 8 s match the re-framed picture in pose and framing. It is wrong for anything that shows the legs: another camera, a cut to a wide shot, a reusable action.
- Not tested: the stage and camera steps on a waist-up clip (`stage-track.py` and the floor's height and tilt read the floor, and foot locking reads the feet, none of which are in the picture); real close footage, which is sharper than this upscaled crop; a body cut higher (chest-up); a performer leaving the frame or hidden by the other for long. Test entries left in the live state: `waist-samba-left`, `waist-samba-right`, `pair-waist-samba`.

## A shot that is not from the front: the camera circling behind the dancers (2026-10-12)

Coarse is now the default build for a clay reference in the `video-to-reference` skill (a full build for fast motion, a visible miss, or a library action).

Test clip: the same samba video, 14.0–25.3 s, one continuous hand-held shot that starts behind and to the left of the dancers, passes close behind them at 19–20.5 s (bodies cut by the frame) and comes round to their side. Found on a contact sheet of the whole video; cuts located by colour change (14.01 and 25.32 s).

- **The whole shot (14.1–25.2 s) was refused**: the left dancer was found in 161 of 267 frames. She is lost from 20.9 s, when the man is between her and the camera, and is not picked up again.
- **14.1–20.8 s builds** (coarse; observe 30 and 31 s, body 116 and 115 s). `pair-behind-samba` r2, contact resolved with nothing inside and no hand holds found.
- **Seen from behind and from the side, the poses are right.** Stills from the source-camera render against the video at 15.0, 16.5 and 18.0 s: the man with his back to the camera in a lunge, his arm out, then turned toward the camera with both arms out; the woman facing the camera with her arms up. Facing and limbs agree in all three. The camera's angle to the performers is not a problem in itself.
- **The two swap at the close pass.** At about 19.7 s the dancers cross in the picture; the tracked "left" box jumps from x 775 to 518 between 19.6 and 19.85 s and from then on follows the woman, so the blue figure takes over her motion and the orange one his. Read from the boxes and from stills at 19.1, 19.7 and 20.4 s. Nothing reported it (`swappedFrames` is empty).
- **The room cannot be made for this shot.** The camera walks round the dancers; `stage-track.py --nodal` assumes a camera that stays in one place and only turns and zooms. Without a scene the source-camera render still frames the pair as the video did, because each performer is placed relative to the camera frame by frame, but the camera's own travel is then folded into their motion: seen from any other camera they swing over the floor, and there is no floor or set that stays put.
- What this means for the workflow: choose shots where the two stay apart in the picture and neither hides the other, and where the camera stays in one place; a shot from behind or the side is fine. Open: tracking identities through a crossing (the detector already stitches identities and keeps leg colours; it was not enough here), re-finding a performer after being hidden, and a camera that travels.
- Test entries left in the live state: `behind-samba-left`, `behind-samba-right`, `pair-behind-samba`.

## Identities through a crossing (2026-10-12)

The swap found in the shot from behind (`pair-behind-samba`, the two cross at about 19.7 s) is fixed in `observe.py`.

- **Why the old rule missed it.** It compared each box's leg colour with the median leg colour of each tracked identity, and wanted three frames in a row where the exchange fitted better by a clear margin. Here both dancers wear the same blue below the waist, and the tracker handed each identity to the other person for good, so each identity's median was a mix of the two.
- **The new rule.** Each performer's look is the colour of the trunk (shoulders to hips) and of the thighs, learned from the longest unbroken stretch in which the two boxes stay apart; inside such a stretch the tracker cannot have exchanged them, so it is taken as straight. Every frame with both boxes is then read as straight or exchanged, whichever fits the two looks better, and one path through the clip is chosen that pays for each change of mind (four times the distance between the two looks, about eight clear frames). Frames with one box take the reading of the nearest frame with two. If there are fewer than five frames apart, or the two looks differ by less than 40, the old rule is used. The report gives `identityEvidence` (frames learned from, how different the two looks are, the price) beside `swappedFrames`.
- **On the test shot**: the looks were learned from 63 frames (15.5–18.1 s), differ by 121, and the boxes are exchanged from 19.64 s to the end (29 frames). The tracked left box now runs on continuously (x 775 at 19.6 s, 1002 at 19.85 s) where it jumped to 518. Rebuilt (`pair-behind-samba` r4): stills at 18.0, 19.1, 19.7, 20.0, 20.4 and 20.7 s against the video show the woman (orange) on the left with her hands on her head and the man (blue) large on the right with his back to the camera, as filmed.
- **Nothing else changed**: rerun on the five earlier two-performer windows (kick, clinch, the 1:39 exchange, both samba windows; ten observations), every chosen box is the same as in the cached runs and no frame is exchanged.
- Limits: two performers dressed and coloured alike cannot be told apart this way; a clip in which the two are never apart for five frames falls back to the old rule; a performer hidden for long is still lost (the 14.1–25.2 s window is still refused), and a travelling camera still has no room. `observe.py` changed, so every observe and body cache key changed: any clip rebuilt from now on runs both again.

## A performer hidden and found again (2026-10-12)

The full shot from behind (14.1–25.2 s) was refused because the left subject was missing from 20.9 s to the end. What the tracker actually did (`trackedIdentities`, new in the pose report): identity 1 from the start to 20.85 s, identity 2 through the whole shot, and a new identity 23 from 21.43 s to the end, 91 frames at comparable size. The woman is behind the man for about half a second and comes back under a new number. The earlier stitching would attach such a piece only if its leg colour was nearer that performer's median than the other's; here both wear the same blue and the medians were of mixed people.

- **Order changed in `observe.py`.** First each performer's chain is made as long as it can be with no colour test: an identity of comparable size, seen for three frames or more, that only exists while one of the two is missing joins that one. Then who is in each chain at each moment is decided by the learned looks, as in the crossing rule, now over the joined chains. Left and right are still named by the first frames: if the looks were learned from a stretch after an exchange, the whole reading is turned round. If the looks cannot be learned or are too alike, the chains are taken apart again and the earlier rules run as before.
- **Why this also made the crossing rule safer.** On the 6.7-second window the exchange was found with little to spare: the 30 frames after the crossing are a close, blurred view from behind and favoured it by about 410 against a price of 484. One more frame on the longer window tipped it the other way. With the returning piece joined on, 91 clear frames from the side say the same thing, and the exchange is found from 19.64 s to the end (134 frames).
- **On the full shot**: the man (left) has a box in all but one of 267 frames; the woman (right) is missing in 18, of which 20.9–21.4 s is the stretch behind him, bridged by the body stage as before. Both built (coarse; observe 44 s each, body 179 and 169 s), `pair-behind-samba` r6, one hand hold found at the end. Stills against the video at 20.0, 20.7, 21.1, 21.5, 22.5, 23.5, 24.5 and 25.0 s: orange is hidden behind blue at 21.1 s as the woman is behind the man, comes out at 21.5 s, and the two face each other and join hands from the side view on, as filmed.
- **Nothing else changed**: the ten earlier observations (five windows) give the same chosen box in every frame.
- Limits: a performer missing from more than a fifth of the frames is still refused (not changed: no clip to test a longer absence on, and what is bridged is interpolation, not a reading); while hidden, the pose is a straight blend between the frames either side; two performers who look alike still cannot be told apart; a third person of comparable size who walks through while one performer is hidden would be joined to that performer's chain, and only the looks could then put it right.

## A camera that travels (2026-10-12)

The shot from behind (14.1–25.2 s) is a hand-held camera walking round the dancers. `stage-track.py --nodal` cannot make a room for it: it holds the camera in one place.

**Tried first and dropped: travel from the planted feet.** Idea: with the camera's turning taken from the background, whatever slow slide over the floor both performers' planted feet agree on is the camera's travel. Built as an option on `set_pair_scene` and tested on the 70.7–80.7 s samba window, where the camera does not travel: it reported a camera path of 4.31 m ending 1.7 m away, with the two performers' readings 0.71 m apart at the median. Dancers brush and swivel their feet, and the reading is a running sum, so its noise is of the size of the thing looked for. Removed again (the helper `plantShift` in `runtime/pair-scene.ts` stays; `footLock` uses it).

**What works: Depth Anything 3's own cameras on key views** (`authoring/render/stage-travel.py`). `stage-depth.py` already saves a camera per view; one run of 8 views takes 19 s here. The new script takes one or more runs (a later run shares two times with the first and is brought into its space through them), scales to metres from the performers (the body model's distance to each hip against the depth there), takes one lens for the shot, sets the floor where the ankles are with up as the mean of the cameras' up directions, and interpolates the camera between key views (a smooth curve through the places, the turn in equal steps) into the `{quats, positions, focal}` track that `set_pair_scene` takes.

On this shot, 14 key views (two runs, every 0.75 s):
- The two runs agree at their second shared view to 4.5 degrees and 0.05 depth units (about 0.2 m).
- Lens 867 px (26 mm equivalent) against the 1469 px the body model assumes; the first view of a run reads 1459 and is left out of the median. Metres per depth unit 4.29, spread 9%. Camera height 1.16–1.58 m. Ankle heights spread 0.11 m about the floor.
- The camera's path is 22.4 m in 11.1 s, a little over one full turn round the dancers at about 2.5–3 m.
- **Independent check, the line between the two dancers.** With the camera held still, the line from the left dancer to the right one turns through a net 415 degrees over the shot (they would be circling each other more than once). With the travelling track it stays between 131 and 205 degrees, net 36. The depth model knows nothing of the body model, so this is the two agreeing.
- Where each dancer is in the room by depth against by the scene's own placement (the body model through the same camera): 0.34 m apart at the median over the key views, 1.24 m at worst.
- Foot slide before the lock did not improve: 13.7 and 15.1 m against 15.0 and 11.1 m with the camera held still. Between key views the camera is interpolated and the hand-held detail is lost; after the lock 8.7 and 11.8 m. The feet are not held as well as with a still camera (about 5 m on the earlier samba window).
- Looked at: six moments, video above, clay from the travelling camera with eight marker posts standing in a ring (not from the video: there to show whether the room stays put), and a fixed view of the room. The clay frames as the video does and the posts pass behind; in the fixed view the two stay in the middle of the ring in the same formation throughout. `pair-behind-samba` r10.

Limits: 14 key views for a full turn, so anything quicker than about a second in the camera's own movement is smoothed away; one lens for the shot (a zoom during a travelling shot is not handled); the camera is taken as level on average; the depth model's cameras were usable at 8 views and 392 px and not at 16 and 504 (found earlier), and nothing tells a bad set of cameras from a good one except the checks above, which need reading; the stage objects still have to be made by hand, now in this track's room. The first view of each run gives a lens far from the others: not understood.

## Foot sliding with the travelling camera (2026-10-12)

On `pair-behind-samba` the feet slid 13.7 and 15.1 m before the lock and 8.7 and 11.8 m after it, against about 5 m after the lock on the still-camera samba window. What was tried:

- **More key views did not help.** Five runs of the depth model (32 key views, one every 0.35 s) drawn through exactly: the runs disagree with each other by a few degrees and a few tenths of a metre, the path zigzags (33.7 m against 22.4) and the slide before the lock rises to 18.3 and 24.9 m. A fit through them (`stage-travel.py --smooth=seconds`, a line in time over the key views either side, nearer ones counting more) at 0.5, 0.8, 1.2 and 1.8 s gives 12.4–15.4 and 14.9–20.1 m before the lock and 8.1–10.3 and 12.1–14.4 m after: no better than the 14 views. The option stays in the script; it is not a gain.
- **It is not the height.** The lowest foot point sits at 0.03 m with a spread of about 1 cm, as with the still camera.
- **Where the slide is.** Not only at the close pass: the first two seconds and 19–22 s are the worst. Only 16 and 14 plants are found in 11 s. Locking each dancer alone over longer and longer (`footLockDrift` 3, 6, 12 s) brings the slide down to 3.9 and 2.5 m but walks the two up to 1.3 m apart from each other, which is the formation gone.
- **What is kept: the slow slide the two share goes to the camera** (`footLockTogether` seconds on `set_pair_scene`, `togetherShift` in `runtime/pair-scene.ts`). The part of each dancer's plant shift between `footLockDrift` and that many seconds, averaged over the two, is added to the camera's place frame by frame. The dancers keep their places in the camera's picture, so the source-camera video is unchanged, and neither is moved against the other; the room shifts under them. With 6 s: 6.18 and 6.89 m after the lock (from 8.69 and 11.8), the camera moved by up to 0.90 m. With 3, 4 and 10 s: 7.1 and 9.5, 6.7 and 8.3, 5.75 and 6.05 m, the camera moved by up to 0.45, 0.65 and 1.16 m.
- **Checked from the renders** (`pair-behind-samba` r26, 6 s): the slide measured from the rendered feet is the same 6.18 and 6.89 m; the line between the two still keeps to a range of 104 degrees, net 36; each dancer's range over the floor shrinks from 1.5 x 2.1 and 2.8 x 2.9 m to 1.1 x 1.4 and 1.3 x 1.9 m; in the source-camera video the figures' centres are where they were (0.1 px at the median, 1.2 px at most, against the render before).
- This is the idea that failed as a way to find a camera's travel from nothing (it invents 4.3 m of travel on a camera that stands still); here it only adjusts a camera already placed by the depth model, within a band of a few seconds, by under a metre. On the still-camera samba window, with 6 s, it lowers the slide from 5.41 and 4.87 m to 4.36 and 4.57 m by moving a camera that does not move by up to 0.56 m: that is the size of what it can get wrong, so it stays off for a camera that stays in one place.
- Limits: the camera's 0.9 m of adjustment is of the size of the depth model's own uncertainty in its place, but it is taken from the feet, so a dance that really travels slowly across the floor with both dancers together would be read as the camera moving; objects in the room will sit up to that far from where the depth model would put them; still about 6–7 m of slide, more than the still-camera clip.

## The source camera in Studio (2026-10-12)

The user's remark: in the action workshop the source video sits beside a view from Orbit, Front, Side or Top, which looks nothing like it.

- **Action workshop** (`editor/main.tsx`): a fifth camera, **Source**, offered when the selected action is one side of a pair whose scene has a camera track (not a staged scene). It stands, turns and zooms as the video's camera did: place and turn from the scene's track, height from the performers as the clay render reads it, lens covering the video's 16:9 picture whatever the viewport's shape. Orbit dragging is off while it is on. `set_preview` takes `camera: "Source"`. For any other action it falls back to Orbit.
- **Clay reference page**: it already drew a video pair through its scene's camera, travelling track included, since it shares the export's view. One fault found on the way and fixed: while the page measured framing after loading, the canvas could be left showing one of the measured moments instead of the current time.
- Checked in a headless Chrome on `pair-behind-samba` at 3.9 s (18.0 s of the video): the workshop's Source view, the Clay page and the video frame show the same framing, the man left with his arms out and the woman right; the Front view of the same moment shows the two one behind the other, as the user described.
- Not built: the Source camera for a staged scene's shots in the workshop (the Clay page plays those), or for a pair with no scene.

## Which parts of the samba video are hardest, and a try at the worst (2026-10-12)

A scan of the whole video four times a second with the pose detector (who is found, how much the two largest boxes overlap, joints and legs seen with confidence, whether a box touches the frame's edge, sharpness inside the boxes), summed per shot, and stills of the worst shots. Hardest by that: the spinning hold at 39.1–43.7 s (two found in 61% of frames, boxes overlapping by more than 0.3 in 36%, the least sharp shot); the dip behind the band at about 8.5–11.5 s (the opening shot finds two in 69% of frames; she is bent back under him, chairs and music stands hide the legs); the view over the audience's heads at about 57–59.8 s (legs seen in a third of frames, about four large people per frame). The windows built before are among the easiest (68.1–82.6 s: no overlap, 87% of joints seen).

**The spinning hold, 39.15–43.65 s, coarse build.** The right dancer built (observe 23 s, body 81 s); the left was refused, found in 73 of 109 frames. It fails at the tracking, before the body model:

- The tracker breaks the two dancers into six identities: 1 (39.1–41.8 s), 2 (39.1–40.9), 7 (five frames at 40.3–40.5, one box round both of them, twice the size), 12 (41.2–43.6), 27 (42.9–43.6) and a small one.
- **The two performers are picked as the two identities with the most box area over the window: 1 and 12.** They do not overlap in time much and may be the same dancer; identity 12 first appears two seconds in, so "left" and "right" are named by where two boxes were at different moments. Identity 2 is then joined to one and 27 to the other.
- The looks cannot be learned: the two are never five frames apart in this window (`identityEvidence` is empty), so the fallback rules ran.
- The left chain has no box from 41.88 to 42.92 s, when one box covers both dancers.
- What the right dancer's action is worth could not be judged: eight stills of it in the workshop show one figure turning with its arms up, but it is assembled from identities 2 and 12, and which dancer each of those is was not established.

What would have to change, in order: pick the two performers from the frames where two are seen at the start, not by area over the window; learn the looks from a neighbouring shot of the same dancers when this window has no stretch apart; treat a box round both dancers as both being present, not as one missing; and only then find out what the body model does with two bodies wrapped round each other, which this try never reached. Test entry left in the live state: `spin-samba-right`.

## The spinning hold builds (2026-10-12)

The three things that stopped the 39.15–43.65 s window at the tracking were changed in `observe.py`, and one in `body.py`:

1. **The two performers are the two who are there at the start**: the first frame with two identities of comparable size that both go on (each in three of the next six frames, each seen five frames or more, neither under 15% of the largest total area). Before, they were the two identities with the most area over the window, which here were pieces of the dancers from different halves of the shot. If no such frame exists the old choice stands.
2. **Looks from another shot** (`looksFrom: [start, end]` on `reconstruct_motion`, `--looks` on `observe.py`). In a hold the two are never clear of each other, and what is sampled of each is partly the other: this window's own looks differ by 39, under the 40 needed, even when learned from a stretch where the boxes only touch (that looser stretch, boxes overlapping by under 0.15, is now used when there is none of five frames under 0.05). The shot just before (36.2–39.0 s) gives looks 96 apart. They are taken from its pose report, and which of them is this window's left is settled on this window's own clearest frames. The report says so (`looksBorrowed`).
3. **One box round both is a performer hidden, not missing.** A stretch in which a performer has no box while the other has one, and which begins and ends with the two in contact, is marked `hiddenByOther`; the body stage no longer holds those frames against the window, as long as the performer has a box in at least half of all frames (`body.py`). A box much larger than either performer's (over 1.75 times) is not joined to a performer's chain as if it were them.

On this window: the pair is identities 1 and 2; identity 12 joins the right dancer and 27 the left; the left dancer has a box in 73 of 109 frames with 34 of the other 36 hidden by the other (the longest 41.88–42.92 s), the right in 93 with 14 of 16 hidden. Both build (coarse; observe 23 s each plus 19 s for the other shot, body 68 and 78 s). `pair-spin-samba` r2: four hand-hold stretches found; 26 frames with a limb inside the other body before the contact rule, 13 cm at worst.

**What the body model made of it.** Eight moments, clay from the source camera under the video: who is in front agrees in all eight (the woman in front at the start, the man in front with his back to the camera at 41.15 s, the woman in front again from 41.75 s), as do the raised arm at 39.95 s and both dancers' arms out at the end. So at clay level the wrapped bodies were not the wall expected. Not established: the limbs inside the hold, which nothing here can check; and for the second the left dancer is hidden, his pose is a blend between the frames either side, not a reading.

The six earlier two-performer windows (twelve observations, the travelling-camera shot among them) give the same chosen boxes as before. `observe.py` and `body.py` changed, so their cache keys changed again.

## A second demo clip with a travelling camera: 89.7–93.25 s (2026-10-13)

Chosen from the scan of the whole video as the cleanest unused shot in which the camera travels (both dancers found in every scanned frame, no heavy overlap, a body cut by the frame in 6%). They start in a hold, open out side by side with their arms out and step forward; the camera zooms out over the first second and then travels round to the side.

- **Build** (coarse): observe 22 and 20 s, body 75 and 73 s; a box in every one of 85 frames for both, no exchange, looks 97 apart learned from 13 frames with the boxes touching. `pair-samba-arc`: five hand-hold stretches; limbs inside the other body in 28 frames before the contact rule, 3 after (3.3 cm).
- **Camera.** `stage-travel.py` gained `--zoom`: each key view's own lens (evened over three neighbours) instead of one for the shot. Here the lens runs 2174, 2087, 1904, 1652 px over the first second and then holds near 1400. With it the left dancer sits at about x -0.6, z -4.0 in the room at every key view; metres per depth unit spread 13%.
- **One run of key views is better than two interleaved.** With 14 views from two runs (one every 0.25 s) the feet slid 6.4 and 7.1 m before the lock; with the first run's 8 views alone 3.2 and 3.9 m; smoothing the 14 (0.5 or 0.8 s) gave 3.5–4.0 m. The runs disagree with each other by more than the camera moves in a quarter of a second, so drawing the camera through both makes it zigzag. This corrects what the skill said (two interleaved runs); on the 11-second shot the two runs were 0.75 s apart and the harm was not seen. For a long shot, runs end to end sharing two views should be better than interleaved ones: not tried.
- **Result** (`pair-samba-arc` r10, 8 key views, `footLockTogether` 3): slide 2.65 and 2.69 m after the lock, the camera moved by up to 0.13 m; each dancer's range over the floor 0.4 x 0.4 and 0.4 x 0.8 m. With the camera held still the slide is about the same (2.8 and 2.2 m after the lock) but the dancers travel 2.3 m in depth over the floor, which they do not in the video.
- **Looked at**: eight moments, video above clay from the solved camera: the hold, the woman's arm going up and the man's lifted knee at 91.8 s, both with arms out, and the framing through the zoom agree. In a fixed view the two stay in one place in front of the seating.
- **Stage**: four plain boxes for the seating round the floor, placed by eye from the picture; not measured.
- Package: `.authoring/renders/pair-samba-arc-r10-reference/` (107 frames, plain-shape figures, exported in 12 s).

Also fixed on the way: **archiving an entry no longer breaks its pair.** `archive_entry` raised the revision and left the pair, the build record and the source-video link pointing at the old one, so an archived and restored action could not be shown in its pair or paired again without rebuilding. Those links are now carried to the new revision, and bringing an entry back also carries what pointed at it before it was archived. `behind-samba-left` and `-right`, archived at the user's request the day before, were restored this way: `pair-behind-samba` r26 is current again with its scene.

## A third demo clip: side by side, 59.9–66.6 s (2026-10-13)

The alternative from the same search: the two dance side by side facing the camera, the longest clean shot. It was ranked second because the dancers are cut at the knee for the first three seconds and because the camera zooms out while it moves; `--zoom`, added for the clip before, deals with the second.

- **Build** (coarse): observe 31 and 34 s, body 121 and 124 s; the left dancer has a box in all 162 frames, the right in 156 with the other 6 marked hidden; no exchange; looks 152 apart learned from 99 frames. `pair-samba-side`: no hand holds and no limb inside the other body.
- **Camera** (one run of 8 key views, `--zoom`): the lens runs 1863, 1546, 1272, 1137 px and then holds near 1100; the camera moves 3.7 m, about 3 m to the left, turning 32 degrees, at 1.0–1.1 m high. Metres per depth unit spread 7.6% with `--zoom`, 20% without.
- **Result** (`pair-samba-side` r5, `footLockTogether` 3): slide 3.13 and 2.35 m after the lock over 6.7 s, the camera moved by up to 0.08 m. With the camera held still 4.35 and 2.08 m.
- **Looked at**: eight moments, video above clay from the solved camera: hands up by the head, the wide stance with arms out, the man turned side-on at 63.7 s, both with arms straight up at 64.6 s, the two coming together at the end; the framing through the zoom agrees. In a fixed view they stay in front of the bandstand.
- **Not checkable**: the legs in the first three seconds, where the picture cuts them at the knee; the clay from the source camera cuts them there too, so it does not show.
- **Stage**: four plain boxes (a bandstand platform and back wall, seating either side), placed by eye.
- Package: `.authoring/renders/pair-samba-side-r5-reference/` (202 frames, exported in 19 s).
