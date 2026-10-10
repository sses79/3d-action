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
